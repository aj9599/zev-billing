package loxone

import (
	"testing"
	"time"
)

func TestParseLclUserSet(t *testing.T) {
	ev, ok := ParseLcl("2026-11-25 12:53:34:Benutzer einstellen;user:2")
	if !ok {
		t.Fatal("not parsed")
	}
	want := time.Date(2026, 11, 25, 12, 53, 34, 0, time.Local)
	if !ev.Time.Equal(want) || ev.Event != "Benutzer einstellen" || ev.UserID != "2" || ev.IsEnd {
		t.Errorf("got %+v", ev)
	}
}

func TestParseLclEnd(t *testing.T) {
	ev, ok := ParseLcl("2026-06-08 13:22:26:Fahrzeug getrennt;user:-;Geladene Energie:0.0kWh;Dauer:1346 s;0.00Rp.")
	if !ok {
		t.Fatal("not parsed")
	}
	if ev.Event != "Fahrzeug getrennt" || ev.UserID != "" || !ev.HasEnergy || ev.EnergyKWh != 0 || ev.DurationSec != 1346 || !ev.IsEnd {
		t.Errorf("got %+v", ev)
	}
}

func TestParseLclOldFormatAndOtherLanguage(t *testing.T) {
	ev, _ := ParseLcl("2025-11-29 12:17:16:Vehicle disconnected;user:1;Charged energy:37.2kWh;Duration:65357 s")
	if ev.UserID != "1" || ev.EnergyKWh != 37.2 || ev.DurationSec != 65357 || !ev.IsEnd {
		t.Errorf("got %+v", ev)
	}
	u, e, end, d := ParseLclString("2025-11-29 12:17:16:Fahrzeug getrennt;user:1;Geladene Energie:37.2kWh;Dauer:65357 s")
	if u != "1" || e != 37.2 || d != 65357 || end.IsZero() {
		t.Errorf("ParseLclString = %q %v %v %v", u, e, end, d)
	}
}

func TestParseLclInvalid(t *testing.T) {
	for _, s := range []string{"", "garbage", "2026-13-45 99:99:99:x"} {
		if _, ok := ParseLcl(s); ok {
			t.Errorf("%q parsed", s)
		}
	}
}
