package services

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"sync"

	"github.com/aj9599/zev-billing/backend/models"
	"github.com/aj9599/zev-billing/backend/services/e3dc"
)

// DeviceDriver controls a single external device (relay/switch) over HTTP.
// Implementations must be safe to call from the control loop with their own
// timeouts; transient errors are returned (never panic) so the caller can
// log + record them and move on.
type DeviceDriver interface {
	// Switch turns the device on (true) or off (false).
	Switch(on bool) error
	// ReadState reports the device's actual state. known=false means the
	// device is reachable-agnostic / state could not be determined, in which
	// case the caller falls back to the last commanded state.
	ReadState() (on bool, known bool, err error)
}

// PowerReader is an optional capability for drivers that can report live power
// and a cumulative energy counter (e.g. Shelly PM models). The controller calls
// it best-effort for display only — it never affects control decisions.
type PowerReader interface {
	// ReadPower returns instantaneous power (W) and the lifetime energy counter
	// (Wh). known=false means this device has no power metering.
	ReadPower() (powerW float64, energyWh float64, known bool, err error)
}

// deviceHTTPClient is shared by all HTTP drivers. Short timeout so a slow or
// unreachable device never stalls the 30s control loop.
var deviceHTTPClient = &http.Client{Timeout: 5 * time.Second}

// normalizeHost returns a scheme-prefixed base URL ("http://host[:port]") with
// any trailing slash trimmed. A bare IP/host or an already-qualified URL both work.
func normalizeHost(host string) string {
	h := strings.TrimSpace(host)
	if h == "" {
		return ""
	}
	if !strings.HasPrefix(h, "http://") && !strings.HasPrefix(h, "https://") {
		h = "http://" + h
	}
	return strings.TrimRight(h, "/")
}

// httpGetBody performs a GET with optional basic auth and returns the body
// (capped at 64KB — enough for control/state responses).
func httpGetBody(url, user, pass string) ([]byte, error) {
	return httpGetBodyN(url, user, pass, 64*1024)
}

// httpGetBodyN is httpGetBody with a custom max body size.
func httpGetBodyN(url, user, pass string, maxBytes int64) ([]byte, error) {
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	if user != "" || pass != "" {
		req.SetBasicAuth(user, pass)
	}
	resp, err := deviceHTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, maxBytes))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return body, fmt.Errorf("device returned HTTP %d", resp.StatusCode)
	}
	return body, nil
}

// shellyChannelStatus reads a Gen2+ channel's on/off state AND live power in a
// single Switch.GetStatus call (output + apower + aenergy.total). powerKnown is
// false for non-PM channels. Falls back to a plain state read on Gen1.
func shellyChannelStatus(cfg shellyConfig, channel int) (on bool, onKnown bool, powerW, energyWh float64, powerKnown bool, err error) {
	if cfg.Gen < 2 {
		o, k, e := shellyReadChannel(cfg, channel)
		return o, k, 0, 0, false, e
	}
	url := fmt.Sprintf("%s/rpc/Switch.GetStatus?id=%d", normalizeHost(cfg.Host), channel)
	body, e := httpGetBody(url, cfg.AuthUser, cfg.AuthPass)
	if e != nil {
		return false, false, 0, 0, false, e
	}
	var st struct {
		Output  bool     `json:"output"`
		Apower  *float64 `json:"apower"`
		Aenergy *struct {
			Total *float64 `json:"total"`
		} `json:"aenergy"`
	}
	if e := json.Unmarshal(body, &st); e != nil {
		return false, false, 0, 0, false, e
	}
	wh := 0.0
	pk := st.Apower != nil
	if pk {
		powerW = *st.Apower
		if st.Aenergy != nil && st.Aenergy.Total != nil {
			wh = *st.Aenergy.Total
		}
	}
	return st.Output, true, powerW, wh, pk, nil
}

// ---- Config shapes (parsed from Device.ConnectionConfig JSON) ----

type shellyConfig struct {
	Host     string `json:"host"`
	Model    string `json:"model"`   // UI model id (informational)
	Gen      int    `json:"gen"`     // 1 or 2 (default 1)
	Channel  int    `json:"channel"` // relay/switch index (default 0)
	AuthUser string `json:"auth_user"`
	AuthPass string `json:"auth_pass"`
	// Staged multi-relay control (boiler-style). When Staged is true the device
	// is driven by Stages instead of a single Channel: the active stage's relays
	// are ON, all other managed relays OFF.
	Staged bool          `json:"staged"`
	Stages []shellyStage `json:"stages"`
}

// shellyStage is one cumulative power level of a staged device. Relays are
// 0-based channel indices. Stages are ordered low→high by threshold.
type shellyStage struct {
	Relays        []int   `json:"relays"`
	OnThresholdW  float64 `json:"on_threshold_w"`
	OffThresholdW float64 `json:"off_threshold_w"`
}

