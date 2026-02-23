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

			// Successful keepalive write proves connection is alive
			conn.Mu.Lock()
			conn.LastPongReceived = time.Now()
			conn.Mu.Unlock()
		}
	}
}

// monitorTokenExpiry monitors token expiry and refreshes INLINE via the WebSocket.
// Following the official Loxone LxCommunicator pattern: refresh at ~90% of remaining
// token lifespan by sending refreshjwt command through the existing connection.
// The response is handled by processMessage in readLoop — no disconnect/reconnect needed.
// Only falls back to full reconnect if async refresh fails or token is critically expired.
func (conn *WebSocketConnection) monitorTokenExpiry(db *sql.DB) {
	defer conn.GoroutinesWg.Done()

	log.Printf("[TOKEN] MONITOR STARTED for %s (async refresh, no disconnect)", conn.Host)

	// Check every 60 seconds (more frequent than before to catch refresh responses)
	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()

	consecutiveRefreshFails := 0

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
			refreshPending := conn.TokenRefreshPending
			refreshSentAt := conn.TokenRefreshSentAt
			token := conn.Token
			conn.Mu.Unlock()

			if !isConnected {
				continue
			}

			// Skip during collection to avoid interfering with billing data
			if collectionInProgress {
				continue
			}

			// Check if a pending refresh timed out (no response in 30 seconds)
			if refreshPending && time.Since(refreshSentAt) > 30*time.Second {
				log.Printf("[TOKEN] [%s] Async refresh timed out (sent %.0fs ago), clearing pending flag",
					conn.Host, time.Since(refreshSentAt).Seconds())
				conn.Mu.Lock()
				conn.TokenRefreshPending = false
				conn.Mu.Unlock()
				refreshPending = false // Update local var so we can proceed below
				consecutiveRefreshFails++
			}

			// Don't send another refresh while one is pending
			if refreshPending {
				continue
			}

			timeUntilExpiry := time.Until(tokenExpiry)
			tokenLifetime := tokenExpiry.Sub(conn.LastSuccessfulAuth)

			// CRITICAL: Token already expired — must do full reconnect
			if !tokenValid || timeUntilExpiry <= 0 {
				log.Printf("[TOKEN] [%s] Token EXPIRED, triggering full reconnect", conn.Host)
				conn.logToDatabase("Loxone Token Expired",
					fmt.Sprintf("Host '%s' token expired, full reconnect required", conn.Host))
				conn.triggerReconnect(db, "Token expired")
				return
			}

			// Calculate refresh threshold:
			// Per Loxone official library: refresh at 90% of token lifetime elapsed.
			// Example: 24h token → refresh after 21.6h (2.4h before expiry)
			// Minimum: refresh at least 5 minutes before expiry
			refreshThreshold := time.Duration(float64(tokenLifetime) * 0.1) // 10% of lifetime remaining
			if refreshThreshold < 5*time.Minute {
				refreshThreshold = 5 * time.Minute
			}

			needsRefresh := timeUntilExpiry <= refreshThreshold

			// Log token health periodically
			if timeUntilExpiry.Hours() < 1 {
				log.Printf("[TOKEN] [%s] Token valid for %.1f min (refresh at %.1f min)",
					conn.Host, timeUntilExpiry.Minutes(), refreshThreshold.Minutes())
			}

			if !needsRefresh {
				consecutiveRefreshFails = 0
				continue
			}

			// If async refresh already failed multiple times, fall back to reconnect
			if consecutiveRefreshFails >= 3 {
				log.Printf("[TOKEN] [%s] %d consecutive refresh failures, falling back to full reconnect",
					conn.Host, consecutiveRefreshFails)
				conn.logToDatabase("Loxone Token Refresh Failed",
					fmt.Sprintf("Host '%s': %d consecutive refresh failures, reconnecting",
						conn.Host, consecutiveRefreshFails))
				conn.triggerReconnect(db, "Token refresh failed repeatedly")
				return
			}

			// CRITICAL SAFETY: If token expires in < 2 minutes and we haven't
			// successfully refreshed yet, do a full reconnect as last resort
			if timeUntilExpiry < 2*time.Minute && consecutiveRefreshFails > 0 {
				log.Printf("[TOKEN] [%s] Token expires in %.0fs with prior refresh failures, reconnecting",
					conn.Host, timeUntilExpiry.Seconds())
				conn.triggerReconnect(db, "Token critically low after refresh failure")
				return
			}

			// Send async token refresh command (response handled by processMessage in readLoop)
			log.Printf("[TOKEN] [%s] Sending async token refresh (%.1f min remaining, lifetime: %.1f hours)",
				conn.Host, timeUntilExpiry.Minutes(), tokenLifetime.Hours())

			refreshCmd := fmt.Sprintf("jdev/sys/refreshjwt/%s/%s", token, conn.Username)
			if err := conn.safeWriteMessage(websocket.TextMessage, []byte(refreshCmd)); err != nil {
				log.Printf("[TOKEN] [%s] Failed to send refresh command: %v", conn.Host, err)
				consecutiveRefreshFails++
				continue
			}

			conn.Mu.Lock()
			conn.TokenRefreshPending = true
			conn.TokenRefreshSentAt = time.Now()
			conn.Mu.Unlock()

			conn.logToDatabase("Loxone Token Refresh Sent",
				fmt.Sprintf("Host '%s': async refresh sent (%.1f min remaining)",
					conn.Host, timeUntilExpiry.Minutes()))
		}
	}
}

// triggerReconnect cleanly disconnects and lets readLoop's defer trigger reconnection
func (conn *WebSocketConnection) triggerReconnect(db *sql.DB, reason string) {
	conn.Mu.Lock()
	conn.IsConnected = false
	conn.TokenValid = false
	conn.LastError = reason
	if conn.Ws != nil {
		conn.Ws.Close()
	}
	conn.Mu.Unlock()

	conn.updateDeviceStatus(db, fmt.Sprintf("[RECONNECT] %s", reason))
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
// within 150 seconds. Uses multiple liveness signals (pong, successful writes, collection
// activity) to avoid false positives during long collection windows.
func (conn *WebSocketConnection) monitorWebSocketPing() {
	defer conn.GoroutinesWg.Done()

	log.Printf("[PING] MONITOR STARTED for %s (interval: 30s, timeout: 150s)", conn.Host)

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
				continue
			}

			// Skip entirely during collection — both sending and checking.
			// Collection involves many writes/reads which prove liveness,
			// and LastPongReceived is reset at collection start/end.
			if conn.CollectionInProgress {
				conn.Mu.Unlock()
				continue
			}

			lastPong := conn.LastPongReceived
			lastWrite := conn.LastSuccessfulWrite
			conn.Mu.Unlock()

			// Check connection liveness using multiple signals:
			// 1. Last pong received (WebSocket-level proof)
			// 2. Last successful write (application-level proof)
			// Use the most recent of either as the liveness indicator.
			lastAlive := lastPong
			if lastWrite.After(lastAlive) {
				lastAlive = lastWrite
			}

			if !lastAlive.IsZero() && time.Since(lastAlive) > 150*time.Second {
				log.Printf("[PING] [%s] No liveness signal in %.0fs (last pong: %.0fs ago, last write: %.0fs ago), connection likely dead",
					conn.Host, time.Since(lastAlive).Seconds(),
					time.Since(lastPong).Seconds(), time.Since(lastWrite).Seconds())

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
