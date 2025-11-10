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

// Helper function to safely extract string from interface{}
func getConfigString(config map[string]interface{}, key string, defaultValue string) string {
	if val, ok := config[key]; ok {
		switch v := val.(type) {
		case string:
			if v != "" {
				return v
			}
		case float64:
			return fmt.Sprintf("%.0f", v)
		case int:
			return fmt.Sprintf("%d", v)
		}
	}
	return defaultValue
}

// UserPeriod represents a user's rental period within the billing period
type UserPeriod struct {
	UserID          int
	FirstName       string
	LastName        string
	Email           string
	ChargerIDs      string
	IsActive        bool
	Language        string
	RentStartDate   time.Time
	RentEndDate     time.Time
	BillingStart    time.Time // Actual billing start for this tenant
	BillingEnd      time.Time // Actual billing end for this tenant
	ProrationFactor float64   // For shared costs only (days in period / total days)
}

func (bs *BillingService) GenerateBills(buildingIDs, userIDs []int, startDate, endDate string) ([]models.Invoice, error) {
	log.Printf("=== BILL GENERATION START ===")
	log.Printf("Buildings: %v, Users: %v, Period: %s to %s", buildingIDs, userIDs, startDate, endDate)

	// VALIDATION: Check if all buildings have active pricing
	buildingsWithoutPricing := []string{}
	for _, buildingID := range buildingIDs {
		var count int
		err := bs.db.QueryRow(`
			SELECT COUNT(*) FROM billing_settings 
			WHERE building_id = ? AND is_active = 1
		`, buildingID).Scan(&count)

		if err != nil || count == 0 {
			var buildingName string
			bs.db.QueryRow("SELECT name FROM buildings WHERE id = ?", buildingID).Scan(&buildingName)
			if buildingName == "" {
				buildingName = fmt.Sprintf("Building ID %d", buildingID)
			}
			buildingsWithoutPricing = append(buildingsWithoutPricing, buildingName)
		}
	}

	if len(buildingsWithoutPricing) > 0 {
		errorMsg := fmt.Sprintf("No active pricing configuration found for the following building(s): %s. Please configure pricing in the Pricing section before generating bills.",
			strings.Join(buildingsWithoutPricing, ", "))
		log.Printf("ERROR: %s", errorMsg)
		return nil, fmt.Errorf(errorMsg)
	}

	invoices := []models.Invoice{}

	start, err := time.Parse("2006-01-02", startDate)
	if err != nil {
		return nil, fmt.Errorf("invalid start date: %v", err)
	}
	end, err := time.Parse("2006-01-02", endDate)
	if err != nil {
		return nil, fmt.Errorf("invalid end date: %v", err)
	}

	// Set end to end of day
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

		log.Printf("Billing Settings - Normal: %.3f, Solar: %.3f, Car Solar: %.3f, Car Priority: %.3f %s",
			settings.NormalPowerPrice, settings.SolarPowerPrice,
			settings.CarChargingNormalPrice, settings.CarChargingPriorityPrice, settings.Currency)

		// Get all users with rent periods overlapping the billing period
		userPeriods, err := bs.getUserPeriodsForBilling(buildingID, userIDs, start, end)
		if err != nil {
			log.Printf("ERROR: Failed to get user periods: %v", err)
			continue
		}

		if len(userPeriods) == 0 {
			log.Printf("WARNING: No active users with valid rent periods found for building %d", buildingID)
			continue
		}

		log.Printf("Found %d user periods to process", len(userPeriods))

		// Process each user period
		for _, userPeriod := range userPeriods {
			log.Printf("\n  Processing User Period: %s %s (ID: %d)", 
				userPeriod.FirstName, userPeriod.LastName, userPeriod.UserID)
			log.Printf("  Billing Period: %s to %s (%.1f%% of total period)",
				userPeriod.BillingStart.Format("2006-01-02"),
				userPeriod.BillingEnd.Format("2006-01-02"),
				userPeriod.ProrationFactor*100)

			invoice, err := bs.generateUserInvoiceForPeriod(userPeriod, buildingID, start, end, settings)
			if err != nil {
				log.Printf("ERROR: Failed to generate invoice for user %d: %v", userPeriod.UserID, err)
				continue
			}

			invoices = append(invoices, *invoice)
			log.Printf("  ✅ Generated invoice %s: %s %.3f", invoice.InvoiceNumber, settings.Currency, invoice.TotalAmount)
		}
	}

	log.Printf("\n=== BILL GENERATION COMPLETE: %d total invoices ===\n", len(invoices))
	return invoices, nil
}

