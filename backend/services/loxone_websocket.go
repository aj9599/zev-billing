package services

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/gorilla/websocket"
)

// ========== WEBSOCKET COMMUNICATION ==========

func (conn *LoxoneWebSocketConnection) safeWriteMessage(messageType int, data []byte) error {
	conn.writeMu.Lock()
	defer conn.writeMu.Unlock()

	conn.mu.Lock()
	ws := conn.ws
	conn.mu.Unlock()

	if ws == nil {
		return fmt.Errorf("not connected")
	}

	return ws.WriteMessage(messageType, data)
}

func (conn *LoxoneWebSocketConnection) readLoxoneMessage() (messageType byte, jsonData []byte, err error) {
	wsMessageType, message, err := conn.ws.ReadMessage()
	if err != nil {
		return 0, nil, fmt.Errorf("failed to read message: %v", err)
	}

	if wsMessageType == websocket.BinaryMessage && len(message) >= 8 {
		headerType := message[0]
		headerInfo := message[1]
		payloadLength := binary.LittleEndian.Uint32(message[4:8])

		log.Printf("   📦 Binary header: Type=0x%02X (Info=0x%02X), PayloadLen=%d", headerType, headerInfo, payloadLength)

		// Handle keepalive response
		if headerType == LoxoneMsgTypeKeepalive {
			log.Printf("   💚 Keepalive response received (header-only message)")
			return headerType, nil, nil
		}

		// Handle out-of-service indicator
		if headerType == LoxoneMsgTypeOutOfService {
			log.Printf("   ⚠️ Out-of-service indicator received")
			return headerType, nil, nil
		}

		// Handle event table and daytimer events
		if headerType == LoxoneMsgTypeEventTable || headerType == LoxoneMsgTypeDaytimerEvent || headerType == LoxoneMsgTypeWeather {
			log.Printf("   ℹ️ Binary event message (type %d) - ignoring", headerType)
			return headerType, nil, nil
		}

		// Handle text event
		if headerType == LoxoneMsgTypeTextEvent {
			if payloadLength == 0 {
				log.Printf("   ℹ️ Text event with no payload (header-only)")
				return headerType, nil, nil
			}

			wsMessageType, message, err = conn.ws.ReadMessage()
			if err != nil {
				return 0, nil, fmt.Errorf("failed to read JSON payload: %v", err)
			}
			log.Printf("   ↓ JSON payload received: %d bytes", len(message))

			if len(message) < 50 {
				log.Printf("   🔍 Hex dump: % X", message)
				log.Printf("   🔍 String: %q", string(message))
			}

			jsonData = conn.extractJSON(message)
			if jsonData == nil {
				log.Printf("   ⚠️ Could not extract JSON from text event")
				log.Printf("   🔍 Raw message (first 200 bytes): %q", string(message[:min(len(message), 200)]))
				return headerType, nil, nil
			}
			return headerType, jsonData, nil
		}

		// Handle binary file
		if headerType == LoxoneMsgTypeBinary {
			log.Printf("   ℹ️ Binary file message - ignoring")
			return headerType, nil, nil
		}

		log.Printf("   ⚠️ Unknown binary message type: 0x%02X", headerType)
		return headerType, nil, nil
	}

	// Handle text messages
	if wsMessageType == websocket.TextMessage {
		log.Printf("   ↓ Text message received: %d bytes", len(message))

		if len(message) < 50 {
			log.Printf("   🔍 Hex dump: % X", message)
			log.Printf("   🔍 String: %q", string(message))
		}

		jsonData = conn.extractJSON(message)
		if jsonData == nil {
			log.Printf("   ⚠️ Could not extract JSON from text message")
			log.Printf("   🔍 Raw message: %q", string(message))
			return LoxoneMsgTypeText, nil, nil
		}
		return LoxoneMsgTypeText, jsonData, nil
	}

	return 0, nil, fmt.Errorf("unexpected message type: %d", wsMessageType)
}

