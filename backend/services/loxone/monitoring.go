package loxone

import (
	"crypto/tls"
	"database/sql"
	"fmt"
	"log"
	"time"

	"github.com/gorilla/websocket"
)

// keepalive sends periodic keepalive messages to prevent connection timeout
func (conn *WebSocketConnection) keepalive() {
	defer conn.GoroutinesWg.Done()

	log.Printf("[KEEPALIVE] STARTED for %s (interval: 4 minutes)", conn.Host)

	ticker := time.NewTicker(4 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-conn.StopChan:
			log.Printf("[KEEPALIVE] [%s] Stopping", conn.Host)
			return
		case <-ticker.C:
			conn.Mu.Lock()
			if !conn.IsConnected || conn.Ws == nil {
				log.Printf("[WARN] [%s] Not connected, keepalive stopping", conn.Host)
				conn.Mu.Unlock()
				return
			}

			// Skip keepalive if collection is in progress
			if conn.CollectionInProgress {
				log.Printf("[KEEPALIVE] [%s] Collection in progress, skipping", conn.Host)
				conn.Mu.Unlock()
				continue
			}
			conn.Mu.Unlock()

			keepaliveCmd := "keepalive"
			log.Printf("[KEEPALIVE] [%s] Sending...", conn.Host)

			if err := conn.safeWriteMessage(websocket.TextMessage, []byte(keepaliveCmd)); err != nil {
				log.Printf("[ERROR] [%s] Failed to send keepalive: %v", conn.Host, err)
				conn.Mu.Lock()
				conn.IsConnected = false
				conn.TokenValid = false
				conn.LastError = fmt.Sprintf("Keepalive failed: %v", err)
				conn.Mu.Unlock()

				conn.logToDatabase("Loxone Keepalive Failed",
					fmt.Sprintf("Host '%s': %v - triggering reconnect", conn.Host, err))

				go conn.ConnectWithBackoff(conn.Db, conn.Collector)
				return
			}

			log.Printf("[KEEPALIVE] [%s] Sent successfully", conn.Host)
		}
	}
}

// monitorTokenExpiry monitors token expiry and refreshes as needed
func (conn *WebSocketConnection) monitorTokenExpiry(db *sql.DB) {
	defer conn.GoroutinesWg.Done()

	log.Printf("[TOKEN] MONITOR STARTED for %s (collection-window aware)", conn.Host)

	// Check every 3 minutes
	ticker := time.NewTicker(3 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-conn.StopChan:
			log.Printf("[TOKEN] [%s] Monitor stopping", conn.Host)
			return
		case <-ticker.C:
			conn.Mu.Lock()
			isConnected := conn.IsConnected
			tokenValid := conn.TokenValid
			tokenExpiry := conn.TokenExpiry
			collectionInProgress := conn.CollectionInProgress
			conn.Mu.Unlock()

			if !isConnected {
				log.Printf("[WARN] [%s] Not connected, token monitor stopping", conn.Host)
				return
			}

			// Skip token operations during collection
			if collectionInProgress {
				log.Printf("[TOKEN] [%s] Collection in progress, skipping token check", conn.Host)
				continue
			}

			// Skip if we're within 2 minutes of a collection window (:00, :15, :30, :45)
			minute := time.Now().Minute()
			nearCollection := (minute >= 58 || minute <= 2) ||
				(minute >= 13 && minute <= 17) ||
				(minute >= 28 && minute <= 32) ||
				(minute >= 43 && minute <= 47)
			if nearCollection {
				log.Printf("[TOKEN] [%s] Near collection window (minute=%d), deferring token check", conn.Host, minute)
				continue
			}

			// Check token with 2-minute safety margin
			if !tokenValid || time.Now().After(tokenExpiry.Add(-2*time.Minute)) {
				timeUntilExpiry := time.Until(tokenExpiry)
				log.Printf("[WARN] [%s] Token invalid or expiring soon (%.1f min), refreshing...",
					conn.Host, timeUntilExpiry.Minutes())

				conn.logToDatabase("Loxone Token Expiring",
					fmt.Sprintf("Host '%s' token expiring, refreshing...", conn.Host))

				if err := conn.ensureAuth(); err != nil {
					log.Printf("[ERROR] [%s] Failed to ensure auth: %v", conn.Host, err)
					log.Printf("   Triggering full reconnect...")
					conn.logToDatabase("Loxone Auth Check Failed",
						fmt.Sprintf("Host '%s': %v - reconnecting", conn.Host, err))

					conn.Mu.Lock()
					conn.IsConnected = false
					conn.TokenValid = false
					if conn.Ws != nil {
						conn.Ws.Close()
					}
					isShuttingDown := conn.IsShuttingDown
					conn.Mu.Unlock()

					conn.updateDeviceStatus(db, "[RECONNECT] Auth failed, reconnecting...")

					if !isShuttingDown {
						log.Printf("[RECONNECT] [%s] Triggering automatic reconnect", conn.Host)
						go conn.ConnectWithBackoff(db, conn.Collector)
					}
					return
				}

				conn.updateDeviceStatus(db,
					fmt.Sprintf("[OK] Token refreshed at %s", time.Now().Format("2006-01-02 15:04:05")))
			} else {
				timeUntilExpiry := time.Until(tokenExpiry)
				log.Printf("[TOKEN] [%s] Token valid for %.1f hours", conn.Host, timeUntilExpiry.Hours())
			}
		}
	}
}

