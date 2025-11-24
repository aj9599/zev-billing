package services

import (
	"database/sql"
	"encoding/json"
	"log"
	"strconv"
	"strings"
	"time"
)

type AutoBillingScheduler struct {
	db             *sql.DB
	billingService *BillingService
	pdfGenerator   *PDFGenerator
	stopChan       chan bool
}

type ApartmentSelection struct {
	BuildingID    int    `json:"building_id"`
	ApartmentUnit string `json:"apartment_unit"`
	UserID        *int   `json:"user_id,omitempty"`
}

func NewAutoBillingScheduler(db *sql.DB, billingService *BillingService, pdfGenerator *PDFGenerator) *AutoBillingScheduler {
	return &AutoBillingScheduler{
		db:             db,
		billingService: billingService,
		pdfGenerator:   pdfGenerator,
		stopChan:       make(chan bool),
	}
}

// Start the scheduler
func (s *AutoBillingScheduler) Start() {
	log.Println("Auto Billing Scheduler started")

	// Run immediately on startup to catch any missed runs
	go s.checkAndGenerateBills()

	// Then run every hour
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			s.checkAndGenerateBills()
		case <-s.stopChan:
			log.Println("Auto Billing Scheduler stopped")
			return
		}
	}
}

// Stop the scheduler
func (s *AutoBillingScheduler) Stop() {
	s.stopChan <- true
}

