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
	
	// Make end date inclusive
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

		log.Printf("Billing Settings - Normal: %.3f, Solar: %.3f %s", 
			settings.NormalPowerPrice, settings.SolarPowerPrice, settings.Currency)

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

	// Get meter readings
	meterReadingFrom, meterReadingTo, meterName := bs.getMeterReadings(userID, start, end)
	
	// FIXED: Calculate consumption using the new method
	normalPower, solarPower, totalConsumption := bs.calculateZEVConsumptionFixed(userID, buildingID, start, end)

	log.Printf("  Meter: %s", meterName)
	log.Printf("  Reading from: %.2f kWh, Reading to: %.2f kWh", meterReadingFrom, meterReadingTo)
	log.Printf("  Calculated consumption: %.2f kWh (Normal: %.2f, Solar: %.2f)", 
		totalConsumption, normalPower, solarPower)

	// Add meter reading info
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

		items = append(items, models.InvoiceItem{
			Description: "",
			Quantity:    0,
			UnitPrice:   0,
			TotalPrice:  0,
			ItemType:    "separator",
		})
	}

	// Add consumption breakdown
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

	// Car charging (unchanged)
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
		}
	}

	log.Printf("  INVOICE TOTAL: %s %.2f", settings.Currency, totalAmount)

	result, err := bs.db.Exec(`
		INSERT INTO invoices (
			invoice_number, user_id, building_id, period_start, period_end,
			total_amount, currency, status
		) VALUES (?, ?, ?, ?, ?, ?, ?, 'issued')
	`, invoiceNumber, userID, buildingID, start.Format("2006-01-02"), end.Format("2006-01-02"),
		totalAmount, settings.Currency)

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
		Status:        "issued",
		Items:         items,
		GeneratedAt:   time.Now(),
	}

	return invoice, nil
}

func (bs *BillingService) getMeterReadings(userID int, start, end time.Time) (float64, float64, string) {
	var meterName string
	var meterID int
	
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

	var readingFrom sql.NullFloat64
	var readingFromTime time.Time
	
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

	if to < from {
		log.Printf("ERROR: End reading (%.2f) < start reading (%.2f) for meter %d", to, from, meterID)
		return from, from, meterName
	}

	return from, to, meterName
}

// FIXED: Calculate consumption by computing differences between power_kwh readings
func (bs *BillingService) calculateZEVConsumptionFixed(userID, buildingID int, start, end time.Time) (normal, solar, total float64) {
	log.Printf("    [ZEV] Calculating consumption for user %d in building %d", userID, buildingID)
	log.Printf("    [ZEV] Period: %s to %s", start.Format("2006-01-02 15:04:05"), end.Format("2006-01-02 15:04:05"))

	// Get all readings for this building, sorted by time
	type ReadingData struct {
		MeterID     int
		MeterType   string
		UserID      sql.NullInt64
		ReadingTime time.Time
		PowerKWh    float64
	}

	rows, err := bs.db.Query(`
		SELECT m.id, m.meter_type, m.user_id, mr.reading_time, mr.power_kwh
		FROM meter_readings mr
		JOIN meters m ON mr.meter_id = m.id
		WHERE m.building_id = ?
		AND m.meter_type IN ('apartment_meter', 'solar_meter')
		AND mr.reading_time >= ? AND mr.reading_time <= ?
		ORDER BY mr.reading_time, m.id
	`, buildingID, start, end)

	if err != nil {
		log.Printf("    [ZEV] ERROR querying readings: %v", err)
		return 0, 0, 0
	}
	defer rows.Close()

	// Store all readings
	allReadings := []ReadingData{}
	for rows.Next() {
		var r ReadingData
		if err := rows.Scan(&r.MeterID, &r.MeterType, &r.UserID, &r.ReadingTime, &r.PowerKWh); err != nil {
			continue
		}
		allReadings = append(allReadings, r)
	}

	if len(allReadings) == 0 {
		log.Printf("    [ZEV] ERROR: No readings found for building %d", buildingID)
		return 0, 0, 0
	}

	// Group by timestamp and compute consumption at each interval
	type IntervalData struct {
		UserConsumption     float64
		BuildingConsumption float64
		SolarProduction     float64
	}

	// Track previous readings for each meter
	prevReadings := make(map[int]float64)
	intervalData := make(map[time.Time]*IntervalData)

	for _, reading := range allReadings {
		timestamp := reading.ReadingTime

		// Initialize interval if needed
		if intervalData[timestamp] == nil {
			intervalData[timestamp] = &IntervalData{}
		}

		// Calculate consumption since last reading
		var consumption float64
		if prevVal, exists := prevReadings[reading.MeterID]; exists {
			consumption = reading.PowerKWh - prevVal
			if consumption < 0 {
				consumption = 0 // Handle meter resets
			}
		}
		prevReadings[reading.MeterID] = reading.PowerKWh

		// Categorize the consumption
		if reading.MeterType == "apartment_meter" {
			if reading.UserID.Valid && int(reading.UserID.Int64) == userID {
				intervalData[timestamp].UserConsumption += consumption
			}
			intervalData[timestamp].BuildingConsumption += consumption
		} else if reading.MeterType == "solar_meter" {
			intervalData[timestamp].SolarProduction += consumption
		}
	}

	// Process each interval
	totalNormal := 0.0
	totalSolar := 0.0
	totalConsumption := 0.0
	intervalCount := 0

	// Sort timestamps
	timestamps := make([]time.Time, 0, len(intervalData))
	for ts := range intervalData {
		timestamps = append(timestamps, ts)
	}

	for i, timestamp := range timestamps {
		if i == 0 {
			continue // Skip first interval (no previous reading to compare)
		}

		data := intervalData[timestamp]
		
		if data.UserConsumption <= 0 {
			continue
		}

		intervalCount++
		totalConsumption += data.UserConsumption

		// Calculate proportional solar distribution
		var userSolar, userNormal float64
		if data.BuildingConsumption > 0 {
			userShare := data.UserConsumption / data.BuildingConsumption

			if data.SolarProduction >= data.BuildingConsumption {
				// Enough solar for everyone
				userSolar = data.UserConsumption
				userNormal = 0
			} else {
				// Limited solar - distribute proportionally
				userSolar = data.SolarProduction * userShare
				userNormal = data.UserConsumption - userSolar
			}
		} else {
			// No building consumption data
			userNormal = data.UserConsumption
			userSolar = 0
		}

		totalSolar += userSolar
		totalNormal += userNormal

		// Log first few intervals
		if intervalCount <= 5 {
			log.Printf("    [ZEV] %s: User %.3f kWh, Building %.3f kWh, Solar %.3f kWh → %.3f solar + %.3f grid", 
				timestamp.Format("15:04"), data.UserConsumption, data.BuildingConsumption, 
				data.SolarProduction, userSolar, userNormal)
		}
	}

	if intervalCount == 0 {
		log.Printf("    [ZEV] WARNING: No valid intervals processed")
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

	if normal > 0 || priority > 0 {
		log.Printf("  Charging - Normal: %.2f kWh, Priority: %.2f kWh", normal, priority)
	}
	return normal, priority
}