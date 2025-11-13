package services

import (
	"crypto/hmac"
	"crypto/sha1"
	"crypto/sha256"
	"crypto/tls"
	"database/sql"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"math/rand"
	"net/http"
	"net/url"
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

	stopChan       chan bool
	goroutinesWg   sync.WaitGroup
	isReconnecting bool
	isShuttingDown bool // NEW: Flag to prevent reconnection during shutdown
	mu             sync.Mutex
	db             *sql.DB
}

type LoxoneDevice struct {
	ID       int
	Name     string
	Type     string
	DeviceID string

	// FOR METERS - these fields support multiple modes:
	// - meter_block: For total/solar meters (output1=Mrc import, output8=Mrd export)
	// - energy_meter_block: For apartment/heating/other (output1=Mr, single value)
	// - virtual_output_dual: Two UUIDs for import/export (total/solar meters)
	// - virtual_output_single: One UUID for single value (apartment/heating/other)
	LoxoneMode     string // "meter_block", "energy_meter_block", "virtual_output_dual", "virtual_output_single"
	ExportDeviceID string // For virtual_output_dual mode only

	// FOR CHARGERS - existing fields:
	PowerUUID  string
	StateUUID  string
	UserIDUUID string
	ModeUUID   string

	lastReading       float64
	lastReadingExport float64 // ADD THIS
	lastUpdate        time.Time
	readingGaps       int
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
	LoxoneMsgTypeDaytimerEvent = 4
	LoxoneMsgTypeOutOfService  = 5
	LoxoneMsgTypeKeepalive     = 6
	LoxoneMsgTypeWeather       = 7
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
	log.Println("ðŸ”§ LOXONE COLLECTOR: Initializing with enhanced auth health management")
	lc := &LoxoneCollector{
		db:          db,
		connections: make(map[string]*LoxoneWebSocketConnection),
	}
	log.Println("ðŸ”§ LOXONE COLLECTOR: Instance created successfully")
	return lc
}

func (lc *LoxoneCollector) Start() {
	log.Println("===================================")
	log.Println("ðŸš€ LOXONE WEBSOCKET COLLECTOR STARTING")
	log.Println("   Features: Auth health checks, exponential backoff, metrics, keepalive")
	log.Println("===================================")

	lc.logToDatabase("Loxone Collector Started", "Enhanced version with robust auth management and keepalive")

	lc.initializeConnections()

	log.Printf("âœ… Loxone Collector initialized with %d WebSocket connections", len(lc.connections))
	lc.logToDatabase("Loxone Collector Ready", fmt.Sprintf("Initialized %d Loxone connections", len(lc.connections)))

	go lc.monitorConnections()

	log.Println("âœ… Loxone connection monitor started")
	log.Println("===================================")
}

func (lc *LoxoneCollector) Stop() {
	log.Println("ðŸ›‘ STOPPING ALL LOXONE CONNECTIONS")
	lc.logToDatabase("Loxone Collector Stopping", "Closing all Loxone connections")

	lc.mu.Lock()
	connections := make([]*LoxoneWebSocketConnection, 0, len(lc.connections))
	for _, conn := range lc.connections {
		connections = append(connections, conn)
	}
	lc.mu.Unlock()

	// Close all connections and wait for them to finish
	for _, conn := range connections {
		log.Printf("Closing connection: %s", conn.Host)
		conn.Close()
	}

	// Clear the connections map
	lc.mu.Lock()
	lc.connections = make(map[string]*LoxoneWebSocketConnection)
	lc.mu.Unlock()

	log.Println("âœ… All Loxone connections stopped")
	lc.logToDatabase("Loxone Collector Stopped", "All connections closed")
}

func (lc *LoxoneCollector) RestartConnections() {
	log.Println("=== RESTARTING LOXONE CONNECTIONS ===")
	lc.logToDatabase("Loxone Connections Restarting", "Reinitializing all Loxone connections")

	// Stop all existing connections and wait for them to fully close
	lc.Stop()

	// Wait longer to ensure all goroutines have fully stopped
	log.Println("Waiting for all connections to fully close...")
	time.Sleep(2 * time.Second)

	// Now create new connections
	lc.initializeConnections()

	log.Println("=== LOXONE CONNECTIONS RESTARTED ===")
	lc.logToDatabase("Loxone Connections Restarted", fmt.Sprintf("Successfully restarted %d connections", len(lc.connections)))
}

