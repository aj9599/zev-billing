package e3dc

import (
	"testing"
	"time"
)

// A recent, real instant used across the scale cases.
func refInstant() time.Time { return time.Date(2026, 7, 3, 15, 15, 0, 0, time.UTC) }

func TestAsTime_AutoScalesEpochUnit(t *testing.T) {
	ref := refInstant()
	sec := ref.Unix()

	cases := map[string]interface{}{
		"seconds":      sec,
		"milliseconds": sec * 1_000,
		"microseconds": sec * 1_000_000,
		"nanoseconds":  sec * 1_000_000_000,
		// go-rscp already turned a ns epoch into a (garbage) far-future time.Time.
		"prebuilt_ns_time": time.Unix(sec*1_000_000_000, 0),
	}

	for name, v := range cases {
		got, ok := asTime(v)
		if !ok {
			t.Fatalf("%s: asTime returned ok=false", name)
		}
		if d := got.Sub(ref); d < -time.Second || d > time.Second {
			t.Errorf("%s: got %v, want ~%v (off by %v)", name, got, ref, d)
		}
	}
}

func TestAsTime_RejectsGarbage(t *testing.T) {
	bad := []interface{}{
		int64(0),
		int64(-5),
		time.Time{},                       // zero
		time.Date(1970, 1, 1, 0, 0, 0, 0, time.UTC),
		int64(time.Now().Add(72 * time.Hour).Unix()), // too far in the future
	}
	for i, v := range bad {
		if _, ok := asTime(v); ok {
			t.Errorf("case %d (%v): expected ok=false", i, v)
		}
	}
}
