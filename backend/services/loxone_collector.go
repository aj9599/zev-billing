package services

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/aj9599/zev-billing/backend/services/loxone"
)

// LoxoneCollector manages all Loxone WebSocket connections
type LoxoneCollector struct {
	db          *sql.DB
	connections map[string]*loxone.WebSocketConnection
	mu          sync.RWMutex

	// Charger session tracking (centralized)
	liveChargerData   map[int]*loxone.ChargerLiveData      // charger_id -> live data for UI
	activeSessions    map[int]*loxone.ActiveChargerSession // charger_id -> active session
	processedSessions map[string]bool                      // session_key -> processed (to avoid duplicates)
	chargerMu         sync.RWMutex
}

// NewLoxoneCollector creates a new Loxone collector instance
func NewLoxoneCollector(db *sql.DB) *LoxoneCollector {
	log.Println("ðŸ”§ LOXONE COLLECTOR: Initializing with session-based charger tracking")
	lc := &LoxoneCollector{
		db:                db,
		connections:       make(map[string]*loxone.WebSocketConnection),
		liveChargerData:   make(map[int]*loxone.ChargerLiveData),
		activeSessions:    make(map[int]*loxone.ActiveChargerSession),
		processedSessions: make(map[string]bool),
	}
	log.Println("ðŸ”§ LOXONE COLLECTOR: Instance created successfully")
	return lc
}

// Start initializes and starts all Loxone connections
func (lc *LoxoneCollector) Start() {
	log.Println("===================================")
	log.Println("ðŸš€ LOXONE WEBSOCKET COLLECTOR STARTING")
	log.Println("   Features: Session-based charger tracking, Auth health checks, keepalive")
	log.Println("   Chargers: Database writes only after session completion (like Zaptec)")
	log.Println("   Stats: Enhanced statistics persisted to database")
	log.Println("   Sessions: Persist to database (survive restarts)")
	log.Println("===================================")

	lc.logToDatabase("Loxone Collector Started", "Session-based charger tracking with persistence enabled")

	// Load already processed sessions from database to avoid duplicates on restart
	lc.loadProcessedSessions()

	// Load active sessions from database (survive restarts)
	lc.loadActiveSessionsFromDatabase()
	lc.cleanupStaleActiveSessions()

	lc.initializeConnections()

	log.Printf("âœ… Loxone Collector initialized with %d WebSocket connections", len(lc.connections))
	lc.logToDatabase("Loxone Collector Ready", fmt.Sprintf("Initialized %d Loxone connections", len(lc.connections)))

	go lc.monitorConnections()

	log.Println("âœ… Loxone connection monitor started")
	log.Println("===================================")
}

// Stop gracefully stops all Loxone connections
func (lc *LoxoneCollector) Stop() {
	log.Println("ðŸ—‘ï¸ STOPPING ALL LOXONE CONNECTIONS")
	lc.logToDatabase("Loxone Collector Stopping", "Closing all Loxone connections")

	lc.mu.Lock()
	connections := make([]*loxone.WebSocketConnection, 0, len(lc.connections))
	for _, conn := range lc.connections {
		connections = append(connections, conn)
	}
	lc.mu.Unlock()

	// Close all connections and wait for them to finish
	for _, conn := range connections {
		log.Printf("Closing connection: %s", conn.Host)
		conn.Close()
	}

	// Clear the connections map
	lc.mu.Lock()
	lc.connections = make(map[string]*loxone.WebSocketConnection)
	lc.mu.Unlock()

	log.Println("âœ… All Loxone connections stopped")
	lc.logToDatabase("Loxone Collector Stopped", "All connections closed")
}