func (lc *LoxoneCollector) initializeConnections() {
	log.Println("ðŸ” SCANNING DATABASE FOR LOXONE API DEVICES...")

	connectionDevices := make(map[string]*LoxoneWebSocketConnection)

	// Load meters
	meterRows, err := lc.db.Query(`
		SELECT id, name, connection_config
		FROM meters 
		WHERE is_active = 1 AND connection_type = 'loxone_api'
	`)
	if err != nil {
		log.Printf("âŒ ERROR: Failed to query Loxone meters: %v", err)
		lc.logToDatabase("Loxone Query Error", fmt.Sprintf("Failed to query meters: %v", err))
	} else {
		defer meterRows.Close()

		meterCount := 0
		for meterRows.Next() {
			var id int
			var name, connectionConfig string

			if err := meterRows.Scan(&id, &name, &connectionConfig); err != nil {
				log.Printf("âŒ ERROR: Failed to scan meter row: %v", err)
				continue
			}

			meterCount++
			log.Println("â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€")
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
			macAddress, _ := config["loxone_mac_address"].(string)
			connectionMode, _ := config["loxone_connection_mode"].(string)
			username, _ := config["loxone_username"].(string)
			password, _ := config["loxone_password"].(string)
			deviceID, _ := config["loxone_device_id"].(string)
			loxoneMode, _ := config["loxone_mode"].(string)
			exportDeviceID, _ := config["loxone_export_device_id"].(string)

			// Get meter type from database to set appropriate default mode
			var meterType string
			lc.db.QueryRow("SELECT meter_type FROM meters WHERE id = ?", id).Scan(&meterType)

			// Default mode based on meter type
			if loxoneMode == "" {
				if meterType == "total_meter" || meterType == "solar_meter" {
					loxoneMode = "meter_block"
				} else {
					loxoneMode = "energy_meter_block"
				}
			}

			log.Printf("   â”œâ”€ Connection Mode: %s", connectionMode)
			if connectionMode == "remote" {
				log.Printf("   â”œâ”€ MAC Address: %s", macAddress)
			} else {
				log.Printf("   â”œâ”€ Host: %s", host)
			}
			log.Printf("   â”œâ”€ Username: %s", username)
			log.Printf("   â”œâ”€ Meter Type: %s", meterType) // âœ… Add this log line
			log.Printf("   â”œâ”€ Mode: %s", loxoneMode)
			log.Printf("   â”œâ”€ Device UUID: %s", deviceID)
			if (loxoneMode == "virtual_output_dual") && exportDeviceID != "" {
				log.Printf("   â””â”€ Export UUID: %s", exportDeviceID)
			} else if loxoneMode == "meter_block" {
				log.Printf("   â””â”€ (Meter block: output1=Mrc, output8=Mrd)")
			} else if loxoneMode == "energy_meter_block" {
				log.Printf("   â””â”€ (Energy meter block: output1=Mr)")
			} else {
				log.Printf("   â””â”€ (Virtual output: single value)")
			}

			// Validate configuration based on connection mode
			if connectionMode == "remote" {
				if macAddress == "" || deviceID == "" {
					log.Printf("   âš ï¸  WARNING: Incomplete remote config (missing MAC or device ID) - skipping")
					continue
				}
			} else {
				if host == "" || deviceID == "" {
					log.Printf("   âš ï¸  WARNING: Incomplete local config (missing host or device ID) - skipping")
					continue
				}
			}

			// Create connection key based on mode
			var connKey string
			if connectionMode == "remote" {
				connKey = fmt.Sprintf("remote|%s|%s|%s", macAddress, username, password)
			} else {
				connKey = fmt.Sprintf("local|%s|%s|%s", host, username, password)
			}

			conn, exists := connectionDevices[connKey]
			if !exists {
				// Determine the host URL based on connection mode
				var actualHost string
				if connectionMode == "remote" {
					actualHost = fmt.Sprintf("dns.loxonecloud.com/%s", macAddress)
				} else {
					actualHost = host
				}

				conn = &LoxoneWebSocketConnection{
					Host:             actualHost,
					Username:         username,
					Password:         password,
					devices:          []*LoxoneDevice{},
					stopChan:         make(chan bool),
					db:               lc.db,
					reconnectBackoff: 2 * time.Second,
					maxBackoff:       30 * time.Second,
					isShuttingDown:   false,
				}
				connectionDevices[connKey] = conn
				if connectionMode == "remote" {
					log.Printf("   ðŸŒ Created new REMOTE WebSocket connection via Loxone Cloud DNS")
				} else {
					log.Printf("   ðŸ“¡ Created new LOCAL WebSocket connection for %s", host)
				}
			} else {
				log.Printf("   â™»ï¸  Reusing existing WebSocket connection for %s", host)
			}

			device := &LoxoneDevice{
				ID:             id,
				Name:           name,
				Type:           "meter",
				DeviceID:       deviceID,
				LoxoneMode:     loxoneMode,
				ExportDeviceID: exportDeviceID,
			}
			conn.devices = append(conn.devices, device)
		}

		log.Printf("âœ… Loaded %d Loxone meters", meterCount)
	}

	// Load chargers
	chargerRows, err := lc.db.Query(`
		SELECT id, name, preset, connection_config
		FROM chargers 
		WHERE is_active = 1 AND connection_type = 'loxone_api'
	`)
	if err != nil {
		log.Printf("âŒ ERROR: Failed to query Loxone chargers: %v", err)
		lc.logToDatabase("Loxone Query Error", fmt.Sprintf("Failed to query chargers: %v", err))
	} else {
		defer chargerRows.Close()

		chargerCount := 0
		for chargerRows.Next() {
			var id int
			var name, preset, connectionConfig string

			if err := chargerRows.Scan(&id, &name, &preset, &connectionConfig); err != nil {
				log.Printf("âŒ ERROR: Failed to scan charger row: %v", err)
				continue
			}

			chargerCount++
			log.Println("â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€")
			log.Printf("ðŸ”Œ FOUND LOXONE CHARGER #%d", chargerCount)
			log.Printf("   Name: '%s'", name)
			log.Printf("   ID: %d", id)
			log.Printf("   Preset: %s", preset)

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
			log.Printf("   â”œâ”€ Username: %s", username)
			log.Printf("   â”œâ”€ Power UUID: %s", powerUUID)
			log.Printf("   â”œâ”€ State UUID: %s", stateUUID)
			log.Printf("   â”œâ”€ User ID UUID: %s", userIDUUID)
			log.Printf("   â””â”€ Mode UUID: %s", modeUUID)

			if host == "" || powerUUID == "" || stateUUID == "" || userIDUUID == "" || modeUUID == "" {
				log.Printf("   âš ï¸Â  WARNING: Incomplete config - missing host or UUIDs - skipping")
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
					reconnectBackoff: 2 * time.Second,
					maxBackoff:       30 * time.Second,
					isShuttingDown:   false,
				}
				connectionDevices[connKey] = conn
				log.Printf("   ðŸ“¡ Created new WebSocket connection for %s", host)
			} else {
				log.Printf("   â™»ï¸  Reusing existing WebSocket connection for %s", host)
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

		log.Printf("âœ… Loaded %d Loxone chargers", chargerCount)
	}

	// Start all connections
	lc.mu.Lock()
	for key, conn := range connectionDevices {
		lc.connections[key] = conn
		deviceCount := len(conn.devices)
		log.Println("â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€")
		log.Printf("ðŸš€ STARTING CONNECTION: %s", key)
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
		log.Println("â„¹ï¸  NO LOXONE API DEVICES FOUND IN DATABASE")
		lc.logToDatabase("Loxone No Devices", "No Loxone API devices found in database")
	} else {
		log.Println("â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€")
		log.Printf("âœ… INITIALIZED %d WEBSOCKET CONNECTIONS FOR %d DEVICES",
			len(connectionDevices), totalDevices)
		lc.logToDatabase("Loxone Devices Initialized",
			fmt.Sprintf("Successfully initialized %d connections for %d devices",
				len(connectionDevices), totalDevices))
	}
}

func (lc *LoxoneCollector) monitorConnections() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	log.Println("ðŸ‘€ LOXONE CONNECTION MONITOR STARTED (enhanced with metrics)")

	for range ticker.C {
		lc.mu.RLock()
		disconnectedCount := 0
		connectedCount := 0
		totalDevices := 0
		totalAuthFailures := 0
		totalReconnects := 0

		log.Println("â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€")
		log.Println("ðŸ” LOXONE CONNECTION STATUS CHECK")

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
				log.Printf("   ðŸ”´ Connection %s: DISCONNECTED (%d devices)", key, deviceCount)
				if lastError != "" {
					log.Printf("      Last error: %s", lastError)
				}
				if authFails > 0 {
					log.Printf("      âš ï¸Â  Consecutive auth failures: %d", authFails)
				}
			} else {
				connectedCount++
				log.Printf("   ðŸŸ¢ Connection %s: CONNECTED (%d devices)", key, deviceCount)
				if tokenValid && !tokenExpiry.IsZero() {
					timeUntilExpiry := time.Until(tokenExpiry)
					log.Printf("      Token expires in: %.1f hours", timeUntilExpiry.Hours())
				}
				if totalAuthFails > 0 {
					log.Printf("      ðŸ“Š Lifetime auth failures: %d", totalAuthFails)
				}
				if totalReconn > 0 {
					log.Printf("      ðŸ“Š Lifetime reconnects: %d", totalReconn)
				}
			}
		}
		lc.mu.RUnlock()

		log.Printf("ðŸ“Š Summary: %d connected, %d disconnected, %d total devices",
			connectedCount, disconnectedCount, totalDevices)
		log.Printf("ðŸ“Š Metrics: %d total auth failures, %d total reconnects",
			totalAuthFailures, totalReconnects)
		log.Println("â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€")

		if disconnectedCount > 0 {
			lc.logToDatabase("Loxone Status Check",
				fmt.Sprintf("%d connected, %d disconnected (total failures: %d, reconnects: %d)",
					connectedCount, disconnectedCount, totalAuthFailures, totalReconnects))
		}
	}
}

func (lc *LoxoneCollector) GetConnectionStatus() map[string]interface{} {
	lc.mu.RLock()
	defer lc.mu.RUnlock()

	meterStatus := make(map[int]map[string]interface{})
	chargerStatus := make(map[int]map[string]interface{})

	for _, conn := range lc.connections {
		conn.mu.Lock()
		for _, device := range conn.devices {
			// Format last_update properly, handle zero time
			lastUpdateStr := ""
			if !device.lastUpdate.IsZero() {
				lastUpdateStr = device.lastUpdate.Format("2006-01-02 15:04:05")
			}

			// Format token_expiry properly, handle zero time
			tokenExpiryStr := ""
			if !conn.tokenExpiry.IsZero() {
				tokenExpiryStr = conn.tokenExpiry.Format("2006-01-02 15:04:05")
			}

			// Format last_successful_auth properly, handle zero time
			lastSuccessfulAuthStr := ""
			if !conn.lastSuccessfulAuth.IsZero() {
				lastSuccessfulAuthStr = conn.lastSuccessfulAuth.Format("2006-01-02 15:04:05")
			}

			if device.Type == "meter" {
				meterStatus[device.ID] = map[string]interface{}{
					"device_id":              device.DeviceID,
					"meter_name":             device.Name,
					"host":                   conn.Host,
					"is_connected":           conn.isConnected,
					"token_valid":            conn.tokenValid,
					"token_expiry":           tokenExpiryStr,
					"last_reading":           device.lastReading,
					"last_reading_export":    device.lastReadingExport,
					"last_update":            lastUpdateStr,
					"reading_gaps":           device.readingGaps,
					"last_error":             conn.lastError,
					"consecutive_auth_fails": conn.consecutiveAuthFails,
					"total_auth_failures":    conn.totalAuthFailures,
					"total_reconnects":       conn.totalReconnects,
					"last_successful_auth":   lastSuccessfulAuthStr,
				}
			} else if device.Type == "charger" {
				chargerStatus[device.ID] = map[string]interface{}{
					"power_uuid":             device.PowerUUID,
					"state_uuid":             device.StateUUID,
					"user_id_uuid":           device.UserIDUUID,
					"mode_uuid":              device.ModeUUID,
					"charger_name":           device.Name,
					"host":                   conn.Host,
					"is_connected":           conn.isConnected,
					"token_valid":            conn.tokenValid,
					"token_expiry":           tokenExpiryStr,
					"last_reading":           device.lastReading,
					"last_update":            lastUpdateStr,
					"reading_gaps":           device.readingGaps,
					"last_error":             conn.lastError,
					"consecutive_auth_fails": conn.consecutiveAuthFails,
					"total_auth_failures":    conn.totalAuthFailures,
					"total_reconnects":       conn.totalReconnects,
					"last_successful_auth":   lastSuccessfulAuthStr,
				}
			}
		}
		conn.mu.Unlock()
	}

	return map[string]interface{}{
		"loxone_connections":         meterStatus,
		"loxone_charger_connections": chargerStatus,
	}
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

	// Check if we're connected
	if conn.ws == nil || !conn.isConnected {
		conn.mu.Unlock()
		return fmt.Errorf("not connected")
	}

	// Check token validity with 30-second safety margin
	tokenNeedsRefresh := !conn.tokenValid || time.Now().After(conn.tokenExpiry.Add(-30*time.Second))
	hasToken := conn.token != ""
	tokenStillValid := conn.tokenValid

	if tokenNeedsRefresh {
		// If we have a token AND it's still marked as valid (just expiring soon), try fast refresh first
		if hasToken && tokenStillValid {
			log.Printf("ðŸ”„ [%s] Token expiring soon, attempting fast refresh...", conn.Host)

			// Release lock during token refresh
			conn.mu.Unlock()
			err := conn.refreshToken()

			if err == nil {
				log.Printf("âœ… [%s] Token refresh successful", conn.Host)
				return nil
			}

			log.Printf("âš ï¸Â  [%s] Token refresh failed: %v, falling back to full re-auth", conn.Host, err)
		} else {
			log.Printf("âš ï¸Â  [%s] Token invalid or missing, performing full re-authentication...", conn.Host)
			conn.mu.Unlock()
		}

		// Token refresh failed or token was invalid - do full re-authentication
		err := conn.authenticateWithToken()

		conn.mu.Lock()
		if err != nil {
			conn.tokenValid = false
			conn.consecutiveAuthFails++
			conn.totalAuthFailures++
			conn.lastError = fmt.Sprintf("Auth failed: %v", err)
			conn.mu.Unlock()
			log.Printf("âŒ [%s] Re-authentication failed: %v", conn.Host, err)
			return fmt.Errorf("authentication failed: %v", err)
		}

		log.Printf("âœ… [%s] Re-authentication successful", conn.Host)
		conn.mu.Unlock()
		return nil
	}

	conn.mu.Unlock()
	return nil
}

