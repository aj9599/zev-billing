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
		SELECT id, name, meter_type, building_id, user_id, apartment_unit,
		       connection_type, connection_config, notes, last_reading, 
		       last_reading_time, is_active, created_at, updated_at
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
		var apartmentUnit sql.NullString
		
		err := rows.Scan(
			&m.ID, &m.Name, &m.MeterType, &m.BuildingID, &m.UserID, &apartmentUnit,
			&m.ConnectionType, &m.ConnectionConfig, &m.Notes, &m.LastReading, 
			&m.LastReadingTime, &m.IsActive, &m.CreatedAt, &m.UpdatedAt,
		)
		if err != nil {
			continue
		}
		
		if apartmentUnit.Valid {
			m.ApartmentUnit = apartmentUnit.String
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
	var apartmentUnit sql.NullString
	
	err = h.db.QueryRow(`
		SELECT id, name, meter_type, building_id, user_id, apartment_unit,
		       connection_type, connection_config, notes, last_reading, 
		       last_reading_time, is_active, created_at, updated_at
		FROM meters WHERE id = ?
	`, id).Scan(
		&m.ID, &m.Name, &m.MeterType, &m.BuildingID, &m.UserID, &apartmentUnit,
		&m.ConnectionType, &m.ConnectionConfig, &m.Notes, &m.LastReading, 
		&m.LastReadingTime, &m.IsActive, &m.CreatedAt, &m.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		http.Error(w, "Meter not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	if apartmentUnit.Valid {
		m.ApartmentUnit = apartmentUnit.String
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
			name, meter_type, building_id, user_id, apartment_unit,
			connection_type, connection_config, notes, is_active
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, m.Name, m.MeterType, m.BuildingID, m.UserID, m.ApartmentUnit,
		m.ConnectionType, m.ConnectionConfig, m.Notes, m.IsActive)

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
	
	// If it's a Loxone API meter, restart Loxone connections
	if m.ConnectionType == "loxone_api" {
		log.Printf("New Loxone API meter created, restarting Loxone connections...")
		go h.dataCollector.RestartUDPListeners() // This also restarts Loxone connections
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
			apartment_unit = ?, connection_type = ?, connection_config = ?, 
			notes = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, m.Name, m.MeterType, m.BuildingID, m.UserID, m.ApartmentUnit,
		m.ConnectionType, m.ConnectionConfig, m.Notes, m.IsActive, id)

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
	
	// If it's a Loxone API meter, restart Loxone connections
	if m.ConnectionType == "loxone_api" {
		log.Printf("Loxone API meter updated, restarting Loxone connections...")
		go h.dataCollector.RestartUDPListeners() // This also restarts Loxone connections
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(m)
}

// GetDeletionImpact returns information about what will be deleted
func (h *MeterHandler) GetDeletionImpact(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, err := strconv.Atoi(vars["id"])
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	// Get meter info
	var meterName string
	err = h.db.QueryRow("SELECT name FROM meters WHERE id = ?", id).Scan(&meterName)
	if err == sql.ErrNoRows {
		http.Error(w, "Meter not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	// Count meter readings
	var readingsCount int
	err = h.db.QueryRow("SELECT COUNT(*) FROM meter_readings WHERE meter_id = ?", id).Scan(&readingsCount)
	if err != nil {
		readingsCount = 0
	}

	// Get date range of readings
	var oldestReading, newestReading sql.NullString
	h.db.QueryRow(`
		SELECT MIN(reading_time), MAX(reading_time) 
		FROM meter_readings 
		WHERE meter_id = ?
	`, id).Scan(&oldestReading, &newestReading)

	impact := map[string]interface{}{
		"meter_id":        id,
		"meter_name":      meterName,
		"readings_count":  readingsCount,
		"oldest_reading":  oldestReading.String,
		"newest_reading":  newestReading.String,
		"has_data":        readingsCount > 0,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(impact)
}

func (h *MeterHandler) Delete(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, err := strconv.Atoi(vars["id"])
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	// Check if it's a UDP or Loxone API meter before deletion
	var connectionType, meterName string
	err = h.db.QueryRow("SELECT connection_type, name FROM meters WHERE id = ?", id).Scan(&connectionType, &meterName)
	if err == sql.ErrNoRows {
		http.Error(w, "Meter not found", http.StatusNotFound)
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

	// Delete all meter readings first
	result, err := tx.Exec("DELETE FROM meter_readings WHERE meter_id = ?", id)
	if err != nil {
		log.Printf("Failed to delete meter readings: %v", err)
		http.Error(w, "Failed to delete meter readings", http.StatusInternalServerError)
		return
	}
	rowsAffected, _ := result.RowsAffected()
	log.Printf("Deleted %d meter readings for meter %d (%s)", rowsAffected, id, meterName)

	// Delete the meter
	_, err = tx.Exec("DELETE FROM meters WHERE id = ?", id)
	if err != nil {
		log.Printf("Failed to delete meter: %v", err)
		http.Error(w, "Failed to delete meter", http.StatusInternalServerError)
		return
	}

	// Commit the transaction
	if err := tx.Commit(); err != nil {
		log.Printf("Failed to commit transaction: %v", err)
		http.Error(w, "Failed to commit deletion", http.StatusInternalServerError)
		return
	}

	log.Printf("Successfully deleted meter %d (%s) and %d readings", id, meterName, rowsAffected)

	// If it was a UDP meter, restart UDP listeners
	if connectionType == "udp" {
		log.Printf("UDP meter deleted, restarting UDP listeners...")
		go h.dataCollector.RestartUDPListeners()
	}
	
	// If it was a Loxone API meter, restart Loxone connections
	if connectionType == "loxone_api" {
		log.Printf("Loxone API meter deleted, restarting Loxone connections...")
		go h.dataCollector.RestartUDPListeners() // This also restarts Loxone connections
	}

	w.WriteHeader(http.StatusNoContent)
}