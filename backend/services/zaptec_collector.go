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
	stopChan         chan bool
	apiBaseURL       string
}

type ZaptecChargerData struct {
	Power            float64
	TotalEnergy      float64 // SignedMeterValueKwh - total energy through the charger
	SessionEnergy    float64 // Energy for current/last session
	UserID           string
	UserName         string
	Mode             string
	State            string
	StateDescription string
	IsOnline         bool
	CurrentSession   string // Current session ID if charging
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

// ZaptecChargerDetails represents the detailed charger information from /api/chargers/{id} endpoint
type ZaptecChargerDetails struct {
	ID                   string  `json:"Id"`
	DeviceID             string  `json:"DeviceId"`
	Name                 string  `json:"Name"`
	DeviceName           string  `json:"DeviceName"`
	Active               bool    `json:"Active"`
	IsOnline             bool    `json:"IsOnline"`
	OperatingMode        int     `json:"OperatingMode"`
	SignedMeterValueKwh  float64 `json:"SignedMeterValueKwh"`
	TotalChargePower     float64 `json:"TotalChargePower"` // Current power in watts
	Voltage              float64 `json:"Voltage"`
	Current              float64 `json:"Current"`
	InstallationID       string  `json:"InstallationId"`
	InstallationName     string  `json:"InstallationName"`
}

// ZaptecChargerState represents the state information from /api/chargers/{id}/state endpoint
type ZaptecChargerState struct {
	ChargerId       string                   `json:"ChargerId"`
	StateId         int                      `json:"StateId"`
	Timestamp       string                   `json:"Timestamp"`
	ValueAsString   string                   `json:"ValueAsString"`
	Sessions        []ZaptecSessionListItem  `json:"SessionListModelPagedData,omitempty"`
}

// ZaptecSessionListItem represents a session from the SessionListModelPagedData array
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

// ZaptecChargerInfo represents the charger information from /api/chargers endpoint (list)
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

// ZaptecSession represents a charging session from /api/session/{id} endpoint
type ZaptecSession struct {
	ID              string    `json:"Id"`
	DeviceID        string    `json:"DeviceId"`
	StartDateTime   string    `json:"StartDateTime"`
	EndDateTime     string    `json:"EndDateTime"`
	Energy          float64   `json:"Energy"` // in kWh
	UserFullName    string    `json:"UserFullName"`
	ChargerID       string    `json:"ChargerId"`
	DeviceName      string    `json:"DeviceName"`
	UserEmail       string    `json:"UserEmail"`
	UserID          string    `json:"UserId"`
	SignedSession   bool      `json:"SignedSession"`
	ExternalID      string    `json:"ExternalId"`
}

// ZaptecChargeHistory represents a charging session from /api/chargehistory endpoint
type ZaptecChargeHistory struct {
	ID              string    `json:"Id"`
	DeviceID        string    `json:"DeviceId"`
	StartDateTime   string    `json:"StartDateTime"`
	EndDateTime     string    `json:"EndDateTime"`
	Energy          float64   `json:"Energy"` // in kWh
	UserFullName    string    `json:"UserFullName"`
	ChargerID       string    `json:"ChargerId"`
	DeviceName      string    `json:"DeviceName"`
	UserEmail       string    `json:"UserEmail"`
	UserID          string    `json:"UserId"`
	TokenName       string    `json:"TokenName"`
	ExternalID      string    `json:"ExternalId"`
}

// ZaptecAPIResponse represents the paginated response structure
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

func NewZaptecCollector(db *sql.DB) *ZaptecCollector {
	return &ZaptecCollector{
		db:              db,
		client:          &http.Client{Timeout: 30 * time.Second},
		chargerData:     make(map[int]*ZaptecChargerData),
		liveSessionData: make(map[int]*ZaptecSessionData),
		accessTokens:    make(map[int]string),
		tokenExpiries:   make(map[int]time.Time),
		stopChan:        make(chan bool),
		apiBaseURL:      "https://api.zaptec.com",
	}
}

func (zc *ZaptecCollector) Start() {
	log.Println("Starting Zaptec Collector...")
	
	// Initial load of chargers
	zc.loadChargers()
	
	// Poll every 10 seconds for real-time data (faster for live updates)
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
		
		// Validate config
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
	
	// Return cached token if still valid (with 5 minute buffer)
	if exists && hasExpiry && time.Now().Add(5*time.Minute).Before(expiry) {
		return token, nil
	}
	
	// Authenticate to get new token
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
	
	// Cache the token
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
	
	// Get access token
	token, err := zc.getAccessToken(chargerID, config)
	if err != nil {
		log.Printf("ERROR: Failed to get Zaptec token for charger %s: %v", chargerName, err)
		return
	}
	
	// Get detailed charger information using individual charger endpoint
	chargerDetails, err := zc.getChargerDetails(token, config.ChargerID)
	if err != nil {
		log.Printf("ERROR: Failed to get charger details for %s: %v", chargerName, err)
		return
	}
	
	// Initialize charger data
	chargerData := &ZaptecChargerData{
		TotalEnergy:      chargerDetails.SignedMeterValueKwh,
		IsOnline:         chargerDetails.IsOnline,
		ChargerName:      chargerDetails.Name,
		DeviceName:       chargerDetails.DeviceName,
		Voltage:          chargerDetails.Voltage,
		Current:          chargerDetails.Current,
		Power_kW:         chargerDetails.TotalChargePower / 1000.0, // Convert W to kW
		StateDescription: zc.getStateDescription(chargerDetails.OperatingMode),
		Timestamp:        time.Now(),
	}
	
	// Map operating mode to state and mode
	chargerData.State = zc.mapOperatingModeToState(chargerDetails.OperatingMode, chargerDetails.IsOnline)
	chargerData.Mode = zc.mapOperationMode(chargerDetails.OperatingMode)
	
	// Get active session from charger state
	activeSessionID := ""
	if chargerDetails.OperatingMode == 3 { // Charging
		state, err := zc.getChargerState(token, config.ChargerID)
		if err == nil && len(state.Sessions) > 0 {
			// Find the active session (one without EndDateTime)
			for _, session := range state.Sessions {
				if session.EndDateTime == "" || session.EndDateTime == "0001-01-01T00:00:00" {
					activeSessionID = session.Id
					
					// Store live session data from state
					chargerData.UserID = session.UserId
					chargerData.UserName = session.UserFullName
					chargerData.SessionEnergy = session.Energy
					chargerData.CurrentSession = activeSessionID
					
					// Store live session data
					startTime := zc.parseZaptecTime(session.StartDateTime)
					duration := time.Since(startTime)
					
					zc.mu.Lock()
					zc.liveSessionData[chargerID] = &ZaptecSessionData{
						SessionID: session.Id,
						Energy:    session.Energy,
						StartTime: startTime,
						UserID:    session.UserId,
						UserName:  session.UserFullName,
						IsActive:  true,
						Power_kW:  chargerDetails.TotalChargePower / 1000.0,
						Timestamp: time.Now(),
					}
					zc.mu.Unlock()
					
					log.Printf("Zaptec: [%s] Active session found: %s, Energy: %.3f kWh, User: %s, Duration: %v", 
						chargerName, session.Id, session.Energy, session.UserFullName, duration)
					break
				}
			}
		}
	}
	
	// If we have an active session ID, try to get more details
	if activeSessionID != "" {
		session, err := zc.getSessionDetails(token, activeSessionID)
		if err == nil {
			// Update with more detailed session info if available
			chargerData.UserID = session.UserID
			chargerData.UserName = session.UserFullName
			chargerData.SessionEnergy = session.Energy
			chargerData.Power = session.Energy
			
			// Update live session data with detailed info
			zc.mu.Lock()
			if liveSession, exists := zc.liveSessionData[chargerID]; exists {
				liveSession.Energy = session.Energy
				liveSession.UserID = session.UserID
				liveSession.UserName = session.UserFullName
			}
			zc.mu.Unlock()
		}
	} else if chargerDetails.OperatingMode != 3 {
		// Not charging - get most recent session from history
		recentHistory, err := zc.getRecentChargeHistory(token, config.ChargerID, 1)
		if err == nil && len(recentHistory) > 0 {
			lastSession := recentHistory[0]
			chargerData.UserID = lastSession.UserID
			chargerData.UserName = lastSession.UserFullName
			chargerData.SessionEnergy = lastSession.Energy
			chargerData.Power = chargerDetails.SignedMeterValueKwh
		} else {
			chargerData.Power = chargerDetails.SignedMeterValueKwh
		}
		
		// Clear live session data
		zc.mu.Lock()
		delete(zc.liveSessionData, chargerID)
		zc.mu.Unlock()
	}
	
	// Store the data
	zc.mu.Lock()
	zc.chargerData[chargerID] = chargerData
	zc.mu.Unlock()
	
	sessionStatus := "No active session"
	if activeSessionID != "" {
		sessionStatus = fmt.Sprintf("Active session: %s", activeSessionID)
	}
	
	log.Printf("Zaptec: [%s] Total: %.3f kWh, Session: %.3f kWh, Power: %.2f kW, Mode: %s, State: %s (%s), User: %s, Online: %t, %s", 
		chargerName, 
		chargerData.TotalEnergy,
		chargerData.SessionEnergy,
		chargerData.Power_kW,
		chargerData.Mode, 
		chargerData.State, 
		chargerData.StateDescription,
		chargerData.UserName,
		chargerData.IsOnline,
		sessionStatus)
}

// getChargerDetails fetches detailed charger information from /api/chargers/{id} endpoint
func (zc *ZaptecCollector) getChargerDetails(token, chargerID string) (*ZaptecChargerDetails, error) {
	chargerURL := fmt.Sprintf("%s/api/chargers/%s", zc.apiBaseURL, chargerID)
	
	req, err := http.NewRequest("GET", chargerURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create charger details request: %v", err)
	}
	
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", token))
	req.Header.Set("Accept", "application/json")
	
	resp, err := zc.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("charger details request failed: %v", err)
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("charger details request failed with status %d: %s", resp.StatusCode, string(body))
	}
	
	var chargerDetails ZaptecChargerDetails
	if err := json.NewDecoder(resp.Body).Decode(&chargerDetails); err != nil {
		return nil, fmt.Errorf("failed to decode charger details: %v", err)
	}
	
	return &chargerDetails, nil
}

