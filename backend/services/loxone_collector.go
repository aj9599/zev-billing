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
	db                 *sql.DB
	meterConnections   map[int]*LoxoneConnection        // meterID -> connection
	chargerConnections map[int]*LoxoneChargerConnection // chargerID -> connection
	mu                 sync.RWMutex
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

type LoxoneChargerConnection struct {
	ChargerID     int
	ChargerName   string
	Host          string
	Username      string
	Password      string
	PowerUUID     string
	StateUUID     string
	UserIDUUID    string
	ModeUUID      string
	ws            *websocket.Conn
	isConnected   bool
	token         string
	tokenValid    time.Time
	lastPower     float64
	lastState     string
	lastUserID    string
	lastMode      string
	lastUpdate    time.Time
	lastError     string
	stopChan      chan bool
	mu            sync.Mutex
	db            *sql.DB
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
	log.Println("ðŸ”§ LOXONE COLLECTOR: Initializing")
	lc := &LoxoneCollector{
		db:                 db,
		meterConnections:   make(map[int]*LoxoneConnection),
		chargerConnections: make(map[int]*LoxoneChargerConnection),
	}
	log.Println("ðŸ”§ LOXONE COLLECTOR: Instance created successfully")
	return lc
}

func (lc *LoxoneCollector) Start() {
	log.Println("===================================")
	log.Println("ðŸ”Œ LOXONE WEBSOCKET COLLECTOR STARTING")
	log.Println("===================================")
	
	lc.logToDatabase("Loxone Collector Started", "Initializing Loxone WebSocket connections for meters and chargers")

	lc.initializeConnections()

	totalConnections := len(lc.meterConnections) + len(lc.chargerConnections)
	log.Printf("âœ… Loxone Collector initialized with %d meters and %d chargers (%d total connections)", 
		len(lc.meterConnections), len(lc.chargerConnections), totalConnections)
	lc.logToDatabase("Loxone Collector Ready", 
		fmt.Sprintf("Initialized %d meters and %d chargers", len(lc.meterConnections), len(lc.chargerConnections)))

	// Monitor and reconnect dropped connections
	go lc.monitorConnections()

	log.Println("âœ… Loxone connection monitor started")
	log.Println("===================================")
}

func (lc *LoxoneCollector) Stop() {
	log.Println("ðŸ›‘ STOPPING ALL LOXONE CONNECTIONS")
	lc.logToDatabase("Loxone Collector Stopping", "Closing all Loxone connections")
	
	lc.mu.Lock()
	defer lc.mu.Unlock()

	for meterID, conn := range lc.meterConnections {
		log.Printf("Closing meter connection for meter ID %d (%s)", meterID, conn.MeterName)
		conn.Close()
	}
	
	for chargerID, conn := range lc.chargerConnections {
		log.Printf("Closing charger connection for charger ID %d (%s)", chargerID, conn.ChargerName)
		conn.Close()
	}
	
	lc.meterConnections = make(map[int]*LoxoneConnection)
	lc.chargerConnections = make(map[int]*LoxoneChargerConnection)
	
	log.Println("âœ… All Loxone connections stopped")
	lc.logToDatabase("Loxone Collector Stopped", "All connections closed")
}

func (lc *LoxoneCollector) RestartConnections() {
	log.Println("=== RESTARTING LOXONE CONNECTIONS ===")
	lc.logToDatabase("Loxone Connections Restarting", "Reinitializing all Loxone connections")
	
	lc.Stop()
	time.Sleep(500 * time.Millisecond)
	lc.initializeConnections()
	
	log.Println("=== LOXONE CONNECTIONS RESTARTED ===")
	totalConnections := len(lc.meterConnections) + len(lc.chargerConnections)
	lc.logToDatabase("Loxone Connections Restarted", 
		fmt.Sprintf("Successfully restarted %d connections", totalConnections))
}

func (lc *LoxoneCollector) initializeConnections() {
	log.Println("ðŸ” SCANNING DATABASE FOR LOXONE API DEVICES...")

	// Initialize meter connections
	lc.initializeMeterConnections()
	
	// Initialize charger connections
	lc.initializeChargerConnections()
}

func (lc *LoxoneCollector) initializeMeterConnections() {
	log.Println("ðŸ“Š SCANNING FOR LOXONE API METERS...")

	rows, err := lc.db.Query(`
		SELECT id, name, connection_config
		FROM meters 
		WHERE is_active = 1 AND connection_type = 'loxone_api'
	`)
	if err != nil {
		log.Printf("âŒ ERROR: Failed to query Loxone meters: %v", err)
		lc.logToDatabase("Loxone Query Error", fmt.Sprintf("Failed to query meters: %v", err))
		return
	}
	defer rows.Close()

	meterCount := 0
	for rows.Next() {
		var id int
		var name, connectionConfig string

		if err := rows.Scan(&id, &name, &connectionConfig); err != nil {
			log.Printf("âŒ ERROR: Failed to scan meter row: %v", err)
			continue
		}

		meterCount++
		log.Println("â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€")
		log.Printf("ðŸ“Š FOUND LOXONE METER #%d", meterCount)
		log.Printf("   Name: '%s'", name)
		log.Printf("   ID: %d", id)

		var config map[string]interface{}
		if err := json.Unmarshal([]byte(connectionConfig), &config); err != nil {
			log.Printf("âŒ ERROR: Failed to parse config for meter '%s': %v", name, err)
			lc.logToDatabase("Loxone Config Error", fmt.Sprintf("Meter '%s': %v", name, err))
			continue
		}

		host, _ := config["loxone_host"].(string)
		username, _ := config["loxone_username"].(string)
		password, _ := config["loxone_password"].(string)
		deviceID, _ := config["loxone_power_uuid"].(string)

		if host == "" || deviceID == "" {
			log.Printf("   âš ï¸ WARNING: Incomplete config - missing host or device_id")
			lc.logToDatabase("Loxone Config Incomplete", fmt.Sprintf("Meter '%s' missing required config", name))
			continue
		}

		log.Printf("   â””â”€ âœ… Configuration valid, initiating connection...")

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
		lc.meterConnections[id] = conn
		lc.mu.Unlock()

		log.Printf("ðŸš€ Starting connection goroutine for meter '%s'...", name)
		go conn.Connect(lc.db)
	}

	if meterCount == 0 {
		log.Println("â„¹ï¸ NO LOXONE API METERS FOUND IN DATABASE")
	} else {
		log.Println("â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€")
		log.Printf("âœ… INITIALIZED %d LOXONE METER CONNECTIONS", meterCount)
	}
}

