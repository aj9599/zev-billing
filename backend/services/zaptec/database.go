package zaptec

import (
	"database/sql"
	"fmt"
	"log"
	"sort"
	"time"
)

// DatabaseHandler manages all database operations for Zaptec data
type DatabaseHandler struct {
	db            *sql.DB
	localTimezone *time.Location
}

// NewDatabaseHandler creates a new database handler
func NewDatabaseHandler(db *sql.DB, localTimezone *time.Location) *DatabaseHandler {
	return &DatabaseHandler{
		db:            db,
		localTimezone: localTimezone,
	}
}

// roundTimestampTo15Min snaps a timestamp to the nearest 15-min boundary in
// the local timezone. Doing this for every charger_sessions row keeps the
// per-(charger, time) UNIQUE INDEX from accidentally splitting OCMF and
// snapshot rows that describe the same 15-min slot, and matches the
// dashboard's own bucketing.
func (dh *DatabaseHandler) roundTimestampTo15Min(t time.Time) time.Time {
	local := t.In(dh.localTimezone)
	minute := local.Minute()
	var rounded int
	switch {
	case minute < 8:
		rounded = 0
	case minute < 23:
		rounded = 15
	case minute < 38:
		rounded = 30
	case minute < 53:
		rounded = 45
	default:
		rounded = 0
		local = local.Add(time.Hour)
	}
	return time.Date(local.Year(), local.Month(), local.Day(), local.Hour(), rounded, 0, 0, dh.localTimezone)
}

// LoadProcessedSessions loads session IDs that have already been written to database
// This prevents duplicate writes after service restarts
func (dh *DatabaseHandler) LoadProcessedSessions() int {
	rows, err := dh.db.Query(`
		SELECT DISTINCT charger_id, user_id, session_time, power_kwh
		FROM charger_sessions 
		WHERE user_id IS NOT NULL 
		  AND user_id != ''
		  AND session_time > datetime('now', '-30 days')
		  AND state = '3'
		ORDER BY session_time DESC
	`)
	if err != nil {
		log.Printf("WARNING: Could not load processed sessions: %v", err)
		return 0
	}
	defer rows.Close()
	
	count := 0
	for rows.Next() {
		var chargerID int
		var userID, sessionTime string
		var energy float64
		
		if err := rows.Scan(&chargerID, &userID, &sessionTime, &energy); err == nil {
			count++
		}
	}
	
	return count
}

