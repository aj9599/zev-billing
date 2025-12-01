package main

import (
	"bufio"
	"database/sql"
	"encoding/xml"
	"flag"
	"fmt"
	"io/ioutil"
	"log"
	"os"
	"strings"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

// XMLStatistics represents the XML structure
type XMLStatistics struct {
	XMLName  xml.Name  `xml:"Statistics"`
	Name     string    `xml:"Name,attr"`
	Readings []Reading `xml:"S"`
}

// Reading represents a single energy reading
type Reading struct {
	Timestamp string  `xml:"T,attr"`
	Value     float64 `xml:"V,attr"`
}

// Session represents a detected charging session
type Session struct {
	StartTime   time.Time
	EndTime     time.Time
	StartEnergy float64
	EndEnergy   float64
	UserID      string // User ID assigned to this session
	Readings    []SessionReading
}

// SessionReading represents a reading within a session
type SessionReading struct {
	Timestamp time.Time
	Energy    float64
}

func main() {
	// Command line arguments
	chargerID := flag.Int("charger", 0, "Charger ID")
	userID := flag.String("user", "", "User ID for ALL sessions (optional - will prompt if not provided)")
	xmlFile := flag.String("xml", "", "Path to XML file")
	dbPath := flag.String("db", "./backend/zev-billing.db", "Path to database")
	mode := flag.String("mode", "99", "Charging mode (default: 99 = Priority Charging)")
	dryRun := flag.Bool("dry-run", false, "Dry run - don't write to database")
	minSessionEnergy := flag.Float64("min-energy", 0.5, "Minimum energy change (kWh) to detect a session")
	interactive := flag.Bool("interactive", true, "Ask for user ID for each session (default: true)")

	flag.Parse()

	// Validate arguments
	if *chargerID == 0 {
		log.Fatal("ERROR: -charger is required (use charger ID from database)")
	}
	if *xmlFile == "" {
		log.Fatal("ERROR: -xml is required (path to Energy.xml file)")
	}

	// If user ID not provided and not interactive, error
	if *userID == "" && !*interactive {
		log.Fatal("ERROR: -user is required when -interactive=false")
	}

	log.Println("===========================================")
	log.Println("LOXONE CHARGER DATA FIX TOOL")
	log.Println("===========================================")
	log.Printf("Charger ID: %d", *chargerID)
	if *interactive {
		log.Println("Mode: INTERACTIVE (will ask for user ID per session)")
	} else {
		log.Printf("User ID: %s (all sessions)", *userID)
	}
	log.Printf("XML File: %s", *xmlFile)
	log.Printf("Database: %s", *dbPath)
	log.Printf("Mode: %s", *mode)
	log.Printf("Min Session Energy: %.2f kWh", *minSessionEnergy)
	if *dryRun {
		log.Println("DRY RUN MODE - No database changes will be made")
	}
	log.Println("===========================================")

	// Parse XML file
	log.Println("\n📖 Reading XML file...")
	xmlData, err := ioutil.ReadFile(*xmlFile)
	if err != nil {
		log.Fatalf("ERROR: Failed to read XML file: %v", err)
	}

	var stats XMLStatistics
	if err := xml.Unmarshal(xmlData, &stats); err != nil {
		log.Fatalf("ERROR: Failed to parse XML: %v", err)
	}

	log.Printf("✅ Loaded %d readings from XML", len(stats.Readings))
	log.Printf("   Charger Name: %s", stats.Name)
	if len(stats.Readings) > 0 {
		log.Printf("   First reading: %s = %.3f kWh", stats.Readings[0].Timestamp, stats.Readings[0].Value)
		log.Printf("   Last reading: %s = %.3f kWh",
			stats.Readings[len(stats.Readings)-1].Timestamp,
			stats.Readings[len(stats.Readings)-1].Value)
	}

	// Detect sessions
	log.Println("\n🔍 Detecting charging sessions...")
	sessions := detectSessions(stats.Readings, *minSessionEnergy)

	log.Printf("✅ Detected %d charging sessions:", len(sessions))
	totalEnergy := 0.0
	for i, session := range sessions {
		sessionEnergy := session.EndEnergy - session.StartEnergy
		totalEnergy += sessionEnergy
		duration := session.EndTime.Sub(session.StartTime)
		log.Printf("   Session %d: %s to %s (%.1f hours, %.3f kWh, %d readings)",
			i+1,
			session.StartTime.Format("2006-01-02 15:04:05"),
			session.EndTime.Format("2006-01-02 15:04:05"),
			duration.Hours(),
			sessionEnergy,
			len(session.Readings))
	}
	log.Printf("   Total Energy: %.3f kWh", totalEnergy)

	// Assign user IDs to sessions
	if *interactive && !*dryRun {
		log.Println("\n👤 Assigning User IDs to Sessions")
		log.Println("===========================================")
		scanner := bufio.NewScanner(os.Stdin)

		for i := range sessions {
			sessionEnergy := sessions[i].EndEnergy - sessions[i].StartEnergy
			duration := sessions[i].EndTime.Sub(sessions[i].StartTime)

			log.Printf("\nSession %d Details:", i+1)
			log.Printf("  Start: %s", sessions[i].StartTime.Format("2006-01-02 15:04:05"))
			log.Printf("  End:   %s", sessions[i].EndTime.Format("2006-01-02 15:04:05"))
			log.Printf("  Duration: %.1f hours", duration.Hours())
			log.Printf("  Energy: %.3f kWh", sessionEnergy)
			log.Printf("  Readings: %d", len(sessions[i].Readings))

			fmt.Print("\nEnter User ID for this session: ")
			if scanner.Scan() {
				sessions[i].UserID = strings.TrimSpace(scanner.Text())
				if sessions[i].UserID == "" {
					log.Println("   ⚠️  No user ID entered, using 'unknown'")
					sessions[i].UserID = "unknown"
				} else {
					log.Printf("   ✅ Assigned to user: %s", sessions[i].UserID)
				}
			} else {
				log.Println("   ⚠️  Failed to read input, using 'unknown'")
				sessions[i].UserID = "unknown"
			}
		}
		log.Println("\n===========================================")
	} else if !*interactive {
		// Non-interactive mode: assign provided user ID to all sessions
		for i := range sessions {
			sessions[i].UserID = *userID
		}
		log.Printf("\n✅ All sessions assigned to user: %s", *userID)
	} else if *dryRun {
		// Dry run: assign placeholder
		for i := range sessions {
			sessions[i].UserID = *userID
			if sessions[i].UserID == "" {
				sessions[i].UserID = "DRY-RUN-USER"
			}
		}
	}

	if *dryRun {
		log.Println("\n✅ DRY RUN COMPLETED - No database changes made")
		return
	}

	// Connect to database
	log.Println("\n💾 Connecting to database...")
	db, err := sql.Open("sqlite3", *dbPath)
	if err != nil {
		log.Fatalf("ERROR: Failed to open database: %v", err)
	}
	defer db.Close()

	// Verify charger exists
	var chargerName string
	err = db.QueryRow("SELECT name FROM chargers WHERE id = ?", *chargerID).Scan(&chargerName)
	if err != nil {
		log.Fatalf("ERROR: Charger ID %d not found in database", *chargerID)
	}
	log.Printf("✅ Found charger: %s (ID: %d)", chargerName, *chargerID)

	// Delete existing data
	log.Println("\n🗑️  Deleting existing data for this charger...")
	result, err := db.Exec("DELETE FROM charger_sessions WHERE charger_id = ?", *chargerID)
	if err != nil {
		log.Fatalf("ERROR: Failed to delete existing data: %v", err)
	}
	rowsDeleted, _ := result.RowsAffected()
	log.Printf("✅ Deleted %d existing readings", rowsDeleted)

	// Write sessions to database
	log.Println("\n💾 Writing sessions to database...")

	tx, err := db.Begin()
	if err != nil {
		log.Fatalf("ERROR: Failed to begin transaction: %v", err)
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`
		INSERT INTO charger_sessions (charger_id, user_id, session_time, power_kwh, mode, state)
		VALUES (?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		log.Fatalf("ERROR: Failed to prepare statement: %v", err)
	}
	defer stmt.Close()

	totalWritten := 0

	for sessionNum, session := range sessions {
		log.Printf("   Writing session %d/%d (User: %s)...", sessionNum+1, len(sessions), session.UserID)

		// Write all readings in the session
		for _, reading := range session.Readings {
			_, err := stmt.Exec(
				*chargerID,
				session.UserID, // Use session-specific user ID
				reading.Timestamp.Format("2006-01-02 15:04:05-07:00"),
				reading.Energy,
				*mode,
				"3", // State 3 = Charging
			)
			if err != nil {
				log.Printf("      ⚠️  Failed to insert reading at %s: %v",
					reading.Timestamp.Format("15:04:05"), err)
			} else {
				totalWritten++
			}
		}

		log.Printf("      ✅ Wrote %d readings (%.3f kWh)",
			len(session.Readings), session.EndEnergy-session.StartEnergy)
	}

	// Write maintenance readings (state=1 for disconnected periods)
	log.Println("\n📝 Writing maintenance readings for idle periods...")
	maintenanceCount := 0

	for i := 0; i < len(stats.Readings); i++ {
		reading := stats.Readings[i]
		timestamp, err := time.Parse("2006-01-02 15:04:05", reading.Timestamp)
		if err != nil {
			continue
		}

		// Check if this timestamp is in any session
		inSession := false
		for _, session := range sessions {
			if (timestamp.Equal(session.StartTime) || timestamp.After(session.StartTime)) &&
				(timestamp.Equal(session.EndTime) || timestamp.Before(session.EndTime)) {
				inSession = true
				break
			}
		}

		// If not in session, write maintenance reading
		if !inSession {
			_, err := stmt.Exec(
				*chargerID,
				"", // Empty user ID for maintenance
				timestamp.Format("2006-01-02 15:04:05-07:00"),
				reading.Value,
				*mode,
				"1", // State 1 = Disconnected
			)
			if err == nil {
				maintenanceCount++
			}
		}
	}

	log.Printf("   ✅ Wrote %d maintenance readings", maintenanceCount)

	// Commit transaction
	if err := tx.Commit(); err != nil {
		log.Fatalf("ERROR: Failed to commit transaction: %v", err)
	}

	// Update charger_stats table
	log.Println("\n📊 Updating charger_stats...")
	if len(sessions) > 0 {
		lastSession := sessions[len(sessions)-1]
		lastSessionEnergy := lastSession.EndEnergy - lastSession.StartEnergy
		lastSessionDuration := lastSession.EndTime.Sub(lastSession.StartTime).Seconds()

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
		`, *chargerID, lastSessionEnergy, lastSessionDuration, lastSession.UserID,
			lastSession.EndTime.Format("2006-01-02 15:04:05-07:00"))

		if err != nil {
			log.Printf("   ⚠️  Failed to update charger_stats: %v", err)
		} else {
			log.Printf("   ✅ Updated charger_stats with last session info (User: %s)", lastSession.UserID)
		}
	}

	// Log to admin_logs
	userSummary := ""
	for i, session := range sessions {
		sessionEnergy := session.EndEnergy - session.StartEnergy
		userSummary += fmt.Sprintf("Session %d (%.3f kWh) → User %s; ", i+1, sessionEnergy, session.UserID)
	}

	db.Exec(`
		INSERT INTO admin_logs (action, details, ip_address)
		VALUES (?, ?, 'fix-script')
	`, "Loxone Data Fix",
		fmt.Sprintf("Fixed charger %d (%s): Imported %d sessions, %d total readings, %.3f kWh total. %s",
			*chargerID, chargerName, len(sessions), totalWritten, totalEnergy, userSummary))

	log.Println("\n===========================================")
	log.Println("✅ SUCCESS!")
	log.Printf("   Sessions: %d", len(sessions))
	log.Printf("   Readings: %d", totalWritten)
	log.Printf("   Maintenance: %d", maintenanceCount)
	log.Printf("   Total Energy: %.3f kWh", totalEnergy)
	log.Println("")
	log.Println("   Session → User Assignments:")
	for i, session := range sessions {
		sessionEnergy := session.EndEnergy - session.StartEnergy
		log.Printf("      Session %d: User %s (%.3f kWh)", i+1, session.UserID, sessionEnergy)
	}
	log.Println("===========================================")
}

