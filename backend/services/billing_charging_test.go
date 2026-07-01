package services

import (
	"bufio"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

// r is a tiny constructor for a charge reading. Timestamps are only used for
// first/last tracking and ordering, so a monotonic minute counter is enough.
func r(minute int, kwh float64, mode, state string) chargeReading {
	return chargeReading{
		SessionTime: time.Date(2026, 6, 1, 0, minute, 0, 0, time.UTC),
		PowerKwh:    kwh,
		Mode:        mode,
		State:       state,
	}
}

func approx(a, b float64) bool { return math.Abs(a-b) < 0.0005 }

func TestBillableCharge(t *testing.T) {
	const idle, normal, priority = "50", "1", "2"

	cases := []struct {
		name       string
		readings   []chargeReading
		wantNormal float64
		wantPrio   float64
	}{
		{
			name:       "monotonic climb bills the full rise",
			readings:   []chargeReading{r(0, 0, normal, "3"), r(15, 1, normal, "3"), r(30, 3, normal, "3"), r(45, 6, normal, "3")},
			wantNormal: 6,
		},
		{
			// The regression this fix targets: a 0.01 kWh noise dip must NOT discard
			// the real 0.30 kWh charging interval that follows it.
			name:       "tiny noise dip preserves the following real interval",
			readings:   []chargeReading{r(0, 100.00, normal, "3"), r(15, 100.50, normal, "3"), r(30, 100.49, normal, "3"), r(45, 100.80, normal, "3")},
			wantNormal: 0.80, // = net rise 100.00 -> 100.80
		},
		{
			// A physically-impossible spike that later reverts nets out to the true rise.
			name:       "reverting phantom spike collapses to net rise",
			readings:   []chargeReading{r(0, 100, normal, "3"), r(15, 118, normal, "3"), r(30, 100, normal, "3"), r(45, 105, normal, "3"), r(60, 118.20, normal, "3")},
			wantNormal: 18.20, // net rise 100 -> 118.20
		},
		{
			// Genuine reset: counter restarts near zero and never returns to its old
			// high, so the real post-reset climb is billed on top of the pre-reset energy.
			name:       "genuine reset bills the post-reset climb",
			readings:   []chargeReading{r(0, 500, normal, "3"), r(15, 502, normal, "3"), r(30, 0, normal, "3"), r(45, 5, normal, "3"), r(60, 10, normal, "3")},
			wantNormal: 12, // 2 before reset + 10 after
		},
		{
			name:       "idle readings are skipped but bridge the counter",
			readings:   []chargeReading{r(0, 10, normal, "3"), r(15, 12, normal, idle), r(30, 15, normal, "3")},
			wantNormal: 5, // 10 -> 15, idle row ignored
		},
		{
			name:       "priority mode is tracked separately",
			readings:   []chargeReading{r(0, 0, priority, "3"), r(15, 2, priority, "3"), r(30, 5, normal, "3")},
			wantNormal: 3,
			wantPrio:   2,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			gotN, gotP, _, _, _, _ := billableCharge(tc.readings, idle, normal, priority)
			if !approx(gotN, tc.wantNormal) || !approx(gotP, tc.wantPrio) {
				t.Errorf("billableCharge = (normal %.4f, priority %.4f), want (%.4f, %.4f)",
					gotN, gotP, tc.wantNormal, tc.wantPrio)
			}
		})
	}
}

// TestBillableChargeAgainstZaptecExport validates the accounting against a real
// exported Zaptec counter file when it is present locally. The file lives outside
// the repo (a developer download), so the test skips cleanly in CI.
//
// Ground truth for this dataset:
//   - May net counter rise (device idle at the month boundary) = 338.601 kWh
//   - June net counter rise = 309.469 kWh. This exceeds Zaptec's session-based
//     June export (302.899) by ~6.5 kWh because a charging session was still
//     running at midnight on Jun 30; that energy is real June consumption but
//     Zaptec books it in July. The counter-integration model bills it in June.
func TestBillableChargeAgainstZaptecExport(t *testing.T) {
	home, err := os.UserHomeDir()
	if err != nil {
		t.Skip("no home dir")
	}
	path := filepath.Join(home, "Downloads", "chargers-Ladestation-2026-05-01-to-2026-06-30.csv")
	f, err := os.Open(path)
	if err != nil {
		t.Skipf("sample export not present: %v", err)
	}
	defer f.Close()

	var all []chargeReading
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 1024*1024), 1024*1024)
	first := true
	for sc.Scan() {
		line := sc.Text()
		if first {
			first = false
			continue
		}
		cols := strings.Split(line, ",")
		if len(cols) < 9 {
			continue
		}
		kwh, err := strconv.ParseFloat(cols[6], 64)
		if err != nil {
			continue
		}
		all = append(all, chargeReading{
			SessionTime: mustParse(cols[4]),
			PowerKwh:    kwh,
			Mode:        cols[7],
			State:       cols[8],
		})
	}

	inRange := func(lo, hi string) []chargeReading {
		var out []chargeReading
		for _, x := range all {
			s := x.SessionTime.Format(time.RFC3339)
			if s >= lo && s < hi {
				out = append(out, x)
			}
		}
		return out
	}

	// idle "50" is the Zaptec default; the export never uses it, so every reading
	// is included. Flat idle stretches contribute no delta, so the result is the
	// net counter rise regardless.
	may, _, _, _, _, _ := billableCharge(inRange("2026-05-01", "2026-06-01"), "50", "1", "2")
	june, _, _, _, _, _ := billableCharge(inRange("2026-06-01", "2026-07-01"), "50", "1", "2")

	if math.Abs(may-338.601) > 0.1 {
		t.Errorf("May = %.3f, want ~338.601", may)
	}
	if math.Abs(june-309.469) > 0.1 {
		t.Errorf("June = %.3f, want ~309.469 (net counter rise)", june)
	}
	t.Logf("May=%.3f June=%.3f", may, june)
}

func mustParse(s string) time.Time {
	t, err := time.Parse(time.RFC3339, strings.TrimSpace(s))
	if err != nil {
		return time.Time{}
	}
	return t
}
