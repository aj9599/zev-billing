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
	"math"
	"math/rand"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type LoxoneCollector struct {
	db          *sql.DB
	connections map[string]*LoxoneWebSocketConnection
	mu          sync.RWMutex
}

type LoxoneWebSocketConnection struct {
	Host     string
	Username string
	Password string

	ws          *websocket.Conn
	isConnected bool

	// Centralized auth health
	token       string
	tokenValid  bool
	tokenExpiry time.Time

	devices []*LoxoneDevice

	// Error tracking and metrics
	lastError            string
	consecutiveAuthFails int
	consecutiveConnFails int
	totalAuthFailures    int
	totalReconnects      int
	lastSuccessfulAuth   time.Time
	lastConnectionTime   time.Time

	// Backoff for reconnection
	reconnectBackoff time.Duration
	maxBackoff       time.Duration

	stopChan chan bool
	mu       sync.Mutex
	db       *sql.DB
}

type LoxoneDevice struct {
	ID       int
	Name     string
	Type     string
	DeviceID string

	PowerUUID  string
	StateUUID  string
	UserIDUUID string
	ModeUUID   string

	lastReading float64
	lastUpdate  time.Time
	readingGaps int // Track missing readings for alerting
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

type ChargerDataCollection struct {
	Power  *float64
	State  *string
	UserID *string
	Mode   *string
}

const (
	LoxoneMsgTypeText          = 0
	LoxoneMsgTypeBinary        = 1
	LoxoneMsgTypeEventTable    = 2
	LoxoneMsgTypeTextEvent     = 3
	LoxoneMsgTypeDaytimerEvent = 6
)

var loxoneEpoch = time.Date(2009, 1, 1, 0, 0, 0, 0, time.UTC)

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
	log.Println("🔧 LOXONE COLLECTOR: Initializing with enhanced auth health management")
	lc := &LoxoneCollector{
		db:          db,
		connections: make(map[string]*LoxoneWebSocketConnection),
	}
	log.Println("🔧 LOXONE COLLECTOR: Instance created successfully")
	return lc
}

func (lc *LoxoneCollector) Start() {
	log.Println("===================================")
	log.Println("🔌 LOXONE WEBSOCKET COLLECTOR STARTING")
	log.Println("   Features: Auth health checks, exponential backoff, metrics")
	log.Println("===================================")

	lc.logToDatabase("Loxone Collector Started", "Enhanced version with robust auth management")

	lc.initializeConnections()

	log.Printf("✅ Loxone Collector initialized with %d WebSocket connections", len(lc.connections))
	lc.logToDatabase("Loxone Collector Ready", fmt.Sprintf("Initialized %d Loxone connections", len(lc.connections)))

	go lc.monitorConnections()

	log.Println("✅ Loxone connection monitor started")
	log.Println("===================================")
}

