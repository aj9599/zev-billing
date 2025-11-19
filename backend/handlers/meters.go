package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/aj9599/zev-billing/backend/models"
	"github.com/aj9599/zev-billing/backend/services"
	"github.com/gorilla/mux"
)

type MeterHandler struct {
	db            *sql.DB
	dataCollector *services.DataCollector
	restartMu     sync.Mutex  // Prevent concurrent restarts
}

func NewMeterHandler(db *sql.DB, dataCollector *services.DataCollector) *MeterHandler {
	return &MeterHandler{
		db:            db,
		dataCollector: dataCollector,
	}
}

// safeRestartCollectors ensures only one restart operation happens at a time
func (h *MeterHandler) safeRestartCollectors(reason string) {
	go func() {
		h.restartMu.Lock()
		defer h.restartMu.Unlock()
		
		log.Printf("%s, restarting collectors...", reason)
		h.dataCollector.RestartUDPListeners()
		log.Printf("Collectors restarted successfully")
	}()
}

func (h *MeterHandler) List(w http.ResponseWriter, r *http.Request) {
	buildingID := r.URL.Query().Get("building_id")
	includeArchived := r.URL.Query().Get("include_archived") == "true"

	query := `
		SELECT id, name, meter_type, building_id, user_id, apartment_unit,
		       connection_type, connection_config, device_type, notes, 
		       last_reading, last_reading_export, last_reading_time, 
		       is_active, is_archived, replaced_by_meter_id,
		       replaces_meter_id, replacement_date, replacement_notes,
		       created_at, updated_at
		FROM meters
	`

	var conditions []string
	var args []interface{}

	if !includeArchived {
		conditions = append(conditions, "is_archived = 0")
	}

	if buildingID != "" {
		conditions = append(conditions, "building_id = ?")
		args = append(args, buildingID)
	}

	if len(conditions) > 0 {
		query += " WHERE "
		for i, condition := range conditions {
			if i > 0 {
				query += " AND "
			}
			query += condition
		}
	}

	var rows *sql.Rows
	var err error

	if len(args) > 0 {
		rows, err = h.db.Query(query, args...)
	} else {
		rows, err = h.db.Query(query)
	}

	if err != nil {
		log.Printf("ERROR: Failed to query meters: %v", err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	meters := []models.Meter{}
	for rows.Next() {
		var m models.Meter
		var apartmentUnit, replacementNotes, deviceType sql.NullString
		var replacedBy, replaces sql.NullInt64
		var replacementDate sql.NullTime
		
		err := rows.Scan(
			&m.ID, &m.Name, &m.MeterType, &m.BuildingID, &m.UserID, &apartmentUnit,
			&m.ConnectionType, &m.ConnectionConfig, &deviceType, &m.Notes, 
			&m.LastReading, &m.LastReadingExport, &m.LastReadingTime, 
			&m.IsActive, &m.IsArchived, &replacedBy, &replaces,
			&replacementDate, &replacementNotes, &m.CreatedAt, &m.UpdatedAt,
		)
		if err != nil {
			log.Printf("ERROR: Failed to scan meter row: %v", err)
			continue
		}
		
		if apartmentUnit.Valid {
			m.ApartmentUnit = apartmentUnit.String
		}
		if deviceType.Valid {
			m.DeviceType = deviceType.String
		}
		if replacementNotes.Valid {
			m.ReplacementNotes = replacementNotes.String
		}
		if replacedBy.Valid {
			id := int(replacedBy.Int64)
			m.ReplacedByMeterID = &id
		}
		if replaces.Valid {
			id := int(replaces.Int64)
			m.ReplacesMetterID = &id
		}
		if replacementDate.Valid {
			m.ReplacementDate = &replacementDate.Time
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
	var apartmentUnit, replacementNotes, deviceType sql.NullString
	var replacedBy, replaces sql.NullInt64
	var replacementDate sql.NullTime
	
	err = h.db.QueryRow(`
		SELECT id, name, meter_type, building_id, user_id, apartment_unit,
		       connection_type, connection_config, device_type, notes, 
		       last_reading, last_reading_export, last_reading_time, 
		       is_active, is_archived, replaced_by_meter_id,
		       replaces_meter_id, replacement_date, replacement_notes,
		       created_at, updated_at
		FROM meters WHERE id = ?
	`, id).Scan(
		&m.ID, &m.Name, &m.MeterType, &m.BuildingID, &m.UserID, &apartmentUnit,
		&m.ConnectionType, &m.ConnectionConfig, &deviceType, &m.Notes, 
		&m.LastReading, &m.LastReadingExport, &m.LastReadingTime, 
		&m.IsActive, &m.IsArchived, &replacedBy, &replaces,
		&replacementDate, &replacementNotes, &m.CreatedAt, &m.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		http.Error(w, "Meter not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Printf("ERROR: Failed to get meter: %v", err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	if apartmentUnit.Valid {
		m.ApartmentUnit = apartmentUnit.String
	}
	if deviceType.Valid {
		m.DeviceType = deviceType.String
	}
	if replacementNotes.Valid {
		m.ReplacementNotes = replacementNotes.String
	}
	if replacedBy.Valid {
		id := int(replacedBy.Int64)
		m.ReplacedByMeterID = &id
	}
	if replaces.Valid {
		id := int(replaces.Int64)
		m.ReplacesMetterID = &id
	}
	if replacementDate.Valid {
		m.ReplacementDate = &replacementDate.Time
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

	// Default device_type to 'generic' if not specified
	if m.DeviceType == "" {
		m.DeviceType = "generic"
	}

	result, err := h.db.Exec(`
		INSERT INTO meters (
			name, meter_type, building_id, user_id, apartment_unit,
			connection_type, connection_config, device_type, notes, is_active
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, m.Name, m.MeterType, m.BuildingID, m.UserID, m.ApartmentUnit,
		m.ConnectionType, m.ConnectionConfig, m.DeviceType, m.Notes, m.IsActive)

	if err != nil {
		log.Printf("ERROR: Failed to create meter: %v", err)
		http.Error(w, "Failed to create meter", http.StatusInternalServerError)
		return
	}

	id, _ := result.LastInsertId()
	m.ID = int(id)

	// Restart collectors if needed
	if m.ConnectionType == "udp" || m.ConnectionType == "loxone_api" || m.ConnectionType == "mqtt" {
		h.safeRestartCollectors(fmt.Sprintf("New %s meter created (device type: %s)", m.ConnectionType, m.DeviceType))
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

	// Default device_type to 'generic' if not specified
	if m.DeviceType == "" {
		m.DeviceType = "generic"
	}

	_, err = h.db.Exec(`
		UPDATE meters SET
			name = ?, meter_type = ?, building_id = ?, user_id = ?, 
			apartment_unit = ?, connection_type = ?, connection_config = ?, 
			device_type = ?, notes = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, m.Name, m.MeterType, m.BuildingID, m.UserID, m.ApartmentUnit,
		m.ConnectionType, m.ConnectionConfig, m.DeviceType, m.Notes, m.IsActive, id)

	if err != nil {
		log.Printf("ERROR: Failed to update meter: %v", err)
		http.Error(w, "Failed to update meter", http.StatusInternalServerError)
		return
	}

	m.ID = id

	// Restart collectors if needed
	if m.ConnectionType == "udp" || m.ConnectionType == "loxone_api" || m.ConnectionType == "mqtt" {
		h.safeRestartCollectors(fmt.Sprintf("%s meter updated (device type: %s)", m.ConnectionType, m.DeviceType))
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(m)
}

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

	// Check if it's a UDP or Loxone API or MQTT meter before deletion
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

	// Delete meter replacement records (both as old and new meter)
	replacementResult, err := tx.Exec("DELETE FROM meter_replacements WHERE old_meter_id = ? OR new_meter_id = ?", id, id)
	if err != nil {
		log.Printf("Failed to delete meter replacements: %v", err)
		http.Error(w, "Failed to delete meter replacements", http.StatusInternalServerError)
		return
	}
	replacementRows, _ := replacementResult.RowsAffected()
	if replacementRows > 0 {
		log.Printf("Deleted %d meter replacement records for meter %d (%s)", replacementRows, id, meterName)
	}

	// Update any meters that reference this meter in replaced_by_meter_id or replaces_meter_id
	_, err = tx.Exec("UPDATE meters SET replaced_by_meter_id = NULL WHERE replaced_by_meter_id = ?", id)
	if err != nil {
		log.Printf("Failed to clear replaced_by_meter_id references: %v", err)
		http.Error(w, "Failed to clear meter references", http.StatusInternalServerError)
		return
	}
	
	_, err = tx.Exec("UPDATE meters SET replaces_meter_id = NULL WHERE replaces_meter_id = ?", id)
	if err != nil {
		log.Printf("Failed to clear replaces_meter_id references: %v", err)
		http.Error(w, "Failed to clear meter references", http.StatusInternalServerError)
		return
	}

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

	// Restart collectors if needed
	if connectionType == "udp" || connectionType == "loxone_api" || connectionType == "mqtt" {
		h.safeRestartCollectors(fmt.Sprintf("%s meter deleted", connectionType))
	}

	w.WriteHeader(http.StatusNoContent)
}

// =====================================================================
// NEW: Meter Replacement Endpoints
// =====================================================================

// ReplaceMeter handles the complete meter replacement process
func (h *MeterHandler) ReplaceMeter(w http.ResponseWriter, r *http.Request) {
	var req models.MeterReplacementRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	// Validate old meter exists and is active
	var oldMeter models.Meter
	var apartmentUnit, deviceType sql.NullString
	var userID sql.NullInt64
	
	err := h.db.QueryRow(`
		SELECT id, name, meter_type, building_id, user_id, apartment_unit,
		       connection_type, device_type, is_active, is_archived
		FROM meters WHERE id = ?
	`, req.OldMeterID).Scan(
		&oldMeter.ID, &oldMeter.Name, &oldMeter.MeterType, &oldMeter.BuildingID,
		&userID, &apartmentUnit, &oldMeter.ConnectionType,
		&deviceType, &oldMeter.IsActive, &oldMeter.IsArchived,
	)
	
	if userID.Valid {
		id := int(userID.Int64)
		oldMeter.UserID = &id
	}
	if apartmentUnit.Valid {
		oldMeter.ApartmentUnit = apartmentUnit.String
	}
	if deviceType.Valid {
		oldMeter.DeviceType = deviceType.String
	}

	if err == sql.ErrNoRows {
		http.Error(w, "Old meter not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Printf("ERROR: Failed to query old meter: %v", err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	if oldMeter.IsArchived {
		http.Error(w, "Cannot replace an already archived meter", http.StatusBadRequest)
		return
	}

	// Check if meter is already replaced
	var existingReplacement int
	err = h.db.QueryRow("SELECT id FROM meter_replacements WHERE old_meter_id = ?", req.OldMeterID).Scan(&existingReplacement)
	if err == nil {
		http.Error(w, "This meter has already been replaced", http.StatusBadRequest)
		return
	}

	// Calculate reading offset
	readingOffset := req.OldMeterFinalReading - req.NewMeterInitialReading

	// Start transaction
	tx, err := h.db.Begin()
	if err != nil {
		log.Printf("ERROR: Failed to start transaction: %v", err)
		http.Error(w, "Failed to start replacement transaction", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	// Create new meter
	var newMeterConfig string
	if req.CopySettings {
		// Use old meter's config if copying settings
		var oldConfig string
		tx.QueryRow("SELECT connection_config FROM meters WHERE id = ?", req.OldMeterID).Scan(&oldConfig)
		newMeterConfig = oldConfig
	} else {
		newMeterConfig = req.NewConnectionConfig
	}

	// Determine meter type, apartment, and device_type from old meter if copying
	meterType := req.NewMeterType
	apartmentUnitValue := oldMeter.ApartmentUnit
	buildingID := oldMeter.BuildingID
	deviceTypeValue := oldMeter.DeviceType // Copy device type from old meter
	
	// Prepare nullable values for insertion
	var userIDValue interface{}
	if oldMeter.UserID != nil {
		userIDValue = *oldMeter.UserID
	} else {
		userIDValue = nil
	}
	
	var apartmentUnitInsert interface{}
	if apartmentUnitValue != "" {
		apartmentUnitInsert = apartmentUnitValue
	} else {
		apartmentUnitInsert = nil
	}

	result, err := tx.Exec(`
		INSERT INTO meters (
			name, meter_type, building_id, user_id, apartment_unit,
			connection_type, connection_config, device_type, notes, is_active, is_archived,
			replaces_meter_id, last_reading
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)
	`, req.NewMeterName, meterType, buildingID, userIDValue, apartmentUnitInsert,
		req.NewConnectionType, newMeterConfig, deviceTypeValue,
		fmt.Sprintf("Replaces meter: %s", oldMeter.Name),
		req.OldMeterID, req.NewMeterInitialReading)

	if err != nil {
		log.Printf("ERROR: Failed to create new meter: %v", err)
		http.Error(w, "Failed to create new meter", http.StatusInternalServerError)
		return
	}

	newMeterID, _ := result.LastInsertId()

	// Parse replacement date
	replacementDate, err := time.Parse(time.RFC3339, req.ReplacementDate)
	if err != nil {
		replacementDate = time.Now()
	}

	// Archive old meter
	_, err = tx.Exec(`
		UPDATE meters SET
			is_active = 0,
			is_archived = 1,
			replaced_by_meter_id = ?,
			replacement_date = ?,
			replacement_notes = ?,
			last_reading = ?,
			updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, newMeterID, replacementDate, req.ReplacementNotes, req.OldMeterFinalReading, req.OldMeterID)

	if err != nil {
		log.Printf("ERROR: Failed to archive old meter: %v", err)
		http.Error(w, "Failed to archive old meter", http.StatusInternalServerError)
		return
	}

	// Create replacement record
	_, err = tx.Exec(`
		INSERT INTO meter_replacements (
			old_meter_id, new_meter_id, replacement_date,
			old_meter_final_reading, new_meter_initial_reading,
			reading_offset, notes, performed_by
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, req.OldMeterID, newMeterID, replacementDate,
		req.OldMeterFinalReading, req.NewMeterInitialReading,
		readingOffset, req.ReplacementNotes, "admin")

	if err != nil {
		log.Printf("ERROR: Failed to create replacement record: %v", err)
		http.Error(w, "Failed to create replacement record", http.StatusInternalServerError)
		return
	}

	// Commit transaction
	if err := tx.Commit(); err != nil {
		log.Printf("ERROR: Failed to commit replacement transaction: %v", err)
		http.Error(w, "Failed to commit replacement", http.StatusInternalServerError)
		return
	}

	// Log the replacement
	log.Printf("SUCCESS: Meter %d (%s) replaced by meter %d (%s). Offset: %.3f kWh",
		req.OldMeterID, oldMeter.Name, newMeterID, req.NewMeterName, readingOffset)

	// Restart collectors if connection type is affected
	if oldMeter.ConnectionType == "udp" || req.NewConnectionType == "udp" ||
		oldMeter.ConnectionType == "loxone_api" || req.NewConnectionType == "loxone_api" ||
		oldMeter.ConnectionType == "mqtt" || req.NewConnectionType == "mqtt" {
		h.safeRestartCollectors("Meter replacement completed")
	}

	// Get the newly created meter for response
	var newMeter models.Meter
	var newApartmentUnit, newDeviceType sql.NullString
	var newUserID, newReplacesID sql.NullInt64
	
	h.db.QueryRow(`
		SELECT id, name, meter_type, building_id, user_id, apartment_unit,
		       connection_type, connection_config, device_type, notes, last_reading,
		       is_active, is_archived, replaces_meter_id, created_at, updated_at
		FROM meters WHERE id = ?
	`, newMeterID).Scan(
		&newMeter.ID, &newMeter.Name, &newMeter.MeterType, &newMeter.BuildingID,
		&newUserID, &newApartmentUnit, &newMeter.ConnectionType,
		&newMeter.ConnectionConfig, &newDeviceType, &newMeter.Notes, &newMeter.LastReading,
		&newMeter.IsActive, &newMeter.IsArchived, &newReplacesID,
		&newMeter.CreatedAt, &newMeter.UpdatedAt,
	)
	
	if newUserID.Valid {
		id := int(newUserID.Int64)
		newMeter.UserID = &id
	}
	if newApartmentUnit.Valid {
		newMeter.ApartmentUnit = newApartmentUnit.String
	}
	if newDeviceType.Valid {
		newMeter.DeviceType = newDeviceType.String
	}
	if newReplacesID.Valid {
		id := int(newReplacesID.Int64)
		newMeter.ReplacesMetterID = &id
	}

	// Get updated old meter
	var oldReplacedBy sql.NullInt64
	var oldReplacementDate sql.NullTime
	var oldReplacementNotes sql.NullString
	
	h.db.QueryRow(`
		SELECT is_active, is_archived, replaced_by_meter_id, replacement_date, replacement_notes
		FROM meters WHERE id = ?
	`, req.OldMeterID).Scan(
		&oldMeter.IsActive, &oldMeter.IsArchived, &oldReplacedBy,
		&oldReplacementDate, &oldReplacementNotes,
	)
	
	if oldReplacedBy.Valid {
		id := int(oldReplacedBy.Int64)
		oldMeter.ReplacedByMeterID = &id
	}
	if oldReplacementDate.Valid {
		oldMeter.ReplacementDate = &oldReplacementDate.Time
	}
	if oldReplacementNotes.Valid {
		oldMeter.ReplacementNotes = oldReplacementNotes.String
	}

	// Get replacement record
	var replacement models.MeterReplacement
	var performedBy sql.NullString
	
	h.db.QueryRow(`
		SELECT id, old_meter_id, new_meter_id, replacement_date,
		       old_meter_final_reading, new_meter_initial_reading,
		       reading_offset, notes, performed_by, created_at
		FROM meter_replacements WHERE old_meter_id = ? AND new_meter_id = ?
	`, req.OldMeterID, newMeterID).Scan(
		&replacement.ID, &replacement.OldMeterID, &replacement.NewMeterID,
		&replacement.ReplacementDate, &replacement.OldMeterFinalReading,
		&replacement.NewMeterInitialReading, &replacement.ReadingOffset,
		&replacement.Notes, &performedBy, &replacement.CreatedAt,
	)
	
	if performedBy.Valid {
		replacement.PerformedBy = performedBy.String
	}

	response := map[string]interface{}{
		"replacement": replacement,
		"new_meter":   newMeter,
		"old_meter":   oldMeter,
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(response)
}

// GetReplacementHistory returns all replacements for a meter (as old or new)
func (h *MeterHandler) GetReplacementHistory(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, err := strconv.Atoi(vars["id"])
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	rows, err := h.db.Query(`
		SELECT id, old_meter_id, new_meter_id, replacement_date,
		       old_meter_final_reading, new_meter_initial_reading,
		       reading_offset, notes, performed_by, created_at
		FROM meter_replacements
		WHERE old_meter_id = ? OR new_meter_id = ?
		ORDER BY replacement_date DESC
	`, id, id)

	if err != nil {
		log.Printf("ERROR: Failed to query replacement history: %v", err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	replacements := []models.MeterReplacement{}
	for rows.Next() {
		var r models.MeterReplacement
		var performedBy sql.NullString
		
		err := rows.Scan(
			&r.ID, &r.OldMeterID, &r.NewMeterID, &r.ReplacementDate,
			&r.OldMeterFinalReading, &r.NewMeterInitialReading,
			&r.ReadingOffset, &r.Notes, &performedBy, &r.CreatedAt,
		)
		if err != nil {
			continue
		}
		
		if performedBy.Valid {
			r.PerformedBy = performedBy.String
		}
		
		replacements = append(replacements, r)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(replacements)
}

// GetReplacementChain returns the complete replacement chain for a meter
func (h *MeterHandler) GetReplacementChain(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, err := strconv.Atoi(vars["id"])
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	// Get current meter
	var currentMeter models.Meter
	err = h.db.QueryRow(`
		SELECT id, name, meter_type, building_id, is_active, is_archived,
		       replaced_by_meter_id, replaces_meter_id, replacement_date
		FROM meters WHERE id = ?
	`, id).Scan(
		&currentMeter.ID, &currentMeter.Name, &currentMeter.MeterType,
		&currentMeter.BuildingID, &currentMeter.IsActive, &currentMeter.IsArchived,
		&currentMeter.ReplacedByMeterID, &currentMeter.ReplacesMetterID,
		&currentMeter.ReplacementDate,
	)

	if err != nil {
		http.Error(w, "Meter not found", http.StatusNotFound)
		return
	}

	// Get predecessor meters (meters that this one replaced)
	predecessors := []models.Meter{}
	if currentMeter.ReplacesMetterID != nil {
		predecessorID := *currentMeter.ReplacesMetterID
		for predecessorID > 0 {
			var m models.Meter
			err := h.db.QueryRow(`
				SELECT id, name, meter_type, is_archived, replaced_by_meter_id,
				       replaces_meter_id, replacement_date
				FROM meters WHERE id = ?
			`, predecessorID).Scan(
				&m.ID, &m.Name, &m.MeterType, &m.IsArchived,
				&m.ReplacedByMeterID, &m.ReplacesMetterID, &m.ReplacementDate,
			)
			if err != nil {
				break
			}
			predecessors = append(predecessors, m)
			if m.ReplacesMetterID != nil {
				predecessorID = *m.ReplacesMetterID
			} else {
				break
			}
		}
	}

	// Get successor meters (meters that replaced this one)
	successors := []models.Meter{}
	if currentMeter.ReplacedByMeterID != nil {
		successorID := *currentMeter.ReplacedByMeterID
		for successorID > 0 {
			var m models.Meter
			err := h.db.QueryRow(`
				SELECT id, name, meter_type, is_active, replaced_by_meter_id,
				       replaces_meter_id, replacement_date
				FROM meters WHERE id = ?
			`, successorID).Scan(
				&m.ID, &m.Name, &m.MeterType, &m.IsActive,
				&m.ReplacedByMeterID, &m.ReplacesMetterID, &m.ReplacementDate,
			)
			if err != nil {
				break
			}
			successors = append(successors, m)
			if m.ReplacedByMeterID != nil {
				successorID = *m.ReplacedByMeterID
			} else {
				break
			}
		}
	}

	// Get all replacement records in the chain
	meterIDs := []int{id}
	for _, m := range predecessors {
		meterIDs = append(meterIDs, m.ID)
	}
	for _, m := range successors {
		meterIDs = append(meterIDs, m.ID)
	}

	replacements := []models.MeterReplacement{}
	for _, mID := range meterIDs {
		rows, err := h.db.Query(`
			SELECT id, old_meter_id, new_meter_id, replacement_date,
			       old_meter_final_reading, new_meter_initial_reading,
			       reading_offset, notes, created_at
			FROM meter_replacements
			WHERE old_meter_id = ? OR new_meter_id = ?
		`, mID, mID)
		
		if err != nil {
			continue
		}
		
		for rows.Next() {
			var r models.MeterReplacement
			rows.Scan(
				&r.ID, &r.OldMeterID, &r.NewMeterID, &r.ReplacementDate,
				&r.OldMeterFinalReading, &r.NewMeterInitialReading,
				&r.ReadingOffset, &r.Notes, &r.CreatedAt,
			)
			replacements = append(replacements, r)
		}
		rows.Close()
	}

	response := map[string]interface{}{
		"current_meter":      currentMeter,
		"predecessor_meters": predecessors,
		"successor_meters":   successors,
		"replacements":       replacements,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// GetArchivedMeters returns all archived meters
func (h *MeterHandler) GetArchivedMeters(w http.ResponseWriter, r *http.Request) {
	buildingID := r.URL.Query().Get("building_id")

	query := `
		SELECT id, name, meter_type, building_id, is_archived,
		       replaced_by_meter_id, replacement_date, replacement_notes
		FROM meters
		WHERE is_archived = 1
	`

	var rows *sql.Rows
	var err error

	if buildingID != "" {
		query += " AND building_id = ?"
		rows, err = h.db.Query(query, buildingID)
	} else {
		rows, err = h.db.Query(query)
	}

	if err != nil {
		log.Printf("ERROR: Failed to query archived meters: %v", err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	meters := []models.Meter{}
	for rows.Next() {
		var m models.Meter
		var replacedBy sql.NullInt64
		var replacementDate sql.NullTime
		var replacementNotes sql.NullString
		
		err := rows.Scan(
			&m.ID, &m.Name, &m.MeterType, &m.BuildingID, &m.IsArchived,
			&replacedBy, &replacementDate, &replacementNotes,
		)
		if err != nil {
			continue
		}
		
		if replacedBy.Valid {
			id := int(replacedBy.Int64)
			m.ReplacedByMeterID = &id
		}
		if replacementDate.Valid {
			m.ReplacementDate = &replacementDate.Time
		}
		if replacementNotes.Valid {
			m.ReplacementNotes = replacementNotes.String
		}
		
		meters = append(meters, m)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(meters)
}
// TestSmartMeConnectionRequest represents the request for testing Smart-me connection
type TestSmartMeConnectionRequest struct {
	AuthType     string `json:"auth_type"`
	DeviceID     string `json:"device_id"`
	Username     string `json:"username,omitempty"`
	Password     string `json:"password,omitempty"`
	APIKey       string `json:"api_key,omitempty"`
	ClientID     string `json:"client_id,omitempty"`
	ClientSecret string `json:"client_secret,omitempty"`
}

// TestSmartMeConnection tests a Smart-me configuration without saving it
func (h *MeterHandler) TestSmartMeConnection(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req TestSmartMeConnectionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondWithError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	// Validate required fields
	if req.DeviceID == "" {
		respondWithError(w, http.StatusBadRequest, "device_id is required")
		return
	}

	if req.AuthType == "" {
		req.AuthType = "apikey" // Default to API key
	}

	// Build config map
	config := map[string]interface{}{
		"auth_type": req.AuthType,
		"device_id": req.DeviceID,
	}

	// Add auth-specific fields
	switch req.AuthType {
	case "basic":
		if req.Username == "" || req.Password == "" {
			respondWithError(w, http.StatusBadRequest, "username and password are required for basic authentication")
			return
		}
		config["username"] = req.Username
		config["password"] = req.Password
		
	case "apikey":
		if req.APIKey == "" {
			respondWithError(w, http.StatusBadRequest, "api_key is required for API key authentication")
			return
		}
		config["api_key"] = req.APIKey
		
	case "oauth":
		if req.ClientID == "" || req.ClientSecret == "" {
			respondWithError(w, http.StatusBadRequest, "client_id and client_secret are required for OAuth authentication")
			return
		}
		config["client_id"] = req.ClientID
		config["client_secret"] = req.ClientSecret
		
	default:
		respondWithError(w, http.StatusBadRequest, fmt.Sprintf("invalid auth_type: %s (must be 'basic', 'apikey', or 'oauth')", req.AuthType))
		return
	}

	// Get Smart-me collector
	smartmeCollector := h.dataCollector.GetSmartMeCollector()
	if smartmeCollector == nil {
		respondWithError(w, http.StatusInternalServerError, "Smart-me collector not available")
		return
	}

	// Test the connection
	log.Printf("Testing Smart-me connection for device: %s (auth type: %s)", req.DeviceID, req.AuthType)
	if err := smartmeCollector.TestConnection(config); err != nil {
		log.Printf("Smart-me connection test failed: %v", err)
		respondWithError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Success response
	log.Printf("Smart-me connection test successful for device: %s", req.DeviceID)
	respondWithJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": "Connection test successful - device is reachable and authentication works",
	})
}

// Helper functions for JSON responses
func respondWithError(w http.ResponseWriter, code int, message string) {
	respondWithJSON(w, code, map[string]string{"error": message})
}

func respondWithJSON(w http.ResponseWriter, code int, payload interface{}) {
	response, _ := json.Marshal(payload)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	w.Write(response)
}