package services

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"
)

// SmartMeCollector handles Smart-me API integration with proper authentication
type SmartMeCollector struct {
	db               *sql.DB
	mu               sync.RWMutex
	meterReadings    map[int]SmartMeReading
	isRunning        bool
	stopChan         chan struct{}
	authCache        map[string]*SmartMeAuth // Cache auth tokens per config
	authCacheMu      sync.RWMutex
	lastAPICall      map[string]time.Time // Rate limiting tracker
	apiCallMu        sync.Mutex
	failureCount     map[int]int          // Track consecutive failures per meter
	failureCountMu   sync.Mutex
}

// SmartMeReading holds the latest reading from a Smart-me device
type SmartMeReading struct {
	Import      float64
	Export      float64
	LastUpdated time.Time
}

// SmartMeAuth holds authentication information
type SmartMeAuth struct {
	AuthType     string    // "basic", "apikey", "oauth"
	Username     string    // For basic auth
	Password     string    // For basic auth
	APIKey       string    // For API key auth
	ClientID     string    // For OAuth
	ClientSecret string    // For OAuth
	AccessToken  string    // OAuth access token
	TokenExpiry  time.Time // When the OAuth token expires
	mu           sync.Mutex // Protects token refresh
}

// SmartMeDevice represents a Smart-me device response
type SmartMeDevice struct {
	ID                   string    `json:"Id"`
	Name                 string    `json:"Name"`
	Serial               int64     `json:"Serial"`
	CounterReading       float64   `json:"CounterReading"`
	CounterReadingUnit   string    `json:"CounterReadingUnit"`
	CounterReadingExport float64   `json:"CounterReadingExport,omitempty"`
	ValueDate            time.Time `json:"ValueDate"`
	DeviceEnergyType     string    `json:"DeviceEnergyType"`
	ActivePower          float64   `json:"ActivePower"`
	ActivePowerUnit      string    `json:"ActivePowerUnit"`
}

// SmartMeValues represents detailed device values
type SmartMeValues struct {
	CounterReading       float64 `json:"CounterReading"`
	CounterReadingExport float64 `json:"CounterReadingExport"`
	CounterReadingT1     float64 `json:"CounterReadingT1"`
	CounterReadingT2     float64 `json:"CounterReadingT2"`
}

// OAuthTokenResponse represents OAuth token response
type OAuthTokenResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	ExpiresIn   int    `json:"expires_in"`
	Scope       string `json:"scope"`
}

const (
	maxConsecutiveFailures = 5
	failureResetDuration   = 1 * time.Hour
	minAPICallInterval     = 10 * time.Second
	maxRetries             = 3
	baseRetryDelay         = 1 * time.Second
)

func NewSmartMeCollector(db *sql.DB) *SmartMeCollector {
	return &SmartMeCollector{
		db:            db,
		meterReadings: make(map[int]SmartMeReading),
		authCache:     make(map[string]*SmartMeAuth),
		lastAPICall:   make(map[string]time.Time),
		failureCount:  make(map[int]int),
		stopChan:      make(chan struct{}),
	}
}

func (smc *SmartMeCollector) Start() {
	smc.mu.Lock()
	if smc.isRunning {
		smc.mu.Unlock()
		return
	}
	smc.isRunning = true
	smc.mu.Unlock()

	log.Println("[Smart-me Collector] Starting Smart-me API collector...")
	
	// Initial data fetch
	go smc.collectAllMeters()

	// Start periodic collection (every 5 minutes for Smart-me)
	ticker := time.NewTicker(5 * time.Minute)
	go func() {
		for {
			select {
			case <-ticker.C:
				smc.collectAllMeters()
			case <-smc.stopChan:
				ticker.Stop()
				return
			}
		}
	}()

	log.Println("[Smart-me Collector] Smart-me collector started successfully")
}

func (smc *SmartMeCollector) Stop() {
	smc.mu.Lock()
	defer smc.mu.Unlock()

	if !smc.isRunning {
		return
	}

	log.Println("[Smart-me Collector] Stopping Smart-me collector...")
	close(smc.stopChan)
	smc.isRunning = false
	log.Println("[Smart-me Collector] Smart-me collector stopped")
}

