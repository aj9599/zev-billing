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
	"sync"
	"time"
)

// ZaptecCollector handles Zaptec charger data collection via their API
type ZaptecCollector struct {
	db               *sql.DB
	client           *http.Client
	mu               sync.RWMutex
	chargerData      map[int]*ZaptecChargerData
	liveSessionData  map[int]*ZaptecSessionData
	accessTokens     map[int]string // charger_id -> access_token
	tokenExpiries    map[int]time.Time
	// Track current session ID per charger
	currentSessionIDs  map[int]string
	// Track sessions we've already completed to avoid re-processing
	completedSessions  map[string]*CompletedSessionInfo
	// Track previous operating mode to detect state transitions
	previousStates     map[int]int
	stopChan           chan bool
	apiBaseURL         string
}

type ZaptecChargerData struct {
	Power            float64
	TotalEnergy      float64 // SignedMeterValueKwh - total energy through the charger
	SessionEnergy    float64 // Energy for current/last session
	UserID           string  // Consistent UserID (from session API, not StateId 722)
	UserName         string
	Mode             string
	State            string
	StateDescription string
	IsOnline         bool
	CurrentSession   string  // Current session ID if charging
	SessionID        string  // Session ID for tracking (same as CurrentSession when charging)
	Timestamp        time.Time
	// Additional detailed info
	ChargerName      string
	DeviceName       string
	Voltage          float64
	Current          float64
	Power_kW         float64 // Current power draw in kW
}

type ZaptecSessionData struct {
	SessionID        string
	Energy           float64
	StartTime        time.Time
	EndTime          time.Time
	UserID           string
	UserName         string
	IsActive         bool
	Power_kW         float64
	Timestamp        time.Time
}

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

type ZaptecChargerState struct {
	ChargerId       string                   `json:"ChargerId"`
	StateId         int                      `json:"StateId"`
	Timestamp       string                   `json:"Timestamp"`
	ValueAsString   string                   `json:"ValueAsString"`
	Sessions        []ZaptecSessionListItem  `json:"SessionListModelPagedData,omitempty"`
}

