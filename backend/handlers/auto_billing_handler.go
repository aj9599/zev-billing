package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/aj9599/zev-billing/backend/models"
	"github.com/aj9599/zev-billing/backend/services"
	"github.com/gorilla/mux"
)

type AutoBillingHandler struct {
	db *sql.DB
}

func NewAutoBillingHandler(db *sql.DB) *AutoBillingHandler {
	return &AutoBillingHandler{db: db}
}

// Helper function to parse comma-separated IDs
func parseIDList(idStr string) []int {
	if idStr == "" {
		return []int{}
	}
	parts := strings.Split(idStr, ",")
	ids := []int{}
	for _, p := range parts {
		if id, err := strconv.Atoi(strings.TrimSpace(p)); err == nil {
			ids = append(ids, id)
		}
	}
	return ids
}

func (h *AutoBillingHandler) List(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(`
		SELECT id, name, building_ids, user_ids, frequency, generation_day, 
		       first_execution_date, is_active, last_run, next_run, 
		       sender_name, sender_address, sender_city, sender_zip, sender_country, 
		       bank_name, bank_iban, bank_account_holder, created_at, updated_at
		FROM auto_billing_configs
		ORDER BY created_at DESC
	`)
	if err != nil {
		log.Printf("ERROR: Failed to query auto billing configs: %v", err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	configs := []map[string]interface{}{}
	for rows.Next() {
		var config models.AutoBillingConfig
		var buildingIDsStr, userIDsStr string
		var firstExecutionDate sql.NullString
		var lastRun, nextRun sql.NullTime
		var senderName, senderAddress, senderCity, senderZip, senderCountry sql.NullString
		var bankName, bankIBAN, bankAccountHolder sql.NullString

		err := rows.Scan(
			&config.ID, &config.Name, &buildingIDsStr, &userIDsStr,
			&config.Frequency, &config.GenerationDay, &firstExecutionDate,
			&config.IsActive, &lastRun, &nextRun,
			&senderName, &senderAddress, &senderCity, &senderZip, &senderCountry,
			&bankName, &bankIBAN, &bankAccountHolder,
			&config.CreatedAt, &config.UpdatedAt,
		)
		if err != nil {
			log.Printf("ERROR: Failed to scan config: %v", err)
			continue
		}

		// Parse building and user IDs
		buildingIDs := parseIDList(buildingIDsStr)
		userIDs := parseIDList(userIDsStr)

		configMap := map[string]interface{}{
			"id":              config.ID,
			"name":            config.Name,
			"building_ids":    buildingIDs,
			"user_ids":        userIDs,
			"frequency":       config.Frequency,
			"generation_day":  config.GenerationDay,
			"is_active":       config.IsActive,
			"created_at":      config.CreatedAt,
			"updated_at":      config.UpdatedAt,
		}

		if firstExecutionDate.Valid {
			configMap["first_execution_date"] = firstExecutionDate.String
		}
		if lastRun.Valid {
			configMap["last_run"] = lastRun.Time.Format(time.RFC3339)
		}
		if nextRun.Valid {
			configMap["next_run"] = nextRun.Time.Format(time.RFC3339)
		}
		if senderName.Valid {
			configMap["sender_name"] = senderName.String
		}
		if senderAddress.Valid {
			configMap["sender_address"] = senderAddress.String
		}
		if senderCity.Valid {
			configMap["sender_city"] = senderCity.String
		}
		if senderZip.Valid {
			configMap["sender_zip"] = senderZip.String
		}
		if senderCountry.Valid {
			configMap["sender_country"] = senderCountry.String
		}
		if bankName.Valid {
			configMap["bank_name"] = bankName.String
		}
		if bankIBAN.Valid {
			configMap["bank_iban"] = bankIBAN.String
		}
		if bankAccountHolder.Valid {
			configMap["bank_account_holder"] = bankAccountHolder.String
		}

		configs = append(configs, configMap)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(configs)
}

func (h *AutoBillingHandler) Get(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, err := strconv.Atoi(vars["id"])
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	var config models.AutoBillingConfig
	var buildingIDsStr, userIDsStr string
	var firstExecutionDate sql.NullString
	var lastRun, nextRun sql.NullTime
	var senderName, senderAddress, senderCity, senderZip, senderCountry sql.NullString
	var bankName, bankIBAN, bankAccountHolder sql.NullString

	err = h.db.QueryRow(`
		SELECT id, name, building_ids, user_ids, frequency, generation_day, 
		       first_execution_date, is_active, last_run, next_run, 
		       sender_name, sender_address, sender_city, sender_zip, sender_country, 
		       bank_name, bank_iban, bank_account_holder, created_at, updated_at
		FROM auto_billing_configs WHERE id = ?
	`, id).Scan(
		&config.ID, &config.Name, &buildingIDsStr, &userIDsStr,
		&config.Frequency, &config.GenerationDay, &firstExecutionDate,
		&config.IsActive, &lastRun, &nextRun,
		&senderName, &senderAddress, &senderCity, &senderZip, &senderCountry,
		&bankName, &bankIBAN, &bankAccountHolder,
		&config.CreatedAt, &config.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		http.Error(w, "Config not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Printf("ERROR: Failed to get config: %v", err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	buildingIDs := parseIDList(buildingIDsStr)
	userIDs := parseIDList(userIDsStr)

	response := map[string]interface{}{
		"id":              config.ID,
		"name":            config.Name,
		"building_ids":    buildingIDs,
		"user_ids":        userIDs,
		"frequency":       config.Frequency,
		"generation_day":  config.GenerationDay,
		"is_active":       config.IsActive,
		"created_at":      config.CreatedAt,
		"updated_at":      config.UpdatedAt,
	}

	if firstExecutionDate.Valid {
		response["first_execution_date"] = firstExecutionDate.String
	}
	if lastRun.Valid {
		response["last_run"] = lastRun.Time.Format(time.RFC3339)
	}
	if nextRun.Valid {
		response["next_run"] = nextRun.Time.Format(time.RFC3339)
	}
	if senderName.Valid {
		response["sender_name"] = senderName.String
	}
	if senderAddress.Valid {
		response["sender_address"] = senderAddress.String
	}
	if senderCity.Valid {
		response["sender_city"] = senderCity.String
	}
	if senderZip.Valid {
		response["sender_zip"] = senderZip.String
	}
	if senderCountry.Valid {
		response["sender_country"] = senderCountry.String
	}
	if bankName.Valid {
		response["bank_name"] = bankName.String
	}
	if bankIBAN.Valid {
		response["bank_iban"] = bankIBAN.String
	}
	if bankAccountHolder.Valid {
		response["bank_account_holder"] = bankAccountHolder.String
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (h *AutoBillingHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name               string `json:"name"`
		BuildingIDs        []int  `json:"building_ids"`
		UserIDs            []int  `json:"user_ids"`
		Frequency          string `json:"frequency"`
		GenerationDay      int    `json:"generation_day"`
		FirstExecutionDate string `json:"first_execution_date"`
		IsActive           bool   `json:"is_active"`
		SenderName         string `json:"sender_name"`
		SenderAddress      string `json:"sender_address"`
		SenderCity         string `json:"sender_city"`
		SenderZip          string `json:"sender_zip"`
		SenderCountry      string `json:"sender_country"`
		BankName           string `json:"bank_name"`
		BankIBAN           string `json:"bank_iban"`
		BankAccountHolder  string `json:"bank_account_holder"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("ERROR: Failed to decode request: %v", err)
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	// Convert slices to comma-separated strings
	buildingIDsStr := ""
	for i, id := range req.BuildingIDs {
		if i > 0 {
			buildingIDsStr += ","
		}
		buildingIDsStr += strconv.Itoa(id)
	}

	userIDsStr := ""
	for i, id := range req.UserIDs {
		if i > 0 {
			userIDsStr += ","
		}
		userIDsStr += strconv.Itoa(id)
	}

	// Calculate next run using the scheduler's function
	nextRun := services.CalculateInitialNextRun(req.Frequency, req.GenerationDay, req.FirstExecutionDate)

	// Prepare first_execution_date for database
	var firstExecDateValue interface{}
	if req.FirstExecutionDate != "" {
		firstExecDateValue = req.FirstExecutionDate
	} else {
		firstExecDateValue = nil
	}

	result, err := h.db.Exec(`
		INSERT INTO auto_billing_configs (
			name, building_ids, user_ids, frequency, generation_day, 
			first_execution_date, is_active, next_run, 
			sender_name, sender_address, sender_city, sender_zip, sender_country, 
			bank_name, bank_iban, bank_account_holder
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, req.Name, buildingIDsStr, userIDsStr, req.Frequency, req.GenerationDay,
		firstExecDateValue, req.IsActive, nextRun,
		req.SenderName, req.SenderAddress, req.SenderCity,
		req.SenderZip, req.SenderCountry, req.BankName, req.BankIBAN, req.BankAccountHolder)

	if err != nil {
		log.Printf("ERROR: Failed to create auto billing config: %v", err)
		http.Error(w, "Failed to create config", http.StatusInternalServerError)
		return
	}

	id, _ := result.LastInsertId()
	log.Printf("SUCCESS: Created auto billing config ID %d (%s)", id, req.Name)

	response := map[string]interface{}{
		"id":              id,
		"name":            req.Name,
		"building_ids":    req.BuildingIDs,
		"user_ids":        req.UserIDs,
		"frequency":       req.Frequency,
		"generation_day":  req.GenerationDay,
		"is_active":       req.IsActive,
		"next_run":        nextRun.Format(time.RFC3339),
		"sender_name":     req.SenderName,
		"sender_address":  req.SenderAddress,
		"sender_city":     req.SenderCity,
		"sender_zip":      req.SenderZip,
		"sender_country":  req.SenderCountry,
		"bank_name":       req.BankName,
		"bank_iban":       req.BankIBAN,
		"bank_account_holder": req.BankAccountHolder,
	}

	if req.FirstExecutionDate != "" {
		response["first_execution_date"] = req.FirstExecutionDate
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(response)
}

func (h *AutoBillingHandler) Update(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, err := strconv.Atoi(vars["id"])
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	var req struct {
		Name               string `json:"name"`
		BuildingIDs        []int  `json:"building_ids"`
		UserIDs            []int  `json:"user_ids"`
		Frequency          string `json:"frequency"`
		GenerationDay      int    `json:"generation_day"`
		FirstExecutionDate string `json:"first_execution_date"`
		IsActive           bool   `json:"is_active"`
		SenderName         string `json:"sender_name"`
		SenderAddress      string `json:"sender_address"`
		SenderCity         string `json:"sender_city"`
		SenderZip          string `json:"sender_zip"`
		SenderCountry      string `json:"sender_country"`
		BankName           string `json:"bank_name"`
		BankIBAN           string `json:"bank_iban"`
		BankAccountHolder  string `json:"bank_account_holder"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("ERROR: Failed to decode request: %v", err)
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	// Convert slices to comma-separated strings
	buildingIDsStr := ""
	for i, id := range req.BuildingIDs {
		if i > 0 {
			buildingIDsStr += ","
		}
		buildingIDsStr += strconv.Itoa(id)
	}

	userIDsStr := ""
	for i, id := range req.UserIDs {
		if i > 0 {
			userIDsStr += ","
		}
		userIDsStr += strconv.Itoa(id)
	}

	// Calculate next run using the scheduler's function
	nextRun := services.CalculateInitialNextRun(req.Frequency, req.GenerationDay, req.FirstExecutionDate)

	// Prepare first_execution_date for database
	var firstExecDateValue interface{}
	if req.FirstExecutionDate != "" {
		firstExecDateValue = req.FirstExecutionDate
	} else {
		firstExecDateValue = nil
	}

	_, err = h.db.Exec(`
		UPDATE auto_billing_configs SET
			name = ?, building_ids = ?, user_ids = ?, frequency = ?, 
			generation_day = ?, first_execution_date = ?, is_active = ?, next_run = ?,
			sender_name = ?, sender_address = ?, sender_city = ?, 
			sender_zip = ?, sender_country = ?, bank_name = ?, 
			bank_iban = ?, bank_account_holder = ?,
			updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, req.Name, buildingIDsStr, userIDsStr, req.Frequency, req.GenerationDay,
		firstExecDateValue, req.IsActive, nextRun,
		req.SenderName, req.SenderAddress, req.SenderCity,
		req.SenderZip, req.SenderCountry, req.BankName, req.BankIBAN,
		req.BankAccountHolder, id)

	if err != nil {
		log.Printf("ERROR: Failed to update auto billing config: %v", err)
		http.Error(w, "Failed to update config", http.StatusInternalServerError)
		return
	}

	log.Printf("SUCCESS: Updated auto billing config ID %d", id)

	response := map[string]interface{}{
		"id":              id,
		"name":            req.Name,
		"building_ids":    req.BuildingIDs,
		"user_ids":        req.UserIDs,
		"frequency":       req.Frequency,
		"generation_day":  req.GenerationDay,
		"is_active":       req.IsActive,
		"next_run":        nextRun.Format(time.RFC3339),
		"sender_name":     req.SenderName,
		"sender_address":  req.SenderAddress,
		"sender_city":     req.SenderCity,
		"sender_zip":      req.SenderZip,
		"sender_country":  req.SenderCountry,
		"bank_name":       req.BankName,
		"bank_iban":       req.BankIBAN,
		"bank_account_holder": req.BankAccountHolder,
	}

	if req.FirstExecutionDate != "" {
		response["first_execution_date"] = req.FirstExecutionDate
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (h *AutoBillingHandler) Delete(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, err := strconv.Atoi(vars["id"])
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	_, err = h.db.Exec("DELETE FROM auto_billing_configs WHERE id = ?", id)
	if err != nil {
		log.Printf("ERROR: Failed to delete auto billing config ID %d: %v", id, err)
		http.Error(w, "Failed to delete config", http.StatusInternalServerError)
		return
	}

	log.Printf("SUCCESS: Deleted auto billing config ID %d", id)
	w.WriteHeader(http.StatusNoContent)
}