package handlers

import (
	"database/sql"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/mux"
)

// ImportE3DCSessionsCSV backfills history from an E3/DC wallbox session export
// (myE3DC "Ladevorgänge" CSV). Each row is one charging session with a time
// range, RFID and charged kWh — the per-session history the wallbox itself can't
// expose over RSCP.
//
// It does two things, only for the period BEFORE live data exists for this
// charger (so accurate live rows are never overwritten):
//   - charger_sessions: each session's kWh is spread evenly over its 15-min
//     slots and written as a cumulative counter (mode='grid', state='3'), so
//     billing attributes the energy to the tenant whose RFID matches. The
//     counter is anchored so its end lines up with the first live reading,
//     keeping it continuous across the boundary.
//   - e3dc_session_history: one row per session for the history/portal view.
//
// The E3/DC export has no solar/grid split, so all backfilled energy is recorded
// as grid (the conservative tariff).
func (h *ChargerHandler) ImportE3DCSessionsCSV(w http.ResponseWriter, r *http.Request) {
	chargerID, err := strconv.Atoi(mux.Vars(r)["id"])
	if err != nil {
		http.Error(w, "Invalid charger ID", http.StatusBadRequest)
		return
	}
	var chargerName string
	if err := h.db.QueryRow("SELECT name FROM chargers WHERE id = ?", chargerID).Scan(&chargerName); err == sql.ErrNoRows {
		http.Error(w, "Charger not found", http.StatusNotFound)
		return
	} else if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	if err := r.ParseMultipartForm(10 << 20); err != nil {
		http.Error(w, "Failed to parse form", http.StatusBadRequest)
		return
	}
	file, _, err := r.FormFile("csv")
	if err != nil {
		http.Error(w, "No CSV file provided", http.StatusBadRequest)
		return
	}
	defer file.Close()

	reader := csv.NewReader(file)
	reader.FieldsPerRecord = -1 // tolerate the junk first line + header
	reader.TrimLeadingSpace = true

	// Earliest existing row = where live data begins. Import only strictly before
	// it; anchor the backfill counter to that row's reading for continuity.
	var tLive time.Time
	var firstLivePower float64
	hasLive := false
	var minTime sql.NullTime
	if err := h.db.QueryRow(`SELECT MIN(session_time) FROM charger_sessions WHERE charger_id = ?`, chargerID).Scan(&minTime); err == nil && minTime.Valid {
		tLive = minTime.Time
		hasLive = true
		_ = h.db.QueryRow(`SELECT power_kwh FROM charger_sessions WHERE charger_id = ? ORDER BY session_time ASC LIMIT 1`, chargerID).Scan(&firstLivePower)
	}

	type session struct {
		start, end time.Time
		rfid       string
		kwh        float64
	}
	var sessions []session
	skipped := 0

	for {
		rec, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			continue
		}
		if len(rec) < 5 {
			continue
		}
		period := strings.TrimSpace(rec[0])
		if period == "" || period == "Zeitraum" || !strings.Contains(period, " - ") {
			continue
		}
		parts := strings.SplitN(period, " - ", 2)
		if len(parts) != 2 || strings.Contains(parts[1], "Invalid") {
			skipped++
			continue
		}
		start, e1 := time.ParseInLocation("02.01.2006 15:04:05", strings.TrimSpace(parts[0]), time.Local)
		end, e2 := time.ParseInLocation("02.01.2006 15:04:05", strings.TrimSpace(parts[1]), time.Local)
		if e1 != nil || e2 != nil || !end.After(start) {
			skipped++
			continue
		}
		kwh := parseGermanKWh(rec[4])
		if kwh <= 0 {
			skipped++ // plug-in events / zero-energy rows
			continue
		}
		sessions = append(sessions, session{start: start, end: end, rfid: parseRFID(rec[2]), kwh: kwh})
	}

	if len(sessions) == 0 {
		http.Error(w, "No usable charging sessions found in the file", http.StatusBadRequest)
		return
	}

	// Aggregate energy into 15-min buckets (only before live data). One session
	// owns a slot, so the RFID per bucket is unambiguous.
	buckets := make(map[time.Time]float64)
	bucketRFID := make(map[time.Time]string)
	importedSessions := 0
	for _, s := range sessions {
		if hasLive && !s.start.Before(tLive) {
			continue // session is in the live period — device capture owns it
		}
		slots := []time.Time{}
		for t := floor15(s.start); !t.After(floor15(s.end)); t = t.Add(15 * time.Minute) {
			if hasLive && !t.Before(tLive) {
				break
			}
			slots = append(slots, t)
		}
		if len(slots) == 0 {
			continue
		}
		per := s.kwh / float64(len(slots))
		for _, t := range slots {
			buckets[t] += per
			bucketRFID[t] = s.rfid
		}
		importedSessions++
	}

	if len(buckets) == 0 {
		http.Error(w, "All sessions fall within the live-data period; nothing to backfill", http.StatusBadRequest)
		return
	}

	slots := make([]time.Time, 0, len(buckets))
	for t := range buckets {
		slots = append(slots, t)
	}
	sort.Slice(slots, func(i, j int) bool { return slots[i].Before(slots[j]) })

	var total float64
	for _, e := range buckets {
		total += e
	}
	// Anchor so the last backfilled cumulative equals the first live reading
	// (continuous across the boundary); base is irrelevant when there's no live
	// data since billing only uses deltas.
	base := 0.0
	if hasLive {
		base = firstLivePower - total
	}

	tx, err := h.db.Begin()
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	// Idempotent: clear any prior rows in the backfilled range before re-inserting.
	cutoff := slots[len(slots)-1].Add(15 * time.Minute)
	if hasLive {
		cutoff = tLive
	}
	if _, err := tx.Exec(`DELETE FROM charger_sessions WHERE charger_id = ? AND session_time < ?`, chargerID, cutoff); err != nil {
		http.Error(w, "Failed to clear old rows", http.StatusInternalServerError)
		return
	}

	csStmt, err := tx.Prepare(`INSERT INTO charger_sessions (charger_id, user_id, session_time, power_kwh, mode, state) VALUES (?, ?, ?, ?, 'grid', '3')`)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer csStmt.Close()

	running := 0.0
	for _, t := range slots {
		running += buckets[t]
		if _, err := csStmt.Exec(chargerID, bucketRFID[t], t, base+running); err != nil {
			log.Printf("E3/DC CSV: insert slot failed: %v", err)
		}
	}

	// History rows (one per session, display only).
	histStmt, err := tx.Prepare(`
		INSERT OR REPLACE INTO e3dc_session_history
			(charger_id, session_key, start_time, end_time, total_kwh, solar_kwh, grid_kwh, rfid, source)
		VALUES (?, ?, ?, ?, ?, 0, ?, ?, 'csv')`)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer histStmt.Close()
	for _, s := range sessions {
		if hasLive && !s.start.Before(tLive) {
			continue
		}
		key := fmt.Sprintf("csv-%d", s.start.Unix())
		if _, err := histStmt.Exec(chargerID, key, s.start, s.end, s.kwh, s.kwh, s.rfid); err != nil {
			log.Printf("E3/DC CSV: history insert failed: %v", err)
		}
	}

	if err := tx.Commit(); err != nil {
		http.Error(w, "Failed to save import", http.StatusInternalServerError)
		return
	}

	log.Printf("E3/DC CSV import for charger %d (%s): %d sessions, %d 15-min slots, %.1f kWh, skipped %d",
		chargerID, chargerName, importedSessions, len(slots), total, skipped)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":            "ok",
		"sessions_imported": importedSessions,
		"slots_written":     len(slots),
		"total_kwh":         total,
		"skipped":           skipped,
		"from":              slots[0].Format("2006-01-02"),
		"to":                slots[len(slots)-1].Format("2006-01-02"),
	})
}

// floor15 rounds a time down to the previous 15-minute boundary.
func floor15(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), t.Hour(), (t.Minute()/15)*15, 0, 0, t.Location())
}

// parseGermanKWh parses values like "2,38 kWh" or "0 kWh" into kWh.
func parseGermanKWh(s string) float64 {
	s = strings.TrimSpace(s)
	s = strings.TrimSuffix(s, "kWh")
	s = strings.TrimSpace(s)
	s = strings.ReplaceAll(s, ".", "")  // thousands sep, if any
	s = strings.ReplaceAll(s, ",", ".") // decimal comma → dot
	v, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return 0
	}
	return v
}

// parseRFID extracts the card token from "RFID: EA087E79"; returns "" for
// "RFID:" (empty) or "Keine Authentifizierung".
func parseRFID(s string) string {
	s = strings.TrimSpace(s)
	if !strings.HasPrefix(s, "RFID:") {
		return ""
	}
	return strings.TrimSpace(strings.TrimPrefix(s, "RFID:"))
}
