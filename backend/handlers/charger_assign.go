package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/mux"
)

// Assign charges recorded without a card (empty user_id) to a user's card for a
// date range, e.g. the weeks before the Loxone release was set up. Preview first,
// then assign; every assignment is a batch that can be undone exactly.
//
//	GET  /api/chargers/{id}/unassigned?from=YYYY-MM-DD&to=YYYY-MM-DD  → preview
//	POST /api/chargers/{id}/unassigned/assign {from,to,token}          → assign
//	GET  /api/chargers/{id}/assign-batches                              → list
//	POST /api/chargers/{id}/assign-batches/{batchId}/undo               → undo

type unassignedPreview struct {
	From     string  `json:"from"`
	To       string  `json:"to"`
	Rows     int     `json:"rows"`
	Sessions int     `json:"sessions"`
	KWh      float64 `json:"kwh"`
	First    string  `json:"first,omitempty"`
	Last     string  `json:"last,omitempty"`
	rowIDs   []int64
}

func zurich() *time.Location {
	if loc, err := time.LoadLocation("Europe/Zurich"); err == nil {
		return loc
	}
	return time.Local
}

// parseAssignRange turns inclusive YYYY-MM-DD dates into [start, end) and
// refuses ranges that reach into the future.
func parseAssignRange(fromStr, toStr string) (time.Time, time.Time, error) {
	loc := zurich()
	from, err := time.ParseInLocation("2006-01-02", strings.TrimSpace(fromStr), loc)
	if err != nil {
		return time.Time{}, time.Time{}, fmt.Errorf("invalid 'from' date (YYYY-MM-DD)")
	}
	to, err := time.ParseInLocation("2006-01-02", strings.TrimSpace(toStr), loc)
	if err != nil {
		return time.Time{}, time.Time{}, fmt.Errorf("invalid 'to' date (YYYY-MM-DD)")
	}
	end := to.AddDate(0, 0, 1)
	if !end.After(from) {
		return time.Time{}, time.Time{}, fmt.Errorf("'to' must not be before 'from'")
	}
	if end.Sub(from) > 400*24*time.Hour {
		return time.Time{}, time.Time{}, fmt.Errorf("range too long (max. ~13 months)")
	}
	return from, end, nil
}

// previewUnassigned finds rows without a card in [from, end) and estimates the
// energy they carry: positive counter steps INTO a charging row ("3") without a
// card, the same way billing attributes an interval to its row's owner.
func (h *ChargerHandler) previewUnassigned(chargerID int, from, end time.Time) (*unassignedPreview, error) {
	p := &unassignedPreview{}
	// One row before the range so the first step can be measured.
	var prevPower sql.NullFloat64
	h.db.QueryRow(`SELECT power_kwh FROM charger_sessions WHERE charger_id = ? AND session_time < ? ORDER BY session_time DESC LIMIT 1`,
		chargerID, from).Scan(&prevPower)

	rows, err := h.db.Query(`
		SELECT id, COALESCE(user_id,''), session_time, power_kwh, COALESCE(state,'')
		FROM charger_sessions
		WHERE charger_id = ? AND session_time >= ? AND session_time < ?
		ORDER BY session_time ASC
	`, chargerID, from, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	hasPrev := prevPower.Valid
	prev := prevPower.Float64
	inRun := false
	for rows.Next() {
		var id int64
		var uid, state string
		var ts time.Time
		var power float64
		if err := rows.Scan(&id, &uid, &ts, &power, &state); err != nil {
			return nil, err
		}
		empty := strings.TrimSpace(uid) == ""
		charging := state == "3"
		if empty {
			p.rowIDs = append(p.rowIDs, id)
			if charging {
				if hasPrev {
					if d := power - prev; d > 0 && d < 200 {
						p.KWh += d
					}
				}
				if !inRun {
					p.Sessions++
				}
				lt := ts.In(zurich()).Format("2006-01-02 15:04")
				if p.First == "" {
					p.First = lt
				}
				p.Last = lt
			}
		}
		inRun = empty && charging
		prev, hasPrev = power, true
	}
	p.Rows = len(p.rowIDs)
	p.KWh = float64(int(p.KWh*100+0.5)) / 100
	return p, rows.Err()
}

func (h *ChargerHandler) PreviewUnassigned(w http.ResponseWriter, r *http.Request) {
	chargerID, err := strconv.Atoi(mux.Vars(r)["id"])
	if err != nil {
		http.Error(w, "Invalid charger ID", http.StatusBadRequest)
		return
	}
	from, end, err := parseAssignRange(r.URL.Query().Get("from"), r.URL.Query().Get("to"))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	p, err := h.previewUnassigned(chargerID, from, end)
	if err != nil {
		log.Printf("PreviewUnassigned failed: %v", err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	p.From, p.To = r.URL.Query().Get("from"), r.URL.Query().Get("to")
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(p)
}

func (h *ChargerHandler) AssignUnassigned(w http.ResponseWriter, r *http.Request) {
	chargerID, err := strconv.Atoi(mux.Vars(r)["id"])
	if err != nil {
		http.Error(w, "Invalid charger ID", http.StatusBadRequest)
		return
	}
	var req struct {
		From  string `json:"from"`
		To    string `json:"to"`
		Token string `json:"token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	req.Token = strings.TrimSpace(req.Token)
	if req.Token == "" {
		http.Error(w, "token (card) is required", http.StatusBadRequest)
		return
	}
	from, end, err := parseAssignRange(req.From, req.To)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	p, err := h.previewUnassigned(chargerID, from, end)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	if p.Rows == 0 {
		http.Error(w, "No charges without a card in this period", http.StatusConflict)
		return
	}

	tx, err := h.db.Begin()
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()
	res, err := tx.Exec(`INSERT INTO charger_assign_batches (charger_id, token, from_date, to_date, row_count, kwh, sessions) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		chargerID, req.Token, req.From, req.To, p.Rows, p.KWh, p.Sessions)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	batchID, _ := res.LastInsertId()
	upd, err := tx.Prepare(`UPDATE charger_sessions SET user_id = ? WHERE id = ? AND COALESCE(user_id,'') = ''`)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer upd.Close()
	rec, err := tx.Prepare(`INSERT OR IGNORE INTO charger_assign_rows (batch_id, session_row_id) VALUES (?, ?)`)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer rec.Close()
	changed := 0
	for _, id := range p.rowIDs {
		r2, err := upd.Exec(req.Token, id)
		if err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			return
		}
		if n, _ := r2.RowsAffected(); n > 0 {
			if _, err := rec.Exec(batchID, id); err != nil {
				http.Error(w, "Database error", http.StatusInternalServerError)
				return
			}
			changed++
		}
	}
	if _, err := tx.Exec(`UPDATE charger_assign_batches SET row_count = ? WHERE id = ?`, changed, batchID); err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	if err := tx.Commit(); err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	h.db.Exec(`INSERT INTO admin_logs (action, details, ip_address) VALUES (?, ?, ?)`,
		"Charges Assigned",
		fmt.Sprintf("Charger %d: %d rows (%d charges, ~%.2f kWh) %s–%s → %s (batch %d)", chargerID, changed, p.Sessions, p.KWh, req.From, req.To, req.Token, batchID),
		r.RemoteAddr)
	log.Printf("AssignUnassigned: charger %d, %d rows %s–%s → %s (batch %d)", chargerID, changed, req.From, req.To, req.Token, batchID)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "ok", "batch_id": batchID, "rows": changed, "sessions": p.Sessions, "kwh": p.KWh,
	})
}