// RestartConnections stops all connections and reinitializes them
func (lc *LoxoneCollector) RestartConnections() {
	log.Println("=== RESTARTING LOXONE CONNECTIONS ===")
	lc.logToDatabase("Loxone Connections Restarting", "Reinitializing all Loxone connections")

	// Stop all existing connections and wait for them to fully close
	lc.Stop()

	// Wait longer to ensure all goroutines have fully stopped
	log.Println("Waiting for all connections to fully close...")
	time.Sleep(2 * time.Second)

	// Clear session data but keep processedSessions
	lc.chargerMu.Lock()
	lc.liveChargerData = make(map[int]*loxone.ChargerLiveData)
	lc.activeSessions = make(map[int]*loxone.ActiveChargerSession)
	lc.chargerMu.Unlock()

	// Now create new connections
	lc.initializeConnections()

	log.Println("=== LOXONE CONNECTIONS RESTARTED ===")
	lc.logToDatabase("Loxone Connections Restarted", fmt.Sprintf("Successfully restarted %d connections", len(lc.connections)))
}

// GetConnectionStatus returns status information for all connections
func (lc *LoxoneCollector) GetConnectionStatus() map[string]interface{} {
	lc.mu.RLock()
	defer lc.mu.RUnlock()

	meterStatus := make(map[int]map[string]interface{})
	chargerStatus := make(map[int]map[string]interface{})

	for _, conn := range lc.connections {
		conn.Mu.Lock()
		for _, device := range conn.Devices {
			// Format last_update properly, handle zero time
			lastUpdateStr := ""
			if !device.LastUpdate.IsZero() {
				lastUpdateStr = device.LastUpdate.Format("2006-01-02 15:04:05")
			}

			// Format token_expiry properly, handle zero time
			tokenExpiryStr := ""
			if !conn.TokenExpiry.IsZero() {
				tokenExpiryStr = conn.TokenExpiry.Format("2006-01-02 15:04:05")
			}

			// Format last_successful_auth properly, handle zero time
			lastSuccessfulAuthStr := ""
			if !conn.LastSuccessfulAuth.IsZero() {
				lastSuccessfulAuthStr = conn.LastSuccessfulAuth.Format("2006-01-02 15:04:05")
			}

			if device.Type == "meter" {
				meterStatus[device.ID] = map[string]interface{}{
					"device_id":              device.DeviceID,
					"meter_name":             device.Name,
					"host":                   conn.Host,
					"is_connected":           conn.IsConnected,
					"token_valid":            conn.TokenValid,
					"token_expiry":           tokenExpiryStr,
					"last_reading":           device.LastReading,
					"last_reading_export":    device.LastReadingExport,
					"last_update":            lastUpdateStr,
					"reading_gaps":           device.ReadingGaps,
					"last_error":             conn.LastError,
					"consecutive_auth_fails": conn.ConsecutiveAuthFails,
					"total_auth_failures":    conn.TotalAuthFailures,
					"total_reconnects":       conn.TotalReconnects,
					"last_successful_auth":   lastSuccessfulAuthStr,
				}
			} else if device.Type == "charger" {
				// Get live data for charger - with database fallback
				lc.chargerMu.RLock()
				liveData := lc.liveChargerData[device.ID]
				activeSession := lc.activeSessions[device.ID]
				lc.chargerMu.RUnlock()

				// If no live data in memory, try to load from database
				if liveData == nil || time.Since(liveData.Timestamp) > 2*time.Minute {
					liveData = lc.loadChargerStatsFromDatabase(device.ID, device.Name)
				}

				status := map[string]interface{}{
					"power_uuid":             device.PowerUUID,
					"state_uuid":             device.StateUUID,
					"user_id_uuid":           device.UserIDUUID,
					"mode_uuid":              device.ModeUUID,
					"charger_block_uuid":     device.ChargerBlockUUID,
					"charger_name":           device.Name,
					"host":                   conn.Host,
					"is_connected":           conn.IsConnected,
					"token_valid":            conn.TokenValid,
					"token_expiry":           tokenExpiryStr,
					"last_reading":           device.LastReading,
					"last_update":            lastUpdateStr,
					"reading_gaps":           device.ReadingGaps,
					"last_error":             conn.LastError,
					"consecutive_auth_fails": conn.ConsecutiveAuthFails,
					"total_auth_failures":    conn.TotalAuthFailures,
					"total_reconnects":       conn.TotalReconnects,
					"last_successful_auth":   lastSuccessfulAuthStr,
					"collection_mode":        "Session-based (database writes after session completion)",
				}

				// Add live data if available
				if liveData != nil {
					status["live_data"] = map[string]interface{}{
						"vehicle_connected":        liveData.VehicleConnected,
						"charging_active":          liveData.ChargingActive,
						"current_power_kw":         liveData.CurrentPower_kW,
						"total_energy_kwh":         liveData.TotalEnergy_kWh,
						"session_energy_kwh":       liveData.SessionEnergy_kWh,
						"mode":                     liveData.Mode,
						"mode_description":         liveData.ModeDescription,
						"state":                    liveData.State,
						"state_description":        liveData.StateDescription,
						"user_id":                  liveData.UserID,
						"timestamp":                liveData.Timestamp.Format("2006-01-02 15:04:05"),
						"last_session_energy_kwh":  liveData.LastSessionEnergy_kWh,
						"last_session_duration_sec": liveData.LastSessionDuration_sec,
						"weekly_energy_kwh":        liveData.WeeklyEnergy_kWh,
						"monthly_energy_kwh":       liveData.MonthlyEnergy_kWh,
						"last_month_energy_kwh":    liveData.LastMonthEnergy_kWh,
						"yearly_energy_kwh":        liveData.YearlyEnergy_kWh,
						"last_year_energy_kwh":     liveData.LastYearEnergy_kWh,
					}
				}

				// Add active session info if charging
				if activeSession != nil {
					status["active_session"] = map[string]interface{}{
						"start_time":       activeSession.StartTime.Format("2006-01-02 15:04:05"),
						"start_energy_kwh": activeSession.StartEnergy_kWh,
						"user_id":          activeSession.UserID,
						"readings_count":   len(activeSession.Readings),
						"duration":         loxone.FormatDuration(time.Since(activeSession.StartTime)),
					}
				}

				chargerStatus[device.ID] = status
			}
		}
		conn.Mu.Unlock()
	}

	return map[string]interface{}{
		"loxone_connections":         meterStatus,
		"loxone_charger_connections": chargerStatus,
	}
}