// refreshToken uses the correct Loxone API to refresh the token
// This replaces the old method that was using jdev/sys/fenc (which is for authentication, not refresh)
func (conn *LoxoneWebSocketConnection) refreshToken() error {
	log.Printf("ðŸ”„ TOKEN REFRESH - Requesting new token with extended lifespan")

	// Use the correct Loxone API command for token refresh (not authentication)
	// According to Loxone documentation page 31: jdev/sys/refreshjwt/{token}/{user}
	// Since version 11.2, the token can be sent in plaintext (no hashing required)
	refreshCmd := fmt.Sprintf("jdev/sys/refreshjwt/%s/%s", conn.token, conn.Username)
	log.Printf("   â†’ Sending: jdev/sys/refreshjwt/***/%s", conn.Username)

	if err := conn.ws.WriteMessage(websocket.TextMessage, []byte(refreshCmd)); err != nil {
		return fmt.Errorf("failed to send token refresh: %v", err)
	}

	// Read the refresh response
	msgType, jsonData, err := conn.readLoxoneMessage()
	if err != nil {
		return fmt.Errorf("failed to read refresh response: %v", err)
	}
	if jsonData == nil {
		return fmt.Errorf("no JSON data in refresh response")
	}

	log.Printf("   â† Received refresh response (type %d)", msgType)

	// Parse the refreshjwt response which contains a NEW token with extended lifespan
	var refreshResp struct {
		LL struct {
			Control string `json:"control"`
			Code    string `json:"code"`
			Value   struct {
				Token      string `json:"token"`      // NEW token returned by refresh
				ValidUntil int64  `json:"validUntil"` // New expiry time
				Rights     int    `json:"tokenRights"`
				Unsecure   bool   `json:"unsecurePass"`
			} `json:"value"`
		} `json:"LL"`
	}

	if err := json.Unmarshal(jsonData, &refreshResp); err != nil {
		return fmt.Errorf("failed to parse refresh response: %v", err)
	}

	log.Printf("   â† Refresh response code: %s", refreshResp.LL.Code)

	if refreshResp.LL.Code != "200" {
		return fmt.Errorf("token refresh failed with code: %s", refreshResp.LL.Code)
	}

	// The response contains a NEW token with extended lifespan
	newToken := refreshResp.LL.Value.Token
	if newToken == "" {
		return fmt.Errorf("no token returned in refresh response")
	}

	newTokenValidTime := loxoneEpoch.Add(time.Duration(refreshResp.LL.Value.ValidUntil) * time.Second)

	conn.mu.Lock()
	conn.token = newToken // Store the NEW token - this is critical!
	conn.tokenValid = true
	conn.tokenExpiry = newTokenValidTime
	conn.lastSuccessfulAuth = time.Now()
	conn.mu.Unlock()

	log.Printf("   âœ… Token refreshed successfully")
	log.Printf("   New token received: %s...", newToken[:min(len(newToken), 16)])
	log.Printf("   New expiry: %v", newTokenValidTime.Format("2006-01-02 15:04:05"))
	log.Printf("   Token valid for: %.1f hours", time.Until(newTokenValidTime).Hours())

	if refreshResp.LL.Value.Unsecure {
		log.Printf("   âš ï¸  WARNING: Unsecure password flag is set")
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
		headerInfo := message[1]
		payloadLength := binary.LittleEndian.Uint32(message[4:8])

		log.Printf("   ðŸ“¦ Binary header: Type=0x%02X (Info=0x%02X), PayloadLen=%d", headerType, headerInfo, payloadLength)

		// Handle keepalive response (identifier 6) - header only, no payload
		if headerType == LoxoneMsgTypeKeepalive {
			log.Printf("   ðŸ’“ Keepalive response received (header-only message)")
			return headerType, nil, nil
		}

		// Handle out-of-service indicator (identifier 5) - header only
		if headerType == LoxoneMsgTypeOutOfService {
			log.Printf("   âš ï¸Â  Out-of-service indicator received")
			return headerType, nil, nil
		}

		// Handle event table and daytimer events - these are binary data, not JSON
		if headerType == LoxoneMsgTypeEventTable || headerType == LoxoneMsgTypeDaytimerEvent || headerType == LoxoneMsgTypeWeather {
			log.Printf("   â„¹ï¸  Binary event message (type %d) - ignoring", headerType)
			return headerType, nil, nil
		}

		// Handle text event (identifier 3) - has a JSON payload
		if headerType == LoxoneMsgTypeTextEvent {
			// If payload length is 0, it's just a header-only message
			if payloadLength == 0 {
				log.Printf("   â„¹ï¸  Text event with no payload (header-only)")
				return headerType, nil, nil
			}

			// Read the JSON payload
			wsMessageType, message, err = conn.ws.ReadMessage()
			if err != nil {
				return 0, nil, fmt.Errorf("failed to read JSON payload: %v", err)
			}
			log.Printf("   â†“ JSON payload received: %d bytes", len(message))

			// Show hex dump for very short messages
			if len(message) < 50 {
				log.Printf("   ðŸ” Hex dump: % X", message)
				log.Printf("   ðŸ” String: %q", string(message))
			}

			jsonData = conn.extractJSON(message)
			if jsonData == nil {
				log.Printf("   âš ï¸Â  Could not extract JSON from text event")
				log.Printf("   ðŸ” Raw message (first 200 bytes): %q", string(message[:min(len(message), 200)]))
				// Return nil data but no error - let the caller handle empty responses
				return headerType, nil, nil
			}
			return headerType, jsonData, nil
		}

		// Handle binary file (identifier 1)
		if headerType == LoxoneMsgTypeBinary {
			log.Printf("   â„¹ï¸  Binary file message - ignoring")
			return headerType, nil, nil
		}

		// Unknown message type
		log.Printf("   âš ï¸Â  Unknown binary message type: 0x%02X", headerType)
		return headerType, nil, nil
	}

	// Handle text messages (no binary header)
	if wsMessageType == websocket.TextMessage {
		log.Printf("   â†“ Text message received: %d bytes", len(message))

		// Show hex dump for very short messages
		if len(message) < 50 {
			log.Printf("   ðŸ” Hex dump: % X", message)
			log.Printf("   ðŸ” String: %q", string(message))
		}

		jsonData = conn.extractJSON(message)
		if jsonData == nil {
			log.Printf("   âš ï¸Â  Could not extract JSON from text message")
			log.Printf("   ðŸ” Raw message: %q", string(message))
			// Return nil data but no error - let the caller handle empty responses
			return LoxoneMsgTypeText, nil, nil
		}
		return LoxoneMsgTypeText, jsonData, nil
	}

	return 0, nil, fmt.Errorf("unexpected message type: %d", wsMessageType)
}