// getUserPeriodsForBilling returns all user periods that overlap with the billing period
func (bs *BillingService) getUserPeriodsForBilling(buildingID int, userIDs []int, start, end time.Time) ([]UserPeriod, error) {
	var usersQuery string
	var args []interface{}

	// Base query - get users with their rent periods
	baseQuery := `
		SELECT id, first_name, last_name, email, charger_ids, is_active, 
		       COALESCE(language, 'de'), rent_start_date, rent_end_date
		FROM users 
		WHERE building_id = ?
	`
	args = append(args, buildingID)

	// Filter by specific user IDs if provided
	if len(userIDs) > 0 {
		placeholders := make([]string, len(userIDs))
		for i, userID := range userIDs {
			placeholders[i] = "?"
			args = append(args, userID)
		}
		usersQuery = baseQuery + " AND id IN (" + strings.Join(placeholders, ",") + ")"
	} else {
		usersQuery = baseQuery
	}

	rows, err := bs.db.Query(usersQuery, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to query users: %v", err)
	}
	defer rows.Close()

	var userPeriods []UserPeriod

	for rows.Next() {
		var userID int
		var firstName, lastName, email string
		var chargerIDs sql.NullString
		var isActive bool
		var language string
		var rentStartStr, rentEndStr sql.NullString

		if err := rows.Scan(&userID, &firstName, &lastName, &email, &chargerIDs, 
			&isActive, &language, &rentStartStr, &rentEndStr); err != nil {
			log.Printf("ERROR: Failed to scan user row: %v", err)
			continue
		}

		// Parse rent periods
		var rentStart, rentEnd time.Time
		var hasRentPeriod bool

		if rentStartStr.Valid && rentStartStr.String != "" {
			if parsed, err := time.Parse("2006-01-02", rentStartStr.String); err == nil {
				rentStart = parsed
				hasRentPeriod = true
			}
		}

		if rentEndStr.Valid && rentEndStr.String != "" {
			if parsed, err := time.Parse("2006-01-02", rentEndStr.String); err == nil {
				rentEnd = parsed
			}
		}

		// If no rent period is defined, use the full billing period
		if !hasRentPeriod {
			log.Printf("  User %d (%s %s) has no rent period - using full billing period", 
				userID, firstName, lastName)
			
			userPeriods = append(userPeriods, UserPeriod{
				UserID:          userID,
				FirstName:       firstName,
				LastName:        lastName,
				Email:           email,
				ChargerIDs:      chargerIDs.String,
				IsActive:        isActive,
				Language:        language,
				RentStartDate:   start,
				RentEndDate:     end,
				BillingStart:    start,
				BillingEnd:      end,
				ProrationFactor: 1.0,
			})
			continue
		}

		// Check if rent period overlaps with billing period
		rentEndsAfterBillingStarts := rentEnd.IsZero() || rentEnd.After(start) || rentEnd.Equal(start)
		rentStartsBeforeBillingEnds := rentStart.Before(end) || rentStart.Equal(start)

		if !rentStartsBeforeBillingEnds || !rentEndsAfterBillingStarts {
			log.Printf("  User %d (%s %s) rent period (%s to %s) does not overlap with billing period - SKIPPING",
				userID, firstName, lastName,
				rentStart.Format("2006-01-02"),
				formatDateOrEmpty(rentEnd))
			continue
		}

		// Calculate the actual billing period for this user
		billingStart := start
		if rentStart.After(start) {
			billingStart = rentStart
		}

		billingEnd := end
		if !rentEnd.IsZero() && rentEnd.Before(end) {
			billingEnd = rentEnd
		}

		// Calculate proration factor (for shared costs like rent, maintenance)
		totalDays := end.Sub(start).Hours() / 24
		userDays := billingEnd.Sub(billingStart).Hours() / 24
		prorationFactor := userDays / totalDays

		log.Printf("  User %d (%s %s): Rent %s to %s, Billing %s to %s (%.1f days / %.1f days = %.3f)",
			userID, firstName, lastName,
			rentStart.Format("2006-01-02"), formatDateOrEmpty(rentEnd),
			billingStart.Format("2006-01-02"), billingEnd.Format("2006-01-02"),
			userDays, totalDays, prorationFactor)

		userPeriods = append(userPeriods, UserPeriod{
			UserID:          userID,
			FirstName:       firstName,
			LastName:        lastName,
			Email:           email,
			ChargerIDs:      chargerIDs.String,
			IsActive:        isActive,
			Language:        language,
			RentStartDate:   rentStart,
			RentEndDate:     rentEnd,
			BillingStart:    billingStart,
			BillingEnd:      billingEnd,
			ProrationFactor: prorationFactor,
		})
	}

	return userPeriods, nil
}

// Helper function to format date or return "ongoing"
func formatDateOrEmpty(t time.Time) string {
	if t.IsZero() {
		return "ongoing"
	}
	return t.Format("2006-01-02")
}

func (bs *BillingService) calculateSharedMeterCosts(buildingID int, start, end time.Time, userID int, totalActiveUsers int) ([]models.InvoiceItem, float64, error) {
	tr := GetTranslations("de")
	return bs.calculateSharedMeterCostsWithTranslations(buildingID, start, end, userID, totalActiveUsers, tr, "CHF", 1.0)
}

func (bs *BillingService) getCustomLineItems(buildingID int) ([]models.InvoiceItem, float64, error) {
	tr := GetTranslations("de")
	return bs.getCustomLineItemsWithTranslations(buildingID, tr, 1.0)
}