// ---- Shelly channel helpers (used by both the single-channel driver and the
// staged controller) ----

// shellySwitchChannel turns one relay/switch channel on or off.
func shellySwitchChannel(cfg shellyConfig, channel int, on bool) error {
	base := normalizeHost(cfg.Host)
	var url string
	if cfg.Gen >= 2 {
		val := "false"
		if on {
			val = "true"
		}
		url = fmt.Sprintf("%s/rpc/Switch.Set?id=%d&on=%s", base, channel, val)
	} else {
		turn := "off"
		if on {
			turn = "on"
		}
		url = fmt.Sprintf("%s/relay/%d?turn=%s", base, channel, turn)
	}
	_, err := httpGetBody(url, cfg.AuthUser, cfg.AuthPass)
	return err
}

// shellyReadChannel reports a single channel's on/off state (known=true).
func shellyReadChannel(cfg shellyConfig, channel int) (bool, bool, error) {
	base := normalizeHost(cfg.Host)
	if cfg.Gen >= 2 {
		url := fmt.Sprintf("%s/rpc/Switch.GetStatus?id=%d", base, channel)
		body, err := httpGetBody(url, cfg.AuthUser, cfg.AuthPass)
		if err != nil {
			return false, false, err
		}
		var st struct {
			Output bool `json:"output"`
		}
		if err := json.Unmarshal(body, &st); err != nil {
			return false, false, err
		}
		return st.Output, true, nil
	}
	url := fmt.Sprintf("%s/relay/%d", base, channel)
	body, err := httpGetBody(url, cfg.AuthUser, cfg.AuthPass)
	if err != nil {
		return false, false, err
	}
	var st struct {
		Ison bool `json:"ison"`
	}
	if err := json.Unmarshal(body, &st); err != nil {
		return false, false, err
	}
	return st.Ison, true, nil
}

// shellyChannelPower reports a single Gen2+ channel's live power (W) and
// lifetime energy (Wh). known=false for non-PM channels / Gen1.
func shellyChannelPower(cfg shellyConfig, channel int) (float64, float64, bool, error) {
	if cfg.Gen < 2 {
		return 0, 0, false, nil
	}
	url := fmt.Sprintf("%s/rpc/Switch.GetStatus?id=%d", normalizeHost(cfg.Host), channel)
	body, err := httpGetBody(url, cfg.AuthUser, cfg.AuthPass)
	if err != nil {
		return 0, 0, false, err
	}
	var st struct {
		Apower  *float64 `json:"apower"`
		Aenergy *struct {
			Total *float64 `json:"total"`
		} `json:"aenergy"`
	}
	if err := json.Unmarshal(body, &st); err != nil {
		return 0, 0, false, err
	}
	if st.Apower == nil {
		return 0, 0, false, nil
	}
	var wh float64
	if st.Aenergy != nil && st.Aenergy.Total != nil {
		wh = *st.Aenergy.Total
	}
	return *st.Apower, wh, true, nil
}

type loxoneConfig struct {
	Host       string `json:"host"`
	Username   string `json:"username"`
	Password   string `json:"password"`
	OutputUUID string `json:"output_uuid"`
	StateUUID  string `json:"state_uuid"` // reflects the actual output; falls back to OutputUUID
}

