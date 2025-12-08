package loxone

import (
	"crypto/tls"
	"database/sql"
	"fmt"
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
			cacheTTL:   5 * time.Minute,
		}
	}

	return conn
}

// Connect initiates the connection with backoff
func (conn *WebSocketConnection) Connect(db *sql.DB, collector LoxoneCollectorInterface) {
	conn.ConnectWithBackoff(db, collector)
}

// ConnectWithBackoff attempts to connect with exponential backoff and jitter
func (conn *WebSocketConnection) ConnectWithBackoff(db *sql.DB, collector LoxoneCollectorInterface) {
	conn.Mu.Lock()

	// Don't reconnect if shutting down
	if conn.IsShuttingDown {
		conn.Mu.Unlock()
		log.Printf("â„¹ï¸  [%s] Skipping reconnect - connection is shutting down", conn.Host)
		return
	}

	// Prevent multiple simultaneous reconnection attempts
	if conn.IsReconnecting {
		conn.Mu.Unlock()
		log.Printf("â„¹ï¸  [%s] Reconnection already in progress, skipping", conn.Host)
		return
	}

	if conn.IsConnected {
		conn.Mu.Unlock()
		log.Printf("â„¹ï¸  [%s] Already connected, skipping", conn.Host)
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

	// Retry loop for connection attempts
	maxRetries := 10
	for attempt := 1; attempt <= maxRetries; attempt++ {
		// Check if we should stop
		conn.Mu.Lock()
		if conn.IsShuttingDown {
			conn.Mu.Unlock()
			log.Printf("â„¹ï¸  [%s] Stopping reconnection attempts - shutting down", conn.Host)
			return
		}

		if conn.IsConnected {
			conn.Mu.Unlock()
			log.Printf("â„¹ï¸  [%s] Already connected, stopping retry loop", conn.Host)
			return
		}
		conn.Mu.Unlock()

		// Apply backoff with jitter (except on first attempt)
		if attempt > 1 {
			conn.Mu.Lock()
			backoff := conn.ReconnectBackoff
			conn.Mu.Unlock()

			jitter := time.Duration(rand.Float64() * float64(backoff) * 0.3)
			backoffWithJitter := backoff + jitter
			log.Printf("â³ [%s] Waiting %.1fs (backoff with jitter) before retry attempt %d/%d...",
				conn.Host, backoffWithJitter.Seconds(), attempt, maxRetries)
			time.Sleep(backoffWithJitter)
		}

		log.Println("â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€")
		log.Printf("â”‚ ðŸ’— CONNECTING: %s (attempt %d/%d)", conn.Host, attempt, maxRetries)
		log.Println("â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€")

		// CRITICAL FIX: Check if this is a remote connection and ALWAYS re-resolve DNS
		var wsURL string
		conn.Mu.Lock()
		isRemote := conn.IsRemote
		conn.Mu.Unlock()

		if isRemote {
			log.Printf("Step 1a: Re-resolving Loxone Cloud DNS address (ALWAYS on reconnect)")

			actualHost, err := conn.resolveLoxoneCloudDNS()
			if err != nil {
				log.Printf("âŒ Failed to resolve cloud DNS: %v", err)
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
			log.Printf("   âœ… Using resolved host: %s", actualHost)
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

		// For remote connections, skip TLS verification
		if isRemote {
			dialer.TLSClientConfig = &tls.Config{
				InsecureSkipVerify: true,
			}
		}

		ws, _, err := dialer.Dial(wsURL, nil)
		if err != nil {
			errorType := ClassifyError(err)

			// Check if this is expected during port change
			if conn.isExpectedDuringPortChange(err) {
				errMsg := fmt.Sprintf("Reconnecting after port change: %v", err)
				log.Printf("[INFO] [%s] %s (attempt %d/%d)", conn.Host, errMsg, attempt, maxRetries)

				conn.Mu.Lock()
				conn.PortChangeInProgress = true
				conn.LastError = "Port change in progress"
				conn.Mu.Unlock()

				if attempt == 1 {
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

				conn.updateDeviceStatus(db, fmt.Sprintf("[ERROR] Connection failed (attempt %d): %v", attempt, err))
				conn.logToDatabase("Loxone Connection Failed",
					fmt.Sprintf("Host '%s': %v (attempt %d, type: %d)", conn.Host, err, attempt, errorType))
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
					fmt.Sprintf("Host '%s' connected with %d devices (lifetime reconnects: %d)",
						conn.Host, deviceCount, conn.TotalReconnects))
			}

			return
		}
	}

	// All retries exhausted
	log.Printf("âŒ [%s] All %d connection attempts failed, will retry later", conn.Host, maxRetries)
	conn.logToDatabase("Loxone Connection Exhausted",
		fmt.Sprintf("Host '%s': All %d connection attempts failed", conn.Host, maxRetries))

	// Schedule another reconnection attempt after max backoff
	go func() {
		conn.Mu.Lock()
		backoff := conn.MaxBackoff
		conn.Mu.Unlock()

		time.Sleep(backoff)

		conn.Mu.Lock()
		isShuttingDown := conn.IsShuttingDown
		conn.Mu.Unlock()

		if !isShuttingDown {
			log.Printf("ðŸ”„ [%s] Scheduling new reconnection attempt after cooldown", conn.Host)
			go conn.ConnectWithBackoff(db, collector)
		}
	}()
}

// performConnection handles the connection setup after websocket is established
func (conn *WebSocketConnection) performConnection(ws *websocket.Conn, db *sql.DB, collector LoxoneCollectorInterface) bool {
	conn.Mu.Lock()
	conn.Ws = ws
	conn.ConsecutiveConnFails = 0
	conn.LastConnectionTime = time.Now()
	conn.Mu.Unlock()

	log.Printf("âœ”ï¸ WebSocket connected successfully")
	log.Printf("Step 2: Starting token-based authentication")

	if err := conn.authenticateWithToken(); err != nil {
		errMsg := fmt.Sprintf("Authentication failed: %v", err)
		log.Printf("âŒ %s", errMsg)
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

		conn.updateDeviceStatus(db, fmt.Sprintf("ðŸ”´ Auth failed: %v", err))
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

	log.Println("â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€")
	log.Printf("â”‚ âœ”ï¸ CONNECTION ESTABLISHED!         â”‚")
	log.Printf("â”‚ Host: %-27sâ”‚", conn.Host)
	log.Printf("â”‚ Devices: %-24dâ”‚", deviceCount)
	log.Println("â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€")

	conn.updateDeviceStatus(db, fmt.Sprintf("ðŸŸ¢ Connected at %s", time.Now().Format("2006-01-02 15:04:05")))
	conn.logToDatabase("Loxone Connected",
		fmt.Sprintf("Host '%s' connected with %d devices (lifetime reconnects: %d)",
			conn.Host, deviceCount, conn.TotalReconnects))

	log.Printf("ðŸŽ§ Starting data listener for %s...", conn.Host)
	conn.GoroutinesWg.Add(1)
	go conn.readLoop(db, collector)

	log.Printf("â° Starting data request scheduler for %s...", conn.Host)
	conn.GoroutinesWg.Add(1)
	go conn.requestData()

	log.Printf("ðŸ”‘ Starting token expiry monitor for %s...", conn.Host)
	conn.GoroutinesWg.Add(1)
	go conn.monitorTokenExpiry(db)

	log.Printf("ðŸ’“ Starting keepalive for %s...", conn.Host)
	conn.GoroutinesWg.Add(1)
	go conn.keepalive()

	if conn.IsRemote {
		log.Printf("ðŸŒ Starting DNS change monitor for %s...", conn.Host)
		conn.GoroutinesWg.Add(1)
		go conn.monitorDNSChanges()
	}

	return true
}

// Close gracefully closes the connection
func (conn *WebSocketConnection) Close() {
	log.Printf("ðŸ—‘ï¸ Closing connection for %s", conn.Host)
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
	log.Printf("  â³ Waiting for goroutines to finish...")
	conn.GoroutinesWg.Wait()
	log.Printf("   âœ”ï¸ Connection closed")

	conn.logToDatabase("Loxone Connection Closed",
		fmt.Sprintf("Host '%s' connection closed", conn.Host))
}

// resolveLoxoneCloudDNS resolves the Loxone Cloud DNS and returns the actual server address
func (conn *WebSocketConnection) resolveLoxoneCloudDNS() (string, error) {
	if !conn.IsRemote {
		return conn.Host, nil
	}

	log.Printf("ðŸŒ [%s] Resolving Loxone Cloud DNS address", conn.MacAddress)

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
		return "", fmt.Errorf("failed to resolve cloud DNS: %v", err)
	}
	defer resp.Body.Close()

	location := resp.Header.Get("Location")
	if location == "" {
		return "", fmt.Errorf("no redirect location from cloud DNS")
	}

	log.Printf("   âœ… Redirect location: %s", location)

	redirectURL, err := url.Parse(location)
	if err != nil {
		return "", fmt.Errorf("failed to parse redirect URL: %v", err)
	}

	actualHost := redirectURL.Host
	log.Printf("   âœ… Actual server: %s", actualHost)

	conn.Mu.Lock()
	oldHost := conn.ResolvedHost
	conn.ResolvedHost = actualHost
	conn.Mu.Unlock()

	if oldHost != "" && oldHost != actualHost {
		log.Printf("   ðŸ”„ HOST CHANGED: %s â†’ %s", oldHost, actualHost)
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