func (lc *LoxoneCollector) Stop() {
	log.Println("🛑 STOPPING ALL LOXONE CONNECTIONS")
	lc.logToDatabase("Loxone Collector Stopping", "Closing all Loxone connections")

	lc.mu.Lock()
	defer lc.mu.Unlock()

	for key, conn := range lc.connections {
		log.Printf("Closing connection: %s", key)
		conn.Close()
	}
	lc.connections = make(map[string]*LoxoneWebSocketConnection)
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
	log.Println("🔍 SCANNING DATABASE FOR LOXONE API DEVICES...")

	connectionDevices := make(map[string]*LoxoneWebSocketConnection)

	// Load meters
	meterRows, err := lc.db.Query(`
		SELECT id, name, connection_config
		FROM meters 
		WHERE is_active = 1 AND connection_type = 'loxone_api'
	`)
	if err != nil {
		log.Printf("❌ ERROR: Failed to query Loxone meters: %v", err)
		lc.logToDatabase("Loxone Query Error", fmt.Sprintf("Failed to query meters: %v", err))
	} else {
		defer meterRows.Close()

		meterCount := 0
		for meterRows.Next() {
			var id int
			var name, connectionConfig string

			if err := meterRows.Scan(&id, &name, &connectionConfig); err != nil {
				log.Printf("❌ ERROR: Failed to scan meter row: %v", err)
				continue
			}

			meterCount++
			log.Println("────────────────────────────────────")
			log.Printf("📊 FOUND LOXONE METER #%d", meterCount)
			log.Printf("   Name: '%s'", name)
			log.Printf("   ID: %d", id)

			var config map[string]interface{}
			if err := json.Unmarshal([]byte(connectionConfig), &config); err != nil {
				log.Printf("❌ ERROR: Failed to parse config for meter '%s': %v", name, err)
				lc.logToDatabase("Loxone Config Error", fmt.Sprintf("Meter '%s': %v", name, err))
				continue
			}

			host, _ := config["loxone_host"].(string)
			username, _ := config["loxone_username"].(string)
			password, _ := config["loxone_password"].(string)
			deviceID, _ := config["loxone_device_id"].(string)

			log.Printf("   ├─ Host: %s", host)
			log.Printf("   ├─ Username: %s", username)
			log.Printf("   └─ Device UUID: %s", deviceID)

			if host == "" || deviceID == "" {
				log.Printf("   ⚠️  WARNING: Incomplete config - skipping")
				continue
			}

			connKey := fmt.Sprintf("%s|%s|%s", host, username, password)

			conn, exists := connectionDevices[connKey]
			if !exists {
				conn = &LoxoneWebSocketConnection{
					Host:             host,
					Username:         username,
					Password:         password,
					devices:          []*LoxoneDevice{},
					stopChan:         make(chan bool),
					db:               lc.db,
					reconnectBackoff: 1 * time.Second,
					maxBackoff:       30 * time.Second,
				}
				connectionDevices[connKey] = conn
				log.Printf("   📡 Created new WebSocket connection for %s", host)
			} else {
				log.Printf("   ♻️  Reusing existing WebSocket connection for %s", host)
			}

			device := &LoxoneDevice{
				ID:       id,
				Name:     name,
				Type:     "meter",
				DeviceID: deviceID,
			}
			conn.devices = append(conn.devices, device)
		}

		log.Printf("✅ Loaded %d Loxone meters", meterCount)
	}

	// Load chargers
	chargerRows, err := lc.db.Query(`
		SELECT id, name, preset, connection_config
		FROM chargers 
		WHERE is_active = 1 AND connection_type = 'loxone_api'
	`)
	if err != nil {
		log.Printf("❌ ERROR: Failed to query Loxone chargers: %v", err)
		lc.logToDatabase("Loxone Query Error", fmt.Sprintf("Failed to query chargers: %v", err))
	} else {
		defer chargerRows.Close()

		chargerCount := 0
		for chargerRows.Next() {
			var id int
			var name, preset, connectionConfig string

			if err := chargerRows.Scan(&id, &name, &preset, &connectionConfig); err != nil {
				log.Printf("❌ ERROR: Failed to scan charger row: %v", err)
				continue
			}

			chargerCount++
			log.Println("────────────────────────────────────")
			log.Printf("🔌 FOUND LOXONE CHARGER #%d", chargerCount)
			log.Printf("   Name: '%s'", name)
			log.Printf("   ID: %d", id)
			log.Printf("   Preset: %s", preset)

			var config map[string]interface{}
			if err := json.Unmarshal([]byte(connectionConfig), &config); err != nil {
				log.Printf("❌ ERROR: Failed to parse config for charger '%s': %v", name, err)
				lc.logToDatabase("Loxone Config Error", fmt.Sprintf("Charger '%s': %v", name, err))
				continue
			}

			host, _ := config["loxone_host"].(string)
			username, _ := config["loxone_username"].(string)
			password, _ := config["loxone_password"].(string)
			powerUUID, _ := config["loxone_power_uuid"].(string)
			stateUUID, _ := config["loxone_state_uuid"].(string)
			userIDUUID, _ := config["loxone_user_id_uuid"].(string)
			modeUUID, _ := config["loxone_mode_uuid"].(string)

			log.Printf("   ├─ Host: %s", host)
			log.Printf("   ├─ Username: %s", username)
			log.Printf("   ├─ Power UUID: %s", powerUUID)
			log.Printf("   ├─ State UUID: %s", stateUUID)
			log.Printf("   ├─ User ID UUID: %s", userIDUUID)
			log.Printf("   └─ Mode UUID: %s", modeUUID)

			if host == "" || powerUUID == "" || stateUUID == "" || userIDUUID == "" || modeUUID == "" {
				log.Printf("   ⚠️  WARNING: Incomplete config - missing host or UUIDs - skipping")
				continue
			}

			connKey := fmt.Sprintf("%s|%s|%s", host, username, password)

			conn, exists := connectionDevices[connKey]
			if !exists {
				conn = &LoxoneWebSocketConnection{
					Host:             host,
					Username:         username,
					Password:         password,
					devices:          []*LoxoneDevice{},
					stopChan:         make(chan bool),
					db:               lc.db,
					reconnectBackoff: 1 * time.Second,
					maxBackoff:       30 * time.Second,
				}
				connectionDevices[connKey] = conn
				log.Printf("   📡 Created new WebSocket connection for %s", host)
			} else {
				log.Printf("   ♻️  Reusing existing WebSocket connection for %s", host)
			}

			device := &LoxoneDevice{
				ID:         id,
				Name:       name,
				Type:       "charger",
				PowerUUID:  powerUUID,
				StateUUID:  stateUUID,
				UserIDUUID: userIDUUID,
				ModeUUID:   modeUUID,
			}
			conn.devices = append(conn.devices, device)
		}

		log.Printf("✅ Loaded %d Loxone chargers", chargerCount)
	}

	// Start all connections
	lc.mu.Lock()
	for key, conn := range connectionDevices {
		lc.connections[key] = conn
		deviceCount := len(conn.devices)
		log.Println("────────────────────────────────────")
		log.Printf("🚀 STARTING CONNECTION: %s", key)
		log.Printf("   Devices on this connection: %d", deviceCount)
		for _, dev := range conn.devices {
			log.Printf("      - %s: %s (ID: %d)", strings.ToUpper(dev.Type), dev.Name, dev.ID)
		}
		go conn.Connect(lc.db)
	}
	lc.mu.Unlock()

	totalDevices := 0
	for _, conn := range connectionDevices {
		totalDevices += len(conn.devices)
	}

	if totalDevices == 0 {
		log.Println("ℹ️  NO LOXONE API DEVICES FOUND IN DATABASE")
		lc.logToDatabase("Loxone No Devices", "No Loxone API devices found in database")
	} else {
		log.Println("────────────────────────────────────")
		log.Printf("✅ INITIALIZED %d WEBSOCKET CONNECTIONS FOR %d DEVICES",
			len(connectionDevices), totalDevices)
		lc.logToDatabase("Loxone Devices Initialized",
			fmt.Sprintf("Successfully initialized %d connections for %d devices",
				len(connectionDevices), totalDevices))
	}
}

