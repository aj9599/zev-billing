package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/mux"
	_ "github.com/mattn/go-sqlite3"
)

func assignTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	db.SetMaxOpenConns(1)
	_, err = db.Exec(`
		CREATE TABLE charger_sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, charger_id INTEGER NOT NULL, user_id TEXT,
			session_time DATETIME NOT NULL, power_kwh REAL NOT NULL, mode TEXT, state TEXT);
		CREATE TABLE admin_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT, details TEXT, ip_address TEXT);
		CREATE TABLE charger_assign_batches (id INTEGER PRIMARY KEY AUTOINCREMENT, charger_id INTEGER NOT NULL, token TEXT NOT NULL,
			from_date TEXT NOT NULL, to_date TEXT NOT NULL, row_count INTEGER NOT NULL DEFAULT 0, kwh REAL NOT NULL DEFAULT 0,
			sessions INTEGER NOT NULL DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, undone_at DATETIME);
		CREATE TABLE charger_assign_rows (batch_id INTEGER NOT NULL, session_row_id INTEGER NOT NULL, PRIMARY KEY (batch_id, session_row_id));
	`)
	if err != nil {
		t.Fatal(err)
	}
	loc := zurich()
	ins := func(uid, ts string, p float64, st string) {
		tt, _ := time.ParseInLocation("2006-01-02 15:04", ts, loc)
		if _, err := db.Exec(`INSERT INTO charger_sessions (charger_id, user_id, session_time, power_kwh, mode, state) VALUES (1, ?, ?, ?, '1', ?)`,
			uid, tt.Format("2006-01-02 15:04:05-07:00"), p, st); err != nil {
			t.Fatal(err)
		}
	}
	ins("", "2026-10-31 23:45", 100, "1")
	ins("", "2026-11-02 18:00", 100, "3") // charge 1
	ins("", "2026-11-02 18:15", 103, "3")
	ins("", "2026-11-02 18:30", 105, "3")
	ins("", "2026-11-02 18:45", 105, "1")
	ins("rfid-x", "2026-11-05 10:00", 105, "3") // someone else's card: untouched
	ins("rfid-x", "2026-11-05 10:15", 108, "3")
	ins("", "2026-11-10 07:00", 108, "3") // charge 2
	ins("", "2026-11-10 07:15", 110, "3")
	ins("", "2026-12-01 07:15", 120, "3") // outside range
	return db
}

func doReq(t *testing.T, h http.HandlerFunc, method, path, tmpl, body string) *httptest.ResponseRecorder {
	t.Helper()
	r := mux.NewRouter()
	r.HandleFunc(tmpl, h).Methods(method)
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestAssignUnassignedPreviewAssignUndo(t *testing.T) {
	db := assignTestDB(t)
	h := &ChargerHandler{db: db}

	w := doReq(t, h.PreviewUnassigned, "GET", "/api/chargers/1/unassigned?from=2026-11-01&to=2026-11-27", "/api/chargers/{id}/unassigned", "")
	var p unassignedPreview
	json.Unmarshal(w.Body.Bytes(), &p)
	if w.Code != 200 || p.Rows != 6 || p.Sessions != 2 || p.KWh != 7 {
		t.Fatalf("preview: %d %s", w.Code, w.Body.String())
	}

	w = doReq(t, h.AssignUnassigned, "POST", "/api/chargers/1/unassigned/assign", "/api/chargers/{id}/unassigned/assign",
		`{"from":"2026-11-01","to":"2026-11-27","token":"lox-geschaeft"}`)
	if w.Code != 200 {
		t.Fatalf("assign: %d %s", w.Code, w.Body.String())
	}
	var n int
	db.QueryRow(`SELECT COUNT(*) FROM charger_sessions WHERE user_id='lox-geschaeft'`).Scan(&n)
	if n != 6 {
		t.Fatalf("assigned rows = %d", n)
	}
	db.QueryRow(`SELECT COUNT(*) FROM charger_sessions WHERE user_id='rfid-x'`).Scan(&n)
	if n != 2 {
		t.Fatalf("other card touched: %d", n)
	}

	w = doReq(t, h.AssignUnassigned, "POST", "/api/chargers/1/unassigned/assign", "/api/chargers/{id}/unassigned/assign",
		`{"from":"2026-11-01","to":"2026-11-27","token":"lox-geschaeft"}`)
	if w.Code != http.StatusConflict {
		t.Fatalf("second assign should find nothing: %d", w.Code)
	}

	w = doReq(t, h.UndoAssignBatch, "POST", "/api/chargers/1/assign-batches/1/undo", "/api/chargers/{id}/assign-batches/{batchId}/undo", "")
	if w.Code != 200 {
		t.Fatalf("undo: %d %s", w.Code, w.Body.String())
	}
	db.QueryRow(`SELECT COUNT(*) FROM charger_sessions WHERE user_id='lox-geschaeft'`).Scan(&n)
	if n != 0 {
		t.Fatalf("after undo still %d", n)
	}
	w = doReq(t, h.UndoAssignBatch, "POST", "/api/chargers/1/assign-batches/1/undo", "/api/chargers/{id}/assign-batches/{batchId}/undo", "")
	if w.Code != http.StatusConflict {
		t.Fatalf("double undo: %d", w.Code)
	}
	w = doReq(t, h.ListAssignBatches, "GET", "/api/chargers/1/assign-batches", "/api/chargers/{id}/assign-batches", "")
	if !strings.Contains(w.Body.String(), `"undone_at":"2`) {
		t.Fatalf("list: %s", w.Body.String())
	}
}
