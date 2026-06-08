package services

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/aj9599/zev-billing/backend/models"
)

// newDeviceFromConfig builds a Device with the given driver + config JSON.
func newDeviceFromConfig(driver string, cfg map[string]interface{}) models.Device {
	b, _ := json.Marshal(cfg)
	return models.Device{Driver: driver, ConnectionConfig: string(b)}
}

func TestShellyGen1SwitchAndState(t *testing.T) {
	var gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path + "?" + r.URL.RawQuery
		// state read
		if r.URL.RawQuery == "" {
			_, _ = w.Write([]byte(`{"ison": true}`))
			return
		}
		_, _ = w.Write([]byte(`{"ison": true}`))
	}))
	defer srv.Close()

	host := strings.TrimPrefix(srv.URL, "http://")
	d := newDeviceFromConfig("shelly", map[string]interface{}{"host": host, "gen": 1, "channel": 0})
	drv, err := driverFor(d)
	if err != nil {
		t.Fatalf("driverFor: %v", err)
	}
	if err := drv.Switch(true); err != nil {
		t.Fatalf("Switch on: %v", err)
	}
	if !strings.Contains(gotPath, "/relay/0?turn=on") {
		t.Errorf("gen1 on URL wrong: %s", gotPath)
	}
	if err := drv.Switch(false); err != nil {
		t.Fatalf("Switch off: %v", err)
	}
	if !strings.Contains(gotPath, "turn=off") {
		t.Errorf("gen1 off URL wrong: %s", gotPath)
	}
	on, known, err := drv.ReadState()
	if err != nil || !known || !on {
		t.Errorf("ReadState gen1 = (%v,%v,%v), want (true,true,nil)", on, known, err)
	}
}

func TestShellyGen2SwitchAndState(t *testing.T) {
	var gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path + "?" + r.URL.RawQuery
		if strings.Contains(r.URL.Path, "GetStatus") {
			_, _ = w.Write([]byte(`{"id":0,"output":false}`))
			return
		}
		_, _ = w.Write([]byte(`{"was_on":true}`))
	}))
	defer srv.Close()

	host := strings.TrimPrefix(srv.URL, "http://")
	d := newDeviceFromConfig("shelly", map[string]interface{}{"host": host, "gen": 2, "channel": 1})
	drv, _ := driverFor(d)
	if err := drv.Switch(true); err != nil {
		t.Fatalf("Switch: %v", err)
	}
	if !strings.Contains(gotPath, "/rpc/Switch.Set") || !strings.Contains(gotPath, "id=1") || !strings.Contains(gotPath, "on=true") {
		t.Errorf("gen2 set URL wrong: %s", gotPath)
	}
	on, known, err := drv.ReadState()
	if err != nil || !known || on {
		t.Errorf("ReadState gen2 = (%v,%v,%v), want (false,true,nil)", on, known, err)
	}
}

func TestLoxoneSwitchAndState(t *testing.T) {
	var gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		_, _ = w.Write([]byte(`{"LL":{"control":"dev/sps/io/uuid","value":"1","Code":"200"}}`))
	}))
	defer srv.Close()

	host := strings.TrimPrefix(srv.URL, "http://")
	d := newDeviceFromConfig("loxone", map[string]interface{}{"host": host, "output_uuid": "0f12-abc", "username": "u", "password": "p"})
	drv, err := driverFor(d)
	if err != nil {
		t.Fatalf("driverFor: %v", err)
	}
	if err := drv.Switch(true); err != nil {
		t.Fatalf("Switch: %v", err)
	}
	if !strings.HasSuffix(gotPath, "/jdev/sps/io/0f12-abc/On") {
		t.Errorf("loxone on URL wrong: %s", gotPath)
	}
	if err := drv.Switch(false); err != nil {
		t.Fatalf("Switch off: %v", err)
	}
	if !strings.HasSuffix(gotPath, "/Off") {
		t.Errorf("loxone off URL wrong: %s", gotPath)
	}
	// Loxone state isn't HTTP-readable, so ReadState is a reachability check only:
	// no error (reachable) and known=false (don't trust the value).
	_, known, err := drv.ReadState()
	if err != nil || known {
		t.Errorf("ReadState loxone = (known=%v, err=%v), want (known=false, err=nil)", known, err)
	}
}

func TestDriverForErrors(t *testing.T) {
	if _, err := driverFor(models.Device{Driver: "shelly", ConnectionConfig: "{}"}); err == nil {
		t.Error("expected error for shelly without host")
	}
	if _, err := driverFor(models.Device{Driver: "loxone", ConnectionConfig: `{"host":"1.2.3.4"}`}); err == nil {
		t.Error("expected error for loxone without output_uuid")
	}
	if _, err := driverFor(models.Device{Driver: "nope", ConnectionConfig: "{}"}); err == nil {
		t.Error("expected error for unknown driver")
	}
}

func TestNormalizeHost(t *testing.T) {
	cases := map[string]string{
		"192.168.1.5":         "http://192.168.1.5",
		"192.168.1.5:8080/":   "http://192.168.1.5:8080",
		"http://host.local":   "http://host.local",
		"https://secure:443/": "https://secure:443",
		"":                    "",
	}
	for in, want := range cases {
		if got := normalizeHost(in); got != want {
			t.Errorf("normalizeHost(%q) = %q, want %q", in, got, want)
		}
	}
}
