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
	db          *sql.DB
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
	TokenValidUntil int64  `json:"tokenValidUntil"` // Seconds since 2009-01-01 00:00:00 (Loxone epoch)
}

type LoxoneTokenResponse struct {
	Token      string `json:"token"`
	ValidUntil int64  `json:"validUntil"` // Seconds since 2009-01-01 00:00:00 (Loxone epoch)
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

// Loxone epoch: Loxone timestamps are in seconds since January 1, 2009, not Unix epoch
var loxoneEpoch = time.Date(2009, 1, 1, 0, 0, 0, 0, time.UTC)

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
	
	lc.logToDatabase("Loxone Collector Started", "Initializing Loxone WebSocket connections")

	lc.initializeConnections()

	log.Printf("✅ Loxone Collector initialized with %d connections", len(lc.connections))
	lc.logToDatabase("Loxone Collector Ready", fmt.Sprintf("Initialized %d Loxone connections", len(lc.connections)))

	// Monitor and reconnect dropped connections
	go lc.monitorConnections()

	log.Println("✅ Loxone connection monitor started")
	log.Println("===================================")
}

func (lc *LoxoneCollector) Stop() {
	log.Println("🛑 STOPPING ALL LOXONE CONNECTIONS")
	lc.logToDatabase("Loxone Collector Stopping", "Closing all Loxone connections")
	
	lc.mu.Lock()
	defer lc.mu.Unlock()

	for meterID, conn := range lc.connections {
		log.Printf("Closing connection for meter ID %d (%s)", meterID, conn.MeterName)
		conn.Close()
	}
	lc.connections = make(map[int]*LoxoneConnection)
	log.Println("✅ All Loxone connections stopped")
	lc.logToDatabase("Loxone Collector Stopped", "All connections closed")
}