// Check and generate bills for configs that are due
func (s *AutoBillingScheduler) checkAndGenerateBills() {
	log.Println("=== Auto Billing Scheduler: Checking for due configurations ===")

	now := time.Now()

	rows, err := s.db.Query(`
		SELECT id, name, building_ids, apartments_json, custom_item_ids, frequency, generation_day,
		       next_run, first_execution_date, is_vzev, sender_name, sender_address, 
		       sender_city, sender_zip, sender_country, bank_name, bank_iban, 
		       bank_account_holder
		FROM auto_billing_configs
		WHERE is_active = 1 AND next_run <= ?
	`, now)

	if err != nil {
		log.Printf("ERROR: Failed to query due configs: %v", err)
		return
	}
	defer rows.Close()

	dueConfigs := 0
	for rows.Next() {
		var id int
		var name, buildingIDsStr string
		var apartmentsJSON sql.NullString
		var customItemIDsStr sql.NullString
		var frequency string
		var generationDay int
		var nextRun time.Time
		var firstExecutionDate sql.NullString
		var isVZEV bool
		var senderName, senderAddress, senderCity, senderZip, senderCountry sql.NullString
		var bankName, bankIBAN, bankAccountHolder sql.NullString

		err := rows.Scan(&id, &name, &buildingIDsStr, &apartmentsJSON, &customItemIDsStr, &frequency,
			&generationDay, &nextRun, &firstExecutionDate, &isVZEV, &senderName, &senderAddress,
			&senderCity, &senderZip, &senderCountry, &bankName, &bankIBAN, &bankAccountHolder)

		if err != nil {
			log.Printf("ERROR: Failed to scan config: %v", err)
			continue
		}

		dueConfigs++
		log.Printf("Processing auto billing config: %s (ID: %d, vZEV: %v)", name, id, isVZEV)

		// Parse building IDs
		buildingIDs := parseIDList(buildingIDsStr)

		if len(buildingIDs) == 0 {
			log.Printf("WARNING: Config %d has no buildings, skipping", id)
			continue
		}

		// Parse custom item IDs
		var customItemIDs []int
		if customItemIDsStr.Valid && customItemIDsStr.String != "" {
			customItemIDs = parseIDList(customItemIDsStr.String)
		}
		log.Printf("Custom items to include: %v", customItemIDs)

		// Parse apartments
		var apartments []ApartmentSelection
		if apartmentsJSON.Valid && apartmentsJSON.String != "" {
			if err := json.Unmarshal([]byte(apartmentsJSON.String), &apartments); err != nil {
				log.Printf("ERROR: Failed to parse apartments JSON for config %d: %v", id, err)
				continue
			}
		}

		// Extract user IDs from apartments (only active users with valid user_id)
		userIDs := []int{}
		for _, apt := range apartments {
			if apt.UserID != nil {
				userIDs = append(userIDs, *apt.UserID)
			}
		}

		if len(userIDs) == 0 {
			log.Printf("WARNING: Config %d has no users with apartments, skipping", id)
			continue
		}

		log.Printf("Found %d apartments with %d active users", len(apartments), len(userIDs))

		// Calculate period based on frequency
		endDate := now.AddDate(0, 0, -1) // Yesterday
		var startDate time.Time

		switch frequency {
		case "monthly":
			startDate = endDate.AddDate(0, -1, 0)
		case "quarterly":
			startDate = endDate.AddDate(0, -3, 0)
		case "half_yearly":
			startDate = endDate.AddDate(0, -6, 0)
		case "yearly":
			startDate = endDate.AddDate(-1, 0, 0)
		default:
			log.Printf("WARNING: Unknown frequency %s for config %d", frequency, id)
			continue
		}

		log.Printf("Generating bills for period: %s to %s (vZEV mode: %v)", startDate.Format("2006-01-02"), endDate.Format("2006-01-02"), isVZEV)

		// Generate bills using the billing service with vZEV flag and custom item IDs
		invoices, err := s.billingService.GenerateBillsWithOptions(buildingIDs, userIDs,
			startDate.Format("2006-01-02"), endDate.Format("2006-01-02"), isVZEV, customItemIDs)

		if err != nil {
			log.Printf("ERROR: Failed to generate bills for config %d: %v", id, err)
			// Continue to next config even if this one fails
			continue
		}

		log.Printf("SUCCESS: Generated %d invoices for config %s", len(invoices), name)

		// Prepare sender and banking info for PDF generation
		senderInfo := SenderInfo{
			Name:    getStringFromNull(senderName),
			Address: getStringFromNull(senderAddress),
			City:    getStringFromNull(senderCity),
			Zip:     getStringFromNull(senderZip),
			Country: getStringFromNull(senderCountry),
		}

		bankingInfo := BankingInfo{
			Name:          getStringFromNull(bankName),
			IBAN:          getStringFromNull(bankIBAN),
			AccountHolder: getStringFromNull(bankAccountHolder),
		}

		// Generate PDFs for each invoice
		successCount := 0
		for _, invoice := range invoices {
			// Load full invoice with items and user details (INCLUDING LANGUAGE)
			fullInvoice, err := s.loadFullInvoice(invoice.ID)
			if err != nil {
				log.Printf("WARNING: Failed to load full invoice %d: %v", invoice.ID, err)
				continue
			}

			// Convert invoice struct to map for PDF generator
			invoiceMap := s.invoiceToMap(fullInvoice)

			// Generate PDF
			pdfPath, err := s.pdfGenerator.GenerateInvoicePDF(invoiceMap, senderInfo, bankingInfo)
			if err != nil {
				log.Printf("WARNING: Failed to generate PDF for invoice %d: %v", invoice.ID, err)
				continue
			}

			// Update invoice with PDF path
			_, err = s.db.Exec("UPDATE invoices SET pdf_path = ? WHERE id = ?", pdfPath, invoice.ID)
			if err != nil {
				log.Printf("WARNING: Failed to update PDF path for invoice %d: %v", invoice.ID, err)
			} else {
				successCount++
			}
		}

		log.Printf("Generated %d invoices with %d PDFs", len(invoices), successCount)

		// Calculate next_run based on current execution
		nextRunTime := calculateNextRun(frequency, generationDay, now)

		_, err = s.db.Exec(`
			UPDATE auto_billing_configs
			SET last_run = ?, next_run = ?, updated_at = CURRENT_TIMESTAMP
			WHERE id = ?
		`, now, nextRunTime, id)

		if err != nil {
			log.Printf("ERROR: Failed to update config %d: %v", id, err)
		} else {
			log.Printf("Updated config %d: next run scheduled for %s", id, nextRunTime.Format("2006-01-02"))
		}

		// Log to admin logs
		details := map[string]interface{}{
			"config_id":       id,
			"config_name":     name,
			"invoices_count":  len(invoices),
			"pdfs_generated":  successCount,
			"period_start":    startDate.Format("2006-01-02"),
			"period_end":      endDate.Format("2006-01-02"),
			"is_vzev":         isVZEV,
			"custom_item_ids": customItemIDs,
		}
		detailsJSON, _ := json.Marshal(details)

		s.db.Exec(`
			INSERT INTO admin_logs (action, details, ip_address)
			VALUES (?, ?, ?)
		`, "auto_billing_generated", string(detailsJSON), "system")
	}

	if dueConfigs == 0 {
		log.Println("No due configurations found")
	} else {
		log.Printf("=== Auto Billing Scheduler: Processed %d configurations ===", dueConfigs)
	}
}

