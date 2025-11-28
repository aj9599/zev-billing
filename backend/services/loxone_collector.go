package services

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"time"
)

// ========== LOXONE COLLECTOR ==========

func NewLoxoneCollector(db *sql.DB) *LoxoneCollector {
	log.Println("ðŸ”§ LOXONE COLLECTOR: Initializing with real-time charger data writes")
	lc := &LoxoneCollector{
		db:              db,
		connections:     make(map[string]*LoxoneWebSocketConnection),
		liveChargerData: make(map[int]*LoxoneChargerLiveData),
		activeSessions:  make(map[int]*LoxoneActiveChargerSession),
	}
	log.Println("ðŸ”§ LOXONE COLLECTOR: Instance created successfully")
	return lc
}

func (lc *LoxoneCollector) Start() {
	localTZ := GetLocalTimezone()
	log.Println("===================================")
	log.Println("ðŸš€ LOXONE WEBSOCKET COLLECTOR STARTING")
	log.Printf("   Timezone: %s", localTZ.String())
	log.Println("   Features: Real-time charger data writes, Auth health checks, keepalive")
	log.Println("   Chargers: Database writes every 15 minutes + final reading after session")
	log.Println("===================================")

	lc.logToDatabase("Loxone Collector Started", "Real-time charger tracking enabled")

	lc.initializeConnections()

	log.Printf("âœ”ï¸ Loxone Collector initialized with %d WebSocket connections", len(lc.connections))
	lc.logToDatabase("Loxone Collector Ready", fmt.Sprintf("Initialized %d Loxone connections", len(lc.connections)))

	go lc.monitorConnections()

	log.Println("âœ”ï¸ Loxone connection monitor started")
	log.Println("===================================")
}

func (lc *LoxoneCollector) Stop() {
	log.Println("ðŸ—‘ï¸ STOPPING ALL LOXONE CONNECTIONS")
	lc.logToDatabase("Loxone Collector Stopping", "Closing all Loxone connections")

	lc.mu.Lock()
	connections := make([]*LoxoneWebSocketConnection, 0, len(lc.connections))
	for _, conn := range lc.connections {
		connections = append(connections, conn)
	}
	lc.mu.Unlock()

	for _, conn := range connections {
		log.Printf("Closing connection: %s", conn.Host)
		conn.Close()
	}

	lc.mu.Lock()
	lc.connections = make(map[string]*LoxoneWebSocketConnection)
	lc.mu.Unlock()

	log.Println("âœ”ï¸ All Loxone connections stopped")
	lc.logToDatabase("Loxone Collector Stopped", "All connections closed")
}

func (lc *LoxoneCollector) RestartConnections() {
	log.Println("=== RESTARTING LOXONE CONNECTIONS ===")
	lc.logToDatabase("Loxone Connections Restarting", "Reinitializing all Loxone connections")

	lc.Stop()

	log.Println("Waiting for all connections to fully close...")
	time.Sleep(2 * time.Second)

	lc.chargerMu.Lock()
	lc.liveChargerData = make(map[int]*LoxoneChargerLiveData)
	lc.activeSessions = make(map[int]*LoxoneActiveChargerSession)
	lc.chargerMu.Unlock()

	lc.initializeConnections()

	log.Println("=== LOXONE CONNECTIONS RESTARTED ===")
	lc.logToDatabase("Loxone Connections Restarted", fmt.Sprintf("Successfully restarted %d connections", len(lc.connections)))
}

