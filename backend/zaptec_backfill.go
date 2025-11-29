package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"
	
	_ "github.com/mattn/go-sqlite3"
)

// Same types as in zaptec_collector.go
type ZaptecConnectionConfig struct {
	Username       string `json:"zaptec_username"`
	Password       string `json:"zaptec_password"`
	ChargerID      string `json:"zaptec_charger_id"`
	InstallationID string `json:"zaptec_installation_id,omitempty"`
}

type ZaptecAuthResponse struct {
	AccessToken string `json:"access_token"`
	ExpiresIn   int    `json:"expires_in"`
	TokenType   string `json:"token_type"`
}

type ZaptecChargeHistory struct {
	ID              string  `json:"Id"`
	DeviceID        string  `json:"DeviceId"`
	StartDateTime   string  `json:"StartDateTime"`
	EndDateTime     string  `json:"EndDateTime"`
	Energy          float64 `json:"Energy"`
	UserFullName    string  `json:"UserFullName"`
	ChargerID       string  `json:"ChargerId"`
	DeviceName      string  `json:"DeviceName"`
	UserEmail       string  `json:"UserEmail"`
	UserID          string  `json:"UserId"`
	TokenName       string  `json:"TokenName"`
	ExternalID      string  `json:"ExternalId"`
	SignedSession   string  `json:"SignedSession"`
}

type ZaptecAPIResponse struct {
	Pages   int                   `json:"Pages"`
	Data    []json.RawMessage     `json:"Data"`
	Message string                `json:"Message"`
}

type OCMFData struct {
	FormatVersion        string           `json:"FV"`
	GatewayID            string           `json:"GI"`
	GatewaySerial        string           `json:"GS"`
	GatewayVersion       string           `json:"GV"`
	Pagination           string           `json:"PG"`
	MeterFirmware        string           `json:"MF"`
	IdentificationStatus bool             `json:"IS"`
	IdentificationLevel  string           `json:"IL"`
	IdentificationFlags  []string         `json:"IF"`
	IdentificationType   string           `json:"IT"`
	IdentificationData   string           `json:"ID"`
	ReadingData          []OCMFReading    `json:"RD"`
	ZaptecSession        string           `json:"ZS"`
}

type OCMFReading struct {
	Timestamp    string  `json:"TM"`
	Type         string  `json:"TX"`
	ReadingValue float64 `json:"RV"`
	ReadingID    string  `json:"RI"`
	ReadingUnit  string  `json:"RU"`
	Status       string  `json:"ST"`
}

type SessionMeterReading struct {
	Timestamp   time.Time
	Energy_kWh  float64
	ReadingType string
}

type CompletedSession struct {
	SessionID       string
	ChargerID       int
	ChargerName     string
	UserID          string
	UserName        string
	StartTime       time.Time
	EndTime         time.Time
	TotalEnergy_kWh float64
	MeterReadings   []SessionMeterReading
}

