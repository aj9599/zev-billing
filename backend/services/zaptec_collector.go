package services

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
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
	liveChargerData  map[int]*ZaptecLiveData
	
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
}

// ZaptecLiveData holds live charger data for UI display
type ZaptecLiveData struct {
	// Charger info
	ChargerName      string
	DeviceName       string
	IsOnline         bool
	
	// Current state
	State            string  // "0"=offline, "1"=disconnected, "2"=waiting, "3"=charging, "5"=finished
	StateDescription string
	OperatingMode    int
	Mode             string  // For backward compatibility with data_collector
	
	// Live metrics (for UI display during charging)
	CurrentPower_kW  float64
	TotalEnergy_kWh  float64  // SignedMeterValueKwh - total through charger
	TotalEnergy      float64  // Alias for backward compatibility
	SessionEnergy_kWh float64 // Current session energy (from StateId 553)
	SessionEnergy    float64  // Alias for backward compatibility
	Voltage          float64
	Current          float64
	Power_kW         float64  // Alias for backward compatibility
	
	// Session info (for UI display)
	SessionID        string
	CurrentSession   string   // Alias for backward compatibility
	SessionStart     time.Time
	UserID           string   // Best-effort during charging, accurate after
	UserName         string
	
	Timestamp        time.Time
}

// OCMFData represents parsed OCMF (Open Charge Metering Format) data
type OCMFData struct {
	FormatVersion    string           `json:"FV"`
	GatewayID        string           `json:"GI"`
	GatewaySerial    string           `json:"GS"`
	GatewayVersion   string           `json:"GV"`
	Pagination       string           `json:"PG"`
	MeterFirmware    string           `json:"MF"`
	IdentificationStatus bool         `json:"IS"`
	IdentificationLevel  string       `json:"IL"`
	IdentificationFlags  []string     `json:"IF"`
	IdentificationType   string       `json:"IT"`
	IdentificationData   string       `json:"ID"`  // RFID token!
	ReadingData      []OCMFReading    `json:"RD"`
	ZaptecSession    string           `json:"ZS"`
}

// OCMFReading represents a single meter reading in OCMF format
type OCMFReading struct {
	Timestamp    string  `json:"TM"`  // "2025-11-24T12:35:09,990+00:00 R"
	Type         string  `json:"TX"`  // "B"=Begin, "T"=Tariff/intermediate, "E"=End
	ReadingValue float64 `json:"RV"`  // Meter reading in kWh
	ReadingID    string  `json:"RI"`  // "1-0:1.8.0" (OBIS code)
	ReadingUnit  string  `json:"RU"`  // "kWh"
	Status       string  `json:"ST"`  // "G"=Good
}

// SessionMeterReading represents a single database entry from OCMF data
type SessionMeterReading struct {
	Timestamp   time.Time
	Energy_kWh  float64
	ReadingType string  // "B", "T", or "E"
}

// CompletedSession holds all data needed to write a completed session to database
type CompletedSession struct {
	SessionID       string
	ChargerID       int
	ChargerName     string
	UserID          string  // From OCMF ID field (RFID token)
	UserName        string
	StartTime       time.Time
	EndTime         time.Time
	TotalEnergy_kWh float64
	FinalEnergy     float64  // Alias for backward compatibility
	MeterReadings   []SessionMeterReading
}

// API Response types
type ZaptecAuthResponse struct {
	AccessToken string `json:"access_token"`
	ExpiresIn   int    `json:"expires_in"`
	TokenType   string `json:"token_type"`
}

type ZaptecChargerDetails struct {
	ID                   string  `json:"Id"`
	DeviceID             string  `json:"DeviceId"`
	Name                 string  `json:"Name"`
	DeviceName           string  `json:"DeviceName"`
	Active               bool    `json:"Active"`
	IsOnline             bool    `json:"IsOnline"`
	OperatingMode        int     `json:"OperatingMode"`
	SignedMeterValueKwh  float64 `json:"SignedMeterValueKwh"`
	TotalChargePower     float64 `json:"TotalChargePower"`
	Voltage              float64 `json:"Voltage"`
	Current              float64 `json:"Current"`
	InstallationID       string  `json:"InstallationId"`
	InstallationName     string  `json:"InstallationName"`
}

type ZaptecChargeHistory struct {
	ID              string  `json:"Id"`
	DeviceID        string  `json:"DeviceId"`
	StartDateTime   string  `json:"StartDateTime"`
	EndDateTime     string  `json:"EndDateTime"`
	Energy          float64 `json:"Energy"`
	UserFullName    string  `json:"UserFullName"`
	ChargerID       string  `json:"ChargerId"`
	DeviceName      string  `json:"DeviceName"`
	UserEmail       string  `json:"UserEmail"`
	UserID          string  `json:"UserId"`
	TokenName       string  `json:"TokenName"`
	ExternalID      string  `json:"ExternalId"`
	SignedSession   string  `json:"SignedSession"`  // OCMF data!
}

type ZaptecAPIResponse struct {
	Pages   int                   `json:"Pages"`
	Data    []json.RawMessage     `json:"Data"`
	Message string                `json:"Message"`
}

