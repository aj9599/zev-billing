package services

import (
	"database/sql"
	"fmt"
	"log"
	"time"

	"github.com/gorilla/websocket"
)

// ========== DATA REQUEST SCHEDULER ==========

func (conn *LoxoneWebSocketConnection) requestData() {
	defer conn.goroutinesWg.Done()

	log.Printf("⏰ DATA REQUEST SCHEDULER STARTED for %s", conn.Host)
	log.Printf("   Collection interval: 15 minutes (at :00, :15, :30, :45)")

	for {
		now := time.Now()
		next := getNextQuarterHour(now)
		waitDuration := next.Sub(now)

		log.Printf("📅 [%s] Next data request scheduled for %s (in %.0f seconds)",
			conn.Host, next.Format("15:04:05"), waitDuration.Seconds())

		select {
		case <-conn.stopChan:
			log.Printf("🗑️ [%s] Data request scheduler stopping", conn.Host)
			return
		case <-time.After(waitDuration):
		}

		conn.mu.Lock()
		conn.collectionInProgress = true
		conn.mu.Unlock()

		if err := conn.ensureAuth(); err != nil {
			log.Printf("❌ [%s] Auth check failed before data request: %v", conn.Host, err)
			log.Printf("   Skipping this collection cycle, will trigger reconnect")

			conn.mu.Lock()
			conn.isConnected = false
			conn.tokenValid = false
			conn.collectionInProgress = false
			conn.mu.Unlock()

			go conn.ConnectWithBackoff(conn.db)
			return
		}

		conn.mu.Lock()
		if !conn.isConnected || conn.ws == nil {
			log.Printf("⚠️ [%s] Not connected after auth check, stopping scheduler", conn.Host)
			conn.collectionInProgress = false
			conn.mu.Unlock()
			return
		}

		devices := conn.devices
		conn.mu.Unlock()

		log.Println("────────────────────────────────────────────────────────────────────")
		log.Printf("📊 [%s] REQUESTING DATA FOR %d DEVICES", conn.Host, len(devices))
		log.Printf("   Time: %s", time.Now().Format("15:04:05"))

		requestFailed := false
		for _, device := range devices {
			select {
			case <-conn.stopChan:
				log.Printf("🗑️ [%s] Data request scheduler stopping during collection", conn.Host)
				conn.mu.Lock()
				conn.collectionInProgress = false
				conn.mu.Unlock()
				return
			default:
			}

			if device.Type == "meter" {
				cmd := fmt.Sprintf("jdev/sps/io/%s/all", device.DeviceID)
				log.Printf("   → METER [%s]: %s (mode: %s)", device.Name, device.DeviceID, device.LoxoneMode)

				if err := conn.safeWriteMessage(websocket.TextMessage, []byte(cmd)); err != nil {
					log.Printf("❌ Failed to request data for meter %s: %v", device.Name, err)
					conn.mu.Lock()
					conn.isConnected = false
					conn.tokenValid = false
					conn.lastError = fmt.Sprintf("Data request failed: %v", err)
					conn.mu.Unlock()
					conn.logToDatabase("Loxone Data Request Failed",
						fmt.Sprintf("Meter '%s': %v", device.Name, err))
					requestFailed = true
					break
				}
				time.Sleep(100 * time.Millisecond)

				if device.LoxoneMode == "virtual_output_dual" && device.ExportDeviceID != "" {
					cmdExport := fmt.Sprintf("jdev/sps/io/%s/all", device.ExportDeviceID)
					log.Printf("      ├─ Export UUID: %s", device.ExportDeviceID)

					if err := conn.safeWriteMessage(websocket.TextMessage, []byte(cmdExport)); err != nil {
						log.Printf("❌ Failed to request export data for meter %s: %v", device.Name, err)
						requestFailed = true
						break
					}
					time.Sleep(100 * time.Millisecond)
				}
			} else if device.Type == "charger" {
				if device.ChargerBlockUUID != "" {
					log.Printf("   → CHARGER [%s]: single-block mode (session tracking)", device.Name)
					log.Printf("      └─ Block UUID: %s", device.ChargerBlockUUID)

					cmd := fmt.Sprintf("jdev/sps/io/%s/all", device.ChargerBlockUUID)

					if err := conn.safeWriteMessage(websocket.TextMessage, []byte(cmd)); err != nil {
						log.Printf("❌ Failed to request data for charger %s: %v", device.Name, err)
						conn.mu.Lock()
						conn.isConnected = false
						conn.tokenValid = false
						conn.lastError = fmt.Sprintf("Data request failed: %v", err)
						conn.mu.Unlock()
						conn.logToDatabase("Loxone Data Request Failed",
							fmt.Sprintf("Charger '%s': %v", device.Name, err))
						requestFailed = true
						break
					}
					time.Sleep(100 * time.Millisecond)
				} else {
					log.Printf("   → CHARGER [%s]: requesting 4 UUIDs", device.Name)

					uuids := []struct {
						name string
						uuid string
					}{
						{"power", device.PowerUUID},
						{"state", device.StateUUID},
						{"user_id", device.UserIDUUID},
						{"mode", device.ModeUUID},
					}

					for _, u := range uuids {
						cmd := fmt.Sprintf("jdev/sps/io/%s/all", u.uuid)
						log.Printf("      ├─ %s UUID: %s", u.name, u.uuid)

						if err := conn.safeWriteMessage(websocket.TextMessage, []byte(cmd)); err != nil {
							log.Printf("❌ Failed to request %s for charger %s: %v", u.name, device.Name, err)
							conn.mu.Lock()
							conn.isConnected = false
							conn.tokenValid = false
							conn.lastError = fmt.Sprintf("Data request failed: %v", err)
							conn.mu.Unlock()
							conn.logToDatabase("Loxone Data Request Failed",
								fmt.Sprintf("Charger '%s' %s: %v", device.Name, u.name, err))
							requestFailed = true
							break
						}
						time.Sleep(100 * time.Millisecond)
					}

					if requestFailed {
						break
					}
				}
			}
		}

		conn.mu.Lock()
		conn.collectionInProgress = false
		conn.mu.Unlock()

		if requestFailed {
			log.Printf("   ❌ Data request failed, scheduler stopping")
			return
		}

		log.Printf("   ✅ All data requests sent successfully")
	}
}