func (conn *LoxoneWebSocketConnection) extractJSON(message []byte) []byte {
	if len(message) == 0 {
		return nil
	}

	var testJSON map[string]interface{}
	if err := json.Unmarshal(message, &testJSON); err == nil {
		return message
	}

	if len(message) < 3 {
		log.Printf("   🔍 Message too short to be JSON (%d bytes)", len(message))
		return nil
	}

	if message[0] == '{' {
		depth := 0
		inString := false
		escape := false

		for i, b := range message {
			if escape {
				escape = false
				continue
			}

			if b == '\\' {
				escape = true
				continue
			}

			if b == '"' {
				inString = !inString
				continue
			}

			if !inString {
				if b == '{' {
					depth++
				} else if b == '}' {
					depth--
					if depth == 0 {
						candidate := message[:i+1]
						if json.Unmarshal(candidate, &testJSON) == nil {
							return candidate
						}
					}
				}
			}
		}

		if json.Unmarshal(message, &testJSON) == nil {
			return message
		}
	}

	for i := 0; i < len(message) && i < 100; i++ {
		if message[i] == '{' {
			depth := 0
			inString := false
			escape := false

			for j := i; j < len(message); j++ {
				b := message[j]

				if escape {
					escape = false
					continue
				}

				if b == '\\' {
					escape = true
					continue
				}

				if b == '"' {
					inString = !inString
					continue
				}

				if !inString {
					if b == '{' {
						depth++
					} else if b == '}' {
						depth--
						if depth == 0 {
							candidate := message[i : j+1]
							if json.Unmarshal(candidate, &testJSON) == nil {
								return candidate
							}
						}
					}
				}
			}
		}
	}

	log.Printf("   🔍 No valid JSON found in message")
	return nil
}

// ========== KEEPALIVE ==========

func (conn *LoxoneWebSocketConnection) keepalive() {
	defer conn.goroutinesWg.Done()

	log.Printf("💚 KEEPALIVE STARTED for %s (interval: 4 minutes)", conn.Host)

	ticker := time.NewTicker(4 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-conn.stopChan:
			log.Printf("🗑️ [%s] Keepalive stopping", conn.Host)
			return
		case <-ticker.C:
			conn.mu.Lock()
			if !conn.isConnected || conn.ws == nil {
				log.Printf("⚠️ [%s] Not connected, keepalive stopping", conn.Host)
				conn.mu.Unlock()
				return
			}

			if conn.collectionInProgress {
				log.Printf("⏳ [%s] Collection in progress, skipping keepalive", conn.Host)
				conn.mu.Unlock()
				continue
			}
			conn.mu.Unlock()

			keepaliveCmd := "keepalive"
			log.Printf("💚 [%s] Sending keepalive...", conn.Host)

			if err := conn.safeWriteMessage(websocket.TextMessage, []byte(keepaliveCmd)); err != nil {
				log.Printf("❌ [%s] Failed to send keepalive: %v", conn.Host, err)
				conn.mu.Lock()
				conn.isConnected = false
				conn.tokenValid = false
				conn.lastError = fmt.Sprintf("Keepalive failed: %v", err)
				conn.mu.Unlock()

				conn.logToDatabase("Loxone Keepalive Failed",
					fmt.Sprintf("Host '%s': %v - triggering reconnect", conn.Host, err))

				go conn.ConnectWithBackoff(conn.db)
				return
			}

			log.Printf("✅ [%s] Keepalive sent successfully", conn.Host)
		}
	}
}

// ========== READ LOOP ==========

