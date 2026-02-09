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
				// FIX: Don't exit - just skip this cycle. Previously this would
				// permanently kill the keepalive goroutine.
				conn.Mu.Unlock()
				continue
			}

			// Skip keepalive if collection is in progress
			if conn.CollectionInProgress {
				conn.Mu.Unlock()
				continue
			}
			conn.Mu.Unlock()

			if err := conn.safeWriteMessage(websocket.TextMessage, []byte("keepalive")); err != nil {
				log.Printf("[ERROR] [%s] Failed to send keepalive: %v", conn.Host, err)
				conn.Mu.Lock()
				conn.IsConnected = false
				conn.TokenValid = false
				conn.LastError = fmt.Sprintf("Keepalive failed: %v", err)
				if conn.Ws != nil {
					conn.Ws.Close()
				}
				conn.Mu.Unlock()

				conn.logToDatabase("Loxone Keepalive Failed",
					fmt.Sprintf("Host '%s': %v", conn.Host, err))
				// readLoop's defer will trigger reconnect
				return
			}
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
				// FIX: Don't exit - just keep waiting. The connection may come back
				// via reconnect. Previously this would exit permanently.
				continue
			}

			// Skip token operations during collection
			if collectionInProgress {
				continue
			}

			// Skip if we're within 2 minutes of a collection window (:00, :15, :30, :45)
			minute := time.Now().Minute()
			nearCollection := (minute >= 58 || minute <= 2) ||
				(minute >= 13 && minute <= 17) ||
				(minute >= 28 && minute <= 32) ||
				(minute >= 43 && minute <= 47)
			if nearCollection {
				continue
			}

			// Check token with 2-minute safety margin
			if !tokenValid || time.Now().After(tokenExpiry.Add(-2*time.Minute)) {
				timeUntilExpiry := time.Until(tokenExpiry)
				log.Printf("[WARN] [%s] Token invalid or expiring soon (%.1f min), triggering reconnect for fresh auth...",
					conn.Host, timeUntilExpiry.Minutes())

				conn.logToDatabase("Loxone Token Expiring",
					fmt.Sprintf("Host '%s' token expiring (%.1f min left), reconnecting for fresh auth",
						conn.Host, timeUntilExpiry.Minutes()))

				// FIX: Instead of calling ensureAuth() which reads from WebSocket
				// (racing with the reader goroutine), trigger a full reconnect.
				// performConnection() authenticates BEFORE starting the reader goroutine,
				// which is the only safe way to do it.
				conn.Mu.Lock()
				conn.IsConnected = false
				conn.TokenValid = false
				conn.LastError = "Token expiring, reconnecting"
				if conn.Ws != nil {
					conn.Ws.Close()
				}
				conn.Mu.Unlock()

				conn.updateDeviceStatus(db, "[RECONNECT] Token expiring, reconnecting...")
				// readLoop's defer will trigger reconnect
				return
			} else {
				timeUntilExpiry := time.Until(tokenExpiry)
				if timeUntilExpiry.Hours() < 1 {
					log.Printf("[TOKEN] [%s] Token valid for %.1f minutes", conn.Host, timeUntilExpiry.Minutes())
				}
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
				// FIX: Don't exit - wait for reconnect
				continue
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
				conn.IsConnected = false
				conn.LastError = "DNS change detected, reconnecting"
				if conn.Ws != nil {
					conn.Ws.Close()
				}
				conn.Mu.Unlock()
				// readLoop's defer will trigger reconnect
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
				// FIX: Don't exit - wait for reconnect
				continue
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
				log.Printf("[PING] [%s] No pong received in %.0fs, connection likely dead",
					conn.Host, time.Since(lastPong).Seconds())

				conn.logToDatabase("Loxone Ping Timeout",
					fmt.Sprintf("Host '%s': No pong in %.0fs",
						conn.Host, time.Since(lastPong).Seconds()))

				conn.Mu.Lock()
				conn.IsConnected = false
				conn.LastError = "WebSocket ping timeout"
				if conn.Ws != nil {
					conn.Ws.Close()
				}
				conn.Mu.Unlock()
				// readLoop's defer will trigger reconnect
				return
			}

			// Send WebSocket-level ping
			if err := conn.safeWriteMessage(websocket.PingMessage, []byte("ping")); err != nil {
				log.Printf("[PING] [%s] WebSocket ping failed: %v", conn.Host, err)

				conn.Mu.Lock()
				conn.IsConnected = false
				conn.LastError = fmt.Sprintf("Ping failed: %v", err)
				if conn.Ws != nil {
					conn.Ws.Close()
				}
				conn.Mu.Unlock()
				// readLoop's defer will trigger reconnect
				return
			}
		}
	}
}
