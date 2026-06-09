package services

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type AutoBillingScheduler struct {
	db             *sql.DB
	billingService *BillingService
	pdfGenerator   *PDFGenerator
	emailAlerter   *EmailAlerter   // optional — used to send PDF invoices to tenants
	licenseService *LicenseService // optional — gates billing on the free tier
	stopChan       chan bool
}

type ApartmentSelection struct {
	BuildingID    int    `json:"building_id"`
	ApartmentUnit string `json:"apartment_unit"`
	UserID        *int   `json:"user_id,omitempty"`
}

// RunConfigResult summarises a manual test run of an auto-billing config.
// Returned to the UI so the user can see whether the bill was generated and
// whether the e-mail delivery succeeded.
type RunConfigResult struct {
	ConfigID          int      `json:"config_id"`
	ConfigName        string   `json:"config_name"`
	PeriodStart       string   `json:"period_start"`
	PeriodEnd         string   `json:"period_end"`
	InvoicesGenerated int      `json:"invoices_generated"`
	PDFsGenerated     int      `json:"pdfs_generated"`
	EmailsSent        int      `json:"emails_sent"`
	EmailsFailed      int      `json:"emails_failed"`
	EmailRequested    bool     `json:"email_requested"`
	SMTPConfigured    bool     `json:"smtp_configured"`
	FirstInvoiceID    int      `json:"first_invoice_id"`
	InvoiceIDs        []int    `json:"invoice_ids"`
	Warnings          []string `json:"warnings"`
}

func NewAutoBillingScheduler(db *sql.DB, billingService *BillingService, pdfGenerator *PDFGenerator) *AutoBillingScheduler {
	return &AutoBillingScheduler{
		db:             db,
		billingService: billingService,
		pdfGenerator:   pdfGenerator,
		stopChan:       make(chan bool),
	}
}

// SetEmailAlerter wires an EmailAlerter into the scheduler so it can deliver
// the generated PDF invoices to tenants when the auto_send_email flag is set
// on a config. Optional — leaving it nil disables auto-email.
func (s *AutoBillingScheduler) SetEmailAlerter(ea *EmailAlerter) {
	s.emailAlerter = ea
}

