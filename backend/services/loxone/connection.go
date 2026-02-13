package loxone

import (
	"crypto/tls"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"math/rand"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gorilla/websocket"
)

// LoxoneCollectorInterface defines the interface for the collector
type LoxoneCollectorInterface interface {
	GetLiveChargerData(chargerID int) (*ChargerLiveData, bool)
	GetActiveSession(chargerID int) (*ActiveChargerSession, bool)
	// Add methods to access collector data
	UpdateLiveChargerData(chargerID int, data *ChargerLiveData)
	UpdateActiveSession(chargerID int, session *ActiveChargerSession)
	GetActiveSessions() map[int]*ActiveChargerSession
	GetProcessedSessions() map[string]bool
	SetActiveSession(chargerID int, session *ActiveChargerSession)
	DeleteActiveSession(chargerID int)
	MarkSessionProcessed(sessionID string)
	LogToDatabase(action, details string)
	SaveActiveSessionToDatabase(session *ActiveChargerSession) error
}

// NewWebSocketConnection creates a new WebSocket connection
func NewWebSocketConnection(host, username, password, macAddress string, isRemote bool, db *sql.DB, collector LoxoneCollectorInterface) *WebSocketConnection {
    conn := &WebSocketConnection{
		Host:                host,
		Username:            username,
		Password:            password,
		MacAddress:          macAddress,
		IsRemote:            isRemote,
		Devices:             []*Device{},
		StopChan:            make(chan bool),
		Db:                  db,
		IsShuttingDown:      false,
		ReconnectAttempt:    0,
		Collector:           collector,
		MeterReadingBuffers: make(map[int]*MeterReadingBuffer),
	}

	// Different backoff strategy for remote vs local
	if isRemote {
		conn.ReconnectBackoff = 10 * time.Second // Remote: start slower
		conn.MaxBackoff = 300 * time.Second      // Remote: max 5 minutes
	} else {
		conn.ReconnectBackoff = 1 * time.Second // Local: fast reconnect
		conn.MaxBackoff = 15 * time.Second      // Local: max 15 seconds
	}

	// DNS cache for remote connections
	if isRemote {
		conn.DnsCache = &DNSCache{
			macAddress: macAddress,
			cacheTTL:   2 * time.Minute,
		}
	}

	return conn
}

// Connect initiates the connection with backoff
func (conn *WebSocketConnection) Connect(db *sql.DB, collector LoxoneCollectorInterface) {
	conn.ConnectWithBackoff(db, collector)
}