// ========== INTERFACE IMPLEMENTATION ==========

// GetLiveChargerData returns live charger data for UI display with database fallback
func (lc *LoxoneCollector) GetLiveChargerData(chargerID int) (*loxone.ChargerLiveData, bool) {
	lc.chargerMu.RLock()
	data, exists := lc.liveChargerData[chargerID]
	lc.chargerMu.RUnlock()

	// Loxone collects data at 15-minute intervals, so live data remains valid for up to 20 minutes.
	// After 20 minutes without an update, the connection is likely down.
	if exists && time.Since(data.Timestamp) < 20*time.Minute {
		return data, true
	}

	// If we have in-memory data but it's older than 20 min, mark it as offline
	// but still return it merged with DB stats so state info isn't lost
	if exists {
		data.IsOnline = false
	}

	// Try to load enhanced stats from database
	var chargerName string
	err := lc.db.QueryRow("SELECT name FROM chargers WHERE id = ?", chargerID).Scan(&chargerName)
	if err != nil {
		if exists {
			return data, true
		}
		return nil, false
	}

	dbData := lc.loadChargerStatsFromDatabase(chargerID, chargerName)
	if dbData == nil {
		if exists {
			return data, true
		}
		return nil, false
	}

	// If we have in-memory data, merge DB stats into it (keep live state, update stats)
	if exists {
		data.LastSessionEnergy_kWh = dbData.LastSessionEnergy_kWh
		data.LastSessionDuration_sec = dbData.LastSessionDuration_sec
		data.WeeklyEnergy_kWh = dbData.WeeklyEnergy_kWh
		data.MonthlyEnergy_kWh = dbData.MonthlyEnergy_kWh
		data.LastMonthEnergy_kWh = dbData.LastMonthEnergy_kWh
		data.YearlyEnergy_kWh = dbData.YearlyEnergy_kWh
		data.LastYearEnergy_kWh = dbData.LastYearEnergy_kWh
		data.IsOnline = false
		return data, true
	}

	return dbData, true
}

