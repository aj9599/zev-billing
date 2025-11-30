package loxone

import (
	"database/sql"
	"fmt"
	"log"
	"time"
)

// ProcessCompletedChargerSession writes all readings from a completed session with proper backfilling
func ProcessCompletedChargerSession(session *CompletedChargerSession, db *sql.DB, collector LoxoneCollectorInterface) {
	log.Printf("   📝 [%s] Processing completed session with backfilling...", session.ChargerName)
	log.Printf("      User: %s, Energy: %.3f kWh, Readings: %d",
		session.UserID, session.TotalEnergy_kWh, len(session.Readings))
	log.Printf("      Actual Start: %s, Actual End: %s, Duration: %.0f seconds",
		session.StartTime.Format("2006-01-02 15:04:05"),
		session.EndTime.Format("2006-01-02 15:04:05"),
		session.Duration_sec)

	// Generate session ID
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

	stmt, err := tx.Prepare(`
		INSERT INTO charger_readings (charger_id, timestamp, energy_kwh, user_id, session_id, reading_type)
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

	// STEP 1: Write exact start entry (may not be on 15-min boundary)
	log.Printf("   📍 [%s] Writing start entry at %s (energy: %.3f kWh)",
		session.ChargerName, session.StartTime.Format("2006-01-02 15:04:05"), session.StartEnergy_kWh)

	_, err = stmt.Exec(
		session.ChargerID,
		session.StartTime.Format("2006-01-02T15:04:05-07:00"),
		session.StartEnergy_kWh,
		session.UserID,
		sessionID,
		"B", // B = Begin
	)
	if err != nil {
		log.Printf("   ⚠️ [%s] Failed to insert start entry: %v", session.ChargerName, err)
	}

	// STEP 2: Write all 15-min interval readings that we captured during the session
	writtenCount := 0
	for i, reading := range session.Readings {
		readingType := "T" // T = Tariff/intermediate reading
		
		// Skip if this reading is at the exact start or end time (already handled)
		if reading.Timestamp.Equal(session.StartTime) || reading.Timestamp.Equal(session.EndTime) {
			continue
		}

		_, err := stmt.Exec(
			session.ChargerID,
			reading.Timestamp.Format("2006-01-02T15:04:05-07:00"),
			reading.Energy_kWh,
			session.UserID,
			sessionID,
			readingType,
		)
		if err != nil {
			log.Printf("   ⚠️ [%s] Failed to insert reading %d: %v", session.ChargerName, i, err)
		} else {
			writtenCount++
		}
	}

	log.Printf("   ✅ [%s] Wrote %d intermediate readings", session.ChargerName, writtenCount)

	// STEP 3: Backfill any missing 15-min intervals between rounded start and end
	// This handles cases where we missed some 15-min intervals during the session
	currentTime := roundedStartTime
	if currentTime.Before(session.StartTime) {
		currentTime = currentTime.Add(15 * time.Minute) // Start from first interval after start
	}

	backfilledCount := 0
	for currentTime.Before(roundedEndTime) {
		// Check if we already have a reading for this timestamp in our session readings
		hasReading := false
		for _, reading := range session.Readings {
			if reading.Timestamp.Equal(currentTime) {
				hasReading = true
				break
			}
		}

		if !hasReading && !currentTime.Equal(session.StartTime) && !currentTime.Equal(session.EndTime) {
			// We're missing this 15-min interval - interpolate the energy value
			// Calculate proportional energy based on time
			totalDuration := session.EndTime.Sub(session.StartTime).Seconds()
			elapsedDuration := currentTime.Sub(session.StartTime).Seconds()
			ratio := elapsedDuration / totalDuration
			interpolatedEnergy := session.StartEnergy_kWh + (session.EndEnergy_kWh-session.StartEnergy_kWh)*ratio

			log.Printf("   🔧 [%s] Backfilling missing interval at %s (energy: %.3f kWh)",
				session.ChargerName, currentTime.Format("15:04:05"), interpolatedEnergy)

			_, err := stmt.Exec(
				session.ChargerID,
				currentTime.Format("2006-01-02T15:04:05-07:00"),
				interpolatedEnergy,
				session.UserID,
				sessionID,
				"I", // I = Interpolated
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

	// STEP 4: Write exact end entry (may not be on 15-min boundary)
	log.Printf("   🏁 [%s] Writing end entry at %s (energy: %.3f kWh)",
		session.ChargerName, session.EndTime.Format("2006-01-02 15:04:05"), session.EndEnergy_kWh)

	_, err = stmt.Exec(
		session.ChargerID,
		session.EndTime.Format("2006-01-02T15:04:05-07:00"),
		session.EndEnergy_kWh,
		session.UserID,
		sessionID,
		"E", // E = End
	)
	if err != nil {
		log.Printf("   ⚠️ [%s] Failed to insert end entry: %v", session.ChargerName, err)
	}

	// Commit transaction
	if err := tx.Commit(); err != nil {
		log.Printf("   ❌ [%s] Failed to commit transaction: %v", session.ChargerName, err)
		return
	}

	// Mark session as processed
	if collector != nil {
		collector.MarkSessionProcessed(sessionID)
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