// ConnectWithBackoff attempts to connect with exponential backoff and jitter.
// It retries in rounds of 10 attempts each. After each round, it waits with
// increasing cooldown (1min, 2min, 5min, 10min, capped at 10min) before the
// next round. This continues indefinitely until connected or shutdown.
func (conn *WebSocketConnection) ConnectWithBackoff(db *sql.DB, collector LoxoneCollectorInterface) {
	conn.Mu.Lock()

	// Don't reconnect if shutting down
	if conn.IsShuttingDown {
		conn.Mu.Unlock()
		log.Printf("[INFO] [%s] Skipping reconnect - connection is shutting down", conn.Host)
		return
	}

	// Prevent multiple simultaneous reconnection attempts
	if conn.IsReconnecting {
		conn.Mu.Unlock()
		log.Printf("[INFO] [%s] Reconnection already in progress, skipping", conn.Host)
		return
	}

	if conn.IsConnected {
		conn.Mu.Unlock()
		log.Printf("[INFO] [%s] Already connected, skipping", conn.Host)
		return
	}

	conn.IsReconnecting = true
	conn.Mu.Unlock()

	defer func() {
		conn.Mu.Lock()
		conn.IsReconnecting = false
		conn.Mu.Unlock()
	}()

	// Stop any existing goroutines first
	conn.Mu.Lock()
	if conn.StopChan != nil {
		select {
		case <-conn.StopChan:
			// Already closed
		default:
			close(conn.StopChan)
		}
	}
	conn.StopChan = make(chan bool)
	conn.Mu.Unlock()

	// Wait for existing goroutines to finish
	conn.GoroutinesWg.Wait()

	// Retry indefinitely in rounds of 10 attempts each
	// After each failed round, wait with increasing cooldown before next round
	attemptsPerRound := 10
	roundCooldowns := []time.Duration{
		1 * time.Minute,
		2 * time.Minute,
		5 * time.Minute,
		10 * time.Minute, // max cooldown, stays at this
	}

	for round := 0; ; round++ {
		// Check shutdown before each round
		conn.Mu.Lock()
		if conn.IsShuttingDown {
			conn.Mu.Unlock()
			log.Printf("[INFO] [%s] Stopping reconnection - shutting down", conn.Host)
			return
		}
		conn.Mu.Unlock()

		// Wait between rounds (not before the first round)
		if round > 0 {
			cooldownIdx := round - 1
			if cooldownIdx >= len(roundCooldowns) {
				cooldownIdx = len(roundCooldowns) - 1
			}
			cooldown := roundCooldowns[cooldownIdx]

			log.Printf("[RETRY] [%s] Round %d failed, waiting %v before next round...",
				conn.Host, round, cooldown)

			// Only log to DB once per round (not per attempt) to reduce spam
			conn.logToDatabase("Loxone Connection Exhausted",
				fmt.Sprintf("Host '%s': Round %d (%d attempts) failed, next retry in %v",
					conn.Host, round, attemptsPerRound, cooldown))

			// Sleep with shutdown check
			timer := time.NewTimer(cooldown)
			select {
			case <-timer.C:
				// Continue to next round
			case <-conn.StopChan:
				timer.Stop()
				log.Printf("[INFO] [%s] Reconnection cancelled during cooldown", conn.Host)
				return
			}
		}

		// Inner retry loop: 10 attempts with backoff
		for attempt := 1; attempt <= attemptsPerRound; attempt++ {
			// Check if we should stop
			conn.Mu.Lock()
			if conn.IsShuttingDown {
				conn.Mu.Unlock()
				log.Printf("[INFO] [%s] Stopping reconnection attempts - shutting down", conn.Host)
				return
			}

			if conn.IsConnected {
				conn.Mu.Unlock()
				log.Printf("[INFO] [%s] Already connected, stopping retry loop", conn.Host)
				return
			}
			conn.Mu.Unlock()

			// Apply backoff with jitter (except on first attempt of first round)
			if round > 0 || attempt > 1 {
				conn.Mu.Lock()
				backoff := conn.ReconnectBackoff
				conn.Mu.Unlock()

				jitter := time.Duration(rand.Float64() * float64(backoff) * 0.3)
				backoffWithJitter := backoff + jitter
				log.Printf("[WAIT] [%s] Waiting %.1fs before attempt %d/%d (round %d)...",
					conn.Host, backoffWithJitter.Seconds(), attempt, attemptsPerRound, round+1)
				time.Sleep(backoffWithJitter)
			}

			log.Println("------------------------------------------------------------")
			log.Printf("| CONNECTING: %s (attempt %d/%d, round %d)", conn.Host, attempt, attemptsPerRound, round+1)
			log.Println("------------------------------------------------------------")

			// CRITICAL FIX: Check if this is a remote connection and ALWAYS re-resolve DNS
			var wsURL string
			conn.Mu.Lock()
			isRemote := conn.IsRemote
			conn.Mu.Unlock()

			if isRemote {
				log.Printf("Step 1a: Re-resolving Loxone Cloud DNS address (ALWAYS on reconnect)")

				actualHost, err := conn.resolveLoxoneCloudDNS()
				if err != nil {
					log.Printf("[ERROR] Failed to resolve cloud DNS: %v", err)
					conn.Mu.Lock()
					conn.IsConnected = false
					conn.LastError = fmt.Sprintf("Failed to resolve cloud DNS: %v", err)
					conn.ConsecutiveConnFails++
					if conn.ReconnectBackoff < 2*time.Second {
						conn.ReconnectBackoff = 2 * time.Second
					} else {
						conn.ReconnectBackoff = time.Duration(math.Min(
							float64(conn.ReconnectBackoff*2),
							float64(conn.MaxBackoff),
						))
					}
					conn.Mu.Unlock()
					continue
				}

				wsURL = fmt.Sprintf("wss://%s/ws/rfc6455", actualHost)
				log.Printf("   [OK] Using resolved host: %s", actualHost)
			} else {
				conn.Mu.Lock()
				wsURL = fmt.Sprintf("ws://%s/ws/rfc6455", conn.Host)
				conn.Mu.Unlock()
			}

			log.Printf("Step 1: Establishing WebSocket connection")
			log.Printf("   URL: %s", wsURL)

			dialer := websocket.Dialer{
				HandshakeTimeout: 15 * time.Second,
			}

			// For remote connections, configure TLS
			if isRemote {
				conn.Mu.Lock()
				useTLS := conn.UseTLSVerification
				conn.Mu.Unlock()

				if useTLS {
					// Proper TLS verification via CloudDNS dyndns hostname
					dialer.TLSClientConfig = &tls.Config{
						MinVersion: tls.VersionTLS12,
					}
					log.Printf("   Using proper TLS verification (CloudDNS hostname)")
				} else {
					// Legacy fallback: raw IP does not match certificate
					dialer.TLSClientConfig = &tls.Config{
						InsecureSkipVerify: true,
					}
					log.Printf("   Using InsecureSkipVerify (legacy MAC-based resolution)")
				}
			}

			ws, _, err := dialer.Dial(wsURL, nil)
			if err != nil {
				errorType := ClassifyError(err)

				// Check if this is expected during port change
				if conn.isExpectedDuringPortChange(err) {
					errMsg := fmt.Sprintf("Reconnecting after port change: %v", err)
					log.Printf("[INFO] [%s] %s (attempt %d/%d)", conn.Host, errMsg, attempt, attemptsPerRound)

					conn.Mu.Lock()
					conn.PortChangeInProgress = true
					conn.LastError = "Port change in progress"
					conn.Mu.Unlock()

					if attempt == 1 && round == 0 {
						conn.logToDatabase("Loxone Port Change",
							fmt.Sprintf("Host '%s': Port rotation detected, reconnecting", conn.Host))
					}
				} else {
					errMsg := fmt.Sprintf("Connection failed: %v", err)
					log.Printf("[ERROR] [%s] %s", conn.Host, errMsg)

					conn.Mu.Lock()
					conn.IsConnected = false
					conn.LastError = errMsg
					conn.LastErrorType = errorType
					conn.ConsecutiveConnFails++
					conn.PortChangeInProgress = false
					conn.Mu.Unlock()

					conn.updateDeviceStatus(db, fmt.Sprintf("[ERROR] Connection failed (round %d, attempt %d): %v", round+1, attempt, err))
					// Only log first and last attempt per round to DB to reduce spam
					if attempt == 1 || attempt == attemptsPerRound {
						conn.logToDatabase("Loxone Connection Failed",
							fmt.Sprintf("Host '%s': %v (round %d, attempt %d/%d, type: %d)",
								conn.Host, err, round+1, attempt, attemptsPerRound, errorType))
					}
				}

				continue
			}

			// Connection successful, proceed with authentication
			if conn.performConnection(ws, db, collector) {
				conn.Mu.Lock()
				wasPortChange := conn.PortChangeInProgress
				conn.PortChangeInProgress = false
				deviceCount := len(conn.Devices)
				conn.Mu.Unlock()

				if wasPortChange {
					log.Println("[OK] Port change completed successfully")
					conn.logToDatabase("Loxone Port Change Complete",
						fmt.Sprintf("Host '%s' reconnected after port rotation (lifetime reconnects: %d)",
							conn.Host, conn.TotalReconnects))
				} else {
					log.Println("[OK] CONNECTION ESTABLISHED!")
					conn.logToDatabase("Loxone Connected",
						fmt.Sprintf("Host '%s' connected with %d devices (lifetime reconnects: %d, rounds: %d)",
							conn.Host, deviceCount, conn.TotalReconnects, round+1))
				}

				return
			}
		}

		// End of round - increase backoff for next round's inner attempts
		conn.Mu.Lock()
		conn.ReconnectBackoff = conn.MaxBackoff
		conn.Mu.Unlock()
	}
}