func (bs *BillingService) calculateSharedMeterCostsWithTranslations(buildingID int, start, end time.Time, userID int, totalActiveUsers int, tr InvoiceTranslations, currency string, prorationFactor float64) ([]models.InvoiceItem, float64, error) {
	log.Printf("  [SHARED METERS] Calculating shared meter costs for building %d, user %d (%d active users, proration: %.3f)", buildingID, userID, totalActiveUsers, prorationFactor)

	rows, err := bs.db.Query(`
		SELECT id, meter_id, meter_name, split_type, unit_price
		FROM shared_meter_configs
		WHERE building_id = ?
	`, buildingID)
	if err != nil {
		log.Printf("  [SHARED METERS] ERROR: Failed to query shared meter configs: %v", err)
		return nil, 0, err
	}
	defer rows.Close()

	items := []models.InvoiceItem{}
	totalCost := 0.0
	configCount := 0

	for rows.Next() {
		var configID, meterID int
		var meterName, splitType string
		var unitPrice float64

		if err := rows.Scan(&configID, &meterID, &meterName, &splitType, &unitPrice); err != nil {
			log.Printf("  [SHARED METERS] ERROR: Failed to scan config row: %v", err)
			continue
		}

		configCount++
		log.Printf("  [SHARED METERS] Config #%d: Meter '%s' (ID %d), split=%s, price=%.3f",
			configCount, meterName, meterID, splitType, unitPrice)

		var readingFrom, readingTo float64
		err := bs.db.QueryRow(`
			SELECT 
				COALESCE(
					(SELECT reading FROM meter_readings 
					 WHERE meter_id = ? AND timestamp <= ? 
					 ORDER BY timestamp DESC LIMIT 1), 
					0
				) as reading_from,
				COALESCE(
					(SELECT reading FROM meter_readings 
					 WHERE meter_id = ? AND timestamp <= ? 
					 ORDER BY timestamp DESC LIMIT 1), 
					0
				) as reading_to
		`, meterID, start, meterID, end).Scan(&readingFrom, &readingTo)

		if err != nil {
			log.Printf("  [SHARED METERS] ERROR: Failed to get meter readings: %v", err)
			continue
		}

		if readingFrom >= readingTo {
			log.Printf("  [SHARED METERS] WARNING: Invalid readings (from=%.3f, to=%.3f) - skipping",
				readingFrom, readingTo)
			continue
		}

		consumption := readingTo - readingFrom
		totalMeterCost := consumption * unitPrice

		log.Printf("  [SHARED METERS]   Readings: %.3f → %.3f kWh (consumption: %.3f kWh)",
			readingFrom, readingTo, consumption)
		log.Printf("  [SHARED METERS]   Total meter cost: %.3f × %.3f = %.3f",
			consumption, unitPrice, totalMeterCost)

		var userShare float64
		var splitDescription string

		switch splitType {
		case "equal":
			if totalActiveUsers > 0 {
				userShare = totalMeterCost / float64(totalActiveUsers)
				splitDescription = fmt.Sprintf("%s %s %d %s", tr.SplitEqually, tr.Among, totalActiveUsers, tr.Users)
			}
		case "by_area":
			var userArea, totalArea float64
			err := bs.db.QueryRow(`
				SELECT 
					COALESCE((SELECT apartment_area FROM users WHERE id = ? AND apartment_area > 0), 0),
					COALESCE((SELECT SUM(apartment_area) FROM users WHERE building_id = ? AND is_active = 1 AND apartment_area > 0), 0)
			`, userID, buildingID).Scan(&userArea, &totalArea)

			if err == nil && totalArea > 0 && userArea > 0 {
				userShare = totalMeterCost * (userArea / totalArea)
				splitDescription = fmt.Sprintf("Split by area: %.1fm² %s %.1fm² total", userArea, tr.Of, totalArea)
			} else {
				if totalActiveUsers > 0 {
					userShare = totalMeterCost / float64(totalActiveUsers)
				}
				splitDescription = fmt.Sprintf("%s (area data not available) %s %d %s", tr.SplitEqually, tr.Among, totalActiveUsers, tr.Users)
				log.Printf("  [SHARED METERS]   WARNING: Area-based split requested but data missing, using equal split")
			}

		case "by_units":
			var userUnits, totalUnits int
			err := bs.db.QueryRow(`
				SELECT 
					COALESCE((SELECT unit_count FROM users WHERE id = ? AND unit_count > 0), 1),
					COALESCE((SELECT SUM(unit_count) FROM users WHERE building_id = ? AND is_active = 1), ?)
			`, userID, buildingID, totalActiveUsers).Scan(&userUnits, &totalUnits)

			if err == nil && totalUnits > 0 {
				userShare = totalMeterCost * (float64(userUnits) / float64(totalUnits))
				splitDescription = fmt.Sprintf("%s: %d %s %d %s", tr.SplitByUnits, userUnits, tr.Of, totalUnits, tr.TotalUnits)
			} else {
				if totalActiveUsers > 0 {
					userShare = totalMeterCost / float64(totalActiveUsers)
				}
				splitDescription = fmt.Sprintf("%s (unit data not available) %s %d %s", tr.SplitEqually, tr.Among, totalActiveUsers, tr.Users)
				log.Printf("  [SHARED METERS]   WARNING: Unit-based split requested but data missing, using equal split")
			}

		case "custom":
			var customPercentage float64
			err := bs.db.QueryRow(`
				SELECT COALESCE(percentage, 0) 
				FROM shared_meter_custom_splits 
				WHERE config_id = ? AND user_id = ?
			`, configID, userID).Scan(&customPercentage)

			if err == nil && customPercentage > 0 {
				userShare = totalMeterCost * (customPercentage / 100.0)
				splitDescription = fmt.Sprintf("%s: %.1f%%", tr.CustomSplit, customPercentage)
			} else {
				if totalActiveUsers > 0 {
					userShare = totalMeterCost / float64(totalActiveUsers)
				}
				splitDescription = fmt.Sprintf("%s (custom %% not configured) %s %d %s", tr.SplitEqually, tr.Among, totalActiveUsers, tr.Users)
				log.Printf("  [SHARED METERS]   WARNING: Custom split requested but percentage not found, using equal split")
			}

		default:
			if totalActiveUsers > 0 {
				userShare = totalMeterCost / float64(totalActiveUsers)
			}
			splitDescription = fmt.Sprintf("%s %s %d %s", tr.SplitEqually, tr.Among, totalActiveUsers, tr.Users)
		}

		// Apply proration factor for shared costs
		userShare = userShare * prorationFactor
		if prorationFactor < 1.0 {
			splitDescription += fmt.Sprintf(" × %.1f%% of period", prorationFactor*100)
		}

		log.Printf("  [SHARED METERS]   User share: %.3f (%s)", userShare, splitDescription)

		items = append(items, models.InvoiceItem{
			Description: fmt.Sprintf("%s: %s", tr.SharedMeter, meterName),
			Quantity:    0,
			UnitPrice:   0,
			TotalPrice:  0,
			ItemType:    "shared_meter_info",
		})

		items = append(items, models.InvoiceItem{
			Description: fmt.Sprintf("  %s: %.3f kWh × %.3f %s/kWh = %.3f %s", tr.TotalConsumption, consumption, unitPrice, currency, totalMeterCost, currency),
			Quantity:    0,
			UnitPrice:   0,
			TotalPrice:  0,
			ItemType:    "shared_meter_detail",
		})

		items = append(items, models.InvoiceItem{
			Description: fmt.Sprintf("  %s: %.3f %s (%s)", tr.YourShare, userShare, currency, splitDescription),
			Quantity:    consumption / float64(totalActiveUsers),
			UnitPrice:   unitPrice,
			TotalPrice:  userShare,
			ItemType:    "shared_meter_charge",
		})

		items = append(items, models.InvoiceItem{
			Description: "",
			Quantity:    0,
			UnitPrice:   0,
			TotalPrice:  0,
			ItemType:    "separator",
		})

		totalCost += userShare
	}

	if configCount == 0 {
		log.Printf("  [SHARED METERS] No shared meter configurations found for building %d", buildingID)
	} else {
		log.Printf("  [SHARED METERS] Processed %d shared meters, total cost: %.3f", configCount, totalCost)
	}

	return items, totalCost, nil
}

