package services

import (
	"database/sql"
	"fmt"
	"log"
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
	log.Printf("Generating bills for buildings %v, users %v, period %s to %s", buildingIDs, userIDs, startDate, endDate)

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
	end = end.Add(24 * time.Hour).Add(-1 * time.Second) // End of day: 23:59:59

	for _, buildingID := range buildingIDs {
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
			log.Printf("No active billing settings for building %d, skipping: %v", buildingID, err)
			continue
		}

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
			log.Printf("Error querying users: %v", err)
			continue
		}

		for userRows.Next() {
			var userID int
			var firstName, lastName, email string
			var chargerIDs sql.NullString
			if err := userRows.Scan(&userID, &firstName, &lastName, &email, &chargerIDs); err != nil {
				continue
			}

			chargerIDStr := ""
			if chargerIDs.Valid {
				chargerIDStr = chargerIDs.String
			}

			invoice, err := bs.generateUserInvoice(userID, buildingID, start, end, settings, chargerIDStr)
			if err != nil {
				log.Printf("Error generating invoice for user %d: %v", userID, err)
				continue
			}

			invoices = append(invoices, *invoice)
			log.Printf("Generated invoice for %s %s: %s %.2f", 
				firstName, lastName, settings.Currency, invoice.TotalAmount)
		}
		userRows.Close()
	}

	return invoices, nil
}