func (smc *SmartMeCollector) RestartConnections() {
	log.Println("[Smart-me Collector] Restarting Smart-me connections...")
	
	// Clear auth cache to force re-authentication
	smc.authCacheMu.Lock()
	smc.authCache = make(map[string]*SmartMeAuth)
	smc.authCacheMu.Unlock()
	
	// Reset failure counts
	smc.failureCountMu.Lock()
	smc.failureCount = make(map[int]int)
	smc.failureCountMu.Unlock()
	
	// Trigger immediate collection
	go smc.collectAllMeters()
	
	log.Println("[Smart-me Collector] Smart-me connections restarted")
}

func (smc *SmartMeCollector) collectAllMeters() {
	rows, err := smc.db.Query(`
		SELECT id, name, connection_config 
		FROM meters 
		WHERE is_active = 1 AND connection_type = 'smartme'
	`)
	if err != nil {
		log.Printf("[Smart-me Collector] ERROR: Failed to query Smart-me meters: %v", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var meterID int
		var meterName string
		var configJSON string

		if err := rows.Scan(&meterID, &meterName, &configJSON); err != nil {
			log.Printf("[Smart-me Collector] ERROR: Failed to scan meter: %v", err)
			continue
		}

		// Check if meter has too many consecutive failures
		if smc.shouldSkipMeter(meterID) {
			log.Printf("[Smart-me Collector] WARNING: Skipping meter '%s' (ID: %d) due to consecutive failures", meterName, meterID)
			continue
		}

		go smc.collectMeter(meterID, meterName, configJSON)
	}
}

func (smc *SmartMeCollector) shouldSkipMeter(meterID int) bool {
	smc.failureCountMu.Lock()
	defer smc.failureCountMu.Unlock()
	
	count, exists := smc.failureCount[meterID]
	return exists && count >= maxConsecutiveFailures
}

func (smc *SmartMeCollector) recordFailure(meterID int) {
	smc.failureCountMu.Lock()
	defer smc.failureCountMu.Unlock()
	
	smc.failureCount[meterID]++
	
	if smc.failureCount[meterID] >= maxConsecutiveFailures {
		log.Printf("[Smart-me Collector] ERROR: Meter %d has reached maximum consecutive failures (%d). Will retry after %v", 
			meterID, maxConsecutiveFailures, failureResetDuration)
		
		// Schedule reset
		go func(id int) {
			time.Sleep(failureResetDuration)
			smc.failureCountMu.Lock()
			delete(smc.failureCount, id)
			smc.failureCountMu.Unlock()
			log.Printf("[Smart-me Collector] Reset failure count for meter %d", id)
		}(meterID)
	}
}

func (smc *SmartMeCollector) recordSuccess(meterID int) {
	smc.failureCountMu.Lock()
	defer smc.failureCountMu.Unlock()
	
	delete(smc.failureCount, meterID)
}

func (smc *SmartMeCollector) collectMeter(meterID int, meterName, configJSON string) {
	var config map[string]interface{}
	if err := json.Unmarshal([]byte(configJSON), &config); err != nil {
		log.Printf("[Smart-me Collector] ERROR: Failed to parse config for meter '%s': %v", meterName, err)
		smc.recordFailure(meterID)
		return
	}

	deviceID, ok := config["device_id"].(string)
	if !ok || deviceID == "" {
		log.Printf("[Smart-me Collector] ERROR: No device_id configured for meter '%s'", meterName)
		smc.recordFailure(meterID)
		return
	}

	// Validate device_id format (should be a UUID)
	if !isValidUUID(deviceID) {
		log.Printf("[Smart-me Collector] ERROR: Invalid device_id format for meter '%s': %s", meterName, deviceID)
		smc.recordFailure(meterID)
		return
	}

	// Rate limiting check
	if smc.shouldThrottle(deviceID) {
		log.Printf("[Smart-me Collector] INFO: Throttling API call for device %s", deviceID)
		return
	}

	// Get or create authentication
	auth, err := smc.getAuth(config)
	if err != nil {
		log.Printf("[Smart-me Collector] ERROR: Failed to authenticate for meter '%s': %v", meterName, err)
		smc.recordFailure(meterID)
		return
	}

	// Validate auth configuration
	if err := smc.validateAuth(auth); err != nil {
		log.Printf("[Smart-me Collector] ERROR: Invalid auth configuration for meter '%s': %v", meterName, err)
		smc.recordFailure(meterID)
		return
	}

	// Fetch device data with retry
	device, err := smc.fetchDeviceWithRetry(deviceID, auth, maxRetries)
	if err != nil {
		log.Printf("[Smart-me Collector] ERROR: Failed to fetch data for meter '%s' (device: %s): %v", 
			meterName, deviceID, err)
		smc.recordFailure(meterID)
		return
	}

	// Validate response data
	if device.CounterReading < 0 {
		log.Printf("[Smart-me Collector] WARNING: Negative counter reading for meter '%s': %.3f", meterName, device.CounterReading)
	}

	// Convert counter reading to kWh (Smart-me returns Wh)
	importKWh := device.CounterReading / 1000.0
	exportKWh := device.CounterReadingExport / 1000.0

	// Store in cache
	smc.mu.Lock()
	smc.meterReadings[meterID] = SmartMeReading{
		Import:      importKWh,
		Export:      exportKWh,
		LastUpdated: time.Now(),
	}
	smc.mu.Unlock()

	// Record success
	smc.recordSuccess(meterID)

	log.Printf("[Smart-me Collector] SUCCESS: Collected data for meter '%s': %.3f kWh import, %.3f kWh export (Active Power: %.2f %s)",
		meterName, importKWh, exportKWh, device.ActivePower, device.ActivePowerUnit)
}

func (smc *SmartMeCollector) shouldThrottle(deviceID string) bool {
	smc.apiCallMu.Lock()
	defer smc.apiCallMu.Unlock()
	
	lastCall, exists := smc.lastAPICall[deviceID]
	if !exists || time.Since(lastCall) >= minAPICallInterval {
		smc.lastAPICall[deviceID] = time.Now()
		return false
	}
	return true
}

func (smc *SmartMeCollector) validateAuth(auth *SmartMeAuth) error {
	switch auth.AuthType {
	case "basic":
		if auth.Username == "" || auth.Password == "" {
			return fmt.Errorf("basic auth requires username and password")
		}
	case "apikey":
		if auth.APIKey == "" {
			return fmt.Errorf("API key auth requires api_key")
		}
	case "oauth":
		if auth.ClientID == "" || auth.ClientSecret == "" {
			return fmt.Errorf("OAuth requires client_id and client_secret")
		}
	default:
		return fmt.Errorf("unknown auth type: %s", auth.AuthType)
	}
	return nil
}

func (smc *SmartMeCollector) getAuth(config map[string]interface{}) (*SmartMeAuth, error) {
	authType := getStringFromConfig(config, "auth_type", "apikey")
	cacheKey := generateCacheKey(authType, config)

	// Check cache first
	smc.authCacheMu.RLock()
	cached, exists := smc.authCache[cacheKey]
	smc.authCacheMu.RUnlock()

	if exists {
		// For OAuth, check if token is still valid (with 5 minute buffer)
		if authType == "oauth" {
			if time.Now().Add(5 * time.Minute).Before(cached.TokenExpiry) {
				return cached, nil
			}
			// Token expired or about to expire, need to refresh
			log.Printf("[Smart-me Collector] OAuth token expired or expiring soon, refreshing...")
		} else {
			return cached, nil
		}
	}

	// Create new auth
	auth := &SmartMeAuth{
		AuthType: authType,
	}

	switch authType {
	case "basic":
		auth.Username = getStringFromConfig(config, "username", "")
		auth.Password = getStringFromConfig(config, "password", "")
		
	case "apikey":
		auth.APIKey = getStringFromConfig(config, "api_key", "")
		
	case "oauth":
		auth.ClientID = getStringFromConfig(config, "client_id", "")
		auth.ClientSecret = getStringFromConfig(config, "client_secret", "")
		
		// Get OAuth token
		if err := smc.refreshOAuthToken(auth); err != nil {
			return nil, fmt.Errorf("failed to get OAuth token: %v", err)
		}
	}

	// Cache the auth
	smc.authCacheMu.Lock()
	smc.authCache[cacheKey] = auth
	smc.authCacheMu.Unlock()

	return auth, nil
}

func (smc *SmartMeCollector) refreshOAuthToken(auth *SmartMeAuth) error {
	// Lock to prevent concurrent refresh attempts
	auth.mu.Lock()
	defer auth.mu.Unlock()

	// Double-check if another goroutine already refreshed
	if time.Now().Add(5 * time.Minute).Before(auth.TokenExpiry) {
		return nil
	}

	client := &http.Client{Timeout: 30 * time.Second} // Longer timeout for OAuth
	
	req, err := http.NewRequest("POST", "https://api.smart-me.com/api/oauth/token", nil)
	if err != nil {
		return fmt.Errorf("failed to create request: %v", err)
	}

	// Add OAuth parameters
	q := req.URL.Query()
	q.Add("grant_type", "client_credentials")
	q.Add("scope", "device.read")
	req.URL.RawQuery = q.Encode()

	// Add basic auth with client credentials
	req.SetBasicAuth(auth.ClientID, auth.ClientSecret)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("User-Agent", "ZEV-Data-Collector/1.0")

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("OAuth token request failed with status %d: %s", resp.StatusCode, string(body))
	}

	var tokenResp OAuthTokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return fmt.Errorf("failed to decode response: %v", err)
	}

	if tokenResp.AccessToken == "" {
		return fmt.Errorf("received empty access token")
	}

	auth.AccessToken = tokenResp.AccessToken
	auth.TokenExpiry = time.Now().Add(time.Duration(tokenResp.ExpiresIn) * time.Second)

	log.Printf("[Smart-me Collector] OAuth token refreshed successfully, expires in %d seconds", tokenResp.ExpiresIn)
	return nil
}