// getChargerState fetches charger state including active sessions from /api/chargers/{id}/state endpoint
func (zc *ZaptecCollector) getChargerState(token, chargerID string) (*ZaptecChargerState, error) {
	stateURL := fmt.Sprintf("%s/api/chargers/%s/state", zc.apiBaseURL, chargerID)
	
	req, err := http.NewRequest("GET", stateURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create state request: %v", err)
	}
	
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", token))
	req.Header.Set("Accept", "application/json")
	
	resp, err := zc.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("state request failed: %v", err)
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("state request failed with status %d: %s", resp.StatusCode, string(body))
	}
	
	// The state endpoint returns an array of state objects
	var states []map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&states); err != nil {
		return nil, fmt.Errorf("failed to decode state: %v", err)
	}
	
	// Look for the SessionListModelPagedData state (StateId 710 or similar)
	for _, stateObj := range states {
		stateID, _ := stateObj["StateId"].(float64)
		
		// StateId 710 contains SessionListModelPagedData
		if stateID == 710 {
			// Parse the sessions from the ValueAsString field
			if valueStr, ok := stateObj["ValueAsString"].(string); ok && valueStr != "" {
				var sessionsData map[string]interface{}
				if err := json.Unmarshal([]byte(valueStr), &sessionsData); err == nil {
					if dataArray, ok := sessionsData["Data"].([]interface{}); ok {
						var sessions []ZaptecSessionListItem
						for _, item := range dataArray {
							sessionBytes, _ := json.Marshal(item)
							var session ZaptecSessionListItem
							if err := json.Unmarshal(sessionBytes, &session); err == nil {
								sessions = append(sessions, session)
							}
						}
						
						return &ZaptecChargerState{
							ChargerId: chargerID,
							StateId:   int(stateID),
							Sessions:  sessions,
						}, nil
					}
				}
			}
		}
	}
	
	// Return empty state if no sessions found
	return &ZaptecChargerState{
		ChargerId: chargerID,
		Sessions:  []ZaptecSessionListItem{},
	}, nil
}

