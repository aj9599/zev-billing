package zaptec

import (
	"time"
)

// ReleaseTimeFormat is the UTC format used in charger_release_log so string
// comparison in SQL is chronological (no DST offset jumps).
const ReleaseTimeFormat = "2006-01-02T15:04:05Z"

// ReleaseTime formats t for charger_release_log / charger_release_state.
func ReleaseTime(t time.Time) string {
	return t.UTC().Format(ReleaseTimeFormat)
}

// ReleaseTokenAt returns the user token that was released for this charger at
// time t (from Loxone / the release webhook), or "" if none.
func (dh *DatabaseHandler) ReleaseTokenAt(chargerID int, t time.Time) string {
	ts := ReleaseTime(t)
	var token string
	err := dh.db.QueryRow(`
		SELECT token FROM charger_release_log
		WHERE charger_id = ? AND started_at <= ? AND (ended_at IS NULL OR ended_at >= ?)
		ORDER BY started_at DESC, id DESC LIMIT 1
	`, chargerID, ts, ts).Scan(&token)
	if err != nil {
		return ""
	}
	return token
}

// releaseTokenInWindow returns the first (first=true) or last release token
// overlapping [from, to], or "".
func (dh *DatabaseHandler) releaseTokenInWindow(chargerID int, from, to time.Time, first bool) string {
	order := "DESC"
	if first {
		order = "ASC"
	}
	var token string
	err := dh.db.QueryRow(`
		SELECT token FROM charger_release_log
		WHERE charger_id = ? AND started_at <= ? AND (ended_at IS NULL OR ended_at >= ?)
		ORDER BY started_at `+order+`, id `+order+` LIMIT 1
	`, chargerID, ReleaseTime(to), ReleaseTime(from)).Scan(&token)
	if err != nil {
		return ""
	}
	return token
}

// ResolveSessionUser returns the user for a reading at time t inside a session
// spanning [start, end]. A released token wins over the OCMF/RFID user; the
// few seconds a session can run before it is released (until the gate pauses
// it) are given to the first user released in that session.
func (dh *DatabaseHandler) ResolveSessionUser(chargerID int, t, start, end time.Time, fallback string) string {
	if tok := dh.ReleaseTokenAt(chargerID, t); tok != "" {
		return tok
	}
	if !start.IsZero() && !end.IsZero() {
		if tok := dh.releaseTokenInWindow(chargerID, start, end, !t.After(start)); tok != "" {
			return tok
		}
	}
	return fallback
}

// sessionSpan returns the first/last reading time of a completed session.
func sessionSpan(s *CompletedSession) (time.Time, time.Time) {
	var a, b time.Time
	for _, r := range s.MeterReadings {
		if a.IsZero() || r.Timestamp.Before(a) {
			a = r.Timestamp
		}
		if r.Timestamp.After(b) {
			b = r.Timestamp
		}
	}
	return a, b
}
