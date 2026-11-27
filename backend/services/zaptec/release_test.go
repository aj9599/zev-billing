package zaptec

import (
	"database/sql"
	"testing"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

func releaseTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	db.SetMaxOpenConns(1)
	_, err = db.Exec(`
		CREATE TABLE charger_release_state (
			charger_id INTEGER PRIMARY KEY, connected INTEGER NOT NULL DEFAULT 0, waiting INTEGER NOT NULL DEFAULT 0,
			released INTEGER NOT NULL DEFAULT 0, user_value INTEGER NOT NULL DEFAULT 0, token TEXT NOT NULL DEFAULT '',
			acked INTEGER NOT NULL DEFAULT 0, resume_pending INTEGER NOT NULL DEFAULT 0, waiting_since TEXT NOT NULL DEFAULT '',
			last_reminder TEXT NOT NULL DEFAULT '', reminder_seq INTEGER NOT NULL DEFAULT 0, last_pause_cmd TEXT NOT NULL DEFAULT '',
			operating_mode INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT '');
		CREATE TABLE charger_release_log (id INTEGER PRIMARY KEY AUTOINCREMENT, charger_id INTEGER NOT NULL,
			user_value INTEGER NOT NULL, token TEXT NOT NULL, source TEXT NOT NULL DEFAULT '', started_at TEXT NOT NULL, ended_at TEXT);
	`)
	if err != nil {
		t.Fatal(err)
	}
	return db
}

func TestReleaseRequiresConnectedCar(t *testing.T) {
	db := releaseTestDB(t)
	if _, err := ReleaseCharger(db, 1, 1, "lox-privat", "test"); err == nil {
		t.Fatal("release without a connected car must fail")
	}
}

func TestReleaseSwitchAndUnplug(t *testing.T) {
	db := releaseTestDB(t)
	dh := NewDatabaseHandler(db, time.UTC)
	st := &ReleaseState{ChargerID: 1, Connected: 1, Waiting: 1}
	if err := SaveReleaseState(db, st); err != nil {
		t.Fatal(err)
	}
	st, err := ReleaseCharger(db, 1, 1, "lox-privat", "test")
	if err != nil || st.Released != 1 || st.ResumePending != 1 || st.Waiting != 0 {
		t.Fatalf("release: st=%+v err=%v", st, err)
	}
	if got := dh.ReleaseTokenAt(1, time.Now()); got != "lox-privat" {
		t.Fatalf("token now = %q", got)
	}
	time.Sleep(1100 * time.Millisecond)
	st, err = ReleaseCharger(db, 1, 2, "lox-geschaeft", "test")
	if err != nil || st.Token != "lox-geschaeft" || st.ResumePending != 1 {
		t.Fatalf("switch: st=%+v err=%v", st, err)
	}
	if got := dh.ReleaseTokenAt(1, time.Now().Add(time.Second)); got != "lox-geschaeft" {
		t.Fatalf("token after switch = %q", got)
	}
	// A reading a few seconds before the first release belongs to the first user.
	start := time.Now().Add(-5 * time.Second)
	if got := dh.ResolveSessionUser(1, start, start, time.Now(), "rfid-x"); got != "lox-privat" {
		t.Fatalf("pre-release reading = %q", got)
	}
	time.Sleep(1100 * time.Millisecond)
	if err := ResetReleaseOnUnplug(db, st, time.Now()); err != nil {
		t.Fatal(err)
	}
	SaveReleaseState(db, st)
	if got := dh.ReleaseTokenAt(1, time.Now().Add(2*time.Second)); got != "" {
		t.Fatalf("token after unplug = %q", got)
	}
	if got := dh.ResolveSessionUser(1, time.Now().Add(time.Hour), time.Now().Add(time.Hour), time.Now().Add(2*time.Hour), "rfid-x"); got != "rfid-x" {
		t.Fatalf("later session must keep its RFID user, got %q", got)
	}
}

func TestAckStopsReminder(t *testing.T) {
	db := releaseTestDB(t)
	st := &ReleaseState{ChargerID: 1, Connected: 1, Waiting: 1, LastReminder: ReleaseTime(time.Now())}
	SaveReleaseState(db, st)
	st, _ = LoadReleaseState(db, 1)
	if st.Remind != 1 {
		t.Fatal("remind should be 1 right after a reminder")
	}
	st, _ = AckReminder(db, 1)
	if st.Acked != 1 || st.Remind != 0 {
		t.Fatalf("ack: %+v", st)
	}
}
