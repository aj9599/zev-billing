package zaptec

import (
	"encoding/json"
	"time"
)

// ========== LIVE DATA TYPES ==========

// LiveData holds live charger data for UI display
type LiveData struct {
	// Charger info
	ChargerName      string
	DeviceName       string
	IsOnline         bool
	
	// Current state
	State            string
	StateDescription string
	OperatingMode    int
	Mode             string
	
	// Live metrics
	CurrentPower_kW  float64
	TotalEnergy_kWh  float64
	TotalEnergy      float64
	SessionEnergy_kWh float64
	SessionEnergy    float64
	Voltage          float64
	Current          float64
	Power_kW         float64
	
	// Session info
	SessionID        string
	CurrentSession   string
	SessionStart     time.Time
	UserID           string
	UserName         string
	
	Timestamp        time.Time
}

// SessionData represents session data for UI compatibility
type SessionData struct {
	SessionID   string
	Energy      float64
	StartTime   time.Time
	EndTime     time.Time
	UserID      string
	UserName    string
	IsActive    bool
	Power_kW    float64
	Timestamp   time.Time
}

// ========== OCMF DATA TYPES ==========

// OCMFData represents parsed OCMF (Open Charge Metering Format) data
type OCMFData struct {
	FormatVersion        string        `json:"FV"`
	GatewayID            string        `json:"GI"`
	GatewaySerial        string        `json:"GS"`
	GatewayVersion       string        `json:"GV"`
	Pagination           string        `json:"PG"`
	MeterFirmware        string        `json:"MF"`
	IdentificationStatus bool          `json:"IS"`
	IdentificationLevel  string        `json:"IL"`
	IdentificationFlags  []string      `json:"IF"`
	IdentificationType   string        `json:"IT"`
	IdentificationData   string        `json:"ID"`
	ReadingData          []OCMFReading `json:"RD"`
	ZaptecSession        string        `json:"ZS"`
}

// OCMFReading represents a single meter reading in OCMF format
type OCMFReading struct {
	Timestamp    string  `json:"TM"`
	Type         string  `json:"TX"`
	ReadingValue float64 `json:"RV"`
	ReadingID    string  `json:"RI"`
	ReadingUnit  string  `json:"RU"`
	Status       string  `json:"ST"`
}

// SessionMeterReading represents a single database entry from OCMF data
type SessionMeterReading struct {
	Timestamp   time.Time
	Energy_kWh  float64
	ReadingType string
}

// CompletedSession holds all data needed to write a completed session to database
type CompletedSession struct {
	SessionID       string
	ChargerID       int
	ChargerName     string
	UserID          string
	UserName        string
	StartTime       time.Time
	EndTime         time.Time
	TotalEnergy_kWh float64
	FinalEnergy     float64
	MeterReadings   []SessionMeterReading
}

// ========== API RESPONSE TYPES ==========

// AuthResponse represents Zaptec authentication response
type AuthResponse struct {
	AccessToken string `json:"access_token"`
	ExpiresIn   int    `json:"expires_in"`
	TokenType   string `json:"token_type"`
}

// ChargerDetails represents detailed charger information
type ChargerDetails struct {
	ID                   string  `json:"Id"`
	DeviceID             string  `json:"DeviceId"`
	Name                 string  `json:"Name"`
	DeviceName           string  `json:"DeviceName"`
	Active               bool    `json:"Active"`
	IsOnline             bool    `json:"IsOnline"`
	OperatingMode        int     `json:"OperatingMode"`
	SignedMeterValueKwh  float64 `json:"SignedMeterValueKwh"`
	TotalChargePower     float64 `json:"TotalChargePower"`
	Voltage              float64 `json:"Voltage"`
	Current              float64 `json:"Current"`
	InstallationID       string  `json:"InstallationId"`
	InstallationName     string  `json:"InstallationName"`
}

// ChargeHistory represents a charge session from API
type ChargeHistory struct {
	ID              string  `json:"Id"`
	DeviceID        string  `json:"DeviceId"`
	StartDateTime   string  `json:"StartDateTime"`
	EndDateTime     string  `json:"EndDateTime"`
	Energy          float64 `json:"Energy"`
	UserFullName    string  `json:"UserFullName"`
	ChargerID       string  `json:"ChargerId"`
	DeviceName      string  `json:"DeviceName"`
	UserEmail       string  `json:"UserEmail"`
	UserID          string  `json:"UserId"`
	TokenName       string  `json:"TokenName"`
	ExternalID      string  `json:"ExternalId"`
	SignedSession   string  `json:"SignedSession"`
}

// APIResponse represents generic Zaptec API response with pagination
type APIResponse struct {
	Pages   int               `json:"Pages"`
	Data    []json.RawMessage `json:"Data"`
	Message string            `json:"Message"`
}

// ChargerInfo represents charger information for listing
type ChargerInfo struct {
	ID                   string  `json:"Id"`
	DeviceID             string  `json:"DeviceId"`
	Name                 string  `json:"Name"`
	Active               bool    `json:"Active"`
	IsOnline             bool    `json:"IsOnline"`
	OperatingMode        int     `json:"OperatingMode"`
	SignedMeterValueKwh  float64 `json:"SignedMeterValueKwh"`
	InstallationID       string  `json:"InstallationId"`
	InstallationName     string  `json:"InstallationName"`
}

// ========== CONFIGURATION TYPES ==========

// ConnectionConfig represents Zaptec connection configuration
type ConnectionConfig struct {
	Username       string `json:"zaptec_username"`
	Password       string `json:"zaptec_password"`
	ChargerID      string `json:"zaptec_charger_id"`
	InstallationID string `json:"zaptec_installation_id,omitempty"`
}

// ========== LEGACY COMPATIBILITY ==========

// ChargerData is an alias for backward compatibility
type ChargerData = LiveData

// ZaptecChargerData is an alias for backward compatibility with old code
type ZaptecChargerData = LiveData

// ZaptecSessionData is an alias for backward compatibility with old code
type ZaptecSessionData = SessionData