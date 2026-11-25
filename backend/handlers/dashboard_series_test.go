package handlers

import (
	"math"
	"testing"
	"time"
)

func at(h, m, s int) time.Time {
	return time.Date(2026, 11, 25, h, m, s, 0, time.Local)
}

func TestQuarterSlotEnd(t *testing.T) {
	cases := map[time.Time]time.Time{
		at(14, 15, 0):  at(14, 15, 0),
		at(14, 15, 40): at(14, 15, 0), // within tolerance
		at(14, 16, 0):  at(14, 30, 0),
		at(18, 47, 12): at(19, 0, 0),
		at(12, 1, 23):  at(12, 15, 0),
	}
	for in, want := range cases {
		if got := quarterSlotEnd(in); !got.Equal(want) {
			t.Errorf("quarterSlotEnd(%s) = %s, want %s", in.Format("15:04:05"), got.Format("15:04:05"), want.Format("15:04:05"))
		}
	}
}

// Two users share one charger counter. User 2 charges 12:00–12:30 (5 kWh),
// user 1 charges 13:00–13:45 with an exact Loxone end row at 13:47:12.
// Old code: user 1's first delta (from their own previous row, days ago)
// would include user 2's energy, and the 2-minute end delta was shown as 15
// minutes worth.
func TestChargerUserSeriesSharedCounter(t *testing.T) {
	rows := []chargerRow{
		{at(12, 0, 0), 100, "", "1"},
		{at(12, 15, 0), 102.5, "2", "3"},
		{at(12, 30, 0), 105, "2", "3"},
		{at(12, 45, 0), 105, "", "1"},
		{at(13, 0, 0), 105, "", "1"},
		{at(13, 15, 0), 107, "1", "3"},
		{at(13, 30, 0), 109, "1", "3"},
		{at(13, 45, 0), 111, "1", "3"},
		{at(13, 47, 12), 111.2, "1", "3"},
		{at(14, 0, 0), 111.2, "", "1"},
	}
	got := chargerUserSeries(rows)

	sum := func(s slotEnergy) float64 {
		var t float64
		for _, v := range s {
			t += v
		}
		return t
	}
	if v := sum(got["2"]); math.Abs(v-5) > 1e-9 {
		t.Errorf("user 2 total = %.3f kWh, want 5", v)
	}
	if v := sum(got["1"]); math.Abs(v-6.2) > 1e-9 {
		t.Errorf("user 1 total = %.3f kWh, want 6.2", v)
	}
	if len(got[""]) != 0 {
		t.Errorf("unexpected unattributed energy: %v", got[""])
	}
	// The 13:45–13:47 tail belongs to the 14:00 slot, not over 13:45.
	if v := got["1"][at(13, 45, 0).Unix()]; math.Abs(v-2) > 1e-9 {
		t.Errorf("user 1 13:45 slot = %.3f kWh, want 2", v)
	}
	if v := got["1"][at(14, 0, 0).Unix()]; math.Abs(v-0.2) > 1e-9 {
		t.Errorf("user 1 14:00 slot = %.3f kWh, want 0.2", v)
	}
}

func TestChargerUserSeriesGapSpreadAndGlitch(t *testing.T) {
	rows := []chargerRow{
		{at(10, 0, 0), 50, "7", "3"},
		{at(10, 45, 0), 56, "7", "3"},  // 45-min gap: 6 kWh over 3 slots
		{at(11, 0, 0), 200, "7", "3"},  // +144 kWh in 15 min: glitch
		{at(11, 15, 0), 201, "7", "3"}, // counts from the rebased value
		{at(11, 30, 0), 150, "7", "3"}, // reset
		{at(11, 45, 0), 151, "7", "3"},
	}
	got := chargerUserSeries(rows)["7"]
	for _, slot := range []time.Time{at(10, 15, 0), at(10, 30, 0), at(10, 45, 0)} {
		if v := got[slot.Unix()]; math.Abs(v-2) > 1e-9 {
			t.Errorf("slot %s = %.3f, want 2", slot.Format("15:04"), v)
		}
	}
	if _, ok := got[at(11, 0, 0).Unix()]; ok {
		t.Errorf("glitch slot should be skipped")
	}
	if v := got[at(11, 15, 0).Unix()]; math.Abs(v-1) > 1e-9 {
		t.Errorf("11:15 = %.3f, want 1", v)
	}
	if v := got[at(11, 45, 0).Unix()]; math.Abs(v-1) > 1e-9 {
		t.Errorf("11:45 = %.3f, want 1", v)
	}
}

func TestMeterSlotsSumDuplicates(t *testing.T) {
	s := slotEnergy{}
	// Two collections in the same quarter: 0.48 + 0.02 kWh.
	s.add(quarterSlotEnd(at(14, 15, 0)), 0.48)
	s.add(quarterSlotEnd(at(14, 15, 30)), 0.02)
	series := s.toSeries(at(14, 0, 0), at(15, 0, 0), "apartment_meter", 1)
	if len(series) != 1 || math.Abs(series[0].Power-2000) > 1e-6 {
		t.Fatalf("got %+v, want one point at 2000 W", series)
	}
}

// Interpolated rows written with the summer offset after the DST change sit
// on the same curve; they must not double the energy.
func TestMeterCounterSeriesInterleavedRows(t *testing.T) {
	rows := []counterRow{
		{at(13, 0, 0), 4586.604},
		{at(13, 15, 0), 4586.8588}, // interpolated duplicate, same instant
		{at(13, 15, 0), 4586.923},
		{at(13, 30, 0), 4587.136},
		{at(13, 30, 0), 4587.10}, // lower duplicate: ignored
		{at(13, 45, 0), 4587.295},
	}
	s := meterCounterSeries(rows)
	var total float64
	for _, v := range s {
		total += v
	}
	if math.Abs(total-(4587.295-4586.604)) > 1e-9 {
		t.Errorf("total = %.4f, want %.4f", total, 4587.295-4586.604)
	}
	if v := s[at(13, 15, 0).Unix()]; math.Abs(v-0.319) > 1e-9 {
		t.Errorf("13:15 slot = %.4f, want 0.319", v)
	}
}
