package loxone

import (
	"database/sql"
	"fmt"
	"log"
	"time"
)

// ProcessCompletedChargerSession writes all readings from a completed session to charger_sessions table
// This matches how Zaptec works - using charger_sessions table, not charger_readings
func ProcessCompletedChargerSession(session *CompletedChargerSession, db *sql.DB, collector LoxoneCollectorInterface) {
	log.Printf("   🏁 [%s] Processing completed session...", session.ChargerName)
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

	// Round start and end times to quarter hours for alignment
	roundedStartTime := RoundToQuarterHour(session.StartTime)
	roundedEndTime := RoundToQuarterHour(session.EndTime)

	// STEP 1: Write exact start reading (may not be on 15-min boundary)
	log.Printf("   🏁 [%s] Writing start reading at %s (energy: %.3f kWh)",
		session.ChargerName, session.StartTime.Format("2006-01-02 15:04:05"), session.StartEnergy_kWh)

	_, err = stmt.Exec(
		session.ChargerID,
		session.UserID,
		session.StartTime.Format("2006-01-02 15:04:05"),
		session.StartEnergy_kWh,
		session.Mode,
		"3", // state = 3 (charging, like Zaptec)
	)
	if err != nil {
		log.Printf("   ⚠️ [%s] Failed to insert start reading: %v", session.ChargerName, err)
	}

	// STEP 2: Write all 15-min interval readings that we captured during the session
	writtenCount := 0
	for i, reading := range session.Readings {
		// Skip if this reading is at the exact start or end time (already handled)
		if reading.Timestamp.Equal(session.StartTime) || reading.Timestamp.Equal(session.EndTime) {
			continue
		}

		_, err := stmt.Exec(
			session.ChargerID,
			session.UserID,
			reading.Timestamp.Format("2006-01-02 15:04:05"),
			reading.Energy_kWh,
			reading.Mode,
			"3", // state = 3 (charging)
		)
		if err != nil {
			log.Printf("   ⚠️ [%s] Failed to insert reading %d: %v", session.ChargerName, i, err)
		} else {
			writtenCount++
		}
	}

	log.Printf("   ✅ [%s] Wrote %d intermediate readings", session.ChargerName, writtenCount)

	// STEP 3: Backfill any missing 15-min intervals between rounded start and end
	currentTime := roundedStartTime
	if currentTime.Before(session.StartTime) {
		currentTime = currentTime.Add(15 * time.Minute)
	}

	backfilledCount := 0
	for currentTime.Before(roundedEndTime) {
		// Check if we already have a reading for this timestamp
		hasReading := false
		for _, reading := range session.Readings {
			if reading.Timestamp.Equal(currentTime) {
				hasReading = true
				break
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
				currentTime.Format("2006-01-02 15:04:05"),
				interpolatedEnergy,
				session.Mode,
				"3", // state = 3 (charging)
			)
			if err != nil {
				log.Printf("   ⚠️ [%s] Failed to insert backfilled reading: %v", session.ChargerName, err)
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
	log.Printf("   🏁 [%s] Writing end reading at %s (energy: %.3f kWh)",
		session.ChargerName, session.EndTime.Format("2006-01-02 15:04:05"), session.EndEnergy_kWh)

	_, err = stmt.Exec(
		session.ChargerID,
		session.UserID,
		session.EndTime.Format("2006-01-02 15:04:05"),
		session.EndEnergy_kWh,
		session.Mode,
		"3", // state = 3 (charging)
	)
	if err != nil {
		log.Printf("   ⚠️ [%s] Failed to insert end reading: %v", session.ChargerName, err)
	}

	// Commit transaction for charger_sessions
	if err := tx.Commit(); err != nil {
		log.Printf("   ❌ [%s] Failed to commit transaction: %v", session.ChargerName, err)
		return
	}

	// Mark session as processed
	if collector != nil {
		collector.MarkSessionProcessed(sessionID)
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
	   session.UserID, session.EndTime.Format("2006-01-02 15:04:05"))
	
	if err != nil {
		log.Printf("   ⚠️ [%s] Failed to update charger_stats: %v", session.ChargerName, err)
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