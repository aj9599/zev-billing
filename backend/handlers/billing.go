package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"

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
	if buildingID == "" {
		// Get all settings
		rows, err := h.db.Query(`
			SELECT id, building_id, normal_power_price, solar_power_price, 
			       car_charging_normal_price, car_charging_priority_price, 
			       currency, created_at, updated_at
			FROM billing_settings
		`)
		if err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		settings := []models.BillingSettings{}
		for rows.Next() {
			var s models.BillingSettings
			err := rows.Scan(
				&s.ID, &s.BuildingID, &s.NormalPowerPrice, &s.SolarPowerPrice,
				&s.CarChargingNormalPrice, &s.CarChargingPriorityPrice,
				&s.Currency, &s.CreatedAt, &s.UpdatedAt,
			)
			if err == nil {
				settings = append(settings, s)
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(settings)
		return
	}

	// Get specific building settings
	var s models.BillingSettings
	err := h.db.QueryRow(`
		SELECT id, building_id, normal_power_price, solar_power_price, 
		       car_charging_normal_price, car_charging_priority_price, 
		       currency, created_at, updated_at
		FROM billing_settings WHERE building_id = ?
	`, buildingID).Scan(
		&s.ID, &s.BuildingID, &s.NormalPowerPrice, &s.SolarPowerPrice,
		&s.CarChargingNormalPrice, &s.CarChargingPriorityPrice,
		&s.Currency, &s.CreatedAt, &s.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		http.Error(w, "Settings not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(s)
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