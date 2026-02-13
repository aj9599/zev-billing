package loxone

import (
	"database/sql"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/gorilla/websocket"
)

// safeWriteMessage writes a message to WebSocket with mutex protection and write deadline
func (conn *WebSocketConnection) safeWriteMessage(messageType int, data []byte) error {
	conn.WriteMu.Lock()
	defer conn.WriteMu.Unlock()

	conn.Mu.Lock()
	ws := conn.Ws
	conn.Mu.Unlock()

	if ws == nil {
		return fmt.Errorf("not connected")
	}

	// Set write deadline to detect dead connections faster instead of hanging
	ws.SetWriteDeadline(time.Now().Add(10 * time.Second))
	err := ws.WriteMessage(messageType, data)
	if err != nil {
		return err
	}

	// Track successful write as liveness signal
	conn.Mu.Lock()
	conn.LastSuccessfulWrite = time.Now()
	conn.Mu.Unlock()

	return nil
}

// readLoxoneMessage reads and parses a Loxone message
func (conn *WebSocketConnection) readLoxoneMessage() (messageType byte, jsonData []byte, err error) {
	wsMessageType, message, err := conn.Ws.ReadMessage()
	if err != nil {
		return 0, nil, fmt.Errorf("failed to read message: %v", err)
	}

	if wsMessageType == websocket.BinaryMessage && len(message) >= 8 {
		headerType := message[0]
		_ = message[1]
		payloadLength := binary.LittleEndian.Uint32(message[4:8])

		// Handle keepalive response (identifier 6) - header only, no payload
		if headerType == LoxoneMsgTypeKeepalive {
			return headerType, nil, nil
		}

		// Handle out-of-service indicator (identifier 5) - header only
		if headerType == LoxoneMsgTypeOutOfService {
			log.Printf("⚠️ [%s] Out-of-service indicator received from Miniserver", conn.Host)
			return headerType, nil, nil
		}

		// Handle event table and daytimer events - these are binary data, not JSON
		if headerType == LoxoneMsgTypeEventTable || headerType == LoxoneMsgTypeDaytimerEvent || headerType == LoxoneMsgTypeWeather {
			return headerType, nil, nil
		}

		// Handle text event (identifier 3) - has a JSON payload
		if headerType == LoxoneMsgTypeTextEvent {
			if payloadLength == 0 {
				return headerType, nil, nil
			}

			wsMessageType, message, err = conn.Ws.ReadMessage()
			if err != nil {
				return 0, nil, fmt.Errorf("failed to read JSON payload: %v", err)
			}

			jsonData = ExtractJSON(message)
			if jsonData == nil {
				log.Printf("⚠️ [%s] Could not extract JSON from text event (first 200 bytes): %q",
					conn.Host, string(message[:Min(len(message), 200)]))
				return headerType, nil, nil
			}
			return headerType, jsonData, nil
		}

		// Handle binary file (identifier 1)
		if headerType == LoxoneMsgTypeBinary {
			return headerType, nil, nil
		}

		return headerType, nil, nil
	}

	// Handle text messages (no binary header)
	if wsMessageType == websocket.TextMessage {
		jsonData = ExtractJSON(message)
		if jsonData == nil {
			log.Printf("⚠️ [%s] Could not extract JSON from text message: %q",
				conn.Host, string(message[:Min(len(message), 200)]))
			return LoxoneMsgTypeText, nil, nil
		}
		return LoxoneMsgTypeText, jsonData, nil
	}

	return 0, nil, fmt.Errorf("unexpected message type: %d", wsMessageType)
}