// loadChargerStatsFromDatabase loads persisted stats from charger_stats table
func (lc *LoxoneCollector) loadChargerStatsFromDatabase(chargerID int, chargerName string) *loxone.ChargerLiveData {
	var lastSessionEnergy, lastSessionDuration float64
	var weeklyEnergy, monthlyEnergy, lastMonthEnergy float64
	var yearlyEnergy, lastYearEnergy float64
	var updatedAt string
	
	err := lc.db.QueryRow(`
		SELECT 
			last_session_energy_kwh,
			last_session_duration_sec,
			weekly_energy_kwh,
			monthly_energy_kwh,
			last_month_energy_kwh,
			yearly_energy_kwh,
			last_year_energy_kwh,
			updated_at
		FROM charger_stats 
		WHERE charger_id = ?
	`, chargerID).Scan(
		&lastSessionEnergy,
		&lastSessionDuration,
		&weeklyEnergy,
		&monthlyEnergy,
		&lastMonthEnergy,
		&yearlyEnergy,
		&lastYearEnergy,
		&updatedAt,
	)
	
	if err != nil {
		if err != sql.ErrNoRows {
			log.Printf("WARNING: Could not load charger stats: %v", err)
		}
		return nil
	}

	// Parse updated_at timestamp
	timestamp, _ := time.Parse("2006-01-02 15:04:05", updatedAt)
	if timestamp.IsZero() {
		timestamp = time.Now()
	}

	liveData := &loxone.ChargerLiveData{
		ChargerID:                chargerID,
		ChargerName:              chargerName,
		IsOnline:                 false, // Unknown when loading from DB
		State:                    "0",
		StateDescription:         "Offline (no recent data)",
		LastSessionEnergy_kWh:    lastSessionEnergy,
		LastSessionDuration_sec:  lastSessionDuration,
		WeeklyEnergy_kWh:         weeklyEnergy,
		MonthlyEnergy_kWh:        monthlyEnergy,
		LastMonthEnergy_kWh:      lastMonthEnergy,
		YearlyEnergy_kWh:         yearlyEnergy,
		LastYearEnergy_kWh:       lastYearEnergy,
		Timestamp:                timestamp,
	}

	// Check if we have any meaningful stats
	if lastSessionEnergy == 0 && weeklyEnergy == 0 && 
	   monthlyEnergy == 0 && yearlyEnergy == 0 {
		return nil
	}

	log.Printf("ðŸ“Š [%s] Loaded stats from charger_stats table: Last=%.3f, Weekly=%.3f, Monthly=%.3f, Yearly=%.3f kWh",
		chargerName, lastSessionEnergy, weeklyEnergy, monthlyEnergy, yearlyEnergy)

	return liveData
}

// GetActiveSession returns the active session for a charger if one exists
func (lc *LoxoneCollector) GetActiveSession(chargerID int) (*loxone.ActiveChargerSession, bool) {
	lc.chargerMu.RLock()
	defer lc.chargerMu.RUnlock()

	session, exists := lc.activeSessions[chargerID]
	return session, exists
}

// UpdateLiveChargerData updates the live charger data
func (lc *LoxoneCollector) UpdateLiveChargerData(chargerID int, data *loxone.ChargerLiveData) {
	lc.chargerMu.Lock()
	defer lc.chargerMu.Unlock()
	lc.liveChargerData[chargerID] = data
}

// UpdateActiveSession updates the active session
func (lc *LoxoneCollector) UpdateActiveSession(chargerID int, session *loxone.ActiveChargerSession) {
	lc.chargerMu.Lock()
	defer lc.chargerMu.Unlock()
	lc.activeSessions[chargerID] = session
}

