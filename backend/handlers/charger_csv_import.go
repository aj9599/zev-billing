package handlers

import (
	"database/sql"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/mux"
)

// ImportChargerSessionsFromCSV handles CSV import for a specific charger
func (h *ChargerHandler) ImportChargerSessionsFromCSV(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	chargerID, err := strconv.Atoi(vars["id"])
	if err != nil {
		http.Error(w, "Invalid charger ID", http.StatusBadRequest)
		return
	}

	// Verify charger exists
	var exists bool
	var chargerName string
	err = h.db.QueryRow("SELECT name FROM chargers WHERE id = ?", chargerID).Scan(&chargerName)
	if err == sql.ErrNoRows {
		http.Error(w, "Charger not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Printf("Failed to verify charger: %v", err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	// Parse multipart form (10MB max)
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

	// Parse CSV
	reader := csv.NewReader(file)
	reader.TrimLeadingSpace = true

	// Read header
	header, err := reader.Read()
	if err != nil {
		http.Error(w, "Failed to read CSV header", http.StatusBadRequest)
		return
	}

	// Validate header format
	expectedHeaders := []string{"Charger ID", "Charger Name", "Brand", "Building", "Session Time", "User ID", "Power (kWh)", "Mode", "State"}
	if len(header) != len(expectedHeaders) {
		http.Error(w, fmt.Sprintf("Invalid CSV format. Expected %d columns, got %d", len(expectedHeaders), len(header)), http.StatusBadRequest)
		return
	}

	log.Printf("Starting CSV import for charger ID %d (%s)", chargerID, chargerName)

	// Start transaction
	tx, err := h.db.Begin()
	if err != nil {
		log.Printf("Failed to start transaction: %v", err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	// Delete existing sessions for this charger
	deleteResult, err := tx.Exec("DELETE FROM charger_sessions WHERE charger_id = ?", chargerID)
	if err != nil {
		log.Printf("Failed to delete existing sessions: %v", err)
		http.Error(w, "Failed to delete existing sessions", http.StatusInternalServerError)
		return
	}

	deletedCount, _ := deleteResult.RowsAffected()
	log.Printf("Deleted %d existing sessions for charger %d", deletedCount, chargerID)

	// Prepare insert statement
	stmt, err := tx.Prepare(`
		INSERT INTO charger_sessions (charger_id, user_id, session_time, power_kwh, mode, state)
		VALUES (?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		log.Printf("Failed to prepare insert statement: %v", err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer stmt.Close()

	processedCount := 0
	importedCount := 0
	errorCount := 0
	var firstError string

	// Read and process each row
	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			log.Printf("Error reading CSV row %d: %v", processedCount+1, err)
			errorCount++
			if firstError == "" {
				firstError = fmt.Sprintf("Row %d: %v", processedCount+1, err)
			}
			continue
		}

		processedCount++

		// Parse CSV fields
		if len(record) != 9 {
			log.Printf("Row %d: Invalid column count (expected 9, got %d)", processedCount, len(record))
			errorCount++
			if firstError == "" {
				firstError = fmt.Sprintf("Row %d: Invalid column count", processedCount)
			}
			continue
		}

		csvChargerID, err := strconv.Atoi(strings.TrimSpace(record[0]))
		if err != nil {
			log.Printf("Row %d: Invalid charger ID: %v", processedCount, err)
			errorCount++
			if firstError == "" {
				firstError = fmt.Sprintf("Row %d: Invalid charger ID", processedCount)
			}
			continue
		}

		// Only import sessions for the selected charger
		if csvChargerID != chargerID {
			continue
		}

		// Parse session time and convert format
		// CSV format: 2025-11-22T11:00:00+01:00
		// DB format:  2025-11-22 11:00:00+01:00
		sessionTimeStr := strings.TrimSpace(record[4])
		sessionTimeStr = strings.Replace(sessionTimeStr, "T", " ", 1)

		// Parse user_id (can be empty)
		userID := strings.TrimSpace(record[5])
		if userID == "" {
			userID = ""
		}

		// Parse power
		powerKWh, err := strconv.ParseFloat(strings.TrimSpace(record[6]), 64)
		if err != nil {
			log.Printf("Row %d: Invalid power value: %v", processedCount, err)
			errorCount++
			if firstError == "" {
				firstError = fmt.Sprintf("Row %d: Invalid power value", processedCount)
			}
			continue
		}

		// Parse mode and state
		mode := strings.TrimSpace(record[7])
		state := strings.TrimSpace(record[8])

		// Insert session
		_, err = stmt.Exec(chargerID, userID, sessionTimeStr, powerKWh, mode, state)
		if err != nil {
			log.Printf("Row %d: Failed to insert session: %v", processedCount, err)
			errorCount++
			if firstError == "" {
				firstError = fmt.Sprintf("Row %d: Database insert failed", processedCount)
			}
			continue
		}

		importedCount++

		// Log progress every 100 records
		if importedCount%100 == 0 {
			log.Printf("Imported %d sessions...", importedCount)
		}
	}

	// Commit transaction
	if err := tx.Commit(); err != nil {
		log.Printf("Failed to commit transaction: %v", err)
		http.Error(w, "Failed to commit import", http.StatusInternalServerError)
		return
	}

	log.Printf("CSV import completed for charger %d: Processed %d rows, Imported %d sessions, Errors: %d, Deleted: %d old sessions",
		chargerID, processedCount, importedCount, errorCount, deletedCount)

	// Return success response
	response := map[string]interface{}{
		"status":        "success",
		"charger_id":    chargerID,
		"charger_name":  chargerName,
		"processed":     processedCount,
		"imported":      importedCount,
		"errors":        errorCount,
		"deleted_count": deletedCount,
	}

	if firstError != "" {
		response["first_error"] = firstError
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// GetChargerSessions returns sessions for a specific charger
func (h *ChargerHandler) GetChargerSessions(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	chargerID, err := strconv.Atoi(vars["id"])
	if err != nil {
		http.Error(w, "Invalid charger ID", http.StatusBadRequest)
		return
	}

	// Get limit from query params (default 100)
	limitStr := r.URL.Query().Get("limit")
	limit := 100
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
		}
	}

	rows, err := h.db.Query(`
		SELECT id, charger_id, user_id, session_time, power_kwh, mode, state, created_at
		FROM charger_sessions
		WHERE charger_id = ?
		ORDER BY session_time DESC
		LIMIT ?
	`, chargerID, limit)
	if err != nil {
		log.Printf("Failed to fetch sessions: %v", err)
		http.Error(w, "Failed to fetch sessions", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type Session struct {
		ID          int       `json:"id"`
		ChargerID   int       `json:"charger_id"`
		UserID      string    `json:"user_id"`
		SessionTime time.Time `json:"session_time"`
		PowerKWh    float64   `json:"power_kwh"`
		Mode        string    `json:"mode"`
		State       string    `json:"state"`
		CreatedAt   time.Time `json:"created_at"`
	}

	var sessions []Session
	for rows.Next() {
		var s Session
		if err := rows.Scan(&s.ID, &s.ChargerID, &s.UserID, &s.SessionTime, &s.PowerKWh, &s.Mode, &s.State, &s.CreatedAt); err != nil {
			log.Printf("Failed to scan session: %v", err)
			continue
		}
		sessions = append(sessions, s)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(sessions)
}

// DeleteChargerSessions deletes all sessions for a specific charger
func (h *ChargerHandler) DeleteChargerSessions(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	chargerID, err := strconv.Atoi(vars["id"])
	if err != nil {
		http.Error(w, "Invalid charger ID", http.StatusBadRequest)
		return
	}

	// Verify charger exists
	var exists bool
	err = h.db.QueryRow("SELECT 1 FROM chargers WHERE id = ?", chargerID).Scan(&exists)
	if err == sql.ErrNoRows {
		http.Error(w, "Charger not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Printf("Failed to verify charger: %v", err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	result, err := h.db.Exec("DELETE FROM charger_sessions WHERE charger_id = ?", chargerID)
	if err != nil {
		log.Printf("Failed to delete sessions: %v", err)
		http.Error(w, "Failed to delete sessions", http.StatusInternalServerError)
		return
	}

	deletedCount, _ := result.RowsAffected()
	log.Printf("Deleted %d sessions for charger %d", deletedCount, chargerID)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":        "success",
		"deleted_count": deletedCount,
	})
}