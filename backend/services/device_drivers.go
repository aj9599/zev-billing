package services

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/aj9599/zev-billing/backend/models"
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

// ---- Config shapes (parsed from Device.ConnectionConfig JSON) ----

type shellyConfig struct {
	Host     string `json:"host"`
	Gen      int    `json:"gen"`     // 1 or 2 (default 1)
	Channel  int    `json:"channel"` // relay/switch index (default 0)
	AuthUser string `json:"auth_user"`
	AuthPass string `json:"auth_pass"`
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
	var url string
	if s.cfg.Gen >= 2 {
		// Gen2+ RPC
		val := "false"
		if on {
			val = "true"
		}
		url = fmt.Sprintf("%s/rpc/Switch.Set?id=%d&on=%s", s.base(), s.cfg.Channel, val)
	} else {
		// Gen1 REST
		turn := "off"
		if on {
			turn = "on"
		}
		url = fmt.Sprintf("%s/relay/%d?turn=%s", s.base(), s.cfg.Channel, turn)
	}
	_, err := httpGetBody(url, s.cfg.AuthUser, s.cfg.AuthPass)
	return err
}

func (s *shellyDriver) ReadState() (bool, bool, error) {
	if s.cfg.Gen >= 2 {
		url := fmt.Sprintf("%s/rpc/Switch.GetStatus?id=%d", s.base(), s.cfg.Channel)
		body, err := httpGetBody(url, s.cfg.AuthUser, s.cfg.AuthPass)
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
	url := fmt.Sprintf("%s/relay/%d", s.base(), s.cfg.Channel)
	body, err := httpGetBody(url, s.cfg.AuthUser, s.cfg.AuthPass)
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

// loxoneStateProvider returns the live value of a control's state UUID from the
// Loxone WebSocket binary status stream. Set once at startup by the device
// controller (wired to DataCollector.GetLoxoneState). nil in tests.
var loxoneStateProvider func(stateUUID string) (float64, bool)

func (l *loxoneDriver) ReadState() (bool, bool, error) {
	// Preferred: the REAL actuator state from the WebSocket status stream
	// (reflects changes made anywhere, incl. directly in Loxone).
	if loxoneStateProvider != nil && l.cfg.StateUUID != "" {
		if v, ok := loxoneStateProvider(l.cfg.StateUUID); ok {
			return v > 0.5, true, nil
		}
	}
	// Fallback: an HTTP GET of the control UUID does NOT reliably return the real
	// state (returns 0 even when on; state UUIDs aren't HTTP-readable), so use it
	// only as a reachability check and report known=false so the controller keeps
	// its own commanded state instead of clobbering it.
	url := fmt.Sprintf("%s/jdev/sps/io/%s", l.base(), l.cfg.OutputUUID)
	if _, err := httpGetBody(url, l.cfg.Username, l.cfg.Password); err != nil {
		return false, false, err
	}
	return false, false, nil
}
