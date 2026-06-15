package e3dc

import (
	"encoding/hex"
	"fmt"
	"log"
	"os"
	"reflect"
	"strings"
	"sync"
	"time"

	"github.com/spali/go-rscp/rscp"
)

// debugEnabled turns on verbose RSCP response dumps (set E3DC_DEBUG=1). Use it
// once against real hardware to confirm the wallbox status/session layout.
func debugEnabled() bool { return os.Getenv("E3DC_DEBUG") == "1" }

// dumpMessage renders an RSCP message tree for diagnostics.
func dumpMessage(m rscp.Message, depth int) string {
	indent := strings.Repeat("  ", depth)
	switch v := m.Value.(type) {
	case []rscp.Message:
		s := fmt.Sprintf("%s%v (container, %d)\n", indent, m.Tag, len(v))
		for i := range v {
			s += dumpMessage(v[i], depth+1)
		}
		return s
	case []byte:
		return fmt.Sprintf("%s%v = bytes[%d] %s\n", indent, m.Tag, len(v), hex.EncodeToString(v))
	default:
		return fmt.Sprintf("%s%v = %v\n", indent, m.Tag, m.Value)
	}
}

// responseFlag is bit 23 of a tag; set in response tags, clear in request tags.
const responseFlag = rscp.Tag(1 << 23)

// reqTag strips the response flag so a response tag can be matched back to the
// request tag that produced it.
func reqTag(t rscp.Tag) rscp.Tag { return t &^ responseFlag }

// rscpClient talks to the E3/DC over the encrypted RSCP protocol. It reads the
// full EMS power block plus the integrated wallbox, and can issue wallbox
// control commands. The underlying go-rscp client is NOT reentrant, so every
// exchange is serialized through mu and a dropped socket is reconnected once.
type rscpClient struct {
	cfg    Config
	mu     sync.Mutex
	client *rscp.Client
}

func newRSCPClient(cfg Config) (Client, error) {
	if cfg.Host == "" {
		return nil, &ConfigError{Field: "e3dc_host", Msg: "required"}
	}
	if cfg.User == "" || cfg.Password == "" {
		return nil, &ConfigError{Field: "e3dc_user/e3dc_password", Msg: "required for RSCP"}
	}
	if cfg.RSCPKey == "" {
		return nil, &ConfigError{Field: "e3dc_rscp_key", Msg: "required for RSCP"}
	}
	return &rscpClient{cfg: cfg}, nil
}

// ensure (re)creates the RSCP client. Caller must hold mu.
func (r *rscpClient) ensure() error {
	if r.client != nil {
		return nil
	}
	c, err := rscp.NewClient(rscp.ClientConfig{
		Address:           r.cfg.Host,
		Port:              uint16(r.cfg.port()),
		Username:          r.cfg.User,
		Password:          r.cfg.Password,
		Key:               r.cfg.RSCPKey,
		ConnectionTimeout: 5 * time.Second,
		SendTimeout:       5 * time.Second,
		ReceiveTimeout:    5 * time.Second,
	})
	if err != nil {
		return err
	}
	r.client = c
	return nil
}

// reset drops the current connection so the next call reconnects. Caller holds mu.
func (r *rscpClient) reset() {
	if r.client != nil {
		_ = r.client.Disconnect()
		r.client = nil
	}
}

// send issues one request and returns the response, reconnecting + retrying
// once on error (E3/DC routinely drops idle RSCP sockets). Caller holds mu.
func (r *rscpClient) send(req rscp.Message) (*rscp.Message, error) {
	if err := r.ensure(); err != nil {
		return nil, err
	}
	res, err := r.client.Send(req)
	if err != nil {
		r.reset()
		if err := r.ensure(); err != nil {
			return nil, err
		}
		res, err = r.client.Send(req)
		if err != nil {
			r.reset()
			return nil, err
		}
	}
	return res, nil
}

func (r *rscpClient) Read() (*Snapshot, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	snap := &Snapshot{Timestamp: time.Now()}

	// EMS power block — one request per value (the device answers each with its
	// response-variant tag and a numeric value).
	emsReads := []struct {
		tag rscp.Tag
		set func(float64)
	}{
		{rscp.EMS_REQ_POWER_PV, func(v float64) { snap.PVPowerW = v }},
		{rscp.EMS_REQ_POWER_ADD, func(v float64) {
			if r.cfg.ExternalPower {
				snap.PVPowerW -= v
			}
		}},
		{rscp.EMS_REQ_POWER_GRID, func(v float64) { snap.GridPowerW = v }},
		{rscp.EMS_REQ_POWER_BAT, func(v float64) { snap.BatteryPowerW = -v }}, // + = discharge
		{rscp.EMS_REQ_POWER_HOME, func(v float64) { snap.HomePowerW = v }},
		{rscp.EMS_REQ_BAT_SOC, func(v float64) { snap.BatterySoC = v }},
	}

	var firstErr error
	for _, e := range emsReads {
		res, err := r.send(*rscp.NewMessage(e.tag, nil))
		if err != nil {
			if firstErr == nil {
				firstErr = err
			}
			continue
		}
		if v, ok := asFloat64(res.Value); ok {
			e.set(v)
		}
	}
	// If we couldn't read anything at all, surface the error.
	if firstErr != nil && snap.PVPowerW == 0 && snap.GridPowerW == 0 && snap.HomePowerW == 0 {
		return nil, fmt.Errorf("e3dc rscp read: %w", firstErr)
	}

	// Wallbox block — sent inside a WB_REQ_DATA container addressed by index.
	r.readWallbox(snap)

	// Session block (RFID + per-session solar/total energy). Best-effort and
	// isolated so a failure never affects the main wallbox read.
	r.readWallboxSession(snap)

	return snap, nil
}

