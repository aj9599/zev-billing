package services

import (
	"database/sql"
	"math"
	"path/filepath"
	"testing"
	"time"

	"github.com/aj9599/zev-billing/backend/database"
	"github.com/aj9599/zev-billing/backend/models"
)

// almostEqual compares two floats within a small tolerance (money math).
func almostEqual(a, b float64) bool {
	return math.Abs(a-b) < 0.001
}

func TestVATBreakdown(t *testing.T) {
	cases := []struct {
		name                   string
		total                  float64
		rate                   float64
		included               bool
		wantNet, wantVAT, wantG float64
	}{
		{"no vat", 100, 0, false, 100, 0, 100},
		{"negative rate treated as none", 100, -5, true, 100, 0, 100},
		{"exclusive 8.1%", 100, 8.1, false, 100, 8.1, 108.1},
		{"inclusive 8.1%", 108.1, 8.1, true, 100, 8.1, 108.1},
		{"inclusive 7.7%", 107.7, 7.7, true, 100, 7.7, 107.7},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			s := models.BillingSettings{VATRate: c.rate, VATIncluded: c.included}
			net, vat, gross := vatBreakdown(c.total, s)
			if !almostEqual(net, c.wantNet) || !almostEqual(vat, c.wantVAT) || !almostEqual(gross, c.wantG) {
				t.Fatalf("vatBreakdown(%.3f, rate=%.1f, incl=%v) = (net %.3f, vat %.3f, gross %.3f); want (%.3f, %.3f, %.3f)",
					c.total, c.rate, c.included, net, vat, gross, c.wantNet, c.wantVAT, c.wantG)
			}
			// net + vat must always reconstruct gross.
			if !almostEqual(net+vat, gross) {
				t.Fatalf("net+vat (%.3f) != gross (%.3f)", net+vat, gross)
			}
		})
	}
}

func TestClipToSegment(t *testing.T) {
	day := func(d int) time.Time { return time.Date(2026, 1, d, 0, 0, 0, 0, time.UTC) }
	seg := PriceSegment{Start: day(10), End: day(20)}

	t.Run("fully inside", func(t *testing.T) {
		s, e, ok := clipToSegment(seg, day(12), day(18))
		if !ok || !s.Equal(day(12)) || !e.Equal(day(18)) {
			t.Fatalf("got (%v,%v,%v)", s, e, ok)
		}
	})
	t.Run("clipped both ends", func(t *testing.T) {
		s, e, ok := clipToSegment(seg, day(1), day(31))
		if !ok || !s.Equal(day(10)) || !e.Equal(day(20)) {
			t.Fatalf("got (%v,%v,%v)", s, e, ok)
		}
	})
	t.Run("no overlap", func(t *testing.T) {
		if _, _, ok := clipToSegment(seg, day(20), day(25)); ok {
			t.Fatal("expected no overlap for adjacent half-open ranges")
		}
		if _, _, ok := clipToSegment(seg, day(1), day(5)); ok {
			t.Fatal("expected no overlap before segment")
		}
	})
}

func TestSegmentSuffix(t *testing.T) {
	seg := PriceSegment{
		Start: time.Date(2026, 12, 1, 0, 0, 0, 0, time.UTC),
		End:   time.Date(2027, 1, 1, 0, 0, 0, 0, time.UTC), // exclusive → last day 31.12
	}
	if got := segmentSuffix(seg, false); got != "" {
		t.Fatalf("single-segment suffix should be empty, got %q", got)
	}
	if got := segmentSuffix(seg, true); got != " (01.12-31.12)" {
		t.Fatalf("multi-segment suffix = %q", got)
	}
}

func TestZeroBillReason(t *testing.T) {
	if r := zeroBillReason("", 5); r == "" {
		t.Fatal("expected a reason for missing meter")
	}
	if r := zeroBillReason("Unknown Meter", 5); r == "" {
		t.Fatal("expected a reason for unknown meter")
	}
	noConsumption := zeroBillReason("Wohnung 1", 0)
	allZeroTariffs := zeroBillReason("Wohnung 1", 12.3)
	if noConsumption == allZeroTariffs {
		t.Fatal("zero-consumption and zero-tariff reasons should differ")
	}
}

func TestParseStoredDate(t *testing.T) {
	want := time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC)
	for _, in := range []string{"2026-05-01", "2026-05-01T00:00:00Z", "2026-05-01T12:34:56Z"} {
		got, err := parseStoredDate(in)
		if err != nil {
			t.Fatalf("parseStoredDate(%q) error: %v", in, err)
		}
		if !got.Equal(want) {
			t.Fatalf("parseStoredDate(%q) = %v; want %v (normalized to midnight)", in, got, want)
		}
	}
	if _, err := parseStoredDate("not-a-date"); err == nil {
		t.Fatal("expected error for garbage input")
	}
	if _, err := parseStoredDate(""); err == nil {
		t.Fatal("expected error for empty input")
	}
}

