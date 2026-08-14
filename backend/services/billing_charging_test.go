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

// ru is like r() but also tags the interval's RFID card, for the shared-counter split.
func ru(minute int, kwh float64, mode, state, user string) chargeReading {
	rr := r(minute, kwh, mode, state)
	rr.UserID = user
	return rr
}

// TestBillableChargeByUser covers the reported bug: two tenants share one E3/DC
// wallbox (one cumulative counter) and charge in interleaved runs. Each must be
// billed only their own runs — not the whole counter's rise.
func TestBillableChargeByUser(t *testing.T) {
	const idle, normal, priority = "1", "solar", "grid"

	// Shared counter: A charges 0->10, B charges 10->30, A again 30->45.
	// Idle rows (state "1") carry the tail of the run that just finished.
	readings := []chargeReading{
		ru(0, 0, normal, "3", "A"),
		ru(15, 6, normal, "3", "A"),
		ru(30, 10, normal, "1", ""), // A's tail (charging stopped mid-interval)
		ru(45, 20, priority, "3", "B"),
		ru(60, 30, normal, "3", "B"),
		ru(75, 32, normal, "1", ""), // B's tail
		ru(90, 40, normal, "3", "A"),
		ru(105, 45, normal, "3", "A"),
	}

	byCard := billableChargeByUser(readings, idle, normal, priority)

	// A: 0->10 (incl. tail) + 32->45 = 10 + 13 = 23, all normal.
	if a := byCard["A"]; a == nil || !approx(a.normal, 23) || !approx(a.priority, 0) {
		t.Fatalf("A = %+v, want normal 23, priority 0", byCard["A"])
	}
	// B: 10->20 priority + 20->32 (incl. tail) normal = 10 priority + 12 normal.
	if b := byCard["B"]; b == nil || !approx(b.normal, 12) || !approx(b.priority, 10) {
		t.Fatalf("B = %+v, want normal 12, priority 10", byCard["B"])
	}
	// Sanity: the split conserves the counter's total rise (45 kWh), no double-count.
	total := byCard["A"].normal + byCard["A"].priority + byCard["B"].normal + byCard["B"].priority
	if !approx(total, 45) {
		t.Fatalf("split total = %.3f, want 45 (the counter rise)", total)
	}
}

// TestBillableChargeByUser_SingleTenantMatchesWholeCounter guards that a charger
// used by one tenant still bills the full net rise (parity with billableCharge).
func TestBillableChargeByUser_SingleTenantMatchesWholeCounter(t *testing.T) {
	const idle, normal, priority = "1", "solar", "grid"
	readings := []chargeReading{
		ru(0, 100, normal, "3", "A"),
		ru(15, 118, normal, "3", "A"), // spike
		ru(30, 100, normal, "3", "A"), // reverts
		ru(45, 105, normal, "3", "A"),
		ru(60, 118.20, normal, "3", "A"),
	}
	byCard := billableChargeByUser(readings, idle, normal, priority)
	if a := byCard["A"]; a == nil || !approx(a.normal, 18.20) {
		t.Fatalf("A.normal = %v, want 18.20 (net rise, spike collapsed)", byCard["A"])
	}
}

// TestE3DCSessionChargeForCards checks that an E3/DC wallbox is billed from its
// own per-session solar/grid counters (e3dc_session_history), split per RFID card
// — so the minor grid share inside mostly-solar slots is preserved (the reported
// "grid shows ~0" bug), and each tenant gets only their own sessions.
func TestE3DCSessionChargeForCards(t *testing.T) {
	db := newTestDB(t)
	defer db.Close()
	bs := NewBillingService(db)

	if _, err := db.Exec(`INSERT INTO buildings (id, name) VALUES (1, 'Test Building')`); err != nil {
		t.Fatalf("insert building: %v", err)
	}
	if _, err := db.Exec(`INSERT INTO chargers (id, name, brand, preset, building_id, connection_type, connection_config, billing_method)
		VALUES (1, 'Ladestation', 'e3dc', 'e3dc', 1, 'e3dc_api', '{"mode_normal":"solar","mode_priority":"grid"}', 'mode_based')`); err != nil {
		t.Fatalf("insert charger: %v", err)
	}

	// Two cards, interleaved sessions. Card A: solar 27.6 + 26.2, grid 0.5 + 1.4.
	// Card B: solar 33.8, grid 0.2. One session sits outside the billing window.
	// Insert start/end as time.Time so the stored format matches the query args
	// (production writes them as time.Time too).
	day := func(mon, d, h, mi int) time.Time { return time.Date(2026, time.Month(mon), d, h, mi, 0, 0, time.UTC) }
	rows := []struct {
		key         string
		start, end  time.Time
		total, s, g float64
		rfid        string
	}{
		{"a1", day(7, 3, 15, 15), day(7, 3, 18, 15), 28.1, 27.6, 0.5, "A"},
		{"b1", day(7, 4, 16, 0), day(7, 4, 20, 0), 34.0, 33.8, 0.2, "B"},
		{"a2", day(7, 16, 9, 30), day(7, 16, 13, 15), 27.6, 26.2, 1.4, "A"},
		{"a3", day(8, 2, 9, 30), day(8, 2, 13, 15), 10.0, 9.0, 1.0, "A"}, // out of window
	}
	for _, r := range rows {
		if _, err := db.Exec(`INSERT INTO e3dc_session_history
			(charger_id, session_key, start_time, end_time, total_kwh, solar_kwh, grid_kwh, rfid, source)
			VALUES (1, ?, ?, ?, ?, ?, ?, ?, 'device')`,
			r.key, r.start, r.end, r.total, r.s, r.g, r.rfid); err != nil {
			t.Fatalf("insert session %s: %v", r.key, err)
		}
	}

	start := time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)
	end := time.Date(2026, 8, 1, 0, 0, 0, 0, time.UTC)

	// Card A only: solar 27.6+26.2 = 53.8 (normal), grid 0.5+1.4 = 1.9 (priority).
	n, p, first, _ := bs.e3dcSessionChargeForCards(1, map[string]bool{"A": true}, start, end)
	if !approx(n, 53.8) || !approx(p, 1.9) {
		t.Fatalf("card A = (normal %.3f, priority %.3f), want (53.8, 1.9)", n, p)
	}
	if first.IsZero() {
		t.Fatalf("expected a session start time for card A")
	}

	// Full end-to-end through calculateChargingConsumption for card A.
	cn, cp, _, _ := bs.calculateChargingConsumption(1, "A", start, end)
	if !approx(cn, 53.8) || !approx(cp, 1.9) {
		t.Fatalf("calculateChargingConsumption(A) = (%.3f, %.3f), want (53.8, 1.9)", cn, cp)
	}

	// Card B only: solar 33.8 (normal), grid 0.2 (priority) — no bleed from A.
	bn, bp, _, _ := bs.e3dcSessionChargeForCards(1, map[string]bool{"B": true}, start, end)
	if !approx(bn, 33.8) || !approx(bp, 0.2) {
		t.Fatalf("card B = (normal %.3f, priority %.3f), want (33.8, 0.2)", bn, bp)
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