type ZaptecConnectionConfig struct {
	Username       string `json:"zaptec_username"`
	Password       string `json:"zaptec_password"`
	ChargerID      string `json:"zaptec_charger_id"`
	InstallationID string `json:"zaptec_installation_id,omitempty"`
}

type ZaptecChargerInfo struct {
	ID                   string  `json:"Id"`
	DeviceID             string  `json:"DeviceId"`
	Name                 string  `json:"Name"`
	Active               bool    `json:"Active"`
	IsOnline             bool    `json:"IsOnline"`
	OperatingMode        int     `json:"OperatingMode"`
	SignedMeterValueKwh  float64 `json:"SignedMeterValueKwh"`
	InstallationID       string  `json:"InstallationId"`
	InstallationName     string  `json:"InstallationName"`
}

// Legacy types for API compatibility
type ZaptecChargerData = ZaptecLiveData
type ZaptecSessionData struct {
	SessionID   string
	Energy      float64
	StartTime   time.Time
	EndTime     time.Time
	UserID      string
	UserName    string
	IsActive    bool
	Power_kW    float64
	Timestamp   time.Time
}

func NewZaptecCollector(db *sql.DB) *ZaptecCollector {
	// Load local timezone (Europe/Zurich = UTC+1 / UTC+2 in summer)
	localTZ, err := time.LoadLocation("Europe/Zurich")
	if err != nil {
		log.Printf("WARNING: Could not load Europe/Zurich timezone, using UTC: %v", err)
		localTZ = time.UTC
	}
	
	return &ZaptecCollector{
		db:                db,
		client:            &http.Client{Timeout: 30 * time.Second},
		liveChargerData:   make(map[int]*ZaptecLiveData),
		accessTokens:      make(map[int]string),
		tokenExpiries:     make(map[int]time.Time),
		activeSessionIDs:  make(map[int]string),
		previousStates:    make(map[int]int),
		processedSessions: make(map[string]bool),
		lastIdleWrite:     make(map[int]time.Time),
		stopChan:          make(chan bool),
		apiBaseURL:        "https://api.zaptec.com",
		localTimezone:     localTZ,
	}
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
	zc.liveChargerData = make(map[int]*ZaptecLiveData)
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
		
		var config ZaptecConnectionConfig
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

// loadProcessedSessions loads session IDs that have already been written to database
// This prevents duplicate writes after service restarts
func (zc *ZaptecCollector) loadProcessedSessions() {
	// We need to identify unique sessions - we'll use a combination of user_id and session_time
	// to create a pseudo session_id since charger_sessions doesn't have a session_id field
	rows, err := zc.db.Query(`
		SELECT DISTINCT charger_id, user_id, session_time, power_kwh
		FROM charger_sessions 
		WHERE user_id IS NOT NULL 
		  AND user_id != ''
		  AND session_time > datetime('now', '-30 days')
		  AND state = '3'
		ORDER BY session_time DESC
	`)
	if err != nil {
		log.Printf("WARNING: Could not load processed sessions: %v", err)
		return
	}
	defer rows.Close()
	
	// Build a map of recent sessions to detect duplicates
	sessionMap := make(map[string]bool)
	count := 0
	
	for rows.Next() {
		var chargerID int
		var userID, sessionTime string
		var energy float64
		
		if err := rows.Scan(&chargerID, &userID, &sessionTime, &energy); err == nil {
			// Create a pseudo-session-id from the data
			sessionKey := fmt.Sprintf("%d_%s_%s", chargerID, userID, sessionTime)
			sessionMap[sessionKey] = true
			count++
		}
	}
	
	zc.mu.Lock()
	// Store the session map for later duplicate checking
	// We'll check against this during writes
	zc.mu.Unlock()
	
	log.Printf("Zaptec Collector: Loaded %d recent sessions from last 30 days", count)
}

func (zc *ZaptecCollector) getAccessToken(chargerID int, config ZaptecConnectionConfig) (string, error) {
	zc.mu.RLock()
	token, exists := zc.accessTokens[chargerID]
	expiry, hasExpiry := zc.tokenExpiries[chargerID]
	zc.mu.RUnlock()
	
	if exists && hasExpiry && time.Now().Add(5*time.Minute).Before(expiry) {
		return token, nil
	}
	
	authURL := fmt.Sprintf("%s/oauth/token", zc.apiBaseURL)
	
	formData := url.Values{}
	formData.Set("grant_type", "password")
	formData.Set("username", config.Username)
	formData.Set("password", config.Password)
	
	req, err := http.NewRequest("POST", authURL, bytes.NewBufferString(formData.Encode()))
	if err != nil {
		return "", fmt.Errorf("failed to create auth request: %v", err)
	}
	
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")
	
	resp, err := zc.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("auth request failed: %v", err)
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("auth failed with status %d: %s", resp.StatusCode, string(body))
	}
	
	var authResp ZaptecAuthResponse
	if err := json.NewDecoder(resp.Body).Decode(&authResp); err != nil {
		return "", fmt.Errorf("failed to decode auth response: %v", err)
	}
	
	zc.mu.Lock()
	zc.accessTokens[chargerID] = authResp.AccessToken
	zc.tokenExpiries[chargerID] = time.Now().Add(time.Duration(authResp.ExpiresIn) * time.Second)
	zc.mu.Unlock()
	
	log.Printf("Zaptec: Obtained new access token for charger %d (expires in %d seconds)", chargerID, authResp.ExpiresIn)
	
	return authResp.AccessToken, nil
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
	var config ZaptecConnectionConfig
	if err := json.Unmarshal([]byte(configJSON), &config); err != nil {
		log.Printf("ERROR: Invalid Zaptec config for charger %s: %v", chargerName, err)
		return
	}
	
	token, err := zc.getAccessToken(chargerID, config)
	if err != nil {
		log.Printf("ERROR: Failed to get Zaptec token for charger %s: %v", chargerName, err)
		return
	}
	
	// Get charger details
	chargerDetails, err := zc.getChargerDetails(token, config.ChargerID)
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
	stateData, _ := zc.getChargerStateValues(token, config.ChargerID)
	if stateData == nil {
		stateData = make(map[int]string)
	}
	
	// Build live data for UI display (ALWAYS AVAILABLE)
	liveData := &ZaptecLiveData{
		ChargerName:      chargerDetails.Name,
		DeviceName:       chargerDetails.DeviceName,
		IsOnline:         chargerDetails.IsOnline,
		OperatingMode:    currentState,
		State:            zc.mapOperatingModeToState(currentState, chargerDetails.IsOnline),
		StateDescription: zc.getStateDescription(currentState),
		TotalEnergy_kWh:  chargerDetails.SignedMeterValueKwh,
		TotalEnergy:      chargerDetails.SignedMeterValueKwh, // Backward compatibility
		CurrentPower_kW:  chargerDetails.TotalChargePower / 1000.0,
		Power_kW:         chargerDetails.TotalChargePower / 1000.0, // Backward compatibility
		Voltage:          chargerDetails.Voltage,
		Current:          chargerDetails.Current,
		Mode:             "1", // Backward compatibility - always "1" for Zaptec
		Timestamp:        time.Now(),
	}
	
	// Get power from StateId 513 if available (more accurate)
	if powerStr, ok := stateData[513]; ok {
		if powerVal, err := zc.parseStateValue(powerStr); err == nil {
			liveData.CurrentPower_kW = powerVal / 1000.0
			liveData.Power_kW = powerVal / 1000.0 // Backward compatibility
		}
	}
	
	// ========== CHARGING STATE (OperatingMode == 3) ==========
	if currentState == 3 {
		// Get session ID from StateId 721
		if sessionID, ok := stateData[721]; ok && sessionID != "" {
			liveData.SessionID = sessionID
			liveData.CurrentSession = sessionID // Backward compatibility
			
			zc.mu.Lock()
			zc.activeSessionIDs[chargerID] = sessionID
			zc.mu.Unlock()
		}
		
		// Get session energy from StateId 553 (for live display)
		if sessionEnergyStr, ok := stateData[553]; ok {
			if energyVal, err := zc.parseStateValue(sessionEnergyStr); err == nil {
				liveData.SessionEnergy_kWh = energyVal / 1000.0
				liveData.SessionEnergy = energyVal / 1000.0 // Backward compatibility
			}
		}
		
		// Get user ID from StateId 722 (best-effort for live display)
		// Note: This may be inconsistent, but it's just for UI during charging
		if userID, ok := stateData[722]; ok && userID != "" {
			liveData.UserID = userID
		} else {
			liveData.UserID = "charging..." // Indicate we'll get accurate data after session
		}
		
		// Try to get session start time from StateId 710
		if startTimeStr, ok := stateData[710]; ok {
			liveData.SessionStart = zc.parseZaptecTime(startTimeStr)
		}
		
		log.Printf("Zaptec: [%s] CHARGING: Session=%s, Energy=%.3f kWh, Power=%.2f kW", 
			chargerName, liveData.SessionID, liveData.SessionEnergy_kWh, liveData.CurrentPower_kW)
		
	} else {
		// ========== NOT CHARGING - Check for session end ==========
		
		// Detect transition from charging (state 3) to finished (state 1 or 5)
		if previousState == 3 && previousSessionID != "" {
			log.Printf("Zaptec: [%s] Session ended (state %d -> %d), processing session %s", 
				chargerName, previousState, currentState, previousSessionID)
			
			// Process the completed session in background
			go zc.processCompletedSession(chargerID, chargerName, config, token, previousSessionID)
			
			// Clear active session
			zc.mu.Lock()
			delete(zc.activeSessionIDs, chargerID)
			zc.mu.Unlock()
		}
		
		// ========== GAP FILLING: Write idle readings at 15-minute intervals ==========
		zc.writeIdleReadingIfNeeded(chargerID, chargerName, liveData.TotalEnergy_kWh, liveData.State)
		
		// ========== FALLBACK: Check for any unprocessed sessions in history ==========
		// This catches sessions missed due to service restarts or missed transitions
		history, err := zc.getRecentChargeHistory(token, config.ChargerID, 5)
		if err == nil && len(history) > 0 {
			// For UI: show last session info from most recent session
			lastSession := history[0]
			liveData.SessionID = lastSession.ID
			liveData.CurrentSession = lastSession.ID // Backward compatibility
			liveData.SessionEnergy_kWh = lastSession.Energy
			liveData.SessionEnergy = lastSession.Energy // Backward compatibility
			liveData.UserID = lastSession.UserID
			liveData.UserName = lastSession.UserFullName
			liveData.SessionStart = zc.parseZaptecTime(lastSession.StartDateTime)
			
			// Check ALL recent sessions for unprocessed ones (FALLBACK DETECTION)
			for _, session := range history {
				zc.mu.RLock()
				alreadyProcessed := zc.processedSessions[session.ID]
				zc.mu.RUnlock()
				
				if !alreadyProcessed && session.Energy > 0 {
					// Check if session is actually completed (has EndDateTime)
					endTime := zc.parseZaptecTime(session.EndDateTime)
					if !endTime.IsZero() && time.Since(endTime) > 30*time.Second {
						log.Printf("Zaptec: [%s] FALLBACK: Found unprocessed session %s (%.3f kWh), processing now...", 
							chargerName, session.ID, session.Energy)
						go zc.processCompletedSession(chargerID, chargerName, config, token, session.ID)
					}
				}
			}
		}
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

// processCompletedSession fetches charge history with SignedSession and writes OCMF data to database
func (zc *ZaptecCollector) processCompletedSession(chargerID int, chargerName string, config ZaptecConnectionConfig, token, sessionID string) {
	// Check if already processed
	zc.mu.RLock()
	if zc.processedSessions[sessionID] {
		zc.mu.RUnlock()
		log.Printf("Zaptec: [%s] Session %s already processed, skipping", chargerName, sessionID)
		return
	}
	zc.mu.RUnlock()
	
	// Wait a moment for Zaptec API to finalize the session data
	time.Sleep(5 * time.Second)
	
	// Fetch recent charge history to get SignedSession
	history, err := zc.getRecentChargeHistory(token, config.ChargerID, 5)
	if err != nil {
		log.Printf("ERROR: [%s] Failed to get charge history: %v", chargerName, err)
		return
	}
	
	// Find the session we're looking for
	var targetSession *ZaptecChargeHistory
	for i := range history {
		if history[i].ID == sessionID {
			targetSession = &history[i]
			break
		}
	}
	
	// If not found by ID, use the most recent one
	if targetSession == nil && len(history) > 0 {
		targetSession = &history[0]
		log.Printf("Zaptec: [%s] Session %s not found in history, using most recent: %s", 
			chargerName, sessionID, targetSession.ID)
	}
	
	if targetSession == nil {
		log.Printf("ERROR: [%s] No session found in charge history", chargerName)
		return
	}
	
	// Check again if this session was already processed
	zc.mu.RLock()
	if zc.processedSessions[targetSession.ID] {
		zc.mu.RUnlock()
		log.Printf("Zaptec: [%s] Session %s already processed, skipping", chargerName, targetSession.ID)
		return
	}
	zc.mu.RUnlock()
	
	// Parse the SignedSession OCMF data for accurate meter readings
	completedSession, err := zc.parseSignedSession(targetSession, chargerID, chargerName)
	if err != nil {
		log.Printf("ERROR: [%s] Failed to parse SignedSession: %v", chargerName, err)
		// Fallback: write single entry with session totals
		zc.writeSessionFallback(targetSession, chargerID, chargerName)
		return
	}
	
	// Write all OCMF meter readings to database
	err = zc.writeSessionToDatabase(completedSession)
	if err != nil {
		log.Printf("ERROR: [%s] Failed to write session to database: %v", chargerName, err)
		return
	}
	
	// Mark as processed
	zc.mu.Lock()
	zc.processedSessions[completedSession.SessionID] = true
	zc.mu.Unlock()
	
	log.Printf("Zaptec: [%s] ✓ SESSION WRITTEN: ID=%s, User=%s, Energy=%.3f kWh, OCMF Readings=%d", 
		chargerName, completedSession.SessionID, completedSession.UserID, 
		completedSession.TotalEnergy_kWh, len(completedSession.MeterReadings))
}

// parseSignedSession extracts meter readings from OCMF SignedSession data
func (zc *ZaptecCollector) parseSignedSession(history *ZaptecChargeHistory, chargerID int, chargerName string) (*CompletedSession, error) {
	if history.SignedSession == "" {
		return nil, fmt.Errorf("no SignedSession data")
	}
	
	// SignedSession format: "OCMF|{json}|{signature}"
	parts := strings.SplitN(history.SignedSession, "|", 3)
	if len(parts) < 2 || parts[0] != "OCMF" {
		return nil, fmt.Errorf("invalid SignedSession format")
	}
	
	// Parse OCMF JSON
	var ocmf OCMFData
	if err := json.Unmarshal([]byte(parts[1]), &ocmf); err != nil {
		return nil, fmt.Errorf("failed to parse OCMF JSON: %v", err)
	}
	
	if len(ocmf.ReadingData) == 0 {
		return nil, fmt.Errorf("no reading data in OCMF")
	}
	
	// Extract user ID from OCMF (RFID token) - most accurate source
	userID := history.UserID
	if ocmf.IdentificationData != "" {
		// Prefix with identification type for clarity
		switch ocmf.IdentificationType {
		case "ISO14443":
			userID = "nfc-" + ocmf.IdentificationData
		case "ISO15693":
			userID = "rfid-" + ocmf.IdentificationData
		default:
			if ocmf.IdentificationData != "" {
				userID = "token-" + ocmf.IdentificationData
			}
		}
	}
	
	// Parse all meter readings from OCMF
	var readings []SessionMeterReading
	var startTime, endTime time.Time
	var startEnergy, endEnergy float64
	
	for _, rd := range ocmf.ReadingData {
		ts := zc.parseOCMFTimestamp(rd.Timestamp)
		if ts.IsZero() {
			continue
		}
		
		reading := SessionMeterReading{
			Timestamp:   ts,
			Energy_kWh:  rd.ReadingValue,
			ReadingType: rd.Type,
		}
		readings = append(readings, reading)
		
		// Track start and end
		switch rd.Type {
		case "B": // Begin
			startTime = ts
			startEnergy = rd.ReadingValue
		case "E": // End
			endTime = ts
			endEnergy = rd.ReadingValue
		}
	}
	
	// Calculate total energy from OCMF meter readings
	totalEnergy := history.Energy
	if endEnergy > startEnergy {
		totalEnergy = endEnergy - startEnergy
	}
	
	// Use history times as fallback
	if startTime.IsZero() {
		startTime = zc.parseZaptecTime(history.StartDateTime)
	}
	if endTime.IsZero() {
		endTime = zc.parseZaptecTime(history.EndDateTime)
	}
	
	return &CompletedSession{
		SessionID:       history.ID,
		ChargerID:       chargerID,
		ChargerName:     chargerName,
		UserID:          userID,
		UserName:        history.UserFullName,
		StartTime:       startTime,
		EndTime:         endTime,
		TotalEnergy_kWh: totalEnergy,
		FinalEnergy:     totalEnergy, // Backward compatibility
		MeterReadings:   readings,
	}, nil
}

// parseOCMFTimestamp parses OCMF timestamp format: "2025-11-24T12:35:09,990+00:00 R"
// OCMF timestamps are in UTC, this converts them to local timezone (Europe/Zurich)
func (zc *ZaptecCollector) parseOCMFTimestamp(ts string) time.Time {
	if ts == "" {
		return time.Time{}
	}
	
	// Remove trailing " R" or " S" (reading type indicator)
	ts = strings.TrimSuffix(ts, " R")
	ts = strings.TrimSuffix(ts, " S")
	
	// Replace comma with dot for fractional seconds
	ts = strings.Replace(ts, ",", ".", 1)
	
	// Try parsing with various formats
	formats := []string{
		"2006-01-02T15:04:05.999-07:00",
		"2006-01-02T15:04:05.999Z07:00",
		"2006-01-02T15:04:05.999+00:00",
		"2006-01-02T15:04:05-07:00",
		"2006-01-02T15:04:05+00:00",
		"2006-01-02T15:04:05Z",
		time.RFC3339,
		time.RFC3339Nano,
	}
	
	for _, format := range formats {
		if t, err := time.Parse(format, ts); err == nil {
			// Convert from UTC to local timezone
			return t.In(zc.localTimezone)
		}
	}
	
	return time.Time{}
}

// writeSessionToDatabase writes all OCMF meter readings from a completed session to charger_sessions table
// Handles sessions spanning midnight correctly by preserving original timestamps
func (zc *ZaptecCollector) writeSessionToDatabase(session *CompletedSession) error {
	if len(session.MeterReadings) == 0 {
		return fmt.Errorf("no readings to write")
	}
	
	// Check if we already have data for this session (by checking first reading timestamp)
	firstReading := session.MeterReadings[0]
	firstTimestamp := firstReading.Timestamp.Format("2006-01-02 15:04:05")
	
	var existingCount int
	err := zc.db.QueryRow(`
		SELECT COUNT(*) FROM charger_sessions 
		WHERE charger_id = ? AND user_id = ? AND session_time = ?
	`, session.ChargerID, session.UserID, firstTimestamp).Scan(&existingCount)
	
	if err == nil && existingCount > 0 {
		log.Printf("Zaptec: [%s] Session already exists in database (timestamp %s), skipping", 
			session.ChargerName, firstTimestamp)
		return nil
	}
	
	tx, err := zc.db.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %v", err)
	}
	defer tx.Rollback()
	
	// Prepare insert statement for charger_sessions
	stmt, err := tx.Prepare(`
		INSERT OR IGNORE INTO charger_sessions (charger_id, user_id, session_time, power_kwh, mode, state)
		VALUES (?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		return fmt.Errorf("failed to prepare statement: %v", err)
	}
	defer stmt.Close()
	
	insertCount := 0
	// Insert each OCMF reading - timestamps are already in local timezone
	for _, reading := range session.MeterReadings {
		// Format timestamp for SQLite
		localTimestamp := reading.Timestamp.Format("2006-01-02 15:04:05")
		
		// State: "3" for charging readings
		state := "3" // Charging
		
		result, err := stmt.Exec(
			session.ChargerID,
			session.UserID,
			localTimestamp,
			reading.Energy_kWh,
			"1", // mode = normal
			state,
		)
		if err != nil {
			log.Printf("WARNING: Failed to insert OCMF reading: %v", err)
			continue
		}
		
		rowsAffected, _ := result.RowsAffected()
		if rowsAffected > 0 {
			insertCount++
		}
	}
	
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %v", err)
	}
	
	log.Printf("Zaptec: [%s] Inserted %d/%d OCMF readings for session", session.ChargerName, insertCount, len(session.MeterReadings))
	
	return nil
}

// writeSessionFallback writes session data when OCMF parsing fails
func (zc *ZaptecCollector) writeSessionFallback(history *ZaptecChargeHistory, chargerID int, chargerName string) {
	startTime := zc.parseZaptecTime(history.StartDateTime)
	endTime := zc.parseZaptecTime(history.EndDateTime)
	
	if startTime.IsZero() || endTime.IsZero() {
		log.Printf("ERROR: [%s] Cannot write fallback - invalid timestamps", chargerName)
		return
	}
	
	userID := history.UserID
	if userID == "" {
		userID = "unknown"
	}
	
	// Format timestamps for SQLite
	localStartTime := startTime.In(zc.localTimezone).Format("2006-01-02 15:04:05")
	localEndTime := endTime.In(zc.localTimezone).Format("2006-01-02 15:04:05")
	
	// Check if already exists
	var existingCount int
	err := zc.db.QueryRow(`
		SELECT COUNT(*) FROM charger_sessions 
		WHERE charger_id = ? AND user_id = ? AND session_time = ?
	`, chargerID, userID, localStartTime).Scan(&existingCount)
	
	if err == nil && existingCount > 0 {
		log.Printf("Zaptec: [%s] Fallback session already exists, skipping", chargerName)
		zc.mu.Lock()
		zc.processedSessions[history.ID] = true
		zc.mu.Unlock()
		return
	}
	
	// Get baseline energy (we need to estimate start energy)
	var baselineEnergy float64
	err = zc.db.QueryRow(`
		SELECT power_kwh FROM charger_sessions 
		WHERE charger_id = ? 
		ORDER BY session_time DESC LIMIT 1
	`, chargerID).Scan(&baselineEnergy)
	if err != nil {
		baselineEnergy = 0
	}
	
	startEnergy := baselineEnergy
	endEnergy := baselineEnergy + history.Energy
	
	// Write start reading
	_, err = zc.db.Exec(`
		INSERT OR IGNORE INTO charger_sessions (charger_id, user_id, session_time, power_kwh, mode, state)
		VALUES (?, ?, ?, ?, ?, ?)
	`, chargerID, userID, localStartTime, startEnergy, "1", "3")
	
	if err != nil {
		log.Printf("WARNING: [%s] Failed to write fallback start: %v", chargerName, err)
	}
	
	// Write end reading
	_, err = zc.db.Exec(`
		INSERT OR IGNORE INTO charger_sessions (charger_id, user_id, session_time, power_kwh, mode, state)
		VALUES (?, ?, ?, ?, ?, ?)
	`, chargerID, userID, localEndTime, endEnergy, "1", "3")
	
	if err != nil {
		log.Printf("ERROR: [%s] Failed to write fallback end: %v", chargerName, err)
		return
	}
	
	// Mark as processed
	zc.mu.Lock()
	zc.processedSessions[history.ID] = true
	zc.mu.Unlock()
	
	log.Printf("Zaptec: [%s] ⚠ FALLBACK SESSION WRITTEN: ID=%s, User=%s, Energy=%.3f kWh", 
		chargerName, history.ID, userID, history.Energy)
}

// writeIdleReadingIfNeeded writes an idle reading at 15-minute intervals when not charging
// This fills gaps in the data so billing/dashboard can show continuous data
func (zc *ZaptecCollector) writeIdleReadingIfNeeded(chargerID int, chargerName string, totalEnergy float64, state string) {
	now := time.Now().In(zc.localTimezone)
	
	// Round to current 15-minute interval
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
	
	// Check if we already wrote for this interval
	zc.mu.RLock()
	lastWrite, hasLastWrite := zc.lastIdleWrite[chargerID]
	zc.mu.RUnlock()
	
	if hasLastWrite && !lastWrite.Before(currentInterval) {
		// Already wrote for this interval
		return
	}
	
	// Only write if we're within 2 minutes of the interval boundary
	// This prevents writing too early or too late
	timeSinceInterval := now.Sub(currentInterval)
	if timeSinceInterval > 2*time.Minute {
		// Too late for this interval, wait for the next one
		return
	}
	
	// Format timestamp for SQLite
	timestamp := currentInterval.Format("2006-01-02 15:04:05")
	
	// Write idle reading with no user, current state
	result, err := zc.db.Exec(`
		INSERT OR IGNORE INTO charger_sessions (charger_id, user_id, session_time, power_kwh, mode, state)
		VALUES (?, ?, ?, ?, ?, ?)
	`, chargerID, "", timestamp, totalEnergy, "1", state)
	
	if err != nil {
		log.Printf("Zaptec: [%s] Could not write idle reading: %v", chargerName, err)
		return
	}
	
	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		// Already exists, just update the tracking
		zc.mu.Lock()
		zc.lastIdleWrite[chargerID] = currentInterval
		zc.mu.Unlock()
		return
	}
	
	// Update last write time
	zc.mu.Lock()
	zc.lastIdleWrite[chargerID] = currentInterval
	zc.mu.Unlock()
	
	log.Printf("Zaptec: [%s] ⏱ IDLE READING: Time=%s, Energy=%.3f kWh, State=%s", 
		chargerName, timestamp, totalEnergy, state)
}

// ========== API METHODS ==========

func (zc *ZaptecCollector) getChargerDetails(token, chargerID string) (*ZaptecChargerDetails, error) {
	chargerURL := fmt.Sprintf("%s/api/chargers/%s", zc.apiBaseURL, chargerID)
	
	req, err := http.NewRequest("GET", chargerURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %v", err)
	}
	
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", token))
	req.Header.Set("Accept", "application/json")
	
	resp, err := zc.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %v", err)
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("request failed with status %d: %s", resp.StatusCode, string(body))
	}
	
	var details ZaptecChargerDetails
	if err := json.NewDecoder(resp.Body).Decode(&details); err != nil {
		return nil, fmt.Errorf("failed to decode response: %v", err)
	}
	
	return &details, nil
}

func (zc *ZaptecCollector) getChargerStateValues(token, chargerID string) (map[int]string, error) {
	stateURL := fmt.Sprintf("%s/api/chargers/%s/state", zc.apiBaseURL, chargerID)
	
	req, err := http.NewRequest("GET", stateURL, nil)
	if err != nil {
		return nil, err
	}
	
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", token))
	req.Header.Set("Accept", "application/json")
	
	resp, err := zc.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("status %d", resp.StatusCode)
	}
	
	var states []map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&states); err != nil {
		return nil, err
	}
	
	stateValues := make(map[int]string)
	for _, stateObj := range states {
		if stateID, ok := stateObj["StateId"].(float64); ok {
			if valueAsString, ok := stateObj["ValueAsString"].(string); ok {
				stateValues[int(stateID)] = valueAsString
			}
		}
	}
	
	return stateValues, nil
}

func (zc *ZaptecCollector) getRecentChargeHistory(token, chargerID string, pageSize int) ([]ZaptecChargeHistory, error) {
	historyURL := fmt.Sprintf("%s/api/chargehistory?ChargerId=%s&PageSize=%d", 
		zc.apiBaseURL, chargerID, pageSize)
	
	req, err := http.NewRequest("GET", historyURL, nil)
	if err != nil {
		return nil, err
	}
	
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", token))
	req.Header.Set("Accept", "application/json")
	
	resp, err := zc.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("status %d", resp.StatusCode)
	}
	
	var apiResp ZaptecAPIResponse
	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		return nil, err
	}
	
	var sessions []ZaptecChargeHistory
	for _, dataItem := range apiResp.Data {
		var session ZaptecChargeHistory
		if err := json.Unmarshal(dataItem, &session); err == nil {
			sessions = append(sessions, session)
		}
	}
	
	return sessions, nil
}

// ========== HELPER METHODS ==========

func (zc *ZaptecCollector) parseStateValue(valueStr string) (float64, error) {
	if valueStr == "" {
		return 0, fmt.Errorf("empty value")
	}
	return strconv.ParseFloat(valueStr, 64)
}

// parseZaptecTime parses Zaptec API timestamps and converts to local timezone
func (zc *ZaptecCollector) parseZaptecTime(timeStr string) time.Time {
	if timeStr == "" || timeStr == "0001-01-01T00:00:00" || timeStr == "0001-01-01T00:00:00Z" {
		return time.Time{}
	}
	
	formats := []string{
		time.RFC3339,
		time.RFC3339Nano,
		"2006-01-02T15:04:05.999",
		"2006-01-02T15:04:05",
		"2006-01-02T15:04:05.000",
		"2006-01-02T15:04:05+00:00",
		"2006-01-02T15:04:05Z",
	}
	
	for _, format := range formats {
		if t, err := time.Parse(format, timeStr); err == nil {
			// Convert to local timezone
			return t.In(zc.localTimezone)
		}
	}
	
	return time.Time{}
}

func (zc *ZaptecCollector) mapOperatingModeToState(mode int, isOnline bool) string {
	if !isOnline {
		return "0"
	}
	return fmt.Sprintf("%d", mode)
}

func (zc *ZaptecCollector) getStateDescription(mode int) string {
	switch mode {
	case 0:
		return "Unknown"
	case 1:
		return "Disconnected"
	case 2:
		return "Waiting for Authorization"
	case 3:
		return "Charging"
	case 5:
		return "Finished Charging"
	default:
		return "Unknown"
	}
}

// formatDuration formats a duration into a human-readable string
func formatDuration(d time.Duration) string {
	hours := int(d.Hours())
	minutes := int(d.Minutes()) % 60
	if hours > 0 {
		return fmt.Sprintf("%dh %dm", hours, minutes)
	}
	return fmt.Sprintf("%dm", minutes)
}

// ========== PUBLIC API FOR UI ==========

// GetChargerData returns live charger data for UI display (always available)
func (zc *ZaptecCollector) GetChargerData(chargerID int) (*ZaptecLiveData, bool) {
	zc.mu.RLock()
	defer zc.mu.RUnlock()
	
	data, exists := zc.liveChargerData[chargerID]
	if !exists || time.Since(data.Timestamp) > 30*time.Second {
		return nil, false
	}
	
	return data, true
}

// GetLiveSession returns live session data for UI display (compatibility method)
func (zc *ZaptecCollector) GetLiveSession(chargerID int) (*ZaptecSessionData, bool) {
	zc.mu.RLock()
	defer zc.mu.RUnlock()
	
	data, exists := zc.liveChargerData[chargerID]
	if !exists || time.Since(data.Timestamp) > 30*time.Second {
		return nil, false
	}
	
	// Only return session data if actually charging
	if data.OperatingMode != 3 {
		return nil, false
	}
	
	return &ZaptecSessionData{
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

// GetConnectionStatus returns status info for all chargers (for admin UI)
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
		
		var config ZaptecConnectionConfig
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
			
			if data.OperatingMode == 3 { // Charging
				status["live_session"] = map[string]interface{}{
					"session_id":     data.SessionID,
					"energy_kwh":     data.SessionEnergy_kWh,
					"start_time":     data.SessionStart.Format("2006-01-02 15:04:05"),
					"duration":       formatDuration(time.Since(data.SessionStart)),
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

// GetAllAvailableChargers lists all chargers from Zaptec API (for setup)
func (zc *ZaptecCollector) GetAllAvailableChargers() ([]map[string]interface{}, error) {
	var configJSON string
	err := zc.db.QueryRow(`
		SELECT connection_config
		FROM chargers 
		WHERE is_active = 1 AND connection_type = 'zaptec_api'
		LIMIT 1
	`).Scan(&configJSON)
	
	if err != nil {
		return nil, fmt.Errorf("no Zaptec chargers configured")
	}
	
	var config ZaptecConnectionConfig
	if err := json.Unmarshal([]byte(configJSON), &config); err != nil {
		return nil, fmt.Errorf("invalid config: %v", err)
	}
	
	token, err := zc.getAccessToken(0, config)
	if err != nil {
		return nil, fmt.Errorf("authentication failed: %v", err)
	}
	
	var allChargers []ZaptecChargerInfo
	pageIndex := 0
	
	for {
		chargersURL := fmt.Sprintf("%s/api/chargers?PageIndex=%d&PageSize=100", zc.apiBaseURL, pageIndex)
		
		req, _ := http.NewRequest("GET", chargersURL, nil)
		req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", token))
		req.Header.Set("Accept", "application/json")
		
		resp, err := zc.client.Do(req)
		if err != nil {
			return nil, err
		}
		defer resp.Body.Close()
		
		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			return nil, fmt.Errorf("API error %d: %s", resp.StatusCode, string(body))
		}
		
		var apiResp ZaptecAPIResponse
		if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
			return nil, err
		}
		
		for _, dataItem := range apiResp.Data {
			var charger ZaptecChargerInfo
			if err := json.Unmarshal(dataItem, &charger); err == nil {
				allChargers = append(allChargers, charger)
			}
		}
		
		pageIndex++
		if pageIndex >= apiResp.Pages {
			break
		}
	}
	
	var chargers []map[string]interface{}
	for _, charger := range allChargers {
		chargers = append(chargers, map[string]interface{}{
			"id":                charger.ID,
			"device_id":         charger.DeviceID,
			"name":              charger.Name,
			"installation_id":   charger.InstallationID,
			"installation_name": charger.InstallationName,
			"is_online":         charger.IsOnline,
			"operating_mode":    charger.OperatingMode,
			"total_energy_kwh":  charger.SignedMeterValueKwh,
		})
	}
	
	return chargers, nil
}

// ========== LEGACY COMPATIBILITY ==========

// GetCompletedSession - legacy method, now returns nil (sessions are auto-processed)
func (zc *ZaptecCollector) GetCompletedSession(chargerID int) (*CompletedSession, bool) {
	return nil, false
}

// MarkSessionProcessed - legacy method, now no-op (sessions are auto-marked)
func (zc *ZaptecCollector) MarkSessionProcessed(sessionID string) {
	// No-op - sessions are automatically marked as processed
}