// GetActiveSessions returns all active sessions
func (lc *LoxoneCollector) GetActiveSessions() map[int]*loxone.ActiveChargerSession {
	lc.chargerMu.RLock()
	defer lc.chargerMu.RUnlock()

	// Return a copy to avoid race conditions
	copy := make(map[int]*loxone.ActiveChargerSession)
	for k, v := range lc.activeSessions {
		copy[k] = v
	}
	return copy
}

// GetProcessedSessions returns all processed sessions
func (lc *LoxoneCollector) GetProcessedSessions() map[string]bool {
	lc.chargerMu.RLock()
	defer lc.chargerMu.RUnlock()

	// Return a copy to avoid race conditions
	copy := make(map[string]bool)
	for k, v := range lc.processedSessions {
		copy[k] = v
	}
	return copy
}

// SetActiveSession sets an active session
func (lc *LoxoneCollector) SetActiveSession(chargerID int, session *loxone.ActiveChargerSession) {
	lc.chargerMu.Lock()
	defer lc.chargerMu.Unlock()
	lc.activeSessions[chargerID] = session
}

// DeleteActiveSession deletes an active session from memory and database
func (lc *LoxoneCollector) DeleteActiveSession(chargerID int) {
	lc.chargerMu.Lock()
	session := lc.activeSessions[chargerID]
	delete(lc.activeSessions, chargerID)
	lc.chargerMu.Unlock()

	// Also delete from database if session exists
	if session != nil {
		if err := lc.deleteActiveSessionFromDatabase(chargerID, session.StartTime); err != nil {
			log.Printf("   ⚠️  [Charger %d] Failed to delete session from database: %v", chargerID, err)
		}
	}
}

// MarkSessionProcessed marks a session as processed
func (lc *LoxoneCollector) MarkSessionProcessed(sessionID string) {
	lc.chargerMu.Lock()
	defer lc.chargerMu.Unlock()
	lc.processedSessions[sessionID] = true
}

// LogToDatabase logs an action to the database
func (lc *LoxoneCollector) LogToDatabase(action, details string) {
	lc.db.Exec(`
		INSERT INTO admin_logs (action, details, ip_address)
		VALUES (?, ?, 'loxone-system')
	`, action, details)
}

// ========== END INTERFACE IMPLEMENTATION ==========

// loadProcessedSessions loads session IDs that have already been written to database
func (lc *LoxoneCollector) loadProcessedSessions() {
	// Query for recent sessions (last 30 days) to avoid reprocessing
	rows, err := lc.db.Query(`
		SELECT DISTINCT session_id 
		FROM charger_readings 
		WHERE session_id IS NOT NULL 
		  AND session_id != ''
		  AND timestamp > datetime('now', '-30 days')
	`)
	if err != nil {
		log.Printf("WARNING: Could not load processed Loxone sessions: %v", err)
		return
	}
	defer rows.Close()

	count := 0
	lc.chargerMu.Lock()
	for rows.Next() {
		var sessionID string
		if err := rows.Scan(&sessionID); err == nil && sessionID != "" {
			lc.processedSessions[sessionID] = true
			count++
		}
	}
	lc.chargerMu.Unlock()

	log.Printf("Loxone Collector: Loaded %d already-processed session IDs", count)
}

