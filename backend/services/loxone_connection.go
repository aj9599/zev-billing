package services

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

// ========== CONNECTION MANAGEMENT ==========

func (conn *LoxoneWebSocketConnection) Connect(db *sql.DB) {
	conn.ConnectWithBackoff(db)
}

func (conn *LoxoneWebSocketConnection) ConnectWithBackoff(db *sql.DB) {
	conn.mu.Lock()

	if conn.isShuttingDown {
		conn.mu.Unlock()
		log.Printf("ℹ️ [%s] Skipping reconnect - connection is shutting down", conn.Host)
		return
	}

	if conn.isReconnecting {
		conn.mu.Unlock()
		log.Printf("ℹ️ [%s] Reconnection already in progress, skipping", conn.Host)
		return
	}

	if conn.isConnected {
		conn.mu.Unlock()
		log.Printf("ℹ️ [%s] Already connected, skipping", conn.Host)
		return
	}

	conn.isReconnecting = true
	conn.mu.Unlock()

	defer func() {
		conn.mu.Lock()
		conn.isReconnecting = false
		conn.mu.Unlock()
	}()

	// Stop any existing goroutines first
	conn.mu.Lock()
	if conn.stopChan != nil {
		select {
		case <-conn.stopChan:
		default:
			close(conn.stopChan)
		}
	}
	conn.stopChan = make(chan bool)
	conn.mu.Unlock()

	conn.goroutinesWg.Wait()

	maxRetries := 10
	for attempt := 1; attempt <= maxRetries; attempt++ {
		conn.mu.Lock()
		if conn.isShuttingDown {
			conn.mu.Unlock()
			log.Printf("ℹ️ [%s] Stopping reconnection attempts - shutting down", conn.Host)
			return
		}

		if conn.isConnected {
			conn.mu.Unlock()
			log.Printf("ℹ️ [%s] Already connected, stopping retry loop", conn.Host)
			return
		}
		conn.mu.Unlock()

		if attempt > 1 {
			conn.mu.Lock()
			backoff := conn.reconnectBackoff
			conn.mu.Unlock()

			jitter := time.Duration(rand.Float64() * float64(backoff) * 0.3)
			backoffWithJitter := backoff + jitter
			log.Printf("⏳ [%s] Waiting %.1fs (backoff with jitter) before retry attempt %d/%d...",
				conn.Host, backoffWithJitter.Seconds(), attempt, maxRetries)
			time.Sleep(backoffWithJitter)
		}

		log.Println("├────────────────────────────────────────────────────────────────────")
		log.Printf("│ 💗 CONNECTING: %s (attempt %d/%d)", conn.Host, attempt, maxRetries)
		log.Println("└────────────────────────────────────────────────────────────────────")

		var wsURL string
		conn.mu.Lock()
		isRemote := conn.IsRemote
		conn.mu.Unlock()

		if isRemote {
			log.Printf("Step 1a: Re-resolving Loxone Cloud DNS address (ALWAYS on reconnect)")

			actualHost, err := conn.resolveLoxoneCloudDNS()
			if err != nil {
				log.Printf("❌ Failed to resolve cloud DNS: %v", err)
				conn.mu.Lock()
				conn.isConnected = false
				conn.lastError = fmt.Sprintf("Failed to resolve cloud DNS: %v", err)
				conn.consecutiveConnFails++
				if conn.reconnectBackoff < 2*time.Second {
					conn.reconnectBackoff = 2 * time.Second
				} else {
					conn.reconnectBackoff = time.Duration(math.Min(
						float64(conn.reconnectBackoff*2),
						float64(conn.maxBackoff),
					))
				}
				conn.mu.Unlock()
				continue
			}

			wsURL = fmt.Sprintf("wss://%s/ws/rfc6455", actualHost)
			log.Printf("   ✅ Using resolved host: %s", actualHost)
		} else {
			conn.mu.Lock()
			wsURL = fmt.Sprintf("ws://%s/ws/rfc6455", conn.Host)
			conn.mu.Unlock()
		}

		log.Printf("Step 1: Establishing WebSocket connection")
		log.Printf("   URL: %s", wsURL)

		dialer := websocket.Dialer{
			HandshakeTimeout: 15 * time.Second,
		}

		if isRemote {
			dialer.TLSClientConfig = &tls.Config{
				InsecureSkipVerify: true,
			}
		}

		ws, _, err := dialer.Dial(wsURL, nil)
		if err != nil {
			errorType := classifyError(err)

			if conn.isExpectedDuringPortChange(err) {
				errMsg := fmt.Sprintf("Reconnecting after port change: %v", err)
				log.Printf("[INFO] [%s] %s (attempt %d/%d)", conn.Host, errMsg, attempt, maxRetries)

				conn.mu.Lock()
				conn.portChangeInProgress = true
				conn.lastError = "Port change in progress"
				conn.mu.Unlock()

				if attempt == 1 {
					conn.logToDatabase("Loxone Port Change",
						fmt.Sprintf("Host '%s': Port rotation detected, reconnecting", conn.Host))
				}
			} else {
				errMsg := fmt.Sprintf("Connection failed: %v", err)
				log.Printf("[ERROR] [%s] %s", conn.Host, errMsg)

				conn.mu.Lock()
				conn.isConnected = false
				conn.lastError = errMsg
				conn.lastErrorType = errorType
				conn.consecutiveConnFails++
				conn.portChangeInProgress = false
				conn.mu.Unlock()

				conn.updateDeviceStatus(db, fmt.Sprintf("[ERROR] Connection failed (attempt %d): %v", attempt, err))
				conn.logToDatabase("Loxone Connection Failed",
					fmt.Sprintf("Host '%s': %v (attempt %d, type: %d)", conn.Host, err, attempt, errorType))
			}

			continue
		}

		if conn.performConnection(ws, db) {
			conn.mu.Lock()
			wasPortChange := conn.portChangeInProgress
			conn.portChangeInProgress = false
			deviceCount := len(conn.devices)
			conn.mu.Unlock()

			if wasPortChange {
				log.Println("[OK] Port change completed successfully")
				conn.logToDatabase("Loxone Port Change Complete",
					fmt.Sprintf("Host '%s' reconnected after port rotation (lifetime reconnects: %d)",
						conn.Host, conn.totalReconnects))
			} else {
				log.Println("[OK] CONNECTION ESTABLISHED!")
				conn.logToDatabase("Loxone Connected",
					fmt.Sprintf("Host '%s' connected with %d devices (lifetime reconnects: %d)",
						conn.Host, deviceCount, conn.totalReconnects))
			}

			return
		}
	}

	log.Printf("❌ [%s] All %d connection attempts failed, will retry later", conn.Host, maxRetries)
	conn.logToDatabase("Loxone Connection Exhausted",
		fmt.Sprintf("Host '%s': All %d connection attempts failed", conn.Host, maxRetries))

	go func() {
		conn.mu.Lock()
		backoff := conn.maxBackoff
		conn.mu.Unlock()

		time.Sleep(backoff)

		conn.mu.Lock()
		isShuttingDown := conn.isShuttingDown
		conn.mu.Unlock()

		if !isShuttingDown {
			log.Printf("🔄 [%s] Scheduling new reconnection attempt after cooldown", conn.Host)
			go conn.ConnectWithBackoff(db)
		}
	}()
}

