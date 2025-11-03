package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"github.com/gorilla/mux"
)

type CustomItemHandler struct {
	db *sql.DB
}

func NewCustomItemHandler(db *sql.DB) *CustomItemHandler {
	return &CustomItemHandler{db: db}
}

type CustomLineItem struct {
	ID          int     `json:"id"`
	BuildingID  int     `json:"building_id"`
	Description string  `json:"description"`
	Amount      float64 `json:"amount"`
	Frequency   string  `json:"frequency"`
	Category    string  `json:"category"`
	IsActive    bool    `json:"is_active"`
	CreatedAt   string  `json:"created_at"`
	UpdatedAt   string  `json:"updated_at"`
}

func (h *CustomItemHandler) List(w http.ResponseWriter, r *http.Request) {
	buildingID := r.URL.Query().Get("building_id")
	includeInactive := r.URL.Query().Get("include_inactive") == "true"

	query := `
		SELECT id, building_id, description, amount, frequency, category, is_active, created_at, updated_at
		FROM custom_line_items
		WHERE 1=1
	`
	args := []interface{}{}

	if buildingID != "" {
		query += " AND building_id = ?"
		args = append(args, buildingID)
	}

	if !includeInactive {
		query += " AND is_active = 1"
	}

	query += " ORDER BY building_id, category, description"

	rows, err := h.db.Query(query, args...)
	if err != nil {
		log.Printf("ERROR: Failed to query custom line items: %v", err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	items := []CustomLineItem{}
	for rows.Next() {
		var item CustomLineItem
		var isActive int
		err := rows.Scan(
			&item.ID, &item.BuildingID, &item.Description, &item.Amount,
			&item.Frequency, &item.Category, &isActive, &item.CreatedAt, &item.UpdatedAt,
		)
		if err == nil {
			item.IsActive = isActive == 1
			items = append(items, item)
		}
	}

	log.Printf("Found %d custom line items", len(items))

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(items)
}

func (h *CustomItemHandler) Get(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, err := strconv.Atoi(vars["id"])
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	var item CustomLineItem
	var isActive int
	err = h.db.QueryRow(`
		SELECT id, building_id, description, amount, frequency, category, is_active, created_at, updated_at
		FROM custom_line_items
		WHERE id = ?
	`, id).Scan(
		&item.ID, &item.BuildingID, &item.Description, &item.Amount,
		&item.Frequency, &item.Category, &isActive, &item.CreatedAt, &item.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		http.Error(w, "Custom line item not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Printf("ERROR: Failed to query custom line item: %v", err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	item.IsActive = isActive == 1

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(item)
}

func (h *CustomItemHandler) Create(w http.ResponseWriter, r *http.Request) {
	var item CustomLineItem
	if err := json.NewDecoder(r.Body).Decode(&item); err != nil {
		log.Printf("ERROR: Failed to decode custom line item: %v", err)
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	// Validate frequency
	validFrequencies := map[string]bool{
		"once":      true,
		"monthly":   true,
		"quarterly": true,
		"yearly":    true,
	}
	if !validFrequencies[item.Frequency] {
		http.Error(w, "Invalid frequency. Must be: once, monthly, quarterly, or yearly", http.StatusBadRequest)
		return
	}

	// Validate category
	validCategories := map[string]bool{
		"meter_rent":  true,
		"maintenance": true,
		"service":     true,
		"other":       true,
	}
	if !validCategories[item.Category] {
		http.Error(w, "Invalid category. Must be: meter_rent, maintenance, service, or other", http.StatusBadRequest)
		return
	}

	// Set default values
	if item.Frequency == "" {
		item.Frequency = "monthly"
	}
	if item.Category == "" {
		item.Category = "other"
	}

	isActive := 0
	if item.IsActive {
		isActive = 1
	}

	result, err := h.db.Exec(`
		INSERT INTO custom_line_items (
			building_id, description, amount, frequency, category, is_active
		) VALUES (?, ?, ?, ?, ?, ?)
	`, item.BuildingID, item.Description, item.Amount, item.Frequency, item.Category, isActive)

	if err != nil {
		log.Printf("ERROR: Failed to create custom line item: %v", err)
		http.Error(w, "Failed to create item", http.StatusInternalServerError)
		return
	}

	id, _ := result.LastInsertId()
	item.ID = int(id)

	log.Printf("SUCCESS: Created custom line item ID %d for building %d", item.ID, item.BuildingID)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(item)
}

func (h *CustomItemHandler) Update(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, err := strconv.Atoi(vars["id"])
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	var item CustomLineItem
	if err := json.NewDecoder(r.Body).Decode(&item); err != nil {
		log.Printf("ERROR: Failed to decode custom line item: %v", err)
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	// Validate frequency
	validFrequencies := map[string]bool{
		"once":      true,
		"monthly":   true,
		"quarterly": true,
		"yearly":    true,
	}
	if !validFrequencies[item.Frequency] {
		http.Error(w, "Invalid frequency. Must be: once, monthly, quarterly, or yearly", http.StatusBadRequest)
		return
	}

	// Validate category
	validCategories := map[string]bool{
		"meter_rent":  true,
		"maintenance": true,
		"service":     true,
		"other":       true,
	}
	if !validCategories[item.Category] {
		http.Error(w, "Invalid category. Must be: meter_rent, maintenance, service, or other", http.StatusBadRequest)
		return
	}

	isActive := 0
	if item.IsActive {
		isActive = 1
	}

	_, err = h.db.Exec(`
		UPDATE custom_line_items SET
			building_id = ?, description = ?, amount = ?, 
			frequency = ?, category = ?, is_active = ?,
			updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, item.BuildingID, item.Description, item.Amount, item.Frequency, item.Category, isActive, id)

	if err != nil {
		log.Printf("ERROR: Failed to update custom line item: %v", err)
		http.Error(w, "Failed to update item", http.StatusInternalServerError)
		return
	}

	item.ID = id
	log.Printf("SUCCESS: Updated custom line item ID %d", id)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(item)
}

func (h *CustomItemHandler) Delete(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, err := strconv.Atoi(vars["id"])
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	_, err = h.db.Exec("DELETE FROM custom_line_items WHERE id = ?", id)
	if err != nil {
		log.Printf("ERROR: Failed to delete custom line item: %v", err)
		http.Error(w, "Failed to delete item", http.StatusInternalServerError)
		return
	}

	log.Printf("SUCCESS: Deleted custom line item ID %d", id)
	w.WriteHeader(http.StatusNoContent)
}