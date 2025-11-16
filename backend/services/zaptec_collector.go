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
	accessTokens     map[int]string // charger_id -> access_token
	tokenExpiries    map[int]time.Time
	stopChan         chan bool
	apiBaseURL       string
}

type ZaptecChargerData struct {
	Power     float64
	UserID    string
	Mode      string
	State     string
	Timestamp time.Time
}

type ZaptecAuthResponse struct {
	AccessToken string `json:"access_token"`
	ExpiresIn   int    `json:"expires_in"`
	TokenType   string `json:"token_type"`
}

// ZaptecChargerInfo represents the charger information from /api/chargers endpoint
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
		db:            db,
		client:        &http.Client{Timeout: 30 * time.Second},
		chargerData:   make(map[int]*ZaptecChargerData),
		accessTokens:  make(map[int]string),
		tokenExpiries: make(map[int]time.Time),
		stopChan:      make(chan bool),
		apiBaseURL:    "https://api.zaptec.com",
	}
}

func (zc *ZaptecCollector) Start() {
	log.Println("Starting Zaptec Collector...")
	
	// Initial load of chargers
	zc.loadChargers()
	
	// Poll every 30 seconds for real-time data
	ticker := time.NewTicker(30 * time.Second)
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
		
		log.Printf("DEBUG: Loading Zaptec charger '%s' (ID: %d) with config: %s", name, id, configJSON)
		
		var config ZaptecConnectionConfig
		if err := json.Unmarshal([]byte(configJSON), &config); err != nil {
			log.Printf("ERROR: Invalid Zaptec config for charger %s: %v", name, err)
			log.Printf("DEBUG: Config JSON was: %s", configJSON)
			continue
		}
		
		// Validate config
		if config.Username == "" || config.Password == "" || config.ChargerID == "" {
			log.Printf("WARNING: Incomplete Zaptec config for charger %s", name)
			log.Printf("DEBUG: Username: '%s', Password: '%s' (length: %d), ChargerID: '%s'", 
				config.Username, 
				"***",
				len(config.Password),
				config.ChargerID)
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
	
	log.Printf("DEBUG: Authenticating Zaptec charger %d with username: %s", chargerID, config.Username)
	
	// Zaptec API requires application/x-www-form-urlencoded, not JSON
	// URL encode the values to handle special characters
	formData := url.Values{}
	formData.Set("grant_type", "password")
	formData.Set("username", config.Username)
	formData.Set("password", config.Password)
	
	log.Printf("DEBUG: Zaptec auth request to %s with form data (password hidden)", authURL)
	
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
	
	// Get charger information (for real-time state and power)
	chargerInfo, err := zc.getChargerInfo(token, config.ChargerID)
	if err != nil {
		log.Printf("ERROR: Failed to get charger info for %s: %v", chargerName, err)
		return
	}
	
	// Get recent charging history to determine user ID and actual energy consumption
	var userID string
	power := chargerInfo.SignedMeterValueKwh
	
	// If charger is currently charging, try to get the active session user
	if chargerInfo.OperatingMode == 3 { // Connected_Charging
		recentHistory, err := zc.getRecentChargeHistory(token, config.ChargerID, 1)
		if err == nil && len(recentHistory) > 0 {
			// Check if the most recent session is still ongoing (no EndDateTime)
			lastSession := recentHistory[0]
			if lastSession.EndDateTime == "" || lastSession.EndDateTime == "0001-01-01T00:00:00" {
				userID = lastSession.UserID
				// Use the session energy if available
				if lastSession.Energy > 0 {
					power = lastSession.Energy
				}
			}
		}
	}
	
	// Map Zaptec state to our format
	chargerData := &ZaptecChargerData{
		Power:     power,
		UserID:    userID,
		Mode:      zc.mapOperationMode(chargerInfo.OperatingMode),
		State:     zc.mapOperatingModeToState(chargerInfo.OperatingMode, chargerInfo.IsOnline),
		Timestamp: time.Now(),
	}
	
	// Store the data
	zc.mu.Lock()
	zc.chargerData[chargerID] = chargerData
	zc.mu.Unlock()
	
	log.Printf("Zaptec: Polled charger %s - Power: %.3f kWh, Mode: %s, State: %s, User: %s, Online: %t", 
		chargerName, chargerData.Power, chargerData.Mode, chargerData.State, userID, chargerInfo.IsOnline)
}

// getChargerInfo fetches charger information from /api/chargers endpoint
func (zc *ZaptecCollector) getChargerInfo(token, chargerID string) (*ZaptecChargerInfo, error) {
	// The chargers endpoint returns a list, we need to filter by ID
	chargersURL := fmt.Sprintf("%s/api/chargers", zc.apiBaseURL)
	
	req, err := http.NewRequest("GET", chargersURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create chargers request: %v", err)
	}
	
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", token))
	req.Header.Set("Accept", "application/json")
	
	resp, err := zc.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("chargers request failed: %v", err)
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("chargers request failed with status %d: %s", resp.StatusCode, string(body))
	}
	
	var apiResp ZaptecAPIResponse
	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		return nil, fmt.Errorf("failed to decode chargers response: %v", err)
	}
	
	// Find our specific charger in the response
	for _, dataItem := range apiResp.Data {
		var charger ZaptecChargerInfo
		if err := json.Unmarshal(dataItem, &charger); err != nil {
			continue
		}
		
		// Match by charger ID
		if charger.ID == chargerID {
			return &charger, nil
		}
	}
	
	return nil, fmt.Errorf("charger %s not found in API response", chargerID)
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
	// Zaptec OperatingMode values:
	// 0 = Unknown, 1 = Disconnected, 2 = Connected_Requesting, 3 = Connected_Charging, 
	// 5 = Connected_Finished
	switch mode {
	case 3: // Connected_Charging
		return "1" // Normal mode
	case 2, 5: // Connected_Requesting or Connected_Finished
		return "1" // Normal mode
	default:
		return "1" // Default to normal
	}
}

// mapOperatingModeToState maps Zaptec operating mode to our internal state values
// OperatingMode enum:
// 0 = Unknown, 1 = Disconnected, 2 = Connected_Requesting, 
// 3 = Connected_Charging, 5 = Connected_Finished
func (zc *ZaptecCollector) mapOperatingModeToState(mode int, isOnline bool) string {
	if !isOnline {
		return "50" // Idle/Offline
	}
	
	switch mode {
	case 0: // Unknown
		return "50" // Idle
	case 1: // Disconnected
		return "50" // Idle
	case 2: // Connected_Requesting (waiting for authorization)
		return "66" // Waiting for authorization
	case 3: // Connected_Charging
		return "67" // Charging
	case 5: // Connected_Finished
		return "65" // Cable locked (finished charging)
	default:
		return "50" // Idle
	}
}

func (zc *ZaptecCollector) GetChargerData(chargerID int) (*ZaptecChargerData, bool) {
	zc.mu.RLock()
	defer zc.mu.RUnlock()
	
	data, exists := zc.chargerData[chargerID]
	if !exists {
		return nil, false
	}
	
	// Return nil if data is too old (more than 2 minutes)
	if time.Since(data.Timestamp) > 2*time.Minute {
		return nil, false
	}
	
	return data, true
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
		isConnected := exists && time.Since(data.Timestamp) < 2*time.Minute
		
		status := map[string]interface{}{
			"charger_name":   name,
			"charger_id":     config.ChargerID,
			"is_connected":   isConnected,
			"last_update":    "",
		}
		
		if exists {
			status["last_update"] = data.Timestamp.Format("2006-01-02 15:04:05")
			status["last_reading"] = data.Power
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