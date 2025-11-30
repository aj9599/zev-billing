package loxone

import (
	"database/sql"
	"fmt"
	"log"
	"time"

	"github.com/gorilla/websocket"
)

// keepalive sends periodic keepalive messages to prevent connection timeout
func (conn *WebSocketConnection) keepalive() {
	defer conn.GoroutinesWg.Done()

	log.Printf("💓 KEEPALIVE STARTED for %s (interval: 4 minutes)", conn.Host)

	ticker := time.NewTicker(4 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-conn.StopChan:
			log.Printf("🗑️ [%s] Keepalive stopping", conn.Host)
			return
		case <-ticker.C:
			conn.Mu.Lock()
			if !conn.IsConnected || conn.Ws == nil {
				log.Printf("⚠️  [%s] Not connected, keepalive stopping", conn.Host)
				conn.Mu.Unlock()
				return
			}

			// Skip keepalive if collection is in progress
			if conn.CollectionInProgress {
				log.Printf("⏳ [%s] Collection in progress, skipping keepalive", conn.Host)
				conn.Mu.Unlock()
				continue
			}
			conn.Mu.Unlock()

			keepaliveCmd := "keepalive"
			log.Printf("💓 [%s] Sending keepalive...", conn.Host)

			if err := conn.safeWriteMessage(websocket.TextMessage, []byte(keepaliveCmd)); err != nil {
				log.Printf("❌ [%s] Failed to send keepalive: %v", conn.Host, err)
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

			log.Printf("✔️ [%s] Keepalive sent successfully", conn.Host)
		}
	}
}

// monitorTokenExpiry monitors token expiry and refreshes as needed
func (conn *WebSocketConnection) monitorTokenExpiry(db *sql.DB) {
	defer conn.GoroutinesWg.Done()

	log.Printf("🔑 TOKEN MONITOR STARTED for %s (collection-window aware)", conn.Host)

	// Check every 3 minutes
	ticker := time.NewTicker(3 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-conn.StopChan:
			log.Printf("🗑️ [%s] Token monitor stopping", conn.Host)
			return
		case <-ticker.C:
			conn.Mu.Lock()
			isConnected := conn.IsConnected
			tokenValid := conn.TokenValid
			tokenExpiry := conn.TokenExpiry
			collectionInProgress := conn.CollectionInProgress
			conn.Mu.Unlock()

			if !isConnected {
				log.Printf("⚠️  [%s] Not connected, token monitor stopping", conn.Host)
				return
			}

			// Skip token operations during collection
			if collectionInProgress {
				log.Printf("⏳ [%s] Collection in progress, skipping token check", conn.Host)
				continue
			}

			// Skip if we're within 2 minutes of a collection window (:00, :15, :30, :45)
			minute := time.Now().Minute()
			nearCollection := (minute >= 58 || minute <= 2) ||
				(minute >= 13 && minute <= 17) ||
				(minute >= 28 && minute <= 32) ||
				(minute >= 43 && minute <= 47)
			if nearCollection {
				log.Printf("⏳ [%s] Near collection window (minute=%d), deferring token check", conn.Host, minute)
				continue
			}

			// Check token with 2-minute safety margin
			if !tokenValid || time.Now().After(tokenExpiry.Add(-2*time.Minute)) {
				timeUntilExpiry := time.Until(tokenExpiry)
				log.Printf("⚠️  [%s] Token invalid or expiring soon (%.1f min), refreshing...",
					conn.Host, timeUntilExpiry.Minutes())

				conn.logToDatabase("Loxone Token Expiring",
					fmt.Sprintf("Host '%s' token expiring, refreshing...", conn.Host))

				if err := conn.ensureAuth(); err != nil {
					log.Printf("❌ [%s] Failed to ensure auth: %v", conn.Host, err)
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

					conn.updateDeviceStatus(db, "🔄 Auth failed, reconnecting...")

					if !isShuttingDown {
						log.Printf("🔄 [%s] Triggering automatic reconnect", conn.Host)
						go conn.ConnectWithBackoff(db, conn.Collector)
					}
					return
				}

				conn.updateDeviceStatus(db,
					fmt.Sprintf("🟢 Token refreshed at %s", time.Now().Format("2006-01-02 15:04:05")))
			} else {
				timeUntilExpiry := time.Until(tokenExpiry)
				log.Printf("✔️ [%s] Token valid for %.1f hours", conn.Host, timeUntilExpiry.Hours())
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

	log.Printf("🌍 DNS MONITOR STARTED for %s (check every 5 minutes)", conn.MacAddress)

	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-conn.StopChan:
			log.Printf("🗑️ [%s] DNS monitor stopping", conn.Host)
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
				log.Printf("⚠️ [%s] DNS re-check failed: %v", conn.MacAddress, err)
				continue
			}

			// If host has changed, trigger reconnection
			if newHost != currentResolvedHost {
				log.Printf("🔄 [%s] DNS CHANGED DETECTED: %s → %s",
					conn.MacAddress, currentResolvedHost, newHost)
				log.Printf("   Triggering proactive reconnection...")

				conn.logToDatabase("Loxone DNS Changed Detected",
					fmt.Sprintf("MAC %s: Proactive reconnect due to DNS change", conn.MacAddress))

				// Close current connection and trigger reconnect
				conn.Mu.Lock()
				if conn.Ws != nil {
					conn.Ws.Close()
				}
				conn.IsConnected = false
				conn.Mu.Unlock()

				go conn.ConnectWithBackoff(conn.Db, conn.Collector)
				return
			}

			log.Printf("✅ [%s] DNS unchanged: %s", conn.MacAddress, currentResolvedHost)
		}
	}
}