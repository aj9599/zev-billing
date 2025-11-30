package services

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/aj9599/zev-billing/backend/services/zaptec"
)

// ZaptecCollector handles Zaptec charger data collection via their API
// 
// Architecture:
// - Polls charger state every 10 seconds for LIVE UI DISPLAY
// - Writes idle readings every 15 minutes for gap filling
// - After session ends, fetches charge history with SignedSession (OCMF)
// - Parses OCMF data for verified meter readings and user identification
// - Batch-writes all session meter readings to charger_sessions table
// - Has fallback detection to catch missed sessions on restart
// - All timestamps are converted from UTC to local timezone (Europe/Zurich)
type ZaptecCollector struct {
	db               *sql.DB
	client           *http.Client
	mu               sync.RWMutex
	
	// Live data for UI display (always available)
	liveChargerData  map[int]*zaptec.LiveData
	
	// Authentication
	accessTokens     map[int]string
	tokenExpiries    map[int]time.Time
	
	// Session tracking for detecting session end
	activeSessionIDs map[int]string    // charger_id -> session_id
	previousStates   map[int]int       // charger_id -> operating_mode
	
	// Track processed sessions to avoid duplicates
	processedSessions map[string]bool  // session_id -> processed
	
	// Track last idle write time for gap filling
	lastIdleWrite    map[int]time.Time // charger_id -> last idle write time
	
	stopChan         chan bool
	apiBaseURL       string
	
	// Timezone for converting UTC timestamps to local time
	localTimezone    *time.Location
	
	// Helper components
	authHandler      *zaptec.AuthHandler
	apiClient        *zaptec.APIClient
	sessionProcessor *zaptec.SessionProcessor
	dbHandler        *zaptec.DatabaseHandler
}

func NewZaptecCollector(db *sql.DB) *ZaptecCollector {
	// Load local timezone (Europe/Zurich = UTC+1 / UTC+2 in summer)
	localTZ, err := time.LoadLocation("Europe/Zurich")
	if err != nil {
		log.Printf("WARNING: Could not load Europe/Zurich timezone, using UTC: %v", err)
		localTZ = time.UTC
	}
	
	client := &http.Client{Timeout: 30 * time.Second}
	apiBaseURL := "https://api.zaptec.com"
	
	zc := &ZaptecCollector{
		db:                db,
		client:            client,
		liveChargerData:   make(map[int]*zaptec.LiveData),
		accessTokens:      make(map[int]string),
		tokenExpiries:     make(map[int]time.Time),
		activeSessionIDs:  make(map[int]string),
		previousStates:    make(map[int]int),
		processedSessions: make(map[string]bool),
		lastIdleWrite:     make(map[int]time.Time),
		stopChan:          make(chan bool),
		apiBaseURL:        apiBaseURL,
		localTimezone:     localTZ,
	}
	
	// Initialize helper components
	zc.authHandler = zaptec.NewAuthHandler(client, apiBaseURL, &zc.mu, zc.accessTokens, zc.tokenExpiries)
	zc.apiClient = zaptec.NewAPIClient(client, apiBaseURL)
	zc.sessionProcessor = zaptec.NewSessionProcessor(localTZ)
	zc.dbHandler = zaptec.NewDatabaseHandler(db, localTZ)
	
	return zc
}

func (zc *ZaptecCollector) Start() {
	log.Println("Starting Zaptec Collector (Optimized OCMF + Gap Filling)...")
	log.Printf("  - Timezone: %s", zc.localTimezone.String())
	log.Println("  - Live polling every 10 seconds for UI display")
	log.Println("  - OCMF meter readings written to charger_sessions after session completion")
	log.Println("  - Idle readings written at 15-minute intervals for gap filling")
	log.Println("  - Fallback detection for missed sessions on restart")
	
	zc.loadChargers()
	
	// Load already processed sessions from database to avoid duplicates on restart
	zc.loadProcessedSessions()
	
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()
	
	for {
		select {
		case <-ticker.C:
			zc.pollAllChargers()
		case <-zc.stopChan:
			log.Println("Zaptec Collector stopped")
			return
		}
	}
}

