package services

import (
	"database/sql"
	"encoding/json"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// ========== ERROR TYPES ==========

type ErrorType int

const (
	ErrorTypeNetwork ErrorType = iota
	ErrorTypeAuth
	ErrorTypeDNS
	ErrorTypeTimeout
	ErrorTypeProtocol
	ErrorTypeUnknown
)

// ========== LOXONE MESSAGE TYPES ==========

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

// Loxone epoch reference time
var loxoneEpoch = time.Date(2009, 1, 1, 0, 0, 0, 0, time.UTC)

// ========== DNS CACHE ==========

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

	if time.Since(dc.lastResolved) > dc.cacheTTL {
		return "", false
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
	dc.lastResolved = time.Time{}
}

// ========== CHARGER SESSION TRACKING TYPES ==========

type LoxoneChargerLiveData struct {
	ChargerID        int
	ChargerName      string
	IsOnline         bool
	VehicleConnected bool
	ChargingActive   bool
	State            string
	StateDescription string
	CurrentPower_kW   float64
	TotalEnergy_kWh   float64
	SessionEnergy_kWh float64
	Mode            string
	ModeDescription string
	UserID          string
	UserName        string
	SessionStart    time.Time
	Timestamp       time.Time
}

type LoxoneActiveChargerSession struct {
	ChargerID       int
	ChargerName     string
	StartTime       time.Time
	StartEnergy_kWh float64
	UserID          string
	Mode            string
	LastLclValue    string
	LastWriteTime   time.Time
}

// ========== MAIN COLLECTOR TYPE ==========

type LoxoneCollector struct {
	db              *sql.DB
	connections     map[string]*LoxoneWebSocketConnection
	mu              sync.RWMutex
	liveChargerData map[int]*LoxoneChargerLiveData
	activeSessions  map[int]*LoxoneActiveChargerSession
	chargerMu       sync.RWMutex
}

// ========== CONNECTION TYPE ==========

type LoxoneWebSocketConnection struct {
	Host         string
	Username     string
	Password     string
	MacAddress   string
	IsRemote     bool
	ResolvedHost string

	ws          *websocket.Conn
	isConnected bool

	// Authentication
	token       string
	tokenValid  bool
	tokenExpiry time.Time

	devices []*LoxoneDevice

	// Error tracking
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

	// Backoff
	reconnectBackoff time.Duration
	maxBackoff       time.Duration

	// Enhanced tracking
	reconnectAttempt     int
	lastErrorType        ErrorType
	consecutiveDNSErrors int
	dnsCache             *DNSCache

	stopChan       chan bool
	goroutinesWg   sync.WaitGroup
	isReconnecting bool
	isShuttingDown bool
	mu             sync.Mutex
	db             *sql.DB

	// Reference to parent collector
	collector *LoxoneCollector
}

// ========== DEVICE TYPE ==========

type LoxoneDevice struct {
	ID       int
	Name     string
	Type     string
	DeviceID string

	// For meters
	LoxoneMode     string
	ExportDeviceID string

	// For chargers
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

// ========== RESPONSE TYPES ==========

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

// ========== CUSTOM UNMARSHAL ==========

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