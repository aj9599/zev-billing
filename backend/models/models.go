package models

import "time"

type AdminUser struct {
	ID           int       `json:"id"`
	Username     string    `json:"username"`
	PasswordHash string    `json:"-"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type User struct {
	ID                int       `json:"id"`
	FirstName         string    `json:"first_name"`
	LastName          string    `json:"last_name"`
	Email             string    `json:"email"`
	Phone             string    `json:"phone"`
	AddressStreet     string    `json:"address_street"`
	AddressCity       string    `json:"address_city"`
	AddressZip        string    `json:"address_zip"`
	AddressCountry    string    `json:"address_country"`
	BankName          string    `json:"bank_name"`
	BankIBAN          string    `json:"bank_iban"`
	BankAccountHolder string    `json:"bank_account_holder"`
	ChargerIDs        string    `json:"charger_ids"`
	Notes             string    `json:"notes"`
	BuildingID        *int      `json:"building_id"`
	ApartmentUnit     string    `json:"apartment_unit"`
	UserType          string    `json:"user_type"`
	ManagedBuildings  string    `json:"managed_buildings"`
	Language          string    `json:"language"`
	IsActive          bool      `json:"is_active"`
	RentStartDate     *string   `json:"rent_start_date"`
	RentEndDate       *string   `json:"rent_end_date"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

type Building struct {
	ID             int           `json:"id"`
	Name           string        `json:"name"`
	AddressStreet  string        `json:"address_street"`
	AddressCity    string        `json:"address_city"`
	AddressZip     string        `json:"address_zip"`
	AddressCountry string        `json:"address_country"`
	Notes          string        `json:"notes"`
	IsGroup        bool          `json:"is_group"`
	GroupBuildings []int         `json:"group_buildings,omitempty"`
	HasApartments  bool          `json:"has_apartments"`
	FloorsConfig   []FloorConfig `json:"floors_config,omitempty"`
	CreatedAt      time.Time     `json:"created_at"`
	UpdatedAt      time.Time     `json:"updated_at"`
}

type FloorConfig struct {
	FloorNumber int      `json:"floor_number"`
	FloorName   string   `json:"floor_name"`
	Apartments  []string `json:"apartments"`
}

type Meter struct {
	ID                 int        `json:"id"`
	Name               string     `json:"name"`
	MeterType          string     `json:"meter_type"`
	BuildingID         int        `json:"building_id"`
	UserID             *int       `json:"user_id"`
	ApartmentUnit      string     `json:"apartment_unit"`
	ConnectionType     string     `json:"connection_type"`
	ConnectionConfig   string     `json:"connection_config"`
	DeviceType         string     `json:"device_type"`
	Notes              string     `json:"notes"`
	LastReading        float64    `json:"last_reading"`
	LastReadingTime    *time.Time `json:"last_reading_time"`
	LastReadingExport  float64    `json:"last_reading_export"`
	IsActive           bool       `json:"is_active"`
	IsArchived         bool       `json:"is_archived"`
	ReplacedByMeterID  *int       `json:"replaced_by_meter_id"`
	ReplacesMetterID   *int       `json:"replaces_meter_id"`
	ReplacementDate    *time.Time `json:"replacement_date"`
	ReplacementNotes   string     `json:"replacement_notes"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
}

type MeterReplacement struct {
	ID                     int       `json:"id"`
	OldMeterID             int       `json:"old_meter_id"`
	NewMeterID             int       `json:"new_meter_id"`
	ReplacementDate        time.Time `json:"replacement_date"`
	OldMeterFinalReading   float64   `json:"old_meter_final_reading"`
	NewMeterInitialReading float64   `json:"new_meter_initial_reading"`
	ReadingOffset          float64   `json:"reading_offset"`
	Notes                  string    `json:"notes"`
	PerformedBy            string    `json:"performed_by,omitempty"`
	CreatedAt              time.Time `json:"created_at"`
}

type MeterReplacementRequest struct {
	OldMeterID             int     `json:"old_meter_id"`
	NewMeterName           string  `json:"new_meter_name"`
	NewMeterType           string  `json:"new_meter_type"`
	NewConnectionType      string  `json:"new_connection_type"`
	NewConnectionConfig    string  `json:"new_connection_config"`
	ReplacementDate        string  `json:"replacement_date"`
	OldMeterFinalReading   float64 `json:"old_meter_final_reading"`
	NewMeterInitialReading float64 `json:"new_meter_initial_reading"`
	ReplacementNotes       string  `json:"replacement_notes"`
	CopySettings           bool    `json:"copy_settings"`
}

type Charger struct {
	ID               int       `json:"id"`
	Name             string    `json:"name"`
	Brand            string    `json:"brand"`
	Preset           string    `json:"preset"`
	BuildingID       int       `json:"building_id"`
	ConnectionType   string    `json:"connection_type"`
	ConnectionConfig string    `json:"connection_config"`
	SupportsPriority bool      `json:"supports_priority"`
	Notes            string    `json:"notes"`
	IsActive         bool      `json:"is_active"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

type MeterReading struct {
	ID                int       `json:"id"`
	MeterID           int       `json:"meter_id"`
	ReadingTime       time.Time `json:"reading_time"`
	PowerKWh          float64   `json:"power_kwh"`
	PowerKWhExport    float64   `json:"power_kwh_export"`
	ConsumptionKWh    float64   `json:"consumption_kwh"`
	ConsumptionExport float64   `json:"consumption_export"`
	CreatedAt         time.Time `json:"created_at"`
}

type ChargerSession struct {
	ID          int       `json:"id"`
	ChargerID   int       `json:"charger_id"`
	UserID      string    `json:"user_id"`
	SessionTime time.Time `json:"session_time"`
	PowerKWh    float64   `json:"power_kwh"`
	Mode        string    `json:"mode"`
	State       string    `json:"state"`
	CreatedAt   time.Time `json:"created_at"`
}

type BillingSettings struct {
	ID                       int       `json:"id"`
	BuildingID               int       `json:"building_id"`
	IsComplex                bool      `json:"is_complex"`
	NormalPowerPrice         float64   `json:"normal_power_price"`
	SolarPowerPrice          float64   `json:"solar_power_price"`
	CarChargingNormalPrice   float64   `json:"car_charging_normal_price"`
	CarChargingPriorityPrice float64   `json:"car_charging_priority_price"`
	VZEVExportPrice          float64   `json:"vzev_export_price"`
	Currency                 string    `json:"currency"`
	ValidFrom                string    `json:"valid_from"`
	ValidTo                  string    `json:"valid_to"`
	IsActive                 bool      `json:"is_active"`
	CreatedAt                time.Time `json:"created_at"`
	UpdatedAt                time.Time `json:"updated_at"`
}

type Invoice struct {
	ID            int           `json:"id"`
	InvoiceNumber string        `json:"invoice_number"`
	UserID        int           `json:"user_id"`
	BuildingID    int           `json:"building_id"`
	PeriodStart   string        `json:"period_start"`
	PeriodEnd     string        `json:"period_end"`
	TotalAmount   float64       `json:"total_amount"`
	Currency      string        `json:"currency"`
	Status        string        `json:"status"`
	PDFPath       string        `json:"pdf_path,omitempty"`
	IsVZEV        bool          `json:"is_vzev"`
	Items         []InvoiceItem `json:"items,omitempty"`
	User          *User         `json:"user,omitempty"`
	GeneratedAt   time.Time     `json:"generated_at"`
}

type InvoiceItem struct {
	ID          int     `json:"id"`
	InvoiceID   int     `json:"invoice_id"`
	Description string  `json:"description"`
	Quantity    float64 `json:"quantity"`
	UnitPrice   float64 `json:"unit_price"`
	TotalPrice  float64 `json:"total_price"`
	ItemType    string  `json:"item_type"`
}

// CustomLineItem represents a custom charge item that can be added to invoices
type CustomLineItem struct {
	ID          int       `json:"id"`
	BuildingID  int       `json:"building_id"`
	Description string    `json:"description"`
	Amount      float64   `json:"amount"`
	Frequency   string    `json:"frequency"` // once, monthly, quarterly, yearly
	Category    string    `json:"category"`  // meter_rent, maintenance, service, other
	IsActive    bool      `json:"is_active"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type AutoBillingConfig struct {
	ID                 int        `json:"id"`
	Name               string     `json:"name"`
	BuildingIDs        string     `json:"building_ids"`
	UserIDs            string     `json:"user_ids"`
	CustomItemIDs      string     `json:"custom_item_ids"`      // NEW: Comma-separated list of custom item IDs to include
	Frequency          string     `json:"frequency"`
	GenerationDay      int        `json:"generation_day"`
	FirstExecutionDate *string    `json:"first_execution_date,omitempty"`
	IsActive           bool       `json:"is_active"`
	IsVZEV             bool       `json:"is_vzev"`
	LastRun            *time.Time `json:"last_run,omitempty"`
	NextRun            *time.Time `json:"next_run,omitempty"`
	SenderName         string     `json:"sender_name,omitempty"`
	SenderAddress      string     `json:"sender_address,omitempty"`
	SenderCity         string     `json:"sender_city,omitempty"`
	SenderZip          string     `json:"sender_zip,omitempty"`
	SenderCountry      string     `json:"sender_country,omitempty"`
	BankName           string     `json:"bank_name,omitempty"`
	BankIBAN           string     `json:"bank_iban,omitempty"`
	BankAccountHolder  string     `json:"bank_account_holder,omitempty"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
}

type AdminLog struct {
	ID        int       `json:"id"`
	Action    string    `json:"action"`
	Details   string    `json:"details"`
	UserID    *int      `json:"user_id"`
	IPAddress string    `json:"ip_address"`
	CreatedAt time.Time `json:"created_at"`
}

type DashboardStats struct {
	TotalUsers       int     `json:"total_users"`
	RegularUsers     int     `json:"regular_users"`
	AdminUsers       int     `json:"admin_users"`
	ActiveUsers      int     `json:"active_users"`
	InactiveUsers    int     `json:"inactive_users"`
	TotalBuildings   int     `json:"total_buildings"`
	TotalComplexes   int     `json:"total_complexes"`
	TotalMeters      int     `json:"total_meters"`
	TotalChargers    int     `json:"total_chargers"`
	ActiveMeters     int     `json:"active_meters"`
	ActiveChargers   int     `json:"active_chargers"`
	TodayConsumption float64 `json:"today_consumption"`
	MonthConsumption float64 `json:"month_consumption"`
	TodaySolar       float64 `json:"today_solar"`
	MonthSolar       float64 `json:"month_solar"`
	TodayCharging    float64 `json:"today_charging"`
	MonthCharging    float64 `json:"month_charging"`
}

type ConsumptionData struct {
	Timestamp time.Time `json:"timestamp"`
	Power     float64   `json:"power"`
	Source    string    `json:"source"`
}

// AppSettings stores mobile app configuration
type AppSettings struct {
	MobileAppEnabled  bool      `json:"mobile_app_enabled"`
	FirebaseProjectID string    `json:"firebase_project_id"`
	FirebaseConfig    string    `json:"firebase_config"`
	DeviceID          string    `json:"device_id"` // NEW: System-wide device identifier for this Raspberry Pi
	LastSync          *string   `json:"last_sync,omitempty"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

// AppUserPermissions defines what data an app user can access
type AppUserPermissions struct {
	Meters    bool `json:"meters"`
	Chargers  bool `json:"chargers"`
	Users     bool `json:"users"`
	Buildings bool `json:"buildings"`
	Bills     bool `json:"bills"`
}

// AppUser represents a mobile app user
type AppUser struct {
	ID          int                `json:"id"`
	Username    string             `json:"username"`
	Description string             `json:"description"`
	Permissions AppUserPermissions `json:"permissions"`
	FirebaseUID string             `json:"firebase_uid"`
	DeviceID    string             `json:"device_id"` // Inherited from system device_id in app_settings
	IsActive    bool               `json:"is_active"`
	CreatedAt   time.Time          `json:"created_at"`
	UpdatedAt   time.Time          `json:"updated_at"`
}