func (conn *LoxoneWebSocketConnection) performConnection(ws *websocket.Conn, db *sql.DB) bool {
	conn.mu.Lock()
	conn.ws = ws
	conn.consecutiveConnFails = 0
	conn.lastConnectionTime = time.Now()
	conn.mu.Unlock()

	log.Printf("✅ WebSocket connected successfully")
	log.Printf("Step 2: Starting token-based authentication")

	if err := conn.authenticateWithToken(); err != nil {
		errMsg := fmt.Sprintf("Authentication failed: %v", err)
		log.Printf("❌ %s", errMsg)
		ws.Close()

		conn.mu.Lock()
		conn.ws = nil
		conn.isConnected = false
		conn.tokenValid = false
		conn.lastError = errMsg
		conn.consecutiveAuthFails++
		conn.totalAuthFailures++

		conn.reconnectBackoff = time.Duration(math.Min(
			float64(conn.reconnectBackoff*2),
			float64(conn.maxBackoff),
		))
		conn.mu.Unlock()

		conn.updateDeviceStatus(db, fmt.Sprintf("🔴 Auth failed: %v", err))
		conn.logToDatabase("Loxone Auth Failed",
			fmt.Sprintf("Host '%s': %v (failures: %d)", conn.Host, err, conn.consecutiveAuthFails))
		return false
	}

	conn.mu.Lock()
	conn.isConnected = true
	conn.tokenValid = true
	conn.lastError = ""
	conn.consecutiveAuthFails = 0
	conn.reconnectBackoff = 2 * time.Second
	conn.totalReconnects++
	conn.lastSuccessfulAuth = time.Now()
	deviceCount := len(conn.devices)
	conn.mu.Unlock()

	log.Println("├────────────────────────────────────────────────────────────────────")
	log.Printf("│ ✅ CONNECTION ESTABLISHED!         │")
	log.Printf("│ Host: %-27s│", conn.Host)
	log.Printf("│ Devices: %-24d│", deviceCount)
	log.Println("└────────────────────────────────────────────────────────────────────")

	conn.updateDeviceStatus(db, fmt.Sprintf("🟢 Connected at %s", time.Now().Format("2006-01-02 15:04:05")))
	conn.logToDatabase("Loxone Connected",
		fmt.Sprintf("Host '%s' connected with %d devices (lifetime reconnects: %d)",
			conn.Host, deviceCount, conn.totalReconnects))

	log.Printf("🎧 Starting data listener for %s...", conn.Host)
	conn.goroutinesWg.Add(1)
	go conn.readLoop(db)

	log.Printf("⏰ Starting data request scheduler for %s...", conn.Host)
	conn.goroutinesWg.Add(1)
	go conn.requestData()

	log.Printf("🔒 Starting token expiry monitor for %s...", conn.Host)
	conn.goroutinesWg.Add(1)
	go conn.monitorTokenExpiry(db)

	log.Printf("💚 Starting keepalive for %s...", conn.Host)
	conn.goroutinesWg.Add(1)
	go conn.keepalive()

	if conn.IsRemote {
		log.Printf("🌐 Starting DNS change monitor for %s...", conn.Host)
		conn.goroutinesWg.Add(1)
		go conn.monitorDNSChanges()
	}

	return true
}

