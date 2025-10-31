package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"github.com/aj9599/zev-billing/backend/models"
	"github.com/aj9599/zev-billing/backend/services"
	"github.com/gorilla/mux"
)

type ChargerHandler struct {
	db            *sql.DB
	dataCollector *services.DataCollector
}

func NewChargerHandler(db *sql.DB, dataCollector *services.DataCollector) *ChargerHandler {
	return &ChargerHandler{
		db:            db,
		dataCollector: dataCollector,
	}
}

func (h *ChargerHandler) List(w http.ResponseWriter, r *http.Request) {
	buildingID := r.URL.Query().Get("building_id")

	query := `
		SELECT id, name, brand, preset, building_id, connection_type, 
		       connection_config, supports_priority, notes, is_active,
		       created_at, updated_at
		FROM chargers
	`

	var rows *sql.Rows
	var err error

	if buildingID != "" {
		query += " WHERE building_id = ?"
		rows, err = h.db.Query(query, buildingID)
	} else {
		rows, err = h.db.Query(query)
	}

	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	chargers := []models.Charger{}
	for rows.Next() {
		var c models.Charger
		err := rows.Scan(
			&c.ID, &c.Name, &c.Brand, &c.Preset, &c.BuildingID, &c.ConnectionType,
			&c.ConnectionConfig, &c.SupportsPriority, &c.Notes, &c.IsActive,
			&c.CreatedAt, &c.UpdatedAt,
		)
		if err != nil {
			continue
		}
		chargers = append(chargers, c)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(chargers)
}

func (h *ChargerHandler) Get(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, err := strconv.Atoi(vars["id"])
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	var c models.Charger
	err = h.db.QueryRow(`
		SELECT id, name, brand, preset, building_id, connection_type, 
		       connection_config, supports_priority, notes, is_active,
		       created_at, updated_at
		FROM chargers WHERE id = ?
	`, id).Scan(
		&c.ID, &c.Name, &c.Brand, &c.Preset, &c.BuildingID, &c.ConnectionType,
		&c.ConnectionConfig, &c.SupportsPriority, &c.Notes, &c.IsActive,
		&c.CreatedAt, &c.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		http.Error(w, "Charger not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(c)
}

func (h *ChargerHandler) Create(w http.ResponseWriter, r *http.Request) {
	var c models.Charger
	if err := json.NewDecoder(r.Body).Decode(&c); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	result, err := h.db.Exec(`
		INSERT INTO chargers (
			name, brand, preset, building_id, connection_type, 
			connection_config, supports_priority, notes, is_active
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, c.Name, c.Brand, c.Preset, c.BuildingID, c.ConnectionType,
		c.ConnectionConfig, c.SupportsPriority, c.Notes, c.IsActive)

	if err != nil {
		http.Error(w, "Failed to create charger", http.StatusInternalServerError)
		return
	}

	id, _ := result.LastInsertId()
	c.ID = int(id)

	// If it's a UDP charger, restart UDP listeners
	if c.ConnectionType == "udp" {
		log.Printf("New UDP charger created, restarting UDP listeners...")
		go h.dataCollector.RestartUDPListeners()
	}
	
	// If it's a Loxone API charger, restart Loxone connections
	if c.ConnectionType == "loxone_api" {
		log.Printf("New Loxone API charger created, restarting Loxone connections...")
		go h.dataCollector.RestartUDPListeners() // This also restarts Loxone connections
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(c)
}

func (h *ChargerHandler) Update(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, err := strconv.Atoi(vars["id"])
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	var c models.Charger
	if err := json.NewDecoder(r.Body).Decode(&c); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	_, err = h.db.Exec(`
		UPDATE chargers SET
			name = ?, brand = ?, preset = ?, building_id = ?, 
			connection_type = ?, connection_config = ?, 
			supports_priority = ?, notes = ?, is_active = ?,
			updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, c.Name, c.Brand, c.Preset, c.BuildingID, c.ConnectionType,
		c.ConnectionConfig, c.SupportsPriority, c.Notes, c.IsActive, id)

	if err != nil {
		http.Error(w, "Failed to update charger", http.StatusInternalServerError)
		return
	}

	c.ID = id

	// If it's a UDP charger, restart UDP listeners
	if c.ConnectionType == "udp" {
		log.Printf("UDP charger updated, restarting UDP listeners...")
		go h.dataCollector.RestartUDPListeners()
	}
	
	// If it's a Loxone API charger, restart Loxone connections
	if c.ConnectionType == "loxone_api" {
		log.Printf("Loxone API charger updated, restarting Loxone connections...")
		go h.dataCollector.RestartUDPListeners() // This also restarts Loxone connections
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(c)
}

// GetDeletionImpact returns information about what will be deleted
func (h *ChargerHandler) GetDeletionImpact(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, err := strconv.Atoi(vars["id"])
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	// Get charger info
	var chargerName string
	err = h.db.QueryRow("SELECT name FROM chargers WHERE id = ?", id).Scan(&chargerName)
	if err == sql.ErrNoRows {
		http.Error(w, "Charger not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	// Count charger sessions
	var sessionsCount int
	err = h.db.QueryRow("SELECT COUNT(*) FROM charger_sessions WHERE charger_id = ?", id).Scan(&sessionsCount)
	if err != nil {
		sessionsCount = 0
	}

	// Get date range of sessions
	var oldestSession, newestSession sql.NullString
	h.db.QueryRow(`
		SELECT MIN(session_time), MAX(session_time) 
		FROM charger_sessions 
		WHERE charger_id = ?
	`, id).Scan(&oldestSession, &newestSession)

	impact := map[string]interface{}{
		"charger_id":      id,
		"charger_name":    chargerName,
		"sessions_count":  sessionsCount,
		"oldest_session":  oldestSession.String,
		"newest_session":  newestSession.String,
		"has_data":        sessionsCount > 0,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(impact)
}

func (h *ChargerHandler) Delete(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, err := strconv.Atoi(vars["id"])
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	// Check if it's a UDP or Loxone API charger before deletion
	var connectionType, chargerName string
	err = h.db.QueryRow("SELECT connection_type, name FROM chargers WHERE id = ?", id).Scan(&connectionType, &chargerName)
	if err == sql.ErrNoRows {
		http.Error(w, "Charger not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	// Start a transaction for cascade deletion
	tx, err := h.db.Begin()
	if err != nil {
		log.Printf("Failed to start transaction: %v", err)
		http.Error(w, "Failed to start deletion", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	// Delete all charger sessions first
	result, err := tx.Exec("DELETE FROM charger_sessions WHERE charger_id = ?", id)
	if err != nil {
		log.Printf("Failed to delete charger sessions: %v", err)
		http.Error(w, "Failed to delete charger sessions", http.StatusInternalServerError)
		return
	}
	rowsAffected, _ := result.RowsAffected()
	log.Printf("Deleted %d charger sessions for charger %d (%s)", rowsAffected, id, chargerName)

	// Delete the charger
	_, err = tx.Exec("DELETE FROM chargers WHERE id = ?", id)
	if err != nil {
		log.Printf("Failed to delete charger: %v", err)
		http.Error(w, "Failed to delete charger", http.StatusInternalServerError)
		return
	}

	// Commit the transaction
	if err := tx.Commit(); err != nil {
		log.Printf("Failed to commit transaction: %v", err)
		http.Error(w, "Failed to commit deletion", http.StatusInternalServerError)
		return
	}

	log.Printf("Successfully deleted charger %d (%s) and %d sessions", id, chargerName, rowsAffected)

	// If it was a UDP charger, restart UDP listeners
	if connectionType == "udp" {
		log.Printf("UDP charger deleted, restarting UDP listeners...")
		go h.dataCollector.RestartUDPListeners()
	}
	
	// If it was a Loxone API charger, restart Loxone connections
	if connectionType == "loxone_api" {
		log.Printf("Loxone API charger deleted, restarting Loxone connections...")
		go h.dataCollector.RestartUDPListeners() // This also restarts Loxone connections
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *ChargerHandler) GetLatestSessions(w http.ResponseWriter, r *http.Request) {
	// Query to get the latest session for each charger
	query := `
		SELECT 
			cs.charger_id,
			cs.power_kwh,
			cs.state,
			cs.mode,
			cs.session_time
		FROM charger_sessions cs
		INNER JOIN (
			SELECT charger_id, MAX(session_time) as max_time
			FROM charger_sessions
			WHERE session_time >= datetime('now', '-1 hour')
			GROUP BY charger_id
		) latest ON cs.charger_id = latest.charger_id AND cs.session_time = latest.max_time
		WHERE EXISTS (
			SELECT 1 FROM chargers c 
			WHERE c.id = cs.charger_id AND c.is_active = 1
		)
	`

	rows, err := h.db.Query(query)
	if err != nil {
		log.Printf("Error querying latest charger sessions: %v", err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type LatestSession struct {
		ChargerID   int     `json:"charger_id"`
		PowerKWh    float64 `json:"power_kwh"`
		State       string  `json:"state"`
		Mode        string  `json:"mode"`
		SessionTime string  `json:"session_time"`
	}

	sessions := []LatestSession{}
	for rows.Next() {
		var s LatestSession
		err := rows.Scan(
			&s.ChargerID,
			&s.PowerKWh,
			&s.State,
			&s.Mode,
			&s.SessionTime,
		)
		if err != nil {
			log.Printf("Error scanning charger session: %v", err)
			continue
		}
		sessions = append(sessions, s)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(sessions)
}