func (lc *LoxoneCollector) initializeChargerConnections() {
	log.Println("ðŸ”Œ SCANNING FOR LOXONE API CHARGERS...")

	rows, err := lc.db.Query(`
		SELECT id, name, connection_config
		FROM chargers 
		WHERE is_active = 1 AND connection_type = 'loxone_api'
	`)
	if err != nil {
		log.Printf("âŒ ERROR: Failed to query Loxone chargers: %v", err)
		lc.logToDatabase("Loxone Query Error", fmt.Sprintf("Failed to query chargers: %v", err))
		return
	}
	defer rows.Close()

	chargerCount := 0
	for rows.Next() {
		var id int
		var name, connectionConfig string

		if err := rows.Scan(&id, &name, &connectionConfig); err != nil {
			log.Printf("âŒ ERROR: Failed to scan charger row: %v", err)
			continue
		}

		chargerCount++
		log.Println("â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€")
		log.Printf("ðŸ”Œ FOUND LOXONE CHARGER #%d", chargerCount)
		log.Printf("   Name: '%s'", name)
		log.Printf("   ID: %d", id)

		var config map[string]interface{}
		if err := json.Unmarshal([]byte(connectionConfig), &config); err != nil {
			log.Printf("âŒ ERROR: Failed to parse config for charger '%s': %v", name, err)
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

		log.Printf("   â”œâ”€ Host: %s", host)
		log.Printf("   â”œâ”€ Power UUID: %s", powerUUID)
		log.Printf("   â”œâ”€ State UUID: %s", stateUUID)
		log.Printf("   â”œâ”€ User ID UUID: %s", userIDUUID)
		log.Printf("   â”œâ”€ Mode UUID: %s", modeUUID)

		if host == "" || powerUUID == "" || stateUUID == "" || userIDUUID == "" || modeUUID == "" {
			log.Printf("   âš ï¸ WARNING: Incomplete config - missing required UUIDs")
			lc.logToDatabase("Loxone Config Incomplete", fmt.Sprintf("Charger '%s' missing required config", name))
			continue
		}

		log.Printf("   â””â”€ âœ… Configuration valid, initiating connection...")

		conn := &LoxoneChargerConnection{
			ChargerID:   id,
			ChargerName: name,
			Host:        host,
			Username:    username,
			Password:    password,
			PowerUUID:   powerUUID,
			StateUUID:   stateUUID,
			UserIDUUID:  userIDUUID,
			ModeUUID:    modeUUID,
			stopChan:    make(chan bool),
			db:          lc.db,
		}

		lc.mu.Lock()
		lc.chargerConnections[id] = conn
		lc.mu.Unlock()

		log.Printf("ðŸš€ Starting connection goroutine for charger '%s'...", name)
		go conn.ConnectCharger(lc.db)
	}

	if chargerCount == 0 {
		log.Println("â„¹ï¸ NO LOXONE API CHARGERS FOUND IN DATABASE")
	} else {
		log.Println("â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€")
		log.Printf("âœ… INITIALIZED %d LOXONE CHARGER CONNECTIONS", chargerCount)
	}
}

func (lc *LoxoneCollector) monitorConnections() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	log.Println("ðŸ‘€ LOXONE CONNECTION MONITOR STARTED (checking every 30 seconds)")

	for range ticker.C {
		lc.mu.RLock()
		disconnectedCount := 0
		connectedCount := 0

		log.Println("â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€")
		log.Println("ðŸ“Š LOXONE CONNECTION STATUS CHECK")

		// Check meters
		for meterID, conn := range lc.meterConnections {
			conn.mu.Lock()
			isConnected := conn.isConnected
			lastUpdate := conn.lastUpdate
			lastError := conn.lastError
			conn.mu.Unlock()

			if !isConnected {
				disconnectedCount++
				log.Printf("   ðŸ”´ Meter %d (%s): DISCONNECTED", meterID, conn.MeterName)
				if lastError != "" {
					log.Printf("      Last error: %s", lastError)
				}
				log.Printf("      â†’ Attempting reconnect...")
				go conn.Connect(lc.db)
			} else {
				connectedCount++
				timeSinceUpdate := time.Since(lastUpdate)
				log.Printf("   ðŸŸ¢ Meter %d (%s): CONNECTED", meterID, conn.MeterName)
				if !lastUpdate.IsZero() {
					log.Printf("      Last update: %s (%.0f seconds ago)",
						lastUpdate.Format("15:04:05"), timeSinceUpdate.Seconds())
				}
			}
		}

		// Check chargers
		for chargerID, conn := range lc.chargerConnections {
			conn.mu.Lock()
			isConnected := conn.isConnected
			lastUpdate := conn.lastUpdate
			lastError := conn.lastError
			conn.mu.Unlock()

			if !isConnected {
				disconnectedCount++
				log.Printf("   ðŸ”´ Charger %d (%s): DISCONNECTED", chargerID, conn.ChargerName)
				if lastError != "" {
					log.Printf("      Last error: %s", lastError)
				}
				log.Printf("      â†’ Attempting reconnect...")
				go conn.ConnectCharger(lc.db)
			} else {
				connectedCount++
				timeSinceUpdate := time.Since(lastUpdate)
				log.Printf("   ðŸŸ¢ Charger %d (%s): CONNECTED", chargerID, conn.ChargerName)
				if !lastUpdate.IsZero() {
					log.Printf("      Last update: %s (%.0f seconds ago)",
						lastUpdate.Format("15:04:05"), timeSinceUpdate.Seconds())
				}
			}
		}

		lc.mu.RUnlock()

		log.Printf("ðŸ“Š Summary: %d connected, %d disconnected", connectedCount, disconnectedCount)
		log.Println("â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€")
		
		if disconnectedCount > 0 {
			lc.logToDatabase("Loxone Status Check", 
				fmt.Sprintf("%d connected, %d disconnected (attempting reconnect)", connectedCount, disconnectedCount))
		}
	}
}

func (lc *LoxoneCollector) GetConnectionStatus() map[int]map[string]interface{} {
	lc.mu.RLock()
	defer lc.mu.RUnlock()

	status := make(map[int]map[string]interface{})
	
	// Add meter statuses
	for meterID, conn := range lc.meterConnections {
		conn.mu.Lock()
		status[meterID] = map[string]interface{}{
			"meter_name":   conn.MeterName,
			"host":         conn.Host,
			"device_id":    conn.DeviceID,
			"is_connected": conn.isConnected,
			"last_reading": conn.lastReading,
			"last_update":  conn.lastUpdate.Format("2006-01-02 15:04:05"),
			"last_error":   conn.lastError,
			"type":         "meter",
		}
		conn.mu.Unlock()
	}
	
	return status
}