// readWallboxSession reads the current charging session's RFID token and
// solar/total energy. Non-fatal: failures leave the session fields empty.
func (r *rscpClient) readWallboxSession(snap *Snapshot) {
	// WB_REQ_SESSION is a top-level query for the *current* session — it is NOT
	// wrapped in a WB_REQ_DATA/WB_INDEX container (evcc sends it bare, and the
	// device ignores the wrapped form). The response is a container of session
	// fields.
	res, err := r.send(*rscp.NewMessage(rscp.WB_REQ_SESSION, nil))
	if err != nil {
		return
	}
	if debugEnabled() {
		log.Printf("e3dc rscp WB_REQ_SESSION response:\n%s", dumpMessage(*res, 0))
	}
	inner, ok := res.Value.([]rscp.Message)
	if !ok {
		return
	}
	if v, found := findTag(inner, rscp.WB_SESSION_AUTH_DATA); found {
		snap.WallboxRFID = formatRFID(v)
	}
	if v, found := findTag(inner, rscp.WB_SESSION_CHARGED_ENERGY); found {
		if f, ok := asFloat64(v); ok {
			snap.WallboxSessionEnergyKWh = f / 1000.0
		}
	}
	if v, found := findTag(inner, rscp.WB_SESSION_CHARGED_SUN_ENERGY); found {
		if f, ok := asFloat64(v); ok {
			snap.WallboxSessionSolarKWh = f / 1000.0
		}
	}
}

// findTag recursively searches a (possibly nested) slice of RSCP messages for
// the given tag and returns its value.
func findTag(msgs []rscp.Message, tag rscp.Tag) (interface{}, bool) {
	for i := range msgs {
		m := msgs[i]
		if m.Tag == tag {
			return m.Value, true
		}
		if nested, ok := m.Value.([]rscp.Message); ok {
			if v, found := findTag(nested, tag); found {
				return v, true
			}
		}
	}
	return nil, false
}

// formatRFID renders an RFID token value as an uppercase hex string. The token
// comes back either as a byte array or as a string depending on firmware; both
// are normalised. NOTE: the exact on-screen format (and byte order — E3/DC also
// exposes a *_SWAPPED variant) should be verified against real hardware so it
// matches the value tenants register.
func formatRFID(v interface{}) string {
	switch b := v.(type) {
	case []byte:
		s := strings.ToUpper(hex.EncodeToString(b))
		return strings.TrimLeft(s, "0") // drop leading zero padding; "" if all-zero
	case string:
		return strings.TrimSpace(b)
	default:
		return ""
	}
}

// readWallbox queries the configured wallbox and fills the wallbox fields of
// snap. Failures are non-fatal (the EMS data is still useful on systems without
// a wallbox).
func (r *rscpClient) readWallbox(snap *Snapshot) {
	container := rscp.NewMessage(rscp.WB_REQ_DATA, []rscp.Message{
		*rscp.NewMessage(rscp.WB_INDEX, uint8(r.cfg.WallboxIndex)),
		*rscp.NewMessage(rscp.WB_REQ_ENERGY_ALL, nil),
		*rscp.NewMessage(rscp.WB_REQ_ENERGY_SOLAR, nil),
		*rscp.NewMessage(rscp.WB_REQ_PM_ENERGY_L1, nil),
		*rscp.NewMessage(rscp.WB_REQ_PM_ENERGY_L2, nil),
		*rscp.NewMessage(rscp.WB_REQ_PM_ENERGY_L3, nil),
		*rscp.NewMessage(rscp.WB_REQ_PM_POWER_L1, nil),
		*rscp.NewMessage(rscp.WB_REQ_PM_POWER_L2, nil),
		*rscp.NewMessage(rscp.WB_REQ_PM_POWER_L3, nil),
		*rscp.NewMessage(rscp.WB_REQ_EXTERN_DATA_ALG, nil),
	})

	res, err := r.send(*container)
	if err != nil {
		return
	}
	if debugEnabled() {
		log.Printf("e3dc rscp WB_REQ_DATA response:\n%s", dumpMessage(*res, 0))
	}
	inner, ok := res.Value.([]rscp.Message)
	if !ok {
		return
	}

	var l1, l2, l3 float64
	for i := range inner {
		m := inner[i]
		switch reqTag(m.Tag) {
		case rscp.WB_REQ_ENERGY_ALL:
			if v, ok := asFloat64(m.Value); ok {
				snap.WallboxEnergyKWh = v / 1000.0 // Wh → kWh
				snap.WallboxEnergyValid = true
			}
		case rscp.WB_REQ_ENERGY_SOLAR:
			if v, ok := asFloat64(m.Value); ok {
				snap.WallboxEnergySolarKWh = v / 1000.0
			}
		case rscp.WB_REQ_PM_ENERGY_L1:
			if v, ok := asFloat64(m.Value); ok {
				snap.WallboxPMEnergyL1 = v
				snap.WallboxPMEnergyValid = true
			}
		case rscp.WB_REQ_PM_ENERGY_L2:
			if v, ok := asFloat64(m.Value); ok {
				snap.WallboxPMEnergyL2 = v
			}
		case rscp.WB_REQ_PM_ENERGY_L3:
			if v, ok := asFloat64(m.Value); ok {
				snap.WallboxPMEnergyL3 = v
			}
		case rscp.WB_REQ_PM_POWER_L1:
			l1, _ = mustFloat(m.Value)
		case rscp.WB_REQ_PM_POWER_L2:
			l2, _ = mustFloat(m.Value)
		case rscp.WB_REQ_PM_POWER_L3:
			l3, _ = mustFloat(m.Value)
		case rscp.WB_REQ_EXTERN_DATA_ALG, rscp.WB_EXTERN_DATA_ALG:
			parseWallboxStatus(m.Value, snap)
		}
	}
	snap.WallboxPowerW = l1 + l2 + l3
}

