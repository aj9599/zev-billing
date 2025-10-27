package services

import (
	"crypto/hmac"
	"crypto/sha1"
	"crypto/sha256"
	"database/sql"
	"encoding/binary"
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
	token       string
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
	Control string                  `json:"control"`
	Value   string                  `json:"value"`
	Code    string                  `json:"code"`
	Outputs map[string]LoxoneOutput `json:"-"`
}

type LoxoneOutput struct {
	Name  string      `json:"name"`
	Nr    int         `json:"nr"`
	Value interface{} `json:"value"`
}

type LoxoneKeyResponse struct {
	Key             string `json:"key"`
	Salt            string `json:"salt"`
	HashAlg         string `json:"hashAlg"`
	TokenValidUntil int64  `json:"tokenValidUntil"`
}

type LoxoneTokenResponse struct {
	Token      string `json:"token"`
	ValidUntil int64  `json:"validUntil"`
	Rights     int    `json:"rights"`
	Unsecure   bool   `json:"unsecurePass"`
}

// Loxone message types according to protocol
const (
	LoxoneMsgTypeText         = 0 // Text message (JSON)
	LoxoneMsgTypeBinary       = 1 // Binary file
	LoxoneMsgTypeEventTable   = 2 // Event table (binary)
	LoxoneMsgTypeTextEvent    = 3 // Text event (header + JSON)
	LoxoneMsgTypeDaytimerEvent = 6 // Daytimer event (binary)
)

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
		case "code", "Code":
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
	log.Println("🔧 LOXONE COLLECTOR: Initializing")
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
			tokenValid := conn.tokenValid
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
				if !tokenValid.IsZero() {
					timeUntilExpiry := time.Until(tokenValid)
					log.Printf("      Token valid for: %.0f hours", timeUntilExpiry.Hours())
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
func (conn *LoxoneConnection) readLoxoneMessage() (messageType byte, jsonData []byte, err error) {
	// Read the message
	wsMessageType, message, err := conn.ws.ReadMessage()
	if err != nil {
		return 0, nil, fmt.Errorf("failed to read message: %v", err)
	}

	// Check if this is a binary message with header
	if wsMessageType == websocket.BinaryMessage && len(message) >= 8 {
		// First 8 bytes are the header
		headerType := message[0]
		// Bytes 4-7 contain payload length in little-endian
		payloadLength := binary.LittleEndian.Uint32(message[4:8])

		log.Printf("   📦 Binary header: Type=0x%02X, PayloadLen=%d", headerType, payloadLength)

		// For type 3 (text event), the JSON follows in the next message
		if headerType == LoxoneMsgTypeTextEvent {
			// Read the JSON payload
			wsMessageType, message, err = conn.ws.ReadMessage()
			if err != nil {
				return 0, nil, fmt.Errorf("failed to read JSON payload: %v", err)
			}
			log.Printf("   ← JSON payload received: %d bytes", len(message))

			// Extract clean JSON
			jsonData = conn.extractJSON(message)
			if jsonData == nil {
				return headerType, nil, fmt.Errorf("could not extract JSON from text event")
			}
			return headerType, jsonData, nil
		}

		// For type 2 (event table) and type 6 (daytimer), these are binary data we can ignore
		if headerType == LoxoneMsgTypeEventTable || headerType == LoxoneMsgTypeDaytimerEvent {
			log.Printf("   ℹ️  Binary event message (type %d) - ignoring", headerType)
			return headerType, nil, nil // Return nil data to indicate we should skip this
		}

		// Unknown binary message type
		log.Printf("   ⚠️  Unknown binary message type: 0x%02X", headerType)
		return headerType, nil, nil
	}

	// Text message (should be JSON)
	if wsMessageType == websocket.TextMessage {
		log.Printf("   ← Text message received: %d bytes", len(message))
		jsonData = conn.extractJSON(message)
		if jsonData == nil {
			return 0, nil, fmt.Errorf("could not extract JSON from text message")
		}
		return LoxoneMsgTypeText, jsonData, nil
	}

	return 0, nil, fmt.Errorf("unexpected message type: %d", wsMessageType)
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

	// Authenticate using token-based method
	if err := conn.authenticateWithToken(); err != nil {
		errMsg := fmt.Sprintf("Authentication failed: %v", err)
		log.Printf("❌ %s", errMsg)
		ws.Close()
		conn.mu.Lock()
		conn.isConnected = false
		conn.lastError = errMsg
		conn.mu.Unlock()

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
	msgType, jsonData, err := conn.readLoxoneMessage()
	if err != nil {
		return fmt.Errorf("failed to read key response: %v", err)
	}
	if jsonData == nil {
		return fmt.Errorf("no JSON data in key response")
	}

	log.Printf("   ← Received key response (type %d)", msgType)

	// Parse the key response
	var keyResp struct {
		LL struct {
			Control string            `json:"control"`
			Code    string            `json:"code"`
			Value   LoxoneKeyResponse `json:"value"`
		} `json:"LL"`
	}

	if err := json.Unmarshal(jsonData, &keyResp); err != nil {
		return fmt.Errorf("failed to parse key response: %v", err)
	}

	log.Printf("   ← Response code: %s", keyResp.LL.Code)

	if keyResp.LL.Code != "200" {
		return fmt.Errorf("getkey2 failed with code: %s", keyResp.LL.Code)
	}

	keyData := keyResp.LL.Value

	log.Printf("   ✓ Received key: %s...", keyData.Key[:min(len(keyData.Key), 16)])
	log.Printf("   ✓ Received salt: %s...", keyData.Salt[:min(len(keyData.Salt), 16)])
	log.Printf("   ✓ Hash algorithm: %s", keyData.HashAlg)

	// Step 2: Hash password with salt
	log.Printf("🔐 TOKEN AUTHENTICATION - Step 2: Hash password with salt")

	pwSaltStr := conn.Password + ":" + keyData.Salt
	var pwHashHex string

	switch strings.ToUpper(keyData.HashAlg) {
	case "SHA256":
		pwHash := sha256.Sum256([]byte(pwSaltStr))
		pwHashHex = strings.ToUpper(hex.EncodeToString(pwHash[:]))
		log.Printf("   ✓ Using SHA256 for password hash")
	case "SHA1":
		pwHash := sha1.Sum([]byte(pwSaltStr))
		pwHashHex = strings.ToUpper(hex.EncodeToString(pwHash[:]))
		log.Printf("   ✓ Using SHA1 for password hash")
	default:
		return fmt.Errorf("unsupported hash algorithm: %s", keyData.HashAlg)
	}

	log.Printf("   ✓ Password hashed with salt")

	// Step 3: Create HMAC
	log.Printf("🔐 TOKEN AUTHENTICATION - Step 3: Create HMAC token")

	keyBytes, err := hex.DecodeString(keyData.Key)
	if err != nil {
		return fmt.Errorf("failed to decode key: %v", err)
	}

	hmacMessage := conn.Username + ":" + pwHashHex
	h := hmac.New(sha1.New, keyBytes)
	h.Write([]byte(hmacMessage))
	hmacHash := hex.EncodeToString(h.Sum(nil))

	log.Printf("   ✓ HMAC created")

	// Step 4: Get token
	log.Printf("🔐 TOKEN AUTHENTICATION - Step 4: Request authentication token")

	uuid := "zev-billing-system"
	info := "ZEV-Billing"
	permission := "2"

	getTokenCmd := fmt.Sprintf("jdev/sys/gettoken/%s/%s/%s/%s/%s",
		hmacHash, conn.Username, permission, uuid, info)

	log.Printf("   → Sending token request")

	if err := conn.ws.WriteMessage(websocket.TextMessage, []byte(getTokenCmd)); err != nil {
		return fmt.Errorf("failed to request token: %v", err)
	}

	// Read token response
	msgType, jsonData, err = conn.readLoxoneMessage()
	if err != nil {
		return fmt.Errorf("failed to read token response: %v", err)
	}
	if jsonData == nil {
		return fmt.Errorf("no JSON data in token response")
	}

	log.Printf("   ← Received token response (type %d)", msgType)

	var tokenResp struct {
		LL struct {
			Control string              `json:"control"`
			Code    string              `json:"code"`
			Value   LoxoneTokenResponse `json:"value"`
		} `json:"LL"`
	}

	if err := json.Unmarshal(jsonData, &tokenResp); err != nil {
		return fmt.Errorf("failed to parse token response: %v", err)
	}

	log.Printf("   ← Response code: %s", tokenResp.LL.Code)

	if tokenResp.LL.Code != "200" {
		return fmt.Errorf("gettoken failed with code: %s", tokenResp.LL.Code)
	}

	tokenData := tokenResp.LL.Value

	log.Printf("   ✓ Token received: %s...", tokenData.Token[:min(len(tokenData.Token), 16)])

	// Parse token validity - try both seconds and milliseconds
	// Loxone typically sends Unix timestamp in seconds
	var tokenValidTime time.Time
	
	// Check if it looks like milliseconds (> year 2100 in seconds = 4102444800)
	if tokenData.ValidUntil > 4102444800 {
		// Likely milliseconds
		tokenValidTime = time.Unix(0, tokenData.ValidUntil*int64(time.Millisecond))
		log.Printf("   ✓ Valid until: %v (parsed as milliseconds)", tokenValidTime.Format("2006-01-02 15:04:05"))
	} else {
		// Likely seconds
		tokenValidTime = time.Unix(tokenData.ValidUntil, 0)
		log.Printf("   ✓ Valid until: %v (parsed as seconds)", tokenValidTime.Format("2006-01-02 15:04:05"))
	}

	// Sanity check - token should be valid in the future
	if tokenValidTime.Before(time.Now()) {
		log.Printf("   ⚠️  WARNING: Token appears to be expired or incorrectly parsed")
		log.Printf("   ⚠️  Raw validUntil value: %d", tokenData.ValidUntil)
		// Try the other interpretation
		if tokenData.ValidUntil > 4102444800 {
			tokenValidTime = time.Unix(tokenData.ValidUntil, 0)
		} else {
			tokenValidTime = time.Unix(0, tokenData.ValidUntil*int64(time.Millisecond))
		}
		log.Printf("   → Trying alternative parsing: %v", tokenValidTime.Format("2006-01-02 15:04:05"))
	}

	log.Printf("   ✓ Rights: %d", tokenData.Rights)
	if tokenData.Unsecure {
		log.Printf("   ⚠️  WARNING: Unsecure password flag is set")
	}

	// Store token
	conn.mu.Lock()
	conn.token = tokenData.Token
	conn.tokenValid = tokenValidTime
	conn.mu.Unlock()

	log.Printf("   ✅ AUTHENTICATION SUCCESSFUL!")
	log.Printf("   Token valid for: %.1f hours", time.Until(tokenValidTime).Hours())

	// NOTE: We do NOT enable binary status updates as they cause parsing issues
	// We'll rely on periodic polling instead
	log.Printf("   ℹ️  Skipping binary status updates (using polling instead)")

	return nil
}

// extractJSON extracts JSON data from Loxone message
func (conn *LoxoneConnection) extractJSON(message []byte) []byte {
	if len(message) == 0 {
		return nil
	}

	// Check if it's already JSON
	if message[0] == '{' {
		// Find the end of the JSON object
		depth := 0
		for i, b := range message {
			if b == '{' {
				depth++
			} else if b == '}' {
				depth--
				if depth == 0 {
					return message[:i+1]
				}
			}
		}
		return message
	}

	// Try to find JSON start
	for i := 0; i < len(message) && i < 100; i++ {
		if message[i] == '{' {
			// Find the matching closing brace
			depth := 0
			for j := i; j < len(message); j++ {
				if message[j] == '{' {
					depth++
				} else if message[j] == '}' {
					depth--
					if depth == 0 {
						log.Printf("   ℹ️  Found JSON at offset %d, length %d", i, j-i+1)
						return message[i : j+1]
					}
				}
			}
			// If we found an opening brace but no matching close, return from start
			return message[i:]
		}
	}

	log.Printf("   ⚠️  Could not find valid JSON in message")
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

		// Check if token is still valid (with 1 hour buffer)
		if time.Now().Add(1 * time.Hour).After(conn.tokenValid) {
			log.Printf("⚠️  [%s] Token expiring soon, need to re-authenticate", conn.MeterName)
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

		db.Exec(`UPDATE meters SET notes = ? WHERE id = ?`,
			fmt.Sprintf("🔴 Offline since %s", time.Now().Format("2006-01-02 15:04:05")),
			conn.MeterID)
	}()

	log.Printf("👂 [%s] DATA LISTENER ACTIVE - waiting for messages...", conn.MeterName)

	// Set up keep-alive ticker
	keepAliveTicker := time.NewTicker(30 * time.Second)
	defer keepAliveTicker.Stop()

	messageCount := 0

	// Set read deadline
	conn.mu.Lock()
	if conn.ws != nil {
		conn.ws.SetReadDeadline(time.Now().Add(90 * time.Second))
	}
	conn.mu.Unlock()

	for {
		select {
		case <-conn.stopChan:
			log.Printf("🛑 [%s] Received stop signal, closing listener", conn.MeterName)
			return

		case <-keepAliveTicker.C:
			// Send keep-alive (simple text command)
			conn.mu.Lock()
			if conn.ws != nil {
				err := conn.ws.WriteMessage(websocket.TextMessage, []byte("keepalive"))
				if err != nil {
					log.Printf("⚠️  [%s] Keep-alive failed: %v", conn.MeterName, err)
					conn.mu.Unlock()
					return
				}
				log.Printf("💓 [%s] Keep-alive sent", conn.MeterName)
				conn.ws.SetReadDeadline(time.Now().Add(90 * time.Second))
			}
			conn.mu.Unlock()

		default:
			conn.mu.Lock()
			ws := conn.ws
			conn.mu.Unlock()

			if ws == nil {
				log.Printf("⚠️  [%s] WebSocket is nil, closing listener", conn.MeterName)
				return
			}

			// Read Loxone message
			msgType, jsonData, err := conn.readLoxoneMessage()
			if err != nil {
				// Check if it's a timeout (expected for keep-alive)
				if strings.Contains(err.Error(), "i/o timeout") || strings.Contains(err.Error(), "deadline") {
					conn.mu.Lock()
					if conn.ws != nil {
						conn.ws.SetReadDeadline(time.Now().Add(90 * time.Second))
					}
					conn.mu.Unlock()
					continue
				}

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

			// Reset read deadline after successful read
			conn.mu.Lock()
			if conn.ws != nil {
				conn.ws.SetReadDeadline(time.Now().Add(90 * time.Second))
			}
			conn.mu.Unlock()

			// Skip binary messages (event tables, etc.)
			if jsonData == nil {
				log.Printf("   ℹ️  [%s] Binary message (type %d) - skipping", conn.MeterName, msgType)
				continue
			}

			messageCount++
			log.Printf("📨 [%s] Received message #%d (type %d)", conn.MeterName, messageCount, msgType)

			// Parse Loxone response
			var response LoxoneResponse
			if err := json.Unmarshal(jsonData, &response); err != nil {
				log.Printf("⚠️  [%s] Failed to parse JSON response: %v", conn.MeterName, err)
				log.Printf("   JSON: %s", string(jsonData[:min(len(jsonData), 200)]))
				continue
			}

			log.Printf("   Control: %s", response.LL.Control)
			log.Printf("   Code: %s", response.LL.Code)

			// Check if this is a response to our device request
			expectedControl := fmt.Sprintf("dev/sps/io/%s/all", conn.DeviceID)
			if !strings.Contains(response.LL.Control, expectedControl) {
				log.Printf("   → Not a device response, ignoring")
				continue
			}

			log.Printf("   ✓ This is a device data response!")
			log.Printf("   Number of outputs: %d", len(response.LL.Outputs))

			// Extract output1 value (kWh reading)
			if output1, ok := response.LL.Outputs["output1"]; ok {
				log.Printf("   Found output1:")
				log.Printf("      Name: %s", output1.Name)
				log.Printf("      Value: %v (type: %T)", output1.Value, output1.Value)

				var reading float64

				switch v := output1.Value.(type) {
				case float64:
					reading = v
				case string:
					if f, err := strconv.ParseFloat(v, 64); err == nil {
						reading = f
					} else {
						log.Printf("      ⚠️  Failed to parse string value: %v", err)
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
				availableOutputs := []string{}
				for k := range response.LL.Outputs {
					availableOutputs = append(availableOutputs, k)
				}
				log.Printf("   Available outputs: %v", availableOutputs)
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