func (lc *LoxoneCollector) monitorConnections() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	log.Println("👀 LOXONE CONNECTION MONITOR STARTED (enhanced with metrics)")

	for range ticker.C {
		lc.mu.RLock()
		disconnectedCount := 0
		connectedCount := 0
		totalDevices := 0
		totalAuthFailures := 0
		totalReconnects := 0

		log.Println("────────────────────────────────────")
		log.Println("📊 LOXONE CONNECTION STATUS CHECK")

		for key, conn := range lc.connections {
			conn.mu.Lock()
			isConnected := conn.isConnected
			tokenValid := conn.tokenValid
			tokenExpiry := conn.tokenExpiry
			lastError := conn.lastError
			deviceCount := len(conn.devices)
			authFails := conn.consecutiveAuthFails
			totalAuthFails := conn.totalAuthFailures
			totalReconn := conn.totalReconnects
			conn.mu.Unlock()

			totalDevices += deviceCount
			totalAuthFailures += totalAuthFails
			totalReconnects += totalReconn

			if !isConnected {
				disconnectedCount++
				log.Printf("   🔴 Connection %s: DISCONNECTED (%d devices)", key, deviceCount)
				if lastError != "" {
					log.Printf("      Last error: %s", lastError)
				}
				if authFails > 0 {
					log.Printf("      ⚠️  Consecutive auth failures: %d", authFails)
				}
				log.Printf("      → Attempting reconnect with backoff...")
				go conn.ConnectWithBackoff(lc.db)
			} else {
				connectedCount++
				log.Printf("   🟢 Connection %s: CONNECTED (%d devices)", key, deviceCount)
				if tokenValid && !tokenExpiry.IsZero() {
					timeUntilExpiry := time.Until(tokenExpiry)
					log.Printf("      Token expires in: %.1f hours", timeUntilExpiry.Hours())
				}
				if totalAuthFails > 0 {
					log.Printf("      📊 Lifetime auth failures: %d", totalAuthFails)
				}
				if totalReconn > 0 {
					log.Printf("      📊 Lifetime reconnects: %d", totalReconn)
				}
			}
		}
		lc.mu.RUnlock()

		log.Printf("📊 Summary: %d connected, %d disconnected, %d total devices",
			connectedCount, disconnectedCount, totalDevices)
		log.Printf("📊 Metrics: %d total auth failures, %d total reconnects",
			totalAuthFailures, totalReconnects)
		log.Println("────────────────────────────────────")

		if disconnectedCount > 0 {
			lc.logToDatabase("Loxone Status Check",
				fmt.Sprintf("%d connected, %d disconnected (total failures: %d, reconnects: %d)",
					connectedCount, disconnectedCount, totalAuthFailures, totalReconnects))
		}
	}
}

