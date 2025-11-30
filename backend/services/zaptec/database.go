package zaptec

import (
	"database/sql"
	"fmt"
	"log"
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

// WriteSessionToDatabase writes all OCMF meter readings from a completed session to charger_sessions table
// Handles sessions spanning midnight correctly by preserving original timestamps
func (dh *DatabaseHandler) WriteSessionToDatabase(session *CompletedSession) error {
	if len(session.MeterReadings) == 0 {
		return fmt.Errorf("no readings to write")
	}
	
	// Check if we already have data for this session
	firstReading := session.MeterReadings[0]
	firstTimestamp := firstReading.Timestamp.Format("2006-01-02 15:04:05-07:00")
	
	var existingCount int
	err := dh.db.QueryRow(`
		SELECT COUNT(*) FROM charger_sessions 
		WHERE charger_id = ? AND user_id = ? AND session_time = ?
	`, session.ChargerID, session.UserID, firstTimestamp).Scan(&existingCount)
	
	if err == nil && existingCount > 0 {
		log.Printf("Zaptec: [%s] Session already exists in database (timestamp %s), skipping", 
			session.ChargerName, firstTimestamp)
		return nil
	}
	
	tx, err := dh.db.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %v", err)
	}
	defer tx.Rollback()
	
	// Prepare insert statement
	stmt, err := tx.Prepare(`
		INSERT OR IGNORE INTO charger_sessions (charger_id, user_id, session_time, power_kwh, mode, state)
		VALUES (?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		return fmt.Errorf("failed to prepare statement: %v", err)
	}
	defer stmt.Close()
	
	insertCount := 0
	// Insert each OCMF reading with timezone-aware timestamps
	for _, reading := range session.MeterReadings {
		// Format timestamp with timezone offset
		localTimestamp := reading.Timestamp.Format("2006-01-02 15:04:05-07:00")
		
		result, err := stmt.Exec(
			session.ChargerID,
			session.UserID,
			localTimestamp,
			reading.Energy_kWh,
			"1", // mode = normal
			"3", // state = charging
		)
		if err != nil {
			log.Printf("WARNING: Failed to insert OCMF reading: %v", err)
			continue
		}
		
		rowsAffected, _ := result.RowsAffected()
		if rowsAffected > 0 {
			insertCount++
		}
	}
	
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %v", err)
	}
	
	log.Printf("Zaptec: [%s] Inserted %d/%d OCMF readings for session", session.ChargerName, insertCount, len(session.MeterReadings))
	
	return nil
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
	
	// Format timestamps with timezone offset
	localStartTime := startTime.In(dh.localTimezone).Format("2006-01-02 15:04:05-07:00")
	localEndTime := endTime.In(dh.localTimezone).Format("2006-01-02 15:04:05-07:00")
	
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