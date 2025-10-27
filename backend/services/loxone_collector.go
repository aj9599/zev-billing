package services

import (
	"crypto/hmac"
	"crypto/sha1"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type LoxoneCollector struct {
	db          *sql.DB
	connections map[int]*LoxoneConnection // meterID -> connection
	mu          sync.RWMutex
}

type LoxoneConnection struct {
	MeterID     int
	MeterName   string
	Host        string
	Username    string
	Password    string
	DeviceID    string
	ws          *websocket.Conn
	isConnected bool
	token       string // Store authentication token
	tokenValid  time.Time
	lastReading float64
	lastUpdate  time.Time
	lastError   string
	stopChan    chan bool
	mu          sync.Mutex
}

type LoxoneResponse struct {
	LL LoxoneLLData `json:"LL"`
}

type LoxoneLLData struct {
	Control string                    `json:"control"`
	Value   string                    `json:"value"`
	Code    string                    `json:"Code"`
	Outputs map[string]LoxoneOutput   `json:"-"`
}

type LoxoneOutput struct {
	Name  string      `json:"name"`
	Nr    int         `json:"nr"`
	Value interface{} `json:"value"`
}

// Key response structure for getkey2
type LoxoneKeyResponse struct {
	Key              string `json:"key"`
	Salt             string `json:"salt"`
	HashAlg          string `json:"hashAlg"`
	TokenValidUntil  int64  `json:"tokenValidUntil"`
}

// Custom unmarshal to handle dynamic output fields
func (ld *LoxoneLLData) UnmarshalJSON(data []byte) error {
	var raw map[string]interface{}
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	
	ld.Outputs = make(map[string]LoxoneOutput)
	
	for key, value := range raw {
		switch key {
		case "control":
			if v, ok := value.(string); ok {
				ld.Control = v
			}
		case "value":
			if v, ok := value.(string); ok {
				ld.Value = v
			}
		case "Code":
			if v, ok := value.(string); ok {
				ld.Code = v
			}
		default:
			if strings.HasPrefix(key, "output") {
				if outputMap, ok := value.(map[string]interface{}); ok {
					output := LoxoneOutput{}
					if name, ok := outputMap["name"].(string); ok {
						output.Name = name
					}
					if nr, ok := outputMap["nr"].(float64); ok {
						output.Nr = int(nr)
					}
					output.Value = outputMap["value"]
					ld.Outputs[key] = output
				}
			}
		}
	}
	
	return nil
}

func NewLoxoneCollector(db *sql.DB) *LoxoneCollector {
	log.Println("🔧 LOXONE COLLECTOR: NewLoxoneCollector() called")
	lc := &LoxoneCollector{
		db:          db,
		connections: make(map[int]*LoxoneConnection),
	}
	log.Println("🔧 LOXONE COLLECTOR: Instance created successfully")
	return lc
}

func (lc *LoxoneCollector) Start() {
	log.Println("===================================")
	log.Println("🔌 LOXONE WEBSOCKET COLLECTOR STARTING")
	log.Println("===================================")
	
	lc.initializeConnections()
	
	log.Printf("✓ Loxone Collector initialized with %d connections", len(lc.connections))
	
	// Monitor and reconnect dropped connections
	go lc.monitorConnections()
	
	log.Println("✓ Loxone connection monitor started")
	log.Println("===================================")
}

func (lc *LoxoneCollector) Stop() {
	log.Println("🛑 STOPPING ALL LOXONE CONNECTIONS")
	lc.mu.Lock()
	defer lc.mu.Unlock()
	
	for meterID, conn := range lc.connections {
		log.Printf("Closing connection for meter ID %d (%s)", meterID, conn.MeterName)
		conn.Close()
	}
	lc.connections = make(map[int]*LoxoneConnection)
	log.Println("✓ All Loxone connections stopped")
}

func (lc *LoxoneCollector) RestartConnections() {
	log.Println("=== RESTARTING LOXONE CONNECTIONS ===")
	lc.Stop()
	time.Sleep(500 * time.Millisecond)
	lc.initializeConnections()
	log.Println("=== LOXONE CONNECTIONS RESTARTED ===")
}

func (lc *LoxoneCollector) initializeConnections() {
	log.Println("🔍 SCANNING DATABASE FOR LOXONE API METERS...")
	
	rows, err := lc.db.Query(`
		SELECT id, name, connection_config
		FROM meters 
		WHERE is_active = 1 AND connection_type = 'loxone_api'
	`)
	if err != nil {
		log.Printf("❌ ERROR: Failed to query Loxone meters: %v", err)
		return
	}
	defer rows.Close()

	meterCount := 0
	for rows.Next() {
		var id int
		var name, connectionConfig string
		
		if err := rows.Scan(&id, &name, &connectionConfig); err != nil {
			log.Printf("❌ ERROR: Failed to scan meter row: %v", err)
			continue
		}

		meterCount++
		log.Println("─────────────────────────────────")
		log.Printf("📊 FOUND LOXONE METER #%d", meterCount)
		log.Printf("   Name: '%s'", name)
		log.Printf("   ID: %d", id)

		var config map[string]interface{}
		if err := json.Unmarshal([]byte(connectionConfig), &config); err != nil {
			log.Printf("❌ ERROR: Failed to parse config for meter '%s': %v", name, err)
			continue
		}

		log.Printf("   Config parsed successfully")

		host := ""
		if h, ok := config["loxone_host"].(string); ok {
			host = h
			log.Printf("   ├─ Host: %s", host)
		} else {
			log.Printf("   ├─ Host: ❌ MISSING")
		}

		username := ""
		if u, ok := config["loxone_username"].(string); ok {
			username = u
			log.Printf("   ├─ Username: %s", username)
		} else {
			log.Printf("   ├─ Username: (none - admin mode)")
		}

		password := ""
		if p, ok := config["loxone_password"].(string); ok {
			password = p
			if password != "" {
				log.Printf("   ├─ Password: ********** (set)")
			} else {
				log.Printf("   ├─ Password: (empty)")
			}
		} else {
			log.Printf("   ├─ Password: (none)")
		}

		deviceID := ""
		if d, ok := config["loxone_device_id"].(string); ok {
			deviceID = d
			log.Printf("   ├─ Device UUID: %s", deviceID)
		} else {
			log.Printf("   ├─ Device UUID: ❌ MISSING")
		}

		if host == "" || deviceID == "" {
			log.Printf("   └─ ⚠️  WARNING: Incomplete config - missing host or device_id")
			log.Printf("      Skipping this meter")
			continue
		}

		log.Printf("   └─ ✓ Configuration valid, initiating connection...")

		conn := &LoxoneConnection{
			MeterID:   id,
			MeterName: name,
			Host:      host,
			Username:  username,
			Password:  password,
			DeviceID:  deviceID,
			stopChan:  make(chan bool),
		}

		lc.mu.Lock()
		lc.connections[id] = conn
		lc.mu.Unlock()

		log.Printf("🚀 Starting connection goroutine for meter '%s'...", name)
		go conn.Connect(lc.db)
	}

	if meterCount == 0 {
		log.Println("ℹ️  NO LOXONE API METERS FOUND IN DATABASE")
		log.Println("   To add Loxone meters:")
		log.Println("   1. Go to Meters page")
		log.Println("   2. Add new meter")
		log.Println("   3. Select 'Loxone WebSocket API' as connection type")
	} else {
		log.Println("─────────────────────────────────")
		log.Printf("✓ INITIALIZED %d LOXONE WEBSOCKET CONNECTIONS", meterCount)
	}
}

func (lc *LoxoneCollector) monitorConnections() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	log.Println("👀 LOXONE CONNECTION MONITOR STARTED (checking every 30 seconds)")

	for range ticker.C {
		lc.mu.RLock()
		disconnectedCount := 0
		connectedCount := 0
		
		log.Println("─────────────────────────────────")
		log.Println("📊 LOXONE CONNECTION STATUS CHECK")
		
		for meterID, conn := range lc.connections {
			conn.mu.Lock()
			isConnected := conn.isConnected
			lastUpdate := conn.lastUpdate
			lastError := conn.lastError
			conn.mu.Unlock()
			
			if !isConnected {
				disconnectedCount++
				log.Printf("   🔴 Meter %d (%s): DISCONNECTED", meterID, conn.MeterName)
				if lastError != "" {
					log.Printf("      Last error: %s", lastError)
				}
				log.Printf("      → Attempting reconnect...")
				go conn.Connect(lc.db)
			} else {
				connectedCount++
				timeSinceUpdate := time.Since(lastUpdate)
				log.Printf("   🟢 Meter %d (%s): CONNECTED", meterID, conn.MeterName)
				if !lastUpdate.IsZero() {
					log.Printf("      Last update: %s (%.0f seconds ago)", 
						lastUpdate.Format("15:04:05"), timeSinceUpdate.Seconds())
				}
			}
		}
		lc.mu.RUnlock()
		
		log.Printf("📊 Summary: %d connected, %d disconnected", connectedCount, disconnectedCount)
		log.Println("─────────────────────────────────")
	}
}

