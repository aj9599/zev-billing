package services

import (
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/aj9599/zev-billing/backend/services/loxone"
)

// ========== SESSION PERSISTENCE FUNCTIONS ==========
// These functions save/load active sessions to/from database
// so they survive backend restarts and page reloads

// SaveActiveSessionToDatabase persists an active session to database with retry logic
func (lc *LoxoneCollector) SaveActiveSessionToDatabase(session *loxone.ActiveChargerSession) error {
	sessionKey := fmt.Sprintf("loxone-%d-%s", session.ChargerID, session.StartTime.Format("20060102150405"))

	// Convert readings to JSON
	readingsJSON, err := json.Marshal(session.Readings)
	if err != nil {
		return fmt.Errorf("failed to marshal readings: %v", err)
	}

	// Insert or update active session with retry logic
	const maxRetries = 3
	var lastErr error

	for attempt := 0; attempt < maxRetries; attempt++ {
		_, err = lc.db.Exec(`
			INSERT INTO active_charger_sessions (
				charger_id, session_key, charger_name,
				start_time, start_energy_kwh, user_id, mode,
				last_lcl_value, readings_json, readings_count, last_update
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
			ON CONFLICT(session_key) DO UPDATE SET
				user_id = excluded.user_id,
				last_lcl_value = excluded.last_lcl_value,
				readings_json = excluded.readings_json,
				readings_count = excluded.readings_count,
				last_update = CURRENT_TIMESTAMP
		`, session.ChargerID, sessionKey, session.ChargerName,
			session.StartTime.Format("2006-01-02 15:04:05"),
			session.StartEnergy_kWh, session.UserID, session.Mode,
			session.LastLclValue, string(readingsJSON), len(session.Readings))

		if err == nil {
			// Success
			if attempt > 0 {
				log.Printf("💾 [%s] Active session persisted to database on retry %d (key: %s, readings: %d)",
					session.ChargerName, attempt+1, sessionKey, len(session.Readings))
			} else {
				log.Printf("💾 [%s] Active session persisted to database (key: %s, readings: %d)",
					session.ChargerName, sessionKey, len(session.Readings))
			}
			return nil
		}

		lastErr = err
		if attempt < maxRetries-1 {
			// Wait before retry with exponential backoff
			waitTime := time.Duration(attempt+1) * time.Second
			log.Printf("⚠️  [%s] Failed to persist session (attempt %d/%d), retrying in %v: %v",
				session.ChargerName, attempt+1, maxRetries, waitTime, err)
			time.Sleep(waitTime)
		}
	}

	// All retries failed
	log.Printf("❌ [%s] CRITICAL: Failed to persist session after %d attempts: %v",
		session.ChargerName, maxRetries, lastErr)
	
	// Log to admin logs for visibility
	lc.logToDatabase("Loxone Session Persistence Failed",
		fmt.Sprintf("Charger '%s': Failed to persist session after %d attempts: %v",
			session.ChargerName, maxRetries, lastErr))

	return fmt.Errorf("failed to save active session after %d attempts: %v", maxRetries, lastErr)
}