func main() {
	// Database path - adjust if needed
	dbPath := "./charger_data.db"
	
	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}
	defer db.Close()
	
	// Load timezone
	localTZ, err := time.LoadLocation("Europe/Zurich")
	if err != nil {
		log.Printf("WARNING: Could not load Europe/Zurich timezone, using UTC: %v", err)
		localTZ = time.UTC
	}
	
	log.Println("=" * 70)
	log.Println("ZAPTEC OCMF BACKFILL UTILITY")
	log.Println("=" * 70)
	log.Printf("Timezone: %s\n", localTZ.String())
	log.Printf("Database: %s\n", dbPath)
	log.Println("=" * 70)
	
	// Get all Zaptec chargers
	rows, err := db.Query(`
		SELECT id, name, connection_config
		FROM chargers 
		WHERE is_active = 1 AND connection_type = 'zaptec_api'
	`)
	if err != nil {
		log.Fatalf("Failed to query chargers: %v", err)
	}
	defer rows.Close()
	
	var chargers []struct {
		ID     int
		Name   string
		Config ZaptecConnectionConfig
	}
	
	for rows.Next() {
		var id int
		var name, configJSON string
		
		if err := rows.Scan(&id, &name, &configJSON); err != nil {
			continue
		}
		
		var config ZaptecConnectionConfig
		if err := json.Unmarshal([]byte(configJSON), &config); err != nil {
			log.Printf("ERROR: Invalid config for charger %s: %v", name, err)
			continue
		}
		
		chargers = append(chargers, struct {
			ID     int
			Name   string
			Config ZaptecConnectionConfig
		}{id, name, config})
	}
	
	if len(chargers) == 0 {
		log.Println("No Zaptec chargers found!")
		return
	}
	
	log.Printf("\nFound %d Zaptec charger(s):\n", len(chargers))
	for _, c := range chargers {
		log.Printf("  - %s (ID: %d, Charger ID: %s)\n", c.Name, c.ID, c.Config.ChargerID)
	}
	
	// Ask for confirmation
	fmt.Println("\n" + strings.Repeat("!", 70))
	fmt.Println("WARNING: This will DELETE all Zaptec charger data from the last 7 days!")
	fmt.Println("         and REFILL it with OCMF data from Zaptec API.")
	fmt.Println(strings.Repeat("!", 70))
	fmt.Print("\nAre you sure you want to continue? (yes/no): ")
	
	var response string
	fmt.Scanln(&response)
	
	if strings.ToLower(response) != "yes" {
		log.Println("Aborted by user.")
		return
	}
	
	log.Println("\n" + strings.Repeat("=", 70))
	log.Println("STARTING BACKFILL PROCESS")
	log.Println(strings.Repeat("=", 70))
	
	// Calculate date range (last 7 days)
	endDate := time.Now()
	startDate := endDate.AddDate(0, 0, -7)
	
	log.Printf("\nDate Range: %s to %s\n", 
		startDate.Format("2006-01-02"), 
		endDate.Format("2006-01-02"))
	
	// HTTP client
	client := &http.Client{Timeout: 30 * time.Second}
	apiBaseURL := "https://api.zaptec.com"
	
	// Process each charger
	totalDeleted := 0
	totalSessions := 0
	totalReadings := 0
	
	for _, charger := range chargers {
		log.Printf("\n" + strings.Repeat("-", 70))
		log.Printf("Processing: %s (ID: %d)\n", charger.Name, charger.ID)
		log.Println(strings.Repeat("-", 70))
		
		// Step 1: Delete existing data for last 7 days
		log.Println("\n[1/3] Deleting existing data from last 7 days...")
		
		sevenDaysAgo := startDate.Format("2006-01-02 15:04:05")
		result, err := db.Exec(`
			DELETE FROM charger_sessions 
			WHERE charger_id = ? 
			  AND session_time >= ?
		`, charger.ID, sevenDaysAgo)
		
		if err != nil {
			log.Printf("ERROR: Failed to delete data: %v\n", err)
			continue
		}
		
		deleted, _ := result.RowsAffected()
		totalDeleted += int(deleted)
		log.Printf("✓ Deleted %d existing records\n", deleted)
		
		// Step 2: Get access token
		log.Println("\n[2/3] Authenticating with Zaptec API...")
		
		token, err := getAccessToken(client, apiBaseURL, charger.Config)
		if err != nil {
			log.Printf("ERROR: Authentication failed: %v\n", err)
			continue
		}
		
		log.Println("✓ Authentication successful")
		
		// Step 3: Fetch charge history
		log.Println("\n[3/3] Fetching charge history with OCMF data...")
		
		history, err := getChargeHistoryDateRange(client, apiBaseURL, token, charger.Config.ChargerID, startDate, endDate)
		if err != nil {
			log.Printf("ERROR: Failed to fetch history: %v\n", err)
			continue
		}
		
		log.Printf("✓ Found %d charging sessions\n", len(history))
		
		// Step 4: Process each session
		if len(history) > 0 {
			log.Println("\nProcessing sessions:")
		}
		
		sessionCount := 0
		readingCount := 0
		
		for i, session := range history {
			// Parse OCMF data
			completedSession, err := parseSignedSession(&session, charger.ID, charger.Name, localTZ)
			if err != nil {
				log.Printf("  [%d/%d] Session %s: OCMF parse failed (%v), using fallback\n", 
					i+1, len(history), session.ID[:8], err)
				
				// Fallback: write simple start/end
				if err := writeSessionFallback(db, &session, charger.ID, charger.Name, localTZ); err != nil {
					log.Printf("         ERROR: Fallback write failed: %v\n", err)
				} else {
					sessionCount++
					readingCount += 2 // Start + End
				}
				continue
			}
			
			// Write OCMF readings to database
			if err := writeSessionToDatabase(db, completedSession); err != nil {
				log.Printf("  [%d/%d] Session %s: Write failed: %v\n", 
					i+1, len(history), session.ID[:8], err)
				continue
			}
			
			sessionCount++
			readingCount += len(completedSession.MeterReadings)
			
			log.Printf("  [%d/%d] ✓ Session %s: %s, User=%s, Energy=%.3f kWh, OCMF readings=%d\n",
				i+1, len(history), session.ID[:8],
				completedSession.StartTime.Format("2006-01-02 15:04"),
				completedSession.UserID,
				completedSession.TotalEnergy_kWh,
				len(completedSession.MeterReadings))
		}
		
		totalSessions += sessionCount
		totalReadings += readingCount
		
		log.Printf("\n✓ Charger '%s' complete: %d sessions, %d readings written\n", 
			charger.Name, sessionCount, readingCount)
	}
	
	// Final summary
	log.Println("\n" + strings.Repeat("=", 70))
	log.Println("BACKFILL COMPLETE!")
	log.Println(strings.Repeat("=", 70))
	log.Printf("Total deleted:        %d records\n", totalDeleted)
	log.Printf("Total sessions:       %d\n", totalSessions)
	log.Printf("Total readings:       %d\n", totalReadings)
	log.Println(strings.Repeat("=", 70))
}

