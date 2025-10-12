package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/aj9599/zev-billing/backend/models"
	"github.com/aj9599/zev-billing/backend/services"
	"github.com/gorilla/mux"
)

type BillingHandler struct {
	db             *sql.DB
	billingService *services.BillingService
}

func NewBillingHandler(db *sql.DB, billingService *services.BillingService) *BillingHandler {
	return &BillingHandler{
		db:             db,
		billingService: billingService,
	}
}

type GenerateBillsRequest struct {
	BuildingIDs []int  `json:"building_ids"`
	UserIDs     []int  `json:"user_ids"`
	StartDate   string `json:"start_date"`
	EndDate     string `json:"end_date"`
}

func (h *BillingHandler) GetSettings(w http.ResponseWriter, r *http.Request) {
	buildingID := r.URL.Query().Get("building_id")
	
	var query string
	var args []interface{}
	
	if buildingID != "" {
		query = `
			SELECT id, building_id, normal_power_price, solar_power_price, 
			       car_charging_normal_price, car_charging_priority_price, 
			       currency, valid_from, valid_to, is_active, created_at, updated_at
			FROM billing_settings 
			WHERE building_id = ?
			ORDER BY valid_from DESC
		`
		args = append(args, buildingID)
	} else {
		query = `
			SELECT id, building_id, normal_power_price, solar_power_price, 
			       car_charging_normal_price, car_charging_priority_price, 
			       currency, valid_from, valid_to, is_active, created_at, updated_at
			FROM billing_settings
			ORDER BY building_id, valid_from DESC
		`
	}

	rows, err := h.db.Query(query, args...)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	settings := []models.BillingSettings{}
	for rows.Next() {
		var s models.BillingSettings
		var validTo sql.NullString
		err := rows.Scan(
			&s.ID, &s.BuildingID, &s.NormalPowerPrice, &s.SolarPowerPrice,
			&s.CarChargingNormalPrice, &s.CarChargingPriorityPrice,
			&s.Currency, &s.ValidFrom, &validTo, &s.IsActive, &s.CreatedAt, &s.UpdatedAt,
		)
		if err == nil {
			if validTo.Valid {
				s.ValidTo = validTo.String
			}
			settings = append(settings, s)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(settings)
}

func (h *BillingHandler) CreateSettings(w http.ResponseWriter, r *http.Request) {
	var s models.BillingSettings
	if err := json.NewDecoder(r.Body).Decode(&s); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	validTo := sql.NullString{}
	if s.ValidTo != "" {
		validTo.Valid = true
		validTo.String = s.ValidTo
	}

	result, err := h.db.Exec(`
		INSERT INTO billing_settings (
			building_id, normal_power_price, solar_power_price,
			car_charging_normal_price, car_charging_priority_price, 
			currency, valid_from, valid_to, is_active
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, s.BuildingID, s.NormalPowerPrice, s.SolarPowerPrice,
		s.CarChargingNormalPrice, s.CarChargingPriorityPrice,
		s.Currency, s.ValidFrom, validTo, s.IsActive)

	if err != nil {
		http.Error(w, "Failed to create settings", http.StatusInternalServerError)
		return
	}

	id, _ := result.LastInsertId()
	s.ID = int(id)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(s)
}

func (h *BillingHandler) DeleteSettings(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, err := strconv.Atoi(vars["id"])
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	_, err = h.db.Exec("DELETE FROM billing_settings WHERE id = ?", id)
	if err != nil {
		http.Error(w, "Failed to delete settings", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *BillingHandler) UpdateSettings(w http.ResponseWriter, r *http.Request) {
	var s models.BillingSettings
	if err := json.NewDecoder(r.Body).Decode(&s); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	// Check if settings exist
	var exists bool
	err := h.db.QueryRow("SELECT 1 FROM billing_settings WHERE building_id = ?", s.BuildingID).Scan(&exists)

	if err == sql.ErrNoRows {
		// Insert new settings
		result, err := h.db.Exec(`
			INSERT INTO billing_settings (
				building_id, normal_power_price, solar_power_price,
				car_charging_normal_price, car_charging_priority_price, currency
			) VALUES (?, ?, ?, ?, ?, ?)
		`, s.BuildingID, s.NormalPowerPrice, s.SolarPowerPrice,
			s.CarChargingNormalPrice, s.CarChargingPriorityPrice, s.Currency)

		if err != nil {
			http.Error(w, "Failed to create settings", http.StatusInternalServerError)
			return
		}

		id, _ := result.LastInsertId()
		s.ID = int(id)
	} else {
		// Update existing settings
		_, err = h.db.Exec(`
			UPDATE billing_settings SET
				normal_power_price = ?, solar_power_price = ?,
				car_charging_normal_price = ?, car_charging_priority_price = ?,
				currency = ?, updated_at = CURRENT_TIMESTAMP
			WHERE building_id = ?
		`, s.NormalPowerPrice, s.SolarPowerPrice,
			s.CarChargingNormalPrice, s.CarChargingPriorityPrice,
			s.Currency, s.BuildingID)

		if err != nil {
			http.Error(w, "Failed to update settings", http.StatusInternalServerError)
			return
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(s)
}

func (h *BillingHandler) GenerateBills(w http.ResponseWriter, r *http.Request) {
	var req GenerateBillsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	invoices, err := h.billingService.GenerateBills(req.BuildingIDs, req.UserIDs, req.StartDate, req.EndDate)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(invoices)
}

func (h *BillingHandler) ListInvoices(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("user_id")
	buildingID := r.URL.Query().Get("building_id")

	query := `
		SELECT i.id, i.invoice_number, i.user_id, i.building_id, 
		       i.period_start, i.period_end, i.total_amount, i.currency, 
		       i.status, i.generated_at
		FROM invoices i
		WHERE 1=1
	`
	args := []interface{}{}

	if userID != "" {
		query += " AND i.user_id = ?"
		args = append(args, userID)
	}
	if buildingID != "" {
		query += " AND i.building_id = ?"
		args = append(args, buildingID)
	}

	query += " ORDER BY i.generated_at DESC"

	rows, err := h.db.Query(query, args...)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	invoices := []models.Invoice{}
	for rows.Next() {
		var inv models.Invoice
		err := rows.Scan(
			&inv.ID, &inv.InvoiceNumber, &inv.UserID, &inv.BuildingID,
			&inv.PeriodStart, &inv.PeriodEnd, &inv.TotalAmount, &inv.Currency,
			&inv.Status, &inv.GeneratedAt,
		)
		if err == nil {
			invoices = append(invoices, inv)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(invoices)
}

func (h *BillingHandler) GetInvoice(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, err := strconv.Atoi(vars["id"])
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	var inv models.Invoice
	err = h.db.QueryRow(`
		SELECT i.id, i.invoice_number, i.user_id, i.building_id, 
		       i.period_start, i.period_end, i.total_amount, i.currency, 
		       i.status, i.generated_at
		FROM invoices i WHERE i.id = ?
	`, id).Scan(
		&inv.ID, &inv.InvoiceNumber, &inv.UserID, &inv.BuildingID,
		&inv.PeriodStart, &inv.PeriodEnd, &inv.TotalAmount, &inv.Currency,
		&inv.Status, &inv.GeneratedAt,
	)

	if err == sql.ErrNoRows {
		http.Error(w, "Invoice not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	// Get invoice items
	itemRows, err := h.db.Query(`
		SELECT id, invoice_id, description, quantity, unit_price, total_price, item_type
		FROM invoice_items WHERE invoice_id = ?
		ORDER BY id ASC
	`, inv.ID)

	if err == nil {
		defer itemRows.Close()
		inv.Items = []models.InvoiceItem{}
		for itemRows.Next() {
			var item models.InvoiceItem
			if err := itemRows.Scan(&item.ID, &item.InvoiceID, &item.Description,
				&item.Quantity, &item.UnitPrice, &item.TotalPrice, &item.ItemType); err == nil {
				inv.Items = append(inv.Items, item)
			}
		}
	}

	// Get user details
	var user models.User
	err = h.db.QueryRow(`
		SELECT id, first_name, last_name, email, phone, 
		       address_street, address_city, address_zip, address_country
		FROM users WHERE id = ?
	`, inv.UserID).Scan(
		&user.ID, &user.FirstName, &user.LastName, &user.Email, &user.Phone,
		&user.AddressStreet, &user.AddressCity, &user.AddressZip, &user.AddressCountry,
	)

	if err == nil {
		inv.User = &user
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(inv)
}

func (h *BillingHandler) DeleteInvoice(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, err := strconv.Atoi(vars["id"])
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	// Delete invoice items first
	_, err = h.db.Exec("DELETE FROM invoice_items WHERE invoice_id = ?", id)
	if err != nil {
		http.Error(w, "Failed to delete invoice items", http.StatusInternalServerError)
		return
	}

	// Delete invoice
	_, err = h.db.Exec("DELETE FROM invoices WHERE id = ?", id)
	if err != nil {
		http.Error(w, "Failed to delete invoice", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *BillingHandler) BackupDatabase(w http.ResponseWriter, r *http.Request) {
	// Create a backup of the database
	dbPath := "./zev-billing.db"
	backupName := fmt.Sprintf("zev-billing-backup-%s.db", time.Now().Format("20060102-150405"))
	
	// Read the database file
	data, err := os.ReadFile(dbPath)
	if err != nil {
		http.Error(w, "Failed to read database", http.StatusInternalServerError)
		return
	}

	// Set headers for file download
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s", backupName))
	w.Header().Set("Content-Length", fmt.Sprintf("%d", len(data)))
	
	w.Write(data)
}

func (h *BillingHandler) ExportData(w http.ResponseWriter, r *http.Request) {
	buildingID := r.URL.Query().Get("building_id")
	userID := r.URL.Query().Get("user_id")
	startDate := r.URL.Query().Get("start_date")
	endDate := r.URL.Query().Get("end_date")
	exportType := r.URL.Query().Get("type") // "meters" or "chargers"

	var query string
	var args []interface{}

	if exportType == "chargers" {
		query = `
			SELECT cs.session_time, c.name as charger_name, b.name as building_name, 
			       cs.user_id, cs.power_kwh, cs.mode, cs.state
			FROM charger_sessions cs
			JOIN chargers c ON cs.charger_id = c.id
			JOIN buildings b ON c.building_id = b.id
			WHERE 1=1
		`
	} else {
		query = `
			SELECT mr.reading_time, m.name as meter_name, m.meter_type, b.name as building_name, 
			       u.first_name, u.last_name, mr.power_kwh
			FROM meter_readings mr
			JOIN meters m ON mr.meter_id = m.id
			JOIN buildings b ON m.building_id = b.id
			LEFT JOIN users u ON m.user_id = u.id
			WHERE 1=1
		`
	}

	if buildingID != "" {
		if exportType == "chargers" {
			query += " AND c.building_id = ?"
		} else {
			query += " AND m.building_id = ?"
		}
		args = append(args, buildingID)
	}

	if userID != "" && exportType != "chargers" {
		query += " AND m.user_id = ?"
		args = append(args, userID)
	}

	if startDate != "" {
		if exportType == "chargers" {
			query += " AND cs.session_time >= ?"
		} else {
			query += " AND mr.reading_time >= ?"
		}
		args = append(args, startDate)
	}

	if endDate != "" {
		if exportType == "chargers" {
			query += " AND cs.session_time <= ?"
		} else {
			query += " AND mr.reading_time <= ?"
		}
		args = append(args, endDate)
	}

	if exportType == "chargers" {
		query += " ORDER BY cs.session_time ASC"
	} else {
		query += " ORDER BY mr.reading_time ASC"
	}

	rows, err := h.db.Query(query, args...)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	// Create CSV
	var csv strings.Builder
	
	if exportType == "chargers" {
		csv.WriteString("Timestamp,Charger Name,Building,User ID,Power (kWh),Mode,State\n")
		for rows.Next() {
			var timestamp, chargerName, buildingName, userID, mode, state string
			var power float64
			if err := rows.Scan(&timestamp, &chargerName, &buildingName, &userID, &power, &mode, &state); err != nil {
				continue
			}
			csv.WriteString(fmt.Sprintf("%s,%s,%s,%s,%.4f,%s,%s\n", 
				timestamp, chargerName, buildingName, userID, power, mode, state))
		}
	} else {
		csv.WriteString("Timestamp,Meter Name,Meter Type,Building,User First Name,User Last Name,Power (kWh)\n")
		for rows.Next() {
			var timestamp, meterName, meterType, buildingName string
			var firstName, lastName sql.NullString
			var power float64
			if err := rows.Scan(&timestamp, &meterName, &meterType, &buildingName, &firstName, &lastName, &power); err != nil {
				continue
			}
			fnStr := ""
			lnStr := ""
			if firstName.Valid {
				fnStr = firstName.String
			}
			if lastName.Valid {
				lnStr = lastName.String
			}
			csv.WriteString(fmt.Sprintf("%s,%s,%s,%s,%s,%s,%.4f\n", 
				timestamp, meterName, meterType, buildingName, fnStr, lnStr, power))
		}
	}

	filename := fmt.Sprintf("zev-export-%s-%s.csv", exportType, time.Now().Format("20060102-150405"))
	
	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s", filename))
	w.Write([]byte(csv.String()))
}