package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"github.com/gorilla/mux"
)

type SharedMeterHandler struct {
	db *sql.DB
}

func NewSharedMeterHandler(db *sql.DB) *SharedMeterHandler {
	return &SharedMeterHandler{db: db}
}

type SharedMeterConfig struct {
	ID         int     `json:"id"`
	MeterID    int     `json:"meter_id"`
	BuildingID int     `json:"building_id"`
	MeterName  string  `json:"meter_name"`
	SplitType  string  `json:"split_type"`
	UnitPrice  float64 `json:"unit_price"`
	// PricingMode controls how the meter's consumption is priced before it is
	// split among units:
	//   single              – flat UnitPrice per kWh (legacy behaviour)
	//   solar_grid_custom    – proportional solar/grid split priced with SolarPrice/GridPrice
	//   solar_grid_pricing   – proportional solar/grid split priced from the building pricing config
	PricingMode string  `json:"pricing_mode"`
	SolarPrice  float64 `json:"solar_price"`
	GridPrice   float64 `json:"grid_price"`
	CreatedAt   string  `json:"created_at"`
	UpdatedAt   string  `json:"updated_at"`
}

// validPricingMode reports whether m is one of the supported pricing modes.
// An empty value is treated as "single" for backward compatibility.
func validPricingMode(m string) bool {
	switch m {
	case "", "single", "solar_grid_custom", "solar_grid_pricing":
		return true
	default:
		return false
	}
}