// getSessionDetails fetches live session details from /api/session/{id} endpoint
func (zc *ZaptecCollector) getSessionDetails(token, sessionID string) (*ZaptecSession, error) {
	sessionURL := fmt.Sprintf("%s/api/session/%s", zc.apiBaseURL, sessionID)
	
	req, err := http.NewRequest("GET", sessionURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create session request: %v", err)
	}
	
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", token))
	req.Header.Set("Accept", "application/json")
	
	resp, err := zc.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("session request failed: %v", err)
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("session request failed with status %d: %s", resp.StatusCode, string(body))
	}
	
	var session ZaptecSession
	if err := json.NewDecoder(resp.Body).Decode(&session); err != nil {
		return nil, fmt.Errorf("failed to decode session: %v", err)
	}
	
	return &session, nil
}

// getRecentChargeHistory fetches recent charging sessions
func (zc *ZaptecCollector) getRecentChargeHistory(token, chargerID string, pageSize int) ([]ZaptecChargeHistory, error) {
	historyURL := fmt.Sprintf("%s/api/chargehistory?ChargerId=%s&PageSize=%d", 
		zc.apiBaseURL, chargerID, pageSize)
	
	req, err := http.NewRequest("GET", historyURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create history request: %v", err)
	}
	
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", token))
	req.Header.Set("Accept", "application/json")
	
	resp, err := zc.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("history request failed: %v", err)
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("history request failed with status %d: %s", resp.StatusCode, string(body))
	}
	
	var apiResp ZaptecAPIResponse
	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		return nil, fmt.Errorf("failed to decode history response: %v", err)
	}
	
	var sessions []ZaptecChargeHistory
	for _, dataItem := range apiResp.Data {
		var session ZaptecChargeHistory
		if err := json.Unmarshal(dataItem, &session); err != nil {
			continue
		}
		sessions = append(sessions, session)
	}
	
	return sessions, nil
}