// driverFor builds the right DeviceDriver from a device's stored config.
func driverFor(d models.Device) (DeviceDriver, error) {
	switch strings.ToLower(strings.TrimSpace(d.Driver)) {
	case "shelly":
		var c shellyConfig
		if err := json.Unmarshal([]byte(emptyToObject(d.ConnectionConfig)), &c); err != nil {
			return nil, fmt.Errorf("invalid shelly config: %v", err)
		}
		if normalizeHost(c.Host) == "" {
			return nil, fmt.Errorf("shelly config missing host")
		}
		return &shellyDriver{cfg: c}, nil
	case "loxone":
		var c loxoneConfig
		if err := json.Unmarshal([]byte(emptyToObject(d.ConnectionConfig)), &c); err != nil {
			return nil, fmt.Errorf("invalid loxone config: %v", err)
		}
		if normalizeHost(c.Host) == "" {
			return nil, fmt.Errorf("loxone config missing host")
		}
		if strings.TrimSpace(c.OutputUUID) == "" {
			return nil, fmt.Errorf("loxone config missing output_uuid")
		}
		return &loxoneDriver{cfg: c}, nil
	case "e3dc":
		var c e3dc.Config
		if err := json.Unmarshal([]byte(emptyToObject(d.ConnectionConfig)), &c); err != nil {
			return nil, fmt.Errorf("invalid e3dc config: %v", err)
		}
		// Control requires RSCP (Modbus is read-only). Default and enforce it.
		if c.Protocol == "" {
			c.Protocol = e3dc.ProtocolRSCP
		}
		if c.Protocol != e3dc.ProtocolRSCP {
			return nil, fmt.Errorf("e3dc device control requires the RSCP protocol")
		}
		if strings.TrimSpace(c.Host) == "" {
			return nil, fmt.Errorf("e3dc config missing host")
		}
		// Optional dynamic (PV-following) charging parameters.
		var extra struct {
			Dynamic    bool `json:"e3dc_dynamic"`
			Phases     int  `json:"e3dc_phases"`
			MinCurrent int  `json:"e3dc_min_current"`
			MaxCurrent int  `json:"e3dc_max_current"`
		}
		_ = json.Unmarshal([]byte(emptyToObject(d.ConnectionConfig)), &extra)
		drv := &e3dcDriver{cfg: c, dynamic: extra.Dynamic, phases: extra.Phases, minA: extra.MinCurrent, maxA: extra.MaxCurrent}
		if drv.phases != 3 {
			drv.phases = 1
		}
		if drv.minA <= 0 {
			drv.minA = 6
		}
		if drv.maxA <= 0 {
			drv.maxA = 16
		}
		return drv, nil
	default:
		return nil, fmt.Errorf("unknown device driver %q", d.Driver)
	}
}

func emptyToObject(s string) string {
	if strings.TrimSpace(s) == "" {
		return "{}"
	}
	return s
}

// ---- Shelly ----

type shellyDriver struct{ cfg shellyConfig }

func (s *shellyDriver) base() string { return normalizeHost(s.cfg.Host) }

func (s *shellyDriver) Switch(on bool) error {
	return shellySwitchChannel(s.cfg, s.cfg.Channel, on)
}

func (s *shellyDriver) ReadState() (bool, bool, error) {
	return shellyReadChannel(s.cfg, s.cfg.Channel)
}

// ReadPower reports live power + energy for Shelly PM models. Gen2+ exposes
// apower (W) and aenergy.total (Wh) in Switch.GetStatus; non-PM models omit
// apower, so we report known=false and the card simply shows no power. Gen1 PM
// reads are not implemented (none of the supported models use the Gen1 API).
func (s *shellyDriver) ReadPower() (float64, float64, bool, error) {
	return shellyChannelPower(s.cfg, s.cfg.Channel)
}

// ---- Loxone ----

type loxoneDriver struct{ cfg loxoneConfig }

func (l *loxoneDriver) base() string { return normalizeHost(l.cfg.Host) }

func (l *loxoneDriver) Switch(on bool) error {
	action := "Off"
	if on {
		action = "On"
	}
	url := fmt.Sprintf("%s/jdev/sps/io/%s/%s", l.base(), l.cfg.OutputUUID, action)
	_, err := httpGetBody(url, l.cfg.Username, l.cfg.Password)
	return err
}

func (l *loxoneDriver) ReadState() (bool, bool, error) {
	// Read the actual output state via the "/all" endpoint. Unlike a bare
	// GET /jdev/sps/io/{uuid} (which comes back 0 even when the output is on),
	// /jdev/sps/io/{uuid}/all returns the control's full output table, and
	// output0 holds the real on/off value (0 = off, 1 = on) — the same shape the
	// meter collector already relies on.
	//
	// BILLING SAFETY: this is a plain, short-lived HTTP GET on the device's own
	// connection. It is completely independent of the Loxone billing WebSocket
	// stream, so it cannot disturb metering. If the response can't be parsed we
	// fall back to known=false (reachability only), which keeps the controller's
	// commanded state exactly as before — no regression.
	url := fmt.Sprintf("%s/jdev/sps/io/%s/all", l.base(), l.cfg.OutputUUID)
	body, err := httpGetBody(url, l.cfg.Username, l.cfg.Password)
	if err != nil {
		return false, false, err
	}
	on, ok := parseLoxoneOutput0State(body)
	if !ok {
		// Reachable, but state couldn't be determined → keep commanded state.
		return false, false, nil
	}
	return on, true, nil
}