func (h *SharedMeterHandler) List(w http.ResponseWriter, r *http.Request) {
	buildingID := r.URL.Query().Get("building_id")

	query := `
		SELECT id, meter_id, building_id, meter_name, split_type, unit_price,
		       pricing_mode, solar_price, grid_price, created_at, updated_at
		FROM shared_meter_configs
		WHERE 1=1
	`
	args := []interface{}{}

	if buildingID != "" {
		query += " AND building_id = ?"
		args = append(args, buildingID)
	}

	query += " ORDER BY building_id, meter_name"

	rows, err := h.db.Query(query, args...)
	if err != nil {
		log.Printf("ERROR: Failed to query shared meter configs: %v", err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	configs := []SharedMeterConfig{}
	for rows.Next() {
		var c SharedMeterConfig
		err := rows.Scan(
			&c.ID, &c.MeterID, &c.BuildingID, &c.MeterName,
			&c.SplitType, &c.UnitPrice, &c.PricingMode, &c.SolarPrice, &c.GridPrice,
			&c.CreatedAt, &c.UpdatedAt,
		)
		if err == nil {
			configs = append(configs, c)
		}
	}

	log.Printf("Found %d shared meter configs", len(configs))

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(configs)
}

func (h *SharedMeterHandler) Get(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, err := strconv.Atoi(vars["id"])
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	var c SharedMeterConfig
	err = h.db.QueryRow(`
		SELECT id, meter_id, building_id, meter_name, split_type, unit_price,
		       pricing_mode, solar_price, grid_price, created_at, updated_at
		FROM shared_meter_configs
		WHERE id = ?
	`, id).Scan(
		&c.ID, &c.MeterID, &c.BuildingID, &c.MeterName,
		&c.SplitType, &c.UnitPrice, &c.PricingMode, &c.SolarPrice, &c.GridPrice,
		&c.CreatedAt, &c.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		http.Error(w, "Shared meter config not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Printf("ERROR: Failed to query shared meter config: %v", err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(c)
}

func (h *SharedMeterHandler) Create(w http.ResponseWriter, r *http.Request) {
	var c SharedMeterConfig
	if err := json.NewDecoder(r.Body).Decode(&c); err != nil {
		log.Printf("ERROR: Failed to decode shared meter config: %v", err)
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	// Validate split type
	if c.SplitType != "equal" && c.SplitType != "by_area" && c.SplitType != "by_units" && c.SplitType != "custom" {
		http.Error(w, "Invalid split_type. Must be: equal, by_area, by_units, or custom", http.StatusBadRequest)
		return
	}

	// Validate pricing mode
	if !validPricingMode(c.PricingMode) {
		http.Error(w, "Invalid pricing_mode. Must be: single, solar_grid_custom, or solar_grid_pricing", http.StatusBadRequest)
		return
	}
	if c.PricingMode == "" {
		c.PricingMode = "single"
	}

	// Get meter name if not provided
	if c.MeterName == "" && c.MeterID > 0 {
		var meterName string
		err := h.db.QueryRow("SELECT name FROM meters WHERE id = ?", c.MeterID).Scan(&meterName)
		if err == nil {
			c.MeterName = meterName
		}
	}

	result, err := h.db.Exec(`
		INSERT INTO shared_meter_configs (
			meter_id, building_id, meter_name, split_type, unit_price,
			pricing_mode, solar_price, grid_price
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, c.MeterID, c.BuildingID, c.MeterName, c.SplitType, c.UnitPrice,
		c.PricingMode, c.SolarPrice, c.GridPrice)

	if err != nil {
		log.Printf("ERROR: Failed to create shared meter config: %v", err)
		http.Error(w, "Failed to create config", http.StatusInternalServerError)
		return
	}

	id, _ := result.LastInsertId()
	c.ID = int(id)

	// Also mark the meter as shared
	if c.MeterID > 0 {
		_, err = h.db.Exec("UPDATE meters SET is_shared = 1 WHERE id = ?", c.MeterID)
		if err != nil {
			log.Printf("WARNING: Failed to mark meter as shared: %v", err)
		}
	}

	log.Printf("SUCCESS: Created shared meter config ID %d for meter %d (building %d)", c.ID, c.MeterID, c.BuildingID)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(c)
}

func (h *SharedMeterHandler) Update(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, err := strconv.Atoi(vars["id"])
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	var c SharedMeterConfig
	if err := json.NewDecoder(r.Body).Decode(&c); err != nil {
		log.Printf("ERROR: Failed to decode shared meter config: %v", err)
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	// Validate split type
	if c.SplitType != "equal" && c.SplitType != "by_area" && c.SplitType != "by_units" && c.SplitType != "custom" {
		http.Error(w, "Invalid split_type. Must be: equal, by_area, by_units, or custom", http.StatusBadRequest)
		return
	}

	// Validate pricing mode
	if !validPricingMode(c.PricingMode) {
		http.Error(w, "Invalid pricing_mode. Must be: single, solar_grid_custom, or solar_grid_pricing", http.StatusBadRequest)
		return
	}
	if c.PricingMode == "" {
		c.PricingMode = "single"
	}

	_, err = h.db.Exec(`
		UPDATE shared_meter_configs SET
			meter_id = ?, building_id = ?, meter_name = ?,
			split_type = ?, unit_price = ?, pricing_mode = ?, solar_price = ?, grid_price = ?,
			updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, c.MeterID, c.BuildingID, c.MeterName, c.SplitType, c.UnitPrice,
		c.PricingMode, c.SolarPrice, c.GridPrice, id)

	if err != nil {
		log.Printf("ERROR: Failed to update shared meter config: %v", err)
		http.Error(w, "Failed to update config", http.StatusInternalServerError)
		return
	}

	c.ID = id
	log.Printf("SUCCESS: Updated shared meter config ID %d", id)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(c)
}

func (h *SharedMeterHandler) Delete(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, err := strconv.Atoi(vars["id"])
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	// Get meter ID before deleting
	var meterID int
	err = h.db.QueryRow("SELECT meter_id FROM shared_meter_configs WHERE id = ?", id).Scan(&meterID)
	if err != nil && err != sql.ErrNoRows {
		log.Printf("ERROR: Failed to get meter ID: %v", err)
	}

	_, err = h.db.Exec("DELETE FROM shared_meter_configs WHERE id = ?", id)
	if err != nil {
		log.Printf("ERROR: Failed to delete shared meter config: %v", err)
		http.Error(w, "Failed to delete config", http.StatusInternalServerError)
		return
	}

	// Check if meter has other shared configs
	if meterID > 0 {
		var count int
		err = h.db.QueryRow("SELECT COUNT(*) FROM shared_meter_configs WHERE meter_id = ?", meterID).Scan(&count)
		if err == nil && count == 0 {
			// No more shared configs, unmark meter as shared
			_, err = h.db.Exec("UPDATE meters SET is_shared = 0 WHERE id = ?", meterID)
			if err != nil {
				log.Printf("WARNING: Failed to unmark meter as shared: %v", err)
			}
		}
	}

	log.Printf("SUCCESS: Deleted shared meter config ID %d", id)
	w.WriteHeader(http.StatusNoContent)
}