func (h *ChargerHandler) ListAssignBatches(w http.ResponseWriter, r *http.Request) {
	chargerID, err := strconv.Atoi(mux.Vars(r)["id"])
	if err != nil {
		http.Error(w, "Invalid charger ID", http.StatusBadRequest)
		return
	}
	rows, err := h.db.Query(`
		SELECT id, token, from_date, to_date, row_count, kwh, sessions, COALESCE(created_at,''), COALESCE(undone_at,'')
		FROM charger_assign_batches WHERE charger_id = ? ORDER BY id DESC LIMIT 50
	`, chargerID)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	type batch struct {
		ID        int64   `json:"id"`
		Token     string  `json:"token"`
		From      string  `json:"from"`
		To        string  `json:"to"`
		Rows      int     `json:"rows"`
		KWh       float64 `json:"kwh"`
		Sessions  int     `json:"sessions"`
		CreatedAt string  `json:"created_at"`
		UndoneAt  string  `json:"undone_at"`
	}
	out := []batch{}
	for rows.Next() {
		var b batch
		if err := rows.Scan(&b.ID, &b.Token, &b.From, &b.To, &b.Rows, &b.KWh, &b.Sessions, &b.CreatedAt, &b.UndoneAt); err == nil {
			out = append(out, b)
		}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(out)
}

func (h *ChargerHandler) UndoAssignBatch(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	chargerID, err := strconv.Atoi(vars["id"])
	if err != nil {
		http.Error(w, "Invalid charger ID", http.StatusBadRequest)
		return
	}
	batchID, err := strconv.ParseInt(vars["batchId"], 10, 64)
	if err != nil {
		http.Error(w, "Invalid batch ID", http.StatusBadRequest)
		return
	}
	var token, undone string
	err = h.db.QueryRow(`SELECT token, COALESCE(undone_at,'') FROM charger_assign_batches WHERE id = ? AND charger_id = ?`, batchID, chargerID).Scan(&token, &undone)
	if err == sql.ErrNoRows {
		http.Error(w, "Batch not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	if undone != "" {
		http.Error(w, "Already undone", http.StatusConflict)
		return
	}
	tx, err := h.db.Begin()
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()
	// Only rows that still carry this batch's card go back to "no card".
	res, err := tx.Exec(`
		UPDATE charger_sessions SET user_id = ''
		WHERE user_id = ? AND id IN (SELECT session_row_id FROM charger_assign_rows WHERE batch_id = ?)
	`, token, batchID)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	n, _ := res.RowsAffected()
	if _, err := tx.Exec(`UPDATE charger_assign_batches SET undone_at = CURRENT_TIMESTAMP WHERE id = ?`, batchID); err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	if err := tx.Commit(); err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	h.db.Exec(`INSERT INTO admin_logs (action, details, ip_address) VALUES (?, ?, ?)`,
		"Charges Assignment Undone", fmt.Sprintf("Charger %d: batch %d (%s), %d rows back to no card", chargerID, batchID, token, n), r.RemoteAddr)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"status": "ok", "rows": n})
}