// SetLicenseService wires license gating into the scheduler so automated billing
// is blocked when the plan does not include bill generation (free tier).
func (s *AutoBillingScheduler) SetLicenseService(ls *LicenseService) {
	s.licenseService = ls
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
		SELECT id
		FROM auto_billing_configs
		WHERE is_active = 1 AND next_run <= ?
	`, now)

	if err != nil {
		log.Printf("ERROR: Failed to query due configs: %v", err)
		return
	}

	var dueIDs []int
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			log.Printf("ERROR: Failed to scan due config id: %v", err)
			continue
		}
		dueIDs = append(dueIDs, id)
	}
	rows.Close()

	for _, id := range dueIDs {
		if _, err := s.runConfig(id, true); err != nil {
			log.Printf("ERROR: Failed to run due config %d: %v", id, err)
		}
	}

	if len(dueIDs) == 0 {
		log.Println("No due configurations found")
	} else {
		log.Printf("=== Auto Billing Scheduler: Processed %d configurations ===", len(dueIDs))
	}
}

// RunConfigNow generates bills for a single config on demand (manual test run).
// It does NOT advance next_run, so the regular schedule is preserved. Used by
// the "Test" button in the auto-billing UI to verify that a configuration
// produces the expected bill and (optionally) delivers it by e-mail.
func (s *AutoBillingScheduler) RunConfigNow(id int) (*RunConfigResult, error) {
	return s.runConfig(id, false)
}

// runConfig loads a single auto-billing config by id, generates the bills,
// produces PDFs, optionally e-mails them, and updates last_run.
// When advanceSchedule is true, next_run is recalculated for the next cycle —
// this is the path taken by the scheduler. The manual test path (false) leaves
// next_run untouched so the periodic schedule still fires as configured.
func (s *AutoBillingScheduler) runConfig(id int, advanceSchedule bool) (*RunConfigResult, error) {
	if s.licenseService != nil && !s.licenseService.CanBill() {
		return nil, fmt.Errorf("automated billing is not included in the free plan — activate a license")
	}

	now := time.Now()

	var name, buildingIDsStr string
	var apartmentsJSON sql.NullString
	var customItemIDsStr sql.NullString
	var frequency string
	var generationDay int
	var firstExecutionDate sql.NullString
	var isVZEV bool
	var billingMode sql.NullString
	var chargerID sql.NullInt64
	var autoSendEmail bool
	var senderName, senderAddress, senderCity, senderZip, senderCountry sql.NullString
	var bankName, bankIBAN, bankAccountHolder sql.NullString

	err := s.db.QueryRow(`
		SELECT name, building_ids, apartments_json, custom_item_ids, frequency, generation_day,
		       first_execution_date, is_vzev, billing_mode, charger_id,
		       COALESCE(auto_send_email, 0), sender_name, sender_address,
		       sender_city, sender_zip, sender_country, bank_name, bank_iban,
		       bank_account_holder
		FROM auto_billing_configs
		WHERE id = ?
	`, id).Scan(&name, &buildingIDsStr, &apartmentsJSON, &customItemIDsStr, &frequency,
		&generationDay, &firstExecutionDate, &isVZEV, &billingMode, &chargerID,
		&autoSendEmail, &senderName, &senderAddress,
		&senderCity, &senderZip, &senderCountry, &bankName, &bankIBAN, &bankAccountHolder)

	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("auto-billing config %d not found", id)
	}
	if err != nil {
		return nil, fmt.Errorf("failed to load config: %v", err)
	}

	_ = firstExecutionDate // not needed at run time

	result := &RunConfigResult{
		ConfigID:       id,
		ConfigName:     name,
		EmailRequested: autoSendEmail,
	}

	log.Printf("Processing auto billing config: %s (ID: %d, vZEV: %v, advance: %v)", name, id, isVZEV, advanceSchedule)

	buildingIDs := parseIDList(buildingIDsStr)
	if len(buildingIDs) == 0 {
		return nil, fmt.Errorf("config has no buildings")
	}

	var customItemIDs []int
	if customItemIDsStr.Valid && customItemIDsStr.String != "" {
		customItemIDs = parseIDList(customItemIDsStr.String)
	}

	var apartments []ApartmentSelection
	if apartmentsJSON.Valid && apartmentsJSON.String != "" {
		if err := json.Unmarshal([]byte(apartmentsJSON.String), &apartments); err != nil {
			return nil, fmt.Errorf("failed to parse apartments JSON: %v", err)
		}
	}

	userIDs := []int{}
	for _, apt := range apartments {
		if apt.UserID != nil {
			userIDs = append(userIDs, *apt.UserID)
		}
	}
	if len(userIDs) == 0 {
		return nil, fmt.Errorf("config has no users with apartments")
	}

	endDate := now.AddDate(0, 0, -1)
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
		return nil, fmt.Errorf("unknown frequency: %s", frequency)
	}

	result.PeriodStart = startDate.Format("2006-01-02")
	result.PeriodEnd = endDate.Format("2006-01-02")

	scope := BillingScope{}
	if billingMode.Valid {
		switch billingMode.String {
		case BillingModeBuilding:
			scope.Mode = BillingModeBuilding
		case BillingModeCharger:
			scope.Mode = BillingModeCharger
			if chargerID.Valid {
				cid := int(chargerID.Int64)
				scope.ChargerID = &cid
			} else {
				return nil, fmt.Errorf("charger mode requires charger_id")
			}
		}
	}

	log.Printf("Generating bills for period: %s to %s (vZEV mode: %v, scope: %q, charger: %v)",
		result.PeriodStart, result.PeriodEnd, isVZEV, scope.Mode, scope.ChargerID)

	invoices, err := s.billingService.GenerateBillsWithOptions(buildingIDs, userIDs,
		result.PeriodStart, result.PeriodEnd, isVZEV, customItemIDs, scope)

	if err != nil {
		return nil, fmt.Errorf("failed to generate bills: %v", err)
	}

	result.InvoicesGenerated = len(invoices)
	log.Printf("SUCCESS: Generated %d invoices for config %s", len(invoices), name)

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

	result.SMTPConfigured = s.emailAlerter != nil

	for _, invoice := range invoices {
		result.InvoiceIDs = append(result.InvoiceIDs, invoice.ID)
		if result.FirstInvoiceID == 0 {
			result.FirstInvoiceID = invoice.ID
		}

		fullInvoice, err := s.loadFullInvoice(invoice.ID)
		if err != nil {
			result.Warnings = append(result.Warnings, fmt.Sprintf("Failed to load invoice %d: %v", invoice.ID, err))
			continue
		}

		invoiceMap := s.invoiceToMap(fullInvoice)
		pdfPath, err := s.pdfGenerator.GenerateInvoicePDF(invoiceMap, senderInfo, bankingInfo)
		if err != nil {
			result.Warnings = append(result.Warnings, fmt.Sprintf("Failed to generate PDF for invoice %d: %v", invoice.ID, err))
			continue
		}

		if _, err := s.db.Exec("UPDATE invoices SET pdf_path = ? WHERE id = ?", pdfPath, invoice.ID); err != nil {
			result.Warnings = append(result.Warnings, fmt.Sprintf("Failed to update PDF path for invoice %d: %v", invoice.ID, err))
		} else {
			result.PDFsGenerated++
		}

		if autoSendEmail && s.emailAlerter != nil {
			userMap, _ := fullInvoice["user"].(map[string]interface{})
			recipient, _ := userMap["email"].(string)
			if recipient == "" {
				result.EmailsFailed++
				result.Warnings = append(result.Warnings, fmt.Sprintf("Invoice %d: recipient has no e-mail address", invoice.ID))
				log.Printf("[AUTO-BILLING-EMAIL] Config %d invoice %d: recipient has no e-mail, skipping", id, invoice.ID)
			} else {
				// pdfPath returned by the generator is just the filename — resolve
				// it to the actual on-disk location before reading it as an email
				// attachment. The PDF generator writes either to the absolute Pi
				// path or a local ./invoices fallback.
				attachmentPath := resolveInvoicePDFPath(pdfPath)
				subject, body := s.buildInvoiceEmail(fullInvoice)
				if err := s.emailAlerter.SendEmailWithAttachment(recipient, subject, body, attachmentPath); err != nil {
					result.EmailsFailed++
					result.Warnings = append(result.Warnings, fmt.Sprintf("Invoice %d: e-mail to %s failed: %v", invoice.ID, recipient, err))
					log.Printf("[AUTO-BILLING-EMAIL] Config %d invoice %d: failed to send to %s: %v", id, invoice.ID, recipient, err)
				} else {
					result.EmailsSent++
					log.Printf("[AUTO-BILLING-EMAIL] Config %d invoice %d: sent to %s", id, invoice.ID, recipient)
				}
			}
		}
	}

	log.Printf("Generated %d invoices with %d PDFs", result.InvoicesGenerated, result.PDFsGenerated)

	if advanceSchedule {
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
	} else {
		// Manual test run: record last_run only, leave next_run alone.
		if _, err := s.db.Exec(`
			UPDATE auto_billing_configs
			SET last_run = ?, updated_at = CURRENT_TIMESTAMP
			WHERE id = ?
		`, now, id); err != nil {
			log.Printf("ERROR: Failed to update last_run for config %d: %v", id, err)
		}
	}

	details := map[string]interface{}{
		"config_id":       id,
		"config_name":     name,
		"invoices_count":  result.InvoicesGenerated,
		"pdfs_generated":  result.PDFsGenerated,
		"emails_sent":     result.EmailsSent,
		"emails_failed":   result.EmailsFailed,
		"period_start":    result.PeriodStart,
		"period_end":      result.PeriodEnd,
		"is_vzev":         isVZEV,
		"billing_mode":    scope.Mode,
		"charger_id":      scope.ChargerID,
		"custom_item_ids": customItemIDs,
		"manual_test_run": !advanceSchedule,
	}
	detailsJSON, _ := json.Marshal(details)

	action := "auto_billing_generated"
	if !advanceSchedule {
		action = "auto_billing_test_run"
	}
	s.db.Exec(`
		INSERT INTO admin_logs (action, details, ip_address)
		VALUES (?, ?, ?)
	`, action, string(detailsJSON), "system")

	return result, nil
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

// buildInvoiceEmail returns the subject and HTML body for the invoice e-mail.
// If a custom subject/body is configured in email_alert_settings it is used
// (with placeholder substitution); otherwise the built-in bilingual default is
// returned. Supported placeholders: {greeting}, {invoice_number},
// {period_start}, {period_end}.
func (s *AutoBillingScheduler) buildInvoiceEmail(invoice map[string]interface{}) (string, string) {
	userMap, _ := invoice["user"].(map[string]interface{})
	firstName, _ := userMap["first_name"].(string)
	lastName, _ := userMap["last_name"].(string)
	greeting := strings.TrimSpace(fmt.Sprintf("%s %s", firstName, lastName))
	if greeting == "" {
		greeting = "Sehr geehrte Damen und Herren / Dear Sir or Madam"
	} else {
		greeting = "Hallo " + greeting
	}

	invoiceNumber, _ := invoice["invoice_number"].(string)
	periodStart, _ := invoice["period_start"].(string)
	periodEnd, _ := invoice["period_end"].(string)

	var customSubject, customBody string
	// Single-row settings table; ignore the error so a missing row just falls
	// back to the built-in defaults below.
	s.db.QueryRow(`
		SELECT invoice_email_subject, invoice_email_body
		FROM email_alert_settings WHERE id = 1
	`).Scan(&customSubject, &customBody)

	replacer := strings.NewReplacer(
		"{greeting}", greeting,
		"{invoice_number}", invoiceNumber,
		"{period_start}", periodStart,
		"{period_end}", periodEnd,
	)

	subject := strings.TrimSpace(customSubject)
	if subject == "" {
		subject = fmt.Sprintf("Rechnung / Invoice %s", invoiceNumber)
	} else {
		subject = replacer.Replace(subject)
	}

	body := strings.TrimSpace(customBody)
	if body == "" {
		body = fmt.Sprintf(`<html><body style="font-family: Arial, sans-serif; color: #1f2937; line-height:1.6;">
<p>%s,</p>
<p>im Anhang finden Sie Ihre Rechnung <strong>%s</strong> für den Zeitraum %s – %s.<br/>
Please find attached invoice <strong>%s</strong> for the period %s – %s.</p>
<p>Bei Fragen wenden Sie sich bitte an Ihren Verwalter / If you have any questions, please contact your administrator.</p>
<p style="color:#6b7280;font-size:12px;margin-top:24px;">— ZEV Billing</p>
</body></html>`, greeting, invoiceNumber, periodStart, periodEnd, invoiceNumber, periodStart, periodEnd)
	} else {
		body = replacer.Replace(body)
		// Allow admins to enter plain text: when no HTML tag is present, turn
		// line breaks into <br/> and wrap in a minimal styled body.
		if !strings.Contains(body, "<") {
			body = fmt.Sprintf(`<html><body style="font-family: Arial, sans-serif; color: #1f2937; line-height:1.6;">%s</body></html>`,
				strings.ReplaceAll(body, "\n", "<br/>"))
		}
	}

	return subject, body
}

// Helper function to get string from sql.NullString
func getStringFromNull(ns sql.NullString) string {
	if ns.Valid {
		return ns.String
	}
	return ""
}

// resolveInvoicePDFPath turns whatever GenerateInvoicePDF returned (which is
// usually just the filename) into a real on-disk path that os.ReadFile can
// open. Mirrors the directory layout used by main.go's PDF file server and
// the BillingHandler.DownloadPDF resolver.
func resolveInvoicePDFPath(stored string) string {
	if stored == "" {
		return stored
	}
	// Already a real file? Use as-is.
	if _, err := os.Stat(stored); err == nil {
		return stored
	}
	if filepath.IsAbs(stored) {
		return stored
	}
	// Strip any directory prefix the caller may have tacked on so we
	// always search by basename — matches how DownloadPDF resolves.
	base := filepath.Base(stored)
	candidates := []string{
		filepath.Join("/home/pi/zev-billing/backend/invoices", base),
		filepath.Join("/home/pi/zev-billing/invoices", base),
		filepath.Join("./invoices", base),
		filepath.Join("./backend/invoices", base),
	}
	for _, c := range candidates {
		if _, err := os.Stat(c); err == nil {
			return c
		}
	}
	// Nothing matched; return what we had so the caller's error message
	// still makes sense (it will fail to open and surface the original name).
	return stored
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
