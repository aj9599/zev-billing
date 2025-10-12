package services

import (
	"database/sql"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/aj9599/zev-billing/backend/models"
)

type BillingService struct {
	db *sql.DB
}

func NewBillingService(db *sql.DB) *BillingService {
	return &BillingService{db: db}
}

func (bs *BillingService) GenerateBills(buildingIDs, userIDs []int, startDate, endDate string) ([]models.Invoice, error) {
	log.Printf("=== BILL GENERATION START ===")
	log.Printf("Buildings: %v, Users: %v, Period: %s to %s", buildingIDs, userIDs, startDate, endDate)

	invoices := []models.Invoice{}

	start, err := time.Parse("2006-01-02", startDate)
	if err != nil {
		return nil, fmt.Errorf("invalid start date: %v", err)
	}
	end, err := time.Parse("2006-01-02", endDate)
	if err != nil {
		return nil, fmt.Errorf("invalid end date: %v", err)
	}
	
	// Make end date inclusive - add 24 hours to include the entire end day
	end = end.Add(24 * time.Hour).Add(-1 * time.Second)

	log.Printf("Parsed dates - Start: %s, End: %s", start, end)

	for _, buildingID := range buildingIDs {
		log.Printf("\n--- Processing Building ID: %d ---", buildingID)
		
		var settings models.BillingSettings
		err := bs.db.QueryRow(`
			SELECT id, building_id, normal_power_price, solar_power_price, 
			       car_charging_normal_price, car_charging_priority_price, currency
			FROM billing_settings WHERE building_id = ? AND is_active = 1
			LIMIT 1
		`, buildingID).Scan(
			&settings.ID, &settings.BuildingID, &settings.NormalPowerPrice,
			&settings.SolarPowerPrice, &settings.CarChargingNormalPrice,
			&settings.CarChargingPriorityPrice, &settings.Currency,
		)

		if err != nil {
			log.Printf("ERROR: No active billing settings for building %d: %v", buildingID, err)
			continue
		}

		log.Printf("Billing Settings - Normal: %.3f, Solar: %.3f, Car Normal: %.3f, Car Priority: %.3f %s",
			settings.NormalPowerPrice, settings.SolarPowerPrice,
			settings.CarChargingNormalPrice, settings.CarChargingPriorityPrice, settings.Currency)

		var usersQuery string
		var args []interface{}
		if len(userIDs) > 0 {
			usersQuery = "SELECT id, first_name, last_name, email, charger_ids FROM users WHERE building_id = ? AND id IN (?"
			args = append(args, buildingID, userIDs[0])
			for i := 1; i < len(userIDs); i++ {
				usersQuery += ",?"
				args = append(args, userIDs[i])
			}
			usersQuery += ")"
		} else {
			usersQuery = "SELECT id, first_name, last_name, email, charger_ids FROM users WHERE building_id = ?"
			args = append(args, buildingID)
		}

		userRows, err := bs.db.Query(usersQuery, args...)
		if err != nil {
			log.Printf("ERROR: Failed to query users: %v", err)
			continue
		}

		userCount := 0
		for userRows.Next() {
			var userID int
			var firstName, lastName, email string
			var chargerIDs sql.NullString
			if err := userRows.Scan(&userID, &firstName, &lastName, &email, &chargerIDs); err != nil {
				log.Printf("ERROR: Failed to scan user: %v", err)
				continue
			}

			userCount++
			log.Printf("\n  Processing User #%d: %s %s (ID: %d)", userCount, firstName, lastName, userID)

			chargerIDStr := ""
			if chargerIDs.Valid {
				chargerIDStr = chargerIDs.String
			}

			invoice, err := bs.generateUserInvoice(userID, buildingID, start, end, settings, chargerIDStr)
			if err != nil {
				log.Printf("ERROR: Failed to generate invoice for user %d: %v", userID, err)
				continue
			}

			invoices = append(invoices, *invoice)
			log.Printf("  ✓ Generated invoice %s: %s %.2f", invoice.InvoiceNumber, settings.Currency, invoice.TotalAmount)
		}
		userRows.Close()
		
		log.Printf("--- Building %d: Generated %d invoices ---", buildingID, userCount)
	}

	log.Printf("\n=== BILL GENERATION COMPLETE: %d total invoices ===\n", len(invoices))
	return invoices, nil
}