// performConnection handles the connection setup after websocket is established
func (conn *WebSocketConnection) performConnection(ws *websocket.Conn, db *sql.DB, collector LoxoneCollectorInterface) bool {
	// Set up WebSocket-level pong handler for dead connection detection
	ws.SetPongHandler(func(appData string) error {
		conn.Mu.Lock()
		conn.LastPongReceived = time.Now()
		conn.Mu.Unlock()
		return nil
	})

	conn.Mu.Lock()
	conn.Ws = ws
	conn.ConsecutiveConnFails = 0
	conn.LastConnectionTime = time.Now()
	conn.LastPongReceived = time.Now() // Initialize to now
	conn.Mu.Unlock()

	log.Printf("[OK] WebSocket connected successfully")
	log.Printf("Step 2: Starting token-based authentication")

	if err := conn.authenticateWithToken(); err != nil {
		errMsg := fmt.Sprintf("Authentication failed: %v", err)
		log.Printf("[ERROR] %s", errMsg)
		ws.Close()

		conn.Mu.Lock()
		conn.Ws = nil
		conn.IsConnected = false
		conn.TokenValid = false
		conn.LastError = errMsg
		conn.ConsecutiveAuthFails++
		conn.TotalAuthFailures++

		conn.ReconnectBackoff = time.Duration(math.Min(
			float64(conn.ReconnectBackoff*2),
			float64(conn.MaxBackoff),
		))
		conn.Mu.Unlock()

		conn.updateDeviceStatus(db, fmt.Sprintf("[ERROR] Auth failed: %v", err))
		conn.logToDatabase("Loxone Auth Failed",
			fmt.Sprintf("Host '%s': %v (failures: %d)", conn.Host, err, conn.ConsecutiveAuthFails))
		return false
	}

	conn.Mu.Lock()
	conn.IsConnected = true
	conn.TokenValid = true
	conn.LastError = ""
	conn.ConsecutiveAuthFails = 0
	conn.ReconnectBackoff = 2 * time.Second
	conn.TotalReconnects++
	conn.LastSuccessfulAuth = time.Now()
	deviceCount := len(conn.Devices)
	conn.Mu.Unlock()

	log.Println("------------------------------------------------------------")
	log.Printf("| [OK] CONNECTION ESTABLISHED!                             |")
	log.Printf("| Host: %-49s|", conn.Host)
	log.Printf("| Devices: %-46d|", deviceCount)
	log.Println("------------------------------------------------------------")

	conn.updateDeviceStatus(db, fmt.Sprintf("[OK] Connected at %s", time.Now().Format("2006-01-02 15:04:05")))
	conn.logToDatabase("Loxone Connected",
		fmt.Sprintf("Host '%s' connected with %d devices (lifetime reconnects: %d)",
			conn.Host, deviceCount, conn.TotalReconnects))

	log.Printf("[START] Starting data listener for %s...", conn.Host)
	conn.GoroutinesWg.Add(1)
	go conn.readLoop(db, collector)

	log.Printf("[START] Starting data request scheduler for %s...", conn.Host)
	conn.GoroutinesWg.Add(1)
	go conn.requestData()

	log.Printf("[START] Starting live power polling for %s...", conn.Host)
	conn.GoroutinesWg.Add(1)
	go conn.requestLivePower()

	log.Printf("[START] Starting token expiry monitor for %s...", conn.Host)
	conn.GoroutinesWg.Add(1)
	go conn.monitorTokenExpiry(db)

	log.Printf("[START] Starting keepalive for %s...", conn.Host)
	conn.GoroutinesWg.Add(1)
	go conn.keepalive()

	// WebSocket ping monitor runs for ALL connections (local and remote)
	// to detect dead connections faster than the 20-minute read deadline
	log.Printf("[START] Starting WebSocket ping monitor for %s...", conn.Host)
	conn.GoroutinesWg.Add(1)
	go conn.monitorWebSocketPing()

	if conn.IsRemote {
		log.Printf("[START] Starting DNS change monitor for %s...", conn.Host)
		conn.GoroutinesWg.Add(1)
		go conn.monitorDNSChanges()
	}

	return true
}