func (lc *LoxoneCollector) GetConnectionStatus() map[int]map[string]interface{} {
	lc.mu.RLock()
	defer lc.mu.RUnlock()

	status := make(map[int]map[string]interface{})
	for meterID, conn := range lc.connections {
		conn.mu.Lock()
		status[meterID] = map[string]interface{}{
			"meter_name":   conn.MeterName,
			"host":         conn.Host,
			"device_id":    conn.DeviceID,
			"is_connected": conn.isConnected,
			"last_reading": conn.lastReading,
			"last_update":  conn.lastUpdate.Format("2006-01-02 15:04:05"),
			"last_error":   conn.lastError,
			"has_token":    conn.token != "",
			"token_valid":  conn.tokenValid.Format("2006-01-02 15:04:05"),
		}
		conn.mu.Unlock()
	}
	return status
}

// readLoxoneMessage handles Loxone's binary protocol
// Loxone sends messages in two parts:
//   1. Binary header (8 bytes): [type][pad][pad][pad][length as uint32]
//   2. JSON payload (text message)
func (conn *LoxoneConnection) readLoxoneMessage() ([]byte, error) {
	// Read first message
	messageType, message, err := conn.ws.ReadMessage()
	if err != nil {
		return nil, fmt.Errorf("failed to read message: %v", err)
	}
	
	log.Printf("   ← Received message type: %d, length: %d bytes", messageType, len(message))
	
	// Check if this is a binary header (8 bytes, type 0x03 for text event)
	if messageType == websocket.BinaryMessage && len(message) == 8 {
		headerType := message[0]
		// Bytes 4-7 contain the payload length in little-endian format
		payloadLength := uint32(message[4]) | 
		                 uint32(message[5])<<8 | 
		                 uint32(message[6])<<16 | 
		                 uint32(message[7])<<24
		
		log.Printf("   ℹ️  Binary header detected:")
		log.Printf("      Type: 0x%02X", headerType)
		log.Printf("      Payload length: %d bytes", payloadLength)
		
		// Read the actual JSON payload in the next message
		messageType, message, err = conn.ws.ReadMessage()
		if err != nil {
			return nil, fmt.Errorf("failed to read JSON payload: %v", err)
		}
		
		log.Printf("   ← Received payload type: %d, length: %d bytes", messageType, len(message))
	}
	
	// Display first 100 chars of the message
	displayLen := len(message)
	if displayLen > 100 {
		displayLen = 100
	}
	log.Printf("   ← Message preview: %s", string(message[:displayLen]))
	
	// Extract JSON (handle both direct JSON and with extra padding)
	jsonData := conn.extractJSON(message)
	if jsonData == nil {
		return nil, fmt.Errorf("could not extract JSON from message")
	}
	
	return jsonData, nil
}