func (conn *LoxoneWebSocketConnection) Connect(db *sql.DB) {
	conn.ConnectWithBackoff(db)
}

// ConnectWithBackoff - Connect with exponential backoff and jitter, with retry loop
func (conn *LoxoneWebSocketConnection) ConnectWithBackoff(db *sql.DB) {
	conn.mu.Lock()

	// Don't reconnect if shutting down
	if conn.isShuttingDown {
		conn.mu.Unlock()
		log.Printf("â„¹ï¸  [%s] Skipping reconnect - connection is shutting down", conn.Host)
		return
	}

	// Prevent multiple simultaneous reconnection attempts
	if conn.isReconnecting {
		conn.mu.Unlock()
		log.Printf("â„¹ï¸  [%s] Reconnection already in progress, skipping", conn.Host)
		return
	}

	if conn.isConnected {
		conn.mu.Unlock()
		log.Printf("â„¹ï¸  [%s] Already connected, skipping", conn.Host)
		return
	}

	conn.isReconnecting = true
	conn.mu.Unlock()

	defer func() {
		conn.mu.Lock()
		conn.isReconnecting = false
		conn.mu.Unlock()
	}()

	// Stop any existing goroutines first
	conn.mu.Lock()
	if conn.stopChan != nil {
		select {
		case <-conn.stopChan:
			// Already closed
		default:
			close(conn.stopChan)
		}
	}
	conn.stopChan = make(chan bool)
	conn.mu.Unlock()

	// Wait for existing goroutines to finish
	conn.goroutinesWg.Wait()

	// Retry loop for connection attempts
	maxRetries := 10 // Try up to 10 times before giving up temporarily
	for attempt := 1; attempt <= maxRetries; attempt++ {
		// Check if we should stop
		conn.mu.Lock()
		if conn.isShuttingDown {
			conn.mu.Unlock()
			log.Printf("â„¹ï¸  [%s] Stopping reconnection attempts - shutting down", conn.Host)
			return
		}

		if conn.isConnected {
			conn.mu.Unlock()
			log.Printf("â„¹ï¸  [%s] Already connected, stopping retry loop", conn.Host)
			return
		}
		conn.mu.Unlock()

		// Apply backoff with jitter (except on first attempt)
		if attempt > 1 {
			conn.mu.Lock()
			backoff := conn.reconnectBackoff
			conn.mu.Unlock()

			jitter := time.Duration(rand.Float64() * float64(backoff) * 0.3)
			backoffWithJitter := backoff + jitter
			log.Printf("â³ [%s] Waiting %.1fs (backoff with jitter) before retry attempt %d/%d...",
				conn.Host, backoffWithJitter.Seconds(), attempt, maxRetries)
			time.Sleep(backoffWithJitter)
		}

		log.Println("â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”")
		log.Printf("â”‚ ðŸ”— CONNECTING: %s (attempt %d/%d)", conn.Host, attempt, maxRetries)
		log.Println("â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜")

		// Check if this is a remote connection (Loxone Cloud DNS)
		var wsURL string
		var isRemote bool = strings.Contains(conn.Host, "dns.loxonecloud.com")

		if isRemote {
			log.Printf("Step 1a: Resolving Loxone Cloud DNS address")
			log.Printf("   DNS Host: %s", conn.Host)

			// Extract MAC address from host (format: dns.loxonecloud.com/MACADDRESS)
			parts := strings.Split(conn.Host, "/")
			if len(parts) != 2 {
				log.Printf("❌ Invalid remote host format: %s", conn.Host)
				continue
			}
			macAddress := parts[1]

			// Make HTTP request to get redirect URL
			testURL := fmt.Sprintf("http://dns.loxonecloud.com/%s/jdev/cfg/api", macAddress)
			log.Printf("   Resolving via: %s", testURL)

			client := &http.Client{
				CheckRedirect: func(req *http.Request, via []*http.Request) error {
					// Don't follow redirects, we just want to capture the redirect URL
					return http.ErrUseLastResponse
				},
				Timeout: 10 * time.Second,
			}

			resp, err := client.Get(testURL)
			if err != nil {
				log.Printf("❌ Failed to resolve cloud DNS: %v", err)
				conn.mu.Lock()
				conn.isConnected = false
				conn.lastError = fmt.Sprintf("Failed to resolve cloud DNS: %v", err)
				conn.consecutiveConnFails++
				if conn.reconnectBackoff < 2*time.Second {
					conn.reconnectBackoff = 2 * time.Second
				} else {
					conn.reconnectBackoff = time.Duration(math.Min(
						float64(conn.reconnectBackoff*2),
						float64(conn.maxBackoff),
					))
				}
				conn.mu.Unlock()
				continue
			}
			defer resp.Body.Close()

			// Get the redirect location
			location := resp.Header.Get("Location")
			if location == "" {
				log.Printf("❌ No redirect location found")
				conn.mu.Lock()
				conn.isConnected = false
				conn.lastError = "No redirect location from cloud DNS"
				conn.consecutiveConnFails++
				conn.mu.Unlock()
				continue
			}

			log.Printf("   ✅ Redirect location: %s", location)

			// Parse the redirect URL to get the actual server address
			// Format: https://195-201-222-243.504F94D02EAD.dyndns.loxonecloud.com:43809/...
			redirectURL, err := url.Parse(location)
			if err != nil {
				log.Printf("❌ Failed to parse redirect URL: %v", err)
				continue
			}

			actualHost := redirectURL.Host
			log.Printf("   ✅ Actual server: %s", actualHost)

			// Use WSS (secure WebSocket) for remote connections
			wsURL = fmt.Sprintf("wss://%s/ws/rfc6455", actualHost)
		} else {
			// Local connection - use standard ws://
			wsURL = fmt.Sprintf("ws://%s/ws/rfc6455", conn.Host)
		}

		log.Printf("Step 1: Establishing WebSocket connection")
		log.Printf("   URL: %s", wsURL)

		dialer := websocket.Dialer{
			HandshakeTimeout: 10 * time.Second,
		}

		// For remote connections, skip TLS verification (Loxone uses self-signed certs)
		if isRemote {
			dialer.TLSClientConfig = &tls.Config{
				InsecureSkipVerify: true,
			}
		}

		ws, _, err := dialer.Dial(wsURL, nil)
		if err != nil {
			errMsg := fmt.Sprintf("Failed to connect: %v", err)
			log.Printf("âŒ %s", errMsg)

			conn.mu.Lock()
			conn.isConnected = false
			conn.lastError = errMsg
			conn.consecutiveConnFails++

			// Exponential backoff: 2s â†’ 5s â†’ 10s â†’ 20s â†’ 30s (cap)
			if conn.reconnectBackoff < 2*time.Second {
				conn.reconnectBackoff = 2 * time.Second
			} else {
				conn.reconnectBackoff = time.Duration(math.Min(
					float64(conn.reconnectBackoff*2),
					float64(conn.maxBackoff),
				))
			}
			conn.mu.Unlock()

			conn.updateDeviceStatus(db, fmt.Sprintf("ðŸ”´ Connection failed (attempt %d): %v", attempt, err))
			conn.logToDatabase("Loxone Connection Failed",
				fmt.Sprintf("Host '%s': %v (attempt %d, backoff: %.1fs)", conn.Host, err, attempt, conn.reconnectBackoff.Seconds()))

			// Continue to next retry
			continue
		}

		// Connection successful, proceed with authentication
		if conn.performConnection(ws, db) {
			// Successfully connected and authenticated
			return
		}

		// Authentication failed, retry
	}

	// All retries exhausted
	log.Printf("âŒ [%s] All %d connection attempts failed, will retry later", conn.Host, maxRetries)
	conn.logToDatabase("Loxone Connection Exhausted",
		fmt.Sprintf("Host '%s': All %d connection attempts failed", conn.Host, maxRetries))

	// Schedule another reconnection attempt after max backoff
	go func() {
		conn.mu.Lock()
		backoff := conn.maxBackoff
		conn.mu.Unlock()

		time.Sleep(backoff)

		conn.mu.Lock()
		isShuttingDown := conn.isShuttingDown
		conn.mu.Unlock()

		if !isShuttingDown {
			log.Printf("ðŸ”„ [%s] Scheduling new reconnection attempt after cooldown", conn.Host)
			go conn.ConnectWithBackoff(db)
		}
	}()
}