// detectSessions detects charging sessions from the readings
func detectSessions(readings []Reading, minEnergy float64) []Session {
	sessions := []Session{}
	var currentSession *Session

	for i := 0; i < len(readings); i++ {
		reading := readings[i]
		timestamp, err := time.Parse("2006-01-02 15:04:05", reading.Timestamp)
		if err != nil {
			log.Printf("⚠️  Failed to parse timestamp: %s", reading.Timestamp)
			continue
		}

		// Look ahead to see if energy is increasing
		isCharging := false
		if i < len(readings)-1 {
			nextValue := readings[i+1].Value
			energyIncrease := nextValue - reading.Value
			isCharging = energyIncrease >= 0.001 // More than 1 Wh increase
		}

		if isCharging {
			// Start new session or continue existing
			if currentSession == nil {
				currentSession = &Session{
					StartTime:   timestamp,
					StartEnergy: reading.Value,
					Readings:    []SessionReading{},
				}
			}

			// Add reading to session
			currentSession.Readings = append(currentSession.Readings, SessionReading{
				Timestamp: timestamp,
				Energy:    reading.Value,
			})
			currentSession.EndTime = timestamp
			currentSession.EndEnergy = reading.Value

		} else {
			// Not charging - close session if one exists
			if currentSession != nil {
				sessionEnergy := currentSession.EndEnergy - currentSession.StartEnergy

				// Only save sessions with meaningful energy change
				if sessionEnergy >= minEnergy {
					sessions = append(sessions, *currentSession)
				} else {
					log.Printf("   ⚠️  Discarded session (too small: %.3f kWh < %.2f kWh)",
						sessionEnergy, minEnergy)
				}

				currentSession = nil
			}
		}
	}

	// Close final session if exists
	if currentSession != nil {
		sessionEnergy := currentSession.EndEnergy - currentSession.StartEnergy
		if sessionEnergy >= minEnergy {
			sessions = append(sessions, *currentSession)
		}
	}

	return sessions
}
