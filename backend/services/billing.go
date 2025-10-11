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
			log.Printf("Generated invoice for %s %s: %s %.2f", firstName, lastName, settings.Currency, invoice.TotalAmount)
		}
		userRows.Close()
	}

	return invoices, nil
}

func (bs *BillingService) generateUserInvoice(userID, buildingID int, start, end time.Time, settings models.BillingSettings, chargerIDs string) (*models.Invoice, error) {
	invoiceNumber := fmt.Sprintf("INV-%d-%d-%s", buildingID, userID, time.Now().Format("20060102150405"))

	totalAmount := 0.0
	items := []models.InvoiceItem{}

	// Calculate apartment power consumption using consumption_kwh
	normalPower, solarPower := bs.calculateApartmentConsumption(userID, start, end)

	if normalPower > 0 {
		normalCost := normalPower * settings.NormalPowerPrice
		totalAmount += normalCost
		items = append(items, models.InvoiceItem{
			Description: fmt.Sprintf("Normal Power Consumption (%.2f kWh)", normalPower),
			Quantity:    normalPower,
			UnitPrice:   settings.NormalPowerPrice,
			TotalPrice:  normalCost,
			ItemType:    "normal_power",
		})
	}

	if solarPower > 0 {
		solarCost := solarPower * settings.SolarPowerPrice
		totalAmount += solarCost
		items = append(items, models.InvoiceItem{
			Description: fmt.Sprintf("Solar Power Consumption (%.2f kWh)", solarPower),
			Quantity:    solarPower,
			UnitPrice:   settings.SolarPowerPrice,
			TotalPrice:  solarCost,
			ItemType:    "solar_power",
		})
	}

	// Calculate car charging costs
	if chargerIDs != "" {
		normalCharging, priorityCharging := bs.calculateChargingConsumption(chargerIDs, start, end)

		if normalCharging > 0 {
			normalChargingCost := normalCharging * settings.CarChargingNormalPrice
			totalAmount += normalChargingCost
			items = append(items, models.InvoiceItem{
				Description: fmt.Sprintf("Car Charging - Normal Mode (%.2f kWh)", normalCharging),
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
				Description: fmt.Sprintf("Car Charging - Priority Mode (%.2f kWh)", priorityCharging),
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

func (bs *BillingService) calculateApartmentConsumption(userID int, start, end time.Time) (normal, solar float64) {
	// Use consumption_kwh instead of power_kwh to get actual consumption
	err := bs.db.QueryRow(`
		SELECT COALESCE(SUM(mr.consumption_kwh), 0)
		FROM meter_readings mr
		JOIN meters m ON mr.meter_id = m.id
		WHERE m.user_id = ? AND m.meter_type IN ('apartment_meter', 'heating_meter')
		AND mr.reading_time >= ? AND mr.reading_time <= ?
	`, userID, start, end).Scan(&normal)

	if err != nil {
		log.Printf("Error calculating normal consumption: %v", err)
		normal = 0
	}

	// Calculate solar power consumption
	err = bs.db.QueryRow(`
		SELECT COALESCE(SUM(mr.consumption_kwh), 0)
		FROM meter_readings mr
		JOIN meters m ON mr.meter_id = m.id
		WHERE m.user_id = ? AND m.meter_type = 'solar_meter'
		AND mr.reading_time >= ? AND mr.reading_time <= ?
	`, userID, start, end).Scan(&solar)

	if err != nil {
		log.Printf("Error calculating solar consumption: %v", err)
		solar = 0
	}

	// Adjust: solar can't exceed total consumption
	if solar > normal {
		solar = normal
		normal = 0
	} else {
		normal = normal - solar
	}

	return normal, solar
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