// performConnection handles the connection setup after websocket is established
func (conn *LoxoneWebSocketConnection) performConnection(ws *websocket.Conn, db *sql.DB) bool {
	conn.mu.Lock()
	conn.ws = ws
	conn.consecutiveConnFails = 0 // Reset on successful connection
	conn.lastConnectionTime = time.Now()
	conn.mu.Unlock()

	log.Printf("âœ… WebSocket connected successfully")
	log.Printf("Step 2: Starting token-based authentication")

	if err := conn.authenticateWithToken(); err != nil {
		errMsg := fmt.Sprintf("Authentication failed: %v", err)
		log.Printf("âŒ %s", errMsg)
		ws.Close()

		conn.mu.Lock()
		conn.ws = nil
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

		conn.updateDeviceStatus(db, fmt.Sprintf("ðŸ”´ Auth failed: %v", err))
		conn.logToDatabase("Loxone Auth Failed",
			fmt.Sprintf("Host '%s': %v (failures: %d)", conn.Host, err, conn.consecutiveAuthFails))
		return false
	}

	conn.mu.Lock()
	conn.isConnected = true
	conn.tokenValid = true
	conn.lastError = ""
	conn.consecutiveAuthFails = 0           // Reset on successful auth
	conn.reconnectBackoff = 2 * time.Second // Reset backoff on success
	conn.totalReconnects++
	conn.lastSuccessfulAuth = time.Now()
	deviceCount := len(conn.devices)
	conn.mu.Unlock()

	log.Println("â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”")
	log.Printf("â”‚ âœ… CONNECTION ESTABLISHED!         â”‚")
	log.Printf("â”‚ Host: %-27sâ”‚", conn.Host)
	log.Printf("â”‚ Devices: %-24dâ”‚", deviceCount)
	log.Println("â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜")

	conn.updateDeviceStatus(db, fmt.Sprintf("ðŸŸ¢ Connected at %s", time.Now().Format("2006-01-02 15:04:05")))
	conn.logToDatabase("Loxone Connected",
		fmt.Sprintf("Host '%s' connected with %d devices (lifetime reconnects: %d)",
			conn.Host, deviceCount, conn.totalReconnects))

	log.Printf("ðŸŽ§ Starting data listener for %s...", conn.Host)
	conn.goroutinesWg.Add(1)
	go conn.readLoop(db)

	log.Printf("â° Starting data request scheduler for %s...", conn.Host)
	conn.goroutinesWg.Add(1)
	go conn.requestData()

	log.Printf("ðŸ” Starting token expiry monitor for %s...", conn.Host)
	conn.goroutinesWg.Add(1)
	go conn.monitorTokenExpiry(db)

	log.Printf("ðŸ’“ Starting keepalive for %s...", conn.Host)
	conn.goroutinesWg.Add(1)
	go conn.keepalive()

	return true
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
	log.Printf("   âœ… Rights: %d", tokenData.Rights)

	if tokenData.Unsecure {
		log.Printf("   âš ï¸Â  WARNING: Unsecure password flag is set")
	}

	// Store the token - the session is now authenticated!
	// Note: jdev/sys/fenc/{token} is ONLY used for:
	// 1. Refreshing an existing token that's about to expire
	// 2. Authenticating with a previously saved token on reconnection
	// After gettoken, the session is already authenticated and ready to use.

	conn.mu.Lock()
	conn.token = tokenData.Token
	conn.tokenValid = true
	conn.tokenExpiry = tokenValidTime
	conn.mu.Unlock()

	log.Printf("   âœ… AUTHENTICATION SUCCESSFUL!")
	log.Printf("   Session is now authenticated and ready")
	log.Printf("   Token valid for: %.1f hours", time.Until(tokenValidTime).Hours())

	return nil
}

func (conn *LoxoneWebSocketConnection) extractJSON(message []byte) []byte {
	if len(message) == 0 {
		return nil
	}

	// Try direct unmarshal first
	var testJSON map[string]interface{}
	if err := json.Unmarshal(message, &testJSON); err == nil {
		return message
	}

	// For very short messages, they might be status codes or empty responses
	if len(message) < 3 {
		log.Printf("   ðŸ” Message too short to be JSON (%d bytes)", len(message))
		return nil
	}

	// Look for JSON starting with '{'
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

		// Try the whole message
		if json.Unmarshal(message, &testJSON) == nil {
			return message
		}
	}

	// Search for '{' in the first 100 bytes
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

	log.Printf("   ðŸ” No valid JSON found in message")
	return nil
}

// keepalive sends periodic keepalive messages to prevent connection timeout
// According to Loxone documentation, keepalive should be sent every 5 minutes
func (conn *LoxoneWebSocketConnection) keepalive() {
	defer conn.goroutinesWg.Done()

	log.Printf("ðŸ’“ KEEPALIVE STARTED for %s (interval: 4 minutes)", conn.Host)

	ticker := time.NewTicker(4 * time.Minute) // Send every 4 minutes to be safe (doc says 5)
	defer ticker.Stop()

	for {
		select {
		case <-conn.stopChan:
			log.Printf("ðŸ›‘ [%s] Keepalive stopping", conn.Host)
			return
		case <-ticker.C:
			conn.mu.Lock()
			if !conn.isConnected || conn.ws == nil {
				log.Printf("âš ï¸Â  [%s] Not connected, keepalive stopping", conn.Host)
				conn.mu.Unlock()
				return
			}

			// Send keepalive command as per Loxone documentation
			keepaliveCmd := "keepalive"
			log.Printf("ðŸ’“ [%s] Sending keepalive...", conn.Host)

			if err := conn.ws.WriteMessage(websocket.TextMessage, []byte(keepaliveCmd)); err != nil {
				log.Printf("âŒ [%s] Failed to send keepalive: %v", conn.Host, err)
				conn.isConnected = false
				conn.tokenValid = false
				conn.lastError = fmt.Sprintf("Keepalive failed: %v", err)
				conn.mu.Unlock()

				conn.logToDatabase("Loxone Keepalive Failed",
					fmt.Sprintf("Host '%s': %v - triggering reconnect", conn.Host, err))

				// Trigger reconnect
				go conn.ConnectWithBackoff(conn.db)
				return
			}

			log.Printf("âœ… [%s] Keepalive sent successfully", conn.Host)
			conn.mu.Unlock()
		}
	}
}

