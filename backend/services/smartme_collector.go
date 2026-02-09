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
// UPDATED ARCHITECTURE: Polls at exact 15-minute intervals (:00, :15, :30, :45)
// No more cache - data is fetched and saved directly during coordinated collection
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
	failureTime      map[int]time.Time    // Track when meter first hit max failures
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
	CounterReadingImport float64   `json:"CounterReadingImport"`
	CounterReadingExport float64   `json:"CounterReadingExport,omitempty"`
	ValueDate            time.Time `json:"ValueDate"`
	DeviceEnergyType     int       `json:"DeviceEnergyType"`
	ActivePower          float64   `json:"ActivePower"`
	ActivePowerUnit      string    `json:"ActivePowerUnit"`
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
	minAPICallInterval     = 5 * time.Second  // Reduced for coordinated collection
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
		failureTime:   make(map[int]time.Time),
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

	log.Println("[Smart-me Collector] ========================================")
	log.Println("[Smart-me Collector] Starting Smart-me API collector...")
	log.Println("[Smart-me Collector] UPDATED ARCHITECTURE:")
	log.Println("[Smart-me Collector]   - Polling: At exact 15-min intervals (:00, :15, :30, :45)")
	log.Println("[Smart-me Collector]   - No cache needed - direct fetch during collection")
	log.Println("[Smart-me Collector]   - Real timestamps (no rounding required)")
	log.Println("[Smart-me Collector]   - Fully aligned with other collectors")
	log.Println("[Smart-me Collector] ========================================")
	
	log.Println("[Smart-me Collector] Smart-me collector started successfully")
	log.Println("[Smart-me Collector] Ready for coordinated collection at 15-minute intervals")
}

func (smc *SmartMeCollector) Stop() {
	smc.mu.Lock()
	defer smc.mu.Unlock()

	if !smc.isRunning {
		return
	}

	log.Println("[Smart-me Collector] Stopping Smart-me collector...")
	smc.isRunning = false
	log.Println("[Smart-me Collector] Smart-me collector stopped")
}

func (smc *SmartMeCollector) RestartConnections() {
	log.Println("[Smart-me Collector] Restarting Smart-me connections...")
	
	// Clear auth cache to force re-authentication
	smc.authCacheMu.Lock()
	smc.authCache = make(map[string]*SmartMeAuth)
	smc.authCacheMu.Unlock()
	
	// Reset failure counts and timers
	smc.failureCountMu.Lock()
	smc.failureCount = make(map[int]int)
	smc.failureTime = make(map[int]time.Time)
	smc.failureCountMu.Unlock()
	
	log.Println("[Smart-me Collector] Smart-me connections restarted")
}

// CollectMeterNow fetches data for a specific meter immediately (called during 15-min cycle)
func (smc *SmartMeCollector) CollectMeterNow(meterID int, meterName, configJSON string) (float64, float64, error) {
	var config map[string]interface{}
	if err := json.Unmarshal([]byte(configJSON), &config); err != nil {
		return 0, 0, fmt.Errorf("failed to parse config: %v", err)
	}

	deviceID, ok := config["device_id"].(string)
	if !ok || deviceID == "" {
		return 0, 0, fmt.Errorf("no device_id configured")
	}

	// Validate device_id format
	if !isValidUUID(deviceID) {
		return 0, 0, fmt.Errorf("invalid device_id format: %s", deviceID)
	}

	// Get or create authentication
	auth, err := smc.getAuth(config)
	if err != nil {
		smc.recordFailure(meterID)
		return 0, 0, fmt.Errorf("authentication failed: %v", err)
	}

	// Validate auth configuration
	if err := smc.validateAuth(auth); err != nil {
		smc.recordFailure(meterID)
		return 0, 0, fmt.Errorf("invalid auth configuration: %v", err)
	}

	// Fetch device data with retry
	device, err := smc.fetchDeviceWithRetry(deviceID, auth, maxRetries)
	if err != nil {
		smc.recordFailure(meterID)
		return 0, 0, fmt.Errorf("failed to fetch device data: %v", err)
	}

	// Use CounterReadingImport if available, otherwise use CounterReading
	importKWh := device.CounterReadingImport
	if importKWh == 0 && device.CounterReading > 0 {
		importKWh = device.CounterReading
	}
	exportKWh := device.CounterReadingExport

	// Validate response data
	if importKWh < 0 {
		log.Printf("[Smart-me Collector] WARNING: Negative counter reading for meter '%s': %.3f", meterName, importKWh)
	}

	// Record success
	smc.recordSuccess(meterID)

	log.Printf("[Smart-me Collector] ✓ FETCHED: Meter '%s' - Import: %.3f kWh, Export: %.3f kWh (Power: %.2f %s)",
		meterName, importKWh, exportKWh, device.ActivePower, device.ActivePowerUnit)

	return importKWh, exportKWh, nil
}