func (lc *LoxoneCollector) GetChargerConnectionStatus() map[int]map[string]interface{} {
	lc.mu.RLock()
	defer lc.mu.RUnlock()

	status := make(map[int]map[string]interface{})
	
	// Add charger statuses
	for chargerID, conn := range lc.chargerConnections {
		conn.mu.Lock()
		status[chargerID] = map[string]interface{}{
			"charger_name": conn.ChargerName,
			"host":         conn.Host,
			"is_connected": conn.isConnected,
			"last_reading": conn.lastPower,
			"last_update":  conn.lastUpdate.Format("2006-01-02 15:04:05"),
			"last_error":   conn.lastError,
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
	wsMessageType, message, err := conn.ws.ReadMessage()
	if err != nil {
		return 0, nil, fmt.Errorf("failed to read message: %v", err)
	}

	if wsMessageType == websocket.BinaryMessage && len(message) >= 8 {
		headerType := message[0]
		payloadLength := binary.LittleEndian.Uint32(message[4:8])

		log.Printf("   ðŸ“¦ Binary header: Type=0x%02X, PayloadLen=%d", headerType, payloadLength)

		if headerType == LoxoneMsgTypeTextEvent {
			wsMessageType, message, err = conn.ws.ReadMessage()
			if err != nil {
				return 0, nil, fmt.Errorf("failed to read JSON payload: %v", err)
			}
			log.Printf("   â† JSON payload received: %d bytes", len(message))

			jsonData = conn.extractJSON(message)
			if jsonData == nil {
				log.Printf("   âš ï¸ Raw message (first 100 bytes): %s", string(message[:min(len(message), 100)]))
				return headerType, nil, fmt.Errorf("could not extract JSON from text event")
			}
			return headerType, jsonData, nil
		}

		if headerType == LoxoneMsgTypeEventTable || headerType == LoxoneMsgTypeDaytimerEvent {
			log.Printf("   â„¹ï¸ Binary event message (type %d) - ignoring", headerType)
			return headerType, nil, nil
		}

		log.Printf("   âš ï¸ Unknown binary message type: 0x%02X", headerType)
		return headerType, nil, nil
	}

	if wsMessageType == websocket.TextMessage {
		log.Printf("   â† Text message received: %d bytes", len(message))
		jsonData = conn.extractJSON(message)
		if jsonData == nil {
			log.Printf("   âš ï¸ Raw message: %s", string(message))
			return 0, nil, fmt.Errorf("could not extract JSON from text message")
		}
		return LoxoneMsgTypeText, jsonData, nil
	}

	return 0, nil, fmt.Errorf("unexpected message type: %d", wsMessageType)
}

// readLoxoneMessage for charger connection
func (conn *LoxoneChargerConnection) readLoxoneMessage() (messageType byte, jsonData []byte, err error) {
	wsMessageType, message, err := conn.ws.ReadMessage()
	if err != nil {
		return 0, nil, fmt.Errorf("failed to read message: %v", err)
	}

	if wsMessageType == websocket.BinaryMessage && len(message) >= 8 {
		headerType := message[0]
		payloadLength := binary.LittleEndian.Uint32(message[4:8])

		log.Printf("   ðŸ“¦ Binary header: Type=0x%02X, PayloadLen=%d", headerType, payloadLength)

		if headerType == LoxoneMsgTypeTextEvent {
			wsMessageType, message, err = conn.ws.ReadMessage()
			if err != nil {
				return 0, nil, fmt.Errorf("failed to read JSON payload: %v", err)
			}
			log.Printf("   â† JSON payload received: %d bytes", len(message))

			jsonData = conn.extractJSON(message)
			if jsonData == nil {
				log.Printf("   âš ï¸ Raw message (first 100 bytes): %s", string(message[:min(len(message), 100)]))
				return headerType, nil, fmt.Errorf("could not extract JSON from text event")
			}
			return headerType, jsonData, nil
		}

		if headerType == LoxoneMsgTypeEventTable || headerType == LoxoneMsgTypeDaytimerEvent {
			log.Printf("   â„¹ï¸ Binary event message (type %d) - ignoring", headerType)
			return headerType, nil, nil
		}

		log.Printf("   âš ï¸ Unknown binary message type: 0x%02X", headerType)
		return headerType, nil, nil
	}

	if wsMessageType == websocket.TextMessage {
		log.Printf("   â† Text message received: %d bytes", len(message))
		jsonData = conn.extractJSON(message)
		if jsonData == nil {
			log.Printf("   âš ï¸ Raw message: %s", string(message))
			return 0, nil, fmt.Errorf("could not extract JSON from text message")
		}
		return LoxoneMsgTypeText, jsonData, nil
	}

	return 0, nil, fmt.Errorf("unexpected message type: %d", wsMessageType)
}

func (conn *LoxoneConnection) Connect(db *sql.DB) {
	log.Println("â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—")
	log.Printf("â•‘ ðŸ”— CONNECTING METER: %s (ID: %d)", conn.MeterName, conn.MeterID)
	log.Println("â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•")

	conn.mu.Lock()
	if conn.isConnected {
		conn.mu.Unlock()
		log.Printf("â„¹ï¸ Already connected, skipping")
		return
	}
	conn.mu.Unlock()

	wsURL := fmt.Sprintf("ws://%s/ws/rfc6455", conn.Host)

	log.Printf("Step 1: Establishing WebSocket connection")
	log.Printf("   URL: %s", wsURL)

	dialer := websocket.Dialer{
		HandshakeTimeout: 10 * time.Second,
	}

	ws, _, err := dialer.Dial(wsURL, nil)
	if err != nil {
		errMsg := fmt.Sprintf("Failed to connect: %v", err)
		log.Printf("âŒ %s", errMsg)
		conn.mu.Lock()
		conn.isConnected = false
		conn.lastError = errMsg
		conn.mu.Unlock()

		db.Exec(`UPDATE meters SET notes = ? WHERE id = ?`,
			fmt.Sprintf("ðŸ”´ Connection failed: %v", err),
			conn.MeterID)
		
		conn.logToDatabase("Loxone Meter Connection Failed", fmt.Sprintf("Meter '%s': %v", conn.MeterName, err))
		return
	}

	conn.mu.Lock()
	conn.ws = ws
	conn.mu.Unlock()

	log.Printf("âœ… WebSocket connected successfully")
	log.Printf("Step 2: Starting token-based authentication")

	if err := conn.authenticateWithToken(); err != nil {
		errMsg := fmt.Sprintf("Authentication failed: %v", err)
		log.Printf("âŒ %s", errMsg)
		ws.Close()
		conn.mu.Lock()
		conn.isConnected = false
		conn.lastError = errMsg
		conn.mu.Unlock()

		db.Exec(`UPDATE meters SET notes = ? WHERE id = ?`,
			fmt.Sprintf("ðŸ”´ Auth failed: %v", err),
			conn.MeterID)
		
		conn.logToDatabase("Loxone Meter Auth Failed", fmt.Sprintf("Meter '%s': %v", conn.MeterName, err))
		return
	}

	conn.mu.Lock()
	conn.isConnected = true
	conn.lastError = ""
	conn.mu.Unlock()

	log.Println("â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—")
	log.Printf("â•‘ âœ… METER CONNECTION ESTABLISHED!  â•‘")
	log.Printf("â•‘ Meter: %-25sâ•‘", conn.MeterName)
	log.Println("â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•")

	db.Exec(`UPDATE meters SET notes = ? WHERE id = ?`,
		fmt.Sprintf("ðŸŸ¢ Connected at %s", time.Now().Format("2006-01-02 15:04:05")),
		conn.MeterID)
	
	conn.logToDatabase("Loxone Meter Connected", fmt.Sprintf("Meter '%s' connected successfully", conn.MeterName))

	log.Printf("ðŸŽ§ Starting data listener for %s...", conn.MeterName)
	go conn.readLoop(db)

	log.Printf("â° Starting data request scheduler for %s...", conn.MeterName)
	go conn.requestData()

	log.Printf("ðŸ”‘ Starting token expiry monitor for %s...", conn.MeterName)
	go conn.monitorTokenExpiry(db)
}

func (conn *LoxoneChargerConnection) ConnectCharger(db *sql.DB) {
	log.Println("â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—")
	log.Printf("â•‘ ðŸ”— CONNECTING CHARGER: %s (ID: %d)", conn.ChargerName, conn.ChargerID)
	log.Println("â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•")

	conn.mu.Lock()
	if conn.isConnected {
		conn.mu.Unlock()
		log.Printf("â„¹ï¸ Already connected, skipping")
		return
	}
	conn.mu.Unlock()

	wsURL := fmt.Sprintf("ws://%s/ws/rfc6455", conn.Host)

	log.Printf("Step 1: Establishing WebSocket connection")
	log.Printf("   URL: %s", wsURL)

	dialer := websocket.Dialer{
		HandshakeTimeout: 10 * time.Second,
	}

	ws, _, err := dialer.Dial(wsURL, nil)
	if err != nil {
		errMsg := fmt.Sprintf("Failed to connect: %v", err)
		log.Printf("âŒ %s", errMsg)
		conn.mu.Lock()
		conn.isConnected = false
		conn.lastError = errMsg
		conn.mu.Unlock()

		db.Exec(`UPDATE chargers SET notes = ? WHERE id = ?`,
			fmt.Sprintf("ðŸ”´ Connection failed: %v", err),
			conn.ChargerID)
		
		conn.logToDatabase("Loxone Charger Connection Failed", fmt.Sprintf("Charger '%s': %v", conn.ChargerName, err))
		return
	}

	conn.mu.Lock()
	conn.ws = ws
	conn.mu.Unlock()

	log.Printf("âœ… WebSocket connected successfully")
	log.Printf("Step 2: Starting token-based authentication")

	if err := conn.authenticateWithToken(); err != nil {
		errMsg := fmt.Sprintf("Authentication failed: %v", err)
		log.Printf("âŒ %s", errMsg)
		ws.Close()
		conn.mu.Lock()
		conn.isConnected = false
		conn.lastError = errMsg
		conn.mu.Unlock()

		db.Exec(`UPDATE chargers SET notes = ? WHERE id = ?`,
			fmt.Sprintf("ðŸ”´ Auth failed: %v", err),
			conn.ChargerID)
		
		conn.logToDatabase("Loxone Charger Auth Failed", fmt.Sprintf("Charger '%s': %v", conn.ChargerName, err))
		return
	}

	conn.mu.Lock()
	conn.isConnected = true
	conn.lastError = ""
	conn.mu.Unlock()

	log.Println("â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—")
	log.Printf("â•‘ âœ… CHARGER CONNECTION ESTABLISHED!â•‘")
	log.Printf("â•‘ Charger: %-23sâ•‘", conn.ChargerName)
	log.Println("â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•")

	db.Exec(`UPDATE chargers SET notes = ? WHERE id = ?`,
		fmt.Sprintf("ðŸŸ¢ Connected at %s", time.Now().Format("2006-01-02 15:04:05")),
		conn.ChargerID)
	
	conn.logToDatabase("Loxone Charger Connected", fmt.Sprintf("Charger '%s' connected successfully", conn.ChargerName))

	log.Printf("ðŸŽ§ Starting data listener for charger %s...", conn.ChargerName)
	go conn.readChargerLoop(db)

	log.Printf("â° Starting data request scheduler for charger %s...", conn.ChargerName)
	go conn.requestChargerData()

	log.Printf("ðŸ”‘ Starting token expiry monitor for charger %s...", conn.ChargerName)
	go conn.monitorTokenExpiry(db)
}

func (conn *LoxoneConnection) authenticateWithToken() error {
	log.Printf("ðŸ” TOKEN AUTHENTICATION - Step 1: Request key exchange")
	log.Printf("   Using Loxone API v2 (getkey2)")

	getKeyCmd := fmt.Sprintf("jdev/sys/getkey2/%s", conn.Username)
	log.Printf("   â†’ Sending: %s", getKeyCmd)

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

	log.Printf("   â† Received key response (type %d)", msgType)

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

	log.Printf("   â† Response code: %s", keyResp.LL.Code)

	if keyResp.LL.Code != "200" {
		return fmt.Errorf("getkey2 failed with code: %s", keyResp.LL.Code)
	}

	keyData := keyResp.LL.Value

	log.Printf("   âœ… Received key: %s...", keyData.Key[:min(len(keyData.Key), 16)])
	log.Printf("   âœ… Received salt: %s...", keyData.Salt[:min(len(keyData.Salt), 16)])
	log.Printf("   âœ… Hash algorithm: %s", keyData.HashAlg)

	log.Printf("ðŸ” TOKEN AUTHENTICATION - Step 2: Hash password with salt")

	pwSaltStr := conn.Password + ":" + keyData.Salt
	var pwHashHex string

	switch strings.ToUpper(keyData.HashAlg) {
	case "SHA256":
		pwHash := sha256.Sum256([]byte(pwSaltStr))
		pwHashHex = strings.ToUpper(hex.EncodeToString(pwHash[:]))
		log.Printf("   âœ… Using SHA256 for password hash")
	case "SHA1":
		pwHash := sha1.Sum([]byte(pwSaltStr))
		pwHashHex = strings.ToUpper(hex.EncodeToString(pwHash[:]))
		log.Printf("   âœ… Using SHA1 for password hash")
	default:
		return fmt.Errorf("unsupported hash algorithm: %s", keyData.HashAlg)
	}

	log.Printf("   âœ… Password hashed with salt")

	log.Printf("ðŸ” TOKEN AUTHENTICATION - Step 3: Create HMAC token")

	keyBytes, err := hex.DecodeString(keyData.Key)
	if err != nil {
		return fmt.Errorf("failed to decode key: %v", err)
	}

	hmacMessage := conn.Username + ":" + pwHashHex
	h := hmac.New(sha1.New, keyBytes)
	h.Write([]byte(hmacMessage))
	hmacHash := hex.EncodeToString(h.Sum(nil))

	log.Printf("   âœ… HMAC created")

	log.Printf("ðŸ” TOKEN AUTHENTICATION - Step 4: Request authentication token")

	uuid := "zev-billing-system"
	info := "ZEV-Billing"
	permission := "2"

	getTokenCmd := fmt.Sprintf("jdev/sys/gettoken/%s/%s/%s/%s/%s",
		hmacHash, conn.Username, permission, uuid, info)

	log.Printf("   â†’ Sending token request")

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

	log.Printf("   â† Received token response (type %d)", msgType)

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

	log.Printf("   â† Response code: %s", tokenResp.LL.Code)

	if tokenResp.LL.Code != "200" {
		return fmt.Errorf("gettoken failed with code: %s", tokenResp.LL.Code)
	}

	tokenData := tokenResp.LL.Value

	log.Printf("   âœ… Token received: %s...", tokenData.Token[:min(len(tokenData.Token), 16)])

	tokenValidTime := loxoneEpoch.Add(time.Duration(tokenData.ValidUntil) * time.Second)
	
	log.Printf("   âœ… Valid until: %v", tokenValidTime.Format("2006-01-02 15:04:05"))
	log.Printf("   âœ… Raw validUntil: %d seconds since 2009-01-01", tokenData.ValidUntil)

	conn.mu.Lock()
	conn.token = tokenData.Token
	conn.tokenValid = tokenValidTime
	conn.mu.Unlock()

	log.Printf("   âœ… AUTHENTICATION SUCCESSFUL!")
	log.Printf("   Token valid for: %.1f hours", time.Until(tokenValidTime).Hours())

	return nil
}

func (conn *LoxoneChargerConnection) authenticateWithToken() error {
	log.Printf("ðŸ” TOKEN AUTHENTICATION - Step 1: Request key exchange")
	log.Printf("   Using Loxone API v2 (getkey2)")

	getKeyCmd := fmt.Sprintf("jdev/sys/getkey2/%s", conn.Username)
	log.Printf("   â†’ Sending: %s", getKeyCmd)

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

	log.Printf("   â† Received key response (type %d)", msgType)

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

	keyBytes, err := hex.DecodeString(keyData.Key)
	if err != nil {
		return fmt.Errorf("failed to decode key: %v", err)
	}

	hmacMessage := conn.Username + ":" + pwHashHex
	h := hmac.New(sha1.New, keyBytes)
	h.Write([]byte(hmacMessage))
	hmacHash := hex.EncodeToString(h.Sum(nil))

	uuid := "zev-billing-charger"
	info := "ZEV-Billing-Charger"
	permission := "2"

	getTokenCmd := fmt.Sprintf("jdev/sys/gettoken/%s/%s/%s/%s/%s",
		hmacHash, conn.Username, permission, uuid, info)

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

	if tokenResp.LL.Code != "200" {
		return fmt.Errorf("gettoken failed with code: %s", tokenResp.LL.Code)
	}

	tokenData := tokenResp.LL.Value
	tokenValidTime := loxoneEpoch.Add(time.Duration(tokenData.ValidUntil) * time.Second)

	conn.mu.Lock()
	conn.token = tokenData.Token
	conn.tokenValid = tokenValidTime
	conn.mu.Unlock()

	log.Printf("   âœ… AUTHENTICATION SUCCESSFUL!")
	log.Printf("   Token valid for: %.1f hours", time.Until(tokenValidTime).Hours())

	return nil
}

// extractJSON extracts JSON data from Loxone message
func (conn *LoxoneConnection) extractJSON(message []byte) []byte {
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

func (conn *LoxoneChargerConnection) extractJSON(message []byte) []byte {
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

func (conn *LoxoneConnection) refreshToken() error {
	log.Printf("ðŸ”„ TOKEN REFRESH - Starting refresh for %s", conn.MeterName)
	conn.mu.Lock()
	if conn.ws == nil {
		conn.mu.Unlock()
		return fmt.Errorf("WebSocket not connected")
	}
	
	getKeyCmd := fmt.Sprintf("jdev/sys/getkey2/%s", conn.Username)
	if err := conn.ws.WriteMessage(websocket.TextMessage, []byte(getKeyCmd)); err != nil {
		conn.mu.Unlock()
		return fmt.Errorf("failed to request key: %v", err)
	}
	conn.mu.Unlock()
	
	_, jsonData, err := conn.readLoxoneMessage()
	if err != nil {
		return fmt.Errorf("failed to read key response: %v", err)
	}
	if jsonData == nil {
		return fmt.Errorf("no JSON data in key response")
	}
	
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
	
	keyBytes, err := hex.DecodeString(keyData.Key)
	if err != nil {
		return fmt.Errorf("failed to decode key: %v", err)
	}
	
	hmacMessage := conn.Username + ":" + pwHashHex
	h := hmac.New(sha1.New, keyBytes)
	h.Write([]byte(hmacMessage))
	hmacHash := hex.EncodeToString(h.Sum(nil))
	
	refreshTokenCmd := fmt.Sprintf("jdev/sys/refreshtoken/%s/%s", hmacHash, conn.Username)
	
	conn.mu.Lock()
	if err := conn.ws.WriteMessage(websocket.TextMessage, []byte(refreshTokenCmd)); err != nil {
		conn.mu.Unlock()
		return fmt.Errorf("failed to request token refresh: %v", err)
	}
	conn.mu.Unlock()
	
	_, jsonData, err = conn.readLoxoneMessage()
	if err != nil {
		return fmt.Errorf("failed to read token refresh response: %v", err)
	}
	if jsonData == nil {
		return fmt.Errorf("no JSON data in token refresh response")
	}
	
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
	newTokenValidTime := loxoneEpoch.Add(time.Duration(tokenData.ValidUntil) * time.Second)
	
	conn.mu.Lock()
	oldValidTime := conn.tokenValid
	conn.token = tokenData.Token
	conn.tokenValid = newTokenValidTime
	conn.mu.Unlock()
	
	log.Printf("   âœ… TOKEN REFRESHED SUCCESSFULLY!")
	log.Printf("   Old expiry: %s", oldValidTime.Format("2006-01-02 15:04:05"))
	log.Printf("   New expiry: %s", newTokenValidTime.Format("2006-01-02 15:04:05"))
	
	conn.logToDatabase("Loxone Token Refreshed", fmt.Sprintf("Meter '%s' token refreshed successfully", conn.MeterName))
	return nil
}

func (conn *LoxoneChargerConnection) refreshToken() error {
	log.Printf("ðŸ”„ TOKEN REFRESH - Starting refresh for charger %s", conn.ChargerName)
	conn.mu.Lock()
	if conn.ws == nil {
		conn.mu.Unlock()
		return fmt.Errorf("WebSocket not connected")
	}
	
	getKeyCmd := fmt.Sprintf("jdev/sys/getkey2/%s", conn.Username)
	if err := conn.ws.WriteMessage(websocket.TextMessage, []byte(getKeyCmd)); err != nil {
		conn.mu.Unlock()
		return fmt.Errorf("failed to request key: %v", err)
	}
	conn.mu.Unlock()
	
	_, jsonData, err := conn.readLoxoneMessage()
	if err != nil {
		return fmt.Errorf("failed to read key response: %v", err)
	}
	if jsonData == nil {
		return fmt.Errorf("no JSON data in key response")
	}
	
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
	
	keyBytes, err := hex.DecodeString(keyData.Key)
	if err != nil {
		return fmt.Errorf("failed to decode key: %v", err)
	}
	
	hmacMessage := conn.Username + ":" + pwHashHex
	h := hmac.New(sha1.New, keyBytes)
	h.Write([]byte(hmacMessage))
	hmacHash := hex.EncodeToString(h.Sum(nil))
	
	refreshTokenCmd := fmt.Sprintf("jdev/sys/refreshtoken/%s/%s", hmacHash, conn.Username)
	
	conn.mu.Lock()
	if err := conn.ws.WriteMessage(websocket.TextMessage, []byte(refreshTokenCmd)); err != nil {
		conn.mu.Unlock()
		return fmt.Errorf("failed to request token refresh: %v", err)
	}
	conn.mu.Unlock()
	
	_, jsonData, err = conn.readLoxoneMessage()
	if err != nil {
		return fmt.Errorf("failed to read token refresh response: %v", err)
	}
	if jsonData == nil {
		return fmt.Errorf("no JSON data in token refresh response")
	}
	
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
	newTokenValidTime := loxoneEpoch.Add(time.Duration(tokenData.ValidUntil) * time.Second)
	
	conn.mu.Lock()
	oldValidTime := conn.tokenValid
	conn.token = tokenData.Token
	conn.tokenValid = newTokenValidTime
	conn.mu.Unlock()
	
	log.Printf("   âœ… TOKEN REFRESHED SUCCESSFULLY!")
	log.Printf("   Old expiry: %s", oldValidTime.Format("2006-01-02 15:04:05"))
	log.Printf("   New expiry: %s", newTokenValidTime.Format("2006-01-02 15:04:05"))
	
	conn.logToDatabase("Loxone Charger Token Refreshed", fmt.Sprintf("Charger '%s' token refreshed successfully", conn.ChargerName))
	return nil
}

func (conn *LoxoneConnection) monitorTokenExpiry(db *sql.DB) {
	log.Printf("ðŸ”‘ TOKEN MONITOR STARTED for %s", conn.MeterName)
	ticker := time.NewTicker(10 * time.Minute)
	defer ticker.Stop()
	
	for {
		select {
		case <-conn.stopChan:
			log.Printf("ðŸ›‘ [%s] Token monitor stopping", conn.MeterName)
			return
		case <-ticker.C:
			conn.mu.Lock()
			isConnected := conn.isConnected
			tokenValid := conn.tokenValid
			conn.mu.Unlock()
			
			if !isConnected {
				log.Printf("âš ï¸ [%s] Not connected, token monitor stopping", conn.MeterName)
				return
			}
			
			timeUntilExpiry := time.Until(tokenValid)
			if timeUntilExpiry < 1*time.Hour {
				log.Printf("âš ï¸ [%s] Token expiring in %.1f minutes, refreshing...", 
					conn.MeterName, timeUntilExpiry.Minutes())
				
				if err := conn.refreshToken(); err != nil {
					log.Printf("âŒ [%s] Failed to refresh token: %v", conn.MeterName, err)
					conn.mu.Lock()
					conn.isConnected = false
					conn.lastError = fmt.Sprintf("Token refresh failed: %v", err)
					if conn.ws != nil {
						conn.ws.Close()
					}
					conn.mu.Unlock()
					db.Exec(`UPDATE meters SET notes = ? WHERE id = ?`,
						fmt.Sprintf("ðŸ”„ Token refresh failed, reconnecting..."),
						conn.MeterID)
					return
				}
				
				db.Exec(`UPDATE meters SET notes = ? WHERE id = ?`,
					fmt.Sprintf("ðŸŸ¢ Token refreshed at %s", time.Now().Format("2006-01-02 15:04:05")),
					conn.MeterID)
			}
		}
	}
}

func (conn *LoxoneChargerConnection) monitorTokenExpiry(db *sql.DB) {
	log.Printf("ðŸ”‘ TOKEN MONITOR STARTED for charger %s", conn.ChargerName)
	ticker := time.NewTicker(10 * time.Minute)
	defer ticker.Stop()
	
	for {
		select {
		case <-conn.stopChan:
			log.Printf("ðŸ›‘ [%s] Token monitor stopping", conn.ChargerName)
			return
		case <-ticker.C:
			conn.mu.Lock()
			isConnected := conn.isConnected
			tokenValid := conn.tokenValid
			conn.mu.Unlock()
			
			if !isConnected {
				log.Printf("âš ï¸ [%s] Not connected, token monitor stopping", conn.ChargerName)
				return
			}
			
			timeUntilExpiry := time.Until(tokenValid)
			if timeUntilExpiry < 1*time.Hour {
				log.Printf("âš ï¸ [%s] Token expiring in %.1f minutes, refreshing...", 
					conn.ChargerName, timeUntilExpiry.Minutes())
				
				if err := conn.refreshToken(); err != nil {
					log.Printf("âŒ [%s] Failed to refresh token: %v", conn.ChargerName, err)
					conn.mu.Lock()
					conn.isConnected = false
					conn.lastError = fmt.Sprintf("Token refresh failed: %v", err)
					if conn.ws != nil {
						conn.ws.Close()
					}
					conn.mu.Unlock()
					db.Exec(`UPDATE chargers SET notes = ? WHERE id = ?`,
						fmt.Sprintf("ðŸ”„ Token refresh failed, reconnecting..."),
						conn.ChargerID)
					return
				}
				
				db.Exec(`UPDATE chargers SET notes = ? WHERE id = ?`,
					fmt.Sprintf("ðŸŸ¢ Token refreshed at %s", time.Now().Format("2006-01-02 15:04:05")),
					conn.ChargerID)
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
	log.Printf("â° DATA REQUEST SCHEDULER STARTED for %s", conn.MeterName)
	log.Printf("   Collection interval: 15 minutes (at :00, :15, :30, :45)")

	for {
		now := time.Now()
		next := getNextQuarterHour(now)
		waitDuration := next.Sub(now)

		log.Printf("ðŸ“… [%s] Next data request scheduled for %s (in %.0f seconds)",
			conn.MeterName, next.Format("15:04:05"), waitDuration.Seconds())

		time.Sleep(waitDuration)

		conn.mu.Lock()
		if !conn.isConnected || conn.ws == nil {
			log.Printf("âš ï¸ [%s] Not connected, skipping data request", conn.MeterName)
			conn.mu.Unlock()
			return
		}

		cmd := fmt.Sprintf("jdev/sps/io/%s/all", conn.DeviceID)
		log.Println("â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€")
		log.Printf("ðŸ“¡ [%s] REQUESTING DATA", conn.MeterName)
		log.Printf("   Command: %s", cmd)
		log.Printf("   Time: %s", time.Now().Format("15:04:05"))

		if err := conn.ws.WriteMessage(websocket.TextMessage, []byte(cmd)); err != nil {
			log.Printf("âŒ [%s] Failed to request data: %v", conn.MeterName, err)
			conn.isConnected = false
			conn.lastError = fmt.Sprintf("Data request failed: %v", err)
			conn.logToDatabase("Loxone Data Request Failed", fmt.Sprintf("Meter '%s': %v", conn.MeterName, err))
			conn.mu.Unlock()
			return
		}
		log.Printf("   âœ… Request sent successfully")
		conn.mu.Unlock()
	}
}

func (conn *LoxoneChargerConnection) requestChargerData() {
	log.Printf("â° DATA REQUEST SCHEDULER STARTED for charger %s", conn.ChargerName)
	log.Printf("   Collection interval: 15 minutes (at :00, :15, :30, :45)")

	for {
		now := time.Now()
		next := getNextQuarterHour(now)
		waitDuration := next.Sub(now)

		log.Printf("ðŸ“… [%s] Next data request scheduled for %s (in %.0f seconds)",
			conn.ChargerName, next.Format("15:04:05"), waitDuration.Seconds())

		time.Sleep(waitDuration)

		conn.mu.Lock()
		if !conn.isConnected || conn.ws == nil {
			log.Printf("âš ï¸ [%s] Not connected, skipping data request", conn.ChargerName)
			conn.mu.Unlock()
			return
		}

		// Request all 4 UUIDs
		uuids := []string{conn.PowerUUID, conn.StateUUID, conn.UserIDUUID, conn.ModeUUID}
		log.Println("â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€")
		log.Printf("ðŸ“¡ [%s] REQUESTING CHARGER DATA", conn.ChargerName)
		log.Printf("   Time: %s", time.Now().Format("15:04:05"))

		for _, uuid := range uuids {
			cmd := fmt.Sprintf("jdev/sps/io/%s/all", uuid)
			log.Printf("   â†’ Requesting: %s", uuid)
			
			if err := conn.ws.WriteMessage(websocket.TextMessage, []byte(cmd)); err != nil {
				log.Printf("âŒ [%s] Failed to request data for UUID %s: %v", conn.ChargerName, uuid, err)
				conn.isConnected = false
				conn.lastError = fmt.Sprintf("Data request failed: %v", err)
				conn.logToDatabase("Loxone Charger Data Request Failed", 
					fmt.Sprintf("Charger '%s': %v", conn.ChargerName, err))
				conn.mu.Unlock()
				return
			}
			
			// Small delay between requests
			time.Sleep(100 * time.Millisecond)
		}
		
		log.Printf("   âœ… All requests sent successfully")
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
		log.Printf("ðŸ”´ [%s] DISCONNECTED from Loxone", conn.MeterName)

		db.Exec(`UPDATE meters SET notes = ? WHERE id = ?`,
			fmt.Sprintf("ðŸ”´ Offline since %s", time.Now().Format("2006-01-02 15:04:05")),
			conn.MeterID)
		
		conn.logToDatabase("Loxone Disconnected", fmt.Sprintf("Meter '%s' disconnected", conn.MeterName))
	}()

	log.Printf("ðŸ‘‚ [%s] DATA LISTENER ACTIVE - waiting for messages...", conn.MeterName)

	messageCount := 0

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
				log.Printf("âš ï¸ [%s] Read channel full, dropping message", conn.MeterName)
			}

			if err != nil {
				return
			}
		}
	}()

	for {
		select {
		case <-conn.stopChan:
			log.Printf("ðŸ›‘ [%s] Received stop signal, closing listener", conn.MeterName)
			return

		case result := <-readChan:
			if result.err != nil {
				if strings.Contains(result.err.Error(), "i/o timeout") || strings.Contains(result.err.Error(), "deadline") {
					log.Printf("â±ï¸ [%s] Read timeout (expected between data requests)", conn.MeterName)
					continue
				}

				if strings.Contains(result.err.Error(), "websocket: close") {
					log.Printf("â„¹ï¸ [%s] WebSocket closed normally", conn.MeterName)
				} else {
					log.Printf("âŒ [%s] Read error: %v", conn.MeterName, result.err)
					conn.mu.Lock()
					conn.lastError = fmt.Sprintf("Read error: %v", result.err)
					conn.mu.Unlock()
					conn.logToDatabase("Loxone Read Error", fmt.Sprintf("Meter '%s': %v", conn.MeterName, result.err))
				}
				return
			}

			if result.jsonData == nil {
				log.Printf("   â„¹ï¸ [%s] Binary message (type %d) - skipping", conn.MeterName, result.msgType)
				continue
			}

			messageCount++
			log.Printf("ðŸ“¨ [%s] Received message #%d (type %d)", conn.MeterName, messageCount, result.msgType)

			var response LoxoneResponse
			if err := json.Unmarshal(result.jsonData, &response); err != nil {
				log.Printf("âš ï¸ [%s] Failed to parse JSON response: %v", conn.MeterName, err)
				continue
			}

			expectedControl := fmt.Sprintf("dev/sps/io/%s/all", conn.DeviceID)
			if !strings.Contains(response.LL.Control, expectedControl) {
				log.Printf("   â†’ Not a device response, ignoring")
				continue
			}

			log.Printf("   âœ… This is a device data response!")

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
					conn.mu.Lock()
					conn.lastReading = reading
					conn.lastUpdate = time.Now()
					conn.mu.Unlock()

					currentTime := roundToQuarterHour(time.Now())

					log.Println("â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€")
					log.Printf("âœ… [%s] READING RECEIVED!", conn.MeterName)
					log.Printf("   Value: %.3f kWh", reading)
					log.Printf("   Timestamp: %s", currentTime.Format("2006-01-02 15:04:05"))

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
						interpolated := interpolateReadings(lastTime, lastReading, currentTime, reading)

						if len(interpolated) > 0 {
							log.Printf("   ðŸ“Š Interpolating %d missing intervals", len(interpolated))
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
						
						consumption = reading - lastReading
						if consumption < 0 {
							consumption = 0
						}
					} else {
						log.Printf("   â†’ First reading for this meter - consumption set to 0")
						consumption = 0
						isFirstReading = true
					}

					log.Printf("   Current consumption: %.3f kWh", consumption)

					_, err = db.Exec(`
						INSERT INTO meter_readings (meter_id, reading_time, power_kwh, consumption_kwh)
						VALUES (?, ?, ?, ?)
					`, conn.MeterID, currentTime, reading, consumption)

					if err != nil {
						log.Printf("âŒ Failed to save reading to database: %v", err)
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
							fmt.Sprintf("ðŸŸ¢ Last update: %s", time.Now().Format("2006-01-02 15:04:05")),
							conn.MeterID)

						log.Printf("   âœ… Saved to database successfully")
						
						if isFirstReading {
							conn.logToDatabase("Loxone First Reading", 
								fmt.Sprintf("Meter '%s' first reading: %.3f kWh", conn.MeterName, reading))
						}
					}
					log.Println("â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€")
				}
			}
		}
	}
}

func (conn *LoxoneChargerConnection) readChargerLoop(db *sql.DB) {
	defer func() {
		conn.mu.Lock()
		if conn.ws != nil {
			conn.ws.Close()
		}
		conn.isConnected = false
		conn.mu.Unlock()
		log.Printf("ðŸ”´ [%s] DISCONNECTED from Loxone", conn.ChargerName)

		db.Exec(`UPDATE chargers SET notes = ? WHERE id = ?`,
			fmt.Sprintf("ðŸ”´ Offline since %s", time.Now().Format("2006-01-02 15:04:05")),
			conn.ChargerID)
		
		conn.logToDatabase("Loxone Charger Disconnected", fmt.Sprintf("Charger '%s' disconnected", conn.ChargerName))
	}()

	log.Printf("ðŸ‘‚ [%s] CHARGER DATA LISTENER ACTIVE - waiting for messages...", conn.ChargerName)

	messageCount := 0

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
				log.Printf("âš ï¸ [%s] Read channel full, dropping message", conn.ChargerName)
			}

			if err != nil {
				return
			}
		}
	}()

	// Temporary storage for collected values
	var tempPower *float64
	var tempState *string
	var tempUserID *string
	var tempMode *string
	collectionStartTime := time.Now()

	for {
		select {
		case <-conn.stopChan:
			log.Printf("ðŸ›‘ [%s] Received stop signal, closing listener", conn.ChargerName)
			return

		case result := <-readChan:
			if result.err != nil {
				if strings.Contains(result.err.Error(), "i/o timeout") || strings.Contains(result.err.Error(), "deadline") {
					log.Printf("â±ï¸ [%s] Read timeout (expected between data requests)", conn.ChargerName)
					continue
				}

				if strings.Contains(result.err.Error(), "websocket: close") {
					log.Printf("â„¹ï¸ [%s] WebSocket closed normally", conn.ChargerName)
				} else {
					log.Printf("âŒ [%s] Read error: %v", conn.ChargerName, result.err)
					conn.mu.Lock()
					conn.lastError = fmt.Sprintf("Read error: %v", result.err)
					conn.mu.Unlock()
				}
				return
			}

			if result.jsonData == nil {
				continue
			}

			messageCount++

			var response LoxoneResponse
			if err := json.Unmarshal(result.jsonData, &response); err != nil {
				continue
			}

			// Check which UUID this response is for
			uuidMatched := false
			var matchedUUID string

			if strings.Contains(response.LL.Control, conn.PowerUUID) {
				matchedUUID = "power"
				uuidMatched = true
			} else if strings.Contains(response.LL.Control, conn.StateUUID) {
				matchedUUID = "state"
				uuidMatched = true
			} else if strings.Contains(response.LL.Control, conn.UserIDUUID) {
				matchedUUID = "user_id"
				uuidMatched = true
			} else if strings.Contains(response.LL.Control, conn.ModeUUID) {
				matchedUUID = "mode"
				uuidMatched = true
			}

			if !uuidMatched {
				continue
			}

			// Extract value from output1
			if output1, ok := response.LL.Outputs["output1"]; ok {
				switch matchedUUID {
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
					tempPower = &power
					log.Printf("   ðŸ“Š [%s] Power value received: %.4f kWh", conn.ChargerName, power)

				case "state":
					var state string
					switch v := output1.Value.(type) {
					case string:
						state = v
					case float64:
						state = fmt.Sprintf("%.0f", v)
					}
					tempState = &state
					log.Printf("   ðŸ”Œ [%s] State value received: %s", conn.ChargerName, state)

				case "user_id":
					var userID string
					switch v := output1.Value.(type) {
					case string:
						userID = v
					case float64:
						userID = fmt.Sprintf("%.0f", v)
					}
					tempUserID = &userID
					log.Printf("   ðŸ‘¤ [%s] User ID received: %s", conn.ChargerName, userID)

				case "mode":
					var mode string
					switch v := output1.Value.(type) {
					case string:
						mode = v
					case float64:
						mode = fmt.Sprintf("%.0f", v)
					}
					tempMode = &mode
					log.Printf("   âš™ï¸ [%s] Mode value received: %s", conn.ChargerName, mode)
				}
			}

			// Check if we have all 4 values OR if timeout (5 seconds since collection started)
			hasAllValues := tempPower != nil && tempState != nil && tempUserID != nil && tempMode != nil
			timeout := time.Since(collectionStartTime) > 5*time.Second

			if hasAllValues || (timeout && (tempPower != nil || tempState != nil || tempUserID != nil || tempMode != nil)) {
				currentTime := roundToQuarterHour(time.Now())

				// Use default values if missing
				power := 0.0
				if tempPower != nil {
					power = *tempPower
				}
				state := "unknown"
				if tempState != nil {
					state = *tempState
				}
				userID := "unknown"
				if tempUserID != nil {
					userID = *tempUserID
				}
				mode := "unknown"
				if tempMode != nil {
					mode = *tempMode
				}

				log.Println("â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€")
				log.Printf("âœ… [%s] CHARGER DATA COMPLETE!", conn.ChargerName)
				log.Printf("   Power: %.4f kWh", power)
				log.Printf("   State: %s", state)
				log.Printf("   User ID: %s", userID)
				log.Printf("   Mode: %s", mode)
				log.Printf("   Timestamp: %s", currentTime.Format("2006-01-02 15:04:05"))

				conn.mu.Lock()
				conn.lastPower = power
				conn.lastState = state
				conn.lastUserID = userID
				conn.lastMode = mode
				conn.lastUpdate = time.Now()
				conn.mu.Unlock()

				// Save to database
				_, err := db.Exec(`
					INSERT INTO charger_sessions (charger_id, user_id, session_time, power_kwh, mode, state)
					VALUES (?, ?, ?, ?, ?, ?)
				`, conn.ChargerID, userID, currentTime, power, mode, state)

				if err != nil {
					log.Printf("âŒ Failed to save charger session: %v", err)
					conn.mu.Lock()
					conn.lastError = fmt.Sprintf("DB save failed: %v", err)
					conn.mu.Unlock()
				} else {
					db.Exec(`
						UPDATE chargers 
						SET notes = ?
						WHERE id = ?
					`, fmt.Sprintf("ðŸŸ¢ Last update: %s", time.Now().Format("2006-01-02 15:04:05")),
						conn.ChargerID)

					log.Printf("   âœ… Saved to database successfully")
				}
				log.Println("â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€")

				// Reset temporary values
				tempPower = nil
				tempState = nil
				tempUserID = nil
				tempMode = nil
				collectionStartTime = time.Now()
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

func (conn *LoxoneChargerConnection) logToDatabase(action, details string) {
	if conn.db != nil {
		conn.db.Exec(`
			INSERT INTO admin_logs (action, details, ip_address)
			VALUES (?, ?, ?)
		`, action, details, fmt.Sprintf("loxone-charger-%s", conn.Host))
	}
}

func (conn *LoxoneConnection) IsConnected() bool {
	conn.mu.Lock()
	defer conn.mu.Unlock()
	return conn.isConnected
}

func (conn *LoxoneChargerConnection) IsConnected() bool {
	conn.mu.Lock()
	defer conn.mu.Unlock()
	return conn.isConnected
}

func (conn *LoxoneConnection) Close() {
	log.Printf("ðŸ›‘ Closing meter connection for %s (ID: %d)", conn.MeterName, conn.MeterID)
	conn.mu.Lock()
	defer conn.mu.Unlock()

	close(conn.stopChan)
	if conn.ws != nil {
		conn.ws.Close()
		conn.ws = nil
	}
	conn.isConnected = false
	log.Printf("   âœ… Connection closed")
	
	conn.logToDatabase("Loxone Meter Connection Closed", fmt.Sprintf("Meter '%s' connection closed", conn.MeterName))
}

func (conn *LoxoneChargerConnection) Close() {
	log.Printf("ðŸ›‘ Closing charger connection for %s (ID: %d)", conn.ChargerName, conn.ChargerID)
	conn.mu.Lock()
	defer conn.mu.Unlock()

	close(conn.stopChan)
	if conn.ws != nil {
		conn.ws.Close()
		conn.ws = nil
	}
	conn.isConnected = false
	log.Printf("   âœ… Connection closed")
	
	conn.logToDatabase("Loxone Charger Connection Closed", fmt.Sprintf("Charger '%s' connection closed", conn.ChargerName))
}