func (bs *BillingService) generateUserInvoice(userID, buildingID int, start, end time.Time, settings models.BillingSettings, chargerIDs string) (*models.Invoice, error) {
	invoiceNumber := fmt.Sprintf("INV-%d-%d-%s", buildingID, userID, time.Now().Format("20060102150405"))

	totalAmount := 0.0
	items := []models.InvoiceItem{}

	// Get meter readings (FROM and TO)
	meterReadingFrom, meterReadingTo, meterName := bs.getMeterReadings(userID, start, end)
	
	// Calculate apartment power consumption using Swiss ZEV standard
	normalPower, solarPower, totalConsumption := bs.calculateZEVConsumption(userID, buildingID, start, end)

	// Add meter reading info as first item
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
	}

	// Add consumption breakdown
	if solarPower > 0 {
		solarCost := solarPower * settings.SolarPowerPrice
		totalAmount += solarCost
		items = append(items, models.InvoiceItem{
			Description: fmt.Sprintf("    Solar Power: %.2f kWh × %.3f %s/kWh", solarPower, settings.SolarPowerPrice, settings.Currency),
			Quantity:    solarPower,
			UnitPrice:   settings.SolarPowerPrice,
			TotalPrice:  solarCost,
			ItemType:    "solar_power",
		})
	}

	if normalPower > 0 {
		normalCost := normalPower * settings.NormalPowerPrice
		totalAmount += normalCost
		items = append(items, models.InvoiceItem{
			Description: fmt.Sprintf("    Normal Power: %.2f kWh × %.3f %s/kWh", normalPower, settings.NormalPowerPrice, settings.Currency),
			Quantity:    normalPower,
			UnitPrice:   settings.NormalPowerPrice,
			TotalPrice:  normalCost,
			ItemType:    "normal_power",
		})
	}

	// Calculate car charging costs - combined totals
	if chargerIDs != "" {
		normalCharging, priorityCharging := bs.calculateChargingConsumption(chargerIDs, start, end)

		if normalCharging > 0 || priorityCharging > 0 {
			// Add separator
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

	result, err := bs.db.Exec(`
		INSERT INTO invoices (
			invoice_number, user_id, building_id, period_start, period_end,
			total_amount, currency, status
		) VALUES (?, ?, ?, ?, ?, ?, ?, 'draft')
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
			log.Printf("Warning: Failed to insert invoice item: %v", err)
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
		Status:        "draft",
		Items:         items,
		GeneratedAt:   time.Now(),
	}

	return invoice, nil
}

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
		log.Printf("Error finding meter for user %d: %v", userID, err)
		return 0, 0, "Unknown Meter"
	}

	// Get reading at or before start date
	var readingFrom sql.NullFloat64
	bs.db.QueryRow(`
		SELECT power_kwh FROM meter_readings 
		WHERE meter_id = ? AND reading_time <= ?
		ORDER BY reading_time DESC LIMIT 1
	`, meterID, start).Scan(&readingFrom)

	// Get reading at or before end date
	var readingTo sql.NullFloat64
	bs.db.QueryRow(`
		SELECT power_kwh FROM meter_readings 
		WHERE meter_id = ? AND reading_time <= ?
		ORDER BY reading_time DESC LIMIT 1
	`, meterID, end).Scan(&readingTo)

	from := 0.0
	to := 0.0
	
	if readingFrom.Valid {
		from = readingFrom.Float64
	}
	if readingTo.Valid {
		to = readingTo.Float64
	}

	return from, to, meterName
}

// calculateZEVConsumption implements Swiss ZEV standard:
// - At each 15-minute interval, check total building consumption and solar generation
// - Distribute solar proportionally based on each apartment's consumption share
// - Remaining consumption is charged as normal power
func (bs *BillingService) calculateZEVConsumption(userID, buildingID int, start, end time.Time) (normal, solar, total float64) {
	log.Printf("Calculating ZEV consumption for user %d in building %d", userID, buildingID)

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
		log.Printf("Error querying timestamps: %v", err)
		return 0, 0, 0
	}
	defer timestampRows.Close()

	totalNormal := 0.0
	totalSolar := 0.0
	totalConsumption := 0.0

	// Process each 15-minute interval
	for timestampRows.Next() {
		var timestamp time.Time
		if err := timestampRows.Scan(&timestamp); err != nil {
			continue
		}

		// Get this user's apartment consumption at this timestamp
		var userConsumption float64
		err := bs.db.QueryRow(`
			SELECT COALESCE(SUM(mr.consumption_kwh), 0)
			FROM meter_readings mr
			JOIN meters m ON mr.meter_id = m.id
			WHERE m.user_id = ? AND m.meter_type = 'apartment_meter'
			AND mr.reading_time = ?
		`, userID, timestamp).Scan(&userConsumption)

		if err != nil || userConsumption == 0 {
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

		if err != nil || totalBuildingConsumption == 0 {
			// No building consumption, all goes to normal
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

		// Distribute solar proportionally
		var userSolar, userNormal float64
		if solarGeneration >= totalBuildingConsumption {
			// Enough solar for everyone - all consumption is solar
			userSolar = userConsumption
			userNormal = 0
		} else {
			// Limited solar - distribute proportionally
			userSolar = solarGeneration * userShare
			userNormal = userConsumption - userSolar
		}

		totalSolar += userSolar
		totalNormal += userNormal
	}

	log.Printf("User %d total - Consumption: %.2f kWh, Normal: %.2f kWh, Solar: %.2f kWh", 
		userID, totalConsumption, totalNormal, totalSolar)
	return totalNormal, totalSolar, totalConsumption
}

func (bs *BillingService) calculateChargingConsumption(chargerIDs string, start, end time.Time) (normal, priority float64) {
	// Calculate normal charging
	err := bs.db.QueryRow(`
		SELECT COALESCE(SUM(power_kwh), 0)
		FROM charger_sessions
		WHERE user_id IN (?) AND mode = 'normal'
		AND session_time >= ? AND session_time <= ?
	`, chargerIDs, start, end).Scan(&normal)

	if err != nil {
		log.Printf("Error calculating normal charging: %v", err)
		normal = 0
	}

	// Calculate priority charging
	err = bs.db.QueryRow(`
		SELECT COALESCE(SUM(power_kwh), 0)
		FROM charger_sessions
		WHERE user_id IN (?) AND mode = 'priority'
		AND session_time >= ? AND session_time <= ?
	`, chargerIDs, start, end).Scan(&priority)

	if err != nil {
		log.Printf("Error calculating priority charging: %v", err)
		priority = 0
	}

	return normal, priority
}