func getAccessToken(client *http.Client, apiBaseURL string, config ZaptecConnectionConfig) (string, error) {
	authURL := fmt.Sprintf("%s/oauth/token", apiBaseURL)
	
	formData := url.Values{}
	formData.Set("grant_type", "password")
	formData.Set("username", config.Username)
	formData.Set("password", config.Password)
	
	req, err := http.NewRequest("POST", authURL, bytes.NewBufferString(formData.Encode()))
	if err != nil {
		return "", err
	}
	
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")
	
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("auth failed with status %d: %s", resp.StatusCode, string(body))
	}
	
	var authResp ZaptecAuthResponse
	if err := json.NewDecoder(resp.Body).Decode(&authResp); err != nil {
		return "", err
	}
	
	return authResp.AccessToken, nil
}

func getChargeHistoryDateRange(client *http.Client, apiBaseURL, token, chargerID string, startDate, endDate time.Time) ([]ZaptecChargeHistory, error) {
	var allSessions []ZaptecChargeHistory
	
	// Format dates for API (UTC)
	startStr := startDate.UTC().Format("2006-01-02T15:04:05Z")
	endStr := endDate.UTC().Format("2006-01-02T15:04:05Z")
	
	pageIndex := 0
	
	for {
		historyURL := fmt.Sprintf("%s/api/chargehistory?ChargerId=%s&From=%s&To=%s&PageIndex=%d&PageSize=100",
			apiBaseURL, chargerID, startStr, endStr, pageIndex)
		
		req, err := http.NewRequest("GET", historyURL, nil)
		if err != nil {
			return nil, err
		}
		
		req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", token))
		req.Header.Set("Accept", "application/json")
		
		resp, err := client.Do(req)
		if err != nil {
			return nil, err
		}
		defer resp.Body.Close()
		
		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			return nil, fmt.Errorf("status %d: %s", resp.StatusCode, string(body))
		}
		
		var apiResp ZaptecAPIResponse
		if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
			return nil, err
		}
		
		for _, dataItem := range apiResp.Data {
			var session ZaptecChargeHistory
			if err := json.Unmarshal(dataItem, &session); err == nil {
				allSessions = append(allSessions, session)
			}
		}
		
		pageIndex++
		if pageIndex >= apiResp.Pages {
			break
		}
	}
	
	return allSessions, nil
}

func parseSignedSession(history *ZaptecChargeHistory, chargerID int, chargerName string, localTZ *time.Location) (*CompletedSession, error) {
	if history.SignedSession == "" {
		return nil, fmt.Errorf("no SignedSession data")
	}
	
	parts := strings.SplitN(history.SignedSession, "|", 3)
	if len(parts) < 2 || parts[0] != "OCMF" {
		return nil, fmt.Errorf("invalid SignedSession format")
	}
	
	var ocmf OCMFData
	if err := json.Unmarshal([]byte(parts[1]), &ocmf); err != nil {
		return nil, fmt.Errorf("failed to parse OCMF JSON: %v", err)
	}
	
	if len(ocmf.ReadingData) == 0 {
		return nil, fmt.Errorf("no reading data in OCMF")
	}
	
	userID := history.UserID
	if ocmf.IdentificationData != "" {
		switch ocmf.IdentificationType {
		case "ISO14443":
			userID = "nfc-" + ocmf.IdentificationData
		case "ISO15693":
			userID = "rfid-" + ocmf.IdentificationData
		default:
			if ocmf.IdentificationData != "" {
				userID = "token-" + ocmf.IdentificationData
			}
		}
	}
	
	var readings []SessionMeterReading
	var startTime, endTime time.Time
	var startEnergy, endEnergy float64
	
	for _, rd := range ocmf.ReadingData {
		ts := parseOCMFTimestamp(rd.Timestamp, localTZ)
		if ts.IsZero() {
			continue
		}
		
		reading := SessionMeterReading{
			Timestamp:   ts,
			Energy_kWh:  rd.ReadingValue,
			ReadingType: rd.Type,
		}
		readings = append(readings, reading)
		
		switch rd.Type {
		case "B":
			startTime = ts
			startEnergy = rd.ReadingValue
		case "E":
			endTime = ts
			endEnergy = rd.ReadingValue
		}
	}
	
	totalEnergy := history.Energy
	if endEnergy > startEnergy {
		totalEnergy = endEnergy - startEnergy
	}
	
	if startTime.IsZero() {
		startTime = parseZaptecTime(history.StartDateTime, localTZ)
	}
	if endTime.IsZero() {
		endTime = parseZaptecTime(history.EndDateTime, localTZ)
	}
	
	return &CompletedSession{
		SessionID:       history.ID,
		ChargerID:       chargerID,
		ChargerName:     chargerName,
		UserID:          userID,
		UserName:        history.UserFullName,
		StartTime:       startTime,
		EndTime:         endTime,
		TotalEnergy_kWh: totalEnergy,
		MeterReadings:   readings,
	}, nil
}

