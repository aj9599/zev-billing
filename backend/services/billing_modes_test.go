package services

import (
	"math"
	"testing"
	"time"
)

func TestResolveModeMapping(t *testing.T) {
	cases := []struct {
		name         string
		connType     string
		cfg          map[string]interface{}
		wantNormal   string
		wantPriority string
	}{
		{"loxone single-block without stored mapping", "loxone_api", map[string]interface{}{"loxone_uuid_mode": "single"}, "2,3", "1,99"},
		{"loxone explicit mapping wins", "loxone_api", map[string]interface{}{"mode_normal": "1", "mode_priority": "2"}, "1", "2"},
		{"generic charger keeps 1/2", "http", map[string]interface{}{}, "1", "2"},
	}
	for _, c := range cases {
		n, p := resolveModeMapping(c.connType, c.cfg)
		if n != c.wantNormal || p != c.wantPriority {
			t.Errorf("%s: got normal=%q priority=%q, want %q/%q", c.name, n, p, c.wantNormal, c.wantPriority)
		}
	}
}

// Weidmüller/Loxone scheme: 1 = Priority, 2 = Solar, 3 = Solar priority, 99 = Priority w/ set power.
func TestBillableChargeLoxoneModes(t *testing.T) {
	base := time.Date(2026, 11, 1, 10, 0, 0, 0, time.Local)
	r := func(i int, kwh float64, mode string) chargeReading {
		return chargeReading{SessionTime: base.Add(time.Duration(i) * 15 * time.Minute), PowerKwh: kwh, Mode: mode, State: "3"}
	}
	readings := []chargeReading{
		r(0, 100, "2"),
		r(1, 101, "2"),  // +1 solar
		r(2, 103, "3"),  // +2 solar priority -> solar
		r(3, 107, "1"),  // +4 priority
		r(4, 115, "99"), // +8 priority w/ set power -> priority
	}
	normal, priority, _, _, _, _ := billableCharge(readings, "50", "2,3", "1,99")
	if math.Abs(normal-3) > 1e-9 || math.Abs(priority-12) > 1e-9 {
		t.Fatalf("got normal=%.3f priority=%.3f, want 3/12", normal, priority)
	}
}
