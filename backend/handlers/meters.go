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

type MeterHandler struct {
	db            *sql.DB
	dataCollector *services.DataCollector
}

func NewMeterHandler(db *sql.DB, dataCollector *services.DataCollector) *MeterHandler {
	return &MeterHandler{
		db:            db,
		dataCollector: dataCollector,
	}
}

func (h *MeterHandler) List(w http.ResponseWriter, r *http.Request) {
	buildingID := r.URL.Query().Get("building_id")

	query := `
		SELECT id, name, meter_type, building_id, user_id, connection_type, 
		       connection_config, notes, last_reading, last_reading_time,
		       is_active, created_at, updated_at
		FROM meters
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

	meters := []models.Meter{}
	for rows.Next() {
		var m models.Meter
		err := rows.Scan(
			&m.ID, &m.Name, &m.MeterType, &m.BuildingID, &m.UserID, &m.ConnectionType,
			&m.ConnectionConfig, &m.Notes, &m.LastReading, &m.LastReadingTime,
			&m.IsActive, &m.CreatedAt, &m.UpdatedAt,
		)
		if err != nil {
			continue
		}
		meters = append(meters, m)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(meters)
}

func (h *MeterHandler) Get(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, err := strconv.Atoi(vars["id"])
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	var m models.Meter
	err = h.db.QueryRow(`
		SELECT id, name, meter_type, building_id, user_id, connection_type, 
		       connection_config, notes, last_reading, last_reading_time,
		       is_active, created_at, updated_at
		FROM meters WHERE id = ?
	`, id).Scan(
		&m.ID, &m.Name, &m.MeterType, &m.BuildingID, &m.UserID, &m.ConnectionType,
		&m.ConnectionConfig, &m.Notes, &m.LastReading, &m.LastReadingTime,
		&m.IsActive, &m.CreatedAt, &m.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		http.Error(w, "Meter not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(m)
}

func (h *MeterHandler) Create(w http.ResponseWriter, r *http.Request) {
	var m models.Meter
	if err := json.NewDecoder(r.Body).Decode(&m); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	result, err := h.db.Exec(`
		INSERT INTO meters (
			name, meter_type, building_id, user_id, connection_type, 
			connection_config, notes, is_active
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, m.Name, m.MeterType, m.BuildingID, m.UserID, m.ConnectionType,
		m.ConnectionConfig, m.Notes, m.IsActive)

	if err != nil {
		http.Error(w, "Failed to create meter", http.StatusInternalServerError)
		return
	}

	id, _ := result.LastInsertId()
	m.ID = int(id)

	// If it's a UDP meter, restart UDP listeners
	if m.ConnectionType == "udp" {
		log.Printf("New UDP meter created, restarting UDP listeners...")
		go h.dataCollector.RestartUDPListeners()
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(m)
}

func (h *MeterHandler) Update(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, err := strconv.Atoi(vars["id"])
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	var m models.Meter
	if err := json.NewDecoder(r.Body).Decode(&m); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	_, err = h.db.Exec(`
		UPDATE meters SET
			name = ?, meter_type = ?, building_id = ?, user_id = ?, 
			connection_type = ?, connection_config = ?, notes = ?,
			is_active = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, m.Name, m.MeterType, m.BuildingID, m.UserID, m.ConnectionType,
		m.ConnectionConfig, m.Notes, m.IsActive, id)

	if err != nil {
		http.Error(w, "Failed to update meter", http.StatusInternalServerError)
		return
	}

	m.ID = id

	// If it's a UDP meter, restart UDP listeners
	if m.ConnectionType == "udp" {
		log.Printf("UDP meter updated, restarting UDP listeners...")
		go h.dataCollector.RestartUDPListeners()
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(m)
}

func (h *MeterHandler) Delete(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, err := strconv.Atoi(vars["id"])
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	// Check if it's a UDP meter
	var connectionType string
	h.db.QueryRow("SELECT connection_type FROM meters WHERE id = ?", id).Scan(&connectionType)

	_, err = h.db.Exec("DELETE FROM meters WHERE id = ?", id)
	if err != nil {
		http.Error(w, "Failed to delete meter", http.StatusInternalServerError)
		return
	}

	// If it was a UDP meter, restart UDP listeners
	if connectionType == "udp" {
		log.Printf("UDP meter deleted, restarting UDP listeners...")
		go h.dataCollector.RestartUDPListeners()
	}

	w.WriteHeader(http.StatusNoContent)
}