func (conn *LoxoneWebSocketConnection) monitorTokenExpiry(db *sql.DB) {
	defer conn.goroutinesWg.Done()

	log.Printf("ðŸ” TOKEN MONITOR STARTED for %s (proactive checking)", conn.Host)

	ticker := time.NewTicker(5 * time.Minute) // More frequent checking
	defer ticker.Stop()

	for {
		select {
		case <-conn.stopChan:
			log.Printf("ðŸ›‘ [%s] Token monitor stopping", conn.Host)
			return
		case <-ticker.C:
			conn.mu.Lock()
			isConnected := conn.isConnected
			tokenValid := conn.tokenValid
			tokenExpiry := conn.tokenExpiry
			conn.mu.Unlock()

			if !isConnected {
				log.Printf("âš ï¸Â  [%s] Not connected, token monitor stopping", conn.Host)
				return
			}

			// Check token with 30-second safety margin
			if !tokenValid || time.Now().After(tokenExpiry.Add(-30*time.Second)) {
				timeUntilExpiry := time.Until(tokenExpiry)
				log.Printf("âš ï¸Â  [%s] Token invalid or expiring soon (%.1f min), refreshing...",
					conn.Host, timeUntilExpiry.Minutes())

				conn.logToDatabase("Loxone Token Expiring",
					fmt.Sprintf("Host '%s' token expiring, refreshing...", conn.Host))

				// Try to refresh using ensureAuth
				if err := conn.ensureAuth(); err != nil {
					log.Printf("âŒ [%s] Failed to ensure auth: %v", conn.Host, err)
					log.Printf("   Triggering full reconnect...")
					conn.logToDatabase("Loxone Auth Check Failed",
						fmt.Sprintf("Host '%s': %v - reconnecting", conn.Host, err))

					conn.mu.Lock()
					conn.isConnected = false
					conn.tokenValid = false
					if conn.ws != nil {
						conn.ws.Close()
					}
					isShuttingDown := conn.isShuttingDown
					conn.mu.Unlock()

					conn.updateDeviceStatus(db, "ðŸ”„ Auth failed, reconnecting...")

					// Only trigger reconnect if not shutting down
					if !isShuttingDown {
						log.Printf("ðŸ”„ [%s] Triggering automatic reconnect", conn.Host)
						go conn.ConnectWithBackoff(db)
					} else {
						log.Printf("â„¹ï¸  [%s] Not reconnecting - connection is shutting down", conn.Host)
					}
					return
				}

				conn.updateDeviceStatus(db,
					fmt.Sprintf("ðŸŸ¢ Token refreshed at %s", time.Now().Format("2006-01-02 15:04:05")))
			} else {
				timeUntilExpiry := time.Until(tokenExpiry)
				log.Printf("âœ… [%s] Token valid for %.1f hours",
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
	defer conn.goroutinesWg.Done()

	log.Printf("â° DATA REQUEST SCHEDULER STARTED for %s", conn.Host)
	log.Printf("   Collection interval: 15 minutes (at :00, :15, :30, :45)")
	log.Printf("   Using ensureAuth() before each request cycle")

	for {
		now := time.Now()
		next := getNextQuarterHour(now)
		waitDuration := next.Sub(now)

		log.Printf("ðŸ“… [%s] Next data request scheduled for %s (in %.0f seconds)",
			conn.Host, next.Format("15:04:05"), waitDuration.Seconds())

		select {
		case <-conn.stopChan:
			log.Printf("ðŸ›‘ [%s] Data request scheduler stopping", conn.Host)
			return
		case <-time.After(waitDuration):
			// Continue to data request
		}

		// CRITICAL: Ensure auth before sending requests
		if err := conn.ensureAuth(); err != nil {
			log.Printf("âŒ [%s] Auth check failed before data request: %v", conn.Host, err)
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
			log.Printf("âš ï¸Â  [%s] Not connected after auth check, stopping scheduler", conn.Host)
			conn.mu.Unlock()
			return
		}

		devices := conn.devices
		conn.mu.Unlock()

		log.Println("â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€")
		log.Printf("ðŸ“¡ [%s] REQUESTING DATA FOR %d DEVICES", conn.Host, len(devices))
		log.Printf("   Time: %s", time.Now().Format("15:04:05"))

		requestFailed := false
		for _, device := range devices {
			// Check stop signal
			select {
			case <-conn.stopChan:
				log.Printf("ðŸ›‘ [%s] Data request scheduler stopping during collection", conn.Host)
				return
			default:
			}

			// Check auth before each device (optional, but safer)
			if err := conn.ensureAuth(); err != nil {
				log.Printf("âŒ Auth check failed during collection: %v", err)
				requestFailed = true
				break
			}

			if device.Type == "meter" {
				conn.mu.Lock()
				if !conn.isConnected || conn.ws == nil {
					conn.mu.Unlock()
					requestFailed = true
					break
				}

				// Request import data
				cmd := fmt.Sprintf("jdev/sps/io/%s/all", device.DeviceID)
				log.Printf("   â†’ METER [%s]: %s (mode: %s)", device.Name, device.DeviceID, device.LoxoneMode)

				if err := conn.ws.WriteMessage(websocket.TextMessage, []byte(cmd)); err != nil {
					log.Printf("âŒ Failed to request data for meter %s: %v", device.Name, err)
					conn.isConnected = false
					conn.tokenValid = false
					conn.lastError = fmt.Sprintf("Data request failed: %v", err)
					conn.logToDatabase("Loxone Data Request Failed",
						fmt.Sprintf("Meter '%s': %v", device.Name, err))
					conn.mu.Unlock()
					requestFailed = true
					break
				}
				conn.mu.Unlock()
				time.Sleep(100 * time.Millisecond)

				// For virtual_output_dual mode, also request export data
				if device.LoxoneMode == "virtual_output_dual" && device.ExportDeviceID != "" {
					conn.mu.Lock()
					if !conn.isConnected || conn.ws == nil {
						conn.mu.Unlock()
						requestFailed = true
						break
					}

					cmdExport := fmt.Sprintf("jdev/sps/io/%s/all", device.ExportDeviceID)
					log.Printf("      â”œâ”€ Export UUID: %s", device.ExportDeviceID)

					if err := conn.ws.WriteMessage(websocket.TextMessage, []byte(cmdExport)); err != nil {
						log.Printf("âŒ Failed to request export data for meter %s: %v", device.Name, err)
						conn.mu.Unlock()
						requestFailed = true
						break
					}
					conn.mu.Unlock()
					time.Sleep(100 * time.Millisecond)
				}
			} else if device.Type == "charger" {
				log.Printf("   â†’ CHARGER [%s]: requesting 4 UUIDs", device.Name)

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
						requestFailed = true
						break
					}

					cmd := fmt.Sprintf("jdev/sps/io/%s/all", u.uuid)
					log.Printf("      â”œâ”€ %s UUID: %s", u.name, u.uuid)

					if err := conn.ws.WriteMessage(websocket.TextMessage, []byte(cmd)); err != nil {
						log.Printf("âŒ Failed to request %s for charger %s: %v", u.name, device.Name, err)
						conn.isConnected = false
						conn.tokenValid = false
						conn.lastError = fmt.Sprintf("Data request failed: %v", err)
						conn.logToDatabase("Loxone Data Request Failed",
							fmt.Sprintf("Charger '%s' %s: %v", device.Name, u.name, err))
						conn.mu.Unlock()
						requestFailed = true
						break
					}
					conn.mu.Unlock()
					time.Sleep(100 * time.Millisecond)
				}

				if requestFailed {
					break
				}
			}
		}

		if requestFailed {
			log.Printf("   âŒ Data request failed, scheduler stopping")
			return
		}

		log.Printf("   âœ… All data requests sent successfully")
	}
}

func (conn *LoxoneWebSocketConnection) readLoop(db *sql.DB) {
	defer conn.goroutinesWg.Done()

	defer func() {
		conn.mu.Lock()
		if conn.ws != nil {
			conn.ws.Close()
		}
		conn.isConnected = false
		conn.tokenValid = false
		isShuttingDown := conn.isShuttingDown
		conn.mu.Unlock()

		log.Printf("ðŸ”´ [%s] DISCONNECTED from Loxone", conn.Host)

		conn.updateDeviceStatus(db,
			fmt.Sprintf("ðŸ”´ Offline since %s", time.Now().Format("2006-01-02 15:04:05")))
		conn.logToDatabase("Loxone Disconnected", fmt.Sprintf("Host '%s' disconnected", conn.Host))

		// Only trigger reconnect if not shutting down
		if !isShuttingDown {
			log.Printf("Triggering automatic reconnect for %s", conn.Host)
			go conn.ConnectWithBackoff(db)
		} else {
			log.Printf("Not reconnecting %s - connection is shutting down", conn.Host)
		}
	}()

	log.Printf("ðŸ‘‚ [%s] DATA LISTENER ACTIVE - waiting for messages...", conn.Host)

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
				// Small delay to prevent tight loop and allow responses to be processed
				time.Sleep(10 * time.Millisecond)
			default:
				log.Printf("âš ï¸Â  [%s] Read channel full, dropping message", conn.Host)
			}

			if err != nil {
				return
			}
		}
	}()

	for {
		select {
		case <-conn.stopChan:
			log.Printf("ðŸ›‘ [%s] Received stop signal, closing listener", conn.Host)
			return

		case result := <-readChan:
			if result.err != nil {
				if strings.Contains(result.err.Error(), "i/o timeout") ||
					strings.Contains(result.err.Error(), "deadline") {
					log.Printf("â±ï¸  [%s] Read timeout (expected between data requests)", conn.Host)
					continue
				}

				if strings.Contains(result.err.Error(), "websocket: close") {
					log.Printf("â„¹ï¸  [%s] WebSocket closed normally", conn.Host)
				} else {
					log.Printf("âŒ [%s] Read error: %v", conn.Host, result.err)
					conn.mu.Lock()
					conn.lastError = fmt.Sprintf("Read error: %v", result.err)
					conn.mu.Unlock()
					conn.logToDatabase("Loxone Read Error",
						fmt.Sprintf("Host '%s': %v", conn.Host, result.err))
				}
				return
			}

			// If jsonData is nil, it might be an empty response or keepalive ACK - just continue
			if result.jsonData == nil {
				log.Printf("   â„¹ï¸  [%s] Empty response received (likely keepalive ACK or status message)", conn.Host)
				continue
			}

			messageCount++

			var response LoxoneResponse
			if err := json.Unmarshal(result.jsonData, &response); err != nil {
				log.Printf("âš ï¸Â  [%s] Failed to parse JSON response: %v", conn.Host, err)
				log.Printf("âš ï¸Â  Raw JSON (first 500 chars): %s", string(result.jsonData[:min(len(result.jsonData), 500)]))
				// Don't disconnect on parse errors - just skip this message
				continue
			}

			// Check for auth/permission errors in response
			if response.LL.Code == "401" || response.LL.Code == "403" {
				log.Printf("ðŸ” [%s] Auth error detected in response (code: %s)", conn.Host, response.LL.Code)

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
					// Check for import reading (main device ID)
					expectedControl := fmt.Sprintf("dev/sps/io/%s/all", device.DeviceID)
					if strings.Contains(response.LL.Control, expectedControl) {
						conn.processMeterData(device, response, db, false) // false = import
						break
					}

					// Check for export reading (export device ID for virtual_output_dual mode only)
					if device.LoxoneMode == "virtual_output_dual" && device.ExportDeviceID != "" {
						expectedExportControl := fmt.Sprintf("dev/sps/io/%s/all", device.ExportDeviceID)
						if strings.Contains(response.LL.Control, expectedExportControl) {
							conn.processMeterData(device, response, db, true) // true = export
							break
						}
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
							log.Printf("   ðŸŽ¯ [%s] Matched UUID for field '%s': %s", device.Name, fieldName, uuid)

							if chargerData[device.ID] == nil {
								chargerData[device.ID] = &ChargerDataCollection{}
								log.Printf("   ðŸ“‹ [%s] Created new data collection for charger", device.Name)
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

func (conn *LoxoneWebSocketConnection) processMeterData(device *LoxoneDevice, response LoxoneResponse, db *sql.DB, isExport bool) {
	var reading float64

	// Determine if this meter type supports export
	var meterType string
	db.QueryRow("SELECT meter_type FROM meters WHERE id = ?", device.ID).Scan(&meterType)
	supportsExport := (meterType == "total_meter" || meterType == "solar_meter")

	// Try to get reading from different response formats based on mode
	if device.LoxoneMode == "meter_block" {
		// METER BLOCK MODE - Process BOTH import and export from the SAME response
		// For total/solar meters: Import from output1 (Mrc), Export from output8 (Mrd)

		var importReading, exportReading float64

		// Get import reading from output1
		if output1, ok := response.LL.Outputs["output1"]; ok {
			switch v := output1.Value.(type) {
			case float64:
				importReading = v
			case string:
				if f, err := strconv.ParseFloat(v, 64); err == nil {
					importReading = f
				}
			}
		}

		// Get export reading from output8 (only for total/solar meters)
		if supportsExport {
			if output8, ok := response.LL.Outputs["output8"]; ok {
				switch v := output8.Value.(type) {
				case float64:
					exportReading = v
				case string:
					if f, err := strconv.ParseFloat(v, 64); err == nil {
						exportReading = f
					}
				}
			}
		}

		// Update device state with BOTH values
		device.lastReading = importReading
		device.lastReadingExport = exportReading
		device.lastUpdate = time.Now()
		device.readingGaps = 0

		log.Printf("   ðŸ“¥ Import reading (output1/Mrc): %.3f kWh", importReading)
		if supportsExport {
			log.Printf("   ðŸ“¤ Export reading (output8/Mrd): %.3f kWh", exportReading)
		}

		reading = importReading // Set reading for database save below

	} else if device.LoxoneMode == "energy_meter_block" {
		// ENERGY METER BLOCK MODE - Single value from output1 (Mr)
		// For apartment/heating/other meters

		if output1, ok := response.LL.Outputs["output1"]; ok {
			switch v := output1.Value.(type) {
			case float64:
				reading = v
			case string:
				if f, err := strconv.ParseFloat(v, 64); err == nil {
					reading = f
				}
			}
		}

		if reading <= 0 {
			return
		}

		device.lastReading = reading
		device.lastUpdate = time.Now()
		device.readingGaps = 0
		log.Printf("   ðŸ“Š Reading (output1/Mr): %.3f kWh", reading)

	} else if device.LoxoneMode == "virtual_output_dual" {
		// VIRTUAL OUTPUT DUAL MODE - Separate UUIDs for import and export
		// For total/solar meters

		if output1, ok := response.LL.Outputs["output1"]; ok {
			switch v := output1.Value.(type) {
			case float64:
				reading = v
			case string:
				if f, err := strconv.ParseFloat(v, 64); err == nil {
					reading = f
				}
			}
		} else if response.LL.Value != "" {
			// Fallback to direct value
			if f, err := strconv.ParseFloat(response.LL.Value, 64); err == nil {
				reading = f
			}
		}

		if reading <= 0 {
			return
		}

		// Update device state
		if isExport {
			device.lastReadingExport = reading
			log.Printf("   ðŸ“¤ Export reading: %.3f kWh", reading)
			return // Don't save to DB for export in virtual_output_dual mode - wait for import
		} else {
			device.lastReading = reading
			device.lastUpdate = time.Now()
			device.readingGaps = 0
			log.Printf("   ðŸ“¥ Import reading: %.3f kWh", reading)
		}

	} else if device.LoxoneMode == "virtual_output_single" {
		// VIRTUAL OUTPUT SINGLE MODE - Single UUID, single value
		// For apartment/heating/other meters

		if output1, ok := response.LL.Outputs["output1"]; ok {
			switch v := output1.Value.(type) {
			case float64:
				reading = v
			case string:
				if f, err := strconv.ParseFloat(v, 64); err == nil {
					reading = f
				}
			}
		} else if response.LL.Value != "" {
			// Fallback to direct value
			if f, err := strconv.ParseFloat(response.LL.Value, 64); err == nil {
				reading = f
			}
		}

		if reading <= 0 {
			return
		}

		device.lastReading = reading
		device.lastUpdate = time.Now()
		device.readingGaps = 0
		log.Printf("   ðŸ“Š Reading: %.3f kWh", reading)
	}

	// Save to database (happens for all modes except virtual_output_dual export)
	if reading <= 0 {
		return
	}

	currentTime := roundToQuarterHour(time.Now())

	var lastReading, lastReadingExport float64
	var lastTime time.Time
	err := db.QueryRow(`
        SELECT power_kwh, power_kwh_export, reading_time FROM meter_readings 
        WHERE meter_id = ? 
        ORDER BY reading_time DESC LIMIT 1
    `, device.ID).Scan(&lastReading, &lastReadingExport, &lastTime)

	var consumption, consumptionExport float64
	isFirstReading := false

	if err == nil && !lastTime.IsZero() {
		interpolated := interpolateReadings(lastTime, lastReading, currentTime, reading)

		// Only interpolate export if meter supports it
		var interpolatedExport []struct {
			time  time.Time
			value float64
		}
		if supportsExport {
			interpolatedExport = interpolateReadings(lastTime, lastReadingExport, currentTime, device.lastReadingExport)
		}

		for i, point := range interpolated {
			intervalConsumption := point.value - lastReading
			if intervalConsumption < 0 {
				intervalConsumption = 0
			}

			intervalExport := float64(0)
			exportValue := lastReadingExport // Default to last known value
			if supportsExport && i < len(interpolatedExport) {
				exportValue = interpolatedExport[i].value
				intervalExport = exportValue - lastReadingExport
				if intervalExport < 0 {
					intervalExport = 0
				}
			}

			db.Exec(`
                INSERT INTO meter_readings (meter_id, reading_time, power_kwh, power_kwh_export, consumption_kwh, consumption_export)
                VALUES (?, ?, ?, ?, ?, ?)
            `, device.ID, point.time, point.value,
				exportValue,
				intervalConsumption,
				intervalExport)

			lastReading = point.value
			if supportsExport && i < len(interpolatedExport) {
				lastReadingExport = interpolatedExport[i].value
			}
		}

		if len(interpolated) > 0 {
			device.readingGaps += len(interpolated)
			log.Printf("   âš ï¸  Filled %d reading gaps for meter %s", len(interpolated), device.Name)
		}

		consumption = reading - lastReading
		if consumption < 0 {
			consumption = 0
		}

		if supportsExport {
			consumptionExport = device.lastReadingExport - lastReadingExport
			if consumptionExport < 0 {
				consumptionExport = 0
			}
		}
	} else {
		consumption = 0
		consumptionExport = 0
		isFirstReading = true
	}

	_, err = db.Exec(`
        INSERT INTO meter_readings (meter_id, reading_time, power_kwh, power_kwh_export, consumption_kwh, consumption_export)
        VALUES (?, ?, ?, ?, ?, ?)
    `, device.ID, currentTime, reading, device.lastReadingExport, consumption, consumptionExport)

	if err != nil {
		log.Printf("âŒ Failed to save reading to database: %v", err)
		conn.mu.Lock()
		conn.lastError = fmt.Sprintf("DB save failed: %v", err)
		conn.mu.Unlock()
	} else {
		db.Exec(`
            UPDATE meters 
            SET last_reading = ?, last_reading_export = ?, last_reading_time = ?, 
                notes = ?
            WHERE id = ?
        `, reading, device.lastReadingExport, currentTime,
			fmt.Sprintf("ðŸŸ¢ Last update: %s", time.Now().Format("2006-01-02 15:04:05")),
			device.ID)

		if !isFirstReading {
			if supportsExport {
				log.Printf("âœ… METER [%s]: %.3f kWh import (Î”%.3f), %.3f kWh export (Î”%.3f)",
					device.Name, reading, consumption, device.lastReadingExport, consumptionExport)
			} else {
				log.Printf("âœ… METER [%s]: %.3f kWh (Î”%.3f)",
					device.Name, reading, consumption)
			}
		} else {
			if supportsExport {
				log.Printf("âœ… METER [%s]: %.3f kWh import, %.3f kWh export (first reading)",
					device.Name, reading, device.lastReadingExport)
			} else {
				log.Printf("âœ… METER [%s]: %.3f kWh (first reading)",
					device.Name, reading)
			}
		}
	}
}

// stripUnitSuffix removes unit suffixes from numeric string values
func stripUnitSuffix(value string) string {
	value = strings.TrimSuffix(value, "kWh")
	value = strings.TrimSuffix(value, "KWh")
	value = strings.TrimSuffix(value, "W")
	value = strings.TrimSuffix(value, "kW")
	value = strings.TrimSuffix(value, "KW")
	value = strings.TrimSpace(value)
	return value
}

func (conn *LoxoneWebSocketConnection) processChargerField(device *LoxoneDevice, response LoxoneResponse, fieldName string, collection *ChargerDataCollection, db *sql.DB) {
	// Debug: Show what we received
	log.Printf("   ðŸ” [%s] Processing field '%s'", device.Name, fieldName)
	log.Printf("   ðŸ” Response Control: %s", response.LL.Control)
	log.Printf("   ðŸ” Response Code: %s", response.LL.Code)
	log.Printf("   ðŸ” Response Value: %s", response.LL.Value)
	log.Printf("   ðŸ” Number of outputs: %d", len(response.LL.Outputs))

	// List all output keys
	for key := range response.LL.Outputs {
		log.Printf("   ðŸ” Found output key: %s", key)
	}

	if output1, ok := response.LL.Outputs["output1"]; ok {
		log.Printf("   ðŸ” output1 found - Value type: %T, Value: %v", output1.Value, output1.Value)
		switch fieldName {
		case "power":
			var power float64
			switch v := output1.Value.(type) {
			case float64:
				power = v
			case string:
				cleanValue := stripUnitSuffix(v)
				if f, err := strconv.ParseFloat(cleanValue, 64); err == nil {
					power = f
				} else {
					log.Printf("   âš ï¸  [%s] Failed to parse power from output1: '%s' (err: %v)", device.Name, v, err)
				}
			}
			collection.Power = &power
			log.Printf("   ðŸ”‹ [%s] Received power: %.4f kWh", device.Name, power)

		case "state":
			var state string
			switch v := output1.Value.(type) {
			case string:
				state = v
			case float64:
				state = fmt.Sprintf("%.0f", v)
			}
			collection.State = &state
			log.Printf("   ðŸ” [%s] Received state: %s", device.Name, state)

		case "user_id":
			var userID string
			switch v := output1.Value.(type) {
			case string:
				userID = v
			case float64:
				userID = fmt.Sprintf("%.0f", v)
			}
			collection.UserID = &userID
			log.Printf("   ðŸ‘¤ [%s] Received user_id: %s", device.Name, userID)

		case "mode":
			var mode string
			switch v := output1.Value.(type) {
			case string:
				mode = v
			case float64:
				mode = fmt.Sprintf("%.0f", v)
			}
			collection.Mode = &mode
			log.Printf("   âš™ï¸Â  [%s] Received mode: %s", device.Name, mode)
		}

		// Check if we have all 4 fields
		hasAll := collection.Power != nil && collection.State != nil &&
			collection.UserID != nil && collection.Mode != nil

		log.Printf("   ðŸ“¦ [%s] Collection status: Power=%v State=%v UserID=%v Mode=%v (Complete=%v)",
			device.Name,
			collection.Power != nil, collection.State != nil,
			collection.UserID != nil, collection.Mode != nil,
			hasAll)

		if hasAll {
			log.Printf("   âœ… [%s] All fields collected, saving to database", device.Name)
			conn.saveChargerData(device, collection, db)

			// Reset collection
			collection.Power = nil
			collection.State = nil
			collection.UserID = nil
			collection.Mode = nil
		}
	} else {
		// output1 not found - try alternative: check if value is in response.LL.Value directly
		log.Printf("   âš ï¸Â  [%s] output1 not found in response for field '%s'", device.Name, fieldName)

		if response.LL.Value != "" {
			log.Printf("   ðŸ” Trying to use response.LL.Value: %s", response.LL.Value)

			switch fieldName {
			case "power":
				cleanValue := stripUnitSuffix(response.LL.Value)
				if f, err := strconv.ParseFloat(cleanValue, 64); err == nil {
					collection.Power = &f
					log.Printf("   ðŸ”‹ [%s] Received power from Value: %.4f kWh (from '%s')", device.Name, f, response.LL.Value)
				} else {
					log.Printf("   âŒ [%s] Failed to parse power from Value: '%s' (err: %v)", device.Name, response.LL.Value, err)
				}
			case "state":
				state := response.LL.Value
				collection.State = &state
				log.Printf("   ðŸ” [%s] Received state from Value: %s", device.Name, state)
			case "user_id":
				userID := response.LL.Value
				collection.UserID = &userID
				log.Printf("   ðŸ‘¤ [%s] Received user_id from Value: %s", device.Name, userID)
			case "mode":
				mode := response.LL.Value
				collection.Mode = &mode
				log.Printf("   âš™ï¸Â  [%s] Received mode from Value: %s", device.Name, mode)
			}

			// Check if we have all 4 fields
			hasAll := collection.Power != nil && collection.State != nil &&
				collection.UserID != nil && collection.Mode != nil

			log.Printf("   ðŸ“¦ [%s] Collection status: Power=%v State=%v UserID=%v Mode=%v (Complete=%v)",
				device.Name,
				collection.Power != nil, collection.State != nil,
				collection.UserID != nil, collection.Mode != nil,
				hasAll)

			if hasAll {
				log.Printf("   âœ… [%s] All fields collected, saving to database", device.Name)
				conn.saveChargerData(device, collection, db)

				// Reset collection
				collection.Power = nil
				collection.State = nil
				collection.UserID = nil
				collection.Mode = nil
			}
		} else {
			log.Printf("   âŒ [%s] No data found for field '%s' in response", device.Name, fieldName)
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
			log.Printf("   âš ï¸Â  Filled %d reading gaps for charger %s", len(interpolated), device.Name)
		}
	}

	_, err = db.Exec(`
		INSERT INTO charger_sessions (charger_id, user_id, session_time, power_kwh, mode, state)
		VALUES (?, ?, ?, ?, ?, ?)
	`, device.ID, userID, currentTime, power, mode, state)

	if err != nil {
		log.Printf("âŒ Failed to save charger session to database: %v", err)
		conn.mu.Lock()
		conn.lastError = fmt.Sprintf("DB save failed: %v", err)
		conn.mu.Unlock()
	} else {
		log.Printf("âœ… CHARGER [%s]: %.4f kWh (user: %s, mode: %s, state: %s)",
			device.Name, power, userID, mode, state)

		db.Exec(`
			UPDATE chargers 
			SET notes = ?
			WHERE id = ?
		`, fmt.Sprintf("ðŸŸ¢ Last update: %s", time.Now().Format("2006-01-02 15:04:05")),
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
	log.Printf("ðŸ›‘ Closing connection for %s", conn.Host)
	conn.mu.Lock()

	// Set shutdown flag to prevent automatic reconnection
	conn.isShuttingDown = true

	// Close stop channel first to signal all goroutines
	if conn.stopChan != nil {
		select {
		case <-conn.stopChan:
			// Already closed
		default:
			close(conn.stopChan)
		}
	}

	if conn.ws != nil {
		conn.ws.Close()
		conn.ws = nil
	}
	conn.isConnected = false
	conn.tokenValid = false
	conn.mu.Unlock()

	// Wait for all goroutines to finish
	log.Printf("   Ã¢ÂÂ³ Waiting for goroutines to finish...")
	conn.goroutinesWg.Wait()
	log.Printf("   âœ… Connection closed")

	conn.logToDatabase("Loxone Connection Closed",
		fmt.Sprintf("Host '%s' connection closed", conn.Host))
}