func (conn *LoxoneConnection) Connect(db *sql.DB) {
	log.Println("╔═══════════════════════════════════╗")
	log.Printf("║ 🔗 CONNECTING: %s (ID: %d)", conn.MeterName, conn.MeterID)
	log.Println("╚═══════════════════════════════════╝")
	
	conn.mu.Lock()
	if conn.isConnected {
		conn.mu.Unlock()
		log.Printf("ℹ️  Already connected, skipping")
		return
	}
	conn.mu.Unlock()

	// Build WebSocket URL
	wsURL := fmt.Sprintf("ws://%s/ws/rfc6455", conn.Host)

	log.Printf("Step 1: Establishing WebSocket connection")
	log.Printf("   URL: %s", wsURL)

	dialer := websocket.Dialer{
		HandshakeTimeout: 10 * time.Second,
	}

	ws, _, err := dialer.Dial(wsURL, nil)
	if err != nil {
		errMsg := fmt.Sprintf("Failed to connect: %v", err)
		log.Printf("❌ %s", errMsg)
		conn.mu.Lock()
		conn.isConnected = false
		conn.lastError = errMsg
		conn.mu.Unlock()
		
		// Update meter with error status
		db.Exec(`UPDATE meters SET notes = ? WHERE id = ?`, 
			fmt.Sprintf("🔴 Connection failed: %v", err), 
			conn.MeterID)
		return
	}

	conn.mu.Lock()
	conn.ws = ws
	conn.mu.Unlock()

	log.Printf("✓ WebSocket connected successfully")
	log.Printf("Step 2: Starting token-based authentication")

	// Authenticate using token-based method (Loxone API v2)
	if err := conn.authenticateWithToken(); err != nil {
		errMsg := fmt.Sprintf("Authentication failed: %v", err)
		log.Printf("❌ %s", errMsg)
		ws.Close()
		conn.mu.Lock()
		conn.isConnected = false
		conn.lastError = errMsg
		conn.mu.Unlock()
		
		// Update meter with error status
		db.Exec(`UPDATE meters SET notes = ? WHERE id = ?`, 
			fmt.Sprintf("🔴 Auth failed: %v", err), 
			conn.MeterID)
		return
	}

	conn.mu.Lock()
	conn.isConnected = true
	conn.lastError = ""
	conn.mu.Unlock()

	log.Println("╔═══════════════════════════════════╗")
	log.Printf("║ ✅ CONNECTION ESTABLISHED!         ║")
	log.Printf("║ Meter: %-25s║", conn.MeterName)
	log.Printf("║ Device: %-24s║", conn.DeviceID[:min(len(conn.DeviceID), 24)])
	log.Printf("║ Host: %-27s║", conn.Host)
	log.Println("╚═══════════════════════════════════╝")

	// Update meter status in database
	db.Exec(`UPDATE meters SET notes = ? WHERE id = ?`, 
		fmt.Sprintf("🟢 Connected at %s", time.Now().Format("2006-01-02 15:04:05")), 
		conn.MeterID)

	// Start reading data
	log.Printf("🎧 Starting data listener for %s...", conn.MeterName)
	go conn.readLoop(db)
	
	log.Printf("⏰ Starting data request scheduler for %s...", conn.MeterName)
	go conn.requestData()
}