func (conn *LoxoneWebSocketConnection) Close() {
	log.Printf("🗑️ Closing connection for %s", conn.Host)
	conn.mu.Lock()

	conn.isShuttingDown = true

	if conn.stopChan != nil {
		select {
		case <-conn.stopChan:
		default:
			close(conn.stopChan)
		}
	}

	if conn.ws != nil {
		conn.ws.Close()
		conn.ws = nil
	}
	conn.isConnected = false
	conn.tokenValid = false
	conn.mu.Unlock()

	log.Printf("  ⏳ Waiting for goroutines to finish...")
	conn.goroutinesWg.Wait()
	log.Printf("   ✅ Connection closed")

	conn.logToDatabase("Loxone Connection Closed",
		fmt.Sprintf("Host '%s' connection closed", conn.Host))
}

func (conn *LoxoneWebSocketConnection) IsConnected() bool {
	conn.mu.Lock()
	defer conn.mu.Unlock()
	return conn.isConnected
}

// ========== DNS RESOLUTION ==========

func (conn *LoxoneWebSocketConnection) resolveLoxoneCloudDNS() (string, error) {
	if !conn.IsRemote {
		return conn.Host, nil
	}

	log.Printf("🌐 [%s] Resolving Loxone Cloud DNS address", conn.MacAddress)

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

	log.Printf("   ✅ Redirect location: %s", location)

	redirectURL, err := url.Parse(location)
	if err != nil {
		return "", fmt.Errorf("failed to parse redirect URL: %v", err)
	}

	actualHost := redirectURL.Host
	log.Printf("   ✅ Actual server: %s", actualHost)

	conn.mu.Lock()
	oldHost := conn.ResolvedHost
	conn.ResolvedHost = actualHost
	conn.mu.Unlock()

	if oldHost != "" && oldHost != actualHost {
		log.Printf("   🔄 HOST CHANGED: %s → %s", oldHost, actualHost)
		conn.logToDatabase("Loxone Cloud Host Changed",
			fmt.Sprintf("MAC %s: Host changed from %s to %s", conn.MacAddress, oldHost, actualHost))
	}

	return actualHost, nil
}