// initializeConnections scans database and creates connections for all Loxone devices
func (lc *LoxoneCollector) initializeConnections() {
	log.Println("ðŸ” SCANNING DATABASE FOR LOXONE API DEVICES...")

	connectionDevices := make(map[string]*loxone.WebSocketConnection)

	// Load meters
	lc.loadMeters(connectionDevices)

	// Load chargers
	lc.loadChargers(connectionDevices)

	// Start all connections
	lc.mu.Lock()
	for key, conn := range connectionDevices {
		lc.connections[key] = conn
		deviceCount := len(conn.Devices)
		log.Println("â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€")
		log.Printf("ðŸš€ STARTING CONNECTION: %s", key)
		log.Printf("   Devices on this connection: %d", deviceCount)
		for _, dev := range conn.Devices {
			log.Printf("      - %s: %s (ID: %d)", strings.ToUpper(dev.Type), dev.Name, dev.ID)
		}
		go conn.Connect(lc.db, lc)
	}
	lc.mu.Unlock()

	totalDevices := 0
	for _, conn := range connectionDevices {
		totalDevices += len(conn.Devices)
	}

	if totalDevices == 0 {
		log.Println("â„¹ï¸  NO LOXONE API DEVICES FOUND IN DATABASE")
		lc.logToDatabase("Loxone No Devices", "No Loxone API devices found in database")
	} else {
		log.Println("â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€")
		log.Printf("âœ… INITIALIZED %d WEBSOCKET CONNECTIONS FOR %d DEVICES",
			len(connectionDevices), totalDevices)
		lc.logToDatabase("Loxone Devices Initialized",
			fmt.Sprintf("Successfully initialized %d connections for %d devices",
				len(connectionDevices), totalDevices))
	}
}

// loadMeters loads meter devices from database
func (lc *LoxoneCollector) loadMeters(connectionDevices map[string]*loxone.WebSocketConnection) {
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
		log.Println("â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€")
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

		// Get meter type from database to set appropriate default mode
		var meterType string
		lc.db.QueryRow("SELECT meter_type FROM meters WHERE id = ?", id).Scan(&meterType)

		// Default mode based on meter type
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
		} else {
			log.Printf("   â”œâ”€ Host: %s", host)
		}
		log.Printf("   â”œâ”€ Username: %s", username)
		log.Printf("   â”œâ”€ Meter Type: %s", meterType)
		log.Printf("   â”œâ”€ Mode: %s", loxoneMode)
		log.Printf("   â”œâ”€ Device UUID: %s", deviceID)
		if (loxoneMode == "virtual_output_dual") && exportDeviceID != "" {
			log.Printf("   â””â”€ Export UUID: %s", exportDeviceID)
		} else if loxoneMode == "meter_block" {
			log.Printf("   â””â”€ (Meter block: output1=Mrc, output8=Mrd)")
		} else if loxoneMode == "energy_meter_block" {
			log.Printf("   â””â”€ (Energy meter block: output1=Mr)")
		} else {
			log.Printf("   â””â”€ (Virtual output: single value)")
		}

		// Validate configuration based on connection mode
		if connectionMode == "remote" {
			if macAddress == "" || deviceID == "" {
				log.Printf("   âš ï¸  WARNING: Incomplete remote config (missing MAC or device ID) - skipping")
				continue
			}
		} else {
			if host == "" || deviceID == "" {
				log.Printf("   âš ï¸  WARNING: Incomplete local config (missing host or device ID) - skipping")
				continue
			}
		}

		// Create connection key based on mode
		var connKey string
		if connectionMode == "remote" {
			connKey = fmt.Sprintf("remote|%s|%s|%s", macAddress, username, password)
		} else {
			connKey = fmt.Sprintf("local|%s|%s|%s", host, username, password)
		}

		conn, exists := connectionDevices[connKey]
		if !exists {
			// Determine the host URL based on connection mode
			var actualHost string
			if connectionMode == "remote" {
				actualHost = fmt.Sprintf("dns.loxonecloud.com/%s", macAddress)
			} else {
				actualHost = host
			}

			conn = loxone.NewWebSocketConnection(actualHost, username, password, macAddress, connectionMode == "remote", lc.db, lc)
			connectionDevices[connKey] = conn
			if connectionMode == "remote" {
				log.Printf("   ðŸŒ Created new REMOTE WebSocket connection via Loxone Cloud DNS")
			} else {
				log.Printf("   ðŸ“¡ Created new LOCAL WebSocket connection for %s", host)
			}
		} else {
			log.Printf("   â™»ï¸  Reusing existing WebSocket connection for %s", host)
		}

		device := &loxone.Device{
			ID:             id,
			Name:           name,
			Type:           "meter",
			DeviceID:       deviceID,
			LoxoneMode:     loxoneMode,
			ExportDeviceID: exportDeviceID,
		}
		conn.Devices = append(conn.Devices, device)
	}

	log.Printf("âœ… Loaded %d Loxone meters", meterCount)
}

