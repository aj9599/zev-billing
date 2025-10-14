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
	stopChan       chan bool
}

func NewAutoBillingScheduler(db *sql.DB, billingService *BillingService) *AutoBillingScheduler {
	return &AutoBillingScheduler{
		db:             db,
		billingService: billingService,
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
		SELECT id, name, building_ids, user_ids, frequency, generation_day,
		       next_run, sender_name, sender_address, sender_city, sender_zip,
		       sender_country, bank_name, bank_iban, bank_account_holder
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
		var name, buildingIDsStr, userIDsStr, frequency string
		var generationDay int
		var nextRun time.Time
		var senderName, senderAddress, senderCity, senderZip, senderCountry sql.NullString
		var bankName, bankIBAN, bankAccountHolder sql.NullString

		err := rows.Scan(&id, &name, &buildingIDsStr, &userIDsStr, &frequency,
			&generationDay, &nextRun, &senderName, &senderAddress, &senderCity,
			&senderZip, &senderCountry, &bankName, &bankIBAN, &bankAccountHolder)

		if err != nil {
			log.Printf("ERROR: Failed to scan config: %v", err)
			continue
		}

		dueConfigs++
		log.Printf("Processing auto billing config: %s (ID: %d)", name, id)

		// Parse building and user IDs
		buildingIDs := parseIDList(buildingIDsStr)
		userIDs := parseIDList(userIDsStr)

		if len(buildingIDs) == 0 {
			log.Printf("WARNING: Config %d has no buildings, skipping", id)
			continue
		}

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

		log.Printf("Generating bills for period: %s to %s", startDate.Format("2006-01-02"), endDate.Format("2006-01-02"))

		// Generate bills using the billing service
		invoices, err := s.billingService.GenerateBills(buildingIDs, userIDs,
			startDate.Format("2006-01-02"), endDate.Format("2006-01-02"))

		if err != nil {
			log.Printf("ERROR: Failed to generate bills for config %d: %v", id, err)
			// Continue to next config even if this one fails
			continue
		}

		log.Printf("SUCCESS: Generated %d invoices for config %s", len(invoices), name)

		// Update last_run and calculate next_run
		nextRunTime := calculateNextRun(frequency, generationDay, &now)

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
			"config_id":      id,
			"config_name":    name,
			"invoices_count": len(invoices),
			"period_start":   startDate.Format("2006-01-02"),
			"period_end":     endDate.Format("2006-01-02"),
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
func calculateNextRun(frequency string, generationDay int, lastRun *time.Time) time.Time {
	now := time.Now()
	var nextRun time.Time

	// Start from last run if available, otherwise start from now
	if lastRun != nil {
		nextRun = *lastRun
	} else {
		nextRun = now
	}

	switch frequency {
	case "monthly":
		nextRun = nextRun.AddDate(0, 1, 0)
		nextRun = time.Date(nextRun.Year(), nextRun.Month(), generationDay, 0, 0, 0, 0, nextRun.Location())

	case "quarterly":
		nextRun = nextRun.AddDate(0, 3, 0)
		nextRun = time.Date(nextRun.Year(), nextRun.Month(), generationDay, 0, 0, 0, 0, nextRun.Location())

	case "half_yearly":
		nextRun = nextRun.AddDate(0, 6, 0)
		nextRun = time.Date(nextRun.Year(), nextRun.Month(), generationDay, 0, 0, 0, 0, nextRun.Location())

	case "yearly":
		nextRun = nextRun.AddDate(1, 0, 0)
		nextRun = time.Date(nextRun.Year(), time.January, generationDay, 0, 0, 0, 0, nextRun.Location())
	}

	// If next run is in the past, keep adding intervals until we're in the future
	for nextRun.Before(now) {
		switch frequency {
		case "monthly":
			nextRun = nextRun.AddDate(0, 1, 0)
		case "quarterly":
			nextRun = nextRun.AddDate(0, 3, 0)
		case "half_yearly":
			nextRun = nextRun.AddDate(0, 6, 0)
		case "yearly":
			nextRun = nextRun.AddDate(1, 0, 0)
		}
	}

	return nextRun
}