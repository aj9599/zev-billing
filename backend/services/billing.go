package services

import (
	"database/sql"
	"encoding/json"
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
				continue
			}

			userCount++
			log.Printf("\n  Processing User #%d: %s %s (ID: %d)", userCount, firstName, lastName, userID)

			rfidCards := ""
			if chargerIDs.Valid {
				rfidCards = chargerIDs.String
			}
			log.Printf("  User RFID cards: '%s'", rfidCards)

			invoice, err := bs.generateUserInvoice(userID, buildingID, start, end, settings, rfidCards)
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

func (bs *BillingService) generateUserInvoice(userID, buildingID int, start, end time.Time, settings models.BillingSettings, rfidCards string) (*models.Invoice, error) {
	invoiceNumber := fmt.Sprintf("INV-%d-%d-%s", buildingID, userID, time.Now().Format("20060102150405"))

	totalAmount := 0.0
	items := []models.InvoiceItem{}

	meterReadingFrom, meterReadingTo, meterName := bs.getMeterReadings(userID, start, end)
	normalPower, solarPower, totalConsumption := bs.calculateZEVConsumptionFixed(userID, buildingID, start, end)

	log.Printf("  Meter: %s", meterName)
	log.Printf("  Reading from: %.2f kWh, Reading to: %.2f kWh", meterReadingFrom, meterReadingTo)
	log.Printf("  Calculated consumption: %.2f kWh (Normal: %.2f, Solar: %.2f)", 
		totalConsumption, normalPower, solarPower)

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

	// FIXED: Enhanced charging calculation with detailed logging
	if rfidCards != "" {
		log.Printf("  [CHARGING] Starting charging calculation for RFID cards: '%s'", rfidCards)
		normalCharging, priorityCharging, firstSession, lastSession := bs.calculateChargingConsumptionFixed(buildingID, rfidCards, start, end)

		log.Printf("  [CHARGING] Results: Normal=%.2f kWh, Priority=%.2f kWh", normalCharging, priorityCharging)

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

			if !firstSession.IsZero() && !lastSession.IsZero() {
				items = append(items, models.InvoiceItem{
					Description: fmt.Sprintf("  First session: %s", firstSession.Format("02.01.2006 15:04")),
					Quantity:    0,
					UnitPrice:   0,
					TotalPrice:  0,
					ItemType:    "charging_session_from",
				})

				items = append(items, models.InvoiceItem{
					Description: fmt.Sprintf("  Last session: %s", lastSession.Format("02.01.2006 15:04")),
					Quantity:    0,
					UnitPrice:   0,
					TotalPrice:  0,
					ItemType:    "charging_session_to",
				})

				totalCharged := normalCharging + priorityCharging
				items = append(items, models.InvoiceItem{
					Description: fmt.Sprintf("  Total Charged: %.2f kWh", totalCharged),
					Quantity:    totalCharged,
					UnitPrice:   0,
					TotalPrice:  0,
					ItemType:    "total_charged",
				})

				items = append(items, models.InvoiceItem{
					Description: "",
					Quantity:    0,
					UnitPrice:   0,
					TotalPrice:  0,
					ItemType:    "separator",
				})
			}

			if normalCharging > 0 {
				normalChargingCost := normalCharging * settings.CarChargingNormalPrice
				totalAmount += normalChargingCost
				items = append(items, models.InvoiceItem{
					Description: fmt.Sprintf("Normal Mode: %.2f kWh × %.3f %s/kWh", normalCharging, settings.CarChargingNormalPrice, settings.Currency),
					Quantity:    normalCharging,
					UnitPrice:   settings.CarChargingNormalPrice,
					TotalPrice:  normalChargingCost,
					ItemType:    "car_charging_normal",
				})
				log.Printf("  Normal Charging: %.2f kWh × %.3f = %.2f %s", normalCharging, settings.CarChargingNormalPrice, normalChargingCost, settings.Currency)
			}

			if priorityCharging > 0 {
				priorityChargingCost := priorityCharging * settings.CarChargingPriorityPrice
				totalAmount += priorityChargingCost
				items = append(items, models.InvoiceItem{
					Description: fmt.Sprintf("Priority Mode: %.2f kWh × %.3f %s/kWh", priorityCharging, settings.CarChargingPriorityPrice, settings.Currency),
					Quantity:    priorityCharging,
					UnitPrice:   settings.CarChargingPriorityPrice,
					TotalPrice:  priorityChargingCost,
					ItemType:    "car_charging_priority",
				})
				log.Printf("  Priority Charging: %.2f kWh × %.3f = %.2f %s", priorityCharging, settings.CarChargingPriorityPrice, priorityChargingCost, settings.Currency)
			}
		} else {
			log.Printf("  [CHARGING] WARNING: No charging consumption calculated despite having RFID cards!")
		}
	} else {
		log.Printf("  [CHARGING] No RFID cards configured for this user - skipping charging calculation")
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

func (bs *BillingService) calculateZEVConsumptionFixed(userID, buildingID int, start, end time.Time) (normal, solar, total float64) {
	log.Printf("    [ZEV] Calculating consumption for user %d in building %d", userID, buildingID)
	log.Printf("    [ZEV] Period: %s to %s", start.Format("2006-01-02 15:04:05"), end.Format("2006-01-02 15:04:05"))

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

	allReadings := []ReadingData{}
	solarReadingsFound := 0
	for rows.Next() {
		var r ReadingData
		if err := rows.Scan(&r.MeterID, &r.MeterType, &r.UserID, &r.ReadingTime, &r.PowerKWh); err != nil {
			continue
		}
		allReadings = append(allReadings, r)
		if r.MeterType == "solar_meter" {
			solarReadingsFound++
		}
	}

	log.Printf("    [ZEV] Fetched %d readings (%d solar)", len(allReadings), solarReadingsFound)

	if len(allReadings) == 0 {
		log.Printf("    [ZEV] ERROR: No readings found")
		return 0, 0, 0
	}

	type IntervalData struct {
		UserConsumption     float64
		BuildingConsumption float64
		SolarProduction     float64
	}

	prevReadings := make(map[int]float64)
	intervalData := make(map[time.Time]*IntervalData)

	for _, reading := range allReadings {
		roundedTime := reading.ReadingTime.Truncate(time.Minute)

		if intervalData[roundedTime] == nil {
			intervalData[roundedTime] = &IntervalData{}
		}

		var consumption float64
		if prevVal, exists := prevReadings[reading.MeterID]; exists {
			consumption = reading.PowerKWh - prevVal
			if consumption < 0 {
				consumption = 0
			}
		} else {
			consumption = 0
		}
		prevReadings[reading.MeterID] = reading.PowerKWh

		if reading.MeterType == "apartment_meter" {
			if reading.UserID.Valid && int(reading.UserID.Int64) == userID {
				intervalData[roundedTime].UserConsumption += consumption
			}
			intervalData[roundedTime].BuildingConsumption += consumption
		} else if reading.MeterType == "solar_meter" {
			intervalData[roundedTime].SolarProduction += consumption
		}
	}

	totalNormal := 0.0
	totalSolar := 0.0
	totalConsumption := 0.0
	intervalCount := 0
	solarUsed := 0.0

	timestamps := make([]time.Time, 0, len(intervalData))
	for ts := range intervalData {
		timestamps = append(timestamps, ts)
	}
	
	for i := 0; i < len(timestamps); i++ {
		for j := i + 1; j < len(timestamps); j++ {
			if timestamps[i].After(timestamps[j]) {
				timestamps[i], timestamps[j] = timestamps[j], timestamps[i]
			}
		}
	}

	for _, timestamp := range timestamps {
		data := intervalData[timestamp]
		
		if data.UserConsumption <= 0 {
			continue
		}

		intervalCount++
		totalConsumption += data.UserConsumption

		var userSolar, userNormal float64
		if data.BuildingConsumption > 0 {
			userShare := data.UserConsumption / data.BuildingConsumption

			if data.SolarProduction >= data.BuildingConsumption {
				userSolar = data.UserConsumption
				userNormal = 0
			} else {
				userSolar = data.SolarProduction * userShare
				userNormal = data.UserConsumption - userSolar
			}
		} else {
			userNormal = data.UserConsumption
			userSolar = 0
		}

		totalSolar += userSolar
		totalNormal += userNormal
		
		if userSolar > 0 {
			solarUsed += userSolar
		}

		if (intervalCount <= 5) || (userSolar > 0 && solarUsed <= userSolar*3) {
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

// COMPLETELY REWRITTEN: Fixed charging calculation with proper session tracking
func (bs *BillingService) calculateChargingConsumptionFixed(buildingID int, rfidCards string, start, end time.Time) (normal, priority float64, firstSession, lastSession time.Time) {
	log.Printf("  [CHARGING] ========================================")
	log.Printf("  [CHARGING] Starting calculation")
	log.Printf("  [CHARGING] Building ID: %d", buildingID)
	log.Printf("  [CHARGING] RFID cards raw: '%s'", rfidCards)
	log.Printf("  [CHARGING] Period: %s to %s", start.Format("2006-01-02 15:04"), end.Format("2006-01-02 15:04"))
	
	// Parse RFID cards
	rfidList := strings.Split(strings.TrimSpace(rfidCards), ",")
	if len(rfidList) == 0 || (len(rfidList) == 1 && rfidList[0] == "") {
		log.Printf("  [CHARGING] ERROR: No RFID cards provided")
		return 0, 0, time.Time{}, time.Time{}
	}

	cleanedRfids := []string{}
	for _, rfid := range rfidList {
		cleaned := strings.TrimSpace(rfid)
		if cleaned != "" {
			cleanedRfids = append(cleanedRfids, cleaned)
		}
	}
	
	if len(cleanedRfids) == 0 {
		log.Printf("  [CHARGING] ERROR: No valid RFID cards after cleanup")
		return 0, 0, time.Time{}, time.Time{}
	}

	log.Printf("  [CHARGING] Cleaned RFID cards: %v", cleanedRfids)

	// Get all chargers in this building
	chargerRows, err := bs.db.Query(`
		SELECT id, name, connection_config FROM chargers 
		WHERE building_id = ? AND is_active = 1
	`, buildingID)
	
	if err != nil {
		log.Printf("  [CHARGING] ERROR: Could not query chargers: %v", err)
		return 0, 0, time.Time{}, time.Time{}
	}
	defer chargerRows.Close()

	type ChargerConfig struct {
		ChargerID          int
		ChargerName        string
		StateCableLocked   string
		StateWaitingAuth   string
		StateCharging      string
		StateIdle          string
		ModeNormal         string
		ModePriority       string
	}

	chargerConfigs := []ChargerConfig{}
	chargerCount := 0

	for chargerRows.Next() {
		var chargerID int
		var chargerName string
		var connConfigJSON string
		
		if err := chargerRows.Scan(&chargerID, &chargerName, &connConfigJSON); err != nil {
			log.Printf("  [CHARGING] ERROR: Failed to scan charger row: %v", err)
			continue
		}

		chargerCount++
		log.Printf("  [CHARGING] Found charger: ID=%d, Name='%s'", chargerID, chargerName)

		var connConfig map[string]interface{}
		if err := json.Unmarshal([]byte(connConfigJSON), &connConfig); err != nil {
			log.Printf("  [CHARGING] ERROR: Could not parse config for charger %d: %v", chargerID, err)
			continue
		}

		config := ChargerConfig{
			ChargerID:        chargerID,
			ChargerName:      chargerName,
			StateCableLocked: "65",
			StateWaitingAuth: "66",
			StateCharging:    "67",
			StateIdle:        "50",
			ModeNormal:       "1",
			ModePriority:     "2",
		}

		if val, ok := connConfig["state_cable_locked"].(string); ok && val != "" {
			config.StateCableLocked = val
		}
		if val, ok := connConfig["state_waiting_auth"].(string); ok && val != "" {
			config.StateWaitingAuth = val
		}
		if val, ok := connConfig["state_charging"].(string); ok && val != "" {
			config.StateCharging = val
		}
		if val, ok := connConfig["state_idle"].(string); ok && val != "" {
			config.StateIdle = val
		}
		if val, ok := connConfig["mode_normal"].(string); ok && val != "" {
			config.ModeNormal = val
		}
		if val, ok := connConfig["mode_priority"].(string); ok && val != "" {
			config.ModePriority = val
		}

		log.Printf("  [CHARGING] Charger %d config: States[locked=%s, auth=%s, charging=%s, idle=%s], Modes[normal=%s, priority=%s]",
			chargerID, config.StateCableLocked, config.StateWaitingAuth, config.StateCharging, 
			config.StateIdle, config.ModeNormal, config.ModePriority)

		chargerConfigs = append(chargerConfigs, config)
	}

	if chargerCount == 0 {
		log.Printf("  [CHARGING] ERROR: No chargers found in building %d", buildingID)
		return 0, 0, time.Time{}, time.Time{}
	}

	log.Printf("  [CHARGING] Loaded %d active chargers in building", len(chargerConfigs))

	// Build query to get sessions for any of the RFID cards
	placeholders := make([]string, len(cleanedRfids))
	args := []interface{}{}
	
	for i, rfid := range cleanedRfids {
		placeholders[i] = "?"
		args = append(args, rfid)
	}
	
	inClause := strings.Join(placeholders, ",")
	args = append(args, start, end)

	query := fmt.Sprintf(`
		SELECT charger_id, user_id, session_time, power_kwh, mode, state
		FROM charger_sessions
		WHERE user_id IN (%s)
		AND session_time >= ? AND session_time <= ?
		ORDER BY charger_id, session_time ASC
	`, inClause)
	
	log.Printf("  [CHARGING] Querying sessions with IN clause for %d RFID cards", len(cleanedRfids))
	
	rows, err := bs.db.Query(query, args...)
	if err != nil {
		log.Printf("  [CHARGING] ERROR querying sessions: %v", err)
		return 0, 0, time.Time{}, time.Time{}
	}
	defer rows.Close()

	type SessionData struct {
		SessionTime time.Time
		PowerKwh    float64
		Mode        string
		State       string
		UserID      string
	}
	
	chargerSessions := make(map[int][]SessionData)
	totalSessionsFound := 0

	for rows.Next() {
		var chargerID int
		var sessionUserID string
		var sessionTime time.Time
		var power float64
		var mode, state string

		if err := rows.Scan(&chargerID, &sessionUserID, &sessionTime, &power, &mode, &state); err != nil {
			log.Printf("  [CHARGING] ERROR scanning session row: %v", err)
			continue
		}

		totalSessionsFound++

		// Log first 10 sessions with all details
		if totalSessionsFound <= 10 {
			log.Printf("  [CHARGING] Session #%d: charger=%d, user='%s', time=%s, power=%.2f, mode='%s', state='%s'",
				totalSessionsFound, chargerID, sessionUserID, sessionTime.Format("2006-01-02 15:04"), 
				power, mode, state)
		}

		if _, exists := chargerSessions[chargerID]; !exists {
			chargerSessions[chargerID] = []SessionData{}
		}

		chargerSessions[chargerID] = append(chargerSessions[chargerID], SessionData{
			SessionTime: sessionTime,
			PowerKwh:    power,
			Mode:        mode,
			State:       state,
			UserID:      sessionUserID,
		})
	}

	log.Printf("  [CHARGING] Found %d total sessions across %d chargers", totalSessionsFound, len(chargerSessions))

	if totalSessionsFound == 0 {
		log.Printf("  [CHARGING] ERROR: No sessions found for RFID cards %v in period", cleanedRfids)
		return 0, 0, time.Time{}, time.Time{}
	}

	normalTotal := 0.0
	priorityTotal := 0.0
	totalBillableSessions := 0
	totalSkippedSessions := 0

	// Process each charger's sessions
	for chargerID, sessions := range chargerSessions {
		// Find config for this charger
		var config *ChargerConfig
		for i := range chargerConfigs {
			if chargerConfigs[i].ChargerID == chargerID {
				config = &chargerConfigs[i]
				break
			}
		}

		if config == nil {
			log.Printf("  [CHARGING] WARNING: No config found for charger %d - skipping %d sessions", 
				chargerID, len(sessions))
			totalSkippedSessions += len(sessions)
			continue
		}

		log.Printf("  [CHARGING] ----------------------------------------")
		log.Printf("  [CHARGING] Processing charger %d (%s) with %d sessions", 
			chargerID, config.ChargerName, len(sessions))

		// FIXED: Get baseline reading for this charger from BEFORE the billing period
		baselineQuery := fmt.Sprintf(`
			SELECT power_kwh, session_time
			FROM charger_sessions
			WHERE charger_id = ?
			AND user_id IN (%s)
			AND session_time < ?
			ORDER BY session_time DESC
			LIMIT 1
		`, inClause)
		
		baselineArgs := []interface{}{chargerID}
		for _, rfid := range cleanedRfids {
			baselineArgs = append(baselineArgs, rfid)
		}
		baselineArgs = append(baselineArgs, start)
		
		var baselinePower float64
		var baselineTime time.Time
		err := bs.db.QueryRow(baselineQuery, baselineArgs...).Scan(&baselinePower, &baselineTime)
		
		var previousPower float64
		var hasPreviousPower bool
		
		if err == nil {
			previousPower = baselinePower
			hasPreviousPower = true
			log.Printf("  [CHARGING] Found baseline: %.2f kWh at %s", baselinePower, baselineTime.Format("2006-01-02 15:04"))
		} else {
			log.Printf("  [CHARGING] No baseline found (using first session as baseline): %v", err)
		}

		chargerBillable := 0
		chargerSkipped := 0
		chargerNormal := 0.0
		chargerPriority := 0.0

		for sessionIdx, session := range sessions {
			sessionNum := sessionIdx + 1
			
			// Check if this session should be billable based on state
			isBillable := true
			if session.State == config.StateIdle || strings.ToLower(session.State) == "idle" {
				isBillable = false
			}
			
			// Log every session for first charger, or first 10 sessions for others
			shouldLog := (chargerID == chargerConfigs[0].ChargerID && sessionNum <= 20) || sessionNum <= 10
			
			if shouldLog {
				if isBillable {
					log.Printf("  [CHARGING]     [%d] %s: %.2f kWh, mode=%s, state=%s → BILLABLE", 
						sessionNum, session.SessionTime.Format("15:04"), session.PowerKwh, session.Mode, session.State)
				} else {
					log.Printf("  [CHARGING]     [%d] %s: %.2f kWh, mode=%s, state=%s → SKIP (idle)", 
						sessionNum, session.SessionTime.Format("15:04"), session.PowerKwh, session.Mode, session.State)
				}
			}
			
			if !isBillable {
				chargerSkipped++
				continue
			}
			
			// Track first and last session times
			if firstSession.IsZero() || session.SessionTime.Before(firstSession) {
				firstSession = session.SessionTime
			}
			if session.SessionTime.After(lastSession) {
				lastSession = session.SessionTime
			}
			
			// Calculate consumption
			if !hasPreviousPower {
				// First session becomes baseline
				previousPower = session.PowerKwh
				hasPreviousPower = true
				if shouldLog {
					log.Printf("  [CHARGING]     [%d] Established baseline at %.2f kWh", sessionNum, session.PowerKwh)
				}
				continue
			}
			
			consumption := session.PowerKwh - previousPower
			
			if consumption < 0 {
				if shouldLog {
					log.Printf("  [CHARGING]     [%d] NEGATIVE consumption %.2f kWh - possible meter reset, resetting baseline", 
						sessionNum, consumption)
				}
				previousPower = session.PowerKwh
				continue
			}
			
			if consumption > 0 {
				chargerBillable++
				
				// Determine mode
				isNormal := (session.Mode == config.ModeNormal || 
					strings.ToLower(session.Mode) == "normal" || 
					session.Mode == "1")
				isPriority := (session.Mode == config.ModePriority || 
					strings.ToLower(session.Mode) == "priority" || 
					session.Mode == "2")
				
				if isNormal {
					chargerNormal += consumption
					if shouldLog {
						log.Printf("  [CHARGING]     [%d] ✓ %.3f kWh NORMAL (%.2f → %.2f)", 
							sessionNum, consumption, previousPower, session.PowerKwh)
					}
				} else if isPriority {
					chargerPriority += consumption
					if shouldLog {
						log.Printf("  [CHARGING]     [%d] ✓ %.3f kWh PRIORITY (%.2f → %.2f)", 
							sessionNum, consumption, previousPower, session.PowerKwh)
					}
				} else {
					// Unknown mode - default to normal
					chargerNormal += consumption
					if shouldLog {
						log.Printf("  [CHARGING]     [%d] ✓ %.3f kWh UNKNOWN mode '%s' → NORMAL (%.2f → %.2f)", 
							sessionNum, consumption, session.Mode, previousPower, session.PowerKwh)
					}
				}
			} else if shouldLog {
				log.Printf("  [CHARGING]     [%d] Zero consumption (%.2f → %.2f)", 
					sessionNum, previousPower, session.PowerKwh)
			}
			
			previousPower = session.PowerKwh
		}
		
		log.Printf("  [CHARGING] Charger %d summary: %d billable, %d skipped, %.2f kWh normal, %.2f kWh priority", 
			chargerID, chargerBillable, chargerSkipped, chargerNormal, chargerPriority)
		
		normalTotal += chargerNormal
		priorityTotal += chargerPriority
		totalBillableSessions += chargerBillable
		totalSkippedSessions += chargerSkipped
	}

	log.Printf("  [CHARGING] ========================================")
	log.Printf("  [CHARGING] FINAL RESULTS:")
	log.Printf("  [CHARGING] Total sessions found: %d", totalSessionsFound)
	log.Printf("  [CHARGING] Billable sessions: %d", totalBillableSessions)
	log.Printf("  [CHARGING] Skipped sessions: %d", totalSkippedSessions)
	log.Printf("  [CHARGING] Normal charging: %.2f kWh", normalTotal)
	log.Printf("  [CHARGING] Priority charging: %.2f kWh", priorityTotal)
	log.Printf("  [CHARGING] Total charging: %.2f kWh", normalTotal+priorityTotal)
	if !firstSession.IsZero() {
		log.Printf("  [CHARGING] First session: %s", firstSession.Format("2006-01-02 15:04"))
		log.Printf("  [CHARGING] Last session: %s", lastSession.Format("2006-01-02 15:04"))
	}
	log.Printf("  [CHARGING] ========================================")

	return normalTotal, priorityTotal, firstSession, lastSession
}