func (bs *BillingService) getCustomLineItemsWithTranslations(buildingID int, tr InvoiceTranslations, prorationFactor float64) ([]models.InvoiceItem, float64, error) {
	log.Printf("  [CUSTOM ITEMS] Getting custom line items for building %d (proration: %.3f)", buildingID, prorationFactor)

	rows, err := bs.db.Query(`
		SELECT id, description, amount, frequency, category
		FROM custom_line_items
		WHERE building_id = ? AND is_active = 1
		ORDER BY category, description
	`, buildingID)
	if err != nil {
		log.Printf("  [CUSTOM ITEMS] ERROR: Failed to query custom line items: %v", err)
		return nil, 0, err
	}
	defer rows.Close()

	items := []models.InvoiceItem{}
	totalCost := 0.0
	itemCount := 0

	for rows.Next() {
		var itemID int
		var description, frequency, category string
		var amount float64

		if err := rows.Scan(&itemID, &description, &amount, &frequency, &category); err != nil {
			log.Printf("  [CUSTOM ITEMS] ERROR: Failed to scan item row: %v", err)
			continue
		}

		itemCount++

		var frequencyLabel string
		switch frequency {
		case "once":
			frequencyLabel = "One-time charge"
		case "monthly":
			frequencyLabel = "Monthly"
		case "quarterly":
			frequencyLabel = "Quarterly"
		case "yearly":
			frequencyLabel = "Yearly"
		default:
			frequencyLabel = frequency
		}

		var categoryLabel string
		switch category {
		case "meter_rent":
			categoryLabel = "Meter Rental"
		case "maintenance":
			categoryLabel = "Maintenance"
		case "service":
			categoryLabel = "Service Fee"
		case "other":
			categoryLabel = "Other"
		default:
			categoryLabel = category
		}

		proratedAmount := amount * prorationFactor
		
		log.Printf("  [CUSTOM ITEMS] Item #%d: %s - %.3f CHF (%.3f before proration) (%s, %s)",
			itemCount, description, proratedAmount, amount, frequencyLabel, categoryLabel)

		if itemCount == 1 {
			items = append(items, models.InvoiceItem{
				Description: "",
				Quantity:    0,
				UnitPrice:   0,
				TotalPrice:  0,
				ItemType:    "separator",
			})
			
			items = append(items, models.InvoiceItem{
				Description: tr.AdditionalServices,
				Quantity:    0,
				UnitPrice:   0,
				TotalPrice:  0,
				ItemType:    "custom_item_header",
			})
		}

		descriptionText := fmt.Sprintf("%s: %s", categoryLabel, description)
		if prorationFactor < 1.0 {
			descriptionText += fmt.Sprintf(" (%.1f%% of period)", prorationFactor*100)
		}

		items = append(items, models.InvoiceItem{
			Description: descriptionText,
			Quantity:    prorationFactor,
			UnitPrice:   amount,
			TotalPrice:  proratedAmount,
			ItemType:    "custom_item",
		})

		totalCost += proratedAmount
	}

	if itemCount == 0 {
		log.Printf("  [CUSTOM ITEMS] No active custom line items found for building %d", buildingID)
	} else {
		log.Printf("  [CUSTOM ITEMS] Added %d custom items, total cost: %.3f", itemCount, totalCost)
	}

	return items, totalCost, nil
}