func (zc *ZaptecCollector) Stop() {
	log.Println("Stopping Zaptec Collector...")
	close(zc.stopChan)
}

func (zc *ZaptecCollector) RestartConnections() {
	log.Println("Restarting Zaptec connections...")
	zc.mu.Lock()
	zc.liveChargerData = make(map[int]*zaptec.LiveData)
	zc.accessTokens = make(map[int]string)
	zc.tokenExpiries = make(map[int]time.Time)
	zc.activeSessionIDs = make(map[int]string)
	zc.previousStates = make(map[int]int)
	zc.lastIdleWrite = make(map[int]time.Time)
	// Don't clear processedSessions - we need to remember what we've already written
	zc.mu.Unlock()
	
	zc.loadChargers()
}

func (zc *ZaptecCollector) loadChargers() {
	rows, err := zc.db.Query(`
		SELECT id, name, connection_config
		FROM chargers 
		WHERE is_active = 1 AND connection_type = 'zaptec_api'
	`)
	if err != nil {
		log.Printf("ERROR: Failed to query Zaptec chargers: %v", err)
		return
	}
	defer rows.Close()
	
	count := 0
	for rows.Next() {
		var id int
		var name, configJSON string
		
		if err := rows.Scan(&id, &name, &configJSON); err != nil {
			continue
		}
		
		var config zaptec.ConnectionConfig
		if err := json.Unmarshal([]byte(configJSON), &config); err != nil {
			log.Printf("ERROR: Invalid Zaptec config for charger %s: %v", name, err)
			continue
		}
		
		if config.Username == "" || config.Password == "" || config.ChargerID == "" {
			log.Printf("WARNING: Incomplete Zaptec config for charger %s", name)
			continue
		}
		
		count++
		log.Printf("Loaded Zaptec charger: %s (ID: %d, Charger ID: %s)", name, id, config.ChargerID)
	}
	
	log.Printf("Zaptec Collector: Loaded %d active chargers", count)
}

func (zc *ZaptecCollector) loadProcessedSessions() {
	count := zc.dbHandler.LoadProcessedSessions()
	log.Printf("Zaptec Collector: Loaded %d recent sessions from last 30 days", count)
}

func (zc *ZaptecCollector) pollAllChargers() {
	rows, err := zc.db.Query(`
		SELECT id, name, connection_config
		FROM chargers 
		WHERE is_active = 1 AND connection_type = 'zaptec_api'
	`)
	if err != nil {
		log.Printf("ERROR: Failed to query Zaptec chargers: %v", err)
		return
	}
	defer rows.Close()
	
	var wg sync.WaitGroup
	
	for rows.Next() {
		var id int
		var name, configJSON string
		
		if err := rows.Scan(&id, &name, &configJSON); err != nil {
			continue
		}
		
		wg.Add(1)
		go func(chargerID int, chargerName, config string) {
			defer wg.Done()
			zc.pollCharger(chargerID, chargerName, config)
		}(id, name, configJSON)
	}
	
	wg.Wait()
}

func (zc *ZaptecCollector) pollCharger(chargerID int, chargerName, configJSON string) {
	var config zaptec.ConnectionConfig
	if err := json.Unmarshal([]byte(configJSON), &config); err != nil {
		log.Printf("ERROR: Invalid Zaptec config for charger %s: %v", chargerName, err)
		return
	}
	
	token, err := zc.authHandler.GetAccessToken(chargerID, config)
	if err != nil {
		log.Printf("ERROR: Failed to get Zaptec token for charger %s: %v", chargerName, err)
		return
	}
	
	// Get charger details
	chargerDetails, err := zc.apiClient.GetChargerDetails(token, config.ChargerID)
	if err != nil {
		log.Printf("ERROR: Failed to get charger details for %s: %v", chargerName, err)
		return
	}
	
	// Get previous state for transition detection
	zc.mu.RLock()
	previousState := zc.previousStates[chargerID]
	previousSessionID := zc.activeSessionIDs[chargerID]
	zc.mu.RUnlock()
	
	currentState := chargerDetails.OperatingMode
	
	// Get state values for additional info
	stateData, _ := zc.apiClient.GetChargerStateValues(token, config.ChargerID)
	if stateData == nil {
		stateData = make(map[int]string)
	}
	
	// Build live data for UI display (ALWAYS AVAILABLE)
	liveData := zc.buildLiveData(chargerDetails, stateData)
	
	// ========== CHARGING STATE (OperatingMode == 3) ==========
	if currentState == 3 {
		zc.handleChargingState(chargerID, chargerName, liveData, stateData)
	} else {
		// ========== NOT CHARGING - Check for session end ==========
		zc.handleNonChargingState(chargerID, chargerName, config, token, previousState, previousSessionID, liveData)
	}
	
	// Update state tracking
	zc.mu.Lock()
	zc.previousStates[chargerID] = currentState
	zc.liveChargerData[chargerID] = liveData
	zc.mu.Unlock()
	
	log.Printf("Zaptec: [%s] State=%s (%s), Total=%.3f kWh, Power=%.2f kW", 
		chargerName, liveData.State, liveData.StateDescription,
		liveData.TotalEnergy_kWh, liveData.CurrentPower_kW)
}

