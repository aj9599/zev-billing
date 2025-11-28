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
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// ErrorType for classifying connection errors to handle them appropriately
type ErrorType int

const (
	ErrorTypeNetwork ErrorType = iota
	ErrorTypeAuth
	ErrorTypeDNS
	ErrorTypeTimeout
	ErrorTypeProtocol
	ErrorTypeUnknown
)

// classifyError determines the type of error for better handling
func classifyError(err error) ErrorType {
	if err == nil {
		return ErrorTypeUnknown
	}

	errStr := err.Error()

	// Network errors - connection refused, reset, etc.
	if strings.Contains(errStr, "connection refused") ||
		strings.Contains(errStr, "connection reset") ||
		strings.Contains(errStr, "broken pipe") {
		return ErrorTypeNetwork
	}

	// Authentication errors
	if strings.Contains(errStr, "401") ||
		strings.Contains(errStr, "403") ||
		strings.Contains(errStr, "authentication failed") {
		return ErrorTypeAuth
	}

	// DNS/resolution errors
	if strings.Contains(errStr, "no such host") ||
		strings.Contains(errStr, "dns") ||
		strings.Contains(errStr, "resolve") {
		return ErrorTypeDNS
	}

	// Timeout errors
	if strings.Contains(errStr, "timeout") ||
		strings.Contains(errStr, "deadline exceeded") ||
		strings.Contains(errStr, "i/o timeout") {
		return ErrorTypeTimeout
	}

	// Protocol errors
	if strings.Contains(errStr, "continuation after FIN") ||
		strings.Contains(errStr, "invalid") {
		return ErrorTypeProtocol
	}

	return ErrorTypeUnknown
}

// isProtocolError checks if an error is a WebSocket protocol error (recoverable)
func isProtocolError(err error) bool {
	if err == nil {
		return false
	}
	errStr := err.Error()
	return strings.Contains(errStr, "continuation after FIN") ||
		strings.Contains(errStr, "RSV1 set") ||
		strings.Contains(errStr, "RSV2 set") ||
		strings.Contains(errStr, "RSV3 set") ||
		strings.Contains(errStr, "FIN not set")
}

// DNSCache stores DNS resolution results to avoid excessive lookups
type DNSCache struct {
	macAddress   string
	resolvedHost string
	lastResolved time.Time
	cacheTTL     time.Duration
	mu           sync.RWMutex
}

func (dc *DNSCache) GetCached() (string, bool) {
	dc.mu.RLock()
	defer dc.mu.RUnlock()

	// Cache is valid for TTL duration
	if time.Since(dc.lastResolved) > dc.cacheTTL {
		return "", false // Cache expired
	}

	return dc.resolvedHost, true
}

func (dc *DNSCache) Update(host string) {
	dc.mu.Lock()
	defer dc.mu.Unlock()

	dc.resolvedHost = host
	dc.lastResolved = time.Now()
}

func (dc *DNSCache) Invalidate() {
	dc.mu.Lock()
	defer dc.mu.Unlock()
	dc.lastResolved = time.Time{} // Force refresh on next check
}

// ========== CHARGER SESSION TRACKING TYPES ==========

// LoxoneChargerLiveData holds live charger data for UI display
type LoxoneChargerLiveData struct {
	ChargerID        int
	ChargerName      string
	IsOnline         bool

	// Current state
	VehicleConnected bool
	ChargingActive   bool
	State            string // "0"=idle, "1"=charging
	StateDescription string

	// Live metrics (for UI display during charging)
	CurrentPower_kW   float64 // Cp - output3 - Real-time charging power
	TotalEnergy_kWh   float64 // Mr - output7 - Total meter reading
	SessionEnergy_kWh float64 // Ccc - output8 - Current session energy

	// Mode info
	Mode            string
	ModeDescription string

	// User info (from Uid during charging, confirmed from Lcl after session)
	UserID   string
	UserName string

	// Session timing
	SessionStart time.Time
	Timestamp    time.Time
}

// LoxoneActiveChargerSession tracks an ongoing charging session
type LoxoneActiveChargerSession struct {
	ChargerID       int
	ChargerName     string
	StartTime       time.Time
	StartEnergy_kWh float64           // Mr value at session start
	UserID          string            // From Uid during charging
	Mode            string
	LastLclValue    string            // Track Lcl changes to detect session end
	LastWriteTime   time.Time         // Track last database write
}

// ========== END TYPES ==========

type LoxoneCollector struct {
	db          *sql.DB
	connections map[string]*LoxoneWebSocketConnection
	mu          sync.RWMutex

	// Charger session tracking (centralized)
	liveChargerData     map[int]*LoxoneChargerLiveData      // charger_id -> live data for UI
	activeSessions      map[int]*LoxoneActiveChargerSession // charger_id -> active session
	chargerMu           sync.RWMutex
}

type LoxoneWebSocketConnection struct {
	Host     string
	Username string
	Password string

	MacAddress   string // For remote connections
	IsRemote     bool   // Flag to know if this is a remote connection
	ResolvedHost string // The actual resolved host:port (changes dynamically)

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
	lastDisconnectReason string
	lastDisconnectTime   time.Time
	portChangeInProgress bool
	writeMu              sync.Mutex
	collectionInProgress bool

	// Backoff for reconnection
	reconnectBackoff time.Duration
	maxBackoff       time.Duration

	// Enhanced tracking for better stability
	reconnectAttempt     int       // Track current attempt number
	lastErrorType        ErrorType // Track type of last error
	consecutiveDNSErrors int       // Track DNS-specific failures
	dnsCache             *DNSCache // DNS resolution caching

	stopChan       chan bool
	goroutinesWg   sync.WaitGroup
	isReconnecting bool
	isShuttingDown bool // Flag to prevent reconnection during shutdown
	mu             sync.Mutex
	db             *sql.DB

	// Reference to parent collector for session tracking
	collector *LoxoneCollector
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
	PowerUUID        string
	StateUUID        string
	UserIDUUID       string
	ModeUUID         string
	ChargerBlockUUID string

	lastReading       float64
	lastReadingExport float64
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
	log.Println("🔧 LOXONE COLLECTOR: Initializing with real-time charger data writes")
	lc := &LoxoneCollector{
		db:              db,
		connections:     make(map[string]*LoxoneWebSocketConnection),
		liveChargerData: make(map[int]*LoxoneChargerLiveData),
		activeSessions:  make(map[int]*LoxoneActiveChargerSession),
	}
	log.Println("🔧 LOXONE COLLECTOR: Instance created successfully")
	return lc
}

func (lc *LoxoneCollector) Start() {
	log.Println("===================================")
	log.Println("🚀 LOXONE WEBSOCKET COLLECTOR STARTING")
	log.Println("   Features: Real-time charger data writes, Auth health checks, keepalive")
	log.Println("   Chargers: Database writes every 15 minutes + final reading after session")
	log.Println("===================================")

	lc.logToDatabase("Loxone Collector Started", "Real-time charger tracking enabled")

	lc.initializeConnections()

	log.Printf("✔️ Loxone Collector initialized with %d WebSocket connections", len(lc.connections))
	lc.logToDatabase("Loxone Collector Ready", fmt.Sprintf("Initialized %d Loxone connections", len(lc.connections)))

	go lc.monitorConnections()

	log.Println("✔️ Loxone connection monitor started")
	log.Println("===================================")
}