func (lc *LoxoneCollector) monitorConnections() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	log.Println("ðŸ‘€ LOXONE CONNECTION MONITOR STARTED (enhanced with metrics)")

	for range ticker.C {
		lc.mu.RLock()
		disconnectedCount := 0
		connectedCount := 0
		totalDevices := 0
		totalAuthFailures := 0
		totalReconnects := 0

		log.Println("â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€")
		log.Println("ðŸ” LOXONE CONNECTION STATUS CHECK")

		for key, conn := range lc.connections {
			conn.mu.Lock()
			isConnected := conn.isConnected
			tokenValid := conn.tokenValid
			tokenExpiry := conn.tokenExpiry
			lastError := conn.lastError
			deviceCount := len(conn.devices)
			authFails := conn.consecutiveAuthFails
			totalAuthFails := conn.totalAuthFailures
			totalReconn := conn.totalReconnects
			conn.mu.Unlock()

			totalDevices += deviceCount
			totalAuthFailures += totalAuthFails
			totalReconnects += totalReconn

			if !isConnected {
				disconnectedCount++
				log.Printf("ðŸ”´ Connection %s: DISCONNECTED (%d devices)", key, deviceCount)
				if lastError != "" {
					log.Printf("      Last error: %s", lastError)
				}
				if authFails > 0 {
					log.Printf("      âš ï¸ Consecutive auth failures: %d", authFails)
				}
			} else {
				connectedCount++
				log.Printf("   ðŸŸ¢ Connection %s: CONNECTED (%d devices)", key, deviceCount)
				if tokenValid && !tokenExpiry.IsZero() {
					timeUntilExpiry := time.Until(tokenExpiry)
					log.Printf("      Token expires in: %.1f hours", timeUntilExpiry.Hours())
				}
				if totalAuthFails > 0 {
					log.Printf("      ðŸ“Š Lifetime auth failures: %d", totalAuthFails)
				}
				if totalReconn > 0 {
					log.Printf("      ðŸ“Š Lifetime reconnects: %d", totalReconn)
				}
			}
		}
		lc.mu.RUnlock()

		lc.chargerMu.RLock()
		activeSessionCount := len(lc.activeSessions)
		lc.chargerMu.RUnlock()

		log.Printf("ðŸ“Š Summary: %d connected, %d disconnected, %d total devices",
			connectedCount, disconnectedCount, totalDevices)
		log.Printf("ðŸ“Š Charger Sessions: %d active", activeSessionCount)
		log.Printf("ðŸ“Š Metrics: %d total auth failures, %d total reconnects",
			totalAuthFailures, totalReconnects)
		log.Println("â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€")

		if disconnectedCount > 0 {
			lc.logToDatabase("Loxone Status Check",
				fmt.Sprintf("%d connected, %d disconnected (total failures: %d, reconnects: %d)",
					connectedCount, disconnectedCount, totalAuthFailures, totalReconnects))
		}
	}
}

// ========== PUBLIC API ==========

func (lc *LoxoneCollector) GetChargerLiveData(chargerID int) (*LoxoneChargerLiveData, bool) {
	lc.chargerMu.RLock()
	defer lc.chargerMu.RUnlock()

	data, exists := lc.liveChargerData[chargerID]
	if !exists || time.Since(data.Timestamp) > 60*time.Second {
		return nil, false
	}

	return data, true
}

func (lc *LoxoneCollector) GetActiveSession(chargerID int) (*LoxoneActiveChargerSession, bool) {
	lc.chargerMu.RLock()
	defer lc.chargerMu.RUnlock()

	session, exists := lc.activeSessions[chargerID]
	return session, exists
}