func (zc *ZaptecCollector) buildLiveData(chargerDetails *zaptec.ChargerDetails, stateData map[int]string) *zaptec.LiveData {
	liveData := &zaptec.LiveData{
		ChargerName:      chargerDetails.Name,
		DeviceName:       chargerDetails.DeviceName,
		IsOnline:         chargerDetails.IsOnline,
		OperatingMode:    chargerDetails.OperatingMode,
		State:            zaptec.MapOperatingModeToState(chargerDetails.OperatingMode, chargerDetails.IsOnline),
		StateDescription: zaptec.GetStateDescription(chargerDetails.OperatingMode),
		TotalEnergy_kWh:  chargerDetails.SignedMeterValueKwh,
		TotalEnergy:      chargerDetails.SignedMeterValueKwh,
		CurrentPower_kW:  chargerDetails.TotalChargePower / 1000.0,
		Power_kW:         chargerDetails.TotalChargePower / 1000.0,
		Voltage:          chargerDetails.Voltage,
		Current:          chargerDetails.Current,
		Mode:             "1",
		Timestamp:        time.Now(),
	}
	
	// Get power from StateId 513 if available (more accurate)
	if powerStr, ok := stateData[513]; ok {
		if powerVal, err := zaptec.ParseStateValue(powerStr); err == nil {
			liveData.CurrentPower_kW = powerVal / 1000.0
			liveData.Power_kW = powerVal / 1000.0
		}
	}
	
	return liveData
}

func (zc *ZaptecCollector) handleChargingState(chargerID int, chargerName string, liveData *zaptec.LiveData, stateData map[int]string) {
	// Get session ID from StateId 721
	if sessionID, ok := stateData[721]; ok && sessionID != "" {
		liveData.SessionID = sessionID
		liveData.CurrentSession = sessionID
		
		zc.mu.Lock()
		zc.activeSessionIDs[chargerID] = sessionID
		zc.mu.Unlock()
	}
	
	// Get session energy from StateId 553
	if sessionEnergyStr, ok := stateData[553]; ok {
		if energyVal, err := zaptec.ParseStateValue(sessionEnergyStr); err == nil {
			liveData.SessionEnergy_kWh = energyVal / 1000.0
			liveData.SessionEnergy = energyVal / 1000.0
		}
	}
	
	// Get user ID from StateId 722
	if userID, ok := stateData[722]; ok && userID != "" {
		liveData.UserID = userID
	} else {
		liveData.UserID = "charging..."
	}
	
	// Get session start time from StateId 710
	if startTimeStr, ok := stateData[710]; ok {
		liveData.SessionStart = zaptec.ParseZaptecTime(startTimeStr, zc.localTimezone)
	}
	
	log.Printf("Zaptec: [%s] CHARGING: Session=%s, Energy=%.3f kWh, Power=%.2f kW", 
		chargerName, liveData.SessionID, liveData.SessionEnergy_kWh, liveData.CurrentPower_kW)
}

