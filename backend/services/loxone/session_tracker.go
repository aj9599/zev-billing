package loxone

import (
	"database/sql"
	"fmt"
	"log"
)

// ProcessCompletedChargerSession writes all 15-min readings from a completed session to database
func ProcessCompletedChargerSession(session *CompletedChargerSession, db *sql.DB, collector LoxoneCollectorInterface) {
	log.Printf("   📝 [%s] Processing completed session...", session.ChargerName)
	log.Printf("      User: %s, Energy: %.3f kWh, Readings: %d",
		session.UserID, session.TotalEnergy_kWh, len(session.Readings))

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

	// Build 15-minute interval records
	if len(session.Readings) < 2 {
		// Not enough readings, just write what we have
		if len(session.Readings) == 1 {
			reading := session.Readings[0]
			_, err := db.Exec(`
				INSERT INTO charger_readings (charger_id, timestamp, energy_kwh, user_id, session_id, reading_type)
				VALUES (?, ?, ?, ?, ?, ?)
			`, session.ChargerID, reading.Timestamp.Format("2006-01-02T15:04:05-07:00"),
				reading.Energy_kWh, session.UserID, sessionID, "S") // S = Single

			if err != nil {
				log.Printf("   ❌ [%s] Failed to save session reading: %v", session.ChargerName, err)
				return
			}
		}
	} else {
		// Multiple readings - write all of them
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

		for i, reading := range session.Readings {
			readingType := "T" // Tariff/intermediate
			if i == 0 {
				readingType = "B" // Begin
			} else if i == len(session.Readings)-1 {
				readingType = "E" // End
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
				log.Printf("   ⚠️ [%s] Failed to insert reading: %v", session.ChargerName, err)
			}
		}

		if err := tx.Commit(); err != nil {
			log.Printf("   ❌ [%s] Failed to commit transaction: %v", session.ChargerName, err)
			return
		}
	}

	// Mark session as processed
	if collector != nil {
		collector.MarkSessionProcessed(sessionID)
	}

	log.Printf("   ✅ [%s] SESSION WRITTEN TO DB: ID=%s, User=%s, Energy=%.3f kWh, Readings=%d",
		session.ChargerName, sessionID, session.UserID, session.TotalEnergy_kWh, len(session.Readings))

	if collector != nil {
		collector.LogToDatabase("Loxone Charger Session Completed",
			fmt.Sprintf("Charger '%s': Session %s completed - User: %s, Energy: %.3f kWh",
				session.ChargerName, sessionID, session.UserID, session.TotalEnergy_kWh))
	}
}