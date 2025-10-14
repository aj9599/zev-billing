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
	UserType          string    `json:"user_type"`
	ManagedBuildings  string    `json:"managed_buildings"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

type Building struct {
	ID             int       `json:"id"`
	Name           string    `json:"name"`
	AddressStreet  string    `json:"address_street"`
	AddressCity    string    `json:"address_city"`
	AddressZip     string    `json:"address_zip"`
	AddressCountry string    `json:"address_country"`
	Notes          string    `json:"notes"`
	IsGroup        bool      `json:"is_group"`
	GroupBuildings []int     `json:"group_buildings,omitempty"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

type Meter struct {
	ID               int        `json:"id"`
	Name             string     `json:"name"`
	MeterType        string     `json:"meter_type"`
	BuildingID       int        `json:"building_id"`
	UserID           *int       `json:"user_id"`
	ConnectionType   string     `json:"connection_type"`
	ConnectionConfig string     `json:"connection_config"`
	Notes            string     `json:"notes"`
	LastReading      float64    `json:"last_reading"`
	LastReadingTime  *time.Time `json:"last_reading_time"`
	IsActive         bool       `json:"is_active"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
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
	ID          int       `json:"id"`
	MeterID     int       `json:"meter_id"`
	ReadingTime time.Time `json:"reading_time"`
	PowerKWh    float64   `json:"power_kwh"`
	CreatedAt   time.Time `json:"created_at"`
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
	NormalPowerPrice         float64   `json:"normal_power_price"`
	SolarPowerPrice          float64   `json:"solar_power_price"`
	CarChargingNormalPrice   float64   `json:"car_charging_normal_price"`
	CarChargingPriorityPrice float64   `json:"car_charging_priority_price"`
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

type AutoBillingConfig struct {
	ID                  int       `json:"id"`
	Name                string    `json:"name"`
	BuildingIDs         string    `json:"building_ids"`
	UserIDs             string    `json:"user_ids"`
	Frequency           string    `json:"frequency"`
	GenerationDay       int       `json:"generation_day"`
	IsActive            bool      `json:"is_active"`
	LastRun             *time.Time `json:"last_run"`
	NextRun             *time.Time `json:"next_run"`
	SenderName          string    `json:"sender_name"`
	SenderAddress       string    `json:"sender_address"`
	SenderCity          string    `json:"sender_city"`
	SenderZip           string    `json:"sender_zip"`
	SenderCountry       string    `json:"sender_country"`
	BankName            string    `json:"bank_name"`
	BankIBAN            string    `json:"bank_iban"`
	BankAccountHolder   string    `json:"bank_account_holder"`
	CreatedAt           time.Time `json:"created_at"`
	UpdatedAt           time.Time `json:"updated_at"`
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
	TotalBuildings   int     `json:"total_buildings"`
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