// loadChargers loads charger devices from database
func (lc *LoxoneCollector) loadChargers(connectionDevices map[string]*loxone.WebSocketConnection) {
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
		log.Println("â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€")
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

		// Read MAC address and connection mode for chargers
		host, _ := config["loxone_host"].(string)
		macAddress, _ := config["loxone_mac_address"].(string)
		connectionMode, _ := config["loxone_connection_mode"].(string)
		username, _ := config["loxone_username"].(string)
		password, _ := config["loxone_password"].(string)

		// Check if this is single-block mode (WeidmÃ¼ller single UUID)
		chargerBlockUUID, _ := config["loxone_charger_block_uuid"].(string)

		// For backward compatibility, also check for multi-UUID mode
		powerUUID, _ := config["loxone_power_uuid"].(string)
		stateUUID, _ := config["loxone_state_uuid"].(string)
		userIDUUID, _ := config["loxone_user_id_uuid"].(string)
		modeUUID, _ := config["loxone_mode_uuid"].(string)

		// Log connection mode for chargers
		log.Printf("   â”œâ”€ Connection Mode: %s", connectionMode)
		if connectionMode == "remote" {
			log.Printf("   â”œâ”€ MAC Address: %s", macAddress)
		} else {
			log.Printf("   â”œâ”€ Host: %s", host)
		}
		log.Printf("   â”œâ”€ Username: %s", username)

		// Determine which mode we're using
		if chargerBlockUUID != "" {
			log.Printf("   â”œâ”€ Mode: Single-block (WeidmÃ¼ller) - SESSION TRACKING ENABLED")
			log.Printf("   â””â”€ Charger Block UUID: %s", chargerBlockUUID)

			// Validate based on connection mode
			if connectionMode == "remote" {
				if macAddress == "" || chargerBlockUUID == "" {
					log.Printf("   âš ï¸  WARNING: Incomplete remote config - missing MAC or block UUID - skipping")
					continue
				}
			} else {
				if host == "" || chargerBlockUUID == "" {
					log.Printf("   âš ï¸  WARNING: Incomplete local config - missing host or block UUID - skipping")
					continue
				}
			}
		} else {
			log.Printf("   â”œâ”€ Mode: Multi-UUID (traditional)")
			log.Printf("   â”œâ”€ Power UUID: %s", powerUUID)
			log.Printf("   â”œâ”€ State UUID: %s", stateUUID)
			log.Printf("   â”œâ”€ User ID UUID: %s", userIDUUID)
			log.Printf("   â””â”€ Mode UUID: %s", modeUUID)

			// Validate based on connection mode
			if connectionMode == "remote" {
				if macAddress == "" || powerUUID == "" || stateUUID == "" || userIDUUID == "" || modeUUID == "" {
					log.Printf("   âš ï¸  WARNING: Incomplete remote config - missing MAC or UUIDs - skipping")
					continue
				}
			} else {
				if host == "" || powerUUID == "" || stateUUID == "" || userIDUUID == "" || modeUUID == "" {
					log.Printf("   âš ï¸  WARNING: Incomplete local config - missing host or UUIDs - skipping")
					continue
				}
			}
		}

		// Create connection key based on mode (remote or local)
		var connKey string
		if connectionMode == "remote" {
			connKey = fmt.Sprintf("remote|%s|%s|%s", macAddress, username, password)
		} else {
			connKey = fmt.Sprintf("local|%s|%s|%s", host, username, password)
		}

		conn, exists := connectionDevices[connKey]
		if !exists {
			// Determine the host URL based on connection mode
			var actualHost string
			if connectionMode == "remote" {
				actualHost = fmt.Sprintf("dns.loxonecloud.com/%s", macAddress)
			} else {
				actualHost = host
			}

			conn = loxone.NewWebSocketConnection(actualHost, username, password, macAddress, connectionMode == "remote", lc.db, lc)
			connectionDevices[connKey] = conn

			// Log connection type
			if connectionMode == "remote" {
				log.Printf("   ðŸŒ Created new REMOTE WebSocket connection via Loxone Cloud DNS")
			} else {
				log.Printf("   ðŸ“¡ Created new LOCAL WebSocket connection for %s", host)
			}
		} else {
			if connectionMode == "remote" {
				log.Printf("   â™»ï¸  Reusing existing REMOTE WebSocket connection")
			} else {
				log.Printf("   â™»ï¸  Reusing existing LOCAL WebSocket connection for %s", host)
			}
		}

		device := &loxone.Device{
			ID:               id,
			Name:             name,
			Type:             "charger",
			ChargerBlockUUID: chargerBlockUUID,
			PowerUUID:        powerUUID,
			StateUUID:        stateUUID,
			UserIDUUID:       userIDUUID,
			ModeUUID:         modeUUID,
		}
		conn.Devices = append(conn.Devices, device)

		// Initialize live data for this charger - try to load from database first
		lc.chargerMu.Lock()
		dbData := lc.loadChargerStatsFromDatabase(id, name)
		if dbData != nil {
			lc.liveChargerData[id] = dbData
			log.Printf("   ðŸ“Š Loaded persisted stats from database")
		} else {
			lc.liveChargerData[id] = &loxone.ChargerLiveData{
				ChargerID:   id,
				ChargerName: name,
				IsOnline:    false,
				Timestamp:   time.Now(),
			}
		}
		lc.chargerMu.Unlock()
	}

	log.Printf("âœ… Loaded %d Loxone chargers", chargerCount)
}