// ShouldSkipMeter checks if a meter should be skipped due to consecutive failures (exported)
func (smc *SmartMeCollector) ShouldSkipMeter(meterID int) bool {
	smc.failureCountMu.Lock()
	defer smc.failureCountMu.Unlock()

	count, exists := smc.failureCount[meterID]
	if !exists || count < maxConsecutiveFailures {
		return false
	}

	// Check if enough time has passed to auto-reset (no goroutine needed)
	if failTime, ok := smc.failureTime[meterID]; ok {
		if time.Since(failTime) >= failureResetDuration {
			delete(smc.failureCount, meterID)
			delete(smc.failureTime, meterID)
			log.Printf("[Smart-me Collector] Auto-reset failure count for meter %d after %v", meterID, failureResetDuration)
			return false
		}
	}

	return true
}

func (smc *SmartMeCollector) recordFailure(meterID int) {
	smc.failureCountMu.Lock()
	defer smc.failureCountMu.Unlock()

	smc.failureCount[meterID]++

	if smc.failureCount[meterID] >= maxConsecutiveFailures {
		// Record when max failures was hit (for time-based auto-reset, no goroutine leak)
		if _, exists := smc.failureTime[meterID]; !exists {
			smc.failureTime[meterID] = time.Now()
		}
		log.Printf("[Smart-me Collector] ERROR: Meter %d has reached maximum consecutive failures (%d). Will auto-retry after %v",
			meterID, maxConsecutiveFailures, failureResetDuration)
	}
}

func (smc *SmartMeCollector) recordSuccess(meterID int) {
	smc.failureCountMu.Lock()
	defer smc.failureCountMu.Unlock()
	
	delete(smc.failureCount, meterID)
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

	client := &http.Client{Timeout: 30 * time.Second}
	
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
	url := fmt.Sprintf("https://api.smart-me.com/Devices/%s", deviceID)
	
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
		return nil, fmt.Errorf("failed to decode response: %v (body: %s)", err, string(body))
	}

	return &device, nil
}

// GetMeterReading - DEPRECATED in aligned architecture
// Data is fetched directly during collection, no cache needed
func (smc *SmartMeCollector) GetMeterReading(meterID int) (float64, float64, bool) {
	// This method is kept for backward compatibility but not used
	// In the aligned architecture, CollectMeterNow() is called directly
	return 0, 0, false
}

// ReadAllMeters - DEPRECATED in aligned architecture  
// Use CollectMeterNow() for each meter during coordinated collection
func (smc *SmartMeCollector) ReadAllMeters() map[int]struct{ Import, Export float64 } {
	// This method is kept for backward compatibility but not used
	return make(map[int]struct{ Import, Export float64 })
}

func (smc *SmartMeCollector) GetConnectionStatus() map[string]interface{} {
	smc.failureCountMu.Lock()
	failedCount := len(smc.failureCount)
	smc.failureCountMu.Unlock()

	return map[string]interface{}{
		"smartme_collector_running": smc.isRunning,
		"smartme_meters_failed":     failedCount,
		"smartme_collection_mode":   "aligned_15min",
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

	importReading := device.CounterReadingImport
	if importReading == 0 && device.CounterReading > 0 {
		importReading = device.CounterReading
	}

	if importReading < 0 {
		return fmt.Errorf("device returned invalid counter reading: %.3f", importReading)
	}

	log.Printf("[Smart-me Collector] Test connection successful for device %s: Import=%.3f kWh, Export=%.3f kWh", 
		deviceID, importReading, device.CounterReadingExport)
	
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