// WriteSessionToDatabase writes a dense 15-min sequence for a completed
// session into charger_sessions. Zaptec's OCMF readings only land on hour
// boundaries (B at session start, T every 60 min, E at session end), so
// writing them verbatim leaves obvious 45-min gaps in the chart and CSV.
// We snap each OCMF reading to its 15-min bucket, then linearly interpolate
// the cumulative kWh value across the in-between 15-min slots. The unique
// index on (charger_id, session_time) plus INSERT OR REPLACE makes re-runs
// idempotent.
//
// Returns the dense bucket list so the caller can use the first / last
// bucket and energy values to bridge idle gaps between sessions.
func (dh *DatabaseHandler) WriteSessionToDatabase(session *CompletedSession) ([]SessionMeterReading, error) {
	if len(session.MeterReadings) == 0 {
		return nil, fmt.Errorf("no readings to write")
	}

	dense := dh.interpolate15MinBuckets(session.MeterReadings)
	if len(dense) == 0 {
		return nil, fmt.Errorf("no buckets after interpolation")
	}

	tx, err := dh.db.Begin()
	if err != nil {
		return nil, fmt.Errorf("failed to begin transaction: %v", err)
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`
		INSERT OR REPLACE INTO charger_sessions (charger_id, user_id, session_time, power_kwh, mode, state)
		VALUES (?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		return nil, fmt.Errorf("failed to prepare statement: %v", err)
	}
	defer stmt.Close()

	insertCount := 0
	for _, b := range dense {
		key := b.Timestamp.Format("2006-01-02 15:04:05-07:00")
		result, err := stmt.Exec(
			session.ChargerID,
			session.UserID,
			key,
			b.Energy_kWh,
			"1", // mode = normal
			"3", // state = charging
		)
		if err != nil {
			log.Printf("WARNING: Failed to insert OCMF reading: %v", err)
			continue
		}
		if rows, _ := result.RowsAffected(); rows > 0 {
			insertCount++
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("failed to commit transaction: %v", err)
	}

	log.Printf("Zaptec: [%s] Wrote %d 15-min buckets (from %d raw OCMF readings) for session %s",
		session.ChargerName, insertCount, len(session.MeterReadings), session.SessionID)

	return dense, nil
}

// WriteSessionBoundaries writes exactly two rows for a finished session:
// the OCMF "B" (begin) and "E" (end) readings at their precise raw
// timestamps with state="3". Used by the live flow when a session ends —
// the in-between 15-min slots are already populated by the live polling
// snapshots, so the only thing OCMF adds is precise start/end markers
// (off the 15-min grid).
//
// If "B" or "E" reading-types aren't present we fall back to the
// chronologically first / last reading.
func (dh *DatabaseHandler) WriteSessionBoundaries(session *CompletedSession) error {
	if len(session.MeterReadings) == 0 {
		return fmt.Errorf("no readings to write")
	}

	readings := make([]SessionMeterReading, len(session.MeterReadings))
	copy(readings, session.MeterReadings)
	sort.Slice(readings, func(i, j int) bool { return readings[i].Timestamp.Before(readings[j].Timestamp) })

	var begin, end *SessionMeterReading
	for i := range readings {
		switch readings[i].ReadingType {
		case "B":
			if begin == nil {
				begin = &readings[i]
			}
		case "E":
			end = &readings[i]
		}
	}
	if begin == nil {
		begin = &readings[0]
	}
	if end == nil {
		end = &readings[len(readings)-1]
	}

	tx, err := dh.db.Begin()
	if err != nil {
		return fmt.Errorf("begin tx: %v", err)
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`
		INSERT OR REPLACE INTO charger_sessions (charger_id, user_id, session_time, power_kwh, mode, state)
		VALUES (?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		return fmt.Errorf("prepare: %v", err)
	}
	defer stmt.Close()

	wrote := 0
	for _, r := range []*SessionMeterReading{begin, end} {
		key := r.Timestamp.Format("2006-01-02 15:04:05-07:00")
		if _, err := stmt.Exec(session.ChargerID, session.UserID, key, r.Energy_kWh, "1", "3"); err != nil {
			log.Printf("WARNING: Failed to insert OCMF boundary at %s: %v", key, err)
			continue
		}
		wrote++
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit: %v", err)
	}

	log.Printf("Zaptec: [%s] Wrote %d OCMF boundary rows (B@%s=%.3f, E@%s=%.3f) for session %s",
		session.ChargerName, wrote,
		begin.Timestamp.Format("15:04:05"), begin.Energy_kWh,
		end.Timestamp.Format("15:04:05"), end.Energy_kWh,
		session.SessionID)
	return nil
}

// WriteIdleRun writes idle (state="1") rows at every 15-min boundary in
// [startBucket, endBucket) carrying a flat cumulative meter value. Used to
// bridge gaps between OCMF sessions during a range sync. Returns the number
// of rows actually inserted/replaced.
func (dh *DatabaseHandler) WriteIdleRun(chargerID int, userID string, startBucket, endBucket time.Time, energyKwh float64) (int, error) {
	if !endBucket.After(startBucket) {
		return 0, nil
	}

	tx, err := dh.db.Begin()
	if err != nil {
		return 0, fmt.Errorf("begin tx: %v", err)
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`
		INSERT OR REPLACE INTO charger_sessions (charger_id, user_id, session_time, power_kwh, mode, state)
		VALUES (?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		return 0, fmt.Errorf("prepare: %v", err)
	}
	defer stmt.Close()

	count := 0
	for t := startBucket; t.Before(endBucket); t = t.Add(15 * time.Minute) {
		key := t.Format("2006-01-02 15:04:05-07:00")
		res, err := stmt.Exec(chargerID, userID, key, energyKwh, "1", "1")
		if err != nil {
			log.Printf("WARNING: Failed to insert idle bucket: %v", err)
			continue
		}
		if rows, _ := res.RowsAffected(); rows > 0 {
			count++
		}
	}

	if err := tx.Commit(); err != nil {
		return 0, fmt.Errorf("commit: %v", err)
	}
	return count, nil
}

// interpolate15MinBuckets converts the sparse OCMF readings (typically only
// hour boundaries plus B/E at the second) into a dense list of 15-min
// buckets, linearly interpolating the cumulative kWh between consecutive
// OCMF points. Multiple OCMF readings that fall in the same bucket collapse
// to the highest cumulative value so totals stay monotonic.
func (dh *DatabaseHandler) interpolate15MinBuckets(readings []SessionMeterReading) []SessionMeterReading {
	if len(readings) == 0 {
		return nil
	}

	// Step 1: snap each OCMF reading to its 15-min bucket and keep the
	// highest cumulative energy seen for each bucket (cumulative readings
	// must never decrease).
	bucketKey := func(t time.Time) time.Time { return dh.roundTimestampTo15Min(t) }
	bucketEnergy := map[time.Time]float64{}
	for _, r := range readings {
		k := bucketKey(r.Timestamp)
		if existing, ok := bucketEnergy[k]; !ok || r.Energy_kWh > existing {
			bucketEnergy[k] = r.Energy_kWh
		}
	}

	// Step 2: sort buckets chronologically so we can interpolate forward.
	type pt struct {
		t time.Time
		e float64
	}
	pts := make([]pt, 0, len(bucketEnergy))
	for t, e := range bucketEnergy {
		pts = append(pts, pt{t: t, e: e})
	}
	sort.Slice(pts, func(i, j int) bool { return pts[i].t.Before(pts[j].t) })

	// Step 3: walk every consecutive pair and emit the leading bucket plus
	// any 15-min slots that fall strictly inside the gap. The final bucket
	// is appended after the loop so it isn't dropped.
	out := make([]SessionMeterReading, 0, len(pts)*4)
	for i := 0; i < len(pts)-1; i++ {
		a, b := pts[i], pts[i+1]
		out = append(out, SessionMeterReading{Timestamp: a.t, Energy_kWh: a.e})
		gapMinutes := int(b.t.Sub(a.t).Minutes())
		if gapMinutes <= 15 {
			continue
		}
		steps := gapMinutes / 15
		denom := float64(steps)
		for step := 1; step < steps; step++ {
			t := a.t.Add(time.Duration(step) * 15 * time.Minute)
			ratio := float64(step) / denom
			energy := a.e + ratio*(b.e-a.e)
			out = append(out, SessionMeterReading{Timestamp: t, Energy_kWh: energy})
		}
	}
	out = append(out, SessionMeterReading{Timestamp: pts[len(pts)-1].t, Energy_kWh: pts[len(pts)-1].e})

	return out
}

// WriteSessionFallback writes session data when OCMF parsing fails
func (dh *DatabaseHandler) WriteSessionFallback(history *ChargeHistory, chargerID int, chargerName string) error {
	startTime := ParseZaptecTime(history.StartDateTime, dh.localTimezone)
	endTime := ParseZaptecTime(history.EndDateTime, dh.localTimezone)
	
	if startTime.IsZero() || endTime.IsZero() {
		return fmt.Errorf("invalid timestamps")
	}
	
	userID := history.UserID
	if userID == "" {
		userID = "unknown"
	}
	
	// Snap fallback start/end to 15-min boundaries to align with snapshots and OCMF.
	localStartTime := dh.roundTimestampTo15Min(startTime).Format("2006-01-02 15:04:05-07:00")
	localEndTime := dh.roundTimestampTo15Min(endTime).Format("2006-01-02 15:04:05-07:00")
	
	// Check if already exists
	var existingCount int
	err := dh.db.QueryRow(`
		SELECT COUNT(*) FROM charger_sessions 
		WHERE charger_id = ? AND user_id = ? AND session_time = ?
	`, chargerID, userID, localStartTime).Scan(&existingCount)
	
	if err == nil && existingCount > 0 {
		log.Printf("Zaptec: [%s] Fallback session already exists, skipping", chargerName)
		return nil
	}
	
	// Get baseline energy
	var baselineEnergy float64
	err = dh.db.QueryRow(`
		SELECT power_kwh FROM charger_sessions 
		WHERE charger_id = ? 
		ORDER BY session_time DESC LIMIT 1
	`, chargerID).Scan(&baselineEnergy)
	if err != nil {
		baselineEnergy = 0
	}
	
	startEnergy := baselineEnergy
	endEnergy := baselineEnergy + history.Energy
	
	// Write start reading
	_, err = dh.db.Exec(`
		INSERT OR IGNORE INTO charger_sessions (charger_id, user_id, session_time, power_kwh, mode, state)
		VALUES (?, ?, ?, ?, ?, ?)
	`, chargerID, userID, localStartTime, startEnergy, "1", "3")
	
	if err != nil {
		log.Printf("WARNING: [%s] Failed to write fallback start: %v", chargerName, err)
	}
	
	// Write end reading
	_, err = dh.db.Exec(`
		INSERT OR IGNORE INTO charger_sessions (charger_id, user_id, session_time, power_kwh, mode, state)
		VALUES (?, ?, ?, ?, ?, ?)
	`, chargerID, userID, localEndTime, endEnergy, "1", "3")
	
	if err != nil {
		return fmt.Errorf("failed to write fallback end: %v", err)
	}
	
	log.Printf("Zaptec: [%s] ⚠ FALLBACK SESSION WRITTEN: ID=%s, User=%s, Energy=%.3f kWh", 
		chargerName, history.ID, userID, history.Energy)
	
	return nil
}

// WriteIdleReading writes an idle reading to the database
func (dh *DatabaseHandler) WriteIdleReading(chargerID int, userID string, interval time.Time, totalEnergy float64, state string) bool {
	timestamp := interval.Format("2006-01-02 15:04:05-07:00")
	
	result, err := dh.db.Exec(`
		INSERT OR IGNORE INTO charger_sessions (charger_id, user_id, session_time, power_kwh, mode, state)
		VALUES (?, ?, ?, ?, ?, ?)
	`, chargerID, userID, timestamp, totalEnergy, "1", state)
	
	if err != nil {
		log.Printf("Zaptec: Could not write idle reading: %v", err)
		return false
	}
	
	rowsAffected, _ := result.RowsAffected()
	return rowsAffected > 0
}

// GetGapUserID determines the user_id for gap filling based on OCMF session state
func (dh *DatabaseHandler) GetGapUserID(chargerID int, activeSessionID string) string {
	if activeSessionID != "" {
		// Inside active session - get user from most recent session data
		var gapUserID string
		err := dh.db.QueryRow(`
			SELECT user_id FROM charger_sessions 
			WHERE charger_id = ? AND user_id != ''
			ORDER BY session_time DESC LIMIT 1
		`, chargerID).Scan(&gapUserID)
		
		if err != nil {
			return ""
		}
		return gapUserID
	}
	
	// No active session - charger available
	return ""
}