type ZaptecSessionListItem struct {
	Id              string  `json:"Id"`
	DeviceId        string  `json:"DeviceId"`
	Energy          float64 `json:"Energy"`
	StartDateTime   string  `json:"StartDateTime"`
	EndDateTime     string  `json:"EndDateTime"`
	ChargerId       string  `json:"ChargerId"`
	DeviceName      string  `json:"DeviceName"`
	UserFullName    string  `json:"UserFullName"`
	UserId          string  `json:"UserId"`
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

type ZaptecSession struct {
	ID              string  `json:"Id"`
	SessionID       string  `json:"SessionId"`
	DeviceID        string  `json:"DeviceId"`
	StartDateTime   string  `json:"StartDateTime"`
	SessionStart    string  `json:"SessionStart"`
	EndDateTime     string  `json:"EndDateTime"`
	SessionEnd      string  `json:"SessionEnd"`
	Energy          float64 `json:"Energy"`
	UserFullName    string  `json:"UserFullName"`
	ChargerID       string  `json:"ChargerId"`
	DeviceName      string  `json:"DeviceName"`
	UserEmail       string  `json:"UserEmail"`
	UserID          string  `json:"UserId"`
	SignedSession   bool    `json:"SignedSession"`
	ExternalID      string  `json:"ExternalId"`
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

// CompletedSessionInfo holds info about a completed session for database reconciliation
type CompletedSessionInfo struct {
	SessionID    string
	ChargerID    int
	ChargerName  string
	FinalEnergy  float64
	StartTime    time.Time
	EndTime      time.Time
	UserID       string
	UserName     string
	Processed    bool
}

func NewZaptecCollector(db *sql.DB) *ZaptecCollector {
	return &ZaptecCollector{
		db:                 db,
		client:             &http.Client{Timeout: 30 * time.Second},
		chargerData:        make(map[int]*ZaptecChargerData),
		liveSessionData:    make(map[int]*ZaptecSessionData),
		accessTokens:       make(map[int]string),
		tokenExpiries:      make(map[int]time.Time),
		currentSessionIDs:  make(map[int]string),
		completedSessions:  make(map[string]*CompletedSessionInfo),
		previousStates:     make(map[int]int),
		stopChan:           make(chan bool),
		apiBaseURL:         "https://api.zaptec.com",
	}
}

func (zc *ZaptecCollector) Start() {
	log.Println("Starting Zaptec Collector...")
	
	zc.loadChargers()
	
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
	zc.chargerData = make(map[int]*ZaptecChargerData)
	zc.liveSessionData = make(map[int]*ZaptecSessionData)
	zc.accessTokens = make(map[int]string)
	zc.tokenExpiries = make(map[int]time.Time)
	zc.currentSessionIDs = make(map[int]string)
	zc.previousStates = make(map[int]int)
	// Don't clear completedSessions to preserve reconciliation data
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
	
	chargerDetails, err := zc.getChargerDetails(token, config.ChargerID)
	if err != nil {
		log.Printf("ERROR: Failed to get charger details for %s: %v", chargerName, err)
		return
	}
	
	// Get previous state for transition detection
	zc.mu.RLock()
	previousState := zc.previousStates[chargerID]
	currentSessionID := zc.currentSessionIDs[chargerID]
	zc.mu.RUnlock()
	
	currentState := chargerDetails.OperatingMode
	
	// Get state values for additional info
	stateData, _ := zc.getChargerStateValues(token, config.ChargerID)
	if stateData == nil {
		stateData = make(map[int]string)
	}
	
	// Build base charger data
	chargerData := &ZaptecChargerData{
		TotalEnergy:      chargerDetails.SignedMeterValueKwh,
		IsOnline:         chargerDetails.IsOnline,
		ChargerName:      chargerDetails.Name,
		DeviceName:       chargerDetails.DeviceName,
		Voltage:          chargerDetails.Voltage,
		Current:          chargerDetails.Current,
		Power_kW:         chargerDetails.TotalChargePower / 1000.0,
		StateDescription: zc.getStateDescription(currentState),
		State:            zc.mapOperatingModeToState(currentState, chargerDetails.IsOnline),
		Mode:             zc.mapOperationMode(currentState),
		Timestamp:        time.Now(),
	}
	
	// Get power from StateId 513 if available
	if powerStr, ok := stateData[513]; ok {
		if powerVal, err := zc.parseStateValue(powerStr); err == nil {
			chargerData.Power_kW = powerVal / 1000.0
		}
	}
	
	// ========== CHARGING STATE (OperatingMode == 3) ==========
	if currentState == 3 {
		activeSessionID := ""
		
		// Get session ID from StateId 721
		if sessionID, ok := stateData[721]; ok && sessionID != "" {
			activeSessionID = sessionID
		}
		
		// Get session energy from StateId 553
		if sessionEnergyStr, ok := stateData[553]; ok {
			if energyVal, err := zc.parseStateValue(sessionEnergyStr); err == nil {
				chargerData.SessionEnergy = energyVal / 1000.0
			}
		}
		
		// Get session details from API for consistent UserID
		if activeSessionID != "" {
			session, err := zc.getSessionDetails(token, activeSessionID)
			if err == nil {
				// ALWAYS use UserID from session API for consistency
				chargerData.UserID = session.UserID
				chargerData.UserName = session.UserFullName
				chargerData.SessionEnergy = session.Energy
				chargerData.CurrentSession = activeSessionID
				chargerData.SessionID = activeSessionID
				
				// Parse start time
				startTimeStr := session.SessionStart
				if startTimeStr == "" || startTimeStr == "0001-01-01T00:00:00" {
					startTimeStr = session.StartDateTime
				}
				startTime := zc.parseZaptecTime(startTimeStr)
				
				sessionID := session.ID
				if sessionID == "" {
					sessionID = session.SessionID
				}
				
				// Update live session data
				zc.mu.Lock()
				zc.liveSessionData[chargerID] = &ZaptecSessionData{
					SessionID: sessionID,
					Energy:    session.Energy,
					StartTime: startTime,
					UserID:    session.UserID,
					UserName:  session.UserFullName,
					IsActive:  true,
					Power_kW:  chargerData.Power_kW,
					Timestamp: time.Now(),
				}
				zc.currentSessionIDs[chargerID] = sessionID
				zc.mu.Unlock()
				
				log.Printf("Zaptec: [%s] CHARGING: Session=%s, Energy=%.3f kWh, Power=%.2f kW, User=%s", 
					chargerName, sessionID, session.Energy, chargerData.Power_kW, session.UserID)
			} else {
				// Fallback: use StateId 722 for UserID if session API fails
				if userID, ok := stateData[722]; ok && userID != "" {
					chargerData.UserID = userID
				}
				chargerData.CurrentSession = activeSessionID
				chargerData.SessionID = activeSessionID
				
				zc.mu.Lock()
				zc.currentSessionIDs[chargerID] = activeSessionID
				zc.mu.Unlock()
				
				log.Printf("Zaptec: [%s] CHARGING (fallback): Session=%s, Energy=%.3f kWh, User=%s", 
					chargerName, activeSessionID, chargerData.SessionEnergy, chargerData.UserID)
			}
		}
		
	} else {
		// ========== NOT CHARGING - Check for session end ==========
		
		// Detect transition from charging to not charging
		if previousState == 3 && currentSessionID != "" {
			log.Printf("Zaptec: [%s] Session ended (state %d -> %d), fetching final data for session %s", 
				chargerName, previousState, currentState, currentSessionID)
			
			// Fetch completed session for final accurate energy and user info
			session, err := zc.getSessionDetails(token, currentSessionID)
			if err == nil {
				startTimeStr := session.SessionStart
				if startTimeStr == "" || startTimeStr == "0001-01-01T00:00:00" {
					startTimeStr = session.StartDateTime
				}
				endTimeStr := session.SessionEnd
				if endTimeStr == "" || endTimeStr == "0001-01-01T00:00:00" {
					endTimeStr = session.EndDateTime
				}
				
				sessionID := session.ID
				if sessionID == "" {
					sessionID = session.SessionID
				}
				
				completedInfo := &CompletedSessionInfo{
					SessionID:   sessionID,
					ChargerID:   chargerID,
					ChargerName: chargerName,
					FinalEnergy: session.Energy,
					StartTime:   zc.parseZaptecTime(startTimeStr),
					EndTime:     zc.parseZaptecTime(endTimeStr),
					UserID:      session.UserID,
					UserName:    session.UserFullName,
					Processed:   false,
				}
				
				zc.mu.Lock()
				zc.completedSessions[sessionID] = completedInfo
				zc.mu.Unlock()
				
				log.Printf("Zaptec: [%s] SESSION COMPLETED: ID=%s, FinalEnergy=%.3f kWh, User=%s, Duration=%v", 
					chargerName, sessionID, session.Energy, session.UserID, 
					completedInfo.EndTime.Sub(completedInfo.StartTime))
				
				// Use completed session data for this reading
				chargerData.SessionEnergy = session.Energy
				chargerData.UserID = session.UserID
				chargerData.UserName = session.UserFullName
				chargerData.SessionID = sessionID
			} else {
				log.Printf("WARNING: Failed to get completed session details: %v", err)
				
				// Try charge history as fallback
				history, err := zc.getRecentChargeHistory(token, config.ChargerID, 1)
				if err == nil && len(history) > 0 {
					lastSession := history[0]
					chargerData.SessionEnergy = lastSession.Energy
					chargerData.UserID = lastSession.UserID
					chargerData.UserName = lastSession.UserFullName
					chargerData.SessionID = lastSession.ID
				}
			}
			
			// Clear current session tracking
			zc.mu.Lock()
			delete(zc.currentSessionIDs, chargerID)
			delete(zc.liveSessionData, chargerID)
			zc.mu.Unlock()
			
		} else if chargerData.UserID == "" {
			// Not a transition, just idle - get last session from history for display
			history, err := zc.getRecentChargeHistory(token, config.ChargerID, 1)
			if err == nil && len(history) > 0 {
				lastSession := history[0]
				chargerData.SessionEnergy = lastSession.Energy
				chargerData.UserID = lastSession.UserID
				chargerData.UserName = lastSession.UserFullName
				chargerData.SessionID = lastSession.ID
			}
		}
	}
	
	// If we still don't have a UserID, set to "unknown"
	if chargerData.UserID == "" {
		chargerData.UserID = "unknown"
	}
	
	// Update state tracking
	zc.mu.Lock()
	zc.previousStates[chargerID] = currentState
	zc.chargerData[chargerID] = chargerData
	zc.mu.Unlock()
	
	log.Printf("Zaptec: [%s] State=%s (%s), Total=%.3f kWh, Session=%.3f kWh, Power=%.2f kW, User=%s", 
		chargerName, chargerData.State, chargerData.StateDescription,
		chargerData.TotalEnergy, chargerData.SessionEnergy, chargerData.Power_kW, chargerData.UserID)
}

// GetCompletedSession returns completed session info for database reconciliation
// Call this after GetChargerData to check if there's a session that just completed
func (zc *ZaptecCollector) GetCompletedSession(chargerID int) (*CompletedSessionInfo, bool) {
	zc.mu.RLock()
	defer zc.mu.RUnlock()
	
	// Look for unprocessed completed sessions for this charger
	for _, info := range zc.completedSessions {
		if info.ChargerID == chargerID && !info.Processed {
			return info, true
		}
	}
	return nil, false
}

// MarkSessionProcessed marks a completed session as processed
func (zc *ZaptecCollector) MarkSessionProcessed(sessionID string) {
	zc.mu.Lock()
	defer zc.mu.Unlock()
	
	if info, exists := zc.completedSessions[sessionID]; exists {
		info.Processed = true
	}
}

// getChargerDetails fetches detailed charger information
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

// getChargerStateValues fetches all state values
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

func (zc *ZaptecCollector) parseStateValue(valueStr string) (float64, error) {
	if valueStr == "" {
		return 0, fmt.Errorf("empty value")
	}
	var value float64
	_, err := fmt.Sscanf(valueStr, "%f", &value)
	return value, err
}

// getSessionDetails fetches session details
func (zc *ZaptecCollector) getSessionDetails(token, sessionID string) (*ZaptecSession, error) {
	sessionURL := fmt.Sprintf("%s/api/session/%s", zc.apiBaseURL, sessionID)
	
	req, err := http.NewRequest("GET", sessionURL, nil)
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
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("status %d: %s", resp.StatusCode, string(body))
	}
	
	var session ZaptecSession
	if err := json.NewDecoder(resp.Body).Decode(&session); err != nil {
		return nil, err
	}
	
	return &session, nil
}

// getRecentChargeHistory fetches recent charging sessions
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

func (zc *ZaptecCollector) mapOperationMode(mode int) string {
	return "1"
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
	}
	
	for _, format := range formats {
		if t, err := time.Parse(format, timeStr); err == nil {
			return t
		}
	}
	
	return time.Time{}
}