// parseLoxoneOutput0State extracts output0's value from a /jdev/sps/io/{uuid}/all
// response and reports whether the output is on. The body looks like:
//
//	{"LL": { "control": "...", "value": "0", "Code": "200",
//	    "output0": { "name": "O", "nr": 1, "value": 0}, ... }}
//
// output0.value may be a JSON number (0 / 1 / 0.000) or a quoted string ("0"/"1").
// Returns ok=false if output0 is missing or its value isn't numeric.
func parseLoxoneOutput0State(body []byte) (on bool, ok bool) {
	var env struct {
		LL map[string]json.RawMessage `json:"LL"`
	}
	if err := json.Unmarshal(body, &env); err != nil || env.LL == nil {
		return false, false
	}
	raw, exists := env.LL["output0"]
	if !exists {
		return false, false
	}
	var out struct {
		Value json.RawMessage `json:"value"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return false, false
	}
	v, vok := parseLoxoneNumericValue(out.Value)
	if !vok {
		return false, false
	}
	return v != 0, true
}

// ---- E3/DC wallbox (RSCP) ----

// DynamicCharger is an optional capability for device drivers that can modulate
// their charge current to follow available solar surplus (instead of plain
// on/off switching). The device controller calls it for devices that report
// DynamicEnabled() == true.
type DynamicCharger interface {
	// DynamicEnabled reports whether dynamic (PV-following) control is configured.
	DynamicEnabled() bool
	// ChargeBounds returns the phase count and the min/max charge current (A).
	ChargeBounds() (phases, minA, maxA int)
	// SetChargeCurrent sets the charge-current limit in Amps.
	SetChargeCurrent(amps int) error
}

// e3dcDriver controls an E3/DC integrated wallbox over RSCP. "On" enables
// charging, "off" stops it (WB_REQ_SET_ABORT_CHARGING). ReadState reports
// whether the wallbox is actively charging; ReadPower reports the wallbox's
// live power and lifetime energy counter. When dynamic is set it additionally
// modulates the charge current to the available solar surplus.
type e3dcDriver struct {
	cfg     e3dc.Config
	dynamic bool
	phases  int
	minA    int
	maxA    int
}

func (d *e3dcDriver) DynamicEnabled() bool             { return d.dynamic }
func (d *e3dcDriver) ChargeBounds() (int, int, int)    { return d.phases, d.minA, d.maxA }
func (d *e3dcDriver) SetChargeCurrent(amps int) error {
	c, err := e3dcDeviceClient(d.cfg)
	if err != nil {
		return err
	}
	return c.SetWallboxMaxCurrent(amps)
}

// e3dcDeviceClients caches one RSCP client per physical E3/DC unit so the 30s
// control loop doesn't re-authenticate on every Switch/ReadState/ReadPower
// call. Clients serialize their own access internally, and the control loop is
// sequential, so sharing is safe.
var e3dcDeviceClients sync.Map // key string -> e3dc.Client

func e3dcDeviceClient(cfg e3dc.Config) (e3dc.Client, error) {
	key := fmt.Sprintf("%s|%s|%d|wb%d", cfg.Protocol, cfg.Host, cfg.Port, cfg.WallboxIndex)
	if v, ok := e3dcDeviceClients.Load(key); ok {
		return v.(e3dc.Client), nil
	}
	c, err := e3dc.New(cfg)
	if err != nil {
		return nil, err
	}
	actual, loaded := e3dcDeviceClients.LoadOrStore(key, c)
	if loaded {
		_ = c.Close() // another goroutine won the race
	}
	return actual.(e3dc.Client), nil
}

func (d *e3dcDriver) Switch(on bool) error {
	c, err := e3dcDeviceClient(d.cfg)
	if err != nil {
		return err
	}
	return c.SetWallboxEnabled(on)
}

func (d *e3dcDriver) ReadState() (bool, bool, error) {
	c, err := e3dcDeviceClient(d.cfg)
	if err != nil {
		return false, false, err
	}
	snap, err := c.Read()
	if err != nil {
		return false, false, err
	}
	if !snap.WallboxStatusOK {
		// Reachable but status unknown → keep commanded state.
		return false, false, nil
	}
	return snap.WallboxCharging, true, nil
}

func (d *e3dcDriver) ReadPower() (float64, float64, bool, error) {
	c, err := e3dcDeviceClient(d.cfg)
	if err != nil {
		return 0, 0, false, err
	}
	snap, err := c.Read()
	if err != nil {
		return 0, 0, false, err
	}
	wh := 0.0
	if snap.WallboxEnergyValid {
		wh = snap.WallboxEnergyKWh * 1000.0
	}
	return snap.WallboxPowerW, wh, true, nil
}

// parseLoxoneNumericValue reads a Loxone output value that may be encoded as a
// JSON number or as a quoted numeric string. Empty strings / non-numeric values
// report ok=false.
func parseLoxoneNumericValue(raw json.RawMessage) (float64, bool) {
	if len(raw) == 0 {
		return 0, false
	}
	var num float64
	if err := json.Unmarshal(raw, &num); err == nil {
		return num, true
	}
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		s = strings.TrimSpace(s)
		if s == "" {
			return 0, false
		}
		if f, err := strconv.ParseFloat(s, 64); err == nil {
			return f, true
		}
	}
	return 0, false
}