func (lc *LoxoneCollector) GetConnectionStatus() map[string]interface{} {
	lc.mu.RLock()
	defer lc.mu.RUnlock()

	meterStatus := make(map[int]map[string]interface{})
	chargerStatus := make(map[int]map[string]interface{})

	for _, conn := range lc.connections {
		conn.mu.Lock()
		for _, device := range conn.devices {
			lastUpdateStr := ""
			if !device.lastUpdate.IsZero() {
				lastUpdateStr = device.lastUpdate.Format("2006-01-02 15:04:05")
			}

			tokenExpiryStr := ""
			if !conn.tokenExpiry.IsZero() {
				tokenExpiryStr = conn.tokenExpiry.Format("2006-01-02 15:04:05")
			}

			lastSuccessfulAuthStr := ""
			if !conn.lastSuccessfulAuth.IsZero() {
				lastSuccessfulAuthStr = conn.lastSuccessfulAuth.Format("2006-01-02 15:04:05")
			}

			if device.Type == "meter" {
				meterStatus[device.ID] = map[string]interface{}{
					"device_id":              device.DeviceID,
					"meter_name":             device.Name,
					"host":                   conn.Host,
					"is_connected":           conn.isConnected,
					"token_valid":            conn.tokenValid,
					"token_expiry":           tokenExpiryStr,
					"last_reading":           device.lastReading,
					"last_reading_export":    device.lastReadingExport,
					"last_update":            lastUpdateStr,
					"reading_gaps":           device.readingGaps,
					"last_error":             conn.lastError,
					"consecutive_auth_fails": conn.consecutiveAuthFails,
					"total_auth_failures":    conn.totalAuthFailures,
					"total_reconnects":       conn.totalReconnects,
					"last_successful_auth":   lastSuccessfulAuthStr,
				}
			} else if device.Type == "charger" {
				lc.chargerMu.RLock()
				liveData := lc.liveChargerData[device.ID]
				activeSession := lc.activeSessions[device.ID]
				lc.chargerMu.RUnlock()

				status := map[string]interface{}{
					"power_uuid":             device.PowerUUID,
					"state_uuid":             device.StateUUID,
					"user_id_uuid":           device.UserIDUUID,
					"mode_uuid":              device.ModeUUID,
					"charger_block_uuid":     device.ChargerBlockUUID,
					"charger_name":           device.Name,
					"host":                   conn.Host,
					"is_connected":           conn.isConnected,
					"token_valid":            conn.tokenValid,
					"token_expiry":           tokenExpiryStr,
					"last_reading":           device.lastReading,
					"last_update":            lastUpdateStr,
					"reading_gaps":           device.readingGaps,
					"last_error":             conn.lastError,
					"consecutive_auth_fails": conn.consecutiveAuthFails,
					"total_auth_failures":    conn.totalAuthFailures,
					"total_reconnects":       conn.totalReconnects,
					"last_successful_auth":   lastSuccessfulAuthStr,
					"collection_mode":        "Real-time (15-min intervals + session end)",
				}

				if liveData != nil {
					status["live_data"] = map[string]interface{}{
						"vehicle_connected":  liveData.VehicleConnected,
						"charging_active":    liveData.ChargingActive,
						"current_power_kw":   liveData.CurrentPower_kW,
						"total_energy_kwh":   liveData.TotalEnergy_kWh,
						"session_energy_kwh": liveData.SessionEnergy_kWh,
						"mode":               liveData.Mode,
						"mode_description":   liveData.ModeDescription,
						"state":              liveData.State,
						"state_description":  liveData.StateDescription,
						"user_id":            liveData.UserID,
						"timestamp":          liveData.Timestamp.Format("2006-01-02 15:04:05"),
					}
				}

				if activeSession != nil {
					status["active_session"] = map[string]interface{}{
						"start_time":       activeSession.StartTime.Format("2006-01-02 15:04:05"),
						"start_energy_kwh": activeSession.StartEnergy_kWh,
						"user_id":          activeSession.UserID,
						"duration":         formatDuration(time.Since(activeSession.StartTime)),
						"last_write":       activeSession.LastWriteTime.Format("2006-01-02 15:04:05"),
					}
				}

				chargerStatus[device.ID] = status
			}
		}
		conn.mu.Unlock()
	}

	return map[string]interface{}{
		"loxone_connections":         meterStatus,
		"loxone_charger_connections": chargerStatus,
	}
}

func (lc *LoxoneCollector) logToDatabase(action, details string) {
	lc.db.Exec(`
		INSERT INTO admin_logs (action, details, ip_address)
		VALUES (?, ?, 'loxone-system')
	`, action, details)
}

// ========== CONNECTION INITIALIZATION ==========