func (conn *LoxoneConnection) authenticateWithToken() error {
	log.Printf("🔐 TOKEN AUTHENTICATION - Step 1: Request key exchange")
	log.Printf("   Using Loxone API v2 (getkey2)")
	
	// Step 1: Get key and salt using getkey2
	getKeyCmd := fmt.Sprintf("jdev/sys/getkey2/%s", conn.Username)
	log.Printf("   → Sending: %s", getKeyCmd)
	
	if err := conn.ws.WriteMessage(websocket.TextMessage, []byte(getKeyCmd)); err != nil {
		return fmt.Errorf("failed to request key: %v", err)
	}

	// Read key response
	jsonData, err := conn.readLoxoneMessage()
	if err != nil {
		return fmt.Errorf("failed to read key response: %v", err)
	}
	
	log.Printf("   ← Received key response")

	// Parse the key response
	var keyResp struct {
		LL struct {
			Control string `json:"control"`
			Code    string `json:"Code"`
			Value   string `json:"value"`
		} `json:"LL"`
	}

	if err := json.Unmarshal(jsonData, &keyResp); err != nil {
		return fmt.Errorf("failed to parse key response: %v", err)
	}

	log.Printf("   ← Response code: %s", keyResp.LL.Code)

	if keyResp.LL.Code != "200" {
		return fmt.Errorf("getkey2 failed with code: %s", keyResp.LL.Code)
	}

	// Parse the value which contains key, salt, etc.
	var keyData LoxoneKeyResponse
	if err := json.Unmarshal([]byte(keyResp.LL.Value), &keyData); err != nil {
		return fmt.Errorf("failed to parse key data: %v", err)
	}

	log.Printf("   ✓ Received key: %s...", keyData.Key[:min(len(keyData.Key), 16)])
	log.Printf("   ✓ Received salt: %s...", keyData.Salt[:min(len(keyData.Salt), 16)])
	log.Printf("   ✓ Hash algorithm: %s", keyData.HashAlg)

	// Step 2: Hash password with salt
	log.Printf("🔐 TOKEN AUTHENTICATION - Step 2: Hash password with salt")
	
	// Hash = SHA1(password + ":" + salt)
	pwSaltStr := conn.Password + ":" + keyData.Salt
	pwHash := sha1.Sum([]byte(pwSaltStr))
	pwHashHex := strings.ToUpper(hex.EncodeToString(pwHash[:]))
	
	log.Printf("   ✓ Password hashed with salt")
	log.Printf("   ✓ Hash: %s...", pwHashHex[:min(len(pwHashHex), 16)])

	// Step 3: Create HMAC
	log.Printf("🔐 TOKEN AUTHENTICATION - Step 3: Create HMAC token")
	
	// Decode the hex key
	keyBytes, err := hex.DecodeString(keyData.Key)
	if err != nil {
		return fmt.Errorf("failed to decode key: %v", err)
	}

	// HMAC = HMAC-SHA1(username + ":" + hash, key)
	hmacMessage := conn.Username + ":" + pwHashHex
	h := hmac.New(sha1.New, keyBytes)
	h.Write([]byte(hmacMessage))
	hmacHash := hex.EncodeToString(h.Sum(nil))
	
	log.Printf("   ✓ HMAC created")
	log.Printf("   ✓ HMAC: %s...", hmacHash[:min(len(hmacHash), 16)])

	// Step 4: Get token
	log.Printf("🔐 TOKEN AUTHENTICATION - Step 4: Request authentication token")
	
	// gettoken/hash/username/permission/uuid/info
	// For basic usage: gettoken/hash/username/2/uuid/deviceName
	uuid := "zev-billing-system"
	info := "ZEV-Billing"
	permission := "2" // 2 = app permission level
	
	getTokenCmd := fmt.Sprintf("jdev/sys/gettoken/%s/%s/%s/%s/%s", 
		hmacHash, conn.Username, permission, uuid, info)
	
	log.Printf("   → Sending: jdev/sys/gettoken/[hash]/%s/%s/%s/%s", 
		conn.Username, permission, uuid, info)

	if err := conn.ws.WriteMessage(websocket.TextMessage, []byte(getTokenCmd)); err != nil {
		return fmt.Errorf("failed to request token: %v", err)
	}

	// Read token response
	jsonData, err = conn.readLoxoneMessage()
	if err != nil {
		return fmt.Errorf("failed to read token response: %v", err)
	}

	var tokenResp struct {
		LL struct {
			Control string `json:"control"`
			Code    string `json:"Code"`
			Value   string `json:"value"`
		} `json:"LL"`
	}

	if err := json.Unmarshal(jsonData, &tokenResp); err != nil {
		return fmt.Errorf("failed to parse token response: %v", err)
	}

	log.Printf("   ← Response code: %s", tokenResp.LL.Code)
	log.Printf("   ← Response value: %s", tokenResp.LL.Value)

	if tokenResp.LL.Code != "200" {
		return fmt.Errorf("gettoken failed with code: %s, value: %s", 
			tokenResp.LL.Code, tokenResp.LL.Value)
	}

	// Parse token data
	var tokenData struct {
		Token     string `json:"token"`
		ValidUntil int64 `json:"validUntil"`
		Rights    int    `json:"rights"`
		Unsecure  int    `json:"unsecurePass"`
	}

	if err := json.Unmarshal([]byte(tokenResp.LL.Value), &tokenData); err != nil {
		return fmt.Errorf("failed to parse token data: %v", err)
	}

	log.Printf("   ✓ Token received: %s...", tokenData.Token[:min(len(tokenData.Token), 16)])
	log.Printf("   ✓ Valid until: %v", time.Unix(tokenData.ValidUntil, 0).Format("2006-01-02 15:04:05"))
	log.Printf("   ✓ Rights: %d", tokenData.Rights)

	// Store token
	conn.mu.Lock()
	conn.token = tokenData.Token
	conn.tokenValid = time.Unix(tokenData.ValidUntil, 0)
	conn.mu.Unlock()

	// Step 5: Authenticate with token
	log.Printf("🔐 TOKEN AUTHENTICATION - Step 5: Authenticate with token")
	
	authTokenCmd := fmt.Sprintf("jdev/sys/authwithtoken/%s/%s", tokenData.Token, conn.Username)
	log.Printf("   → Sending: jdev/sys/authwithtoken/[token]/%s", conn.Username)

	if err := conn.ws.WriteMessage(websocket.TextMessage, []byte(authTokenCmd)); err != nil {
		return fmt.Errorf("failed to authenticate with token: %v", err)
	}

	// Read auth response
	jsonData, err = conn.readLoxoneMessage()
	if err != nil {
		return fmt.Errorf("failed to read auth response: %v", err)
	}

	var authResp struct {
		LL struct {
			Control string `json:"control"`
			Code    string `json:"Code"`
			Value   string `json:"value"`
		} `json:"LL"`
	}

	if err := json.Unmarshal(jsonData, &authResp); err != nil {
		return fmt.Errorf("failed to parse auth response: %v", err)
	}

	log.Printf("   ← Response code: %s", authResp.LL.Code)

	if authResp.LL.Code != "200" {
		return fmt.Errorf("authwithtoken failed with code: %s, value: %s", 
			authResp.LL.Code, authResp.LL.Value)
	}

	log.Printf("   ✅ AUTHENTICATION SUCCESSFUL!")
	log.Printf("   Token is valid until: %s", conn.tokenValid.Format("2006-01-02 15:04:05"))
	
	return nil
}