func parseOCMFTimestamp(ts string, localTZ *time.Location) time.Time {
	if ts == "" {
		return time.Time{}
	}
	
	ts = strings.TrimSuffix(ts, " R")
	ts = strings.TrimSuffix(ts, " S")
	ts = strings.Replace(ts, ",", ".", 1)
	
	formats := []string{
		"2006-01-02T15:04:05.999-07:00",
		"2006-01-02T15:04:05.999Z07:00",
		"2006-01-02T15:04:05.999+00:00",
		"2006-01-02T15:04:05-07:00",
		"2006-01-02T15:04:05+00:00",
		"2006-01-02T15:04:05Z",
		time.RFC3339,
		time.RFC3339Nano,
	}
	
	for _, format := range formats {
		if t, err := time.Parse(format, ts); err == nil {
			return t.In(localTZ)
		}
	}
	
	return time.Time{}
}

func parseZaptecTime(timeStr string, localTZ *time.Location) time.Time {
	if timeStr == "" || timeStr == "0001-01-01T00:00:00" || timeStr == "0001-01-01T00:00:00Z" {
		return time.Time{}
	}
	
	formats := []string{
		time.RFC3339,
		time.RFC3339Nano,
		"2006-01-02T15:04:05.999",
		"2006-01-02T15:04:05",
		"2006-01-02T15:04:05.000",
		"2006-01-02T15:04:05+00:00",
		"2006-01-02T15:04:05Z",
	}
	
	for _, format := range formats {
		if t, err := time.Parse(format, timeStr); err == nil {
			return t.In(localTZ)
		}
	}
	
	return time.Time{}
}

func writeSessionToDatabase(db *sql.DB, session *CompletedSession) error {
	if len(session.MeterReadings) == 0 {
		return fmt.Errorf("no readings to write")
	}
	
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	
	stmt, err := tx.Prepare(`
		INSERT OR IGNORE INTO charger_sessions (charger_id, user_id, session_time, power_kwh, mode, state)
		VALUES (?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()
	
	for _, reading := range session.MeterReadings {
		localTimestamp := reading.Timestamp.Format("2006-01-02 15:04:05")
		
		_, err := stmt.Exec(
			session.ChargerID,
			session.UserID,
			localTimestamp,
			reading.Energy_kWh,
			"1",
			"3",
		)
		if err != nil {
			log.Printf("WARNING: Failed to insert reading: %v", err)
		}
	}
	
	return tx.Commit()
}

func writeSessionFallback(db *sql.DB, history *ZaptecChargeHistory, chargerID int, chargerName string, localTZ *time.Location) error {
	startTime := parseZaptecTime(history.StartDateTime, localTZ)
	endTime := parseZaptecTime(history.EndDateTime, localTZ)
	
	if startTime.IsZero() || endTime.IsZero() {
		return fmt.Errorf("invalid timestamps")
	}
	
	userID := history.UserID
	if userID == "" {
		userID = "unknown"
	}
	
	localStartTime := startTime.Format("2006-01-02 15:04:05")
	localEndTime := endTime.Format("2006-01-02 15:04:05")
	
	var baselineEnergy float64
	db.QueryRow(`
		SELECT power_kwh FROM charger_sessions 
		WHERE charger_id = ? 
		ORDER BY session_time DESC LIMIT 1
	`, chargerID).Scan(&baselineEnergy)
	
	startEnergy := baselineEnergy
	endEnergy := baselineEnergy + history.Energy
	
	_, err := db.Exec(`
		INSERT OR IGNORE INTO charger_sessions (charger_id, user_id, session_time, power_kwh, mode, state)
		VALUES (?, ?, ?, ?, ?, ?)
	`, chargerID, userID, localStartTime, startEnergy, "1", "3")
	
	if err != nil {
		return err
	}
	
	_, err = db.Exec(`
		INSERT OR IGNORE INTO charger_sessions (charger_id, user_id, session_time, power_kwh, mode, state)
		VALUES (?, ?, ?, ?, ?, ?)
	`, chargerID, userID, localEndTime, endEnergy, "1", "3")
	
	return err
}