func (lc *LoxoneCollector) initializeConnections() {
	log.Println("ðŸ” SCANNING DATABASE FOR LOXONE API DEVICES...")

	connectionDevices := make(map[string]*LoxoneWebSocketConnection)

	// Load meters
	lc.loadMeters(connectionDevices)

	// Load chargers
	lc.loadChargers(connectionDevices)

	// Start all connections
	lc.mu.Lock()
	for key, conn := range connectionDevices {
		lc.connections[key] = conn
		deviceCount := len(conn.devices)
		log.Println("â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€")
		log.Printf("ðŸš€ STARTING CONNECTION: %s", key)
		log.Printf("   Devices on this connection: %d", deviceCount)
		for _, dev := range conn.devices {
			log.Printf("      - %s: %s (ID: %d)", dev.Type, dev.Name, dev.ID)
		}
		go conn.Connect(lc.db)
	}
	lc.mu.Unlock()

	totalDevices := 0
	for _, conn := range connectionDevices {
		totalDevices += len(conn.devices)
	}

	if totalDevices == 0 {
		log.Println("â„¹ï¸ NO LOXONE API DEVICES FOUND IN DATABASE")
		lc.logToDatabase("Loxone No Devices", "No Loxone API devices found in database")
	} else {
		log.Println("â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€")
		log.Printf("âœ”ï¸ INITIALIZED %d WEBSOCKET CONNECTIONS FOR %d DEVICES",
			len(connectionDevices), totalDevices)
		lc.logToDatabase("Loxone Devices Initialized",
			fmt.Sprintf("Successfully initialized %d connections for %d devices",
				len(connectionDevices), totalDevices))
	}
}

func (lc *LoxoneCollector) loadMeters(connectionDevices map[string]*LoxoneWebSocketConnection) {
	meterRows, err := lc.db.Query(`
		SELECT id, name, connection_config
		FROM meters 
		WHERE is_active = 1 AND connection_type = 'loxone_api'
	`)
	if err != nil {
		log.Printf("âŒ ERROR: Failed to query Loxone meters: %v", err)
		lc.logToDatabase("Loxone Query Error", fmt.Sprintf("Failed to query meters: %v", err))
		return
	}
	defer meterRows.Close()

	meterCount := 0
	for meterRows.Next() {
		var id int
		var name, connectionConfig string

		if err := meterRows.Scan(&id, &name, &connectionConfig); err != nil {
			log.Printf("âŒ ERROR: Failed to scan meter row: %v", err)
			continue
		}

		meterCount++
		log.Println("â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€")
		log.Printf("ðŸ“Š FOUND LOXONE METER #%d", meterCount)
		log.Printf("   Name: '%s'", name)
		log.Printf("   ID: %d", id)

		var config map[string]interface{}
		if err := json.Unmarshal([]byte(connectionConfig), &config); err != nil {
			log.Printf("âŒ ERROR: Failed to parse config for meter '%s': %v", name, err)
			lc.logToDatabase("Loxone Config Error", fmt.Sprintf("Meter '%s': %v", name, err))
			continue
		}

		host, _ := config["loxone_host"].(string)
		macAddress, _ := config["loxone_mac_address"].(string)
		connectionMode, _ := config["loxone_connection_mode"].(string)
		username, _ := config["loxone_username"].(string)
		password, _ := config["loxone_password"].(string)
		deviceID, _ := config["loxone_device_id"].(string)
		loxoneMode, _ := config["loxone_mode"].(string)
		exportDeviceID, _ := config["loxone_export_device_id"].(string)

		var meterType string
		lc.db.QueryRow("SELECT meter_type FROM meters WHERE id = ?", id).Scan(&meterType)

		if loxoneMode == "" {
			if meterType == "total_meter" || meterType == "solar_meter" {
				loxoneMode = "meter_block"
			} else {
				loxoneMode = "energy_meter_block"
			}
		}

		log.Printf("   â”œâ”€ Connection Mode: %s", connectionMode)
		if connectionMode == "remote" {
			log.Printf("   â”œâ”€ MAC Address: %s", macAddress)
			if macAddress == "" || deviceID == "" {
				log.Printf("   âš ï¸ WARNING: Incomplete remote config - skipping")
				continue
			}
		} else {
			log.Printf("   â”œâ”€ Host: %s", host)
			if host == "" || deviceID == "" {
				log.Printf("   âš ï¸ WARNING: Incomplete local config - skipping")
				continue
			}
		}

		log.Printf("   â”œâ”€ Username: %s", username)
		log.Printf("   â”œâ”€ Meter Type: %s", meterType)
		log.Printf("   â”œâ”€ Mode: %s", loxoneMode)
		log.Printf("   â”œâ”€ Device UUID: %s", deviceID)
		if loxoneMode == "virtual_output_dual" && exportDeviceID != "" {
			log.Printf("   â””â”€ Export UUID: %s", exportDeviceID)
		}

		connKey := lc.createConnectionKey(connectionMode, macAddress, host, username, password)
		conn := lc.getOrCreateConnection(connKey, connectionMode, macAddress, host, username, password, connectionDevices)

		device := &LoxoneDevice{
			ID:             id,
			Name:           name,
			Type:           "meter",
			DeviceID:       deviceID,
			LoxoneMode:     loxoneMode,
			ExportDeviceID: exportDeviceID,
		}
		conn.devices = append(conn.devices, device)
	}

	log.Printf("âœ… Loaded %d Loxone meters", meterCount)
}