// monitorDNSChanges monitors DNS changes for remote connections
func (conn *WebSocketConnection) monitorDNSChanges() {
	defer conn.GoroutinesWg.Done()

	if !conn.IsRemote {
		return
	}

	log.Printf("[DNS] MONITOR STARTED for %s (check every 2 minutes)", conn.MacAddress)

	ticker := time.NewTicker(2 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-conn.StopChan:
			log.Printf("[DNS] [%s] Monitor stopping", conn.Host)
			return
		case <-ticker.C:
			conn.Mu.Lock()
			isConnected := conn.IsConnected
			currentResolvedHost := conn.ResolvedHost
			conn.Mu.Unlock()

			if !isConnected {
				return
			}

			// Try to resolve DNS
			newHost, err := conn.resolveLoxoneCloudDNS()
			if err != nil {
				log.Printf("[WARN] [%s] DNS re-check failed: %v", conn.MacAddress, err)
				continue
			}

			// If host has changed, validate new host before disconnecting
			if newHost != currentResolvedHost {
				log.Printf("[DNS] [%s] DNS CHANGE DETECTED: %s -> %s",
					conn.MacAddress, currentResolvedHost, newHost)

				// Pre-validate the new host is reachable before tearing down old connection
				testDialer := websocket.Dialer{HandshakeTimeout: 5 * time.Second}

				conn.Mu.Lock()
				useTLS := conn.UseTLSVerification
				conn.Mu.Unlock()

				if useTLS {
					testDialer.TLSClientConfig = &tls.Config{
						MinVersion: tls.VersionTLS12,
					}
				} else {
					testDialer.TLSClientConfig = &tls.Config{
						InsecureSkipVerify: true,
					}
				}

				testURL := fmt.Sprintf("wss://%s/ws/rfc6455", newHost)
				testWs, _, testErr := testDialer.Dial(testURL, nil)
				if testErr != nil {
					log.Printf("[DNS] [%s] New host not yet reachable: %v, will retry next check", conn.MacAddress, testErr)
					// Revert resolved host since the new one isn't ready
					conn.Mu.Lock()
					conn.ResolvedHost = currentResolvedHost
					conn.Mu.Unlock()
					continue
				}
				testWs.Close()

				log.Printf("[DNS] [%s] New host validated, proceeding with reconnection", conn.MacAddress)
				conn.logToDatabase("Loxone DNS Change Detected",
					fmt.Sprintf("MAC %s: Proactive reconnect due to DNS change %s -> %s",
						conn.MacAddress, currentResolvedHost, newHost))

				// Reset backoff for fast reconnect after DNS change
				conn.Mu.Lock()
				conn.ReconnectBackoff = 2 * time.Second
				if conn.Ws != nil {
					conn.Ws.Close()
				}
				conn.IsConnected = false
				conn.Mu.Unlock()

				go conn.ConnectWithBackoff(conn.Db, conn.Collector)
				return
			}

			log.Printf("[DNS] [%s] DNS unchanged: %s", conn.MacAddress, currentResolvedHost)
		}
	}
}

// monitorWebSocketPing sends WebSocket-level pings for fast dead connection detection.
// This runs every 30 seconds and declares the connection dead if no pong is received
// within 90 seconds. Much faster than the 20-minute read deadline.
func (conn *WebSocketConnection) monitorWebSocketPing() {
	defer conn.GoroutinesWg.Done()

	log.Printf("[PING] MONITOR STARTED for %s (interval: 30s, timeout: 90s)", conn.Host)

	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-conn.StopChan:
			log.Printf("[PING] [%s] Monitor stopping", conn.Host)
			return
		case <-ticker.C:
			conn.Mu.Lock()
			if !conn.IsConnected || conn.Ws == nil {
				conn.Mu.Unlock()
				log.Printf("[PING] [%s] Not connected, stopping", conn.Host)
				return
			}

			// Skip during collection to avoid interfering
			if conn.CollectionInProgress {
				conn.Mu.Unlock()
				continue
			}

			lastPong := conn.LastPongReceived
			conn.Mu.Unlock()

			// If no pong received within 90 seconds, connection is likely dead
			if !lastPong.IsZero() && time.Since(lastPong) > 90*time.Second {
				log.Printf("[PING] [%s] No pong received in %.0fs, connection likely dead - reconnecting",
					conn.Host, time.Since(lastPong).Seconds())

				conn.logToDatabase("Loxone Ping Timeout",
					fmt.Sprintf("Host '%s': No pong in %.0fs, triggering reconnect",
						conn.Host, time.Since(lastPong).Seconds()))

				conn.Mu.Lock()
				conn.IsConnected = false
				conn.LastError = "WebSocket ping timeout"
				if conn.Ws != nil {
					conn.Ws.Close()
				}
				conn.Mu.Unlock()

				go conn.ConnectWithBackoff(conn.Db, conn.Collector)
				return
			}

			// Send WebSocket-level ping
			if err := conn.safeWriteMessage(websocket.PingMessage, []byte("ping")); err != nil {
				log.Printf("[PING] [%s] WebSocket ping failed: %v", conn.Host, err)

				conn.Mu.Lock()
				conn.IsConnected = false
				conn.LastError = fmt.Sprintf("Ping failed: %v", err)
				conn.Mu.Unlock()

				go conn.ConnectWithBackoff(conn.Db, conn.Collector)
				return
			}
		}
	}
}