func (bs *BillingService) generateUserInvoice(userID, buildingID int, start, end time.Time, settings models.BillingSettings, chargerIDs string) (*models.Invoice, error) {
	invoiceNumber := fmt.Sprintf("INV-%d-%d-%s", buildingID, userID, time.Now().Format("20060102150405"))

	totalAmount := 0.0
	items := []models.InvoiceItem{}

	// FIXED: Get meter readings with improved logic
	meterReadingFrom, meterReadingTo, meterName := bs.getMeterReadings(userID, start, end)
	
	// Calculate apartment power consumption using Swiss ZEV standard
	normalPower, solarPower, totalConsumption := bs.calculateZEVConsumption(userID, buildingID, start, end)

	log.Printf("  Meter: %s", meterName)
	log.Printf("  Reading from: %.2f kWh, Reading to: %.2f kWh", meterReadingFrom, meterReadingTo)
	log.Printf("  Calculated consumption: %.2f kWh (Normal: %.2f, Solar: %.2f)", 
		totalConsumption, normalPower, solarPower)

	// Add meter reading info header
	if totalConsumption > 0 {
		items = append(items, models.InvoiceItem{
			Description: fmt.Sprintf("Apartment Meter: %s", meterName),
			Quantity:    0,
			UnitPrice:   0,
			TotalPrice:  0,
			ItemType:    "meter_info",
		})

		items = append(items, models.InvoiceItem{
			Description: fmt.Sprintf("  Reading from %s: %.2f kWh", start.Format("02.01.2006"), meterReadingFrom),
			Quantity:    0,
			UnitPrice:   0,
			TotalPrice:  0,
			ItemType:    "meter_reading_from",
		})

		items = append(items, models.InvoiceItem{
			Description: fmt.Sprintf("  Reading to %s: %.2f kWh", end.Format("02.01.2006"), meterReadingTo),
			Quantity:    0,
			UnitPrice:   0,
			TotalPrice:  0,
			ItemType:    "meter_reading_to",
		})

		items = append(items, models.InvoiceItem{
			Description: fmt.Sprintf("  Total Consumption: %.2f kWh", totalConsumption),
			Quantity:    totalConsumption,
			UnitPrice:   0,
			TotalPrice:  0,
			ItemType:    "total_consumption",
		})

		// Add separator before pricing
		items = append(items, models.InvoiceItem{
			Description: "",
			Quantity:    0,
			UnitPrice:   0,
			TotalPrice:  0,
			ItemType:    "separator",
		})
	}

	// Add consumption breakdown with pricing
	if solarPower > 0 {
		solarCost := solarPower * settings.SolarPowerPrice
		totalAmount += solarCost
		items = append(items, models.InvoiceItem{
			Description: fmt.Sprintf("Solar Power: %.2f kWh × %.3f %s/kWh", solarPower, settings.SolarPowerPrice, settings.Currency),
			Quantity:    solarPower,
			UnitPrice:   settings.SolarPowerPrice,
			TotalPrice:  solarCost,
			ItemType:    "solar_power",
		})
		log.Printf("  Solar Cost: %.2f kWh × %.3f = %.2f %s", solarPower, settings.SolarPowerPrice, solarCost, settings.Currency)
	}

	if normalPower > 0 {
		normalCost := normalPower * settings.NormalPowerPrice
		totalAmount += normalCost
		items = append(items, models.InvoiceItem{
			Description: fmt.Sprintf("Normal Power (Grid): %.2f kWh × %.3f %s/kWh", normalPower, settings.NormalPowerPrice, settings.Currency),
			Quantity:    normalPower,
			UnitPrice:   settings.NormalPowerPrice,
			TotalPrice:  normalCost,
			ItemType:    "normal_power",
		})
		log.Printf("  Normal Cost: %.2f kWh × %.3f = %.2f %s", normalPower, settings.NormalPowerPrice, normalCost, settings.Currency)
	}

	// Calculate car charging costs
	if chargerIDs != "" {
		normalCharging, priorityCharging := bs.calculateChargingConsumption(chargerIDs, start, end)

		if normalCharging > 0 || priorityCharging > 0 {
			items = append(items, models.InvoiceItem{
				Description: "",
				Quantity:    0,
				UnitPrice:   0,
				TotalPrice:  0,
				ItemType:    "separator",
			})

			items = append(items, models.InvoiceItem{
				Description: "Car Charging",
				Quantity:    0,
				UnitPrice:   0,
				TotalPrice:  0,
				ItemType:    "charging_header",
			})
		}

		if normalCharging > 0 {
			normalChargingCost := normalCharging * settings.CarChargingNormalPrice
			totalAmount += normalChargingCost
			items = append(items, models.InvoiceItem{
				Description: fmt.Sprintf("  Normal Mode: %.2f kWh × %.3f %s/kWh", normalCharging, settings.CarChargingNormalPrice, settings.Currency),
				Quantity:    normalCharging,
				UnitPrice:   settings.CarChargingNormalPrice,
				TotalPrice:  normalChargingCost,
				ItemType:    "car_charging_normal",
			})
			log.Printf("  Car Normal: %.2f kWh × %.3f = %.2f %s", normalCharging, settings.CarChargingNormalPrice, normalChargingCost, settings.Currency)
		}

		if priorityCharging > 0 {
			priorityChargingCost := priorityCharging * settings.CarChargingPriorityPrice
			totalAmount += priorityChargingCost
			items = append(items, models.InvoiceItem{
				Description: fmt.Sprintf("  Priority Mode: %.2f kWh × %.3f %s/kWh", priorityCharging, settings.CarChargingPriorityPrice, settings.Currency),
				Quantity:    priorityCharging,
				UnitPrice:   settings.CarChargingPriorityPrice,
				TotalPrice:  priorityChargingCost,
				ItemType:    "car_charging_priority",
			})
			log.Printf("  Car Priority: %.2f kWh × %.3f = %.2f %s", priorityCharging, settings.CarChargingPriorityPrice, priorityChargingCost, settings.Currency)
		}
	}

	log.Printf("  INVOICE TOTAL: %s %.2f", settings.Currency, totalAmount)

	invoiceStatus := "issued"
	
	result, err := bs.db.Exec(`
		INSERT INTO invoices (
			invoice_number, user_id, building_id, period_start, period_end,
			total_amount, currency, status
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, invoiceNumber, userID, buildingID, start.Format("2006-01-02"), end.Format("2006-01-02"),
		totalAmount, settings.Currency, invoiceStatus)

	if err != nil {
		return nil, fmt.Errorf("failed to create invoice: %v", err)
	}

	invoiceID, _ := result.LastInsertId()

	for _, item := range items {
		_, err := bs.db.Exec(`
			INSERT INTO invoice_items (
				invoice_id, description, quantity, unit_price, total_price, item_type
			) VALUES (?, ?, ?, ?, ?, ?)
		`, invoiceID, item.Description, item.Quantity, item.UnitPrice, item.TotalPrice, item.ItemType)
		
		if err != nil {
			log.Printf("WARNING: Failed to insert invoice item: %v", err)
		}
	}

	invoice := &models.Invoice{
		ID:            int(invoiceID),
		InvoiceNumber: invoiceNumber,
		UserID:        userID,
		BuildingID:    buildingID,
		PeriodStart:   start.Format("2006-01-02"),
		PeriodEnd:     end.Format("2006-01-02"),
		TotalAmount:   totalAmount,
		Currency:      settings.Currency,
		Status:        invoiceStatus,
		Items:         items,
		GeneratedAt:   time.Now(),
	}

	return invoice, nil
}

// FIXED: Improved meter reading logic to handle edge cases
func (bs *BillingService) getMeterReadings(userID int, start, end time.Time) (float64, float64, string) {
	var meterName string
	var meterID int
	
	// Get the apartment meter for this user
	err := bs.db.QueryRow(`
		SELECT id, name FROM meters 
		WHERE user_id = ? AND meter_type = 'apartment_meter' 
		AND is_active = 1
		LIMIT 1
	`, userID).Scan(&meterID, &meterName)
	
	if err != nil {
		log.Printf("ERROR: No apartment meter found for user %d: %v", userID, err)
		return 0, 0, "Unknown Meter"
	}

	// FIXED: Get reading at or BEFORE start date (look back up to 7 days if needed)
	var readingFrom sql.NullFloat64
	var readingFromTime time.Time
	
	// Try to find a reading within 7 days before the start date
	err = bs.db.QueryRow(`
		SELECT power_kwh, reading_time FROM meter_readings 
		WHERE meter_id = ? 
		AND reading_time <= ?
		AND reading_time >= ?
		ORDER BY reading_time DESC 
		LIMIT 1
	`, meterID, start, start.Add(-7*24*time.Hour)).Scan(&readingFrom, &readingFromTime)

	if err != nil {
		log.Printf("WARNING: No reading found before start date for meter %d, will use 0", meterID)
	} else {
		log.Printf("  Found start reading: %.2f kWh at %s", readingFrom.Float64, readingFromTime.Format("2006-01-02 15:04:05"))
	}

	// FIXED: Get reading at or BEFORE end date
	var readingTo sql.NullFloat64
	var readingToTime time.Time
	
	err = bs.db.QueryRow(`
		SELECT power_kwh, reading_time FROM meter_readings 
		WHERE meter_id = ? 
		AND reading_time <= ?
		ORDER BY reading_time DESC 
		LIMIT 1
	`, meterID, end).Scan(&readingTo, &readingToTime)

	if err != nil {
		log.Printf("WARNING: No reading found before end date for meter %d", meterID)
	} else {
		log.Printf("  Found end reading: %.2f kWh at %s", readingTo.Float64, readingToTime.Format("2006-01-02 15:04:05"))
	}

	from := 0.0
	to := 0.0
	
	if readingFrom.Valid {
		from = readingFrom.Float64
	}
	if readingTo.Valid {
		to = readingTo.Float64
	}

	// Sanity check
	if to < from {
		log.Printf("ERROR: End reading (%.2f) is less than start reading (%.2f) for meter %d", to, from, meterID)
		return from, from, meterName // Return same value to show 0 consumption
	}

	return from, to, meterName
}

// calculateZEVConsumption implements Swiss ZEV standard with 15-minute interval solar distribution
func (bs *BillingService) calculateZEVConsumption(userID, buildingID int, start, end time.Time) (normal, solar, total float64) {
	log.Printf("    [ZEV] Calculating consumption for user %d in building %d", userID, buildingID)
	log.Printf("    [ZEV] Period: %s to %s", start.Format("2006-01-02 15:04:05"), end.Format("2006-01-02 15:04:05"))

	// Get all unique timestamps where we have readings for this building
	timestampRows, err := bs.db.Query(`
		SELECT DISTINCT mr.reading_time
		FROM meter_readings mr
		JOIN meters m ON mr.meter_id = m.id
		WHERE m.building_id = ?
		AND m.meter_type IN ('apartment_meter', 'solar_meter')
		AND mr.reading_time >= ? AND mr.reading_time <= ?
		ORDER BY mr.reading_time
	`, buildingID, start, end)

	if err != nil {
		log.Printf("    [ZEV] ERROR querying timestamps: %v", err)
		return 0, 0, 0
	}
	defer timestampRows.Close()

	totalNormal := 0.0
	totalSolar := 0.0
	totalConsumption := 0.0
	intervalCount := 0

	// Process each 15-minute interval
	for timestampRows.Next() {
		var timestamp time.Time
		if err := timestampRows.Scan(&timestamp); err != nil {
			continue
		}

		intervalCount++

		// Get this user's apartment consumption at this timestamp
		var userConsumption float64
		err := bs.db.QueryRow(`
			SELECT COALESCE(SUM(mr.consumption_kwh), 0)
			FROM meter_readings mr
			JOIN meters m ON mr.meter_id = m.id
			WHERE m.user_id = ? AND m.meter_type = 'apartment_meter'
			AND mr.reading_time = ?
		`, userID, timestamp).Scan(&userConsumption)

		if err != nil || userConsumption <= 0 {
			continue
		}

		totalConsumption += userConsumption

		// Get total building apartment consumption at this timestamp
		var totalBuildingConsumption float64
		err = bs.db.QueryRow(`
			SELECT COALESCE(SUM(mr.consumption_kwh), 0)
			FROM meter_readings mr
			JOIN meters m ON mr.meter_id = m.id
			WHERE m.building_id = ? AND m.meter_type = 'apartment_meter'
			AND mr.reading_time = ?
		`, buildingID, timestamp).Scan(&totalBuildingConsumption)

		if err != nil || totalBuildingConsumption <= 0 {
			// No building consumption data, count all as normal
			totalNormal += userConsumption
			continue
		}

		// Get solar generation at this timestamp
		var solarGeneration float64
		err = bs.db.QueryRow(`
			SELECT COALESCE(SUM(mr.consumption_kwh), 0)
			FROM meter_readings mr
			JOIN meters m ON mr.meter_id = m.id
			WHERE m.building_id = ? AND m.meter_type = 'solar_meter'
			AND mr.reading_time = ?
		`, buildingID, timestamp).Scan(&solarGeneration)

		if err != nil {
			solarGeneration = 0
		}

		// Calculate this user's share of consumption
		userShare := userConsumption / totalBuildingConsumption

		// Distribute solar proportionally (Swiss ZEV standard)
		var userSolar, userNormal float64
		if solarGeneration >= totalBuildingConsumption {
			// Enough solar for everyone - all consumption is solar-powered
			userSolar = userConsumption
			userNormal = 0
		} else {
			// Limited solar - distribute proportionally based on consumption share
			userSolar = solarGeneration * userShare
			userNormal = userConsumption - userSolar
		}

		totalSolar += userSolar
		totalNormal += userNormal

		// Detailed logging for first few intervals
		if intervalCount <= 5 {
			log.Printf("    [ZEV] %s: User %.3f kWh (%.1f%%), Building %.3f kWh, Solar %.3f kWh → %.3f solar + %.3f grid", 
				timestamp.Format("15:04"), userConsumption, userShare*100, totalBuildingConsumption, 
				solarGeneration, userSolar, userNormal)
		}
	}

	if intervalCount == 0 {
		log.Printf("    [ZEV] WARNING: No intervals found! This means no consumption_kwh data exists for this period")
	} else {
		log.Printf("    [ZEV] Processed %d intervals", intervalCount)
		if totalConsumption > 0 {
			log.Printf("    [ZEV] RESULT - Total: %.2f kWh, Solar: %.2f kWh (%.1f%%), Grid: %.2f kWh (%.1f%%)", 
				totalConsumption, totalSolar, (totalSolar/totalConsumption)*100, totalNormal, (totalNormal/totalConsumption)*100)
		}
	}

	return totalNormal, totalSolar, totalConsumption
}

func (bs *BillingService) calculateChargingConsumption(chargerIDs string, start, end time.Time) (normal, priority float64) {
	idList := strings.Split(strings.TrimSpace(chargerIDs), ",")
	if len(idList) == 0 || (len(idList) == 1 && idList[0] == "") {
		return 0, 0
	}

	placeholders := make([]string, len(idList))
	args := make([]interface{}, 0, len(idList)+2)
	
	for i, id := range idList {
		placeholders[i] = "?"
		args = append(args, strings.TrimSpace(id))
	}
	
	inClause := strings.Join(placeholders, ",")

	normalArgs := append(args, start, end)
	normalQuery := fmt.Sprintf(`
		SELECT COALESCE(SUM(power_kwh), 0)
		FROM charger_sessions
		WHERE charger_id IN (%s) AND mode = 'normal'
		AND session_time >= ? AND session_time <= ?
	`, inClause)
	
	err := bs.db.QueryRow(normalQuery, normalArgs...).Scan(&normal)
	if err != nil {
		log.Printf("ERROR calculating normal charging: %v", err)
		normal = 0
	}

	priorityArgs := append(args, start, end)
	priorityQuery := fmt.Sprintf(`
		SELECT COALESCE(SUM(power_kwh), 0)
		FROM charger_sessions
		WHERE charger_id IN (%s) AND mode = 'priority'
		AND session_time >= ? AND session_time <= ?
	`, inClause)
	
	err = bs.db.QueryRow(priorityQuery, priorityArgs...).Scan(&priority)
	if err != nil {
		log.Printf("ERROR calculating priority charging: %v", err)
		priority = 0
	}

	log.Printf("  Charging - Normal: %.2f kWh, Priority: %.2f kWh", normal, priority)
	return normal, priority
}