func (lc *LoxoneCollector) GetConnectionStatus() map[int]map[string]interface{} {
	lc.mu.RLock()
	defer lc.mu.RUnlock()

	status := make(map[int]map[string]interface{})

	for _, conn := range lc.connections {
		conn.mu.Lock()
		for _, device := range conn.devices {
			deviceKey := device.ID
			if device.Type == "charger" {
				deviceKey = device.ID + 10000
			}

			status[deviceKey] = map[string]interface{}{
				"device_type":            device.Type,
				"device_name":            device.Name,
				"host":                   conn.Host,
				"is_connected":           conn.isConnected,
				"token_valid":            conn.tokenValid,
				"token_expiry":           conn.tokenExpiry.Format("2006-01-02 15:04:05"),
				"last_reading":           device.lastReading,
				"last_update":            device.lastUpdate.Format("2006-01-02 15:04:05"),
				"reading_gaps":           device.readingGaps,
				"last_error":             conn.lastError,
				"consecutive_auth_fails": conn.consecutiveAuthFails,
				"total_auth_failures":    conn.totalAuthFailures,
				"total_reconnects":       conn.totalReconnects,
				"last_successful_auth":   conn.lastSuccessfulAuth.Format("2006-01-02 15:04:05"),
			}
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

// CRITICAL: ensureAuth - Check auth health before any operation
func (conn *LoxoneWebSocketConnection) ensureAuth() error {
	conn.mu.Lock()
	defer conn.mu.Unlock()

	// Check if we're connected
	if conn.ws == nil || !conn.isConnected {
		return fmt.Errorf("not connected")
	}

	// Check token validity with 30-second safety margin
	if !conn.tokenValid || time.Now().After(conn.tokenExpiry.Add(-30*time.Second)) {
		log.Printf("⚠️  [%s] Token invalid or expiring soon, re-authenticating...", conn.Host)

		// Release lock during authentication
		conn.mu.Unlock()
		err := conn.authenticateWithToken()
		conn.mu.Lock()

		if err != nil {
			conn.tokenValid = false
			conn.consecutiveAuthFails++
			conn.totalAuthFailures++
			conn.lastError = fmt.Sprintf("Auth failed: %v", err)
			log.Printf("❌ [%s] Re-authentication failed: %v", conn.Host, err)
			return fmt.Errorf("authentication failed: %v", err)
		}

		log.Printf("✅ [%s] Re-authentication successful", conn.Host)
	}

	return nil
}

func (conn *LoxoneWebSocketConnection) readLoxoneMessage() (messageType byte, jsonData []byte, err error) {
	wsMessageType, message, err := conn.ws.ReadMessage()
	if err != nil {
		return 0, nil, fmt.Errorf("failed to read message: %v", err)
	}

	if wsMessageType == websocket.BinaryMessage && len(message) >= 8 {
		headerType := message[0]
		payloadLength := binary.LittleEndian.Uint32(message[4:8])

		log.Printf("   📦 Binary header: Type=0x%02X, PayloadLen=%d", headerType, payloadLength)

		if headerType == LoxoneMsgTypeTextEvent {
			wsMessageType, message, err = conn.ws.ReadMessage()
			if err != nil {
				return 0, nil, fmt.Errorf("failed to read JSON payload: %v", err)
			}
			log.Printf("   ← JSON payload received: %d bytes", len(message))

			jsonData = conn.extractJSON(message)
			if jsonData == nil {
				log.Printf("   ⚠️  Raw message (first 100 bytes): %s", string(message[:min(len(message), 100)]))
				return headerType, nil, fmt.Errorf("could not extract JSON from text event")
			}
			return headerType, jsonData, nil
		}

		if headerType == LoxoneMsgTypeEventTable || headerType == LoxoneMsgTypeDaytimerEvent {
			log.Printf("   ℹ️  Binary event message (type %d) - ignoring", headerType)
			return headerType, nil, nil
		}

		log.Printf("   ⚠️  Unknown binary message type: 0x%02X", headerType)
		return headerType, nil, nil
	}

	if wsMessageType == websocket.TextMessage {
		log.Printf("   ← Text message received: %d bytes", len(message))
		jsonData = conn.extractJSON(message)
		if jsonData == nil {
			log.Printf("   ⚠️  Raw message: %s", string(message))
			return 0, nil, fmt.Errorf("could not extract JSON from text message")
		}
		return LoxoneMsgTypeText, jsonData, nil
	}

	return 0, nil, fmt.Errorf("unexpected message type: %d", wsMessageType)
}

func (conn *LoxoneWebSocketConnection) Connect(db *sql.DB) {
	conn.ConnectWithBackoff(db)
}

// ConnectWithBackoff - Connect with exponential backoff and jitter
func (conn *LoxoneWebSocketConnection) ConnectWithBackoff(db *sql.DB) {
	conn.mu.Lock()
	if conn.isConnected {
		conn.mu.Unlock()
		log.Printf("ℹ️  [%s] Already connected, skipping", conn.Host)
		return
	}

	conn.stopChan = make(chan bool)

	// Apply backoff with jitter
	if conn.reconnectBackoff > 1*time.Second {
		jitter := time.Duration(rand.Float64() * float64(conn.reconnectBackoff) * 0.3)
		backoffWithJitter := conn.reconnectBackoff + jitter
		log.Printf("⏳ [%s] Waiting %.1fs (backoff with jitter) before reconnect attempt...",
			conn.Host, backoffWithJitter.Seconds())
		conn.mu.Unlock()
		time.Sleep(backoffWithJitter)
		conn.mu.Lock()
	}
	conn.mu.Unlock()

    conn.mu.Lock()
    if conn.isConnected {
        conn.mu.Unlock()
        log.Printf("ℹ️  [%s] Another goroutine connected during backoff, skipping", conn.Host)
        return
    }
    conn.mu.Unlock()

	log.Println("╔═══════════════════════════════════╗")
	log.Printf("║ 🔗 CONNECTING: %s", conn.Host)
	log.Println("╚═══════════════════════════════════╝")

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
		conn.consecutiveConnFails++

		// Exponential backoff: 1s → 2s → 5s → 10s → 30s (cap)
		conn.reconnectBackoff = time.Duration(math.Min(
			float64(conn.reconnectBackoff*2),
			float64(conn.maxBackoff),
		))
		conn.mu.Unlock()

		conn.updateDeviceStatus(db, fmt.Sprintf("🔴 Connection failed: %v", err))
		conn.logToDatabase("Loxone Connection Failed",
			fmt.Sprintf("Host '%s': %v (backoff: %.1fs)", conn.Host, err, conn.reconnectBackoff.Seconds()))
		return
	}

	conn.mu.Lock()
	conn.ws = ws
	conn.consecutiveConnFails = 0 // Reset on successful connection
	conn.lastConnectionTime = time.Now()
	conn.mu.Unlock()

	log.Printf("✅ WebSocket connected successfully")
	log.Printf("Step 2: Starting token-based authentication")

	if err := conn.authenticateWithToken(); err != nil {
		errMsg := fmt.Sprintf("Authentication failed: %v", err)
		log.Printf("❌ %s", errMsg)
		ws.Close()

		conn.mu.Lock()
		conn.isConnected = false
		conn.tokenValid = false
		conn.lastError = errMsg
		conn.consecutiveAuthFails++
		conn.totalAuthFailures++

		// Exponential backoff for auth failures too
		conn.reconnectBackoff = time.Duration(math.Min(
			float64(conn.reconnectBackoff*2),
			float64(conn.maxBackoff),
		))
		conn.mu.Unlock()

		conn.updateDeviceStatus(db, fmt.Sprintf("🔴 Auth failed: %v", err))
		conn.logToDatabase("Loxone Auth Failed",
			fmt.Sprintf("Host '%s': %v (failures: %d)", conn.Host, err, conn.consecutiveAuthFails))
		return
	}

	conn.mu.Lock()
	conn.isConnected = true
	conn.tokenValid = true
	conn.lastError = ""
	conn.consecutiveAuthFails = 0           // Reset on successful auth
	conn.reconnectBackoff = 1 * time.Second // Reset backoff on success
	conn.totalReconnects++
	conn.lastSuccessfulAuth = time.Now()
	deviceCount := len(conn.devices)
	conn.mu.Unlock()

	log.Println("╔═══════════════════════════════════╗")
	log.Printf("║ ✅ CONNECTION ESTABLISHED!         ║")
	log.Printf("║ Host: %-27s║", conn.Host)
	log.Printf("║ Devices: %-24d║", deviceCount)
	log.Println("╚═══════════════════════════════════╝")

	conn.updateDeviceStatus(db, fmt.Sprintf("🟢 Connected at %s", time.Now().Format("2006-01-02 15:04:05")))
	conn.logToDatabase("Loxone Connected",
		fmt.Sprintf("Host '%s' connected with %d devices (lifetime reconnects: %d)",
			conn.Host, deviceCount, conn.totalReconnects))

	log.Printf("🎧 Starting data listener for %s...", conn.Host)
	go conn.readLoop(db)

	log.Printf("⏰ Starting data request scheduler for %s...", conn.Host)
	go conn.requestData()

	log.Printf("🔑 Starting token expiry monitor for %s...", conn.Host)
	go conn.monitorTokenExpiry(db)
}

func (conn *LoxoneWebSocketConnection) updateDeviceStatus(db *sql.DB, status string) {
	conn.mu.Lock()
	devices := conn.devices
	conn.mu.Unlock()

	for _, device := range devices {
		if device.Type == "meter" {
			db.Exec(`UPDATE meters SET notes = ? WHERE id = ?`, status, device.ID)
		} else if device.Type == "charger" {
			db.Exec(`UPDATE chargers SET notes = ? WHERE id = ?`, status, device.ID)
		}
	}
}

func (conn *LoxoneWebSocketConnection) authenticateWithToken() error {
	log.Printf("🔐 TOKEN AUTHENTICATION - Step 1: Request key exchange")
	log.Printf("   Using Loxone API v2 (getkey2)")

	getKeyCmd := fmt.Sprintf("jdev/sys/getkey2/%s", conn.Username)
	log.Printf("   → Sending: %s", getKeyCmd)

	if err := conn.ws.WriteMessage(websocket.TextMessage, []byte(getKeyCmd)); err != nil {
		return fmt.Errorf("failed to request key: %v", err)
	}

	msgType, jsonData, err := conn.readLoxoneMessage()
	if err != nil {
		return fmt.Errorf("failed to read key response: %v", err)
	}
	if jsonData == nil {
		return fmt.Errorf("no JSON data in key response")
	}

	log.Printf("   ← Received key response (type %d)", msgType)

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

	tokenValidTime := loxoneEpoch.Add(time.Duration(tokenData.ValidUntil) * time.Second)

	log.Printf("   ✅ Valid until: %v", tokenValidTime.Format("2006-01-02 15:04:05"))
	log.Printf("   ✅ Raw validUntil: %d seconds since 2009-01-01", tokenData.ValidUntil)
	log.Printf("   ✅ Rights: %d", tokenData.Rights)

	if tokenData.Unsecure {
		log.Printf("   ⚠️  WARNING: Unsecure password flag is set")
	}

	conn.mu.Lock()
	conn.token = tokenData.Token
	conn.tokenValid = true
	conn.tokenExpiry = tokenValidTime
	conn.mu.Unlock()

	log.Printf("   ✅ AUTHENTICATION SUCCESSFUL!")
	log.Printf("   Token valid for: %.1f hours", time.Until(tokenValidTime).Hours())

	return nil
}

func (conn *LoxoneWebSocketConnection) extractJSON(message []byte) []byte {
	if len(message) == 0 {
		return nil
	}

	var testJSON map[string]interface{}
	if err := json.Unmarshal(message, &testJSON); err == nil {
		return message
	}

	if message[0] == '{' {
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
						candidate := message[:i+1]
						if json.Unmarshal(candidate, &testJSON) == nil {
							return candidate
						}
					}
				}
			}
		}

		if json.Unmarshal(message, &testJSON) == nil {
			return message
		}
	}

	for i := 0; i < len(message) && i < 100; i++ {
		if message[i] == '{' {
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
							if json.Unmarshal(candidate, &testJSON) == nil {
								return candidate
							}
						}
					}
				}
			}
		}
	}

	return nil
}