// requestData requests data from all devices at 15-minute intervals
func (conn *WebSocketConnection) requestData() {
	defer conn.GoroutinesWg.Done()

	log.Printf("⏰ DATA REQUEST SCHEDULER STARTED for %s", conn.Host)
	log.Printf("   Collection interval: 15 minutes (at :00, :15, :30, :45)")

	for {
		now := time.Now()
		next := GetNextQuarterHour(now)
		waitDuration := next.Sub(now)

		log.Printf("📃 [%s] Next data request scheduled for %s (in %.0f seconds)",
			conn.Host, next.Format("15:04:05"), waitDuration.Seconds())

		select {
		case <-conn.StopChan:
			log.Printf("🗑️ [%s] Data request scheduler stopping", conn.Host)
			return
		case <-time.After(waitDuration):
			// Continue to data request
		}

		// Mark collection as in progress BEFORE any operations.
		// Also ensure LivePollActive is false so responses are saved to DB.
		// Reset LastPongReceived to prevent ping monitor from declaring
		// the connection dead during a long collection window.
		conn.Mu.Lock()
		conn.CollectionInProgress = true
		conn.LivePollActive = false
		conn.LastPongReceived = time.Now()
		conn.Mu.Unlock()

		// FIX: Wait briefly for any in-flight live poll responses to be processed
		// before sending billing requests. This prevents live poll responses
		// from being mixed with billing responses.
		time.Sleep(2 * time.Second)

		// FIX: Check auth status without calling readLoxoneMessage.
		// Previously ensureAuth() would try to re-authenticate inline, which
		// called readLoxoneMessage() while the reader goroutine was also reading
		// from the same WebSocket - causing data corruption and crashes.
		// Now we just check if auth is still valid. If not, trigger a full
		// reconnect which authenticates BEFORE starting the reader goroutine.
		conn.Mu.Lock()
		if !conn.IsConnected || conn.Ws == nil {
			log.Printf("⚠️  [%s] Not connected, stopping scheduler for reconnect", conn.Host)
			conn.CollectionInProgress = false
			conn.Mu.Unlock()
			return
		}
		if !conn.TokenValid || time.Now().After(conn.TokenExpiry.Add(-30*time.Second)) {
			log.Printf("❌ [%s] Token expired or invalid before data request, triggering reconnect", conn.Host)
			conn.IsConnected = false
			conn.TokenValid = false
			conn.CollectionInProgress = false
			conn.LastError = "Token expired before billing collection"
			if conn.Ws != nil {
				conn.Ws.Close()
			}
			conn.Mu.Unlock()
			// readLoop's defer will trigger reconnect
			return
		}

		devices := conn.Devices
		conn.Mu.Unlock()

		log.Println("──────────────────────────────────────────────")
		log.Printf("📩 [%s] REQUESTING DATA FOR %d DEVICES", conn.Host, len(devices))
		log.Printf("   Time: %s", time.Now().Format("15:04:05"))

		requestFailed := false
		for _, device := range devices {
			select {
			case <-conn.StopChan:
				log.Printf("🗑️ [%s] Data request scheduler stopping during collection", conn.Host)
				conn.Mu.Lock()
				conn.CollectionInProgress = false
				conn.Mu.Unlock()
				return
			default:
			}

			if device.Type == "meter" {
				cmd := fmt.Sprintf("jdev/sps/io/%s/all", device.DeviceID)
				log.Printf("   ➡️ METER [%s]: %s (mode: %s)", device.Name, device.DeviceID, device.LoxoneMode)

				if err := conn.safeWriteMessage(websocket.TextMessage, []byte(cmd)); err != nil {
					log.Printf("❌ Failed to request data for meter %s: %v", device.Name, err)
					conn.Mu.Lock()
					conn.IsConnected = false
					conn.TokenValid = false
					conn.LastError = fmt.Sprintf("Data request failed: %v", err)
					conn.Mu.Unlock()
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
					// SINGLE-BLOCK MODE
					log.Printf("   ➡️ CHARGER [%s]: single-block mode (session tracking)", device.Name)
					log.Printf("      └─ Block UUID: %s", device.ChargerBlockUUID)

					cmd := fmt.Sprintf("jdev/sps/io/%s/all", device.ChargerBlockUUID)

					if err := conn.safeWriteMessage(websocket.TextMessage, []byte(cmd)); err != nil {
						log.Printf("❌ Failed to request data for charger %s: %v", device.Name, err)
						conn.Mu.Lock()
						conn.IsConnected = false
						conn.TokenValid = false
						conn.LastError = fmt.Sprintf("Data request failed: %v", err)
						conn.Mu.Unlock()
						conn.logToDatabase("Loxone Data Request Failed",
							fmt.Sprintf("Charger '%s': %v", device.Name, err))
						requestFailed = true
						break
					}
					time.Sleep(100 * time.Millisecond)
				} else {
					// MULTI-UUID MODE
					log.Printf("   ➡️ CHARGER [%s]: requesting 4 UUIDs", device.Name)

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
							conn.Mu.Lock()
							conn.IsConnected = false
							conn.TokenValid = false
							conn.LastError = fmt.Sprintf("Data request failed: %v", err)
							conn.Mu.Unlock()
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

		// Clear collection flag and reset pong timer (collection proves connection is alive)
		conn.Mu.Lock()
		conn.CollectionInProgress = false
		conn.LastPongReceived = time.Now()
		conn.Mu.Unlock()

		if requestFailed {
			log.Printf("   ❌ Data request failed, scheduler stopping")
			return
		}

		log.Printf("   ✔️ All data requests sent successfully")
	}
}

// requestLivePower polls ALL meters frequently for live dashboard display
// This runs every 30 seconds and requests data for ALL meters (not just meter_block)
// For meter_block mode: uses Pf (output0) for direct live power
// For other modes: calculates power from energy delta between polls
// Data is NOT saved to database here - only at :00, :15, :30, :45 by requestData()
func (conn *WebSocketConnection) requestLivePower() {
	defer conn.GoroutinesWg.Done()

	log.Printf("⚡ LIVE POWER POLLING STARTED for %s (every 30 seconds)", conn.Host)

	// Wait a bit for initial connection to stabilize
	time.Sleep(5 * time.Second)

	// Log which meters will be polled
	conn.Mu.Lock()
	var meterBlockCount, otherModeCount int
	for _, device := range conn.Devices {
		if device.Type == "meter" {
			if device.LoxoneMode == "meter_block" {
				meterBlockCount++
				log.Printf("⚡ [%s] Meter '%s' (ID:%d) mode=%s - will use Pf for live power", conn.Host, device.Name, device.ID, device.LoxoneMode)
			} else {
				otherModeCount++
				log.Printf("⚡ [%s] Meter '%s' (ID:%d) mode=%s - will calculate power from energy delta", conn.Host, device.Name, device.ID, device.LoxoneMode)
			}
		}
	}
	conn.Mu.Unlock()
	log.Printf("⚡ [%s] Live power polling: %d meters with Pf support, %d meters using energy delta calculation", conn.Host, meterBlockCount, otherModeCount)

	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	pollCount := 0
	consecutiveFailures := 0
	maxConsecutiveFailures := 3

	for {
		select {
		case <-conn.StopChan:
			log.Printf("🗑️ [%s] Live power polling stopping", conn.Host)
			return
		case <-ticker.C:
			// Skip if not connected or collection is in progress (to avoid conflicts with 15-min billing cycle)
			conn.Mu.Lock()
			isConnected := conn.IsConnected
			hasWs := conn.Ws != nil
			collectionInProgress := conn.CollectionInProgress

			if !isConnected || !hasWs {
				conn.Mu.Unlock()
				// FIX: Don't exit - just wait. The connection may come back.
				// Previously this would exit permanently, killing live polling forever.
				pollCount++
				continue
			}

			if collectionInProgress {
				conn.Mu.Unlock()
				pollCount++
				continue
			}

			// Also skip near collection windows (±1 minute around :00, :15, :30, :45)
			// to avoid overwhelming the Miniserver during billing data collection
			minute := time.Now().Minute() % 15
			if minute == 14 || minute == 0 || minute == 1 {
				conn.Mu.Unlock()
				pollCount++
				continue
			}

			// Get ALL meters for live power polling
			var meters []*Device
			for _, device := range conn.Devices {
				if device.Type == "meter" {
					meters = append(meters, device)
				}
			}
			conn.Mu.Unlock()

			if len(meters) == 0 {
				pollCount++
				continue
			}

			// FIX: Set LivePollActive flag BEFORE sending requests.
			// This tells processMessage to update live power data in memory
			// but NOT write to the database. Only the 15-min billing cycle writes to DB.
			conn.Mu.Lock()
			conn.LivePollActive = true
			conn.Mu.Unlock()

			// Request data for each meter
			sentCount := 0
			writeFailed := false
			for _, device := range meters {
				select {
				case <-conn.StopChan:
					conn.Mu.Lock()
					conn.LivePollActive = false
					conn.Mu.Unlock()
					return
				default:
				}

				cmd := fmt.Sprintf("jdev/sps/io/%s/all", device.DeviceID)

				if err := conn.safeWriteMessage(websocket.TextMessage, []byte(cmd)); err != nil {
					log.Printf("⚠️ Live power request failed for meter %s: %v", device.Name, err)
					writeFailed = true
					break
				}
				sentCount++

				// For virtual_output_dual mode, also request the export device
				if device.LoxoneMode == "virtual_output_dual" && device.ExportDeviceID != "" {
					cmdExport := fmt.Sprintf("jdev/sps/io/%s/all", device.ExportDeviceID)
					if err := conn.safeWriteMessage(websocket.TextMessage, []byte(cmdExport)); err != nil {
						log.Printf("⚠️ Live power export request failed for meter %s: %v", device.Name, err)
						writeFailed = true
						break
					}
				}

				// Delay between requests to not overwhelm the Miniserver
				time.Sleep(200 * time.Millisecond)
			}

			// FIX: Clear LivePollActive after a delay to allow responses to arrive.
			// The Miniserver takes time to respond; we keep the flag active for a few seconds.
			go func() {
				time.Sleep(10 * time.Second)
				conn.Mu.Lock()
				conn.LivePollActive = false
				conn.Mu.Unlock()
			}()

			if writeFailed {
				consecutiveFailures++
				log.Printf("⚠️ [%s] Live power poll write failure (%d/%d consecutive)",
					conn.Host, consecutiveFailures, maxConsecutiveFailures)

				if consecutiveFailures >= maxConsecutiveFailures {
					// FIX: Instead of just exiting silently, trigger a reconnect
					// so the entire connection is rebuilt and all goroutines restart.
					log.Printf("❌ [%s] Live power polling: %d consecutive write failures, triggering reconnect",
						conn.Host, consecutiveFailures)

					conn.Mu.Lock()
					conn.IsConnected = false
					conn.TokenValid = false
					conn.LastError = "Live power polling: repeated write failures"
					if conn.Ws != nil {
						conn.Ws.Close()
					}
					conn.Mu.Unlock()

					// Don't call ConnectWithBackoff here - readLoop's defer will handle it
					return
				}
				continue
			}

			consecutiveFailures = 0
			pollCount++

			// Successful writes prove the connection is alive — reset pong timer
			conn.Mu.Lock()
			conn.LastPongReceived = time.Now()
			conn.Mu.Unlock()

			// Log every poll for first 4, then every 5 minutes
			if pollCount <= 4 || pollCount%10 == 0 {
				log.Printf("⚡ [%s] Live power poll #%d: sent requests for %d meters", conn.Host, pollCount, sentCount)
			}
		}
	}
}

// readLoop continuously reads messages from the WebSocket
func (conn *WebSocketConnection) readLoop(db *sql.DB, collector LoxoneCollectorInterface) {
	defer conn.GoroutinesWg.Done()

	defer func() {
		conn.Mu.Lock()
		if conn.Ws != nil {
			conn.Ws.Close()
		}
		conn.IsConnected = false
		conn.TokenValid = false

		conn.LastDisconnectTime = time.Now()
		conn.LastDisconnectReason = "read_error"

		isShuttingDown := conn.IsShuttingDown
		conn.Mu.Unlock()

		// Single log entry per disconnect (was previously logging 2-3 times)
		if conn.IsRemote {
			log.Printf("[INFO] [%s] Connection closed (possible port rotation)", conn.Host)
			conn.logToDatabase("Loxone Disconnected",
				fmt.Sprintf("Host '%s' disconnected (remote, checking for port change)", conn.Host))
		} else {
			log.Printf("[WARN] [%s] DISCONNECTED from Loxone", conn.Host)
			conn.logToDatabase("Loxone Disconnected",
				fmt.Sprintf("Host '%s' disconnected unexpectedly", conn.Host))
		}

		conn.updateDeviceStatus(db,
			fmt.Sprintf("[OFFLINE] Since %s", time.Now().Format("2006-01-02 15:04:05")))

		if !isShuttingDown {
			log.Printf("Triggering automatic reconnect for %s", conn.Host)
			go conn.ConnectWithBackoff(db, collector)
		} else {
			log.Printf("Not reconnecting %s - connection is shutting down", conn.Host)
		}
	}()

	log.Printf("👂 [%s] DATA LISTENER ACTIVE - waiting for messages...", conn.Host)

	messageCount := 0
	chargerData := make(map[int]*ChargerDataCollection)

	type readResult struct {
		msgType  byte
		jsonData []byte
		err      error
	}
	// FIX: Increased buffer from 10 to 100 to handle 30-second live polling load
	// without dropping messages. With multiple meters + dual exports + keepalives,
	// 10 was far too small and caused silent message drops.
	readChan := make(chan readResult, 100)

	// FIX: Use a done channel so readLoop detects when the reader goroutine dies.
	// Previously, if the reader goroutine exited (e.g. due to a transient error),
	// readLoop would block forever on readChan - a zombie connection.
	readerDone := make(chan struct{})

	go func() {
		defer close(readerDone)
		for {
			conn.Mu.Lock()
			ws := conn.Ws
			isConnected := conn.IsConnected
			conn.Mu.Unlock()

			if ws == nil || !isConnected {
				return
			}

			conn.Mu.Lock()
			if conn.Ws != nil {
				conn.Ws.SetReadDeadline(time.Now().Add(20 * time.Minute))
			}
			conn.Mu.Unlock()

			msgType, jsonData, err := conn.readLoxoneMessage()

			select {
			case readChan <- readResult{msgType, jsonData, err}:
			case <-conn.StopChan:
				return
			}

			if err != nil {
				return
			}
		}
	}()

	for {
		select {
		case <-conn.StopChan:
			log.Printf("🗑️ [%s] Received stop signal, closing listener", conn.Host)
			return

		case <-readerDone:
			// FIX: Reader goroutine died - drain any remaining messages then exit
			// to trigger reconnect via the defer above.
			for {
				select {
				case result := <-readChan:
					if result.err != nil {
						if !strings.Contains(result.err.Error(), "i/o timeout") &&
							!strings.Contains(result.err.Error(), "deadline") {
							log.Printf("❌ [%s] Read error (from reader): %v", conn.Host, result.err)
							conn.Mu.Lock()
							conn.LastError = fmt.Sprintf("Read error: %v", result.err)
							conn.Mu.Unlock()
							conn.logToDatabase("Loxone Read Error",
								fmt.Sprintf("Host '%s': %v", conn.Host, result.err))
						}
						return
					}
					if result.jsonData != nil {
						conn.processMessage(result.jsonData, chargerData, db, collector)
					}
				default:
					log.Printf("⚠️ [%s] Reader goroutine exited unexpectedly, triggering reconnect", conn.Host)
					return
				}
			}

		case result := <-readChan:
			if result.err != nil {
				if strings.Contains(result.err.Error(), "i/o timeout") ||
					strings.Contains(result.err.Error(), "deadline") {
					log.Printf("⏱️ [%s] Read timeout (expected between data requests)", conn.Host)
					continue
				}

				if strings.Contains(result.err.Error(), "websocket: close") {
					log.Printf("ℹ️ [%s] WebSocket closed normally", conn.Host)
				} else {
					log.Printf("❌ [%s] Read error: %v", conn.Host, result.err)
					conn.Mu.Lock()
					conn.LastError = fmt.Sprintf("Read error: %v", result.err)
					conn.Mu.Unlock()
					conn.logToDatabase("Loxone Read Error",
						fmt.Sprintf("Host '%s': %v", conn.Host, result.err))
				}
				return
			}

			if result.jsonData == nil {
				continue
			}

			messageCount++
			conn.processMessage(result.jsonData, chargerData, db, collector)
		}
	}
}

// processMessage processes incoming JSON messages and routes them to appropriate handlers
func (conn *WebSocketConnection) processMessage(jsonData []byte, chargerData map[int]*ChargerDataCollection, db *sql.DB, collector LoxoneCollectorInterface) {
	var response LoxoneResponse
	if err := json.Unmarshal(jsonData, &response); err != nil {
		log.Printf("⚠️  [%s] Failed to parse JSON response: %v", conn.Host, err)
		log.Printf("⚠️  Raw JSON (first 500 chars): %s", string(jsonData[:Min(len(jsonData), 500)]))
		return
	}

	// Check for auth/permission errors in response
	if response.LL.Code == "401" || response.LL.Code == "403" {
		log.Printf("🔒 [%s] Auth error detected in response (code: %s)", conn.Host, response.LL.Code)

		conn.Mu.Lock()
		conn.TokenValid = false
		conn.ConsecutiveAuthFails++
		conn.TotalAuthFailures++
		conn.Mu.Unlock()

		conn.logToDatabase("Loxone Auth Error",
			fmt.Sprintf("Host '%s' received auth error code %s - triggering reconnect",
				conn.Host, response.LL.Code))

		// Trigger reconnect
		return
	}

	conn.Mu.Lock()
	devices := conn.Devices
	conn.Mu.Unlock()

	for _, device := range devices {
		if device.Type == "meter" {
			// Check for import reading (main device ID)
			expectedControl := fmt.Sprintf("dev/sps/io/%s/all", device.DeviceID)
			if strings.Contains(response.LL.Control, expectedControl) {
				conn.processMeterData(device, response, db, false)
				break
			}

			// Check for export reading (export device ID for virtual_output_dual mode only)
			if device.LoxoneMode == "virtual_output_dual" && device.ExportDeviceID != "" {
				expectedExportControl := fmt.Sprintf("dev/sps/io/%s/all", device.ExportDeviceID)
				if strings.Contains(response.LL.Control, expectedExportControl) {
					conn.processMeterData(device, response, db, true)
					break
				}
			}
		} else if device.Type == "charger" {
			if device.ChargerBlockUUID != "" {
				// SINGLE-BLOCK MODE
				expectedControl := fmt.Sprintf("dev/sps/io/%s/all", device.ChargerBlockUUID)
				if strings.Contains(response.LL.Control, expectedControl) {
					log.Printf("   🎯 [%s] Matched single-block UUID: %s", device.Name, device.ChargerBlockUUID)
					conn.processChargerSingleBlock(device, response, db, collector)
					break
				}
			} else {
				// MULTI-UUID MODE
				uuidMap := map[string]string{
					device.PowerUUID:  "power",
					device.StateUUID:  "state",
					device.UserIDUUID: "user_id",
					device.ModeUUID:   "mode",
				}

				for uuid, fieldName := range uuidMap {
					expectedControl := fmt.Sprintf("dev/sps/io/%s/all", uuid)
					if strings.Contains(response.LL.Control, expectedControl) {
						log.Printf("   🎯 [%s] Matched UUID for field '%s': %s", device.Name, fieldName, uuid)

						if chargerData[device.ID] == nil {
							chargerData[device.ID] = &ChargerDataCollection{}
							log.Printf("   📋 [%s] Created new data collection for charger", device.Name)
						}

						conn.processChargerField(device, response, fieldName, chargerData[device.ID], db)
						break
					}
				}
			}
		}
	}
}

// UnmarshalLoxoneLLData is a helper to unmarshal LoxoneLLData
func UnmarshalLoxoneLLData(ld *LoxoneLLData, data []byte) error {
	return ld.UnmarshalJSON(data)
}