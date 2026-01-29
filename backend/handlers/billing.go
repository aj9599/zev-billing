package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
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
	pdfGenerator   *services.PDFGenerator
}

func NewBillingHandler(db *sql.DB, billingService *services.BillingService, pdfGenerator *services.PDFGenerator) *BillingHandler {
	return &BillingHandler{
		db:             db,
		billingService: billingService,
		pdfGenerator:   pdfGenerator,
	}
}

func (h *BillingHandler) logToDatabase(action, details, ip string) {
	_, err := h.db.Exec(`
		INSERT INTO admin_logs (action, details, ip_address)
		VALUES (?, ?, ?)
	`, action, details, ip)
	if err != nil {
		log.Printf("[BILLING] Failed to write admin log: %v", err)
	}
}

type GenerateBillsRequest struct {
	BuildingIDs []int  `json:"building_ids"`
	UserIDs     []int  `json:"user_ids"`
	StartDate   string `json:"start_date"`
	EndDate     string `json:"end_date"`
	IsVZEV      bool   `json:"is_vzev"`

	// Custom item IDs to include in bills (NEW)
	CustomItemIDs []int `json:"custom_item_ids"`

	// Sender information
	SenderName    string `json:"sender_name"`
	SenderAddress string `json:"sender_address"`
	SenderCity    string `json:"sender_city"`
	SenderZip     string `json:"sender_zip"`
	SenderCountry string `json:"sender_country"`

	// Banking information
	BankName          string `json:"bank_name"`
	BankIBAN          string `json:"bank_iban"`
	BankAccountHolder string `json:"bank_account_holder"`
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
    		SELECT id, building_id, is_complex, normal_power_price, solar_power_price, 
           			car_charging_normal_price, car_charging_priority_price, 
           			vzev_export_price, currency, valid_from, valid_to, is_active, 
           			created_at, updated_at
    		FROM billing_settings
    		ORDER BY building_id, valid_from DESC
		`
	}

	rows, err := h.db.Query(query, args...)
	if err != nil {
		log.Printf("ERROR: Failed to query billing settings: %v", err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	settings := []models.BillingSettings{}
	for rows.Next() {
		var s models.BillingSettings
		var validTo sql.NullString
		err := rows.Scan(
			&s.ID, &s.BuildingID, &s.IsComplex, &s.NormalPowerPrice, &s.SolarPowerPrice,
			&s.CarChargingNormalPrice, &s.CarChargingPriorityPrice, &s.VZEVExportPrice,
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
		log.Printf("ERROR: Failed to decode billing settings: %v", err)
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
        	building_id, is_complex, normal_power_price, solar_power_price,
        	car_charging_normal_price, car_charging_priority_price, 
        	vzev_export_price, currency, valid_from, valid_to, is_active
    		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, s.BuildingID, s.IsComplex, s.NormalPowerPrice, s.SolarPowerPrice,
		s.CarChargingNormalPrice, s.CarChargingPriorityPrice,
		s.VZEVExportPrice, s.Currency, s.ValidFrom, validTo, s.IsActive)

	if err != nil {
		log.Printf("ERROR: Failed to create billing settings: %v", err)
		http.Error(w, "Failed to create settings", http.StatusInternalServerError)
		return
	}

	id, _ := result.LastInsertId()
	s.ID = int(id)

	log.Printf("SUCCESS: Created billing settings ID %d for building %d", s.ID, s.BuildingID)

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
		log.Printf("ERROR: Failed to delete billing settings ID %d: %v", id, err)
		http.Error(w, "Failed to delete settings", http.StatusInternalServerError)
		return
	}

	log.Printf("SUCCESS: Deleted billing settings ID %d", id)
	w.WriteHeader(http.StatusNoContent)
}

func (h *BillingHandler) UpdateSettings(w http.ResponseWriter, r *http.Request) {
	var s models.BillingSettings
	if err := json.NewDecoder(r.Body).Decode(&s); err != nil {
		log.Printf("ERROR: Failed to decode billing settings: %v", err)
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
			log.Printf("ERROR: Failed to create billing settings: %v", err)
			http.Error(w, "Failed to create settings", http.StatusInternalServerError)
			return
		}

		id, _ := result.LastInsertId()
		s.ID = int(id)
		log.Printf("SUCCESS: Created billing settings ID %d for building %d", s.ID, s.BuildingID)
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
			log.Printf("ERROR: Failed to update billing settings: %v", err)
			http.Error(w, "Failed to update settings", http.StatusInternalServerError)
			return
		}
		log.Printf("SUCCESS: Updated billing settings for building %d", s.BuildingID)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(s)
}

func (h *BillingHandler) GenerateBills(w http.ResponseWriter, r *http.Request) {
	var req GenerateBillsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("ERROR: Failed to decode generate bills request: %v", err)
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	log.Printf("=== Starting bill generation ===")
	log.Printf("Mode: %s, Buildings: %v, Users: %v, Period: %s to %s",
		func() string {
			if req.IsVZEV {
				return "vZEV"
			} else {
				return "ZEV"
			}
		}(),
		req.BuildingIDs, req.UserIDs, req.StartDate, req.EndDate)
	log.Printf("Custom Item IDs: %v", req.CustomItemIDs)
	log.Printf("Sender: %s, IBAN: %s", req.SenderName, req.BankIBAN)

	// Generate invoices with custom item selection
	// Use GenerateBillsWithOptions to pass custom item IDs
	var invoices []models.Invoice
	var err error

	if len(req.CustomItemIDs) > 0 {
		// Use new method with custom item selection
		invoices, err = h.billingService.GenerateBillsWithOptions(
			req.BuildingIDs,
			req.UserIDs,
			req.StartDate,
			req.EndDate,
			req.IsVZEV,
			req.CustomItemIDs,
		)
	} else {
		// Backward compatible: no custom items when none selected
		invoices, err = h.billingService.GenerateBillsWithOptions(
			req.BuildingIDs,
			req.UserIDs,
			req.StartDate,
			req.EndDate,
			req.IsVZEV,
			[]int{}, // Empty = no custom items
		)
	}

	if err != nil {
		log.Printf("ERROR: Bill generation failed: %v", err)
		h.logToDatabase("Bill Generation Failed", fmt.Sprintf("Period: %s to %s, Error: %v", req.StartDate, req.EndDate, err), getClientIP(r))
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	log.Printf("Generated %d invoices, now creating PDFs...", len(invoices))

	// Prepare sender and banking info for PDF generation
	senderInfo := services.SenderInfo{
		Name:    req.SenderName,
		Address: req.SenderAddress,
		City:    req.SenderCity,
		Zip:     req.SenderZip,
		Country: req.SenderCountry,
	}

	bankingInfo := services.BankingInfo{
		Name:          req.BankName,
		IBAN:          req.BankIBAN,
		AccountHolder: req.BankAccountHolder,
	}

	// Generate PDFs for each invoice
	successCount := 0
	for i, invoice := range invoices {
		// Load full invoice with items and user details
		fullInvoice, err := h.loadFullInvoice(invoice.ID)
		if err != nil {
			log.Printf("WARNING: Failed to load full invoice %d: %v", invoice.ID, err)
			continue
		}

		// Convert invoice struct to map for PDF generator
		invoiceMap := h.invoiceToMap(fullInvoice)

		// Generate PDF
		pdfPath, err := h.pdfGenerator.GenerateInvoicePDF(invoiceMap, senderInfo, bankingInfo)
		if err != nil {
			log.Printf("WARNING: Failed to generate PDF for invoice %d: %v", invoice.ID, err)
			continue
		}

		// Update invoice with PDF path
		_, err = h.db.Exec("UPDATE invoices SET pdf_path = ? WHERE id = ?", pdfPath, invoice.ID)
		if err != nil {
			log.Printf("WARNING: Failed to update PDF path for invoice %d: %v", invoice.ID, err)
		} else {
			successCount++
			log.Printf("✓ Generated PDF %d/%d: %s", i+1, len(invoices), pdfPath)
		}
	}

	log.Printf("=== Bill generation completed successfully ===")
	log.Printf("Generated %d invoices with %d PDFs", len(invoices), successCount)

	mode := "ZEV"
	if req.IsVZEV {
		mode = "vZEV"
	}
	h.logToDatabase("Bills Generated",
		fmt.Sprintf("%s mode: %d invoices, %d PDFs, period %s to %s", mode, len(invoices), successCount, req.StartDate, req.EndDate),
		getClientIP(r))

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(invoices)
}

// Helper function to load full invoice with items and user
func (h *BillingHandler) loadFullInvoice(invoiceID int) (models.Invoice, error) {
	var inv models.Invoice

	err := h.db.QueryRow(`
		SELECT i.id, i.invoice_number, i.user_id, i.building_id, 
		       i.period_start, i.period_end, i.total_amount, i.currency, 
		       i.status, i.generated_at
		FROM invoices i WHERE i.id = ?
	`, invoiceID).Scan(
		&inv.ID, &inv.InvoiceNumber, &inv.UserID, &inv.BuildingID,
		&inv.PeriodStart, &inv.PeriodEnd, &inv.TotalAmount, &inv.Currency,
		&inv.Status, &inv.GeneratedAt,
	)

	if err != nil {
		return inv, err
	}

	// Load invoice items
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

	// Load user details
	var user models.User
	var language sql.NullString
	err = h.db.QueryRow(`
    	SELECT id, first_name, last_name, email, phone, 
           address_street, address_city, address_zip, address_country,
           COALESCE(language, 'de'), is_active
    	FROM users WHERE id = ?
	`, inv.UserID).Scan(
		&user.ID, &user.FirstName, &user.LastName, &user.Email, &user.Phone,
		&user.AddressStreet, &user.AddressCity, &user.AddressZip, &user.AddressCountry,
		&language, &user.IsActive,
	)

	if language.Valid {
		user.Language = language.String
	} else {
		user.Language = "de"
	}

	if err == nil {
		inv.User = &user
	}

	return inv, nil
}

// Helper function to convert Invoice struct to map for PDF generator
func (h *BillingHandler) invoiceToMap(inv models.Invoice) map[string]interface{} {
	invoiceMap := make(map[string]interface{})

	invoiceMap["id"] = inv.ID
	invoiceMap["invoice_number"] = inv.InvoiceNumber
	invoiceMap["user_id"] = inv.UserID
	invoiceMap["building_id"] = inv.BuildingID
	invoiceMap["period_start"] = inv.PeriodStart
	invoiceMap["period_end"] = inv.PeriodEnd
	invoiceMap["total_amount"] = inv.TotalAmount
	invoiceMap["currency"] = inv.Currency
	invoiceMap["status"] = inv.Status
	invoiceMap["generated_at"] = inv.GeneratedAt.Format("2006-01-02")

	// Convert items
	items := make([]interface{}, len(inv.Items))
	for i, item := range inv.Items {
		itemMap := make(map[string]interface{})
		itemMap["id"] = item.ID
		itemMap["invoice_id"] = item.InvoiceID
		itemMap["description"] = item.Description
		itemMap["quantity"] = item.Quantity
		itemMap["unit_price"] = item.UnitPrice
		itemMap["total_price"] = item.TotalPrice
		itemMap["item_type"] = item.ItemType
		items[i] = itemMap
	}
	invoiceMap["items"] = items

	// Convert user
	if inv.User != nil {
		userMap := make(map[string]interface{})
		userMap["id"] = inv.User.ID
		userMap["first_name"] = inv.User.FirstName
		userMap["last_name"] = inv.User.LastName
		userMap["email"] = inv.User.Email
		userMap["phone"] = inv.User.Phone
		userMap["address_street"] = inv.User.AddressStreet
		userMap["address_city"] = inv.User.AddressCity
		userMap["address_zip"] = inv.User.AddressZip
		userMap["address_country"] = inv.User.AddressCountry
		userMap["language"] = inv.User.Language
		userMap["is_active"] = inv.User.IsActive
		invoiceMap["user"] = userMap
	}

	return invoiceMap
}

func (h *BillingHandler) ListInvoices(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("user_id")
	buildingID := r.URL.Query().Get("building_id")

	log.Printf("Listing invoices - User: %s, Building: %s", userID, buildingID)

	query := `
		SELECT i.id, i.invoice_number, i.user_id, i.building_id, 
		       i.period_start, i.period_end, i.total_amount, i.currency, 
		       i.status, i.generated_at, i.pdf_path
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
		log.Printf("ERROR: Failed to query invoices: %v", err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	invoices := []models.Invoice{}
	for rows.Next() {
		var inv models.Invoice
		var pdfPath sql.NullString
		err := rows.Scan(
			&inv.ID, &inv.InvoiceNumber, &inv.UserID, &inv.BuildingID,
			&inv.PeriodStart, &inv.PeriodEnd, &inv.TotalAmount, &inv.Currency,
			&inv.Status, &inv.GeneratedAt, &pdfPath,
		)
		if err == nil {
			if pdfPath.Valid {
				inv.PDFPath = pdfPath.String
			}
			invoices = append(invoices, inv)
		}
	}

	log.Printf("Found %d invoices", len(invoices))

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

	inv, err := h.loadFullInvoice(id)
	if err == sql.ErrNoRows {
		log.Printf("ERROR: Invoice ID %d not found", id)
		http.Error(w, "Invoice not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Printf("ERROR: Failed to query invoice ID %d: %v", id, err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
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

	// Get PDF path before deletion to clean up file
	var pdfPath sql.NullString
	h.db.QueryRow("SELECT pdf_path FROM invoices WHERE id = ?", id).Scan(&pdfPath)

	// Delete invoice items first
	_, err = h.db.Exec("DELETE FROM invoice_items WHERE invoice_id = ?", id)
	if err != nil {
		log.Printf("ERROR: Failed to delete invoice items for invoice ID %d: %v", id, err)
		http.Error(w, "Failed to delete invoice items", http.StatusInternalServerError)
		return
	}

	// Delete invoice
	_, err = h.db.Exec("DELETE FROM invoices WHERE id = ?", id)
	if err != nil {
		log.Printf("ERROR: Failed to delete invoice ID %d: %v", id, err)
		http.Error(w, "Failed to delete invoice", http.StatusInternalServerError)
		return
	}

	// Delete PDF file if exists
	if pdfPath.Valid && pdfPath.String != "" {
		invoicesDir := "/home/pi/zev-billing/invoices"
		if _, err := os.Stat(invoicesDir); os.IsNotExist(err) {
			invoicesDir = "./invoices"
		}
		fullPath := filepath.Join(invoicesDir, pdfPath.String)
		os.Remove(fullPath) // Ignore errors
	}

	log.Printf("SUCCESS: Deleted invoice ID %d", id)
	h.logToDatabase("Invoice Deleted", fmt.Sprintf("Invoice ID %d deleted", id), getClientIP(r))
	w.WriteHeader(http.StatusNoContent)
}

func (h *BillingHandler) BackupDatabase(w http.ResponseWriter, r *http.Request) {
	// Create a backup of the database
	dbPath := "./zev-billing.db"
	backupName := fmt.Sprintf("zev-billing-backup-%s.db", time.Now().Format("20060102-150405"))

	// Read the database file
	data, err := os.ReadFile(dbPath)
	if err != nil {
		log.Printf("ERROR: Failed to read database for backup: %v", err)
		http.Error(w, "Failed to read database", http.StatusInternalServerError)
		return
	}

	// Set headers for file download
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s", backupName))
	w.Header().Set("Content-Length", fmt.Sprintf("%d", len(data)))

	w.Write(data)
	log.Printf("SUCCESS: Database backup created: %s", backupName)
	h.logToDatabase("Database Backup", fmt.Sprintf("Backup created: %s", backupName), getClientIP(r))
}

func (h *BillingHandler) ExportData(w http.ResponseWriter, r *http.Request) {
	buildingID := r.URL.Query().Get("building_id")
	userID := r.URL.Query().Get("user_id")
	startDate := r.URL.Query().Get("start_date")
	endDate := r.URL.Query().Get("end_date")
	exportType := r.URL.Query().Get("type") // "meters" or "chargers"

	log.Printf("Exporting data - Type: %s, Building: %s, User: %s, Period: %s to %s",
		exportType, buildingID, userID, startDate, endDate)

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
		log.Printf("ERROR: Failed to export data: %v", err)
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

	log.Printf("SUCCESS: Exported data to %s", filename)
	h.logToDatabase("Data Exported", fmt.Sprintf("Type: %s, File: %s", exportType, filename), getClientIP(r))
}

// DownloadPDF serves the generated PDF file for an invoice
func (h *BillingHandler) DownloadPDF(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	invoiceID, err := strconv.Atoi(vars["id"])
	if err != nil {
		http.Error(w, "Invalid invoice ID", http.StatusBadRequest)
		return
	}

	// Get invoice from database to get the invoice number
	var invoiceNumber string
	var pdfPath sql.NullString

	err = h.db.QueryRow(`
		SELECT invoice_number, pdf_path 
		FROM invoices 
		WHERE id = ?
	`, invoiceID).Scan(&invoiceNumber, &pdfPath)

	if err == sql.ErrNoRows {
		http.Error(w, "Invoice not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Printf("Database error: %v", err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	// Determine PDF file path
	var filePath string
	var filename string

	// Get the filename (either from database or construct from invoice number)
	if pdfPath.Valid && pdfPath.String != "" {
		// Check if it's a full path or just filename
		if filepath.IsAbs(pdfPath.String) {
			filePath = pdfPath.String
		} else {
			filename = pdfPath.String
		}
	} else {
		// Construct filename from invoice number
		filename = fmt.Sprintf("%s.pdf", invoiceNumber)
	}

	// If we have a filename (not full path), search in possible directories
	if filePath == "" && filename != "" {
		possibleDirs := []string{
			"/home/pi/zev-billing/backend/invoices",
			"/home/pi/zev-billing/invoices",
			"./invoices",
			"./backend/invoices",
		}

		// Try each directory until we find the file
		for _, dir := range possibleDirs {
			testPath := filepath.Join(dir, filename)
			if _, err := os.Stat(testPath); err == nil {
				filePath = testPath
				log.Printf("Found PDF at: %s", filePath)
				break
			}
		}

		// If still not found, use default directory
		if filePath == "" {
			filePath = filepath.Join("./invoices", filename)
		}
	}

	// Check if file exists
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		log.Printf("PDF file not found: %s", filePath)
		log.Printf("Searched filename: %s", filename)
		log.Printf("Invoice number: %s", invoiceNumber)
		log.Printf("Invoice ID: %d", invoiceID)

		// PDF was never generated or has been deleted
		http.Error(w, "PDF file not found. Please regenerate the invoice from the Billing page.", http.StatusNotFound)
		return
	}

	// Serve the file
	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", fmt.Sprintf("inline; filename=%s.pdf", invoiceNumber))

	http.ServeFile(w, r, filePath)
	log.Printf("Served PDF: %s", filePath)
}

// DebugListPDFs lists all available PDF files for debugging
func (h *BillingHandler) DebugListPDFs(w http.ResponseWriter, r *http.Request) {
	type PDFInfo struct {
		Directory string   `json:"directory"`
		Files     []string `json:"files"`
		Exists    bool     `json:"exists"`
	}

	possibleDirs := []string{
		"/home/pi/zev-billing/backend/invoices",
		"/home/pi/zev-billing/invoices",
		"./invoices",
		"./backend/invoices",
	}

	result := make([]PDFInfo, 0)

	for _, dir := range possibleDirs {
		info := PDFInfo{
			Directory: dir,
			Files:     []string{},
			Exists:    false,
		}

		if entries, err := os.ReadDir(dir); err == nil {
			info.Exists = true
			for _, entry := range entries {
				if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".pdf") {
					info.Files = append(info.Files, entry.Name())
				}
			}
		}

		result = append(result, info)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}