// Helper function to load full invoice with items and user (INCLUDING LANGUAGE)
func (s *AutoBillingScheduler) loadFullInvoice(invoiceID int) (map[string]interface{}, error) {
	inv := make(map[string]interface{})

	var id, userID, buildingID int
	var invoiceNumber, periodStart, periodEnd, currency, status string
	var totalAmount float64
	var generatedAt time.Time

	err := s.db.QueryRow(`
		SELECT i.id, i.invoice_number, i.user_id, i.building_id, 
		       i.period_start, i.period_end, i.total_amount, i.currency, 
		       i.status, i.generated_at
		FROM invoices i WHERE i.id = ?
	`, invoiceID).Scan(
		&id, &invoiceNumber, &userID, &buildingID,
		&periodStart, &periodEnd, &totalAmount, &currency,
		&status, &generatedAt,
	)

	if err != nil {
		return nil, err
	}

	inv["id"] = id
	inv["invoice_number"] = invoiceNumber
	inv["user_id"] = userID
	inv["building_id"] = buildingID
	inv["period_start"] = periodStart
	inv["period_end"] = periodEnd
	inv["total_amount"] = totalAmount
	inv["currency"] = currency
	inv["status"] = status
	inv["generated_at"] = generatedAt.Format("2006-01-02")

	// Load invoice items
	itemRows, err := s.db.Query(`
		SELECT id, invoice_id, description, quantity, unit_price, total_price, item_type
		FROM invoice_items WHERE invoice_id = ?
		ORDER BY id ASC
	`, id)

	if err == nil {
		defer itemRows.Close()
		items := []interface{}{}
		for itemRows.Next() {
			var itemID, invoiceID int
			var description, itemType string
			var quantity, unitPrice, totalPrice float64
			if err := itemRows.Scan(&itemID, &invoiceID, &description,
				&quantity, &unitPrice, &totalPrice, &itemType); err == nil {
				itemMap := make(map[string]interface{})
				itemMap["id"] = itemID
				itemMap["invoice_id"] = invoiceID
				itemMap["description"] = description
				itemMap["quantity"] = quantity
				itemMap["unit_price"] = unitPrice
				itemMap["total_price"] = totalPrice
				itemMap["item_type"] = itemType
				items = append(items, itemMap)
			}
		}
		inv["items"] = items
	}

	// Load user details INCLUDING LANGUAGE
	userMap := make(map[string]interface{})
	var firstName, lastName, email, phone string
	var addressStreet, addressCity, addressZip, addressCountry string
	var language sql.NullString
	var isActive bool

	err = s.db.QueryRow(`
		SELECT id, first_name, last_name, email, phone, 
		       address_street, address_city, address_zip, address_country,
		       COALESCE(language, 'de'), is_active
		FROM users WHERE id = ?
	`, userID).Scan(
		&id, &firstName, &lastName, &email, &phone,
		&addressStreet, &addressCity, &addressZip, &addressCountry,
		&language, &isActive,
	)

	if err == nil {
		userMap["id"] = id
		userMap["first_name"] = firstName
		userMap["last_name"] = lastName
		userMap["email"] = email
		userMap["phone"] = phone
		userMap["address_street"] = addressStreet
		userMap["address_city"] = addressCity
		userMap["address_zip"] = addressZip
		userMap["address_country"] = addressCountry
		userMap["is_active"] = isActive

		// CRITICAL: Include language in user map for PDF generator
		if language.Valid && language.String != "" {
			userMap["language"] = language.String
		} else {
			userMap["language"] = "de" // Default to German
		}

		log.Printf("Loaded user %d with language: %s", userID, userMap["language"])

		inv["user"] = userMap
	} else {
		log.Printf("ERROR: Failed to load user %d: %v", userID, err)
	}

	return inv, nil
}