// extractJSON extracts JSON data from Loxone message (handles both text and binary formats)
func (conn *LoxoneConnection) extractJSON(message []byte) []byte {
	if len(message) == 0 {
		return nil
	}
	
	// Check if it's already JSON (starts with '{')
	if message[0] == '{' {
		return message
	}
	
	// Try to find JSON start
	for i := 0; i < len(message)-1 && i < 20; i++ {
		if message[i] == '{' {
			log.Printf("   ℹ️  Found JSON at offset %d", i)
			return message[i:]
		}
	}
	
	// Look for "LL" pattern which is in all responses
	jsonStr := string(message)
	if idx := strings.Index(jsonStr, "{\"LL\""); idx != -1 {
		log.Printf("   ℹ️  Found JSON at offset %d (searched for LL pattern)", idx)
		return message[idx:]
	}
	
	// Last resort: try to find any JSON-like structure
	if idx := strings.Index(jsonStr, "{"); idx != -1 {
		log.Printf("   ℹ️  Found potential JSON at offset %d", idx)
		return message[idx:]
	}
	
	log.Printf("   ⚠️  Could not find JSON in message")
	return nil
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func (conn *LoxoneConnection) requestData() {
	log.Printf("⏰ DATA REQUEST SCHEDULER STARTED for %s", conn.MeterName)
	log.Printf("   Collection interval: 15 minutes (at :00, :15, :30, :45)")
	
	// Request data every 15 minutes at exact intervals
	for {
		now := time.Now()
		next := getNextQuarterHour(now)
		waitDuration := next.Sub(now)
		
		log.Printf("📅 [%s] Next data request scheduled for %s (in %.0f seconds)", 
			conn.MeterName, next.Format("15:04:05"), waitDuration.Seconds())
		
		time.Sleep(waitDuration)
		
		conn.mu.Lock()
		if !conn.isConnected || conn.ws == nil {
			log.Printf("⚠️  [%s] Not connected, skipping data request", conn.MeterName)
			conn.mu.Unlock()
			return
		}
		
		// Check if token is still valid
		if time.Now().After(conn.tokenValid) {
			log.Printf("⚠️  [%s] Token expired, need to re-authenticate", conn.MeterName)
			conn.isConnected = false
			conn.mu.Unlock()
			return
		}
		
		// Request device data
		cmd := fmt.Sprintf("jdev/sps/io/%s/all", conn.DeviceID)
		log.Println("─────────────────────────────────")
		log.Printf("📡 [%s] REQUESTING DATA", conn.MeterName)
		log.Printf("   Command: %s", cmd)
		log.Printf("   Time: %s", time.Now().Format("15:04:05"))
		
		if err := conn.ws.WriteMessage(websocket.TextMessage, []byte(cmd)); err != nil {
			log.Printf("❌ [%s] Failed to request data: %v", conn.MeterName, err)
			conn.isConnected = false
			conn.lastError = fmt.Sprintf("Data request failed: %v", err)
			conn.mu.Unlock()
			return
		}
		log.Printf("   ✓ Request sent successfully")
		conn.mu.Unlock()
	}
}

func (conn *LoxoneConnection) readLoop(db *sql.DB) {
	defer func() {
		conn.mu.Lock()
		if conn.ws != nil {
			conn.ws.Close()
		}
		conn.isConnected = false
		conn.mu.Unlock()
		log.Printf("🔴 [%s] DISCONNECTED from Loxone", conn.MeterName)
		
		// Update meter with offline status
		db.Exec(`UPDATE meters SET notes = ? WHERE id = ?`, 
			fmt.Sprintf("🔴 Offline since %s", time.Now().Format("2006-01-02 15:04:05")), 
			conn.MeterID)
	}()

	log.Printf("👂 [%s] DATA LISTENER ACTIVE - waiting for messages...", conn.MeterName)

	messageCount := 0
	for {
		select {
		case <-conn.stopChan:
			log.Printf("🛑 [%s] Received stop signal, closing listener", conn.MeterName)
			return
		default:
			conn.mu.Lock()
			ws := conn.ws
			conn.mu.Unlock()
			
			if ws == nil {
				log.Printf("⚠️  [%s] WebSocket is nil, closing listener", conn.MeterName)
				return
			}

			// Use readLoxoneMessage to handle binary protocol
			jsonData, err := conn.readLoxoneMessage()
			if err != nil {
				if strings.Contains(err.Error(), "websocket: close") {
					log.Printf("ℹ️  [%s] WebSocket closed normally", conn.MeterName)
				} else {
					log.Printf("❌ [%s] Read error: %v", conn.MeterName, err)
					conn.mu.Lock()
					conn.lastError = fmt.Sprintf("Read error: %v", err)
					conn.mu.Unlock()
				}
				return
			}

			messageCount++
			log.Printf("📨 [%s] Received message #%d", conn.MeterName, messageCount)

			// Parse Loxone response
			var response LoxoneResponse
			if err := json.Unmarshal(jsonData, &response); err != nil {
				log.Printf("⚠️  [%s] Failed to parse JSON response: %v", conn.MeterName, err)
				continue
			}

			log.Printf("   Control: %s", response.LL.Control)
			log.Printf("   Code: %s", response.LL.Code)

			// Check if this is a response to our device request
			expectedControl := fmt.Sprintf("dev/sps/io/%s/all", conn.DeviceID)
			if !strings.Contains(response.LL.Control, expectedControl) {
				// Not our device response, might be heartbeat or other message
				log.Printf("   → Not a device response, ignoring")
				continue
			}

			log.Printf("   ✓ This is a device data response!")
			log.Printf("   Number of outputs: %d", len(response.LL.Outputs))

			// Extract output1 value (kWh reading)
			if output1, ok := response.LL.Outputs["output1"]; ok {
				log.Printf("   Found output1:")
				log.Printf("      Name: %s", output1.Name)
				log.Printf("      Nr: %d", output1.Nr)
				log.Printf("      Value: %v (type: %T)", output1.Value, output1.Value)
				
				var reading float64
				
				switch v := output1.Value.(type) {
				case float64:
					reading = v
				case string:
					if f, err := strconv.ParseFloat(v, 64); err == nil {
						reading = f
					} else {
						log.Printf("      ⚠️  Failed to parse string value to float: %v", err)
					}
				default:
					log.Printf("      ⚠️  Unexpected value type: %T", v)
				}

				if reading > 0 {
					conn.mu.Lock()
					conn.lastReading = reading
					conn.lastUpdate = time.Now()
					conn.mu.Unlock()

					currentTime := roundToQuarterHour(time.Now())
					
					log.Println("─────────────────────────────────")
					log.Printf("✅ [%s] READING RECEIVED!", conn.MeterName)
					log.Printf("   Value: %.3f kWh", reading)
					log.Printf("   Timestamp: %s", currentTime.Format("2006-01-02 15:04:05"))

					// Get last reading for interpolation
					var lastReading float64
					var lastTime time.Time
					err := db.QueryRow(`
						SELECT power_kwh, reading_time FROM meter_readings 
						WHERE meter_id = ? 
						ORDER BY reading_time DESC LIMIT 1
					`, conn.MeterID).Scan(&lastReading, &lastTime)

					if err == nil && !lastTime.IsZero() {
						log.Printf("   Last reading: %.3f kWh at %s", lastReading, lastTime.Format("15:04:05"))
						
						// Interpolate missing intervals
						interpolated := interpolateReadings(lastTime, lastReading, currentTime, reading)
						
						if len(interpolated) > 0 {
							log.Printf("   📊 Interpolating %d missing intervals", len(interpolated))
						}
						
						for i, point := range interpolated {
							consumption := point.value - lastReading
							if consumption < 0 {
								consumption = 0
							}
							
							log.Printf("      Interval %d: %s = %.3f kWh (consumption: %.3f)", 
								i+1, point.time.Format("15:04:05"), point.value, consumption)
							
							db.Exec(`
								INSERT INTO meter_readings (meter_id, reading_time, power_kwh, consumption_kwh)
								VALUES (?, ?, ?, ?)
							`, conn.MeterID, point.time, point.value, consumption)
							
							lastReading = point.value
						}
					} else {
						log.Printf("   → First reading for this meter")
					}

					// Save current reading
					consumption := reading - lastReading
					if consumption < 0 {
						consumption = reading
					}

					log.Printf("   Current consumption: %.3f kWh", consumption)

					_, err = db.Exec(`
						INSERT INTO meter_readings (meter_id, reading_time, power_kwh, consumption_kwh)
						VALUES (?, ?, ?, ?)
					`, conn.MeterID, currentTime, reading, consumption)

					if err != nil {
						log.Printf("❌ Failed to save reading to database: %v", err)
						conn.mu.Lock()
						conn.lastError = fmt.Sprintf("DB save failed: %v", err)
						conn.mu.Unlock()
					} else {
						// Update meter last reading
						db.Exec(`
							UPDATE meters 
							SET last_reading = ?, last_reading_time = ?, 
							    notes = ?
							WHERE id = ?
						`, reading, currentTime, 
							fmt.Sprintf("🟢 Last update: %s", time.Now().Format("2006-01-02 15:04:05")),
							conn.MeterID)
						
						log.Printf("   ✅ Saved to database successfully")
					}
					log.Println("─────────────────────────────────")
				} else {
					log.Printf("      ⚠️  Reading is 0 or negative, not saving")
				}
			} else {
				log.Printf("   ⚠️  WARNING: No output1 found in response")
				log.Printf("   Available outputs: %v", func() []string {
					keys := []string{}
					for k := range response.LL.Outputs {
						keys = append(keys, k)
					}
					return keys
				}())
			}
		}
	}
}

func (conn *LoxoneConnection) IsConnected() bool {
	conn.mu.Lock()
	defer conn.mu.Unlock()
	return conn.isConnected
}

func (conn *LoxoneConnection) Close() {
	log.Printf("🛑 Closing connection for %s (ID: %d)", conn.MeterName, conn.MeterID)
	conn.mu.Lock()
	defer conn.mu.Unlock()
	
	close(conn.stopChan)
	if conn.ws != nil {
		conn.ws.Close()
		conn.ws = nil
	}
	conn.isConnected = false
	log.Printf("   ✓ Connection closed")
}