// loadActiveSessionsFromDatabase loads all active sessions on startup
func (lc *LoxoneCollector) loadActiveSessionsFromDatabase() {
	rows, err := lc.db.Query(`
		SELECT 
			charger_id, charger_name, start_time, start_energy_kwh,
			user_id, mode, last_lcl_value, readings_json
		FROM active_charger_sessions
		WHERE last_update > datetime('now', '-24 hours')  -- Match cleanup window
		ORDER BY charger_id
	`)
	if err != nil {
		log.Printf("WARNING: Could not load active sessions: %v", err)
		return
	}
	defer rows.Close()

	count := 0
	skippedCount := 0
	lc.chargerMu.Lock()
	defer lc.chargerMu.Unlock()

	for rows.Next() {
		var chargerID int
		var chargerName, startTimeStr, userID, mode, lastLclValue, readingsJSON string
		var startEnergy float64

		err := rows.Scan(&chargerID, &chargerName, &startTimeStr, &startEnergy,
			&userID, &mode, &lastLclValue, &readingsJSON)
		if err != nil {
			log.Printf("WARNING: Failed to scan active session: %v", err)
			continue
		}

		// Parse start time
		startTime, err := time.ParseInLocation("2006-01-02 15:04:05", startTimeStr, time.Local)
		if err != nil {
			log.Printf("WARNING: Failed to parse start time: %v", err)
			continue
		}

		// Validate session age - discard sessions older than 48 hours
		sessionAge := time.Since(startTime)
		if sessionAge > 48*time.Hour {
			log.Printf("⚠️  [%s] Session too old (%.1f hours), discarding and cleaning up",
				chargerName, sessionAge.Hours())
			lc.deleteActiveSessionFromDatabaseInternal(chargerID, startTime)
			skippedCount++
			continue
		}

		// Parse readings JSON
		var readings []loxone.ChargerSessionReading
		if readingsJSON != "" {
			if err := json.Unmarshal([]byte(readingsJSON), &readings); err != nil {
				log.Printf("WARNING: Failed to unmarshal readings for %s, using empty readings: %v",
					chargerName, err)
				readings = []loxone.ChargerSessionReading{}
			}
		}

		// Validate readings aren't corrupted
		if readings == nil {
			readings = []loxone.ChargerSessionReading{}
		}

		// Restore active session
		session := &loxone.ActiveChargerSession{
			ChargerID:       chargerID,
			ChargerName:     chargerName,
			StartTime:       startTime,
			StartEnergy_kWh: startEnergy,
			UserID:          userID,
			Mode:            mode,
			LastLclValue:    lastLclValue,
			Readings:        readings,
		}

		lc.activeSessions[chargerID] = session
		count++

		log.Printf("🔥 [%s] Restored active session from database: Started %s (%.1f hours ago), %d readings",
			chargerName, startTime.Format("15:04:05"), sessionAge.Hours(), len(readings))
	}

	if count > 0 {
		log.Printf("✅ Loaded %d active charging sessions from database", count)
		if skippedCount > 0 {
			log.Printf("⚠️  Skipped %d stale sessions (>48h old)", skippedCount)
		}
		lc.logToDatabase("Loxone Sessions Restored",
			fmt.Sprintf("Restored %d active sessions from database on startup (skipped %d stale)", count, skippedCount))
	} else if skippedCount > 0 {
		log.Printf("⚠️  No active sessions loaded, but cleaned up %d stale sessions", skippedCount)
		lc.logToDatabase("Loxone Stale Sessions Cleaned",
			fmt.Sprintf("Cleaned up %d stale sessions (>48h old) during load", skippedCount))
	}
}

// deleteActiveSessionFromDatabase removes a completed session from active_charger_sessions
func (lc *LoxoneCollector) deleteActiveSessionFromDatabase(chargerID int, startTime time.Time) error {
	return lc.deleteActiveSessionFromDatabaseInternal(chargerID, startTime)
}

// deleteActiveSessionFromDatabaseInternal is the internal implementation
func (lc *LoxoneCollector) deleteActiveSessionFromDatabaseInternal(chargerID int, startTime time.Time) error {
	sessionKey := fmt.Sprintf("loxone-%d-%s", chargerID, startTime.Format("20060102150405"))

	result, err := lc.db.Exec(`
		DELETE FROM active_charger_sessions WHERE session_key = ?
	`, sessionKey)

	if err != nil {
		return fmt.Errorf("failed to delete active session: %v", err)
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected > 0 {
		log.Printf("🗑️  [Charger %d] Removed completed session from active_charger_sessions", chargerID)
	}
	
	return nil
}

// cleanupStaleActiveSessions removes old sessions that weren't properly completed
func (lc *LoxoneCollector) cleanupStaleActiveSessions() {
	// Delete sessions older than 24 hours (likely stale due to crash/restart)
	result, err := lc.db.Exec(`
		DELETE FROM active_charger_sessions 
		WHERE last_update < datetime('now', '-24 hours')
	`)

	if err != nil {
		log.Printf("WARNING: Failed to cleanup stale sessions: %v", err)
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected > 0 {
		log.Printf("🧹 Cleaned up %d stale active sessions (>24h old)", rowsAffected)
		lc.logToDatabase("Loxone Stale Sessions Cleaned",
			fmt.Sprintf("Removed %d stale sessions from database", rowsAffected))
	}
}

// GetPersistenceMetrics returns statistics about session persistence
func (lc *LoxoneCollector) GetPersistenceMetrics() map[string]interface{} {
	// Count active sessions in database
	var dbCount int
	err := lc.db.QueryRow(`
		SELECT COUNT(*) FROM active_charger_sessions
		WHERE last_update > datetime('now', '-24 hours')
	`).Scan(&dbCount)
	
	if err != nil {
		log.Printf("WARNING: Failed to get DB session count: %v", err)
		dbCount = -1
	}

	// Count active sessions in memory
	lc.chargerMu.RLock()
	memoryCount := len(lc.activeSessions)
	lc.chargerMu.RUnlock()

	// Count stale sessions in database
	var staleCount int
	err = lc.db.QueryRow(`
		SELECT COUNT(*) FROM active_charger_sessions
		WHERE last_update <= datetime('now', '-24 hours')
	`).Scan(&staleCount)
	
	if err != nil {
		log.Printf("WARNING: Failed to get stale session count: %v", err)
		staleCount = -1
	}

	return map[string]interface{}{
		"active_sessions_in_memory":   memoryCount,
		"active_sessions_in_database": dbCount,
		"stale_sessions_in_database":  staleCount,
		"persistence_enabled":         true,
	}
}