func (conn *LoxoneWebSocketConnection) monitorDNSChanges() {
	defer conn.goroutinesWg.Done()

	if !conn.IsRemote {
		return
	}

	log.Printf("🌐 DNS MONITOR STARTED for %s (check every 5 minutes)", conn.MacAddress)

	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-conn.stopChan:
			log.Printf("🗑️ [%s] DNS monitor stopping", conn.Host)
			return
		case <-ticker.C:
			conn.mu.Lock()
			isConnected := conn.isConnected
			currentResolvedHost := conn.ResolvedHost
			conn.mu.Unlock()

			if !isConnected {
				return
			}

			newHost, err := conn.resolveLoxoneCloudDNS()
			if err != nil {
				log.Printf("⚠️ [%s] DNS re-check failed: %v", conn.MacAddress, err)
				continue
			}

			if newHost != currentResolvedHost {
				log.Printf("🔄 [%s] DNS CHANGED DETECTED: %s → %s",
					conn.MacAddress, currentResolvedHost, newHost)
				log.Printf("   Triggering proactive reconnection...")

				conn.logToDatabase("Loxone DNS Changed Detected",
					fmt.Sprintf("MAC %s: Proactive reconnect due to DNS change", conn.MacAddress))

				conn.mu.Lock()
				if conn.ws != nil {
					conn.ws.Close()
				}
				conn.isConnected = false
				conn.mu.Unlock()

				go conn.ConnectWithBackoff(conn.db)
				return
			}

			log.Printf("✅ [%s] DNS unchanged: %s", conn.MacAddress, currentResolvedHost)
		}
	}
}

func (conn *LoxoneWebSocketConnection) isExpectedDuringPortChange(err error) bool {
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
		if time.Since(conn.lastDisconnectTime) < 60*time.Second {
			return true
		}
	}

	return false
}

// ========== HELPERS ==========

func (conn *LoxoneWebSocketConnection) updateDeviceStatus(db *sql.DB, status string) {
	conn.mu.Lock()
	devices := conn.devices
	conn.mu.Unlock()

	for _, device := range devices {
		if device.Type == "meter" {
			db.Exec(`UPDATE meters SET notes = ? WHERE id = ?`, status, device.ID)
		} else if device.Type == "charger" {
			db.Exec(`UPDATE chargers SET notes = ? WHERE id = ?`, status, device.ID)
		}
	}
}

func (conn *LoxoneWebSocketConnection) logToDatabase(action, details string) {
	if conn.db != nil {
		conn.db.Exec(`
			INSERT INTO admin_logs (action, details, ip_address)
			VALUES (?, ?, ?)
		`, action, details, fmt.Sprintf("loxone-%s", conn.Host))
	}
}