// mapOperationMode maps Zaptec operation modes to our internal modes
func (zc *ZaptecCollector) mapOperationMode(mode int) string {
	// For now, Zaptec doesn't have priority mode concept
	return "1" // Normal mode
}

// mapOperatingModeToState maps Zaptec operating mode to state values
// For Zaptec, we return the native operating mode directly (0, 1, 2, 3, 5)
func (zc *ZaptecCollector) mapOperatingModeToState(mode int, isOnline bool) string {
	if !isOnline {
		return "0" // Unknown/Offline
	}
	
	// Return Zaptec's native operating mode as string
	return fmt.Sprintf("%d", mode)
}

// getStateDescription returns human-readable state description
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

// parseZaptecTime parses Zaptec datetime format
func (zc *ZaptecCollector) parseZaptecTime(timeStr string) time.Time {
	if timeStr == "" || timeStr == "0001-01-01T00:00:00" {
		return time.Time{}
	}
	
	t, err := time.Parse(time.RFC3339, timeStr)
	if err != nil {
		// Try alternative format
		t, err = time.Parse("2006-01-02T15:04:05", timeStr)
		if err != nil {
			return time.Time{}
		}
	}
	return t
}

func (zc *ZaptecCollector) GetChargerData(chargerID int) (*ZaptecChargerData, bool) {
	zc.mu.RLock()
	defer zc.mu.RUnlock()
	
	data, exists := zc.chargerData[chargerID]
	if !exists {
		return nil, false
	}
	
	// Return nil if data is too old (more than 30 seconds for real-time monitoring)
	if time.Since(data.Timestamp) > 30*time.Second {
		return nil, false
	}
	
	return data, true
}