// monitorConnections periodically checks connection health
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

		log.Println("â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€")
		log.Println("ðŸ” LOXONE CONNECTION STATUS CHECK")

		for key, conn := range lc.connections {
			conn.Mu.Lock()
			isConnected := conn.IsConnected
			tokenValid := conn.TokenValid
			tokenExpiry := conn.TokenExpiry
			lastError := conn.LastError
			deviceCount := len(conn.Devices)
			authFails := conn.ConsecutiveAuthFails
			totalAuthFails := conn.TotalAuthFailures
			totalReconn := conn.TotalReconnects
			conn.Mu.Unlock()

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
					log.Printf("      âš ï¸  Consecutive auth failures: %d", authFails)
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

		// Log charger session status
		lc.chargerMu.RLock()
		activeSessionCount := len(lc.activeSessions)
		lc.chargerMu.RUnlock()

		log.Printf("ðŸ“Š Summary: %d connected, %d disconnected, %d total devices",
			connectedCount, disconnectedCount, totalDevices)
		log.Printf("ðŸ“Š Charger Sessions: %d active", activeSessionCount)
		log.Printf("ðŸ“Š Metrics: %d total auth failures, %d total reconnects",
			totalAuthFailures, totalReconnects)
		log.Println("â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€")

		if disconnectedCount > 0 {
			lc.logToDatabase("Loxone Status Check",
				fmt.Sprintf("%d connected, %d disconnected (total failures: %d, reconnects: %d)",
					connectedCount, disconnectedCount, totalAuthFailures, totalReconnects))
		}
	}
}

// logToDatabase logs an action to the admin_logs table
func (lc *LoxoneCollector) logToDatabase(action, details string) {
	lc.db.Exec(`
		INSERT INTO admin_logs (action, details, ip_address)
		VALUES (?, ?, 'loxone-system')
	`, action, details)
}