func (zc *ZaptecCollector) GetChargerData(chargerID int) (*ZaptecChargerData, bool) {
	zc.mu.RLock()
	defer zc.mu.RUnlock()
	
	data, exists := zc.chargerData[chargerID]
	if !exists || time.Since(data.Timestamp) > 30*time.Second {
		return nil, false
	}
	
	return data, true
}

func (zc *ZaptecCollector) GetLiveSession(chargerID int) (*ZaptecSessionData, bool) {
	zc.mu.RLock()
	defer zc.mu.RUnlock()
	
	session, exists := zc.liveSessionData[chargerID]
	if !exists || time.Since(session.Timestamp) > 30*time.Second {
		return nil, false
	}
	
	return session, true
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
		
		var config ZaptecConnectionConfig
		json.Unmarshal([]byte(configJSON), &config)
		
		data, exists := zc.chargerData[id]
		isConnected := exists && time.Since(data.Timestamp) < 30*time.Second
		
		status := map[string]interface{}{
			"charger_name": name,
			"charger_id":   config.ChargerID,
			"is_connected": isConnected,
			"last_update":  "",
			"is_online":    false,
		}
		
		if exists {
			status["last_update"] = data.Timestamp.Format("2006-01-02 15:04:05")
			status["last_reading"] = data.TotalEnergy
			status["is_online"] = data.IsOnline
			status["current_power_kw"] = data.Power_kW
			status["state_description"] = data.StateDescription
			status["user_id"] = data.UserID
			status["session_id"] = data.SessionID
			
			if data.SessionEnergy > 0 {
				status["session_energy"] = data.SessionEnergy
			}
			
			if session, hasSession := zc.liveSessionData[id]; hasSession {
				status["live_session"] = map[string]interface{}{
					"session_id": session.SessionID,
					"energy":     session.Energy,
					"start_time": session.StartTime.Format("2006-01-02 15:04:05"),
					"duration":   formatDuration(time.Since(session.StartTime)),
					"user_id":    session.UserID,
					"user_name":  session.UserName,
					"is_active":  session.IsActive,
					"power_kw":   session.Power_kW,
				}
			}
		}
		
		if _, hasToken := zc.accessTokens[id]; hasToken {
			status["token_expires"] = zc.tokenExpiries[id].Format("2006-01-02 15:04:05")
		}
		
		chargerStatuses[id] = status
	}
	
	return map[string]interface{}{"zaptec_charger_connections": chargerStatuses}
}

func formatDuration(d time.Duration) string {
	hours := int(d.Hours())
	minutes := int(d.Minutes()) % 60
	seconds := int(d.Seconds()) % 60
	
	if hours > 0 {
		return fmt.Sprintf("%dh %dm", hours, minutes)
	} else if minutes > 0 {
		return fmt.Sprintf("%dm %ds", minutes, seconds)
	}
	return fmt.Sprintf("%ds", seconds)
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