// Close gracefully closes the connection
func (conn *WebSocketConnection) Close() {
	log.Printf("[CLOSE] Closing connection for %s", conn.Host)
	conn.Mu.Lock()

	// Set shutdown flag to prevent automatic reconnection
	conn.IsShuttingDown = true

	// Close stop channel first to signal all goroutines
	if conn.StopChan != nil {
		select {
		case <-conn.StopChan:
			// Already closed
		default:
			close(conn.StopChan)
		}
	}

	if conn.Ws != nil {
		conn.Ws.Close()
		conn.Ws = nil
	}
	conn.IsConnected = false
	conn.TokenValid = false
	conn.Mu.Unlock()

	// Wait for all goroutines to finish
	log.Printf("  [WAIT] Waiting for goroutines to finish...")
	conn.GoroutinesWg.Wait()
	log.Printf("  [OK] Connection closed")

	conn.logToDatabase("Loxone Connection Closed",
		fmt.Sprintf("Host '%s' connection closed", conn.Host))
}

// resolveLoxoneCloudDNS resolves the Loxone Cloud DNS and returns the actual server address.
// It tries the serial-number-based CloudDNS API first (proper TLS with dyndns hostname),
// then falls back to the legacy MAC-based redirect approach (requires InsecureSkipVerify).
func (conn *WebSocketConnection) resolveLoxoneCloudDNS() (string, error) {
	if !conn.IsRemote {
		return conn.Host, nil
	}

	// Strategy 1: Try serial-number-based CloudDNS (proper TLS with dyndns hostname)
	if conn.MacAddress != "" {
		log.Printf("[DNS] [%s] Resolving via CloudDNS serial number API (TLS-safe)", conn.MacAddress)
		host, err := conn.resolveCloudDNSWithSerial()
		if err == nil {
			conn.Mu.Lock()
			conn.UseTLSVerification = true
			oldHost := conn.ResolvedHost
			conn.ResolvedHost = host
			conn.Mu.Unlock()

			if oldHost != "" && oldHost != host {
				log.Printf("   [CHANGED] HOST CHANGED: %s -> %s", oldHost, host)
				conn.logToDatabase("Loxone Cloud Host Changed",
					fmt.Sprintf("SNR %s: Host changed from %s to %s", conn.MacAddress, oldHost, host))
			}
			return host, nil
		}
		log.Printf("   [WARN] Serial-based resolution failed: %v, falling back to legacy MAC approach", err)
	}

	// Strategy 2: Fall back to legacy MAC-based redirect approach
	log.Printf("[DNS] [%s] Resolving via legacy MAC redirect (InsecureSkipVerify)", conn.MacAddress)
	host, err := conn.resolveLoxoneCloudDNSLegacy()
	if err != nil {
		return "", err
	}

	conn.Mu.Lock()
	conn.UseTLSVerification = false
	conn.Mu.Unlock()

	return host, nil
}