func (lc *LoxoneCollector) Stop() {
	log.Println("🗑️ STOPPING ALL LOXONE CONNECTIONS")
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

	log.Println("✔️ All Loxone connections stopped")
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

	// Clear session data
	lc.chargerMu.Lock()
	lc.liveChargerData = make(map[int]*LoxoneChargerLiveData)
	lc.activeSessions = make(map[int]*LoxoneActiveChargerSession)
	lc.chargerMu.Unlock()

	// Now create new connections
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
			log.Println("────────────────────────────────────────────────────────────────────────")
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

			log.Printf("   ├─ Connection Mode: %s", connectionMode)
			if connectionMode == "remote" {
				log.Printf("   ├─ MAC Address: %s", macAddress)
			} else {
				log.Printf("   ├─ Host: %s", host)
			}
			log.Printf("   ├─ Username: %s", username)
			log.Printf("   ├─ Meter Type: %s", meterType)
			log.Printf("   ├─ Mode: %s", loxoneMode)
			log.Printf("   ├─ Device UUID: %s", deviceID)
			if (loxoneMode == "virtual_output_dual") && exportDeviceID != "" {
				log.Printf("   └─ Export UUID: %s", exportDeviceID)
			} else if loxoneMode == "meter_block" {
				log.Printf("   └─ (Meter block: output1=Mrc, output8=Mrd)")
			} else if loxoneMode == "energy_meter_block" {
				log.Printf("   └─ (Energy meter block: output1=Mr)")
			} else {
				log.Printf("   └─ (Virtual output: single value)")
			}

			// Validate configuration based on connection mode
			if connectionMode == "remote" {
				if macAddress == "" || deviceID == "" {
					log.Printf("   ⚠️ WARNING: Incomplete remote config (missing MAC or device ID) - skipping")
					continue
				}
			} else {
				if host == "" || deviceID == "" {
					log.Printf("   ⚠️ WARNING: Incomplete local config (missing host or device ID) - skipping")
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
					MacAddress:       macAddress,
					IsRemote:         connectionMode == "remote",
					devices:          []*LoxoneDevice{},
					stopChan:         make(chan bool),
					db:               lc.db,
					isShuttingDown:   false,
					reconnectAttempt: 0,
					collector:        lc,

					reconnectBackoff: func() time.Duration {
						if connectionMode == "remote" {
							return 10 * time.Second
						}
						return 1 * time.Second
					}(),
					maxBackoff: func() time.Duration {
						if connectionMode == "remote" {
							return 300 * time.Second
						}
						return 15 * time.Second
					}(),

					dnsCache: func() *DNSCache {
						if connectionMode == "remote" {
							return &DNSCache{
								macAddress: macAddress,
								cacheTTL:   5 * time.Minute,
							}
						}
						return nil
					}(),
				}
				connectionDevices[connKey] = conn
				if connectionMode == "remote" {
					log.Printf("   🌐 Created new REMOTE WebSocket connection via Loxone Cloud DNS")
				} else {
					log.Printf("   📉 Created new LOCAL WebSocket connection for %s", host)
				}
			} else {
				log.Printf("   ♻️ Reusing existing WebSocket connection for %s", host)
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

		log.Printf("✔️ Loaded %d Loxone meters", meterCount)
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
			log.Println("────────────────────────────────────────────────────────────────────────")
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
			macAddress, _ := config["loxone_mac_address"].(string)
			connectionMode, _ := config["loxone_connection_mode"].(string)
			username, _ := config["loxone_username"].(string)
			password, _ := config["loxone_password"].(string)

			// Check if this is single-block mode (Weidmüller single UUID)
			chargerBlockUUID, _ := config["loxone_charger_block_uuid"].(string)

			// For backward compatibility, also check for multi-UUID mode
			powerUUID, _ := config["loxone_power_uuid"].(string)
			stateUUID, _ := config["loxone_state_uuid"].(string)
			userIDUUID, _ := config["loxone_user_id_uuid"].(string)
			modeUUID, _ := config["loxone_mode_uuid"].(string)

			log.Printf("   ├─ Connection Mode: %s", connectionMode)
			if connectionMode == "remote" {
				log.Printf("   ├─ MAC Address: %s", macAddress)
			} else {
				log.Printf("   ├─ Host: %s", host)
			}
			log.Printf("   ├─ Username: %s", username)

			// Determine which mode we're using
			if chargerBlockUUID != "" {
				log.Printf("   ├─ Mode: Single-block (Weidmüller) - REAL-TIME TRACKING ENABLED")
				log.Printf("   └─ Charger Block UUID: %s", chargerBlockUUID)

				// Validate configuration based on connection mode
				if connectionMode == "remote" {
					if macAddress == "" || chargerBlockUUID == "" {
						log.Printf("   ⚠️ WARNING: Incomplete remote config (missing MAC or block UUID) - skipping")
						continue
					}
				} else {
					if host == "" || chargerBlockUUID == "" {
						log.Printf("   ⚠️ WARNING: Incomplete local config (missing host or block UUID) - skipping")
						continue
					}
				}
			} else {
				log.Printf("   ├─ Mode: Multi-UUID (traditional)")
				log.Printf("   ├─ Power UUID: %s", powerUUID)
				log.Printf("   ├─ State UUID: %s", stateUUID)
				log.Printf("   ├─ User ID UUID: %s", userIDUUID)
				log.Printf("   └─ Mode UUID: %s", modeUUID)

				// Validate configuration based on connection mode
				if connectionMode == "remote" {
					if macAddress == "" || powerUUID == "" || stateUUID == "" || userIDUUID == "" || modeUUID == "" {
						log.Printf("   ⚠️ WARNING: Incomplete remote config (missing MAC or UUIDs) - skipping")
						continue
					}
				} else {
					if host == "" || powerUUID == "" || stateUUID == "" || userIDUUID == "" || modeUUID == "" {
						log.Printf("   ⚠️ WARNING: Incomplete local config (missing host or UUIDs) - skipping")
						continue
					}
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
					MacAddress:       macAddress,
					IsRemote:         connectionMode == "remote",
					devices:          []*LoxoneDevice{},
					stopChan:         make(chan bool),
					db:               lc.db,
					isShuttingDown:   false,
					reconnectAttempt: 0,
					collector:        lc,

					reconnectBackoff: func() time.Duration {
						if connectionMode == "remote" {
							return 10 * time.Second
						}
						return 1 * time.Second
					}(),
					maxBackoff: func() time.Duration {
						if connectionMode == "remote" {
							return 300 * time.Second
						}
						return 15 * time.Second
					}(),

					dnsCache: func() *DNSCache {
						if connectionMode == "remote" {
							return &DNSCache{
								macAddress: macAddress,
								cacheTTL:   5 * time.Minute,
							}
						}
						return nil
					}(),
				}
				connectionDevices[connKey] = conn
				if connectionMode == "remote" {
					log.Printf("   🌐 Created new REMOTE WebSocket connection via Loxone Cloud DNS")
				} else {
					log.Printf("   📉 Created new LOCAL WebSocket connection for %s", host)
				}
			} else {
				if connectionMode == "remote" {
					log.Printf("   ♻️ Reusing existing REMOTE WebSocket connection")
				} else {
					log.Printf("   ♻️ Reusing existing LOCAL WebSocket connection for %s", host)
				}
			}

			device := &LoxoneDevice{
				ID:               id,
				Name:             name,
				Type:             "charger",
				ChargerBlockUUID: chargerBlockUUID,
				PowerUUID:        powerUUID,
				StateUUID:        stateUUID,
				UserIDUUID:       userIDUUID,
				ModeUUID:         modeUUID,
			}
			conn.devices = append(conn.devices, device)

			// Initialize live data for this charger
			lc.chargerMu.Lock()
			lc.liveChargerData[id] = &LoxoneChargerLiveData{
				ChargerID:   id,
				ChargerName: name,
				IsOnline:    false,
				Timestamp:   time.Now(),
			}
			lc.chargerMu.Unlock()
		}

		log.Printf("✅ Loaded %d Loxone chargers", chargerCount)
	}

	// Start all connections
	lc.mu.Lock()
	for key, conn := range connectionDevices {
		lc.connections[key] = conn
		deviceCount := len(conn.devices)
		log.Println("────────────────────────────────────────────────────────────────────────")
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
		log.Println("ℹ️ NO LOXONE API DEVICES FOUND IN DATABASE")
		lc.logToDatabase("Loxone No Devices", "No Loxone API devices found in database")
	} else {
		log.Println("────────────────────────────────────────────────────────────────────────")
		log.Printf("✔️ INITIALIZED %d WEBSOCKET CONNECTIONS FOR %d DEVICES",
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

		log.Println("────────────────────────────────────────────────────────────────────────")
		log.Println("🔍 LOXONE CONNECTION STATUS CHECK")

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
				log.Printf("🔴 Connection %s: DISCONNECTED (%d devices)", key, deviceCount)
				if lastError != "" {
					log.Printf("      Last error: %s", lastError)
				}
				if authFails > 0 {
					log.Printf("      ⚠️ Consecutive auth failures: %d", authFails)
				}
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

		// Log charger session status
		lc.chargerMu.RLock()
		activeSessionCount := len(lc.activeSessions)
		lc.chargerMu.RUnlock()

		log.Printf("📊 Summary: %d connected, %d disconnected, %d total devices",
			connectedCount, disconnectedCount, totalDevices)
		log.Printf("📊 Charger Sessions: %d active", activeSessionCount)
		log.Printf("📊 Metrics: %d total auth failures, %d total reconnects",
			totalAuthFailures, totalReconnects)
		log.Println("────────────────────────────────────────────────────────────────────────")

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
				// Get live data for charger
				lc.chargerMu.RLock()
				liveData := lc.liveChargerData[device.ID]
				activeSession := lc.activeSessions[device.ID]
				lc.chargerMu.RUnlock()

				status := map[string]interface{}{
					"power_uuid":             device.PowerUUID,
					"state_uuid":             device.StateUUID,
					"user_id_uuid":           device.UserIDUUID,
					"mode_uuid":              device.ModeUUID,
					"charger_block_uuid":     device.ChargerBlockUUID,
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
					"collection_mode":        "Real-time (15-min intervals + session end)",
				}

				// Add live data if available
				if liveData != nil {
					status["live_data"] = map[string]interface{}{
						"vehicle_connected":  liveData.VehicleConnected,
						"charging_active":    liveData.ChargingActive,
						"current_power_kw":   liveData.CurrentPower_kW,
						"total_energy_kwh":   liveData.TotalEnergy_kWh,
						"session_energy_kwh": liveData.SessionEnergy_kWh,
						"mode":               liveData.Mode,
						"mode_description":   liveData.ModeDescription,
						"state":              liveData.State,
						"state_description":  liveData.StateDescription,
						"user_id":            liveData.UserID,
						"timestamp":          liveData.Timestamp.Format("2006-01-02 15:04:05"),
					}
				}

				// Add active session info if charging
				if activeSession != nil {
					status["active_session"] = map[string]interface{}{
						"start_time":       activeSession.StartTime.Format("2006-01-02 15:04:05"),
						"start_energy_kwh": activeSession.StartEnergy_kWh,
						"user_id":          activeSession.UserID,
						"duration":         formatDuration(time.Since(activeSession.StartTime)),
						"last_write":       activeSession.LastWriteTime.Format("2006-01-02 15:04:05"),
					}
				}

				chargerStatus[device.ID] = status
			}
		}
		conn.mu.Unlock()
	}

	return map[string]interface{}{
		"loxone_connections":         meterStatus,
		"loxone_charger_connections": chargerStatus,
	}
}

// ========== PUBLIC API FOR CHARGER DATA ==========

// GetChargerLiveData returns live charger data for UI display
func (lc *LoxoneCollector) GetChargerLiveData(chargerID int) (*LoxoneChargerLiveData, bool) {
	lc.chargerMu.RLock()
	defer lc.chargerMu.RUnlock()

	data, exists := lc.liveChargerData[chargerID]
	if !exists || time.Since(data.Timestamp) > 60*time.Second {
		return nil, false
	}

	return data, true
}

// GetActiveSession returns the active session for a charger if one exists
func (lc *LoxoneCollector) GetActiveSession(chargerID int) (*LoxoneActiveChargerSession, bool) {
	lc.chargerMu.RLock()
	defer lc.chargerMu.RUnlock()

	session, exists := lc.activeSessions[chargerID]
	return session, exists
}

// ========== END PUBLIC API ==========

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
			log.Printf("🔄 [%s] Token expiring soon, attempting fast refresh...", conn.Host)

			// Release lock during token refresh
			conn.mu.Unlock()
			err := conn.refreshToken()

			if err == nil {
				log.Printf("✔️ [%s] Token refresh successful", conn.Host)
				return nil
			}

			log.Printf("⚠️ [%s] Token refresh failed: %v, falling back to full re-auth", conn.Host, err)
		} else {
			log.Printf("⚠️ [%s] Token invalid or missing, performing full re-authentication...", conn.Host)
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
			log.Printf("❌ [%s] Re-authentication failed: %v", conn.Host, err)
			return fmt.Errorf("authentication failed: %v", err)
		}

		log.Printf("✔️ [%s] Re-authentication successful", conn.Host)
		conn.mu.Unlock()
		return nil
	}

	conn.mu.Unlock()
	return nil
}