func (zc *ZaptecCollector) handleNonChargingState(chargerID int, chargerName string, config zaptec.ConnectionConfig, token string, previousState int, previousSessionID string, liveData *zaptec.LiveData) {
	// Detect transition from charging to finished
	if previousState == 3 && previousSessionID != "" {
		log.Printf("Zaptec: [%s] Session ended (state %d -> %d), processing session %s", 
			chargerName, previousState, liveData.OperatingMode, previousSessionID)
		
		go zc.processCompletedSession(chargerID, chargerName, config, token, previousSessionID)
		
		zc.mu.Lock()
		delete(zc.activeSessionIDs, chargerID)
		zc.mu.Unlock()
	}
	
	// Gap filling
	zc.writeIdleReadingIfNeeded(chargerID, chargerName, liveData.TotalEnergy_kWh, liveData.State)
	
	// Fallback detection
	history, err := zc.apiClient.GetRecentChargeHistory(token, config.ChargerID, 5)
	if err == nil && len(history) > 0 {
		// Update UI with last session info
		lastSession := history[0]
		liveData.SessionID = lastSession.ID
		liveData.CurrentSession = lastSession.ID
		liveData.SessionEnergy_kWh = lastSession.Energy
		liveData.SessionEnergy = lastSession.Energy
		liveData.UserID = lastSession.UserID
		liveData.UserName = lastSession.UserFullName
		liveData.SessionStart = zaptec.ParseZaptecTime(lastSession.StartDateTime, zc.localTimezone)
		
		// Check for unprocessed sessions
		for _, session := range history {
			zc.mu.RLock()
			alreadyProcessed := zc.processedSessions[session.ID]
			zc.mu.RUnlock()
			
			if !alreadyProcessed && session.Energy > 0 {
				endTime := zaptec.ParseZaptecTime(session.EndDateTime, zc.localTimezone)
				if !endTime.IsZero() && time.Since(endTime) > 30*time.Second {
					log.Printf("Zaptec: [%s] FALLBACK: Found unprocessed session %s (%.3f kWh), processing now...", 
						chargerName, session.ID, session.Energy)
					go zc.processCompletedSession(chargerID, chargerName, config, token, session.ID)
				}
			}
		}
	}
}

func (zc *ZaptecCollector) processCompletedSession(chargerID int, chargerName string, config zaptec.ConnectionConfig, token, sessionID string) {
	// Check if already processed
	zc.mu.RLock()
	if zc.processedSessions[sessionID] {
		zc.mu.RUnlock()
		log.Printf("Zaptec: [%s] Session %s already processed, skipping", chargerName, sessionID)
		return
	}
	zc.mu.RUnlock()
	
	time.Sleep(5 * time.Second)
	
	history, err := zc.apiClient.GetRecentChargeHistory(token, config.ChargerID, 5)
	if err != nil {
		log.Printf("ERROR: [%s] Failed to get charge history: %v", chargerName, err)
		return
	}
	
	var targetSession *zaptec.ChargeHistory
	for i := range history {
		if history[i].ID == sessionID {
			targetSession = &history[i]
			break
		}
	}
	
	if targetSession == nil && len(history) > 0 {
		targetSession = &history[0]
		log.Printf("Zaptec: [%s] Session %s not found in history, using most recent: %s", 
			chargerName, sessionID, targetSession.ID)
	}
	
	if targetSession == nil {
		log.Printf("ERROR: [%s] No session found in charge history", chargerName)
		return
	}
	
	zc.mu.RLock()
	if zc.processedSessions[targetSession.ID] {
		zc.mu.RUnlock()
		log.Printf("Zaptec: [%s] Session %s already processed, skipping", chargerName, targetSession.ID)
		return
	}
	zc.mu.RUnlock()
	
	completedSession, err := zc.sessionProcessor.ParseSignedSession(targetSession, chargerID, chargerName)
	if err != nil {
		log.Printf("ERROR: [%s] Failed to parse SignedSession: %v", chargerName, err)
		zc.writeSessionFallback(targetSession, chargerID, chargerName)
		return
	}
	
	err = zc.dbHandler.WriteSessionToDatabase(completedSession)
	if err != nil {
		log.Printf("ERROR: [%s] Failed to write session to database: %v", chargerName, err)
		return
	}
	
	zc.mu.Lock()
	zc.processedSessions[completedSession.SessionID] = true
	zc.mu.Unlock()
	
	log.Printf("Zaptec: [%s] ✓ SESSION WRITTEN: ID=%s, User=%s, Energy=%.3f kWh, OCMF Readings=%d", 
		chargerName, completedSession.SessionID, completedSession.UserID, 
		completedSession.TotalEnergy_kWh, len(completedSession.MeterReadings))
}

