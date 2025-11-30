package loxone

import (
	"database/sql"
	"encoding/binary"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/gorilla/websocket"
)

// safeWriteMessage writes a message to WebSocket with mutex protection
func (conn *WebSocketConnection) safeWriteMessage(messageType int, data []byte) error {
	conn.WriteMu.Lock()
	defer conn.WriteMu.Unlock()

	conn.Mu.Lock()
	ws := conn.Ws
	conn.Mu.Unlock()

	if ws == nil {
		return fmt.Errorf("not connected")
	}

	return ws.WriteMessage(messageType, data)
}

// readLoxoneMessage reads and parses a Loxone message
func (conn *WebSocketConnection) readLoxoneMessage() (messageType byte, jsonData []byte, err error) {
	wsMessageType, message, err := conn.Ws.ReadMessage()
	if err != nil {
		return 0, nil, fmt.Errorf("failed to read message: %v", err)
	}

	if wsMessageType == websocket.BinaryMessage && len(message) >= 8 {
		headerType := message[0]
		headerInfo := message[1]
		payloadLength := binary.LittleEndian.Uint32(message[4:8])

		log.Printf("   📦 Binary header: Type=0x%02X (Info=0x%02X), PayloadLen=%d", headerType, headerInfo, payloadLength)

		// Handle keepalive response (identifier 6) - header only, no payload
		if headerType == LoxoneMsgTypeKeepalive {
			log.Printf("   💓 Keepalive response received (header-only message)")
			return headerType, nil, nil
		}

		// Handle out-of-service indicator (identifier 5) - header only
		if headerType == LoxoneMsgTypeOutOfService {
			log.Printf("   ⚠️  Out-of-service indicator received")
			return headerType, nil, nil
		}

		// Handle event table and daytimer events - these are binary data, not JSON
		if headerType == LoxoneMsgTypeEventTable || headerType == LoxoneMsgTypeDaytimerEvent || headerType == LoxoneMsgTypeWeather {
			log.Printf("   ℹ️  Binary event message (type %d) - ignoring", headerType)
			return headerType, nil, nil
		}

		// Handle text event (identifier 3) - has a JSON payload
		if headerType == LoxoneMsgTypeTextEvent {
			if payloadLength == 0 {
				log.Printf("   ℹ️  Text event with no payload (header-only)")
				return headerType, nil, nil
			}

			wsMessageType, message, err = conn.Ws.ReadMessage()
			if err != nil {
				return 0, nil, fmt.Errorf("failed to read JSON payload: %v", err)
			}
			log.Printf("   ↓ JSON payload received: %d bytes", len(message))

			if len(message) < 50 {
				log.Printf("   🔍 Hex dump: % X", message)
				log.Printf("   🔍 String: %q", string(message))
			}

			jsonData = ExtractJSON(message)
			if jsonData == nil {
				log.Printf("   ⚠️  Could not extract JSON from text event")
				log.Printf("   🔍 Raw message (first 200 bytes): %q", string(message[:Min(len(message), 200)]))
				return headerType, nil, nil
			}
			return headerType, jsonData, nil
		}

		// Handle binary file (identifier 1)
		if headerType == LoxoneMsgTypeBinary {
			log.Printf("   ℹ️  Binary file message - ignoring")
			return headerType, nil, nil
		}

		log.Printf("   ⚠️  Unknown binary message type: 0x%02X", headerType)
		return headerType, nil, nil
	}

	// Handle text messages (no binary header)
	if wsMessageType == websocket.TextMessage {
		log.Printf("   ↓ Text message received: %d bytes", len(message))

		if len(message) < 50 {
			log.Printf("   🔍 Hex dump: % X", message)
			log.Printf("   🔍 String: %q", string(message))
		}

		jsonData = ExtractJSON(message)
		if jsonData == nil {
			log.Printf("   ⚠️  Could not extract JSON from text message")
			log.Printf("   🔍 Raw message: %q", string(message))
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

		log.Printf("📅 [%s] Next data request scheduled for %s (in %.0f seconds)",
			conn.Host, next.Format("15:04:05"), waitDuration.Seconds())

		select {
		case <-conn.StopChan:
			log.Printf("🗑️ [%s] Data request scheduler stopping", conn.Host)
			return
		case <-time.After(waitDuration):
			// Continue to data request
		}

		// Mark collection as in progress BEFORE any operations
		conn.Mu.Lock()
		conn.CollectionInProgress = true
		conn.Mu.Unlock()

		// Ensure auth before sending requests
		if err := conn.ensureAuth(); err != nil {
			log.Printf("❌ [%s] Auth check failed before data request: %v", conn.Host, err)
			log.Printf("   Skipping this collection cycle, will trigger reconnect")

			conn.Mu.Lock()
			conn.IsConnected = false
			conn.TokenValid = false
			conn.CollectionInProgress = false
			conn.Mu.Unlock()

			go conn.ConnectWithBackoff(conn.Db, nil)
			return
		}

		conn.Mu.Lock()
		if !conn.IsConnected || conn.Ws == nil {
			log.Printf("⚠️  [%s] Not connected after auth check, stopping scheduler", conn.Host)
			conn.CollectionInProgress = false
			conn.Mu.Unlock()
			return
		}

		devices := conn.Devices
		conn.Mu.Unlock()

		log.Println("────────────────────────────────────────────────────────────")
		log.Printf("📡 [%s] REQUESTING DATA FOR %d DEVICES", conn.Host, len(devices))
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
				log.Printf("   → METER [%s]: %s (mode: %s)", device.Name, device.DeviceID, device.LoxoneMode)

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
					log.Printf("   → CHARGER [%s]: single-block mode (session tracking)", device.Name)
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

		// Clear collection flag
		conn.Mu.Lock()
		conn.CollectionInProgress = false
		conn.Mu.Unlock()

		if requestFailed {
			log.Printf("   ❌ Data request failed, scheduler stopping")
			return
		}

		log.Printf("   ✔️ All data requests sent successfully")
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

		if conn.IsRemote {
			log.Printf("[INFO] [%s] Connection closed (possible port rotation)", conn.Host)
			conn.logToDatabase("Loxone Connection Closed",
				fmt.Sprintf("Host '%s' disconnected (checking for port change)", conn.Host))
		} else {
			log.Printf("[WARN] [%s] DISCONNECTED from Loxone", conn.Host)
			conn.logToDatabase("Loxone Disconnected",
				fmt.Sprintf("Host '%s' disconnected unexpectedly", conn.Host))
		}

		log.Printf("🔴 [%s] DISCONNECTED from Loxone", conn.Host)

		conn.updateDeviceStatus(db,
			fmt.Sprintf("🔴 Offline since %s", time.Now().Format("2006-01-02 15:04:05")))
		conn.logToDatabase("Loxone Disconnected", fmt.Sprintf("Host '%s' disconnected", conn.Host))

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
	readChan := make(chan readResult, 10)

	go func() {
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
				time.Sleep(10 * time.Millisecond)
			default:
				log.Printf("⚠️  [%s] Read channel full, dropping message", conn.Host)
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

		case result := <-readChan:
			if result.err != nil {
				if strings.Contains(result.err.Error(), "i/o timeout") ||
					strings.Contains(result.err.Error(), "deadline") {
					log.Printf("⏱️  [%s] Read timeout (expected between data requests)", conn.Host)
					continue
				}

				if strings.Contains(result.err.Error(), "websocket: close") {
					log.Printf("ℹ️  [%s] WebSocket closed normally", conn.Host)
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
				log.Printf("  ℹ️  [%s] Empty response received (likely keepalive ACK or status message)", conn.Host)
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
	if err := UnmarshalLoxoneLLData(&response.LL, jsonData); err != nil {
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