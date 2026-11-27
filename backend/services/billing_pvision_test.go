package services

import (
	"math"
	"testing"
	"time"
)

func TestSplitByPVisionMode(t *testing.T) {
	t0 := time.Date(2026, 11, 2, 18, 0, 0, 0, time.UTC)
	r := func(min int, kwh float64, mode, user string) chargeReading {
		return chargeReading{SessionTime: t0.Add(time.Duration(min) * time.Minute), PowerKwh: kwh, Mode: mode, State: "3", UserID: user}
	}
	readings := []chargeReading{
		r(0, 100, "solar", "a"),
		r(15, 102, "solar", "a"), // +2 solar
		r(30, 105, "full", "a"),  // +3 priority
		r(45, 106, "soft", "a"),  // +1 battery
		r(60, 110, "1", "b"),     // +4 fallback (solar) for b
		r(75, 109.5, "soft", "a"), // dip (glitch)
		r(90, 111, "soft", "a"),  // +1 above pre-dip high 110 → battery
	}
	near := func(a, b float64) bool { return math.Abs(a-b) < 1e-9 }

	full, solar, soft, _, _ := splitByPVisionMode(readings, "solar", nil)
	if !near(full, 3) || !near(solar, 6) || !near(soft, 2) {
		t.Fatalf("all: full=%v solar=%v soft=%v", full, solar, soft)
	}
	full, solar, soft, _, _ = splitByPVisionMode(readings, "full", map[string]bool{"a": true})
	if !near(full, 3) || !near(solar, 2) || !near(soft, 2) {
		t.Fatalf("card a: full=%v solar=%v soft=%v", full, solar, soft)
	}
	full, solar, soft, _, _ = splitByPVisionMode(readings, "full", map[string]bool{"b": true})
	if !near(full, 4) || !near(solar, 0) || !near(soft, 0) {
		t.Fatalf("card b (fallback full): full=%v solar=%v soft=%v", full, solar, soft)
	}
}