func (zc *ZaptecCollector) writeSessionFallback(history *zaptec.ChargeHistory, chargerID int, chargerName string) {
	err := zc.dbHandler.WriteSessionFallback(history, chargerID, chargerName)
	if err != nil {
		log.Printf("ERROR: [%s] Failed to write fallback session: %v", chargerName, err)
		return
	}
	
	zc.mu.Lock()
	zc.processedSessions[history.ID] = true
	zc.mu.Unlock()
}

func (zc *ZaptecCollector) writeIdleReadingIfNeeded(chargerID int, chargerName string, totalEnergy float64, state string) {
	shouldWrite, interval := zc.shouldWriteIdleReading(chargerID)
	if !shouldWrite {
		return
	}
	
	zc.mu.RLock()
	activeSessionID := zc.activeSessionIDs[chargerID]
	zc.mu.RUnlock()
	
	gapUserID := zc.dbHandler.GetGapUserID(chargerID, activeSessionID)
	
	if activeSessionID != "" {
		log.Printf("Zaptec: [%s] Gap during active session %s, using user_id: %s", 
			chargerName, activeSessionID, gapUserID)
	} else {
		log.Printf("Zaptec: [%s] Gap after session end, charger available (no user)", chargerName)
	}
	
	written := zc.dbHandler.WriteIdleReading(chargerID, gapUserID, interval, totalEnergy, state)
	
	if written {
		zc.mu.Lock()
		zc.lastIdleWrite[chargerID] = interval
		zc.mu.Unlock()
		
		timestamp := interval.Format("2006-01-02 15:04:05-07:00")
		log.Printf("Zaptec: [%s] ⏱ IDLE READING: Time=%s, Energy=%.3f kWh, State=%s", 
			chargerName, timestamp, totalEnergy, state)
	}
}

func (zc *ZaptecCollector) shouldWriteIdleReading(chargerID int) (bool, time.Time) {
	now := time.Now().In(zc.localTimezone)
	
	minutes := now.Minute()
	var roundedMinutes int
	if minutes < 15 {
		roundedMinutes = 0
	} else if minutes < 30 {
		roundedMinutes = 15
	} else if minutes < 45 {
		roundedMinutes = 30
	} else {
		roundedMinutes = 45
	}
	currentInterval := time.Date(now.Year(), now.Month(), now.Day(), now.Hour(), roundedMinutes, 0, 0, zc.localTimezone)
	
	zc.mu.RLock()
	lastWrite, hasLastWrite := zc.lastIdleWrite[chargerID]
	zc.mu.RUnlock()
	
	if hasLastWrite && !lastWrite.Before(currentInterval) {
		return false, time.Time{}
	}
	
	timeSinceInterval := now.Sub(currentInterval)
	if timeSinceInterval > 2*time.Minute {
		return false, time.Time{}
	}
	
	return true, currentInterval
}

// ========== PUBLIC API FOR UI ==========

func (zc *ZaptecCollector) GetChargerData(chargerID int) (*zaptec.LiveData, bool) {
	zc.mu.RLock()
	defer zc.mu.RUnlock()
	
	data, exists := zc.liveChargerData[chargerID]
	if !exists || time.Since(data.Timestamp) > 30*time.Second {
		return nil, false
	}
	
	return data, true
}

func (zc *ZaptecCollector) GetLiveSession(chargerID int) (*zaptec.SessionData, bool) {
	zc.mu.RLock()
	defer zc.mu.RUnlock()
	
	data, exists := zc.liveChargerData[chargerID]
	if !exists || time.Since(data.Timestamp) > 30*time.Second {
		return nil, false
	}
	
	if data.OperatingMode != 3 {
		return nil, false
	}
	
	return &zaptec.SessionData{
		SessionID: data.SessionID,
		Energy:    data.SessionEnergy_kWh,
		StartTime: data.SessionStart,
		UserID:    data.UserID,
		UserName:  data.UserName,
		IsActive:  true,
		Power_kW:  data.CurrentPower_kW,
		Timestamp: data.Timestamp,
	}, true
}