// parseWallboxStatus decodes the WB_EXTERN_DATA_ALG status byte array. In
// go-rscp v0.2.2 WB_EXTERN_DATA_ALG is a Container, so the raw bytes are nested
// one or two levels deep (evcc reaches them via rscpContainer→rscpContainer→
// rscpBytes); on some firmwares the value is a plain byte array. findBytes
// handles both. Byte index 2 is a status bitfield matching evcc:
// bit5 (0x20) = charging (StatusC), bit3 (0x08) = vehicle connected (StatusB).
func parseWallboxStatus(v interface{}, snap *Snapshot) {
	b := findBytes(v)
	if len(b) < 3 {
		return
	}
	status := b[2]
	snap.WallboxConnected = status&0x08 != 0
	snap.WallboxCharging = status&0x20 != 0
	snap.WallboxStatusOK = true
}

// findBytes recursively descends a possibly-nested RSCP value and returns the
// first []byte it finds. Used to reach the status byte array inside the
// WB_EXTERN_DATA_ALG container regardless of how deeply the firmware nests it.
func findBytes(v interface{}) []byte {
	switch t := v.(type) {
	case []byte:
		return t
	case []rscp.Message:
		for i := range t {
			if b := findBytes(t[i].Value); b != nil {
				return b
			}
		}
	}
	return nil
}

func (r *rscpClient) CanControl() bool { return true }

// SetWallboxEnabled starts/stops charging by writing WB_REQ_SET_ABORT_CHARGING
// (abort = !on) inside the wallbox container.
func (r *rscpClient) SetWallboxEnabled(on bool) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	container := rscp.NewMessage(rscp.WB_REQ_DATA, []rscp.Message{
		*rscp.NewMessage(rscp.WB_INDEX, uint8(r.cfg.WallboxIndex)),
		*rscp.NewMessage(rscp.WB_REQ_SET_ABORT_CHARGING, !on),
	})
	_, err := r.send(*container)
	return err
}

// SetWallboxMaxCurrent writes WB_REQ_SET_MAX_CHARGE_CURRENT (Amps) inside the
// wallbox container.
func (r *rscpClient) SetWallboxMaxCurrent(amps int) error {
	if amps < 0 {
		amps = 0
	}
	if amps > 255 {
		amps = 255
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	container := rscp.NewMessage(rscp.WB_REQ_DATA, []rscp.Message{
		*rscp.NewMessage(rscp.WB_INDEX, uint8(r.cfg.WallboxIndex)),
		*rscp.NewMessage(rscp.WB_REQ_SET_MAX_CHARGE_CURRENT, uint8(amps)),
	})
	_, err := r.send(*container)
	return err
}

func (r *rscpClient) Close() error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.reset()
	return nil
}

// mustFloat is asFloat64 discarding the ok flag (0 when not numeric).
func mustFloat(v interface{}) (float64, bool) { return asFloat64(v) }

// asFloat64 converts an RSCP message value (which may be a pointer to a numeric
// type, or a concrete numeric/bool) to a float64. Returns ok=false for
// non-numeric values (strings, byte arrays, nil, RSCP errors).
func asFloat64(v interface{}) (float64, bool) {
	if v == nil {
		return 0, false
	}
	rv := reflect.ValueOf(v)
	if rv.Kind() == reflect.Ptr {
		if rv.IsNil() {
			return 0, false
		}
		rv = rv.Elem()
	}
	switch rv.Kind() {
	case reflect.Float32, reflect.Float64:
		return rv.Float(), true
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
		return float64(rv.Int()), true
	case reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64:
		return float64(rv.Uint()), true
	case reflect.Bool:
		if rv.Bool() {
			return 1, true
		}
		return 0, true
	default:
		return 0, false
	}
}