func (bs *BillingService) countActiveUsers(buildingID int) (int, error) {
	var count int
	err := bs.db.QueryRow(`
		SELECT COUNT(*) 
		FROM users 
		WHERE building_id = ? AND is_active = 1
	`, buildingID).Scan(&count)

	return count, err
}

// Generate invoice for a specific user period with ACTUAL consumption
func (bs *BillingService) generateUserInvoiceForPeriod(userPeriod UserPeriod, buildingID int, fullStart, fullEnd time.Time, settings models.BillingSettings) (*models.Invoice, error) {
	tr := GetTranslations(userPeriod.Language)
	
	invoiceYear := fullStart.Year()
	timestamp := time.Now().Format("20060102150405")
	invoiceNumber := fmt.Sprintf("INV-%d-%d-%d-%s", invoiceYear, buildingID, userPeriod.UserID, timestamp)

	totalAmount := 0.0
	items := []models.InvoiceItem{}

	// Use the user's ACTUAL billing period for consumption calculation
	start := userPeriod.BillingStart
	end := userPeriod.BillingEnd

	// Add proration notice if not full period
	if userPeriod.ProrationFactor < 1.0 {
		items = append(items, models.InvoiceItem{
			Description: fmt.Sprintf("⚠️ %s: %s to %s (%.1f%% of billing period)", 
				tr.PartialPeriod,
				start.Format("02.01.2006"),
				end.Format("02.01.2006"),
				userPeriod.ProrationFactor*100),
			Quantity:    0,
			UnitPrice:   0,
			TotalPrice:  0,
			ItemType:    "proration_notice",
		})
		items = append(items, models.InvoiceItem{
			Description: "",
			Quantity:    0,
			UnitPrice:   0,
			TotalPrice:  0,
			ItemType:    "separator",
		})
	}

	// CRITICAL: Get meter readings for THIS USER'S ACTUAL PERIOD
	meterReadingFrom, meterReadingTo, meterName := bs.getMeterReadings(userPeriod.UserID, start, end)
	
	// CRITICAL: Calculate consumption for THIS USER'S ACTUAL PERIOD
	normalPower, solarPower, totalConsumption := bs.calculateZEVConsumption(userPeriod.UserID, buildingID, start, end)

	log.Printf("  Meter: %s (Period: %s to %s)", meterName, start.Format("2006-01-02"), end.Format("2006-01-02"))
	log.Printf("  Reading from: %.3f kWh, Reading to: %.3f kWh", meterReadingFrom, meterReadingTo)
	log.Printf("  Calculated ACTUAL consumption for this period: %.3f kWh (Normal: %.3f, Solar: %.3f)",
		totalConsumption, normalPower, solarPower)

	if totalConsumption > 0 {
		items = append(items, models.InvoiceItem{
			Description: fmt.Sprintf("%s: %s", tr.ApartmentMeter, meterName),
			Quantity:    0,
			UnitPrice:   0,
			TotalPrice:  0,
			ItemType:    "meter_info",
		})

		items = append(items, models.InvoiceItem{
			Description: fmt.Sprintf("%s: %s-%s | %s: %.3f kWh | %s: %.3f kWh | %s: %.3f kWh",
				tr.Period, start.Format("02.01"), end.Format("02.01"),
				tr.OldReading, meterReadingFrom,
				tr.NewReading, meterReadingTo,
				tr.Consumption, totalConsumption),
			Quantity:    totalConsumption,
			UnitPrice:   0,
			TotalPrice:  0,
			ItemType:    "meter_reading_compact",
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
			Description: fmt.Sprintf("%s: %.3f kWh × %.3f %s/kWh", tr.SolarPower, solarPower, settings.SolarPowerPrice, settings.Currency),
			Quantity:    solarPower,
			UnitPrice:   settings.SolarPowerPrice,
			TotalPrice:  solarCost,
			ItemType:    "solar_power",
		})
		log.Printf("  Solar Cost: %.3f kWh × %.3f = %.3f %s", solarPower, settings.SolarPowerPrice, solarCost, settings.Currency)
	}

	if normalPower > 0 {
		normalCost := normalPower * settings.NormalPowerPrice
		totalAmount += normalCost
		items = append(items, models.InvoiceItem{
			Description: fmt.Sprintf("%s: %.3f kWh × %.3f %s/kWh", tr.NormalPowerGrid, normalPower, settings.NormalPowerPrice, settings.Currency),
			Quantity:    normalPower,
			UnitPrice:   settings.NormalPowerPrice,
			TotalPrice:  normalCost,
			ItemType:    "normal_power",
		})
		log.Printf("  Normal Cost: %.3f kWh × %.3f = %.3f %s", normalPower, settings.NormalPowerPrice, normalCost, settings.Currency)
	}

	// CRITICAL: Car charging for THIS USER'S ACTUAL PERIOD
	if userPeriod.ChargerIDs != "" {
		log.Printf("  [CHARGING] Calculating for period: %s to %s", start.Format("2006-01-02"), end.Format("2006-01-02"))
		normalCharging, priorityCharging, firstSession, lastSession := bs.calculateChargingConsumption(buildingID, userPeriod.ChargerIDs, start, end)

		log.Printf("  [CHARGING] Results: Solar=%.3f kWh, Priority=%.3f kWh", normalCharging, priorityCharging)

		if normalCharging > 0 || priorityCharging > 0 {
			items = append(items, models.InvoiceItem{
				Description: "",
				Quantity:    0,
				UnitPrice:   0,
				TotalPrice:  0,
				ItemType:    "separator",
			})

			items = append(items, models.InvoiceItem{
				Description: tr.CarCharging,
				Quantity:    0,
				UnitPrice:   0,
				TotalPrice:  0,
				ItemType:    "charging_header",
			})

			if !firstSession.IsZero() && !lastSession.IsZero() {
				totalCharged := normalCharging + priorityCharging
				items = append(items, models.InvoiceItem{
					Description: fmt.Sprintf("%s: %s - %s | %s: %.3f kWh",
						tr.Period,
						firstSession.Format("02.01 15:04"),
						lastSession.Format("02.01 15:04"),
						tr.Total,
						totalCharged),
					Quantity:    totalCharged,
					UnitPrice:   0,
					TotalPrice:  0,
					ItemType:    "charging_session_compact",
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
					Description: fmt.Sprintf("%s: %.3f kWh × %.3f %s/kWh", tr.SolarMode, normalCharging, settings.CarChargingNormalPrice, settings.Currency),
					Quantity:    normalCharging,
					UnitPrice:   settings.CarChargingNormalPrice,
					TotalPrice:  normalChargingCost,
					ItemType:    "car_charging_normal",
				})
				log.Printf("  Solar Charging: %.3f kWh × %.3f = %.3f %s", normalCharging, settings.CarChargingNormalPrice, normalChargingCost, settings.Currency)
			}

			if priorityCharging > 0 {
				priorityChargingCost := priorityCharging * settings.CarChargingPriorityPrice
				totalAmount += priorityChargingCost
				items = append(items, models.InvoiceItem{
					Description: fmt.Sprintf("%s: %.3f kWh × %.3f %s/kWh", tr.PriorityMode, priorityCharging, settings.CarChargingPriorityPrice, settings.Currency),
					Quantity:    priorityCharging,
					UnitPrice:   settings.CarChargingPriorityPrice,
					TotalPrice:  priorityChargingCost,
					ItemType:    "car_charging_priority",
				})
				log.Printf("  Priority Charging: %.3f kWh × %.3f = %.3f %s", priorityCharging, settings.CarChargingPriorityPrice, priorityChargingCost, settings.Currency)
			}
		}
	}

	// Shared meters and custom items ARE pro-rated by days
	totalActiveUsers, err := bs.countActiveUsers(buildingID)
	if err != nil || totalActiveUsers == 0 {
		totalActiveUsers = 1
	}
	log.Printf("  Total active users in building: %d", totalActiveUsers)

	log.Printf("  Checking for shared meters (pro-rated by %.1f%% of period)...", userPeriod.ProrationFactor*100)
	sharedMeterItems, sharedMeterCost, err := bs.calculateSharedMeterCostsWithTranslations(
		buildingID, start, end, userPeriod.UserID, totalActiveUsers, tr, settings.Currency, userPeriod.ProrationFactor,
	)
	if err != nil {
		log.Printf("  WARNING: Failed to calculate shared meter costs: %v", err)
	} else if len(sharedMeterItems) > 0 {
		items = append(items, sharedMeterItems...)
		totalAmount += sharedMeterCost
		log.Printf("  ✅ Added %d shared meter items (total: %.3f)", len(sharedMeterItems), sharedMeterCost)
	}

	log.Printf("  Checking for custom line items (pro-rated by %.1f%% of period)...", userPeriod.ProrationFactor*100)
	customItems, customCost, err := bs.getCustomLineItemsWithTranslations(buildingID, tr, userPeriod.ProrationFactor)
	if err != nil {
		log.Printf("  WARNING: Failed to get custom line items: %v", err)
	} else if len(customItems) > 0 {
		items = append(items, customItems...)
		totalAmount += customCost
		log.Printf("  ✅ Added %d custom items (total: %.3f)", len(customItems), customCost)
	}

	log.Printf("  INVOICE TOTAL: %s %.3f", settings.Currency, totalAmount)
	log.Printf("  INVOICE NUMBER: %s (Year: %d)", invoiceNumber, invoiceYear)

	result, err := bs.db.Exec(`
		INSERT INTO invoices (
			invoice_number, user_id, building_id, period_start, period_end,
			total_amount, currency, status
		) VALUES (?, ?, ?, ?, ?, ?, ?, 'issued')
	`, invoiceNumber, userPeriod.UserID, buildingID, fullStart.Format("2006-01-02"), fullEnd.Format("2006-01-02"),
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
		UserID:        userPeriod.UserID,
		BuildingID:    buildingID,
		PeriodStart:   fullStart.Format("2006-01-02"),
		PeriodEnd:     fullEnd.Format("2006-01-02"),
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
		log.Printf("  Found start reading: %.3f kWh at %s", readingFrom.Float64, readingFromTime.Format("2006-01-02 15:04:05"))
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
		log.Printf("  Found end reading: %.3f kWh at %s", readingTo.Float64, readingToTime.Format("2006-01-02 15:04:05"))
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
		log.Printf("ERROR: End reading (%.3f) < start reading (%.3f) for meter %d", to, from, meterID)
		return from, from, meterName
	}

	return from, to, meterName
}

