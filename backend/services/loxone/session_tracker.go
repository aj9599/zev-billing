package loxone

import (
	"database/sql"
	"fmt"
	"log"
	"time"
)

// ProcessCompletedChargerSession writes all readings from a completed session to charger_sessions table
// This matches how Zaptec works - using charger_sessions table, not charger_readings
// CRITICAL FIX: All timestamps now use timezone-aware format (2006-01-02 15:04:05-07:00) to match Zaptec
func ProcessCompletedChargerSession(session *CompletedChargerSession, db *sql.DB, collector LoxoneCollectorInterface) {
	log.Printf("   🔵 [%s] Processing completed session...", session.ChargerName)
	log.Printf("      User: %s, Energy: %.3f kWh, Readings: %d",
		session.UserID, session.TotalEnergy_kWh, len(session.Readings))
	log.Printf("      Actual Start: %s, Actual End: %s, Duration: %.0f seconds",
		session.StartTime.Format("2006-01-02 15:04:05"),
		session.EndTime.Format("2006-01-02 15:04:05"),
		session.Duration_sec)

	// Generate session ID for tracking processed sessions
	sessionID := fmt.Sprintf("loxone-%d-%s", session.ChargerID, session.StartTime.Format("20060102150405"))

	// Check if already processed
	if collector != nil {
		processedSessions := collector.GetProcessedSessions()
		if processedSessions[sessionID] {
			log.Printf("   ⏭️ [%s] Session %s already processed, skipping", session.ChargerName, sessionID)
			return
		}
	}

	tx, err := db.Begin()
	if err != nil {
		log.Printf("   ❌ [%s] Failed to begin transaction: %v", session.ChargerName, err)
		return
	}
	defer tx.Rollback()

	// STEP 0: Retroactively fix existing maintenance readings that fall within this session's time range.
	// When a car plugs in at e.g. 12:01, the system only detects the state change at 12:15.
	// Between 12:01-12:15, maintenance readings were written with state=1 (idle) and no user_id.
	// Now that we know the exact session start/end from Lcl, update those readings with the correct user, state, and mode.
	retroResult, retroErr := tx.Exec(`
		UPDATE charger_sessions
		SET user_id = ?, state = '3', mode = ?
		WHERE charger_id = ?
		  AND session_time >= ?
		  AND session_time <= ?
		  AND (user_id = '' OR user_id IS NULL OR state = '1')
	`, session.UserID, session.Mode,
		session.ChargerID,
		session.StartTime.Format("2006-01-02 15:04:05-07:00"),
		session.EndTime.Format("2006-01-02 15:04:05-07:00"))

	if retroErr != nil {
		log.Printf("   ⚠️  [%s] Failed to retroactively update maintenance readings: %v", session.ChargerName, retroErr)
	} else {
		retroCount, _ := retroResult.RowsAffected()
		if retroCount > 0 {
			log.Printf("   🔄 [%s] Retroactively updated %d maintenance readings (set user=%s, state=3, mode=%s)",
				session.ChargerName, retroCount, session.UserID, session.Mode)
		}
	}

	// Prepare statement for charger_sessions table (like Zaptec)
	stmt, err := tx.Prepare(`
		INSERT INTO charger_sessions (charger_id, user_id, session_time, power_kwh, mode, state)
		VALUES (?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		log.Printf("   ❌ [%s] Failed to prepare statement: %v", session.ChargerName, err)
		return
	}
	defer stmt.Close()

	// Helper: check if a reading already exists for a given timestamp (already updated by retroactive fix above)
	readingExists := func(sessionTime string) bool {
		var count int
		err := tx.QueryRow(`
			SELECT COUNT(*) FROM charger_sessions
			WHERE charger_id = ? AND session_time = ?
		`, session.ChargerID, sessionTime).Scan(&count)
		return err == nil && count > 0
	}

	// Round start and end times to quarter hours for alignment
	roundedStartTime := RoundToQuarterHour(session.StartTime)
	roundedEndTime := RoundToQuarterHour(session.EndTime)

	// STEP 1: Write exact start reading (may not be on 15-min boundary)
	// CRITICAL: Use timezone-aware format to match Zaptec and avoid UTC confusion
	startTimeStr := session.StartTime.Format("2006-01-02 15:04:05-07:00")
	if !readingExists(startTimeStr) {
		log.Printf("   🔵 [%s] Writing start reading at %s (energy: %.3f kWh)",
			session.ChargerName, session.StartTime.Format("2006-01-02 15:04:05"), session.StartEnergy_kWh)

		_, err = stmt.Exec(
			session.ChargerID,
			session.UserID,
			startTimeStr,
			session.StartEnergy_kWh,
			session.Mode,
			"3", // state = 3 (charging, like Zaptec)
		)
		if err != nil {
			log.Printf("   ⚠️  [%s] Failed to insert start reading: %v", session.ChargerName, err)
		}
	} else {
		log.Printf("   ✅ [%s] Start reading at %s already exists (retroactively updated)", session.ChargerName, session.StartTime.Format("15:04:05"))
	}

	// STEP 2: Write all 15-min interval readings that we captured during the session
	writtenCount := 0
	skippedCount := 0
	for i, reading := range session.Readings {
		// Skip if this reading is at the exact start or end time (already handled)
		if reading.Timestamp.Equal(session.StartTime) || reading.Timestamp.Equal(session.EndTime) {
			continue
		}

		readingTimeStr := reading.Timestamp.Format("2006-01-02 15:04:05-07:00")
		if readingExists(readingTimeStr) {
			skippedCount++
			continue
		}

		_, err := stmt.Exec(
			session.ChargerID,
			session.UserID,
			readingTimeStr,
			reading.Energy_kWh,
			reading.Mode,
			"3", // state = 3 (charging)
		)
		if err != nil {
			log.Printf("   ⚠️  [%s] Failed to insert reading %d: %v", session.ChargerName, i, err)
		} else {
			writtenCount++
		}
	}

	log.Printf("   ✅ [%s] Wrote %d intermediate readings (%d already existed from retroactive update)", session.ChargerName, writtenCount, skippedCount)

	// STEP 3: Backfill any missing 15-min intervals between rounded start and end
	currentTime := roundedStartTime
	if currentTime.Before(session.StartTime) {
		currentTime = currentTime.Add(15 * time.Minute)
	}

	backfilledCount := 0
	for currentTime.Before(roundedEndTime) {
		backfillTimeStr := currentTime.Format("2006-01-02 15:04:05-07:00")

		// Check if we already have a reading for this timestamp (in memory or in database)
		hasReading := readingExists(backfillTimeStr)
		if !hasReading {
			for _, reading := range session.Readings {
				if reading.Timestamp.Equal(currentTime) {
					hasReading = true
					break
				}
			}
		}

		if !hasReading && !currentTime.Equal(session.StartTime) && !currentTime.Equal(session.EndTime) {
			// Interpolate the energy value
			totalDuration := session.EndTime.Sub(session.StartTime).Seconds()
			elapsedDuration := currentTime.Sub(session.StartTime).Seconds()
			ratio := elapsedDuration / totalDuration
			interpolatedEnergy := session.StartEnergy_kWh + (session.EndEnergy_kWh-session.StartEnergy_kWh)*ratio

			log.Printf("   🔧 [%s] Backfilling missing interval at %s (energy: %.3f kWh)",
				session.ChargerName, currentTime.Format("15:04:05"), interpolatedEnergy)

			_, err := stmt.Exec(
				session.ChargerID,
				session.UserID,
				backfillTimeStr,
				interpolatedEnergy,
				session.Mode,
				"3", // state = 3 (charging)
			)
			if err != nil {
				log.Printf("   ⚠️  [%s] Failed to insert backfilled reading: %v", session.ChargerName, err)
			} else {
				backfilledCount++
			}
		}

		currentTime = currentTime.Add(15 * time.Minute)
	}

	if backfilledCount > 0 {
		log.Printf("   🔧 [%s] Backfilled %d missing intervals", session.ChargerName, backfilledCount)
	}

	// STEP 4: Write exact end reading (may not be on 15-min boundary)
	endTimeStr := session.EndTime.Format("2006-01-02 15:04:05-07:00")
	if !readingExists(endTimeStr) {
		log.Printf("   🔵 [%s] Writing end reading at %s (energy: %.3f kWh)",
			session.ChargerName, session.EndTime.Format("2006-01-02 15:04:05"), session.EndEnergy_kWh)

		_, err = stmt.Exec(
			session.ChargerID,
			session.UserID,
			endTimeStr,
			session.EndEnergy_kWh,
			session.Mode,
			"3", // state = 3 (charging)
		)
		if err != nil {
			log.Printf("   ⚠️  [%s] Failed to insert end reading: %v", session.ChargerName, err)
		}
	} else {
		log.Printf("   ✅ [%s] End reading at %s already exists (retroactively updated)", session.ChargerName, session.EndTime.Format("15:04:05"))
	}

	// Commit transaction for charger_sessions
	if err := tx.Commit(); err != nil {
		log.Printf("   ❌ [%s] Failed to commit transaction: %v", session.ChargerName, err)
		return
	}

	// STEP 5: Write post-session maintenance reading for the next quarter-hour after session end.
	// This fills the gap between session end (e.g. 13:02) and the next regular poll (e.g. 13:30).
	nextQuarter := GetNextQuarterHour(session.EndTime)
	nextQuarterStr := nextQuarter.Format("2006-01-02 15:04:05-07:00")
	var postExists int
	db.QueryRow(`SELECT COUNT(*) FROM charger_sessions WHERE charger_id = ? AND session_time = ?`,
		session.ChargerID, nextQuarterStr).Scan(&postExists)
	if postExists == 0 {
		_, postErr := db.Exec(`
			INSERT INTO charger_sessions (charger_id, user_id, session_time, power_kwh, mode, state)
			VALUES (?, ?, ?, ?, ?, ?)
		`, session.ChargerID, "", nextQuarterStr, session.EndEnergy_kWh, session.Mode, "1")
		if postErr != nil {
			log.Printf("   ⚠️  [%s] Failed to write post-session maintenance reading: %v", session.ChargerName, postErr)
		} else {
			log.Printf("   📝 [%s] Post-session maintenance reading at %s (%.3f kWh)",
				session.ChargerName, nextQuarter.Format("15:04:05"), session.EndEnergy_kWh)
		}
	}

	// Mark session as processed
	if collector != nil {
		collector.MarkSessionProcessed(sessionID)
	}
	
	// Delete from active sessions (this also handles database cleanup internally)
	if collector != nil {
		collector.DeleteActiveSession(session.ChargerID)
	}

	// Update charger_stats table with last session info
	_, err = db.Exec(`
		INSERT INTO charger_stats (
			charger_id,
			last_session_energy_kwh,
			last_session_duration_sec,
			last_session_user_id,
			last_session_end_time,
			updated_at
		) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(charger_id) DO UPDATE SET
			last_session_energy_kwh = excluded.last_session_energy_kwh,
			last_session_duration_sec = excluded.last_session_duration_sec,
			last_session_user_id = excluded.last_session_user_id,
			last_session_end_time = excluded.last_session_end_time,
			updated_at = CURRENT_TIMESTAMP
	`, session.ChargerID, session.TotalEnergy_kWh, session.Duration_sec, 
	   session.UserID, session.EndTime.Format("2006-01-02 15:04:05-07:00")) // Include timezone offset!
	
	if err != nil {
		log.Printf("   ⚠️  [%s] Failed to update charger_stats: %v", session.ChargerName, err)
	} else {
		log.Printf("   💾 [%s] Updated charger_stats with last session info", session.ChargerName)
	}

	totalReadings := 2 + writtenCount + backfilledCount // start + end + intermediates + backfilled

	log.Printf("   ✅ [%s] SESSION COMPLETE: ID=%s, User=%s, Energy=%.3f kWh, Total Readings=%d (%d captured, %d backfilled)",
		session.ChargerName, sessionID, session.UserID, session.TotalEnergy_kWh, totalReadings, writtenCount+2, backfilledCount)

	if collector != nil {
		collector.LogToDatabase("Loxone Charger Session Completed",
			fmt.Sprintf("Charger '%s': Session %s completed - User: %s, Energy: %.3f kWh, Duration: %.0f sec, Readings: %d (%d backfilled)",
				session.ChargerName, sessionID, session.UserID, session.TotalEnergy_kWh, session.Duration_sec, totalReadings, backfilledCount))
	}
}