// ========== TOKEN EXPIRY MONITORING ==========

func (conn *LoxoneWebSocketConnection) monitorTokenExpiry(db *sql.DB) {
	defer conn.goroutinesWg.Done()

	log.Printf("🔒 TOKEN MONITOR STARTED for %s (collection-window aware)", conn.Host)

	ticker := time.NewTicker(3 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-conn.stopChan:
			log.Printf("🗑️ [%s] Token monitor stopping", conn.Host)
			return
		case <-ticker.C:
			conn.mu.Lock()
			isConnected := conn.isConnected
			tokenValid := conn.tokenValid
			tokenExpiry := conn.tokenExpiry
			collectionInProgress := conn.collectionInProgress
			conn.mu.Unlock()

			if !isConnected {
				log.Printf("⚠️ [%s] Not connected, token monitor stopping", conn.Host)
				return
			}

			if collectionInProgress {
				log.Printf("⏳ [%s] Collection in progress, skipping token check", conn.Host)
				continue
			}

			minute := time.Now().Minute()
			nearCollection := (minute >= 58 || minute <= 2) ||
				(minute >= 13 && minute <= 17) ||
				(minute >= 28 && minute <= 32) ||
				(minute >= 43 && minute <= 47)
			if nearCollection {
				log.Printf("⏳ [%s] Near collection window (minute=%d), deferring token check", conn.Host, minute)
				continue
			}

			if !tokenValid || time.Now().After(tokenExpiry.Add(-2*time.Minute)) {
				timeUntilExpiry := time.Until(tokenExpiry)
				log.Printf("⚠️ [%s] Token invalid or expiring soon (%.1f min), refreshing...",
					conn.Host, timeUntilExpiry.Minutes())

				conn.logToDatabase("Loxone Token Expiring",
					fmt.Sprintf("Host '%s' token expiring, refreshing...", conn.Host))

				if err := conn.ensureAuth(); err != nil {
					log.Printf("❌ [%s] Failed to ensure auth: %v", conn.Host, err)
					log.Printf("   Triggering full reconnect...")
					conn.logToDatabase("Loxone Auth Check Failed",
						fmt.Sprintf("Host '%s': %v - reconnecting", conn.Host, err))

					conn.mu.Lock()
					conn.isConnected = false
					conn.tokenValid = false
					if conn.ws != nil {
						conn.ws.Close()
					}
					isShuttingDown := conn.isShuttingDown
					conn.mu.Unlock()

					conn.updateDeviceStatus(db, "🔄 Auth failed, reconnecting...")

					if !isShuttingDown {
						log.Printf("🔄 [%s] Triggering automatic reconnect", conn.Host)
						go conn.ConnectWithBackoff(db)
					}
					return
				}

				conn.updateDeviceStatus(db,
					fmt.Sprintf("🟢 Token refreshed at %s", time.Now().Format("2006-01-02 15:04:05")))
			} else {
				timeUntilExpiry := time.Until(tokenExpiry)
				log.Printf("✅ [%s] Token valid for %.1f hours", conn.Host, timeUntilExpiry.Hours())
			}
		}
	}
}