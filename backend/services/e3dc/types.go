// Package e3dc provides a self-contained client for E3/DC Hauskraftwerk
// energy-management systems. It mirrors the approach used by evcc
// (https://github.com/evcc-io/evcc):
//
//   - Modbus TCP (port 502, read-only) is used to read the EMS power block
//     (PV production, grid import/export, battery charge/discharge + SoC,
//     household consumption). Simple, no extra secrets, perfect for metering.
//   - RSCP (port 5033, AES-encrypted, read+write) is used for the integrated
//     wallbox (charging energy, solar-vs-grid split) and for control
//     (enable/disable charging, set max current). RSCP is the only protocol
//     that can read wallbox energy counters and issue write commands.
//
// The package exposes a single Client interface so callers don't care which
// protocol backs a given device. Construct one with New(Config).
package e3dc

import "time"

// Protocol selects the transport used to talk to the E3/DC unit.
const (
	ProtocolModbus = "modbus" // Modbus TCP, read-only, EMS power block
	ProtocolRSCP   = "rscp"   // RSCP, encrypted, read+write (wallbox + control)
)

// Default network ports for each protocol.
const (
	DefaultModbusPort = 502
	DefaultRSCPPort   = 5033
)

// Config is the connection configuration for one E3/DC device. It is stored as
// JSON in the meter/charger/device connection_config column, so every field has
// an explicit, stable JSON name prefixed with "e3dc_".
type Config struct {
	// Protocol is "modbus" or "rscp". Required.
	Protocol string `json:"e3dc_protocol"`

	// Host is the IP address or hostname of the E3/DC unit. Required.
	Host string `json:"e3dc_host"`
	// Port overrides the protocol default (502 for Modbus, 5033 for RSCP).
	Port int `json:"e3dc_port,omitempty"`

	// --- Modbus only ---
	// UnitID is the Modbus slave/unit id (E3/DC default is 1).
	UnitID int `json:"e3dc_unit_id,omitempty"`

	// --- RSCP only ---
	// User / Password are the E3/DC portal (myE3DC) credentials.
	User     string `json:"e3dc_user,omitempty"`
	Password string `json:"e3dc_password,omitempty"`
	// RSCPKey is the separate "RSCP password" set on the device screen under
	// Personalize → User profile. It is the AES key and is distinct from the
	// portal password. Required for RSCP.
	RSCPKey string `json:"e3dc_rscp_key,omitempty"`

	// WallboxIndex selects which integrated wallbox to address (0 = first).
	WallboxIndex int `json:"e3dc_wallbox_index,omitempty"`

	// ExternalPower, when true, subtracts the "additional feed-in" source
	// (EMS_REQ_POWER_ADD) from the PV reading, matching evcc's default. This is
	// only relevant when a second inverter feeds into the E3/DC.
	ExternalPower bool `json:"e3dc_external_power,omitempty"`
}

// port returns the effective port, applying the protocol default when unset.
func (c Config) port() int {
	if c.Port > 0 {
		return c.Port
	}
	if c.Protocol == ProtocolRSCP {
		return DefaultRSCPPort
	}
	return DefaultModbusPort
}

// unitID returns the effective Modbus unit id (default 1).
func (c Config) unitID() byte {
	if c.UnitID > 0 {
		return byte(c.UnitID)
	}
	return 1
}

// Snapshot is an instantaneous reading of the E3/DC EMS and (when available via
// RSCP) the integrated wallbox. All power values are in Watts. Sign conventions
// match the E3/DC native values:
//
//   - GridPowerW:    positive = import from grid, negative = export to grid.
//   - BatteryPowerW: positive = discharging, negative = charging.
//   - PVPowerW / HomePowerW / WallboxPowerW: always >= 0.
//
// The *Valid flags report which fields were actually read; a Modbus snapshot
// has no wallbox energy, an RSCP snapshot has the full set.
type Snapshot struct {
	PVPowerW      float64
	GridPowerW    float64
	BatteryPowerW float64
	BatterySoC    float64 // percent 0..100
	HomePowerW    float64
	WallboxPowerW float64 // total wallbox charge power (RSCP)

	// Cumulative wallbox energy counters in kWh (RSCP only). WallboxEnergyKWh
	// is the lifetime total; WallboxEnergySolarKWh is the solar-sourced share.
	WallboxEnergyKWh      float64
	WallboxEnergySolarKWh float64
	WallboxEnergyValid    bool

	// Wallbox built-in power-meter per-phase energy for the current session in Wh
	// (RSCP WB_PM_ENERGY_L1/L2/L3, Double64). The sum is the session charged
	// energy (retained until the next session starts); it is distinct from
	// WB_ENERGY_ALL, which is a cumulative charged-energy counter.
	WallboxPMEnergyL1    float64
	WallboxPMEnergyL2    float64
	WallboxPMEnergyL3    float64
	WallboxPMEnergyValid bool

	// Wallbox status (RSCP only).
	WallboxConnected bool // a vehicle is plugged in
	WallboxCharging  bool // actively delivering energy
	WallboxStatusOK  bool // the status byte was read successfully

	// WallboxRFID is the RFID token of the card used to start the current
	// session (RSCP WB_SESSION_AUTH_DATA), hex-encoded. Empty when no session /
	// no card. Used to attribute charging to a tenant for billing.
	WallboxRFID string
	// WallboxSessionSolarKWh / WallboxSessionEnergyKWh are the current session's
	// solar and total charged energy as measured by the E3/DC itself.
	WallboxSessionEnergyKWh float64
	WallboxSessionSolarKWh  float64

	// Session identity/timing (RSCP WB_SESSION_ID/START_TIME/END_TIME). Used to
	// detect when one session ends and another begins so completed sessions can
	// be recorded. ID is 0 and times are zero when unavailable.
	WallboxSessionID        uint64
	WallboxSessionStartTime time.Time
	WallboxSessionEndTime   time.Time

	Timestamp time.Time
}

// Client is the protocol-agnostic interface to an E3/DC unit.
type Client interface {
	// Read returns a fresh Snapshot. Modbus clients populate the EMS fields;
	// RSCP clients additionally populate the wallbox fields.
	Read() (*Snapshot, error)

	// CanControl reports whether this client can issue write commands
	// (true only for RSCP).
	CanControl() bool

	// SetWallboxEnabled starts (true) or stops (false) charging on the
	// configured wallbox. Returns an error on Modbus clients.
	SetWallboxEnabled(on bool) error

	// SetWallboxMaxCurrent sets the wallbox charge-current limit in Amps
	// (typically 6..32). Returns an error on Modbus clients.
	SetWallboxMaxCurrent(amps int) error

	// Close releases any underlying connection.
	Close() error
}

// New constructs a Client for the given config, selecting the backend from
// cfg.Protocol. An unknown protocol is an error.
func New(cfg Config) (Client, error) {
	switch cfg.Protocol {
	case ProtocolRSCP:
		return newRSCPClient(cfg)
	case ProtocolModbus, "":
		return newModbusClient(cfg)
	default:
		return nil, &ConfigError{Field: "e3dc_protocol", Msg: "must be 'modbus' or 'rscp', got " + cfg.Protocol}
	}
}

// ConfigError is returned for invalid configuration.
type ConfigError struct {
	Field string
	Msg   string
}

func (e *ConfigError) Error() string { return "e3dc config: " + e.Field + ": " + e.Msg }