func (zc *ZaptecCollector) GetConnectionStatus() map[string]interface{} {
	zc.mu.RLock()
	defer zc.mu.RUnlock()
	
	chargerStatuses := make(map[int]map[string]interface{})
	
	rows, err := zc.db.Query(`
		SELECT id, name, connection_config
		FROM chargers 
		WHERE is_active = 1 AND connection_type = 'zaptec_api'
	`)
	if err != nil {
		return map[string]interface{}{"zaptec_charger_connections": chargerStatuses}
	}
	defer rows.Close()
	
	for rows.Next() {
		var id int
		var name, configJSON string
		
		if err := rows.Scan(&id, &name, &configJSON); err != nil {
			continue
		}
		
		var config zaptec.ConnectionConfig
		json.Unmarshal([]byte(configJSON), &config)
		
		data, exists := zc.liveChargerData[id]
		isConnected := exists && time.Since(data.Timestamp) < 30*time.Second
		
		status := map[string]interface{}{
			"charger_name":    name,
			"charger_id":      config.ChargerID,
			"is_connected":    isConnected,
			"last_update":     "",
			"is_online":       false,
			"collection_mode": "OCMF + Gap Filling",
		}
		
		if exists {
			status["last_update"] = data.Timestamp.Format("2006-01-02 15:04:05")
			status["is_online"] = data.IsOnline
			status["current_power_kw"] = data.CurrentPower_kW
			status["total_energy_kwh"] = data.TotalEnergy_kWh
			status["state_description"] = data.StateDescription
			status["operating_mode"] = data.OperatingMode
			
			if data.OperatingMode == 3 {
				status["live_session"] = map[string]interface{}{
					"session_id":     data.SessionID,
					"energy_kwh":     data.SessionEnergy_kWh,
					"start_time":     data.SessionStart.Format("2006-01-02 15:04:05"),
					"duration":       zaptec.FormatDuration(time.Since(data.SessionStart)),
					"user_id":        data.UserID,
					"power_kw":       data.CurrentPower_kW,
					"is_active":      true,
					"note":           "Live session - OCMF data written after completion",
				}
			} else if data.SessionID != "" {
				status["last_session"] = map[string]interface{}{
					"session_id": data.SessionID,
					"energy_kwh": data.SessionEnergy_kWh,
					"user_id":    data.UserID,
					"user_name":  data.UserName,
				}
			}
		}
		
		if _, hasToken := zc.accessTokens[id]; hasToken {
			status["token_expires"] = zc.tokenExpiries[id].Format("2006-01-02 15:04:05")
		}
		
		chargerStatuses[id] = status
	}
	
	return map[string]interface{}{
		"zaptec_charger_connections": chargerStatuses,
		"collection_mode":            "Optimized: OCMF SignedSession + 15-min Gap Filling + Fallback Detection",
	}
}

func (zc *ZaptecCollector) GetAllAvailableChargers() ([]map[string]interface{}, error) {
	var configJSON string
	err := zc.db.QueryRow(`
		SELECT connection_config
		FROM chargers 
		WHERE is_active = 1 AND connection_type = 'zaptec_api'
		LIMIT 1
	`).Scan(&configJSON)
	
	if err != nil {
		return nil, err
	}
	
	var config zaptec.ConnectionConfig
	if err := json.Unmarshal([]byte(configJSON), &config); err != nil {
		return nil, err
	}
	
	token, err := zc.authHandler.GetAccessToken(0, config)
	if err != nil {
		return nil, err
	}
	
	return zc.apiClient.GetAllAvailableChargers(token)
}

// Legacy compatibility methods
func (zc *ZaptecCollector) GetCompletedSession(chargerID int) (*zaptec.CompletedSession, bool) {
	return nil, false
}

func (zc *ZaptecCollector) MarkSessionProcessed(sessionID string) {
	// No-op - sessions are automatically marked as processed
}