// resolveCloudDNSWithSerial uses the Loxone CloudDNS API with serial number to get a
// proper TLS-compatible hostname (e.g., 200-12-14-24.{snr}.dyndns.loxonecloud.com:4523)
func (conn *WebSocketConnection) resolveCloudDNSWithSerial() (string, error) {
	if conn.MacAddress == "" {
		return "", fmt.Errorf("no serial number (MAC address) configured")
	}

	apiURL := fmt.Sprintf("https://dns.loxonecloud.com/?getip&snr=%s&json=true", conn.MacAddress)
	log.Printf("   Resolving via: %s", apiURL)

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Get(apiURL)
	if err != nil {
		return "", fmt.Errorf("CloudDNS API request failed: %v", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read CloudDNS response: %v", err)
	}

	var dnsResp CloudDNSResponse
	if err := json.Unmarshal(body, &dnsResp); err != nil {
		return "", fmt.Errorf("failed to parse CloudDNS response: %v (body: %s)", err, string(body[:min(len(body), 200)]))
	}

	if dnsResp.IPHTTPS == "" {
		return "", fmt.Errorf("empty IPHTTPS in CloudDNS response")
	}

	log.Printf("   [OK] CloudDNS IPHTTPS: %s", dnsResp.IPHTTPS)

	// Parse IP and port from IPHTTPS
	ip, port, err := parseIPHTTPS(dnsResp.IPHTTPS)
	if err != nil {
		return "", fmt.Errorf("failed to parse IPHTTPS '%s': %v", dnsResp.IPHTTPS, err)
	}

	// Construct proper hostname for TLS
	cleanedIP := cleanIPForHostname(ip)
	hostname := fmt.Sprintf("%s.%s.dyndns.loxonecloud.com:%s", cleanedIP, conn.MacAddress, port)

	log.Printf("   [OK] Constructed TLS hostname: %s", hostname)
	return hostname, nil
}

// parseIPHTTPS splits the IPHTTPS value (e.g., "200.12.14.24:4523") into IP and port
func parseIPHTTPS(iphttps string) (ip string, port string, err error) {
	iphttps = strings.TrimSpace(iphttps)

	// Handle IPv6 with brackets: [::1]:port
	if strings.HasPrefix(iphttps, "[") {
		closeBracket := strings.LastIndex(iphttps, "]")
		if closeBracket == -1 {
			return "", "", fmt.Errorf("malformed IPv6 address: %s", iphttps)
		}
		ip = iphttps[1:closeBracket] // Remove brackets
		rest := iphttps[closeBracket+1:]
		if strings.HasPrefix(rest, ":") {
			port = rest[1:]
		} else {
			port = "443"
		}
	} else {
		// IPv4: ip:port
		lastColon := strings.LastIndex(iphttps, ":")
		if lastColon == -1 {
			return iphttps, "443", nil // Default HTTPS port
		}
		ip = iphttps[:lastColon]
		port = iphttps[lastColon+1:]
	}

	if ip == "" {
		return "", "", fmt.Errorf("empty IP in IPHTTPS: %s", iphttps)
	}
	if port == "" {
		port = "443"
	}

	return ip, port, nil
}

// cleanIPForHostname converts an IP address to a hostname-compatible format per Loxone CloudDNS spec:
// IPv4: dots to dashes (e.g., "200.12.14.24" -> "200-12-14-24")
// IPv6: colons to dashes (e.g., "2001:db8::1" -> "2001-db8--1")
func cleanIPForHostname(ip string) string {
	cleaned := strings.ReplaceAll(ip, ".", "-")
	cleaned = strings.ReplaceAll(cleaned, ":", "-")
	return cleaned
}

// resolveLoxoneCloudDNSLegacy resolves using the legacy MAC-based redirect approach
func (conn *WebSocketConnection) resolveLoxoneCloudDNSLegacy() (string, error) {
	testURL := fmt.Sprintf("http://dns.loxonecloud.com/%s/jdev/cfg/api", conn.MacAddress)
	log.Printf("   Resolving via: %s", testURL)

	client := &http.Client{
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
		Timeout: 15 * time.Second,
	}

	resp, err := client.Get(testURL)
	if err != nil {
		return "", fmt.Errorf("failed to resolve cloud DNS (legacy): %v", err)
	}
	defer resp.Body.Close()

	location := resp.Header.Get("Location")
	if location == "" {
		return "", fmt.Errorf("no redirect location from cloud DNS")
	}

	log.Printf("   [OK] Redirect location: %s", location)

	redirectURL, err := url.Parse(location)
	if err != nil {
		return "", fmt.Errorf("failed to parse redirect URL: %v", err)
	}

	actualHost := redirectURL.Host
	log.Printf("   [OK] Actual server (legacy): %s", actualHost)

	conn.Mu.Lock()
	oldHost := conn.ResolvedHost
	conn.ResolvedHost = actualHost
	conn.Mu.Unlock()

	if oldHost != "" && oldHost != actualHost {
		log.Printf("   [CHANGED] HOST CHANGED: %s -> %s", oldHost, actualHost)
		conn.logToDatabase("Loxone Cloud Host Changed",
			fmt.Sprintf("MAC %s: Host changed from %s to %s", conn.MacAddress, oldHost, actualHost))
	}

	return actualHost, nil
}

// isExpectedDuringPortChange determines if an error is expected during port rotation
func (conn *WebSocketConnection) isExpectedDuringPortChange(err error) bool {
	if !conn.IsRemote {
		return false
	}

	if err == nil {
		return false
	}

	errStr := err.Error()

	if strings.Contains(errStr, "connection refused") ||
		strings.Contains(errStr, "connection reset") ||
		strings.Contains(errStr, "EOF") {
		if time.Since(conn.LastDisconnectTime) < 60*time.Second {
			return true
		}
	}

	return false
}

// updateDeviceStatus updates the notes field for all devices on this connection
func (conn *WebSocketConnection) updateDeviceStatus(db *sql.DB, status string) {
	conn.Mu.Lock()
	devices := conn.Devices
	conn.Mu.Unlock()

	for _, device := range devices {
		if device.Type == "meter" {
			db.Exec(`UPDATE meters SET notes = ? WHERE id = ?`, status, device.ID)
		} else if device.Type == "charger" {
			db.Exec(`UPDATE chargers SET notes = ? WHERE id = ?`, status, device.ID)
		}
	}
}

// logToDatabase logs an event to the database
func (conn *WebSocketConnection) logToDatabase(action, details string) {
	if conn.Db != nil {
		conn.Db.Exec(`
			INSERT INTO admin_logs (action, details, ip_address)
			VALUES (?, ?, ?)
		`, action, details, fmt.Sprintf("loxone-%s", conn.Host))
	}
}