// ZEV calculation using data at fixed 15-minute intervals
// FIXED: Now uses ConsumptionExport for solar meters (export energy)
func (bs *BillingService) calculateZEVConsumption(userID, buildingID int, start, end time.Time) (normal, solar, total float64) {
	log.Printf("    [ZEV] Calculating consumption for user %d in building %d", userID, buildingID)
	log.Printf("    [ZEV] Period: %s to %s", start.Format("2006-01-02 15:04:05"), end.Format("2006-01-02 15:04:05"))

	type ReadingData struct {
		MeterID        int
		MeterType      string
		UserID         sql.NullInt64
		ReadingTime    time.Time
		ConsumptionKWh float64
		ConsumptionExport float64  // NEW: For solar export energy
	}

	// FIXED: Now also fetch consumption_export for solar meters
	rows, err := bs.db.Query(`
		SELECT m.id, m.meter_type, m.user_id, mr.reading_time, mr.consumption_kwh, mr.consumption_export
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
		if err := rows.Scan(&r.MeterID, &r.MeterType, &r.UserID, &r.ReadingTime, &r.ConsumptionKWh, &r.ConsumptionExport); err != nil {
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
		SolarProduction     float64  // FIXED: Now uses export energy
	}

	intervalData := make(map[time.Time]*IntervalData)

	for _, reading := range allReadings {
		roundedTime := reading.ReadingTime

		if intervalData[roundedTime] == nil {
			intervalData[roundedTime] = &IntervalData{}
		}

		if reading.MeterType == "apartment_meter" {
			if reading.UserID.Valid && int(reading.UserID.Int64) == userID {
				intervalData[roundedTime].UserConsumption += reading.ConsumptionKWh
			}
			intervalData[roundedTime].BuildingConsumption += reading.ConsumptionKWh
		} else if reading.MeterType == "solar_meter" {
			// FIXED: Use ConsumptionExport for solar production (export energy)
			intervalData[roundedTime].SolarProduction += reading.ConsumptionExport
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
		log.Printf("    [ZEV] Processed %d intervals (15-minute fixed intervals)", intervalCount)
		if totalConsumption > 0 {
			log.Printf("    [ZEV] RESULT - Total: %.3f kWh, Solar: %.3f kWh (%.1f%%), Grid: %.3f kWh (%.1f%%)",
				totalConsumption, totalSolar, (totalSolar/totalConsumption)*100, totalNormal, (totalNormal/totalConsumption)*100)
		}
	}

	return totalNormal, totalSolar, totalConsumption
}

// Charging calculation using data at fixed 15-minute intervals
func (bs *BillingService) calculateChargingConsumption(buildingID int, rfidCards string, start, end time.Time) (normal, priority float64, firstSession, lastSession time.Time) {
	log.Printf("  [CHARGING] ========================================")
	log.Printf("  [CHARGING] Starting calculation")
	log.Printf("  [CHARGING] Building ID: %d", buildingID)
	log.Printf("  [CHARGING] RFID cards raw: '%s'", rfidCards)
	log.Printf("  [CHARGING] Period: %s to %s", start.Format("2006-01-02 15:04"), end.Format("2006-01-02 15:04"))

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
		ChargerID        int
		ChargerName      string
		StateCableLocked string
		StateWaitingAuth string
		StateCharging    string
		StateIdle        string
		ModeNormal       string
		ModePriority     string
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
			StateCableLocked: getConfigString(connConfig, "state_cable_locked", "65"),
			StateWaitingAuth: getConfigString(connConfig, "state_waiting_auth", "66"),
			StateCharging:    getConfigString(connConfig, "state_charging", "67"),
			StateIdle:        getConfigString(connConfig, "state_idle", "50"),
			ModeNormal:       getConfigString(connConfig, "mode_normal", "1"),
			ModePriority:     getConfigString(connConfig, "mode_priority", "2"),
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

		if totalSessionsFound <= 10 {
			log.Printf("  [CHARGING] Session #%d: charger=%d, user='%s', time=%s, power=%.3f, mode='%s', state='%s'",
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

	log.Printf("  [CHARGING] Found %d total sessions across %d chargers (at 15-min intervals)", totalSessionsFound, len(chargerSessions))

	if totalSessionsFound == 0 {
		log.Printf("  [CHARGING] ERROR: No sessions found for RFID cards %v in period", cleanedRfids)
		return 0, 0, time.Time{}, time.Time{}
	}

	normalTotal := 0.0
	priorityTotal := 0.0
	totalBillableSessions := 0
	totalSkippedSessions := 0

	for chargerID, sessions := range chargerSessions {
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

		var previousPower float64
		var hasPreviousPower bool

		chargerBillable := 0
		chargerSkipped := 0
		chargerNormal := 0.0
		chargerPriority := 0.0

		for sessionIdx, session := range sessions {
			sessionNum := sessionIdx + 1

			isBillable := true
			if session.State == config.StateIdle {
				isBillable = false
			}

			shouldLog := (chargerID == chargerConfigs[0].ChargerID && sessionNum <= 20) || sessionNum <= 10

			if shouldLog {
				if isBillable {
					log.Printf("  [CHARGING]     [%d] %s: %.3f kWh, mode=%s, state=%s → BILLABLE",
						sessionNum, session.SessionTime.Format("15:04"), session.PowerKwh, session.Mode, session.State)
				} else {
					log.Printf("  [CHARGING]     [%d] %s: %.3f kWh, mode=%s, state=%s → SKIP (idle)",
						sessionNum, session.SessionTime.Format("15:04"), session.PowerKwh, session.Mode, session.State)
				}
			}

			if !isBillable {
				chargerSkipped++
				continue
			}

			if firstSession.IsZero() || session.SessionTime.Before(firstSession) {
				firstSession = session.SessionTime
			}
			if session.SessionTime.After(lastSession) {
				lastSession = session.SessionTime
			}

			if !hasPreviousPower {
				previousPower = session.PowerKwh
				hasPreviousPower = true
				if shouldLog {
					log.Printf("  [CHARGING]     [%d] Established baseline at %.3f kWh", sessionNum, session.PowerKwh)
				}
				continue
			}

			consumption := session.PowerKwh - previousPower

			if consumption < 0 {
				if shouldLog {
					log.Printf("  [CHARGING]     [%d] NEGATIVE consumption %.3f kWh - meter reset, resetting baseline",
						sessionNum, consumption)
				}
				previousPower = session.PowerKwh
				continue
			}

			if consumption > 0 {
				chargerBillable++

				isNormal := (session.Mode == config.ModeNormal)
				isPriority := (session.Mode == config.ModePriority)

				if isNormal {
					chargerNormal += consumption
					if shouldLog {
						log.Printf("  [CHARGING]     [%d] ✓ %.3f kWh NORMAL (%.3f → %.3f)",
							sessionNum, consumption, previousPower, session.PowerKwh)
					}
				} else if isPriority {
					chargerPriority += consumption
					if shouldLog {
						log.Printf("  [CHARGING]     [%d] ✓ %.3f kWh PRIORITY (%.3f → %.3f)",
							sessionNum, consumption, previousPower, session.PowerKwh)
					}
				} else {
					chargerNormal += consumption
					if shouldLog {
						log.Printf("  [CHARGING]     [%d] ✓ %.3f kWh UNKNOWN mode '%s' → NORMAL",
							sessionNum, consumption, session.Mode)
					}
				}
			} else if shouldLog {
				log.Printf("  [CHARGING]     [%d] Zero consumption (%.3f → %.3f)",
					sessionNum, previousPower, session.PowerKwh)
			}

			previousPower = session.PowerKwh
		}

		log.Printf("  [CHARGING] Charger %d summary: %d billable, %d skipped, %.3f kWh normal, %.3f kWh priority",
			chargerID, chargerBillable, chargerSkipped, chargerNormal, chargerPriority)

		normalTotal += chargerNormal
		priorityTotal += chargerPriority
		totalBillableSessions += chargerBillable
		totalSkippedSessions += chargerSkipped
	}

	log.Printf("  [CHARGING] ========================================")
	log.Printf("  [CHARGING] FINAL RESULTS:")
	log.Printf("  [CHARGING] Total sessions found: %d (at 15-min intervals)", totalSessionsFound)
	log.Printf("  [CHARGING] Billable sessions: %d", totalBillableSessions)
	log.Printf("  [CHARGING] Skipped sessions: %d", totalSkippedSessions)
	log.Printf("  [CHARGING] Normal charging: %.3f kWh", normalTotal)
	log.Printf("  [CHARGING] Priority charging: %.3f kWh", priorityTotal)
	log.Printf("  [CHARGING] Total charging: %.3f kWh", normalTotal+priorityTotal)
	if !firstSession.IsZero() {
		log.Printf("  [CHARGING] First session: %s", firstSession.Format("2006-01-02 15:04"))
		log.Printf("  [CHARGING] Last session: %s", lastSession.Format("2006-01-02 15:04"))
	}
	log.Printf("  [CHARGING] ========================================")

	return normalTotal, priorityTotal, firstSession, lastSession
}