func (smc *SmartMeCollector) fetchDeviceWithRetry(deviceID string, auth *SmartMeAuth, maxRetries int) (*SmartMeDevice, error) {
	var lastErr error
	
	for attempt := 0; attempt < maxRetries; attempt++ {
		if attempt > 0 {
			// Exponential backoff
			delay := baseRetryDelay * time.Duration(1<<uint(attempt-1))
			log.Printf("[Smart-me Collector] Retry attempt %d/%d for device %s after %v", 
				attempt+1, maxRetries, deviceID, delay)
			time.Sleep(delay)
		}

		device, err := smc.fetchDevice(deviceID, auth)
		if err == nil {
			return device, nil
		}
		
		lastErr = err
		
		// Don't retry auth errors (401, 403) - these need config changes
		if isAuthError(err) {
			log.Printf("[Smart-me Collector] Authentication error detected, not retrying: %v", err)
			return nil, err
		}
		
		// Don't retry 404 - device doesn't exist
		if isNotFoundError(err) {
			log.Printf("[Smart-me Collector] Device not found, not retrying: %v", err)
			return nil, err
		}
	}
	
	return nil, fmt.Errorf("failed after %d attempts: %v", maxRetries, lastErr)
}

func (smc *SmartMeCollector) fetchDevice(deviceID string, auth *SmartMeAuth) (*SmartMeDevice, error) {
	url := fmt.Sprintf("https://api.smart-me.com/api/Devices/%s", deviceID)
	
	client := &http.Client{Timeout: 15 * time.Second}
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %v", err)
	}

	// Set authentication header
	switch auth.AuthType {
	case "basic":
		req.SetBasicAuth(auth.Username, auth.Password)
		
	case "apikey":
		req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", auth.APIKey))
		
	case "oauth":
		// Thread-safe token refresh check
		auth.mu.Lock()
		if time.Now().Add(5 * time.Minute).After(auth.TokenExpiry) {
			if err := smc.refreshOAuthToken(auth); err != nil {
				auth.mu.Unlock()
				return nil, fmt.Errorf("failed to refresh OAuth token: %v", err)
			}
		}
		token := auth.AccessToken
		auth.mu.Unlock()
		
		req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", token))
	}

	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "ZEV-Data-Collector/1.0")

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %v", err)
	}
	defer resp.Body.Close()

	// Read body for error messages
	body, readErr := io.ReadAll(resp.Body)
	if readErr != nil {
		return nil, fmt.Errorf("failed to read response body: %v", readErr)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("API request failed with status %d: %s", resp.StatusCode, string(body))
	}

	var device SmartMeDevice
	if err := json.Unmarshal(body, &device); err != nil {
		return nil, fmt.Errorf("failed to decode response: %v", err)
	}

	return &device, nil
}