// refreshToken uses the correct Loxone API to refresh the token
func (conn *LoxoneWebSocketConnection) refreshToken() error {
	log.Printf("🔄 TOKEN REFRESH - Requesting new token with extended lifespan")

	refreshCmd := fmt.Sprintf("jdev/sys/refreshjwt/%s/%s", conn.token, conn.Username)
	log.Printf("   → Sending: jdev/sys/refreshjwt/***/%s", conn.Username)

	if err := conn.safeWriteMessage(websocket.TextMessage, []byte(refreshCmd)); err != nil {
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

	log.Printf("   ← Received refresh response (type %d)", msgType)

	var refreshResp struct {
		LL struct {
			Control string `json:"control"`
			Code    string `json:"code"`
			Value   struct {
				Token      string `json:"token"`
				ValidUntil int64  `json:"validUntil"`
				Rights     int    `json:"tokenRights"`
				Unsecure   bool   `json:"unsecurePass"`
			} `json:"value"`
		} `json:"LL"`
	}

	if err := json.Unmarshal(jsonData, &refreshResp); err != nil {
		return fmt.Errorf("failed to parse refresh response: %v", err)
	}

	log.Printf("   ← Refresh response code: %s", refreshResp.LL.Code)

	if refreshResp.LL.Code != "200" {
		return fmt.Errorf("token refresh failed with code: %s", refreshResp.LL.Code)
	}

	newToken := refreshResp.LL.Value.Token
	if newToken == "" {
		return fmt.Errorf("no token returned in refresh response")
	}

	newTokenValidTime := loxoneEpoch.Add(time.Duration(refreshResp.LL.Value.ValidUntil) * time.Second)

	conn.mu.Lock()
	conn.token = newToken
	conn.tokenValid = true
	conn.tokenExpiry = newTokenValidTime
	conn.lastSuccessfulAuth = time.Now()
	conn.mu.Unlock()

	log.Printf("   ✔️ Token refreshed successfully")
	log.Printf("   New token received: %s...", newToken[:min(len(newToken), 16)])
	log.Printf("   New expiry: %v", newTokenValidTime.Format("2006-01-02 15:04:05"))
	log.Printf("   Token valid for: %.1f hours", time.Until(newTokenValidTime).Hours())

	if refreshResp.LL.Value.Unsecure {
		log.Printf("   ⚠️ WARNING: Unsecure password flag is set")
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

		log.Printf("   📦 Binary header: Type=0x%02X (Info=0x%02X), PayloadLen=%d", headerType, headerInfo, payloadLength)

		// Handle keepalive response (identifier 6) - header only, no payload
		if headerType == LoxoneMsgTypeKeepalive {
			log.Printf("   💓 Keepalive response received (header-only message)")
			return headerType, nil, nil
		}

		// Handle out-of-service indicator (identifier 5) - header only
		if headerType == LoxoneMsgTypeOutOfService {
			log.Printf("   ⚠️ Out-of-service indicator received")
			return headerType, nil, nil
		}

		// Handle event table and daytimer events - these are binary data, not JSON
		if headerType == LoxoneMsgTypeEventTable || headerType == LoxoneMsgTypeDaytimerEvent || headerType == LoxoneMsgTypeWeather {
			log.Printf("   ℹ️ Binary event message (type %d) - ignoring", headerType)
			return headerType, nil, nil
		}

		// Handle text event (identifier 3) - has a JSON payload
		if headerType == LoxoneMsgTypeTextEvent {
			// If payload length is 0, it's just a header-only message
			if payloadLength == 0 {
				log.Printf("   ℹ️ Text event with no payload (header-only)")
				return headerType, nil, nil
			}

			// Read the JSON payload
			wsMessageType, message, err = conn.ws.ReadMessage()
			if err != nil {
				return 0, nil, fmt.Errorf("failed to read JSON payload: %v", err)
			}
			log.Printf("   ↓ JSON payload received: %d bytes", len(message))

			// Show hex dump for very short messages
			if len(message) < 50 {
				log.Printf("   🔍 Hex dump: % X", message)
				log.Printf("   🔍 String: %q", string(message))
			}

			jsonData = conn.extractJSON(message)
			if jsonData == nil {
				log.Printf("   ⚠️ Could not extract JSON from text event")
				log.Printf("   🔍 Raw message (first 200 bytes): %q", string(message[:min(len(message), 200)]))
				return headerType, nil, nil
			}
			return headerType, jsonData, nil
		}

		// Handle binary file (identifier 1)
		if headerType == LoxoneMsgTypeBinary {
			log.Printf("   ℹ️ Binary file message - ignoring")
			return headerType, nil, nil
		}

		// Unknown message type
		log.Printf("   ⚠️ Unknown binary message type: 0x%02X", headerType)
		return headerType, nil, nil
	}

	// Handle text messages (no binary header)
	if wsMessageType == websocket.TextMessage {
		log.Printf("   ↓ Text message received: %d bytes", len(message))

		// Show hex dump for very short messages
		if len(message) < 50 {
			log.Printf("   🔍 Hex dump: % X", message)
			log.Printf("   🔍 String: %q", string(message))
		}

		jsonData = conn.extractJSON(message)
		if jsonData == nil {
			log.Printf("   ⚠️ Could not extract JSON from text message")
			log.Printf("   🔍 Raw message: %q", string(message))
			return LoxoneMsgTypeText, nil, nil
		}
		return LoxoneMsgTypeText, jsonData, nil
	}

	return 0, nil, fmt.Errorf("unexpected message type: %d", wsMessageType)
}

// safeWriteMessage writes a message to WebSocket with mutex protection
func (conn *LoxoneWebSocketConnection) safeWriteMessage(messageType int, data []byte) error {
	conn.writeMu.Lock()
	defer conn.writeMu.Unlock()

	conn.mu.Lock()
	ws := conn.ws
	conn.mu.Unlock()

	if ws == nil {
		return fmt.Errorf("not connected")
	}

	return ws.WriteMessage(messageType, data)
}

func (conn *LoxoneWebSocketConnection) Connect(db *sql.DB) {
	conn.ConnectWithBackoff(db)
}

// resolveLoxoneCloudDNS resolves the Loxone Cloud DNS and returns the actual server address
func (conn *LoxoneWebSocketConnection) resolveLoxoneCloudDNS() (string, error) {
	if !conn.IsRemote {
		return conn.Host, nil
	}

	log.Printf("🌐 [%s] Resolving Loxone Cloud DNS address", conn.MacAddress)

	testURL := fmt.Sprintf("http://dns.loxonecloud.com/%s/jdev/cfg/api", conn.MacAddress)
	log.Printf("   Resolving via: %s", testURL)

	client := &http.Client{
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
		Timeout: 15 * time.Second,
	}

	resp, err := client.Get(testURL)
	if err != nil {
		return "", fmt.Errorf("failed to resolve cloud DNS: %v", err)
	}
	defer resp.Body.Close()

	location := resp.Header.Get("Location")
	if location == "" {
		return "", fmt.Errorf("no redirect location from cloud DNS")
	}

	log.Printf("   ✅ Redirect location: %s", location)

	redirectURL, err := url.Parse(location)
	if err != nil {
		return "", fmt.Errorf("failed to parse redirect URL: %v", err)
	}

	actualHost := redirectURL.Host
	log.Printf("   ✅ Actual server: %s", actualHost)

	conn.mu.Lock()
	oldHost := conn.ResolvedHost
	conn.ResolvedHost = actualHost
	conn.mu.Unlock()

	if oldHost != "" && oldHost != actualHost {
		log.Printf("   🔄 HOST CHANGED: %s → %s", oldHost, actualHost)
		conn.logToDatabase("Loxone Cloud Host Changed",
			fmt.Sprintf("MAC %s: Host changed from %s to %s", conn.MacAddress, oldHost, actualHost))
	}

	return actualHost, nil
}

// ConnectWithBackoff - Connect with exponential backoff and jitter
func (conn *LoxoneWebSocketConnection) ConnectWithBackoff(db *sql.DB) {
	conn.mu.Lock()

	if conn.isShuttingDown {
		conn.mu.Unlock()
		log.Printf("ℹ️ [%s] Skipping reconnect - connection is shutting down", conn.Host)
		return
	}

	if conn.isReconnecting {
		conn.mu.Unlock()
		log.Printf("ℹ️ [%s] Reconnection already in progress, skipping", conn.Host)
		return
	}

	if conn.isConnected {
		conn.mu.Unlock()
		log.Printf("ℹ️ [%s] Already connected, skipping", conn.Host)
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
		default:
			close(conn.stopChan)
		}
	}
	conn.stopChan = make(chan bool)
	conn.mu.Unlock()

	conn.goroutinesWg.Wait()

	maxRetries := 10
	for attempt := 1; attempt <= maxRetries; attempt++ {
		conn.mu.Lock()
		if conn.isShuttingDown {
			conn.mu.Unlock()
			log.Printf("ℹ️ [%s] Stopping reconnection attempts - shutting down", conn.Host)
			return
		}

		if conn.isConnected {
			conn.mu.Unlock()
			log.Printf("ℹ️ [%s] Already connected, stopping retry loop", conn.Host)
			return
		}
		conn.mu.Unlock()

		if attempt > 1 {
			conn.mu.Lock()
			backoff := conn.reconnectBackoff
			conn.mu.Unlock()

			jitter := time.Duration(rand.Float64() * float64(backoff) * 0.3)
			backoffWithJitter := backoff + jitter
			log.Printf("⏳ [%s] Waiting %.1fs (backoff with jitter) before retry attempt %d/%d...",
				conn.Host, backoffWithJitter.Seconds(), attempt, maxRetries)
			time.Sleep(backoffWithJitter)
		}

		log.Println("├────────────────────────────────────────────────────────────────────────")
		log.Printf("│ 💗 CONNECTING: %s (attempt %d/%d)", conn.Host, attempt, maxRetries)
		log.Println("└────────────────────────────────────────────────────────────────────────")

		var wsURL string
		conn.mu.Lock()
		isRemote := conn.IsRemote
		conn.mu.Unlock()

		if isRemote {
			log.Printf("Step 1a: Re-resolving Loxone Cloud DNS address (ALWAYS on reconnect)")

			actualHost, err := conn.resolveLoxoneCloudDNS()
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

			wsURL = fmt.Sprintf("wss://%s/ws/rfc6455", actualHost)
			log.Printf("   ✅ Using resolved host: %s", actualHost)
		} else {
			conn.mu.Lock()
			wsURL = fmt.Sprintf("ws://%s/ws/rfc6455", conn.Host)
			conn.mu.Unlock()
		}

		log.Printf("Step 1: Establishing WebSocket connection")
		log.Printf("   URL: %s", wsURL)

		dialer := websocket.Dialer{
			HandshakeTimeout: 15 * time.Second,
		}

		if isRemote {
			dialer.TLSClientConfig = &tls.Config{
				InsecureSkipVerify: true,
			}
		}

		ws, _, err := dialer.Dial(wsURL, nil)
		if err != nil {
			errorType := classifyError(err)

			if conn.isExpectedDuringPortChange(err) {
				errMsg := fmt.Sprintf("Reconnecting after port change: %v", err)
				log.Printf("[INFO] [%s] %s (attempt %d/%d)", conn.Host, errMsg, attempt, maxRetries)

				conn.mu.Lock()
				conn.portChangeInProgress = true
				conn.lastError = "Port change in progress"
				conn.mu.Unlock()

				if attempt == 1 {
					conn.logToDatabase("Loxone Port Change",
						fmt.Sprintf("Host '%s': Port rotation detected, reconnecting", conn.Host))
				}
			} else {
				errMsg := fmt.Sprintf("Connection failed: %v", err)
				log.Printf("[ERROR] [%s] %s", conn.Host, errMsg)

				conn.mu.Lock()
				conn.isConnected = false
				conn.lastError = errMsg
				conn.lastErrorType = errorType
				conn.consecutiveConnFails++
				conn.portChangeInProgress = false
				conn.mu.Unlock()

				conn.updateDeviceStatus(db, fmt.Sprintf("[ERROR] Connection failed (attempt %d): %v", attempt, err))
				conn.logToDatabase("Loxone Connection Failed",
					fmt.Sprintf("Host '%s': %v (attempt %d, type: %d)", conn.Host, err, attempt, errorType))
			}

			continue
		}

		if conn.performConnection(ws, db) {
			conn.mu.Lock()
			wasPortChange := conn.portChangeInProgress
			conn.portChangeInProgress = false
			deviceCount := len(conn.devices)
			conn.mu.Unlock()

			if wasPortChange {
				log.Println("[OK] Port change completed successfully")
				conn.logToDatabase("Loxone Port Change Complete",
					fmt.Sprintf("Host '%s' reconnected after port rotation (lifetime reconnects: %d)",
						conn.Host, conn.totalReconnects))
			} else {
				log.Println("[OK] CONNECTION ESTABLISHED!")
				conn.logToDatabase("Loxone Connected",
					fmt.Sprintf("Host '%s' connected with %d devices (lifetime reconnects: %d)",
						conn.Host, deviceCount, conn.totalReconnects))
			}

			return
		}
	}

	log.Printf("❌ [%s] All %d connection attempts failed, will retry later", conn.Host, maxRetries)
	conn.logToDatabase("Loxone Connection Exhausted",
		fmt.Sprintf("Host '%s': All %d connection attempts failed", conn.Host, maxRetries))

	go func() {
		conn.mu.Lock()
		backoff := conn.maxBackoff
		conn.mu.Unlock()

		time.Sleep(backoff)

		conn.mu.Lock()
		isShuttingDown := conn.isShuttingDown
		conn.mu.Unlock()

		if !isShuttingDown {
			log.Printf("🔄 [%s] Scheduling new reconnection attempt after cooldown", conn.Host)
			go conn.ConnectWithBackoff(db)
		}
	}()
}

