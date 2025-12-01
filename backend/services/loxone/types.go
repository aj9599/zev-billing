package loxone

import (
	"database/sql"
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

// Loxone message types
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

// LoxoneEpoch is the base time for Loxone timestamps
var LoxoneEpoch = time.Date(2009, 1, 1, 0, 0, 0, 0, time.UTC)

// ========== DNS CACHE ==========

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

// ChargerLiveData holds live charger data for UI display (not persisted during charging)
type ChargerLiveData struct {
	ChargerID        int       `json:"charger_id"`
	ChargerName      string    `json:"charger_name"`
	IsOnline         bool      `json:"is_online"`

	// Current state
	VehicleConnected bool   `json:"vehicle_connected"`
	ChargingActive   bool   `json:"charging_active"`
	State            string `json:"state"`
	StateDescription string `json:"state_description"`

	// Live metrics (for UI display during charging)
	CurrentPower_kW   float64 `json:"current_power_kw"`   // Cp - output3 - Real-time charging power
	TotalEnergy_kWh   float64 `json:"total_energy"`       // Mr - output7 - Total meter reading
	SessionEnergy_kWh float64 `json:"session_energy"`     // Ccc - output8 - Current session energy

	// Mode info
	Mode            string `json:"mode"`
	ModeDescription string `json:"mode_description"`

	// User info (from Uid during charging, confirmed from Lcl after session)
	UserID   string `json:"user_id"`
	UserName string `json:"user_name"`

	// Session timing
	SessionStart time.Time `json:"session_start"`
	Timestamp    time.Time `json:"timestamp"`

	// Enhanced live data fields (from Loxone block outputs)
	LastSessionEnergy_kWh    float64 `json:"last_session_energy"`      // Clc - output9
	LastSessionDuration_sec  float64 `json:"last_session_duration_sec"` // Cld - output11
	WeeklyEnergy_kWh         float64 `json:"weekly_energy"`            // Cw - output12
	MonthlyEnergy_kWh        float64 `json:"monthly_energy"`           // Cm - output13
	LastMonthEnergy_kWh      float64 `json:"last_month_energy"`        // Clm - output14
	YearlyEnergy_kWh         float64 `json:"yearly_energy"`            // Cy - output15
	LastYearEnergy_kWh       float64 `json:"last_year_energy"`         // Cly - output16
}

// ChargerSessionReading represents a single 15-min interval reading during a session
type ChargerSessionReading struct {
	Timestamp  time.Time
	Energy_kWh float64 // Total meter reading at this point
	Power_kW   float64 // Charging power at this point
	Mode       string
}

// ActiveChargerSession tracks an ongoing charging session
type ActiveChargerSession struct {
	ChargerID       int
	ChargerName     string
	StartTime       time.Time
	StartEnergy_kWh float64 // Mr value at session start
	UserID          string  // From Uid during charging (may be empty, confirmed later)
	Mode            string
	Readings        []ChargerSessionReading // Buffered readings during session
	LastLclValue    string                  // Track Lcl changes to detect session end
}

// CompletedChargerSession holds all data needed to write a completed session to database
type CompletedChargerSession struct {
	ChargerID       int
	ChargerName     string
	UserID          string    // From Lcl parsing (confirmed)
	StartTime       time.Time
	EndTime         time.Time
	StartEnergy_kWh float64
	EndEnergy_kWh   float64
	TotalEnergy_kWh float64
	Duration_sec    float64   // Session duration in seconds (from Lcl)
	Mode            string
	Readings        []ChargerSessionReading
}

// ========== WEBSOCKET CONNECTION ==========

// WebSocketConnection represents a Loxone WebSocket connection
type WebSocketConnection struct {
	Host     string
	Username string
	Password string

	MacAddress   string // For remote connections
	IsRemote     bool   // Flag to know if this is a remote connection
	ResolvedHost string // The actual resolved host:port (changes dynamically)

	Ws          *websocket.Conn
	IsConnected bool

	// Centralized auth health
	Token       string
	TokenValid  bool
	TokenExpiry time.Time

	Devices []*Device

	// Error tracking and metrics
	LastError            string
	ConsecutiveAuthFails int
	ConsecutiveConnFails int
	TotalAuthFailures    int
	TotalReconnects      int
	LastSuccessfulAuth   time.Time
	LastConnectionTime   time.Time
	LastDisconnectReason string
	LastDisconnectTime   time.Time
	PortChangeInProgress bool
	WriteMu              sync.Mutex
	CollectionInProgress bool

	// Backoff for reconnection
	ReconnectBackoff time.Duration
	MaxBackoff       time.Duration

	// Enhanced tracking for better stability
	ReconnectAttempt     int       // Track current attempt number
	LastErrorType        ErrorType // Track type of last error
	ConsecutiveDNSErrors int       // Track DNS-specific failures
	DnsCache             *DNSCache // DNS resolution caching

	StopChan       chan bool
	GoroutinesWg   sync.WaitGroup
	IsReconnecting bool
	IsShuttingDown bool // Flag to prevent reconnection during shutdown
	Mu             sync.Mutex
	Db             *sql.DB
    Collector      LoxoneCollectorInterface
}

// ========== DEVICE ==========

// Device represents a Loxone device (meter or charger)
type Device struct {
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

	LastReading       float64
	LastReadingExport float64
	LastUpdate        time.Time
	ReadingGaps       int
}

// ========== LOXONE API RESPONSES ==========

// LoxoneResponse is the top-level response structure
type LoxoneResponse struct {
	LL LoxoneLLData `json:"LL"`
}

// LoxoneLLData contains the actual response data
type LoxoneLLData struct {
	Control string                  `json:"control"`
	Value   string                  `json:"value"`
	Code    string                  `json:"code"`
	Outputs map[string]LoxoneOutput `json:"-"`
}

// LoxoneOutput represents a single output value
type LoxoneOutput struct {
	Name  string      `json:"name"`
	Nr    int         `json:"nr"`
	Value interface{} `json:"value"`
}

// LoxoneKeyResponse is the response from getkey2 command
type LoxoneKeyResponse struct {
	Key             string `json:"key"`
	Salt            string `json:"salt"`
	HashAlg         string `json:"hashAlg"`
	TokenValidUntil int64  `json:"tokenValidUntil"`
}

// LoxoneTokenResponse is the response from gettoken command
type LoxoneTokenResponse struct {
	Token      string `json:"token"`
	ValidUntil int64  `json:"validUntil"`
	Rights     int    `json:"rights"`
	Unsecure   bool   `json:"unsecurePass"`
}

// ChargerDataCollection is used for collecting charger data from multiple UUIDs
type ChargerDataCollection struct {
	Power  *float64
	State  *string
	UserID *string
	Mode   *string
}