func TestCalculateFrequencyProration(t *testing.T) {
	// "once" is always billed in full regardless of period length.
	if f := calculateFrequencyProration("once", 7); f != 1.0 {
		t.Fatalf("once proration = %.3f; want 1.0", f)
	}
	// A yearly item over a full year ≈ 1.0; over ~a month ≈ 1/12.
	if f := calculateFrequencyProration("yearly", 365); !almostEqual(f, 1.0) {
		t.Fatalf("yearly/365 = %.3f; want ~1.0", f)
	}
	if f := calculateFrequencyProration("yearly", 30.44); f > 0.1 || f < 0.07 {
		t.Fatalf("yearly/month = %.3f; want ~0.083", f)
	}
	// Unknown frequency falls back to monthly behaviour.
	if a, b := calculateFrequencyProration("weird", 30.44), calculateFrequencyProration("monthly", 30.44); !almostEqual(a, b) {
		t.Fatalf("unknown frequency (%.3f) should match monthly (%.3f)", a, b)
	}
}

// newTestDB spins up a real migrated SQLite database in a temp file. The mattn
// sqlite3 driver is registered transitively by importing the database package.
func newTestDB(t *testing.T) *sql.DB {
	t.Helper()
	path := filepath.Join(t.TempDir(), "test.db")
	db, err := sql.Open("sqlite3", path+"?_foreign_keys=ON")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	if err := database.RunMigrations(db); err != nil {
		t.Fatalf("run migrations: %v", err)
	}
	return db
}

// insertBuilding seeds a building row so billing_settings FKs resolve.
func insertBuilding(t *testing.T, db *sql.DB, id int, name string) {
	t.Helper()
	if _, err := db.Exec(`INSERT INTO buildings (id, name) VALUES (?, ?)`, id, name); err != nil {
		t.Fatalf("insert building: %v", err)
	}
}

// insertPricing seeds one billing_settings row. validTo "" means open-ended.
func insertPricing(t *testing.T, db *sql.DB, buildingID int, validFrom, validTo string, normal float64) {
	t.Helper()
	var vt interface{}
	if validTo != "" {
		vt = validTo
	}
	_, err := db.Exec(`
		INSERT INTO billing_settings (
			building_id, is_complex, normal_power_price, solar_power_price,
			car_charging_normal_price, car_charging_priority_price,
			vzev_export_price, vat_included, vat_rate, currency, valid_from, valid_to, is_active
		) VALUES (?, 0, ?, 0.10, 0.30, 0.40, 0.08, 0, 8.1, 'CHF', ?, ?, 1)`,
		buildingID, normal, validFrom, vt)
	if err != nil {
		t.Fatalf("insert pricing: %v", err)
	}
}

func TestLoadPriceSegments(t *testing.T) {
	db := newTestDB(t)
	bs := NewBillingService(db)
	day := func(y, m, d int) time.Time { return time.Date(y, time.Month(m), d, 0, 0, 0, 0, time.UTC) }
	insertBuilding(t, db, 1, "Single")
	insertBuilding(t, db, 2, "TwoTariffs")
	insertBuilding(t, db, 3, "Gap")

	t.Run("single open-ended row covers whole period", func(t *testing.T) {
		insertPricing(t, db, 1, "2025-01-01", "", 0.25)
		segs, err := bs.loadPriceSegments(1, day(2026, 1, 1), day(2026, 2, 1))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(segs) != 1 {
			t.Fatalf("want 1 segment, got %d", len(segs))
		}
		if segs[0].Settings.NormalPowerPrice != 0.25 {
			t.Fatalf("wrong price: %.3f", segs[0].Settings.NormalPowerPrice)
		}
	})

	t.Run("tariff change mid-period yields two contiguous segments", func(t *testing.T) {
		// 2025 rate until end of 2025, 2026 rate from 2026-01-01.
		insertPricing(t, db, 2, "2025-01-01", "2025-12-31", 0.20)
		insertPricing(t, db, 2, "2026-01-01", "", 0.30)
		// Bill spans 15.12.2025 → 15.01.2026.
		segs, err := bs.loadPriceSegments(2, day(2025, 12, 15), day(2026, 1, 16))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(segs) != 2 {
			t.Fatalf("want 2 segments, got %d", len(segs))
		}
		// Segments must be contiguous: seg[0].End == seg[1].Start.
		if !segs[0].End.Equal(segs[1].Start) {
			t.Fatalf("segments not contiguous: %v vs %v", segs[0].End, segs[1].Start)
		}
		if segs[0].Settings.NormalPowerPrice != 0.20 || segs[1].Settings.NormalPowerPrice != 0.30 {
			t.Fatalf("wrong prices: %.3f then %.3f", segs[0].Settings.NormalPowerPrice, segs[1].Settings.NormalPowerPrice)
		}
	})

	t.Run("uncovered period is reported as an error", func(t *testing.T) {
		insertPricing(t, db, 3, "2026-06-01", "2026-06-30", 0.25)
		// Bill starts before any pricing exists.
		if _, err := bs.loadPriceSegments(3, day(2026, 1, 1), day(2026, 2, 1)); err == nil {
			t.Fatal("expected an error for a period with no active pricing")
		}
	})
}