func (lc *LoxoneCollector) loadChargers(connectionDevices map[string]*LoxoneWebSocketConnection) {
	chargerRows, err := lc.db.Query(`
		SELECT id, name, preset, connection_config
		FROM chargers 
		WHERE is_active = 1 AND connection_type = 'loxone_api'
	`)
	if err != nil {
		log.Printf("âŒ ERROR: Failed to query Loxone chargers: %v", err)
		lc.logToDatabase("Loxone Query Error", fmt.Sprintf("Failed to query chargers: %v", err))
		return
	}
	defer chargerRows.Close()

	chargerCount := 0
	for chargerRows.Next() {
		var id int
		var name, preset, connectionConfig string

		if err := chargerRows.Scan(&id, &name, &preset, &connectionConfig); err != nil {
			log.Printf("âŒ ERROR: Failed to scan charger row: %v", err)
			continue
		}

		chargerCount++
		log.Println("â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€")
		log.Printf("ðŸ”Œ FOUND LOXONE CHARGER #%d", chargerCount)
		log.Printf("   Name: '%s'", name)
		log.Printf("   ID: %d", id)
		log.Printf("   Preset: %s", preset)

		var config map[string]interface{}
		if err := json.Unmarshal([]byte(connectionConfig), &config); err != nil {
			log.Printf("âŒ ERROR: Failed to parse config for charger '%s': %v", name, err)
			lc.logToDatabase("Loxone Config Error", fmt.Sprintf("Charger '%s': %v", name, err))
			continue
		}

		host, _ := config["loxone_host"].(string)
		macAddress, _ := config["loxone_mac_address"].(string)
		connectionMode, _ := config["loxone_connection_mode"].(string)
		username, _ := config["loxone_username"].(string)
		password, _ := config["loxone_password"].(string)

		chargerBlockUUID, _ := config["loxone_charger_block_uuid"].(string)
		powerUUID, _ := config["loxone_power_uuid"].(string)
		stateUUID, _ := config["loxone_state_uuid"].(string)
		userIDUUID, _ := config["loxone_user_id_uuid"].(string)
		modeUUID, _ := config["loxone_mode_uuid"].(string)

		log.Printf("   â”œâ”€ Connection Mode: %s", connectionMode)
		if connectionMode == "remote" {
			log.Printf("   â”œâ”€ MAC Address: %s", macAddress)
			if macAddress == "" {
				log.Printf("   âš ï¸ WARNING: Incomplete remote config - skipping")
				continue
			}
		} else {
			log.Printf("   â”œâ”€ Host: %s", host)
			if host == "" {
				log.Printf("   âš ï¸ WARNING: Incomplete local config - skipping")
				continue
			}
		}

		log.Printf("   â”œâ”€ Username: %s", username)

		if chargerBlockUUID != "" {
			log.Printf("   â”œâ”€ Mode: Single-block (WeidmÃ¼ller) - REAL-TIME TRACKING ENABLED")
			log.Printf("   â””â”€ Charger Block UUID: %s", chargerBlockUUID)
		} else {
			log.Printf("   â”œâ”€ Mode: Multi-UUID (traditional)")
			log.Printf("   â”œâ”€ Power UUID: %s", powerUUID)
			log.Printf("   â”œâ”€ State UUID: %s", stateUUID)
			log.Printf("   â”œâ”€ User ID UUID: %s", userIDUUID)
			log.Printf("   â””â”€ Mode UUID: %s", modeUUID)
		}

		connKey := lc.createConnectionKey(connectionMode, macAddress, host, username, password)
		conn := lc.getOrCreateConnection(connKey, connectionMode, macAddress, host, username, password, connectionDevices)

		device := &LoxoneDevice{
			ID:               id,
			Name:             name,
			Type:             "charger",
			ChargerBlockUUID: chargerBlockUUID,
			PowerUUID:        powerUUID,
			StateUUID:        stateUUID,
			UserIDUUID:       userIDUUID,
			ModeUUID:         modeUUID,
		}
		conn.devices = append(conn.devices, device)

		// Initialize live data
		lc.chargerMu.Lock()
		lc.liveChargerData[id] = &LoxoneChargerLiveData{
			ChargerID:   id,
			ChargerName: name,
			IsOnline:    false,
			Timestamp:   time.Now(),
		}
		lc.chargerMu.Unlock()
	}

	log.Printf("âœ… Loaded %d Loxone chargers", chargerCount)
}