func (smc *SmartMeCollector) GetMeterReading(meterID int) (float64, float64, bool) {
	smc.mu.RLock()
	defer smc.mu.RUnlock()

	reading, exists := smc.meterReadings[meterID]
	if !exists {
		return 0, 0, false
	}

	// Check if reading is fresh (less than 15 minutes old)
	if time.Since(reading.LastUpdated) > 15*time.Minute {
		return 0, 0, false
	}

	return reading.Import, reading.Export, true
}

func (smc *SmartMeCollector) ReadAllMeters() map[int]struct{ Import, Export float64 } {
	smc.mu.RLock()
	defer smc.mu.RUnlock()

	result := make(map[int]struct{ Import, Export float64 })
	
	for meterID, reading := range smc.meterReadings {
		// Only include fresh readings
		if time.Since(reading.LastUpdated) <= 15*time.Minute {
			result[meterID] = struct{ Import, Export float64 }{
				Import: reading.Import,
				Export: reading.Export,
			}
		}
	}

	return result
}

func (smc *SmartMeCollector) GetConnectionStatus() map[string]interface{} {
	smc.mu.RLock()
	activeCount := len(smc.meterReadings)
	smc.mu.RUnlock()

	var freshCount int
	for _, reading := range smc.meterReadings {
		if time.Since(reading.LastUpdated) <= 15*time.Minute {
			freshCount++
		}
	}

	smc.failureCountMu.Lock()
	failedCount := len(smc.failureCount)
	smc.failureCountMu.Unlock()

	return map[string]interface{}{
		"smartme_meters_configured": activeCount,
		"smartme_meters_fresh":      freshCount,
		"smartme_meters_failed":     failedCount,
		"smartme_collector_running": smc.isRunning,
	}
}