// Helper function to convert Invoice to map (for compatibility)
func (s *AutoBillingScheduler) invoiceToMap(inv map[string]interface{}) map[string]interface{} {
	// Already in map format
	return inv
}

// Helper function to get string from sql.NullString
func getStringFromNull(ns sql.NullString) string {
	if ns.Valid {
		return ns.String
	}
	return ""
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

// Helper function to calculate next run date
func calculateNextRun(frequency string, generationDay int, currentTime time.Time) time.Time {
	var nextRun time.Time

	switch frequency {
	case "monthly":
		// Start with next month
		nextRun = currentTime.AddDate(0, 1, 0)
		nextRun = time.Date(nextRun.Year(), nextRun.Month(), generationDay, 0, 0, 0, 0, nextRun.Location())

	case "quarterly":
		// Start with 3 months later
		nextRun = currentTime.AddDate(0, 3, 0)
		nextRun = time.Date(nextRun.Year(), nextRun.Month(), generationDay, 0, 0, 0, 0, nextRun.Location())

	case "half_yearly":
		// Start with 6 months later
		nextRun = currentTime.AddDate(0, 6, 0)
		nextRun = time.Date(nextRun.Year(), nextRun.Month(), generationDay, 0, 0, 0, 0, nextRun.Location())

	case "yearly":
		// Start with next year
		nextRun = currentTime.AddDate(1, 0, 0)
		nextRun = time.Date(nextRun.Year(), time.January, generationDay, 0, 0, 0, 0, nextRun.Location())
	}

	return nextRun
}

// Calculate initial next_run when config is created or updated
func CalculateInitialNextRun(frequency string, generationDay int, firstExecutionDate string) time.Time {
	now := time.Now()

	// If first execution date is provided and in the future, use it
	if firstExecutionDate != "" {
		if parsedDate, err := time.Parse("2006-01-02", firstExecutionDate); err == nil {
			if parsedDate.After(now) {
				return parsedDate
			}
		}
	}

	// Otherwise, calculate based on generation day and frequency
	var nextRun time.Time

	switch frequency {
	case "monthly":
		// Try current month first
		nextRun = time.Date(now.Year(), now.Month(), generationDay, 0, 0, 0, 0, now.Location())
		// If that's in the past, use next month
		if nextRun.Before(now) {
			nextRun = nextRun.AddDate(0, 1, 0)
		}

	case "quarterly":
		// Find next quarter month (Jan, Apr, Jul, Oct)
		currentMonth := int(now.Month())
		quarterMonths := []int{1, 4, 7, 10}
		nextQuarterMonth := 1 // Default to January next year

		for _, qm := range quarterMonths {
			if qm > currentMonth {
				nextQuarterMonth = qm
				break
			}
		}

		if nextQuarterMonth < currentMonth {
			// Next occurrence is in January next year
			nextRun = time.Date(now.Year()+1, time.Month(nextQuarterMonth), generationDay, 0, 0, 0, 0, now.Location())
		} else {
			// Next occurrence is this year
			nextRun = time.Date(now.Year(), time.Month(nextQuarterMonth), generationDay, 0, 0, 0, 0, now.Location())
			// If that's in the past, move to next quarter
			if nextRun.Before(now) {
				nextRun = nextRun.AddDate(0, 3, 0)
			}
		}

	case "half_yearly":
		// Find next half-year month (Jan, Jul)
		currentMonth := int(now.Month())

		if currentMonth < 7 {
			// Next occurrence is July this year
			nextRun = time.Date(now.Year(), time.July, generationDay, 0, 0, 0, 0, now.Location())
			if nextRun.Before(now) {
				// July is past, use January next year
				nextRun = time.Date(now.Year()+1, time.January, generationDay, 0, 0, 0, 0, now.Location())
			}
		} else {
			// Next occurrence is January next year
			nextRun = time.Date(now.Year()+1, time.January, generationDay, 0, 0, 0, 0, now.Location())
		}

	case "yearly":
		// Next occurrence is January
		nextRun = time.Date(now.Year(), time.January, generationDay, 0, 0, 0, 0, now.Location())
		// If that's in the past, use next year
		if nextRun.Before(now) {
			nextRun = time.Date(now.Year()+1, time.January, generationDay, 0, 0, 0, 0, now.Location())
		}
	}

	return nextRun
}