package loxone

import (
	"database/sql"
	"log"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// LclEvent is one entry of the Wallbox block's Lcl ("Last Charge Log")
// output. The output is an event log, not one summary per session, e.g.
//
//	2026-11-25 12:53:34:Benutzer einstellen;user:2
//	2026-06-08 13:22:26:Fahrzeug getrennt;user:-;Geladene Energie:0.0kWh;Dauer:1346 s;0.00Rp.
//
// The event text and field labels follow the Miniserver language, so the
// parser keys on the value shapes (kWh, "<n> s") and on "user:", not on the
// German labels. Gen 2 blocks are known to report 0.0 kWh and "user:-" on
// the end event, so callers must fall back to the Mr counter and to the
// user taken from an earlier event.
type LclEvent struct {
	Time        time.Time
	Event       string  // e.g. "Benutzer einstellen", "Fahrzeug getrennt"
	UserID      string  // "" when absent or "-"
	EnergyKWh   float64 // 0 when absent
	HasEnergy   bool
	DurationSec float64 // 0 when absent
	IsEnd       bool    // carries a session summary (duration or energy)
	Raw         string
}

var (
	lclKwhRe = regexp.MustCompile(`^(-?\d+(?:[.,]\d+)?)\s*kWh$`)
	lclSecRe = regexp.MustCompile(`^(\d+(?:[.,]\d+)?)\s*s$`)
)

// ParseLcl parses one Lcl value. ok is false when there is no timestamp.
func ParseLcl(raw string) (ev LclEvent, ok bool) {
	s := strings.TrimSpace(raw)
	ev.Raw = s
	if len(s) < 19 {
		return ev, false
	}
	t, err := time.ParseInLocation("2006-01-02 15:04:05", s[:19], time.Local)
	if err != nil {
		return ev, false
	}
	ev.Time = t
	rest := strings.TrimLeft(s[19:], ": ")

	for i, tok := range strings.Split(rest, ";") {
		tok = strings.TrimSpace(tok)
		if tok == "" {
			continue
		}
		key, val := "", tok
		if k, v, found := strings.Cut(tok, ":"); found {
			key, val = strings.TrimSpace(k), strings.TrimSpace(v)
		}
		lkey := strings.ToLower(key)
		switch {
		case lkey == "user" || lkey == "uid" || lkey == "benutzer":
			if val != "-" && val != "" {
				ev.UserID = val
			}
		case lclKwhRe.MatchString(val):
			if f, err := strconv.ParseFloat(strings.Replace(lclKwhRe.FindStringSubmatch(val)[1], ",", ".", 1), 64); err == nil {
				ev.EnergyKWh, ev.HasEnergy = f, true
			}
		case key != "" && lclSecRe.MatchString(val):
			if f, err := strconv.ParseFloat(strings.Replace(lclSecRe.FindStringSubmatch(val)[1], ",", ".", 1), 64); err == nil {
				ev.DurationSec = f
			}
		case i == 0:
			ev.Event = tok
		}
	}
	ev.IsEnd = ev.DurationSec > 0 || ev.HasEnergy
	return ev, true
}

// ParseLclString is the older interface used by the session logic.
func ParseLclString(lcl string) (userID string, energy float64, endTime time.Time, duration float64) {
	ev, ok := ParseLcl(lcl)
	if !ok {
		return "", 0, time.Time{}, 0
	}
	return ev.UserID, ev.EnergyKWh, ev.Time, ev.DurationSec
}

// RecordLclEvent stores one Lcl event (once per charger and raw text) in
// charger_lcl_events, as an audit trail for checking sessions against the
// Wallbox's own log.
func RecordLclEvent(db *sql.DB, chargerID int, ev LclEvent) {
	if db == nil {
		return
	}
	var duration, energy interface{}
	if ev.DurationSec > 0 {
		duration = ev.DurationSec
	}
	if ev.HasEnergy {
		energy = ev.EnergyKWh
	}
	if _, err := db.Exec(`
		INSERT OR IGNORE INTO charger_lcl_events
			(charger_id, event_time, event, user_id, energy_kwh, duration_sec, is_end, raw)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, chargerID, ev.Time.Format("2006-01-02 15:04:05-07:00"), ev.Event, ev.UserID, energy, duration, ev.IsEnd, ev.Raw); err != nil {
		log.Printf("WARNING: could not store Lcl event for charger %d: %v", chargerID, err)
	}
}