func (lc *LoxoneCollector) createConnectionKey(connectionMode, macAddress, host, username, password string) string {
	if connectionMode == "remote" {
		return fmt.Sprintf("remote|%s|%s|%s", macAddress, username, password)
	}
	return fmt.Sprintf("local|%s|%s|%s", host, username, password)
}

func (lc *LoxoneCollector) getOrCreateConnection(
	connKey, connectionMode, macAddress, host, username, password string,
	connectionDevices map[string]*LoxoneWebSocketConnection) *LoxoneWebSocketConnection {

	if conn, exists := connectionDevices[connKey]; exists {
		if connectionMode == "remote" {
			log.Printf("   â™»ï¸ Reusing existing REMOTE WebSocket connection")
		} else {
			log.Printf("   â™»ï¸ Reusing existing LOCAL WebSocket connection for %s", host)
		}
		return conn
	}

	var actualHost string
	if connectionMode == "remote" {
		actualHost = fmt.Sprintf("dns.loxonecloud.com/%s", macAddress)
	} else {
		actualHost = host
	}

	conn := &LoxoneWebSocketConnection{
		Host:             actualHost,
		Username:         username,
		Password:         password,
		MacAddress:       macAddress,
		IsRemote:         connectionMode == "remote",
		devices:          []*LoxoneDevice{},
		stopChan:         make(chan bool),
		db:               lc.db,
		isShuttingDown:   false,
		reconnectAttempt: 0,
		collector:        lc,
		reconnectBackoff: func() time.Duration {
			if connectionMode == "remote" {
				return 10 * time.Second
			}
			return 1 * time.Second
		}(),
		maxBackoff: func() time.Duration {
			if connectionMode == "remote" {
				return 300 * time.Second
			}
			return 15 * time.Second
		}(),
		dnsCache: func() *DNSCache {
			if connectionMode == "remote" {
				return &DNSCache{
					macAddress: macAddress,
					cacheTTL:   5 * time.Minute,
				}
			}
			return nil
		}(),
	}

	connectionDevices[connKey] = conn

	if connectionMode == "remote" {
		log.Printf("   ðŸŒ Created new REMOTE WebSocket connection via Loxone Cloud DNS")
	} else {
		log.Printf("   ðŸ“ž Created new LOCAL WebSocket connection for %s", host)
	}

	return conn
}