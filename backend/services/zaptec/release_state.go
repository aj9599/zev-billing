package zaptec

import (
	"database/sql"
	"fmt"
	"time"
)

// ReleaseState is the live release gate of one charger.
type ReleaseState struct {
	ChargerID     int    `json:"charger_id"`
	Enabled       int    `json:"enabled"`   // 1 = release required for this charger
	Connected     int    `json:"connected"` // car plugged in
	Waiting       int    `json:"waiting"`   // car plugged in, not released yet (Loxone input 1)
	Remind        int    `json:"remind"`    // 1 for a short window after each reminder (Loxone input 2)
	ReminderSeq   int    `json:"reminder_seq"`
	Released      int    `json:"released"`
	User          int    `json:"user"` // released user value (1 = private, 2 = business)
	Token         string `json:"token"`
	Acked         int    `json:"acked"` // reminders acknowledged for this plug-in
	State         int    `json:"state"` // Zaptec OperatingMode
	WaitingSince  string `json:"waiting_since"`
	LastReminder  string `json:"last_reminder"`
	ResumePending int    `json:"-"`
	LastPauseCmd  string `json:"-"`
}

// RemindWindow is how long "remind" stays 1 after a reminder, so a Loxone
// virtual HTTP input polling every 10-30 s reliably sees the pulse.
const RemindWindow = 90 * time.Second

// LoadReleaseState reads the gate of a charger (zero state if none yet).
func LoadReleaseState(db *sql.DB, chargerID int) (*ReleaseState, error) {
	st := &ReleaseState{ChargerID: chargerID}
	err := db.QueryRow(`
		SELECT connected, waiting, released, user_value, token, acked, resume_pending,
		       waiting_since, last_reminder, reminder_seq, last_pause_cmd, operating_mode
		FROM charger_release_state WHERE charger_id = ?
	`, chargerID).Scan(&st.Connected, &st.Waiting, &st.Released, &st.User, &st.Token, &st.Acked,
		&st.ResumePending, &st.WaitingSince, &st.LastReminder, &st.ReminderSeq, &st.LastPauseCmd, &st.State)
	if err == sql.ErrNoRows {
		return st, nil
	}
	if err != nil {
		return nil, err
	}
	if t, err := time.Parse(ReleaseTimeFormat, st.LastReminder); err == nil && st.Waiting == 1 && st.Acked == 0 {
		if time.Since(t) < RemindWindow {
			st.Remind = 1
		}
	}
	return st, nil
}

// SaveReleaseState writes the gate of a charger.
func SaveReleaseState(db *sql.DB, st *ReleaseState) error {
	_, err := db.Exec(`
		INSERT INTO charger_release_state (charger_id, connected, waiting, released, user_value, token, acked,
			resume_pending, waiting_since, last_reminder, reminder_seq, last_pause_cmd, operating_mode, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(charger_id) DO UPDATE SET
			connected = excluded.connected, waiting = excluded.waiting, released = excluded.released,
			user_value = excluded.user_value, token = excluded.token, acked = excluded.acked,
			resume_pending = excluded.resume_pending, waiting_since = excluded.waiting_since,
			last_reminder = excluded.last_reminder, reminder_seq = excluded.reminder_seq,
			last_pause_cmd = excluded.last_pause_cmd, operating_mode = excluded.operating_mode,
			updated_at = excluded.updated_at
	`, st.ChargerID, st.Connected, st.Waiting, st.Released, st.User, st.Token, st.Acked,
		st.ResumePending, st.WaitingSince, st.LastReminder, st.ReminderSeq, st.LastPauseCmd, st.State,
		ReleaseTime(time.Now()))
	return err
}

// closeOpenReleaseLog ends the open user assignment of a charger at t.
func closeOpenReleaseLog(db *sql.DB, chargerID int, t time.Time) error {
	_, err := db.Exec(`UPDATE charger_release_log SET ended_at = ? WHERE charger_id = ? AND ended_at IS NULL`,
		ReleaseTime(t), chargerID)
	return err
}

// ReleaseCharger releases (or switches) the charger for a user. Only allowed
// while a car is plugged in; the collector resumes charging on its next poll.
func ReleaseCharger(db *sql.DB, chargerID, value int, token, source string) (*ReleaseState, error) {
	st, err := LoadReleaseState(db, chargerID)
	if err != nil {
		return nil, err
	}
	if st.Connected == 0 {
		return st, fmt.Errorf("no car connected")
	}
	if st.Released == 1 && st.Token == token {
		return st, nil // same user again: nothing to do
	}
	now := time.Now()
	if err := closeOpenReleaseLog(db, chargerID, now); err != nil {
		return nil, err
	}
	if _, err := db.Exec(`INSERT INTO charger_release_log (charger_id, user_value, token, source, started_at) VALUES (?, ?, ?, ?, ?)`,
		chargerID, value, token, source, ReleaseTime(now)); err != nil {
		return nil, err
	}
	if st.Released == 0 {
		st.ResumePending = 1
	}
	st.Released, st.User, st.Token, st.Waiting, st.Remind = 1, value, token, 0, 0
	return st, SaveReleaseState(db, st)
}

// AckReminder stops the reminders for the current plug-in (gate stays closed).
func AckReminder(db *sql.DB, chargerID int) (*ReleaseState, error) {
	st, err := LoadReleaseState(db, chargerID)
	if err != nil {
		return nil, err
	}
	if st.Connected == 1 && st.Released == 0 {
		st.Acked, st.Remind = 1, 0
		if err := SaveReleaseState(db, st); err != nil {
			return nil, err
		}
	}
	return st, nil
}

// ResetReleaseOnUnplug clears the gate and ends the user assignment.
func ResetReleaseOnUnplug(db *sql.DB, st *ReleaseState, t time.Time) error {
	if err := closeOpenReleaseLog(db, st.ChargerID, t); err != nil {
		return err
	}
	st.Connected, st.Waiting, st.Remind, st.Released, st.User, st.Token = 0, 0, 0, 0, 0, ""
	st.Acked, st.ResumePending, st.WaitingSince, st.LastReminder, st.LastPauseCmd = 0, 0, "", "", ""
	return nil
}