func (conn *LoxoneWebSocketConnection) monitorTokenExpiry(db *sql.DB) {
	log.Printf("🔑 TOKEN MONITOR STARTED for %s (proactive checking)", conn.Host)

	ticker := time.NewTicker(5 * time.Minute) // More frequent checking
	defer ticker.Stop()

	for {
		select {
		case <-conn.stopChan:
			log.Printf("🛑 [%s] Token monitor stopping", conn.Host)
			return
		case <-ticker.C:
			conn.mu.Lock()
			isConnected := conn.isConnected
			tokenValid := conn.tokenValid
			tokenExpiry := conn.tokenExpiry
			conn.mu.Unlock()

			if !isConnected {
				log.Printf("⚠️  [%s] Not connected, token monitor stopping", conn.Host)
				return
			}

			// Check token with 30-second safety margin
			if !tokenValid || time.Now().After(tokenExpiry.Add(-30*time.Second)) {
				timeUntilExpiry := time.Until(tokenExpiry)
				log.Printf("⚠️  [%s] Token invalid or expiring soon (%.1f min), refreshing...",
					conn.Host, timeUntilExpiry.Minutes())

				conn.logToDatabase("Loxone Token Expiring",
					fmt.Sprintf("Host '%s' token expiring, refreshing...", conn.Host))

				// Try to refresh using ensureAuth
				if err := conn.ensureAuth(); err != nil {
					log.Printf("❌ [%s] Failed to ensure auth: %v", conn.Host, err)
					log.Printf("   Triggering full reconnect...")
					conn.logToDatabase("Loxone Auth Check Failed",
						fmt.Sprintf("Host '%s': %v - reconnecting", conn.Host, err))

					conn.mu.Lock()
					conn.isConnected = false
					conn.tokenValid = false
					if conn.ws != nil {
						conn.ws.Close()
					}
					conn.mu.Unlock()

					conn.updateDeviceStatus(db, "🔄 Auth failed, reconnecting...")

					// Trigger reconnect with backoff
					go conn.ConnectWithBackoff(db)
					return
				}

				conn.updateDeviceStatus(db,
					fmt.Sprintf("🟢 Token refreshed at %s", time.Now().Format("2006-01-02 15:04:05")))
			} else {
				timeUntilExpiry := time.Until(tokenExpiry)
				log.Printf("✅ [%s] Token valid for %.1f hours",
					conn.Host, timeUntilExpiry.Hours())
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

func (conn *LoxoneWebSocketConnection) requestData() {
	log.Printf("⏰ DATA REQUEST SCHEDULER STARTED for %s", conn.Host)
	log.Printf("   Collection interval: 15 minutes (at :00, :15, :30, :45)")
	log.Printf("   Using ensureAuth() before each request cycle")

	for {
		now := time.Now()
		next := getNextQuarterHour(now)
		waitDuration := next.Sub(now)

		log.Printf("📅 [%s] Next data request scheduled for %s (in %.0f seconds)",
			conn.Host, next.Format("15:04:05"), waitDuration.Seconds())

		time.Sleep(waitDuration)

		// CRITICAL: Ensure auth before sending requests
		if err := conn.ensureAuth(); err != nil {
			log.Printf("❌ [%s] Auth check failed before data request: %v", conn.Host, err)
			log.Printf("   Skipping this collection cycle, will trigger reconnect")

			conn.mu.Lock()
			conn.isConnected = false
			conn.tokenValid = false
			conn.mu.Unlock()

			go conn.ConnectWithBackoff(conn.db)
			return
		}

		conn.mu.Lock()
		if !conn.isConnected || conn.ws == nil {
			log.Printf("⚠️  [%s] Not connected after auth check, skipping", conn.Host)
			conn.mu.Unlock()
			return
		}

		devices := conn.devices
		conn.mu.Unlock()

		log.Println("────────────────────────────────────")
		log.Printf("📡 [%s] REQUESTING DATA FOR %d DEVICES", conn.Host, len(devices))
		log.Printf("   Time: %s", time.Now().Format("15:04:05"))

		for _, device := range devices {
			// Check auth before each device (optional, but safer)
			if err := conn.ensureAuth(); err != nil {
				log.Printf("❌ Auth check failed during collection: %v", err)
				break
			}

			if device.Type == "meter" {
				conn.mu.Lock()
				if !conn.isConnected || conn.ws == nil {
					conn.mu.Unlock()
					break
				}

				cmd := fmt.Sprintf("jdev/sps/io/%s/all", device.DeviceID)
				log.Printf("   → METER [%s]: %s", device.Name, device.DeviceID)

				if err := conn.ws.WriteMessage(websocket.TextMessage, []byte(cmd)); err != nil {
					log.Printf("❌ Failed to request data for meter %s: %v", device.Name, err)
					conn.isConnected = false
					conn.tokenValid = false
					conn.lastError = fmt.Sprintf("Data request failed: %v", err)
					conn.logToDatabase("Loxone Data Request Failed",
						fmt.Sprintf("Meter '%s': %v", device.Name, err))
					conn.mu.Unlock()
					return
				}
				conn.mu.Unlock()
				time.Sleep(100 * time.Millisecond)

			} else if device.Type == "charger" {
				log.Printf("   → CHARGER [%s]: requesting 4 UUIDs", device.Name)

				uuids := []struct {
					name string
					uuid string
				}{
					{"power", device.PowerUUID},
					{"state", device.StateUUID},
					{"user_id", device.UserIDUUID},
					{"mode", device.ModeUUID},
				}

				for _, u := range uuids {
					conn.mu.Lock()
					if !conn.isConnected || conn.ws == nil {
						conn.mu.Unlock()
						break
					}

					cmd := fmt.Sprintf("jdev/sps/io/%s/all", u.uuid)
					log.Printf("      ├─ %s UUID: %s", u.name, u.uuid)

					if err := conn.ws.WriteMessage(websocket.TextMessage, []byte(cmd)); err != nil {
						log.Printf("❌ Failed to request %s for charger %s: %v", u.name, device.Name, err)
						conn.isConnected = false
						conn.tokenValid = false
						conn.lastError = fmt.Sprintf("Data request failed: %v", err)
						conn.logToDatabase("Loxone Data Request Failed",
							fmt.Sprintf("Charger '%s' %s: %v", device.Name, u.name, err))
						conn.mu.Unlock()
						return
					}
					conn.mu.Unlock()
					time.Sleep(100 * time.Millisecond)
				}
			}
		}

		log.Printf("   ✅ All data requests sent successfully")
	}
}

func (conn *LoxoneWebSocketConnection) readLoop(db *sql.DB) {
	defer func() {
		conn.mu.Lock()
		if conn.ws != nil {
			conn.ws.Close()
		}
		conn.isConnected = false
		conn.tokenValid = false
		conn.mu.Unlock()

		log.Printf("🔴 [%s] DISCONNECTED from Loxone", conn.Host)

		conn.updateDeviceStatus(db,
			fmt.Sprintf("🔴 Offline since %s", time.Now().Format("2006-01-02 15:04:05")))
		conn.logToDatabase("Loxone Disconnected", fmt.Sprintf("Host '%s' disconnected", conn.Host))

		// Trigger reconnect with backoff
		go conn.ConnectWithBackoff(db)
	}()

	log.Printf("👂 [%s] DATA LISTENER ACTIVE - waiting for messages...", conn.Host)

	messageCount := 0
	chargerData := make(map[int]*ChargerDataCollection)

	type readResult struct {
		msgType  byte
		jsonData []byte
		err      error
	}
	readChan := make(chan readResult, 10)

	go func() {
		for {
			conn.mu.Lock()
			ws := conn.ws
			isConnected := conn.isConnected
			conn.mu.Unlock()

			if ws == nil || !isConnected {
				return
			}

			conn.mu.Lock()
			if conn.ws != nil {
				conn.ws.SetReadDeadline(time.Now().Add(20 * time.Minute))
			}
			conn.mu.Unlock()

			msgType, jsonData, err := conn.readLoxoneMessage()

			select {
			case readChan <- readResult{msgType, jsonData, err}:
			default:
				log.Printf("⚠️  [%s] Read channel full, dropping message", conn.Host)
			}

			if err != nil {
				return
			}
		}
	}()

	for {
		select {
		case <-conn.stopChan:
			log.Printf("🛑 [%s] Received stop signal, closing listener", conn.Host)
			return

		case result := <-readChan:
			if result.err != nil {
				if strings.Contains(result.err.Error(), "i/o timeout") ||
					strings.Contains(result.err.Error(), "deadline") {
					log.Printf("⏱️  [%s] Read timeout (expected between data requests)", conn.Host)
					continue
				}

				if strings.Contains(result.err.Error(), "websocket: close") {
					log.Printf("ℹ️  [%s] WebSocket closed normally", conn.Host)
				} else {
					log.Printf("❌ [%s] Read error: %v", conn.Host, result.err)
					conn.mu.Lock()
					conn.lastError = fmt.Sprintf("Read error: %v", result.err)
					conn.mu.Unlock()
					conn.logToDatabase("Loxone Read Error",
						fmt.Sprintf("Host '%s': %v", conn.Host, result.err))
				}
				return
			}

			if result.jsonData == nil {
				continue
			}

			messageCount++

			var response LoxoneResponse
			if err := json.Unmarshal(result.jsonData, &response); err != nil {
				log.Printf("⚠️  [%s] Failed to parse JSON response: %v", conn.Host, err)
				continue
			}

			// Check for auth/permission errors in response
			if response.LL.Code == "401" || response.LL.Code == "403" {
				log.Printf("🔐 [%s] Auth error detected in response (code: %s)", conn.Host, response.LL.Code)

				conn.mu.Lock()
				conn.tokenValid = false
				conn.consecutiveAuthFails++
				conn.totalAuthFailures++
				conn.mu.Unlock()

				conn.logToDatabase("Loxone Auth Error",
					fmt.Sprintf("Host '%s' received auth error code %s - triggering reconnect",
						conn.Host, response.LL.Code))

				// Trigger reconnect
				return
			}

			conn.mu.Lock()
			devices := conn.devices
			conn.mu.Unlock()

			for _, device := range devices {
				if device.Type == "meter" {
					expectedControl := fmt.Sprintf("dev/sps/io/%s/all", device.DeviceID)
					if strings.Contains(response.LL.Control, expectedControl) {
						conn.processMeterData(device, response, db)
						break
					}
				} else if device.Type == "charger" {
					uuidMap := map[string]string{
						device.PowerUUID:  "power",
						device.StateUUID:  "state",
						device.UserIDUUID: "user_id",
						device.ModeUUID:   "mode",
					}

					for uuid, fieldName := range uuidMap {
						expectedControl := fmt.Sprintf("dev/sps/io/%s/all", uuid)
						if strings.Contains(response.LL.Control, expectedControl) {
							if chargerData[device.ID] == nil {
								chargerData[device.ID] = &ChargerDataCollection{}
							}

							conn.processChargerField(device, response, fieldName, chargerData[device.ID], db)
							break
						}
					}
				}
			}
		}
	}
}

// Continue in next message due to length...

func (conn *LoxoneWebSocketConnection) processMeterData(device *LoxoneDevice, response LoxoneResponse, db *sql.DB) {
	if output1, ok := response.LL.Outputs["output1"]; ok {
		var reading float64

		switch v := output1.Value.(type) {
		case float64:
			reading = v
		case string:
			if f, err := strconv.ParseFloat(v, 64); err == nil {
				reading = f
			}
		}

		if reading > 0 {
			device.lastReading = reading
			device.lastUpdate = time.Now()
			device.readingGaps = 0 // Reset gap counter on successful read

			currentTime := roundToQuarterHour(time.Now())

			var lastReading float64
			var lastTime time.Time
			err := db.QueryRow(`
				SELECT power_kwh, reading_time FROM meter_readings 
				WHERE meter_id = ? 
				ORDER BY reading_time DESC LIMIT 1
			`, device.ID).Scan(&lastReading, &lastTime)

			var consumption float64
			isFirstReading := false

			if err == nil && !lastTime.IsZero() {
				interpolated := interpolateReadings(lastTime, lastReading, currentTime, reading)

				for i, point := range interpolated {
					intervalConsumption := point.value - lastReading
					if intervalConsumption < 0 {
						intervalConsumption = 0
					}

					db.Exec(`
						INSERT INTO meter_readings (meter_id, reading_time, power_kwh, consumption_kwh)
						VALUES (?, ?, ?, ?)
					`, device.ID, point.time, point.value, intervalConsumption)

					lastReading = point.value

					// Track interpolated gaps
					if i == 0 && len(interpolated) > 1 {
						device.readingGaps += len(interpolated)
						log.Printf("   ⚠️  Filled %d reading gaps for meter %s", len(interpolated), device.Name)
					}
				}

				consumption = reading - lastReading
				if consumption < 0 {
					consumption = 0
				}
			} else {
				consumption = 0
				isFirstReading = true
			}

			_, err = db.Exec(`
				INSERT INTO meter_readings (meter_id, reading_time, power_kwh, consumption_kwh)
				VALUES (?, ?, ?, ?)
			`, device.ID, currentTime, reading, consumption)

			if err != nil {
				log.Printf("❌ Failed to save reading to database: %v", err)
				conn.mu.Lock()
				conn.lastError = fmt.Sprintf("DB save failed: %v", err)
				conn.mu.Unlock()
			} else {
				db.Exec(`
					UPDATE meters 
					SET last_reading = ?, last_reading_time = ?, 
					    notes = ?
					WHERE id = ?
				`, reading, currentTime,
					fmt.Sprintf("🟢 Last update: %s", time.Now().Format("2006-01-02 15:04:05")),
					device.ID)

				if !isFirstReading {
					log.Printf("✅ METER [%s]: %.3f kWh (consumption: %.3f kWh)",
						device.Name, reading, consumption)
				}
			}
		}
	}
}

func (conn *LoxoneWebSocketConnection) processChargerField(device *LoxoneDevice, response LoxoneResponse, fieldName string, collection *ChargerDataCollection, db *sql.DB) {
	if output1, ok := response.LL.Outputs["output1"]; ok {
		switch fieldName {
		case "power":
			var power float64
			switch v := output1.Value.(type) {
			case float64:
				power = v
			case string:
				if f, err := strconv.ParseFloat(v, 64); err == nil {
					power = f
				}
			}
			collection.Power = &power

		case "state":
			var state string
			switch v := output1.Value.(type) {
			case string:
				state = v
			case float64:
				state = fmt.Sprintf("%.0f", v)
			}
			collection.State = &state

		case "user_id":
			var userID string
			switch v := output1.Value.(type) {
			case string:
				userID = v
			case float64:
				userID = fmt.Sprintf("%.0f", v)
			}
			collection.UserID = &userID

		case "mode":
			var mode string
			switch v := output1.Value.(type) {
			case string:
				mode = v
			case float64:
				mode = fmt.Sprintf("%.0f", v)
			}
			collection.Mode = &mode
		}

		if collection.Power != nil && collection.State != nil && collection.UserID != nil && collection.Mode != nil {
			conn.saveChargerData(device, collection, db)

			collection.Power = nil
			collection.State = nil
			collection.UserID = nil
			collection.Mode = nil
		}
	}
}

func (conn *LoxoneWebSocketConnection) saveChargerData(device *LoxoneDevice, collection *ChargerDataCollection, db *sql.DB) {
	power := *collection.Power
	state := *collection.State
	userID := *collection.UserID
	mode := *collection.Mode

	device.lastReading = power
	device.lastUpdate = time.Now()
	device.readingGaps = 0 // Reset gap counter

	currentTime := roundToQuarterHour(time.Now())

	var lastPower float64
	var lastTime time.Time
	err := db.QueryRow(`
		SELECT power_kwh, session_time FROM charger_sessions 
		WHERE charger_id = ? AND user_id = ?
		ORDER BY session_time DESC LIMIT 1
	`, device.ID, userID).Scan(&lastPower, &lastTime)

	if err == nil && !lastTime.IsZero() {
		interpolated := interpolateReadings(lastTime, lastPower, currentTime, power)

		for _, point := range interpolated {
			db.Exec(`
				INSERT INTO charger_sessions (charger_id, user_id, session_time, power_kwh, mode, state)
				VALUES (?, ?, ?, ?, ?, ?)
			`, device.ID, userID, point.time, point.value, mode, state)
		}

		if len(interpolated) > 0 {
			device.readingGaps += len(interpolated)
			log.Printf("   ⚠️  Filled %d reading gaps for charger %s", len(interpolated), device.Name)
		}
	}

	_, err = db.Exec(`
		INSERT INTO charger_sessions (charger_id, user_id, session_time, power_kwh, mode, state)
		VALUES (?, ?, ?, ?, ?, ?)
	`, device.ID, userID, currentTime, power, mode, state)

	if err != nil {
		log.Printf("❌ Failed to save charger session to database: %v", err)
		conn.mu.Lock()
		conn.lastError = fmt.Sprintf("DB save failed: %v", err)
		conn.mu.Unlock()
	} else {
		log.Printf("✅ CHARGER [%s]: %.4f kWh (user: %s, mode: %s)",
			device.Name, power, userID, mode)

		db.Exec(`
			UPDATE chargers 
			SET notes = ?
			WHERE id = ?
		`, fmt.Sprintf("🟢 Last update: %s", time.Now().Format("2006-01-02 15:04:05")),
			device.ID)
	}
}

func (conn *LoxoneWebSocketConnection) logToDatabase(action, details string) {
	if conn.db != nil {
		conn.db.Exec(`
			INSERT INTO admin_logs (action, details, ip_address)
			VALUES (?, ?, ?)
		`, action, details, fmt.Sprintf("loxone-%s", conn.Host))
	}
}

func (conn *LoxoneWebSocketConnection) IsConnected() bool {
	conn.mu.Lock()
	defer conn.mu.Unlock()
	return conn.isConnected
}

func (conn *LoxoneWebSocketConnection) Close() {
	log.Printf("🛑 Closing connection for %s", conn.Host)
	conn.mu.Lock()
	defer conn.mu.Unlock()

	close(conn.stopChan)
	if conn.ws != nil {
		conn.ws.Close()
		conn.ws = nil
	}
	conn.isConnected = false
	conn.tokenValid = false
	log.Printf("   ✅ Connection closed")

	conn.logToDatabase("Loxone Connection Closed",
		fmt.Sprintf("Host '%s' connection closed", conn.Host))
}