func (conn *LoxoneWebSocketConnection) readLoop(db *sql.DB) {
	defer conn.goroutinesWg.Done()

	defer func() {
		conn.mu.Lock()
		if conn.ws != nil {
			conn.ws.Close()
		}
		conn.isConnected = false
		conn.tokenValid = false

		conn.lastDisconnectTime = time.Now()
		conn.lastDisconnectReason = "read_error"

		isShuttingDown := conn.isShuttingDown
		conn.mu.Unlock()

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
			go conn.ConnectWithBackoff(db)
		} else {
			log.Printf("Not reconnecting %s - connection is shutting down", conn.Host)
		}
	}()

	log.Printf("🕿 [%s] DATA LISTENER ACTIVE - waiting for messages...", conn.Host)

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
			conn.mu.Lock()
			ws := conn.ws
			isConnected := conn.isConnected
			conn.mu.Unlock()

			if ws == nil || !isConnected {
				return
			}

			conn.mu.Lock()
			if conn.ws != nil {
				conn.ws.SetReadDeadline(time.Now().Add(20 * time.Minute))
			}
			conn.mu.Unlock()

			msgType, jsonData, err := conn.readLoxoneMessage()

			select {
			case readChan <- readResult{msgType, jsonData, err}:
				time.Sleep(10 * time.Millisecond)
			default:
				log.Printf("⚠️ [%s] Read channel full, dropping message", conn.Host)
			}

			if err != nil {
				return
			}
		}
	}()

	for {
		select {
		case <-conn.stopChan:
			log.Printf("🗑️ [%s] Received stop signal, closing listener", conn.Host)
			return

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
					conn.mu.Lock()
					conn.lastError = fmt.Sprintf("Read error: %v", result.err)
					conn.mu.Unlock()
					conn.logToDatabase("Loxone Read Error",
						fmt.Sprintf("Host '%s': %v", conn.Host, result.err))
				}
				return
			}

			if result.jsonData == nil {
				log.Printf("  ℹ️ [%s] Empty response received (likely keepalive ACK or status message)", conn.Host)
				continue
			}

			messageCount++

			var response LoxoneResponse
			if err := json.Unmarshal(result.jsonData, &response); err != nil {
				log.Printf("⚠️ [%s] Failed to parse JSON response: %v", conn.Host, err)
				log.Printf("⚠️ Raw JSON (first 500 chars): %s", string(result.jsonData[:min(len(result.jsonData), 500)]))
				continue
			}

			if response.LL.Code == "401" || response.LL.Code == "403" {
				log.Printf("🔒 [%s] Auth error detected in response (code: %s)", conn.Host, response.LL.Code)

				conn.mu.Lock()
				conn.tokenValid = false
				conn.consecutiveAuthFails++
				conn.totalAuthFailures++
				conn.mu.Unlock()

				conn.logToDatabase("Loxone Auth Error",
					fmt.Sprintf("Host '%s' received auth error code %s - triggering reconnect",
						conn.Host, response.LL.Code))

				return
			}

			conn.mu.Lock()
			devices := conn.devices
			conn.mu.Unlock()

			for _, device := range devices {
				if device.Type == "meter" {
					expectedControl := fmt.Sprintf("dev/sps/io/%s/all", device.DeviceID)
					if strings.Contains(response.LL.Control, expectedControl) {
						conn.processMeterData(device, response, db, false)
						break
					}

					if device.LoxoneMode == "virtual_output_dual" && device.ExportDeviceID != "" {
						expectedExportControl := fmt.Sprintf("dev/sps/io/%s/all", device.ExportDeviceID)
						if strings.Contains(response.LL.Control, expectedExportControl) {
							conn.processMeterData(device, response, db, true)
							break
						}
					}
				} else if device.Type == "charger" {
					if device.ChargerBlockUUID != "" {
						expectedControl := fmt.Sprintf("dev/sps/io/%s/all", device.ChargerBlockUUID)
						if strings.Contains(response.LL.Control, expectedControl) {
							log.Printf("   🎯 [%s] Matched single-block UUID: %s", device.Name, device.ChargerBlockUUID)
							conn.processChargerSingleBlock(device, response, db)
							break
						}
					} else {
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
	}
}