// TestConnection tests a Smart-me configuration without saving it
func (smc *SmartMeCollector) TestConnection(config map[string]interface{}) error {
	deviceID, ok := config["device_id"].(string)
	if !ok || deviceID == "" {
		return fmt.Errorf("device_id is required")
	}

	if !isValidUUID(deviceID) {
		return fmt.Errorf("invalid device_id format (must be UUID)")
	}

	auth, err := smc.getAuth(config)
	if err != nil {
		return fmt.Errorf("authentication failed: %v", err)
	}

	if err := smc.validateAuth(auth); err != nil {
		return fmt.Errorf("invalid authentication configuration: %v", err)
	}

	device, err := smc.fetchDeviceWithRetry(deviceID, auth, 2)
	if err != nil {
		return fmt.Errorf("failed to fetch device: %v", err)
	}

	if device.CounterReading < 0 {
		return fmt.Errorf("device returned invalid counter reading: %.3f", device.CounterReading)
	}

	log.Printf("[Smart-me Collector] Test connection successful for device %s: %.3f Wh", 
		deviceID, device.CounterReading)
	
	return nil
}

// Helper functions

func getStringFromConfig(config map[string]interface{}, key, defaultValue string) string {
	if val, ok := config[key].(string); ok {
		return val
	}
	return defaultValue
}

func generateCacheKey(authType string, config map[string]interface{}) string {
	switch authType {
	case "basic":
		return fmt.Sprintf("basic_%s", getStringFromConfig(config, "username", ""))
	case "apikey":
		return fmt.Sprintf("apikey_%s", getStringFromConfig(config, "api_key", ""))
	case "oauth":
		return fmt.Sprintf("oauth_%s", getStringFromConfig(config, "client_id", ""))
	default:
		return fmt.Sprintf("unknown_%v", config)
	}
}

func isValidUUID(uuid string) bool {
	// Basic UUID format validation (8-4-4-4-12)
	if len(uuid) != 36 {
		return false
	}
	// Check for hyphens in correct positions
	if uuid[8] != '-' || uuid[13] != '-' || uuid[18] != '-' || uuid[23] != '-' {
		return false
	}
	return true
}

func isAuthError(err error) bool {
	if err == nil {
		return false
	}
	errStr := err.Error()
	return strings.Contains(errStr, "status 401") || 
	       strings.Contains(errStr, "status 403") ||
	       strings.Contains(errStr, "authentication failed") ||
	       strings.Contains(errStr, "unauthorized")
}

func isNotFoundError(err error) bool {
	if err == nil {
		return false
	}
	return strings.Contains(err.Error(), "status 404")
}