func (zc *ZaptecCollector) GetLiveSession(chargerID int) (*ZaptecSessionData, bool) {
	zc.mu.RLock()
	defer zc.mu.RUnlock()
	
	session, exists := zc.liveSessionData[chargerID]
	if !exists {
		return nil, false
	}
	
	// Return nil if session data is too old
	if time.Since(session.Timestamp) > 30*time.Second {
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
		return map[string]interface{}{
			"zaptec_charger_connections": chargerStatuses,
		}
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
			"charger_name":   name,
			"charger_id":     config.ChargerID,
			"is_connected":   isConnected,
			"last_update":    "",
			"is_online":      false,
		}
		
		if exists {
			status["last_update"] = data.Timestamp.Format("2006-01-02 15:04:05")
			status["last_reading"] = data.TotalEnergy
			status["is_online"] = data.IsOnline
			status["current_power_kw"] = data.Power_kW
			status["state_description"] = data.StateDescription
			
			// Add session energy (from last session or current session)
			if data.SessionEnergy > 0 {
				status["session_energy"] = data.SessionEnergy
			}
			
			// Add live session info if actively charging
			if session, hasSession := zc.liveSessionData[id]; hasSession {
				duration := time.Since(session.StartTime)
				status["live_session"] = map[string]interface{}{
					"session_id":   session.SessionID,
					"energy":       session.Energy,
					"start_time":   session.StartTime.Format("2006-01-02 15:04:05"),
					"duration":     formatDuration(duration),
					"user_name":    session.UserName,
					"is_active":    session.IsActive,
					"power_kw":     session.Power_kW,
				}
			}
		}
		
		_, hasToken := zc.accessTokens[id]
		if hasToken {
			expiry := zc.tokenExpiries[id]
			status["token_expires"] = expiry.Format("2006-01-02 15:04:05")
		}
		
		chargerStatuses[id] = status
	}
	
	return map[string]interface{}{
		"zaptec_charger_connections": chargerStatuses,
	}
}

// formatDuration formats a duration in a human-readable way
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

// GetAllAvailableChargers returns a list of all chargers available in the Zaptec account
func (zc *ZaptecCollector) GetAllAvailableChargers() ([]map[string]interface{}, error) {
	// Get the first configured charger to use its credentials
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
	
	// Get access token (use charger ID 0 as a placeholder)
	token, err := zc.getAccessToken(0, config)
	if err != nil {
		return nil, fmt.Errorf("authentication failed: %v", err)
	}
	
	// Fetch all pages of chargers
	var allChargers []ZaptecChargerInfo
	pageIndex := 0
	
	for {
		chargersURL := fmt.Sprintf("%s/api/chargers?PageIndex=%d&PageSize=100", zc.apiBaseURL, pageIndex)
		
		req, err := http.NewRequest("GET", chargersURL, nil)
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
			return nil, fmt.Errorf("API error %d: %s", resp.StatusCode, string(body))
		}
		
		var apiResp ZaptecAPIResponse
		if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
			return nil, err
		}
		
		// Parse chargers from this page
		for _, dataItem := range apiResp.Data {
			var charger ZaptecChargerInfo
			if err := json.Unmarshal(dataItem, &charger); err != nil {
				continue
			}
			allChargers = append(allChargers, charger)
		}
		
		// Check if we have more pages
		pageIndex++
		if pageIndex >= apiResp.Pages {
			break
		}
	}
	
	// Convert to output format
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