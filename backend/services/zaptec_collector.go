package services

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
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

type ZaptecChargerState struct {
	ChargerId           string  `json:"ChargerId"`
	TotalChargePower    float64 `json:"TotalChargePower"`
	ChargerOperationMode int    `json:"ChargerOperationMode"`
	CurrentPhase1       float64 `json:"CurrentPhase1"`
	CurrentPhase2       float64 `json:"CurrentPhase2"`
	CurrentPhase3       float64 `json:"CurrentPhase3"`
	SignedMeterValue    float64 `json:"SignedMeterValue"`
	IsOnline            bool    `json:"IsOnline"`
	UserUUID            string  `json:"UserUUID,omitempty"`
}

type ZaptecConnectionConfig struct {
	Username   string `json:"username"`
	Password   string `json:"password"`
	ChargerID  string `json:"charger_id"`
	InstallationID string `json:"installation_id,omitempty"`
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
	
	authData := map[string]string{
		"grant_type": "password",
		"username":   config.Username,
		"password":   config.Password,
	}
	
	jsonData, err := json.Marshal(authData)
	if err != nil {
		return "", fmt.Errorf("failed to marshal auth data: %v", err)
	}
	
	req, err := http.NewRequest("POST", authURL, bytes.NewBuffer(jsonData))
	if err != nil {
		return "", fmt.Errorf("failed to create auth request: %v", err)
	}
	
	req.Header.Set("Content-Type", "application/json")
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
	
	// Get charger state
	stateURL := fmt.Sprintf("%s/api/chargers/%s/state", zc.apiBaseURL, config.ChargerID)
	
	req, err := http.NewRequest("GET", stateURL, nil)
	if err != nil {
		log.Printf("ERROR: Failed to create state request for charger %s: %v", chargerName, err)
		return
	}
	
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", token))
	req.Header.Set("Accept", "application/json")
	
	resp, err := zc.client.Do(req)
	if err != nil {
		log.Printf("ERROR: State request failed for charger %s: %v", chargerName, err)
		return
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		log.Printf("ERROR: State request failed for charger %s with status %d: %s", chargerName, resp.StatusCode, string(body))
		return
	}
	
	var state ZaptecChargerState
	if err := json.NewDecoder(resp.Body).Decode(&state); err != nil {
		log.Printf("ERROR: Failed to decode state for charger %s: %v", chargerName, err)
		return
	}
	
	// Map Zaptec state to our format
	chargerData := &ZaptecChargerData{
		Power:     state.TotalChargePower / 1000.0, // Convert W to kW
		UserID:    state.UserUUID,
		Mode:      zc.mapOperationMode(state.ChargerOperationMode),
		State:     zc.mapChargerState(state),
		Timestamp: time.Now(),
	}
	
	// Store the data
	zc.mu.Lock()
	zc.chargerData[chargerID] = chargerData
	zc.mu.Unlock()
	
	log.Printf("Zaptec: Polled charger %s - Power: %.3f kW, Mode: %s, State: %s", 
		chargerName, chargerData.Power, chargerData.Mode, chargerData.State)
}

// mapOperationMode maps Zaptec operation modes to our internal modes
func (zc *ZaptecCollector) mapOperationMode(mode int) string {
	// Zaptec ChargerOperationMode values:
	// 0 = Unknown, 1 = Disconnected, 2 = Connected_Requesting, 3 = Connected_Charging, 
	// 4 = Connected_Finished, 5 = Disabled
	switch mode {
	case 3: // Connected_Charging
		return "1" // Normal mode
	case 2, 4: // Connected_Requesting or Connected_Finished
		return "1" // Normal mode
	default:
		return "1" // Default to normal
	}
}

// mapChargerState maps Zaptec charger state to our internal state values
func (zc *ZaptecCollector) mapChargerState(state ZaptecChargerState) string {
	if !state.IsOnline {
		return "50" // Idle/Offline
	}
	
	switch state.ChargerOperationMode {
	case 1: // Disconnected
		return "50" // Idle
	case 2: // Connected_Requesting
		if state.UserUUID != "" {
			return "66" // Waiting for authorization
		}
		return "65" // Cable locked
	case 3: // Connected_Charging
		return "67" // Charging
	case 4: // Connected_Finished
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