// performConnection handles the connection setup after websocket is established
func (conn *LoxoneWebSocketConnection) performConnection(ws *websocket.Conn, db *sql.DB) bool {
	conn.mu.Lock()
	conn.ws = ws
	conn.consecutiveConnFails = 0
	conn.lastConnectionTime = time.Now()
	conn.mu.Unlock()

	log.Printf("✔️ WebSocket connected successfully")
	log.Printf("Step 2: Starting token-based authentication")

	if err := conn.authenticateWithToken(); err != nil {
		errMsg := fmt.Sprintf("Authentication failed: %v", err)
		log.Printf("❌ %s", errMsg)
		ws.Close()

		conn.mu.Lock()
		conn.ws = nil
		conn.isConnected = false
		conn.tokenValid = false
		conn.lastError = errMsg
		conn.consecutiveAuthFails++
		conn.totalAuthFailures++

		conn.reconnectBackoff = time.Duration(math.Min(
			float64(conn.reconnectBackoff*2),
			float64(conn.maxBackoff),
		))
		conn.mu.Unlock()

		conn.updateDeviceStatus(db, fmt.Sprintf("🔴 Auth failed: %v", err))
		conn.logToDatabase("Loxone Auth Failed",
			fmt.Sprintf("Host '%s': %v (failures: %d)", conn.Host, err, conn.consecutiveAuthFails))
		return false
	}

	conn.mu.Lock()
	conn.isConnected = true
	conn.tokenValid = true
	conn.lastError = ""
	conn.consecutiveAuthFails = 0
	conn.reconnectBackoff = 2 * time.Second
	conn.totalReconnects++
	conn.lastSuccessfulAuth = time.Now()
	deviceCount := len(conn.devices)
	conn.mu.Unlock()

	log.Println("├────────────────────────────────────────────────────────────────────────")
	log.Printf("│ ✔️ CONNECTION ESTABLISHED!         │")
	log.Printf("│ Host: %-27s│", conn.Host)
	log.Printf("│ Devices: %-24d│", deviceCount)
	log.Println("└────────────────────────────────────────────────────────────────────────")

	conn.updateDeviceStatus(db, fmt.Sprintf("🟢 Connected at %s", time.Now().Format("2006-01-02 15:04:05")))
	conn.logToDatabase("Loxone Connected",
		fmt.Sprintf("Host '%s' connected with %d devices (lifetime reconnects: %d)",
			conn.Host, deviceCount, conn.totalReconnects))

	log.Printf("🎧 Starting data listener for %s...", conn.Host)
	conn.goroutinesWg.Add(1)
	go conn.readLoop(db)

	log.Printf("⏰ Starting data request scheduler for %s...", conn.Host)
	conn.goroutinesWg.Add(1)
	go conn.requestData()

	log.Printf("🔒 Starting token expiry monitor for %s...", conn.Host)
	conn.goroutinesWg.Add(1)
	go conn.monitorTokenExpiry(db)

	log.Printf("💓 Starting keepalive for %s...", conn.Host)
	conn.goroutinesWg.Add(1)
	go conn.keepalive()

	if conn.IsRemote {
		log.Printf("🌐 Starting DNS change monitor for %s...", conn.Host)
		conn.goroutinesWg.Add(1)
		go conn.monitorDNSChanges()
	}

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
	log.Printf("🔐 TOKEN AUTHENTICATION - Step 1: Request key exchange")
	log.Printf("   Using Loxone API v2 (getkey2)")

	getKeyCmd := fmt.Sprintf("jdev/sys/getkey2/%s", conn.Username)
	log.Printf("   → Sending: %s", getKeyCmd)

	if err := conn.safeWriteMessage(websocket.TextMessage, []byte(getKeyCmd)); err != nil {
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

	log.Printf("   ✔️ Received key: %s...", keyData.Key[:min(len(keyData.Key), 16)])
	log.Printf("   ✔️ Received salt: %s...", keyData.Salt[:min(len(keyData.Salt), 16)])
	log.Printf("   ✔️ Hash algorithm: %s", keyData.HashAlg)

	log.Printf("🔐 TOKEN AUTHENTICATION - Step 2: Hash password with salt")

	pwSaltStr := conn.Password + ":" + keyData.Salt
	var pwHashHex string

	switch strings.ToUpper(keyData.HashAlg) {
	case "SHA256":
		pwHash := sha256.Sum256([]byte(pwSaltStr))
		pwHashHex = strings.ToUpper(hex.EncodeToString(pwHash[:]))
		log.Printf("   ✔️ Using SHA256 for password hash")
	case "SHA1":
		pwHash := sha1.Sum([]byte(pwSaltStr))
		pwHashHex = strings.ToUpper(hex.EncodeToString(pwHash[:]))
		log.Printf("   ✔️ Using SHA1 for password hash")
	default:
		return fmt.Errorf("unsupported hash algorithm: %s", keyData.HashAlg)
	}

	log.Printf("   ✔️ Password hashed with salt")

	log.Printf("🔐 TOKEN AUTHENTICATION - Step 3: Create HMAC token")

	keyBytes, err := hex.DecodeString(keyData.Key)
	if err != nil {
		return fmt.Errorf("failed to decode key: %v", err)
	}

	hmacMessage := conn.Username + ":" + pwHashHex
	h := hmac.New(sha1.New, keyBytes)
	h.Write([]byte(hmacMessage))
	hmacHash := hex.EncodeToString(h.Sum(nil))

	log.Printf("   ✔️ HMAC created")

	log.Printf("🔐 TOKEN AUTHENTICATION - Step 4: Request authentication token")

	uuid := "zev-billing-system"
	info := "ZEV-Billing"
	permission := "2"

	getTokenCmd := fmt.Sprintf("jdev/sys/gettoken/%s/%s/%s/%s/%s",
		hmacHash, conn.Username, permission, uuid, info)

	log.Printf("   → Sending token request")

	if err := conn.safeWriteMessage(websocket.TextMessage, []byte(getTokenCmd)); err != nil {
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

	log.Printf("   ✔️ Token received: %s...", tokenData.Token[:min(len(tokenData.Token), 16)])

	tokenValidTime := loxoneEpoch.Add(time.Duration(tokenData.ValidUntil) * time.Second)

	log.Printf("   ✔️ Valid until: %v", tokenValidTime.Format("2006-01-02 15:04:05"))
	log.Printf("   ✔️ Raw validUntil: %d seconds since 2009-01-01", tokenData.ValidUntil)
	log.Printf("   ✔️ Rights: %d", tokenData.Rights)

	if tokenData.Unsecure {
		log.Printf("   ⚠️ WARNING: Unsecure password flag is set")
	}

	conn.mu.Lock()
	conn.token = tokenData.Token
	conn.tokenValid = true
	conn.tokenExpiry = tokenValidTime
	conn.mu.Unlock()

	log.Printf("   ✔️ AUTHENTICATION SUCCESSFUL!")
	log.Printf("   Session is now authenticated and ready")
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

	if len(message) < 3 {
		log.Printf("   🔍 Message too short to be JSON (%d bytes)", len(message))
		return nil
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

	log.Printf("   🔍 No valid JSON found in message")
	return nil
}

// keepalive sends periodic keepalive messages
func (conn *LoxoneWebSocketConnection) keepalive() {
	defer conn.goroutinesWg.Done()

	log.Printf("💓 KEEPALIVE STARTED for %s (interval: 4 minutes)", conn.Host)

	ticker := time.NewTicker(4 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-conn.stopChan:
			log.Printf("🗑️ [%s] Keepalive stopping", conn.Host)
			return
		case <-ticker.C:
			conn.mu.Lock()
			if !conn.isConnected || conn.ws == nil {
				log.Printf("⚠️ [%s] Not connected, keepalive stopping", conn.Host)
				conn.mu.Unlock()
				return
			}

			if conn.collectionInProgress {
				log.Printf("⏳ [%s] Collection in progress, skipping keepalive", conn.Host)
				conn.mu.Unlock()
				continue
			}
			conn.mu.Unlock()

			keepaliveCmd := "keepalive"
			log.Printf("💓 [%s] Sending keepalive...", conn.Host)

			if err := conn.safeWriteMessage(websocket.TextMessage, []byte(keepaliveCmd)); err != nil {
				log.Printf("❌ [%s] Failed to send keepalive: %v", conn.Host, err)
				conn.mu.Lock()
				conn.isConnected = false
				conn.tokenValid = false
				conn.lastError = fmt.Sprintf("Keepalive failed: %v", err)
				conn.mu.Unlock()

				conn.logToDatabase("Loxone Keepalive Failed",
					fmt.Sprintf("Host '%s': %v - triggering reconnect", conn.Host, err))

				go conn.ConnectWithBackoff(conn.db)
				return
			}

			log.Printf("✔️ [%s] Keepalive sent successfully", conn.Host)
		}
	}
}

func (conn *LoxoneWebSocketConnection) monitorTokenExpiry(db *sql.DB) {
	defer conn.goroutinesWg.Done()

	log.Printf("🔒 TOKEN MONITOR STARTED for %s (collection-window aware)", conn.Host)

	ticker := time.NewTicker(3 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-conn.stopChan:
			log.Printf("🗑️ [%s] Token monitor stopping", conn.Host)
			return
		case <-ticker.C:
			conn.mu.Lock()
			isConnected := conn.isConnected
			tokenValid := conn.tokenValid
			tokenExpiry := conn.tokenExpiry
			collectionInProgress := conn.collectionInProgress
			conn.mu.Unlock()

			if !isConnected {
				log.Printf("⚠️ [%s] Not connected, token monitor stopping", conn.Host)
				return
			}

			if collectionInProgress {
				log.Printf("⏳ [%s] Collection in progress, skipping token check", conn.Host)
				continue
			}

			minute := time.Now().Minute()
			nearCollection := (minute >= 58 || minute <= 2) ||
				(minute >= 13 && minute <= 17) ||
				(minute >= 28 && minute <= 32) ||
				(minute >= 43 && minute <= 47)
			if nearCollection {
				log.Printf("⏳ [%s] Near collection window (minute=%d), deferring token check", conn.Host, minute)
				continue
			}

			if !tokenValid || time.Now().After(tokenExpiry.Add(-2*time.Minute)) {
				timeUntilExpiry := time.Until(tokenExpiry)
				log.Printf("⚠️ [%s] Token invalid or expiring soon (%.1f min), refreshing...",
					conn.Host, timeUntilExpiry.Minutes())

				conn.logToDatabase("Loxone Token Expiring",
					fmt.Sprintf("Host '%s' token expiring, refreshing...", conn.Host))

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
					isShuttingDown := conn.isShuttingDown
					conn.mu.Unlock()

					conn.updateDeviceStatus(db, "🔄 Auth failed, reconnecting...")

					if !isShuttingDown {
						log.Printf("🔄 [%s] Triggering automatic reconnect", conn.Host)
						go conn.ConnectWithBackoff(db)
					}
					return
				}

				conn.updateDeviceStatus(db,
					fmt.Sprintf("🟢 Token refreshed at %s", time.Now().Format("2006-01-02 15:04:05")))
			} else {
				timeUntilExpiry := time.Until(tokenExpiry)
				log.Printf("✔️ [%s] Token valid for %.1f hours", conn.Host, timeUntilExpiry.Hours())
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

	log.Printf("⏰ DATA REQUEST SCHEDULER STARTED for %s", conn.Host)
	log.Printf("   Collection interval: 15 minutes (at :00, :15, :30, :45)")

	for {
		now := time.Now()
		next := getNextQuarterHour(now)
		waitDuration := next.Sub(now)

		log.Printf("📅 [%s] Next data request scheduled for %s (in %.0f seconds)",
			conn.Host, next.Format("15:04:05"), waitDuration.Seconds())

		select {
		case <-conn.stopChan:
			log.Printf("🗑️ [%s] Data request scheduler stopping", conn.Host)
			return
		case <-time.After(waitDuration):
		}

		conn.mu.Lock()
		conn.collectionInProgress = true
		conn.mu.Unlock()

		if err := conn.ensureAuth(); err != nil {
			log.Printf("❌ [%s] Auth check failed before data request: %v", conn.Host, err)
			log.Printf("   Skipping this collection cycle, will trigger reconnect")

			conn.mu.Lock()
			conn.isConnected = false
			conn.tokenValid = false
			conn.collectionInProgress = false
			conn.mu.Unlock()

			go conn.ConnectWithBackoff(conn.db)
			return
		}

		conn.mu.Lock()
		if !conn.isConnected || conn.ws == nil {
			log.Printf("⚠️ [%s] Not connected after auth check, stopping scheduler", conn.Host)
			conn.collectionInProgress = false
			conn.mu.Unlock()
			return
		}

		devices := conn.devices
		conn.mu.Unlock()

		log.Println("────────────────────────────────────────────────────────────────────────")
		log.Printf("📉 [%s] REQUESTING DATA FOR %d DEVICES", conn.Host, len(devices))
		log.Printf("   Time: %s", time.Now().Format("15:04:05"))

		requestFailed := false
		for _, device := range devices {
			select {
			case <-conn.stopChan:
				log.Printf("🗑️ [%s] Data request scheduler stopping during collection", conn.Host)
				conn.mu.Lock()
				conn.collectionInProgress = false
				conn.mu.Unlock()
				return
			default:
			}

			if device.Type == "meter" {
				cmd := fmt.Sprintf("jdev/sps/io/%s/all", device.DeviceID)
				log.Printf("   → METER [%s]: %s (mode: %s)", device.Name, device.DeviceID, device.LoxoneMode)

				if err := conn.safeWriteMessage(websocket.TextMessage, []byte(cmd)); err != nil {
					log.Printf("❌ Failed to request data for meter %s: %v", device.Name, err)
					conn.mu.Lock()
					conn.isConnected = false
					conn.tokenValid = false
					conn.lastError = fmt.Sprintf("Data request failed: %v", err)
					conn.mu.Unlock()
					conn.logToDatabase("Loxone Data Request Failed",
						fmt.Sprintf("Meter '%s': %v", device.Name, err))
					requestFailed = true
					break
				}
				time.Sleep(100 * time.Millisecond)

				if device.LoxoneMode == "virtual_output_dual" && device.ExportDeviceID != "" {
					cmdExport := fmt.Sprintf("jdev/sps/io/%s/all", device.ExportDeviceID)
					log.Printf("      ├─ Export UUID: %s", device.ExportDeviceID)

					if err := conn.safeWriteMessage(websocket.TextMessage, []byte(cmdExport)); err != nil {
						log.Printf("❌ Failed to request export data for meter %s: %v", device.Name, err)
						requestFailed = true
						break
					}
					time.Sleep(100 * time.Millisecond)
				}
			} else if device.Type == "charger" {
				if device.ChargerBlockUUID != "" {
					log.Printf("   → CHARGER [%s]: single-block mode (session tracking)", device.Name)
					log.Printf("      └─ Block UUID: %s", device.ChargerBlockUUID)

					cmd := fmt.Sprintf("jdev/sps/io/%s/all", device.ChargerBlockUUID)

					if err := conn.safeWriteMessage(websocket.TextMessage, []byte(cmd)); err != nil {
						log.Printf("❌ Failed to request data for charger %s: %v", device.Name, err)
						conn.mu.Lock()
						conn.isConnected = false
						conn.tokenValid = false
						conn.lastError = fmt.Sprintf("Data request failed: %v", err)
						conn.mu.Unlock()
						conn.logToDatabase("Loxone Data Request Failed",
							fmt.Sprintf("Charger '%s': %v", device.Name, err))
						requestFailed = true
						break
					}
					time.Sleep(100 * time.Millisecond)
				} else {
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
						cmd := fmt.Sprintf("jdev/sps/io/%s/all", u.uuid)
						log.Printf("      ├─ %s UUID: %s", u.name, u.uuid)

						if err := conn.safeWriteMessage(websocket.TextMessage, []byte(cmd)); err != nil {
							log.Printf("❌ Failed to request %s for charger %s: %v", u.name, device.Name, err)
							conn.mu.Lock()
							conn.isConnected = false
							conn.tokenValid = false
							conn.lastError = fmt.Sprintf("Data request failed: %v", err)
							conn.mu.Unlock()
							conn.logToDatabase("Loxone Data Request Failed",
								fmt.Sprintf("Charger '%s' %s: %v", device.Name, u.name, err))
							requestFailed = true
							break
						}
						time.Sleep(100 * time.Millisecond)
					}

					if requestFailed {
						break
					}
				}
			}
		}

		conn.mu.Lock()
		conn.collectionInProgress = false
		conn.mu.Unlock()

		if requestFailed {
			log.Printf("   ❌ Data request failed, scheduler stopping")
			return
		}

		log.Printf("   ✔️ All data requests sent successfully")
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

		conn.lastDisconnectTime = time.Now()
		conn.lastDisconnectReason = "read_error"

		isShuttingDown := conn.isShuttingDown
		conn.mu.Unlock()

		if conn.IsRemote {
			log.Printf("[INFO] [%s] Connection closed (possible port rotation)", conn.Host)
			conn.logToDatabase("Loxone Connection Closed",
				fmt.Sprintf("Host '%s' disconnected (checking for port change)", conn.Host))
		} else {
			log.Printf("[WARN] [%s] DISCONNECTED from Loxone", conn.Host)
			conn.logToDatabase("Loxone Disconnected",
				fmt.Sprintf("Host '%s' disconnected unexpectedly", conn.Host))
		}

		log.Printf("🔴 [%s] DISCONNECTED from Loxone", conn.Host)

		conn.updateDeviceStatus(db,
			fmt.Sprintf("🔴 Offline since %s", time.Now().Format("2006-01-02 15:04:05")))
		conn.logToDatabase("Loxone Disconnected", fmt.Sprintf("Host '%s' disconnected", conn.Host))

		if !isShuttingDown {
			log.Printf("Triggering automatic reconnect for %s", conn.Host)
			go conn.ConnectWithBackoff(db)
		} else {
			log.Printf("Not reconnecting %s - connection is shutting down", conn.Host)
		}
	}()

	log.Printf("🕿 [%s] DATA LISTENER ACTIVE - waiting for messages...", conn.Host)

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
				time.Sleep(10 * time.Millisecond)
			default:
				log.Printf("⚠️ [%s] Read channel full, dropping message", conn.Host)
			}

			if err != nil {
				return
			}
		}
	}()

	for {
		select {
		case <-conn.stopChan:
			log.Printf("🗑️ [%s] Received stop signal, closing listener", conn.Host)
			return

		case result := <-readChan:
			if result.err != nil {
				if strings.Contains(result.err.Error(), "i/o timeout") ||
					strings.Contains(result.err.Error(), "deadline") {
					log.Printf("⏱️ [%s] Read timeout (expected between data requests)", conn.Host)
					continue
				}

				if strings.Contains(result.err.Error(), "websocket: close") {
					log.Printf("ℹ️ [%s] WebSocket closed normally", conn.Host)
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
				log.Printf("  ℹ️ [%s] Empty response received (likely keepalive ACK or status message)", conn.Host)
				continue
			}

			messageCount++

			var response LoxoneResponse
			if err := json.Unmarshal(result.jsonData, &response); err != nil {
				log.Printf("⚠️ [%s] Failed to parse JSON response: %v", conn.Host, err)
				log.Printf("⚠️ Raw JSON (first 500 chars): %s", string(result.jsonData[:min(len(result.jsonData), 500)]))
				continue
			}

			if response.LL.Code == "401" || response.LL.Code == "403" {
				log.Printf("🔒 [%s] Auth error detected in response (code: %s)", conn.Host, response.LL.Code)

				conn.mu.Lock()
				conn.tokenValid = false
				conn.consecutiveAuthFails++
				conn.totalAuthFailures++
				conn.mu.Unlock()

				conn.logToDatabase("Loxone Auth Error",
					fmt.Sprintf("Host '%s' received auth error code %s - triggering reconnect",
						conn.Host, response.LL.Code))

				return
			}

			conn.mu.Lock()
			devices := conn.devices
			conn.mu.Unlock()

			for _, device := range devices {
				if device.Type == "meter" {
					expectedControl := fmt.Sprintf("dev/sps/io/%s/all", device.DeviceID)
					if strings.Contains(response.LL.Control, expectedControl) {
						conn.processMeterData(device, response, db, false)
						break
					}

					if device.LoxoneMode == "virtual_output_dual" && device.ExportDeviceID != "" {
						expectedExportControl := fmt.Sprintf("dev/sps/io/%s/all", device.ExportDeviceID)
						if strings.Contains(response.LL.Control, expectedExportControl) {
							conn.processMeterData(device, response, db, true)
							break
						}
					}
				} else if device.Type == "charger" {
					if device.ChargerBlockUUID != "" {
						expectedControl := fmt.Sprintf("dev/sps/io/%s/all", device.ChargerBlockUUID)
						if strings.Contains(response.LL.Control, expectedControl) {
							log.Printf("   🎯 [%s] Matched single-block UUID: %s", device.Name, device.ChargerBlockUUID)
							conn.processChargerSingleBlock(device, response, db)
							break
						}
					} else {
						uuidMap := map[string]string{
							device.PowerUUID:  "power",
							device.StateUUID:  "state",
							device.UserIDUUID: "user_id",
							device.ModeUUID:   "mode",
						}

						for uuid, fieldName := range uuidMap {
							expectedControl := fmt.Sprintf("dev/sps/io/%s/all", uuid)
							if strings.Contains(response.LL.Control, expectedControl) {
								log.Printf("   🎯 [%s] Matched UUID for field '%s': %s", device.Name, fieldName, uuid)

								if chargerData[device.ID] == nil {
									chargerData[device.ID] = &ChargerDataCollection{}
									log.Printf("   📋 [%s] Created new data collection for charger", device.Name)
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
}

// processMeterData handles meter readings
func (conn *LoxoneWebSocketConnection) processMeterData(device *LoxoneDevice, response LoxoneResponse, db *sql.DB, isExport bool) {
	var reading float64

	var meterType string
	db.QueryRow("SELECT meter_type FROM meters WHERE id = ?", device.ID).Scan(&meterType)
	supportsExport := (meterType == "total_meter" || meterType == "solar_meter")
	isSolarMeter := (meterType == "solar_meter")

	if device.LoxoneMode == "meter_block" {
		var importReading, exportReading float64

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

		device.lastReading = importReading
		device.lastReadingExport = exportReading
		device.lastUpdate = time.Now()
		device.readingGaps = 0

		log.Printf("   📥 Import reading (output1/Mrc): %.3f kWh", importReading)
		if supportsExport {
			log.Printf("   📤 Export reading (output8/Mrd): %.3f kWh", exportReading)
		}

		reading = importReading

	} else if device.LoxoneMode == "energy_meter_block" {
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
		log.Printf("   📊 Reading (output1/Mr): %.3f kWh", reading)

	} else if device.LoxoneMode == "virtual_output_dual" {
		var currentValue float64
		if output1, ok := response.LL.Outputs["output1"]; ok {
			switch v := output1.Value.(type) {
			case float64:
				currentValue = v
			case string:
				if f, err := strconv.ParseFloat(v, 64); err == nil {
					currentValue = f
				}
			}
		} else if response.LL.Value != "" {
			if f, err := strconv.ParseFloat(response.LL.Value, 64); err == nil {
				currentValue = f
			}
		}

		if isExport {
			if currentValue <= 0 {
				log.Printf("   ⚠️ Export reading is 0 or negative, skipping")
				return
			}

			device.lastReadingExport = currentValue
			log.Printf("   📤 Export reading received: %.3f kWh", currentValue)

			if time.Since(device.lastUpdate) < 30*time.Second && device.lastReading > 0 {
				log.Printf("   ✅ Both readings available (import: %.3f kWh), saving to database", device.lastReading)
				reading = device.lastReading
			} else if isSolarMeter {
				var lastImportFromDB float64
				err := db.QueryRow(`
					SELECT power_kwh FROM meter_readings 
					WHERE meter_id = ? 
					ORDER BY reading_time DESC LIMIT 1
				`, device.ID).Scan(&lastImportFromDB)

				if err == nil && lastImportFromDB > 0 {
					log.Printf("   ☀️ Solar meter: No recent import, using last DB value: %.3f kWh", lastImportFromDB)
					device.lastReading = lastImportFromDB
					reading = lastImportFromDB
				} else {
					log.Printf("   ☀️ Solar meter: No import value available, using 0")
					device.lastReading = 0
					reading = 0
				}
				device.lastUpdate = time.Now()
			} else {
				log.Printf("   ⏳ Waiting for import reading...")
				return
			}
		} else {
			if currentValue > 0 {
				device.lastReading = currentValue
				log.Printf("   📥 Import reading received: %.3f kWh", currentValue)
			} else if isSolarMeter {
				var lastImportFromDB float64
				err := db.QueryRow(`
					SELECT power_kwh FROM meter_readings 
					WHERE meter_id = ? 
					ORDER BY reading_time DESC LIMIT 1
				`, device.ID).Scan(&lastImportFromDB)

				if err == nil && lastImportFromDB > 0 {
					log.Printf("   ☀️ Solar meter: Import is 0, using last DB value: %.3f kWh", lastImportFromDB)
					device.lastReading = lastImportFromDB
				} else {
					log.Printf("   ☀️ Solar meter: Import is 0, no previous value, using 0")
					device.lastReading = 0
				}
			} else {
				log.Printf("   ⚠️ Import reading is 0 or negative, skipping")
				return
			}

			device.lastUpdate = time.Now()

			if device.lastReadingExport > 0 {
				log.Printf("   ✅ Both readings available (export: %.3f kWh), saving to database", device.lastReadingExport)
				reading = device.lastReading
			} else {
				log.Printf("   ⏳ Waiting for export reading...")
				return
			}
		}

		device.readingGaps = 0

	} else if device.LoxoneMode == "virtual_output_single" {
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
		log.Printf("   📊 Reading: %.3f kWh", reading)
	}

	if reading < 0 {
		return
	}
	if reading == 0 && !isSolarMeter {
		return
	}
	if reading == 0 && isSolarMeter && device.lastReadingExport <= 0 {
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
			exportValue := lastReadingExport
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
			log.Printf("   ⚠️ Filled %d reading gaps for meter %s", len(interpolated), device.Name)
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
		log.Printf("❌ Failed to save reading to database: %v", err)
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
			fmt.Sprintf("🟢 Last update: %s", time.Now().Format("2006-01-02 15:04:05")),
			device.ID)

		if !isFirstReading {
			if supportsExport {
				log.Printf("✔️ METER [%s]: %.3f kWh import (Δ%.3f), %.3f kWh export (Δ%.3f)",
					device.Name, reading, consumption, device.lastReadingExport, consumptionExport)
			} else {
				log.Printf("✔️ METER [%s]: %.3f kWh (Δ%.3f)",
					device.Name, reading, consumption)
			}
		} else {
			if supportsExport {
				log.Printf("✔️ METER [%s]: %.3f kWh import, %.3f kWh export (first reading)",
					device.Name, reading, device.lastReadingExport)
			} else {
				log.Printf("✔️ METER [%s]: %.3f kWh (first reading)",
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
	log.Printf("   🔍 [%s] Processing field '%s'", device.Name, fieldName)
	log.Printf("   🔍 Response Control: %s", response.LL.Control)
	log.Printf("   🔍 Response Code: %s", response.LL.Code)
	log.Printf("   🔍 Response Value: %s", response.LL.Value)
	log.Printf("   🔍 Number of outputs: %d", len(response.LL.Outputs))

	for key := range response.LL.Outputs {
		log.Printf("   🔍 Found output key: %s", key)
	}

	if output1, ok := response.LL.Outputs["output1"]; ok {
		log.Printf("   🔍 output1 found - Value type: %T, Value: %v", output1.Value, output1.Value)
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
					log.Printf("   ⚠️ [%s] Failed to parse power from output1: '%s' (err: %v)", device.Name, v, err)
				}
			}
			collection.Power = &power
			log.Printf("   📜 [%s] Received power: %.4f kWh", device.Name, power)

		case "state":
			var state string
			switch v := output1.Value.(type) {
			case string:
				state = v
			case float64:
				state = fmt.Sprintf("%.0f", v)
			}
			collection.State = &state
			log.Printf("   🔒 [%s] Received state: %s", device.Name, state)

		case "user_id":
			var userID string
			switch v := output1.Value.(type) {
			case string:
				userID = v
			case float64:
				userID = fmt.Sprintf("%.0f", v)
			}
			collection.UserID = &userID
			log.Printf("   👩‍🔧 [%s] Received user_id: %s", device.Name, userID)

		case "mode":
			var mode string
			switch v := output1.Value.(type) {
			case string:
				mode = v
			case float64:
				mode = fmt.Sprintf("%.0f", v)
			}
			collection.Mode = &mode
			log.Printf("   ⚙️ [%s] Received mode: %s", device.Name, mode)
		}

		hasAll := collection.Power != nil && collection.State != nil &&
			collection.UserID != nil && collection.Mode != nil

		log.Printf("   📦 [%s] Collection status: Power=%v State=%v UserID=%v Mode=%v (Complete=%v)",
			device.Name,
			collection.Power != nil, collection.State != nil,
			collection.UserID != nil, collection.Mode != nil,
			hasAll)

		if hasAll {
			log.Printf("   ✔️ [%s] All fields collected, saving to database", device.Name)
			conn.saveChargerDataLegacy(device, collection, db)

			collection.Power = nil
			collection.State = nil
			collection.UserID = nil
			collection.Mode = nil
		}
	} else {
		log.Printf("   ⚠️ [%s] output1 not found in response for field '%s'", device.Name, fieldName)

		if response.LL.Value != "" {
			log.Printf("   🔍 Trying to use response.LL.Value: %s", response.LL.Value)

			switch fieldName {
			case "power":
				cleanValue := stripUnitSuffix(response.LL.Value)
				if f, err := strconv.ParseFloat(cleanValue, 64); err == nil {
					collection.Power = &f
					log.Printf("   📜 [%s] Received power from Value: %.4f kWh (from '%s')", device.Name, f, response.LL.Value)
				} else {
					log.Printf("   ❌ [%s] Failed to parse power from Value: '%s' (err: %v)", device.Name, response.LL.Value, err)
				}
			case "state":
				state := response.LL.Value
				collection.State = &state
				log.Printf("   🔒 [%s] Received state from Value: %s", device.Name, state)
			case "user_id":
				userID := response.LL.Value
				collection.UserID = &userID
				log.Printf("   👩‍🔧 [%s] Received user_id from Value: %s", device.Name, userID)
			case "mode":
				mode := response.LL.Value
				collection.Mode = &mode
				log.Printf("   ⚙️ [%s] Received mode from Value: %s", device.Name, mode)
			}

			hasAll := collection.Power != nil && collection.State != nil &&
				collection.UserID != nil && collection.Mode != nil

			log.Printf("   📦 [%s] Collection status: Power=%v State=%v UserID=%v Mode=%v (Complete=%v)",
				device.Name,
				collection.Power != nil, collection.State != nil,
				collection.UserID != nil, collection.Mode != nil,
				hasAll)

			if hasAll {
				log.Printf("   ✔️ [%s] All fields collected, saving to database", device.Name)
				conn.saveChargerDataLegacy(device, collection, db)

				collection.Power = nil
				collection.State = nil
				collection.UserID = nil
				collection.Mode = nil
			}
		} else {
			log.Printf("   ❌ [%s] No data found for field '%s' in response", device.Name, fieldName)
		}
	}
}

// processChargerSingleBlock processes all charger data from a single Loxone response
// UPDATED: Writes to database every 15 minutes + final reading after session ends
func (conn *LoxoneWebSocketConnection) processChargerSingleBlock(device *LoxoneDevice, response LoxoneResponse, db *sql.DB) {
	log.Printf("   🔍 [%s] Processing single-block response (session tracking mode)", device.Name)
	log.Printf("   📦 Number of outputs: %d", len(response.LL.Outputs))

	// Extract values from outputs
	var totalEnergyKWh float64
	var chargingPowerKW float64
	var modeValue string
	var userID string
	var vehicleConnected int
	var chargingActive int
	var currentSessionEnergyKWh float64
	var lastSessionLog string

	// Extract output1 (Vc) - Vehicle Connected
	if output1, ok := response.LL.Outputs["output1"]; ok {
		switch v := output1.Value.(type) {
		case float64:
			vehicleConnected = int(v)
		case string:
			if f, err := strconv.ParseFloat(v, 64); err == nil {
				vehicleConnected = int(f)
			}
		}
		log.Printf("      ├─ output1 (Vc - Vehicle Connected): %d", vehicleConnected)
	}

	// Extract output2 (Cac) - Charging Active
	if output2, ok := response.LL.Outputs["output2"]; ok {
		switch v := output2.Value.(type) {
		case float64:
			chargingActive = int(v)
		case string:
			if f, err := strconv.ParseFloat(v, 64); err == nil {
				chargingActive = int(f)
			}
		}
		log.Printf("      ├─ output2 (Cac - Charging Active): %d", chargingActive)
	}

	// Extract output3 (Cp) - Charging Power
	if output3, ok := response.LL.Outputs["output3"]; ok {
		switch v := output3.Value.(type) {
		case float64:
			chargingPowerKW = v
		case string:
			cleanValue := stripUnitSuffix(v)
			if f, err := strconv.ParseFloat(cleanValue, 64); err == nil {
				chargingPowerKW = f
			}
		}
		log.Printf("      ├─ output3 (Cp - Charging Power): %.3f kW", chargingPowerKW)
	}

	// Extract output4 (M) - Mode
	if output4, ok := response.LL.Outputs["output4"]; ok {
		switch v := output4.Value.(type) {
		case string:
			modeValue = v
		case float64:
			modeValue = fmt.Sprintf("%.0f", v)
		}
		log.Printf("      ├─ output4 (M - Mode): %s", modeValue)
	}

	// Extract output7 (Mr) - Total Energy Meter
	if output7, ok := response.LL.Outputs["output7"]; ok {
		switch v := output7.Value.(type) {
		case float64:
			totalEnergyKWh = v
		case string:
			cleanValue := stripUnitSuffix(v)
			if f, err := strconv.ParseFloat(cleanValue, 64); err == nil {
				totalEnergyKWh = f
			}
		}
		log.Printf("      ├─ output7 (Mr - Total Energy): %.3f kWh", totalEnergyKWh)
	}

	// Extract output8 (Ccc) - Current Session Energy
	if output8, ok := response.LL.Outputs["output8"]; ok {
		switch v := output8.Value.(type) {
		case float64:
			currentSessionEnergyKWh = v
		case string:
			cleanValue := stripUnitSuffix(v)
			if f, err := strconv.ParseFloat(cleanValue, 64); err == nil {
				currentSessionEnergyKWh = f
			}
		}
		log.Printf("      ├─ output8 (Ccc - Current Session Energy): %.3f kWh", currentSessionEnergyKWh)
	}

	// Extract output17 (Lcl) - Last Session Log
	if output17, ok := response.LL.Outputs["output17"]; ok {
		switch v := output17.Value.(type) {
		case string:
			lastSessionLog = v
		}
		log.Printf("      ├─ output17 (Lcl - Last Session Log): %s", lastSessionLog)
	}

	// Extract output21 (Uid) - User ID
	if output21, ok := response.LL.Outputs["output21"]; ok {
		switch v := output21.Value.(type) {
		case string:
			userID = v
		case float64:
			if v > 0 {
				userID = fmt.Sprintf("%.0f", v)
			}
		}
		log.Printf("      └─ output21 (Uid - User ID): '%s'", userID)
	}

	// Determine state based on vehicle connection and charging status
	var stateValue string
	var stateDescription string
	if vehicleConnected == 0 {
		stateValue = "0"
		stateDescription = "Disconnected"
	} else if chargingActive == 1 {
		stateValue = "1"
		stateDescription = "Charging"
	} else {
		stateValue = "0"
		stateDescription = "Connected (not charging)"
	}

	modeDescription := getModeDescription(modeValue)

	// Update device state
	device.lastReading = totalEnergyKWh
	device.lastUpdate = time.Now()
	device.readingGaps = 0

	// Update live data for UI
	if conn.collector != nil {
		conn.collector.chargerMu.Lock()
		liveData := conn.collector.liveChargerData[device.ID]
		if liveData == nil {
			liveData = &LoxoneChargerLiveData{
				ChargerID:   device.ID,
				ChargerName: device.Name,
			}
			conn.collector.liveChargerData[device.ID] = liveData
		}

		liveData.IsOnline = true
		liveData.VehicleConnected = vehicleConnected == 1
		liveData.ChargingActive = chargingActive == 1
		liveData.State = stateValue
		liveData.StateDescription = stateDescription
		liveData.CurrentPower_kW = chargingPowerKW
		liveData.TotalEnergy_kWh = totalEnergyKWh
		liveData.SessionEnergy_kWh = currentSessionEnergyKWh
		liveData.Mode = modeValue
		liveData.ModeDescription = modeDescription
		liveData.UserID = userID
		liveData.Timestamp = time.Now()

		activeSession := conn.collector.activeSessions[device.ID]
		conn.collector.chargerMu.Unlock()

		// ========== SESSION TRACKING LOGIC ==========
		currentTime := roundToQuarterHour(time.Now())

		if chargingActive == 1 {
			// CHARGING IS ACTIVE
			if activeSession == nil {
				// Start new session
				log.Printf("   ⚡ [%s] CHARGING STARTED - Creating new session", device.Name)
				newSession := &LoxoneActiveChargerSession{
					ChargerID:       device.ID,
					ChargerName:     device.Name,
					StartTime:       currentTime,
					StartEnergy_kWh: totalEnergyKWh,
					UserID:          userID,
					Mode:            modeValue,
					LastLclValue:    lastSessionLog,
					LastWriteTime:   currentTime,
				}

				conn.collector.chargerMu.Lock()
				conn.collector.activeSessions[device.ID] = newSession
				conn.collector.liveChargerData[device.ID].SessionStart = newSession.StartTime
				conn.collector.chargerMu.Unlock()

				// Write first reading to database with charging state
				_, err := db.Exec(`
					INSERT INTO charger_sessions (charger_id, user_id, session_time, power_kwh, mode, state)
					VALUES (?, ?, ?, ?, ?, ?)
				`, device.ID, userID, currentTime.Format("2006-01-02 15:04:05"), totalEnergyKWh, modeValue, "1")

				if err != nil {
					log.Printf("   ❌ [%s] Failed to write session start: %v", device.Name, err)
				} else {
					log.Printf("   ✅ [%s] Session start written to DB: %.3f kWh", device.Name, totalEnergyKWh)
				}

				conn.logToDatabase("Loxone Charger Session Started",
					fmt.Sprintf("Charger '%s': Session started at %.3f kWh", device.Name, totalEnergyKWh))
			} else {
				// Session ongoing - write reading at 15-minute intervals
				if time.Since(activeSession.LastWriteTime) >= 15*time.Minute {
					_, err := db.Exec(`
						INSERT INTO charger_sessions (charger_id, user_id, session_time, power_kwh, mode, state)
						VALUES (?, ?, ?, ?, ?, ?)
					`, device.ID, userID, currentTime.Format("2006-01-02 15:04:05"), totalEnergyKWh, modeValue, "1")

					if err != nil {
						log.Printf("   ❌ [%s] Failed to write interval reading: %v", device.Name, err)
					} else {
						conn.collector.chargerMu.Lock()
						activeSession.LastWriteTime = currentTime
						if userID != "" {
							activeSession.UserID = userID
						}
						conn.collector.chargerMu.Unlock()

						log.Printf("   ✅ [%s] Interval reading written: %.3f kWh, Power: %.2f kW",
							device.Name, totalEnergyKWh, chargingPowerKW)
					}
				} else {
					log.Printf("   ⚡ [%s] CHARGING: Energy: %.3f kWh, Power: %.2f kW (next write in %.0fs)",
						device.Name, totalEnergyKWh, chargingPowerKW,
						(15*time.Minute - time.Since(activeSession.LastWriteTime)).Seconds())
				}
			}
		} else {
			// CHARGING IS NOT ACTIVE
			if activeSession != nil {
				// Session just ended
				conn.collector.chargerMu.Lock()
				lclChanged := lastSessionLog != activeSession.LastLclValue && lastSessionLog != ""
				conn.collector.chargerMu.Unlock()

				if lclChanged || currentSessionEnergyKWh < 0.1 {
					// Session ended - parse Lcl and write final reading
					log.Printf("   🏁 [%s] CHARGING ENDED - Processing session", device.Name)

					parsedUserID, parsedEnergy, _ := parseLclString(lastSessionLog)
					if parsedUserID == "" {
						parsedUserID = activeSession.UserID
					}
					if parsedUserID == "" {
						parsedUserID = "unknown"
					}

					// Write final reading with charging state (so billing captures full session)
					_, err := db.Exec(`
						INSERT INTO charger_sessions (charger_id, user_id, session_time, power_kwh, mode, state)
						VALUES (?, ?, ?, ?, ?, ?)
					`, device.ID, parsedUserID, currentTime.Format("2006-01-02 15:04:05"), totalEnergyKWh, activeSession.Mode, "1")

					if err != nil {
						log.Printf("   ❌ [%s] Failed to write final reading: %v", device.Name, err)
					} else {
						log.Printf("   ✅ [%s] Final reading written: %.3f kWh, Session: %.3f kWh, User: %s",
							device.Name, totalEnergyKWh, parsedEnergy, parsedUserID)
					}

					// Clear active session
					conn.collector.chargerMu.Lock()
					delete(conn.collector.activeSessions, device.ID)
					conn.collector.chargerMu.Unlock()

					conn.logToDatabase("Loxone Charger Session Completed",
						fmt.Sprintf("Charger '%s': Session completed - User: %s, Energy: %.3f kWh",
							device.Name, parsedUserID, parsedEnergy))
				}
			}
		}
	}

	log.Printf("   ✅ [%s] Live data updated: Energy=%.3f kWh, Power=%.2f kW, State=%s (%s), Mode=%s",
		device.Name, totalEnergyKWh, chargingPowerKW, stateValue, stateDescription, modeDescription)
}

// parseLclString parses the Lcl (Last Session Log) string to extract session details
func parseLclString(lcl string) (userID string, energy float64, endTime time.Time) {
	if lcl == "" {
		return "", 0, time.Time{}
	}

	// Parse end time from beginning
	if len(lcl) >= 19 {
		timeStr := lcl[:19]
		if t, err := time.ParseInLocation("2006-01-02 15:04:05", timeStr, time.Local); err == nil {
			endTime = t
		}
	}

	// Parse user ID
	userRegex := regexp.MustCompile(`user:(\d+)`)
	if matches := userRegex.FindStringSubmatch(lcl); len(matches) > 1 {
		userID = matches[1]
	}

	// Parse energy
	energyRegex := regexp.MustCompile(`Geladene Energie:(\d+\.?\d*)kWh`)
	if matches := energyRegex.FindStringSubmatch(lcl); len(matches) > 1 {
		if e, err := strconv.ParseFloat(matches[1], 64); err == nil {
			energy = e
		}
	}

	return userID, energy, endTime
}

// getModeDescription returns a human-readable description of the charging mode
func getModeDescription(mode string) string {
	switch mode {
	case "1", "2", "3", "4", "5":
		return fmt.Sprintf("Solar Mode %s", mode)
	case "99":
		return "Priority Charging"
	default:
		return fmt.Sprintf("Mode %s", mode)
	}
}

// saveChargerDataLegacy - Original implementation for multi-UUID chargers (legacy mode)
func (conn *LoxoneWebSocketConnection) saveChargerDataLegacy(device *LoxoneDevice, collection *ChargerDataCollection, db *sql.DB) {
	power := *collection.Power
	state := *collection.State
	userID := *collection.UserID
	mode := *collection.Mode

	device.lastReading = power
	device.lastUpdate = time.Now()
	device.readingGaps = 0

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
			log.Printf("   ⚠️ Filled %d reading gaps for charger %s", len(interpolated), device.Name)
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
		log.Printf("✔️ CHARGER [%s]: %.4f kWh (user: %s, mode: %s, state: %s)",
			device.Name, power, userID, mode, state)

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
	log.Printf("🗑️ Closing connection for %s", conn.Host)
	conn.mu.Lock()

	conn.isShuttingDown = true

	if conn.stopChan != nil {
		select {
		case <-conn.stopChan:
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

	log.Printf("  ⏳ Waiting for goroutines to finish...")
	conn.goroutinesWg.Wait()
	log.Printf("   ✔️ Connection closed")

	conn.logToDatabase("Loxone Connection Closed",
		fmt.Sprintf("Host '%s' connection closed", conn.Host))
}

func (conn *LoxoneWebSocketConnection) monitorDNSChanges() {
	defer conn.goroutinesWg.Done()

	if !conn.IsRemote {
		return
	}

	log.Printf("🌐 DNS MONITOR STARTED for %s (check every 5 minutes)", conn.MacAddress)

	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-conn.stopChan:
			log.Printf("🗑️ [%s] DNS monitor stopping", conn.Host)
			return
		case <-ticker.C:
			conn.mu.Lock()
			isConnected := conn.isConnected
			currentResolvedHost := conn.ResolvedHost
			conn.mu.Unlock()

			if !isConnected {
				return
			}

			newHost, err := conn.resolveLoxoneCloudDNS()
			if err != nil {
				log.Printf("⚠️ [%s] DNS re-check failed: %v", conn.MacAddress, err)
				continue
			}

			if newHost != currentResolvedHost {
				log.Printf("🔄 [%s] DNS CHANGED DETECTED: %s → %s",
					conn.MacAddress, currentResolvedHost, newHost)
				log.Printf("   Triggering proactive reconnection...")

				conn.logToDatabase("Loxone DNS Changed Detected",
					fmt.Sprintf("MAC %s: Proactive reconnect due to DNS change", conn.MacAddress))

				conn.mu.Lock()
				if conn.ws != nil {
					conn.ws.Close()
				}
				conn.isConnected = false
				conn.mu.Unlock()

				go conn.ConnectWithBackoff(conn.db)
				return
			}

			log.Printf("✅ [%s] DNS unchanged: %s", conn.MacAddress, currentResolvedHost)
		}
	}
}

// isExpectedDuringPortChange determines if an error is expected during port rotation
func (conn *LoxoneWebSocketConnection) isExpectedDuringPortChange(err error) bool {
	if !conn.IsRemote {
		return false
	}

	if err == nil {
		return false
	}

	errStr := err.Error()

	if strings.Contains(errStr, "connection refused") ||
		strings.Contains(errStr, "connection reset") ||
		strings.Contains(errStr, "EOF") {
		if time.Since(conn.lastDisconnectTime) < 60*time.Second {
			return true
		}
	}

	return false
}