func (lc *LoxoneCollector) RestartConnections() {
	log.Println("=== RESTARTING LOXONE CONNECTIONS ===")
	lc.logToDatabase("Loxone Connections Restarting", "Reinitializing all Loxone connections")
	
	lc.Stop()
	time.Sleep(500 * time.Millisecond)
	lc.initializeConnections()
	
	log.Println("=== LOXONE CONNECTIONS RESTARTED ===")
	lc.logToDatabase("Loxone Connections Restarted", fmt.Sprintf("Successfully restarted %d connections", len(lc.connections)))
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
		lc.logToDatabase("Loxone Query Error", fmt.Sprintf("Failed to query meters: %v", err))
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
			lc.logToDatabase("Loxone Config Error", fmt.Sprintf("Meter '%s': %v", name, err))
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
			lc.logToDatabase("Loxone Config Incomplete", fmt.Sprintf("Meter '%s' missing required config", name))
			continue
		}

		log.Printf("   └─ ✅ Configuration valid, initiating connection...")

		conn := &LoxoneConnection{
			MeterID:   id,
			MeterName: name,
			Host:      host,
			Username:  username,
			Password:  password,
			DeviceID:  deviceID,
			stopChan:  make(chan bool),
			db:        lc.db,
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
		lc.logToDatabase("Loxone No Meters", "No Loxone API meters found in database")
	} else {
		log.Println("─────────────────────────────────")
		log.Printf("✅ INITIALIZED %d LOXONE WEBSOCKET CONNECTIONS", meterCount)
		lc.logToDatabase("Loxone Meters Initialized", fmt.Sprintf("Successfully initialized %d meters", meterCount))
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
		
		// Log to database if there are disconnected meters
		if disconnectedCount > 0 {
			lc.logToDatabase("Loxone Status Check", fmt.Sprintf("%d connected, %d disconnected (attempting reconnect)", connectedCount, disconnectedCount))
		}
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

func (lc *LoxoneCollector) logToDatabase(action, details string) {
	lc.db.Exec(`
		INSERT INTO admin_logs (action, details, ip_address)
		VALUES (?, ?, 'loxone-system')
	`, action, details)
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
				// Log the raw message for debugging
				log.Printf("   ⚠️  Raw message (first 100 bytes): %s", string(message[:min(len(message), 100)]))
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
			// Log the raw message for debugging
			log.Printf("   ⚠️  Raw message: %s", string(message))
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
		
		conn.logToDatabase("Loxone Connection Failed", fmt.Sprintf("Meter '%s': %v", conn.MeterName, err))
		return
	}

	conn.mu.Lock()
	conn.ws = ws
	conn.mu.Unlock()

	log.Printf("✅ WebSocket connected successfully")
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
		
		conn.logToDatabase("Loxone Auth Failed", fmt.Sprintf("Meter '%s': %v", conn.MeterName, err))
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
	
	conn.logToDatabase("Loxone Connected", fmt.Sprintf("Meter '%s' connected successfully", conn.MeterName))

	// Start reading data
	log.Printf("🎧 Starting data listener for %s...", conn.MeterName)
	go conn.readLoop(db)

	log.Printf("⏰ Starting data request scheduler for %s...", conn.MeterName)
	go conn.requestData()

	// Start token expiry monitor
	log.Printf("🔒 Starting token expiry monitor for %s...", conn.MeterName)
	go conn.monitorTokenExpiry(db)
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

	log.Printf("   ✅ Received key: %s...", keyData.Key[:min(len(keyData.Key), 16)])
	log.Printf("   ✅ Received salt: %s...", keyData.Salt[:min(len(keyData.Salt), 16)])
	log.Printf("   ✅ Hash algorithm: %s", keyData.HashAlg)

	// Step 2: Hash password with salt
	log.Printf("🔐 TOKEN AUTHENTICATION - Step 2: Hash password with salt")

	pwSaltStr := conn.Password + ":" + keyData.Salt
	var pwHashHex string

	switch strings.ToUpper(keyData.HashAlg) {
	case "SHA256":
		pwHash := sha256.Sum256([]byte(pwSaltStr))
		pwHashHex = strings.ToUpper(hex.EncodeToString(pwHash[:]))
		log.Printf("   ✅ Using SHA256 for password hash")
	case "SHA1":
		pwHash := sha1.Sum([]byte(pwSaltStr))
		pwHashHex = strings.ToUpper(hex.EncodeToString(pwHash[:]))
		log.Printf("   ✅ Using SHA1 for password hash")
	default:
		return fmt.Errorf("unsupported hash algorithm: %s", keyData.HashAlg)
	}

	log.Printf("   ✅ Password hashed with salt")

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

	log.Printf("   ✅ HMAC created")

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

	log.Printf("   ✅ Token received: %s...", tokenData.Token[:min(len(tokenData.Token), 16)])

	// Parse token validity
	// IMPORTANT: Loxone uses a custom epoch of January 1, 2009, NOT Unix epoch!
	// validUntil is seconds since 2009-01-01 00:00:00
	tokenValidTime := loxoneEpoch.Add(time.Duration(tokenData.ValidUntil) * time.Second)
	
	log.Printf("   ✅ Valid until: %v", tokenValidTime.Format("2006-01-02 15:04:05"))
	log.Printf("   ✅ Raw validUntil: %d seconds since 2009-01-01", tokenData.ValidUntil)

	log.Printf("   ✅ Rights: %d", tokenData.Rights)
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

// extractJSON extracts JSON data from Loxone message - improved version
func (conn *LoxoneConnection) extractJSON(message []byte) []byte {
	if len(message) == 0 {
		return nil
	}

	// Try to parse the entire message as JSON first
	var testJSON map[string]interface{}
	if err := json.Unmarshal(message, &testJSON); err == nil {
		// The entire message is valid JSON
		return message
	}

	// Check if it's already JSON
	if message[0] == '{' {
		// Find the end of the JSON object
		depth := 0
		inString := false
		escape := false

		for i, b := range message {
			if escape {
				escape = false
				continue
			}

			if b == '\\' {
				escape = true
				continue
			}

			if b == '"' {
				inString = !inString
				continue
			}

			if !inString {
				if b == '{' {
					depth++
				} else if b == '}' {
					depth--
					if depth == 0 {
						// Validate it's actually JSON
						candidate := message[:i+1]
						if json.Unmarshal(candidate, &testJSON) == nil {
							return candidate
						}
					}
				}
			}
		}
		
		// If we couldn't find proper closing, try parsing the whole thing
		if json.Unmarshal(message, &testJSON) == nil {
			return message
		}
	}

	// Try to find JSON start within first 100 bytes
	for i := 0; i < len(message) && i < 100; i++ {
		if message[i] == '{' {
			// Find the matching closing brace
			depth := 0
			inString := false
			escape := false

			for j := i; j < len(message); j++ {
				b := message[j]

				if escape {
					escape = false
					continue
				}

				if b == '\\' {
					escape = true
					continue
				}

				if b == '"' {
					inString = !inString
					continue
				}

				if !inString {
					if b == '{' {
						depth++
					} else if b == '}' {
						depth--
						if depth == 0 {
							candidate := message[i : j+1]
							// Validate it's actually JSON
							if json.Unmarshal(candidate, &testJSON) == nil {
								log.Printf("   ℹ️  Found and validated JSON at offset %d, length %d", i, j-i+1)
								return candidate
							}
						}
					}
				}
			}
		}
	}

	log.Printf("   ⚠️  Could not find valid JSON in message")
	return nil
}

func (conn *LoxoneConnection) refreshToken() error {
	log.Printf("🔄 TOKEN REFRESH - Starting refresh for %s", conn.MeterName)
	conn.mu.Lock()
	if conn.ws == nil {
		conn.mu.Unlock()
		return fmt.Errorf("WebSocket not connected")
	}
	// Step 1: Get new key and salt
	getKeyCmd := fmt.Sprintf("jdev/sys/getkey2/%s", conn.Username)
	log.Printf("   → Requesting new key: %s", getKeyCmd)
	if err := conn.ws.WriteMessage(websocket.TextMessage, []byte(getKeyCmd)); err != nil {
		conn.mu.Unlock()
		return fmt.Errorf("failed to request key: %v", err)
	}
	conn.mu.Unlock()
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
	if keyResp.LL.Code != "200" {
		return fmt.Errorf("getkey2 failed with code: %s", keyResp.LL.Code)
	}
	keyData := keyResp.LL.Value
	log.Printf("   ✅ Received key and salt")
	// Step 2: Hash password with salt
	pwSaltStr := conn.Password + ":" + keyData.Salt
	var pwHashHex string
	switch strings.ToUpper(keyData.HashAlg) {
	case "SHA256":
		pwHash := sha256.Sum256([]byte(pwSaltStr))
		pwHashHex = strings.ToUpper(hex.EncodeToString(pwHash[:]))
	case "SHA1":
		pwHash := sha1.Sum([]byte(pwSaltStr))
		pwHashHex = strings.ToUpper(hex.EncodeToString(pwHash[:]))
	default:
		return fmt.Errorf("unsupported hash algorithm: %s", keyData.HashAlg)
	}
	// Step 3: Create HMAC
	keyBytes, err := hex.DecodeString(keyData.Key)
	if err != nil {
		return fmt.Errorf("failed to decode key: %v", err)
	}
	hmacMessage := conn.Username + ":" + pwHashHex
	h := hmac.New(sha1.New, keyBytes)
	h.Write([]byte(hmacMessage))
	hmacHash := hex.EncodeToString(h.Sum(nil))
	// Step 4: Refresh token using refreshtoken command
	refreshTokenCmd := fmt.Sprintf("jdev/sys/refreshtoken/%s/%s", hmacHash, conn.Username)
	log.Printf("   → Sending refresh token request")
	conn.mu.Lock()
	if err := conn.ws.WriteMessage(websocket.TextMessage, []byte(refreshTokenCmd)); err != nil {
		conn.mu.Unlock()
		return fmt.Errorf("failed to request token refresh: %v", err)
	}
	conn.mu.Unlock()
	// Read token response
	msgType, jsonData, err = conn.readLoxoneMessage()
	if err != nil {
		return fmt.Errorf("failed to read token refresh response: %v", err)
	}
	if jsonData == nil {
		return fmt.Errorf("no JSON data in token refresh response")
	}
	log.Printf("   ← Received token refresh response (type %d)", msgType)
	var tokenResp struct {
		LL struct {
			Control string              `json:"control"`
			Code    string              `json:"code"`
			Value   LoxoneTokenResponse `json:"value"`
		} `json:"LL"`
	}
	if err := json.Unmarshal(jsonData, &tokenResp); err != nil {
		return fmt.Errorf("failed to parse token refresh response: %v", err)
	}
	if tokenResp.LL.Code != "200" {
		return fmt.Errorf("refreshtoken failed with code: %s", tokenResp.LL.Code)
	}
	tokenData := tokenResp.LL.Value
	// Parse new token validity
	newTokenValidTime := loxoneEpoch.Add(time.Duration(tokenData.ValidUntil) * time.Second)
	// Store new token
	conn.mu.Lock()
	oldValidTime := conn.tokenValid
	conn.token = tokenData.Token
	conn.tokenValid = newTokenValidTime
	conn.mu.Unlock()
	log.Printf("   ✅ TOKEN REFRESHED SUCCESSFULLY!")
	log.Printf("   Old expiry: %s", oldValidTime.Format("2006-01-02 15:04:05"))
	log.Printf("   New expiry: %s", newTokenValidTime.Format("2006-01-02 15:04:05"))
	log.Printf("   New token valid for: %.1f hours", time.Until(newTokenValidTime).Hours())
	
	conn.logToDatabase("Loxone Token Refreshed", fmt.Sprintf("Meter '%s' token refreshed successfully", conn.MeterName))
	return nil
}

func (conn *LoxoneConnection) monitorTokenExpiry(db *sql.DB) {
	log.Printf("🔒 TOKEN MONITOR STARTED for %s", conn.MeterName)
	// Check token expiry every 10 minutes
	ticker := time.NewTicker(10 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-conn.stopChan:
			log.Printf("🛑 [%s] Token monitor stopping", conn.MeterName)
			return
		case <-ticker.C:
			conn.mu.Lock()
			isConnected := conn.isConnected
			tokenValid := conn.tokenValid
			conn.mu.Unlock()
			if !isConnected {
				log.Printf("⚠️  [%s] Not connected, token monitor stopping", conn.MeterName)
				return
			}
			// Check if token expires in less than 1 hour
			timeUntilExpiry := time.Until(tokenValid)
			if timeUntilExpiry < 1*time.Hour {
				log.Printf("⚠️  [%s] Token expiring in %.1f minutes, refreshing...", 
					conn.MeterName, timeUntilExpiry.Minutes())
				conn.logToDatabase("Loxone Token Expiring", fmt.Sprintf("Meter '%s' token expiring soon, refreshing...", conn.MeterName))
				
				if err := conn.refreshToken(); err != nil {
					log.Printf("❌ [%s] Failed to refresh token: %v", conn.MeterName, err)
					log.Printf("   Will attempt to reconnect...")
					conn.logToDatabase("Loxone Token Refresh Failed", fmt.Sprintf("Meter '%s': %v", conn.MeterName, err))
					
					// Failed to refresh, disconnect and let monitor reconnect
					conn.mu.Lock()
					conn.isConnected = false
					conn.lastError = fmt.Sprintf("Token refresh failed: %v", err)
					if conn.ws != nil {
						conn.ws.Close()
					}
					conn.mu.Unlock()
					db.Exec(`UPDATE meters SET notes = ? WHERE id = ?`,
						fmt.Sprintf("🔄 Token refresh failed, reconnecting..."),
						conn.MeterID)
					return
				}
				// Update database with new token info
				db.Exec(`UPDATE meters SET notes = ? WHERE id = ?`,
					fmt.Sprintf("🟢 Token refreshed at %s", time.Now().Format("2006-01-02 15:04:05")),
					conn.MeterID)
			} else {
				log.Printf("✅ [%s] Token valid for %.1f hours", 
					conn.MeterName, timeUntilExpiry.Hours())
			}
		}
	}
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
			conn.logToDatabase("Loxone Data Request Failed", fmt.Sprintf("Meter '%s': %v", conn.MeterName, err))
			conn.mu.Unlock()
			return
		}
		log.Printf("   ✅ Request sent successfully")
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
		
		conn.logToDatabase("Loxone Disconnected", fmt.Sprintf("Meter '%s' disconnected", conn.MeterName))
	}()

	log.Printf("👂 [%s] DATA LISTENER ACTIVE - waiting for messages...", conn.MeterName)

	messageCount := 0

	// Create a channel for read results to avoid blocking the select
	type readResult struct {
		msgType  byte
		jsonData []byte
		err      error
	}
	readChan := make(chan readResult, 10) // Buffered to prevent blocking

	// Start a goroutine that continuously reads from WebSocket
	go func() {
		for {
			conn.mu.Lock()
			ws := conn.ws
			isConnected := conn.isConnected
			conn.mu.Unlock()

			if ws == nil || !isConnected {
				return
			}

			// Set read deadline - 20 minutes (longer than our 15-minute polling interval)
			// This prevents premature timeouts between data requests
			conn.mu.Lock()
			if conn.ws != nil {
				conn.ws.SetReadDeadline(time.Now().Add(20 * time.Minute))
			}
			conn.mu.Unlock()

			msgType, jsonData, err := conn.readLoxoneMessage()
			
			// Send result (non-blocking)
			select {
			case readChan <- readResult{msgType, jsonData, err}:
			default:
				// Channel full, skip this reading
				log.Printf("⚠️  [%s] Read channel full, dropping message", conn.MeterName)
			}

			// If there was an error, stop reading
			if err != nil {
				return
			}
		}
	}()

	for {
		select {
		case <-conn.stopChan:
			log.Printf("🛑 [%s] Received stop signal, closing listener", conn.MeterName)
			return

		case result := <-readChan:
			// Handle read result
			if result.err != nil {
				// Check if it's a timeout (expected between data requests)
				if strings.Contains(result.err.Error(), "i/o timeout") || strings.Contains(result.err.Error(), "deadline") {
					log.Printf("⏱️  [%s] Read timeout (expected between data requests)", conn.MeterName)
					continue
				}

				if strings.Contains(result.err.Error(), "websocket: close") {
					log.Printf("ℹ️  [%s] WebSocket closed normally", conn.MeterName)
				} else {
					log.Printf("❌ [%s] Read error: %v", conn.MeterName, result.err)
					conn.mu.Lock()
					conn.lastError = fmt.Sprintf("Read error: %v", result.err)
					conn.mu.Unlock()
					conn.logToDatabase("Loxone Read Error", fmt.Sprintf("Meter '%s': %v", conn.MeterName, result.err))
				}
				return
			}

			// Skip binary messages (event tables, etc.)
			if result.jsonData == nil {
				log.Printf("   ℹ️  [%s] Binary message (type %d) - skipping", conn.MeterName, result.msgType)
				continue
			}

			messageCount++
			log.Printf("📨 [%s] Received message #%d (type %d)", conn.MeterName, messageCount, result.msgType)

			// Parse Loxone response
			var response LoxoneResponse
			if err := json.Unmarshal(result.jsonData, &response); err != nil {
				log.Printf("⚠️  [%s] Failed to parse JSON response: %v", conn.MeterName, err)
				log.Printf("   JSON: %s", string(result.jsonData[:min(len(result.jsonData), 200)]))
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

			log.Printf("   ✅ This is a device data response!")
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

					var consumption float64
					isFirstReading := false

					if err == nil && !lastTime.IsZero() {
						log.Printf("   Last reading: %.3f kWh at %s", lastReading, lastTime.Format("15:04:05"))

						// Interpolate missing intervals
						interpolated := interpolateReadings(lastTime, lastReading, currentTime, reading)

						if len(interpolated) > 0 {
							log.Printf("   📊 Interpolating %d missing intervals", len(interpolated))
						}

						for i, point := range interpolated {
							intervalConsumption := point.value - lastReading
							if intervalConsumption < 0 {
								intervalConsumption = 0
							}

							log.Printf("      Interval %d: %s = %.3f kWh (consumption: %.3f)",
								i+1, point.time.Format("15:04:05"), point.value, intervalConsumption)

							db.Exec(`
								INSERT INTO meter_readings (meter_id, reading_time, power_kwh, consumption_kwh)
								VALUES (?, ?, ?, ?)
							`, conn.MeterID, point.time, point.value, intervalConsumption)

							lastReading = point.value
						}
						
						// Calculate consumption for current reading
						consumption = reading - lastReading
						if consumption < 0 {
							consumption = 0
						}
					} else {
						// FIRST READING: Set consumption to 0
						log.Printf("   → First reading for this meter - consumption set to 0")
						consumption = 0
						isFirstReading = true
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
						conn.logToDatabase("Loxone Save Failed", fmt.Sprintf("Meter '%s': %v", conn.MeterName, err))
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
						
						if isFirstReading {
							conn.logToDatabase("Loxone First Reading", fmt.Sprintf("Meter '%s' first reading: %.3f kWh", conn.MeterName, reading))
						} else {
							conn.logToDatabase("Loxone Reading Saved", fmt.Sprintf("Meter '%s': %.3f kWh (consumption: %.3f kWh)", conn.MeterName, reading, consumption))
						}
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

func (conn *LoxoneConnection) logToDatabase(action, details string) {
	if conn.db != nil {
		conn.db.Exec(`
			INSERT INTO admin_logs (action, details, ip_address)
			VALUES (?, ?, ?)
		`, action, details, fmt.Sprintf("loxone-%s", conn.Host))
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
	log.Printf("   ✅ Connection closed")
	
	conn.logToDatabase("Loxone Connection Closed", fmt.Sprintf("Meter '%s' connection closed", conn.MeterName))
}