package services

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
    "math"
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

type VZEVEnergyResult struct {
	TotalConsumption   float64
	SelfConsumedSolar  float64 // Solar produced and consumed in same building
	VirtualPV          float64 // Solar received from other buildings in vZEV
	GridEnergy         float64 // Energy from grid
}

func (bs *BillingService) GenerateBills(buildingIDs, userIDs []int, startDate, endDate string, isVZEV bool) ([]models.Invoice, error) {
	log.Printf("=== BILL GENERATION START ===")
	log.Printf("Mode: %s, Buildings: %v, Users: %v, Period: %s to %s", 
		func() string { if isVZEV { return "vZEV (Virtual Allocation)" } else { return "ZEV (Direct Sharing)" } }(),
		buildingIDs, userIDs, startDate, endDate)

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
	
		// Check if this is a vZEV complex
		var isComplex bool
		var groupBuildings string
		err := bs.db.QueryRow(`
			SELECT is_group, COALESCE(group_buildings, '') 
			FROM buildings WHERE id = ?
		`, buildingID).Scan(&isComplex, &groupBuildings)
	
		if err != nil {
			log.Printf("ERROR: Failed to get building info: %v", err)
			continue
		}
	
		var settings models.BillingSettings
		err = bs.db.QueryRow(`
			SELECT id, building_id, is_complex, normal_power_price, solar_power_price, 
				   car_charging_normal_price, car_charging_priority_price, 
				   vzev_export_price, currency
			FROM billing_settings WHERE building_id = ? AND is_active = 1
			LIMIT 1
		`, buildingID).Scan(
			&settings.ID, &settings.BuildingID, &settings.IsComplex,
			&settings.NormalPowerPrice, &settings.SolarPowerPrice,
			&settings.CarChargingNormalPrice, &settings.CarChargingPriorityPrice,
			&settings.VZEVExportPrice, &settings.Currency,
		)
	
		if err != nil {
			log.Printf("ERROR: No active billing settings for building %d: %v", buildingID, err)
			continue
		}
	
		log.Printf("Billing Settings - Type: %s, Normal: %.3f, Solar: %.3f, vZEV Export: %.3f",
			func() string { if settings.IsComplex { return "vZEV" } else { return "ZEV" } }(),
			settings.NormalPowerPrice, settings.SolarPowerPrice, settings.VZEVExportPrice)
	
		// Route to appropriate billing logic
		if isVZEV && isComplex {
			// vZEV: Virtual allocation between buildings in complex
			log.Printf("Using vZEV billing logic for complex %d", buildingID)
			complexInvoices, err := bs.generateVZEVBills(buildingID, groupBuildings, userIDs, start, end, settings)
			if err != nil {
				log.Printf("ERROR: vZEV billing failed: %v", err)
				continue
			}
			invoices = append(invoices, complexInvoices...)
		} else {
			// ZEV: Direct meter-based billing
			log.Printf("Using ZEV billing logic for building %d", buildingID)
			userPeriods, err := bs.getUserPeriodsForBilling(buildingID, userIDs, start, end)
			if err != nil {
				log.Printf("ERROR: Failed to get user periods: %v", err)
				continue
			}
	
			for _, userPeriod := range userPeriods {
				invoice, err := bs.generateUserInvoiceForPeriod(userPeriod, buildingID, start, end, settings)
				if err != nil {
					log.Printf("ERROR: Failed to generate invoice for user %d: %v", userPeriod.UserID, err)
					continue
				}
				invoices = append(invoices, *invoice)
			}
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

		log.Printf("  [SHARED METERS]   Readings: %.3f â†’ %.3f kWh (consumption: %.3f kWh)",
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
				splitDescription = fmt.Sprintf("Split by area: %.1fmÂ² %s %.1fmÂ² total", userArea, tr.Of, totalArea)
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
			Description: fmt.Sprintf("âš ï¸ %s: %s to %s (%.1f%% of billing period)", 
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
		log.Printf("  âœ… Added %d shared meter items (total: %.3f)", len(sharedMeterItems), sharedMeterCost)
	}

	log.Printf("  Checking for custom line items (pro-rated by %.1f%% of period)...", userPeriod.ProrationFactor*100)
	customItems, customCost, err := bs.getCustomLineItemsWithTranslations(buildingID, tr, userPeriod.ProrationFactor)
	if err != nil {
		log.Printf("  WARNING: Failed to get custom line items: %v", err)
	} else if len(customItems) > 0 {
		items = append(items, customItems...)
		totalAmount += customCost
		log.Printf("  âœ… Added %d custom items (total: %.3f)", len(customItems), customCost)
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

// generateVZEVBills handles virtual energy allocation for building complexes
func (bs *BillingService) generateVZEVBills(complexID int, groupBuildingsJSON string, userIDs []int, start, end time.Time, settings models.BillingSettings) ([]models.Invoice, error) {
	log.Printf("\n=== vZEV BILLING START ===")
	log.Printf("Complex ID: %d, Period: %s to %s", complexID, start.Format("2006-01-02"), end.Format("2006-01-02"))

	// Parse group buildings
	var groupBuildings []int
	if groupBuildingsJSON != "" {
		if err := json.Unmarshal([]byte(groupBuildingsJSON), &groupBuildings); err != nil {
			return nil, fmt.Errorf("failed to parse group buildings: %v", err)
		}
	}

	if len(groupBuildings) == 0 {
		return nil, fmt.Errorf("no buildings in complex group")
	}

	log.Printf("Complex contains %d buildings: %v", len(groupBuildings), groupBuildings)

	// Get all user periods for all buildings in complex
	type UserInfo struct {
		UserID          int
		BuildingID      int
		UserPeriod      UserPeriod
	}
	
	allUsers := []UserInfo{}
	for _, buildingID := range groupBuildings {
		userPeriods, err := bs.getUserPeriodsForBilling(buildingID, userIDs, start, end)
		if err != nil {
			continue
		}
		
		for _, userPeriod := range userPeriods {
			allUsers = append(allUsers, UserInfo{
				UserID:     userPeriod.UserID,
				BuildingID: buildingID,
				UserPeriod: userPeriod,
			})
		}
	}

	log.Printf("Total users across complex: %d", len(allUsers))

	// Calculate vZEV energy distribution for each user
	userEnergyResults := make(map[int]*VZEVEnergyResult)
	
	for _, userInfo := range allUsers {
		result, err := bs.calculateVZEVEnergyForUser(
			userInfo.UserID,
			userInfo.BuildingID,
			groupBuildings,
			userInfo.UserPeriod.BillingStart,
			userInfo.UserPeriod.BillingEnd,
		)
		
		if err != nil {
			log.Printf("ERROR: Failed to calculate vZEV energy for user %d: %v", userInfo.UserID, err)
			continue
		}
		
		userEnergyResults[userInfo.UserID] = result
		
		log.Printf("\n  User %d (%s %s) - Building %d:", 
			userInfo.UserID, userInfo.UserPeriod.FirstName, userInfo.UserPeriod.LastName, userInfo.BuildingID)
		log.Printf("    Total Consumption: %.3f kWh", result.TotalConsumption)
		log.Printf("    Self-Consumed Solar: %.3f kWh (%.1f%%)", result.SelfConsumedSolar, (result.SelfConsumedSolar/result.TotalConsumption)*100)
		log.Printf("    Virtual PV Share: %.3f kWh (%.1f%%)", result.VirtualPV, (result.VirtualPV/result.TotalConsumption)*100)
		log.Printf("    Grid Import: %.3f kWh (%.1f%%)", result.GridEnergy, (result.GridEnergy/result.TotalConsumption)*100)
	}

	// Generate invoices for each user
	invoices := []models.Invoice{}
	
	for _, userInfo := range allUsers {
		energyResult := userEnergyResults[userInfo.UserID]
		if energyResult == nil {
			continue
		}
		
		invoice, err := bs.generateVZEVInvoice(
			userInfo.UserPeriod,
			userInfo.BuildingID,
			start,
			end,
			settings,
			energyResult,
		)
		
		if err != nil {
			log.Printf("ERROR: Failed to generate vZEV invoice for user %d: %v", userInfo.UserID, err)
			continue
		}
		
		invoices = append(invoices, *invoice)
	}

	log.Printf("\n=== vZEV BILLING COMPLETE: %d invoices ===", len(invoices))
	return invoices, nil
}

func (bs *BillingService) calculateVZEVEnergyForUser(userID, userBuildingID int, allBuildingsInComplex []int, start, end time.Time) (*VZEVEnergyResult, error) {
	log.Printf("    [vZEV] Calculating energy for user %d in building %d", userID, userBuildingID)
	
	type IntervalReading struct {
		MeterID           int
		MeterType         string
		BuildingID        int
		UserID            sql.NullInt64
		ReadingTime       time.Time
		ConsumptionKWh    float64
		ConsumptionExport float64
	}
	
	// Fetch ALL readings for ALL meters in the complex
	rows, err := bs.db.Query(`
		SELECT m.id, m.meter_type, m.building_id, m.user_id, mr.reading_time, 
		       mr.consumption_kwh, mr.consumption_export
		FROM meter_readings mr
		JOIN meters m ON mr.meter_id = m.id
		WHERE m.building_id IN (`+buildPlaceholders(len(allBuildingsInComplex))+`)
		AND m.meter_type IN ('apartment_meter', 'solar_meter')
		AND mr.reading_time >= ? AND mr.reading_time <= ?
		ORDER BY mr.reading_time, m.id
	`, appendBuildingIDs(allBuildingsInComplex, start, end)...)
	
	if err != nil {
		return nil, fmt.Errorf("failed to query readings: %v", err)
	}
	defer rows.Close()
	
	allReadings := []IntervalReading{}
	for rows.Next() {
		var r IntervalReading
		if err := rows.Scan(&r.MeterID, &r.MeterType, &r.BuildingID, &r.UserID, 
			&r.ReadingTime, &r.ConsumptionKWh, &r.ConsumptionExport); err != nil {
			continue
		}
		allReadings = append(allReadings, r)
	}
	
	log.Printf("    [vZEV] Fetched %d readings across %d buildings", len(allReadings), len(allBuildingsInComplex))
	
	// Organize readings by timestamp and process interval-by-interval
	type IntervalData struct {
		Timestamp             time.Time
		BuildingConsumption   map[int]float64  // buildingID -> consumption
		BuildingSolarProd     map[int]float64  // buildingID -> solar production
		UserConsumption       map[int]float64  // userID -> consumption
		UserBuildingMap       map[int]int      // userID -> buildingID
	}
	
	intervals := make(map[time.Time]*IntervalData)
	
	// Process all readings into interval structure
	for _, reading := range allReadings {
		if intervals[reading.ReadingTime] == nil {
			intervals[reading.ReadingTime] = &IntervalData{
				Timestamp:           reading.ReadingTime,
				BuildingConsumption: make(map[int]float64),
				BuildingSolarProd:   make(map[int]float64),
				UserConsumption:     make(map[int]float64),
				UserBuildingMap:     make(map[int]int),
			}
		}
		
		interval := intervals[reading.ReadingTime]
		
		if reading.MeterType == "apartment_meter" {
			if reading.UserID.Valid {
				uid := int(reading.UserID.Int64)
				interval.UserConsumption[uid] += reading.ConsumptionKWh
				interval.UserBuildingMap[uid] = reading.BuildingID
			}
			interval.BuildingConsumption[reading.BuildingID] += reading.ConsumptionKWh
		} else if reading.MeterType == "solar_meter" {
			// For solar meters, ConsumptionExport represents the export energy (production)
			interval.BuildingSolarProd[reading.BuildingID] += reading.ConsumptionExport
		}
	}
	
	// Sort timestamps
	timestamps := make([]time.Time, 0, len(intervals))
	for ts := range intervals {
		timestamps = append(timestamps, ts)
	}
	sortTimestamps(timestamps)
	
	// Process each interval with correct vZEV logic
	result := &VZEVEnergyResult{}
	intervalCount := 0
	
	for _, ts := range timestamps {
		interval := intervals[ts]
		
		// Get user's consumption in this interval
		userConsumption := interval.UserConsumption[userID]
		if userConsumption <= 0 {
			continue
		}
		
		intervalCount++
		result.TotalConsumption += userConsumption
		
		// Step 1: Calculate self-consumption for each building
		buildingSelfConsumed := make(map[int]float64)
		buildingSurplus := make(map[int]float64)
		buildingDeficit := make(map[int]float64)
		
		for _, buildingID := range allBuildingsInComplex {
			consumption := interval.BuildingConsumption[buildingID]
			production := interval.BuildingSolarProd[buildingID]
			
			selfConsumed := math.Min(production, consumption)
			buildingSelfConsumed[buildingID] = selfConsumed
			
			if production > consumption {
				buildingSurplus[buildingID] = production - consumption
			} else {
				buildingDeficit[buildingID] = consumption - production
			}
		}
		
		// Step 2: Calculate total surplus and deficit in vZEV
		totalSurplus := 0.0
		totalDeficit := 0.0
		
		for _, surplus := range buildingSurplus {
			totalSurplus += surplus
		}
		for _, deficit := range buildingDeficit {
			totalDeficit += deficit
		}
		
		// Step 3: Allocate user's energy sources
		// 3a. Self-consumed solar (if user is in a building with solar)
		userSelfConsumed := 0.0
		buildingConsumption := interval.BuildingConsumption[userBuildingID]
		buildingSolarProd := interval.BuildingSolarProd[userBuildingID]
		
		if buildingConsumption > 0 && buildingSolarProd > 0 {
			selfConsumedInBuilding := math.Min(buildingSolarProd, buildingConsumption)
			userSelfConsumed = selfConsumedInBuilding * (userConsumption / buildingConsumption)
		}
		
		result.SelfConsumedSolar += userSelfConsumed
		
		// 3b. Virtual PV from other buildings
		userVirtualPV := 0.0
		userDeficit := userConsumption - userSelfConsumed
		
		if userDeficit > 0 && totalDeficit > 0 && totalSurplus > 0 {
			// User gets proportional share of vZEV surplus based on their deficit
			availableVirtualPV := math.Min(totalSurplus, totalDeficit)
			userVirtualPV = availableVirtualPV * (userDeficit / totalDeficit)
		}
		
		result.VirtualPV += userVirtualPV
		
		// 3c. Grid energy (remainder)
		userGrid := userConsumption - userSelfConsumed - userVirtualPV
		if userGrid < 0 {
			userGrid = 0
		}
		
		result.GridEnergy += userGrid
		
		// Log first few intervals for debugging
		if intervalCount <= 5 {
			log.Printf("    [vZEV] %s: User consumption: %.3f kWh -> Self: %.3f, Virtual: %.3f, Grid: %.3f",
				ts.Format("15:04"), userConsumption, userSelfConsumed, userVirtualPV, userGrid)
		}
	}
	
	log.Printf("    [vZEV] Processed %d intervals", intervalCount)
	
	return result, nil
}

// Helper function to build SQL placeholders
func buildPlaceholders(count int) string {
	placeholders := make([]string, count)
	for i := range placeholders {
		placeholders[i] = "?"
	}
	return strings.Join(placeholders, ",")
}

// Helper function to append building IDs to query args
func appendBuildingIDs(buildingIDs []int, start, end time.Time) []interface{} {
	args := make([]interface{}, 0, len(buildingIDs)+2)
	for _, id := range buildingIDs {
		args = append(args, id)
	}
	args = append(args, start, end)
	return args
}

// Helper function to sort timestamps
func sortTimestamps(timestamps []time.Time) {
	for i := 0; i < len(timestamps); i++ {
		for j := i + 1; j < len(timestamps); j++ {
			if timestamps[i].After(timestamps[j]) {
				timestamps[i], timestamps[j] = timestamps[j], timestamps[i]
			}
		}
	}
}

// generateVZEVInvoice creates an invoice with correct vZEV energy breakdown
func (bs *BillingService) generateVZEVInvoice(userPeriod UserPeriod, buildingID int, fullStart, fullEnd time.Time, settings models.BillingSettings, energyResult *VZEVEnergyResult) (*models.Invoice, error) {
	tr := GetTranslations(userPeriod.Language)

	invoiceYear := fullStart.Year()
	timestamp := time.Now().Format("20060102150405")
	invoiceNumber := fmt.Sprintf("VZEV-%d-%d-%d-%s", invoiceYear, buildingID, userPeriod.UserID, timestamp)

	items := []models.InvoiceItem{}
	totalAmount := 0.0

	start := userPeriod.BillingStart
	end := userPeriod.BillingEnd

	// Add vZEV mode notice
	items = append(items, models.InvoiceItem{
		Description: "âš¡ vZEV Mode: Virtual Self-Consumption Community",
		Quantity:    0,
		UnitPrice:   0,
		TotalPrice:  0,
		ItemType:    "vzev_notice",
	})

	// Add period notice if prorated
	if userPeriod.ProrationFactor < 1.0 {
		items = append(items, models.InvoiceItem{
			Description: fmt.Sprintf("âš ï¸ %s: %s to %s (%.1f%% of billing period)",
				tr.PartialPeriod,
				start.Format("02.01.2006"),
				end.Format("02.01.2006"),
				userPeriod.ProrationFactor*100),
			Quantity:    0,
			UnitPrice:   0,
			TotalPrice:  0,
			ItemType:    "proration_notice",
		})
	}

	items = append(items, models.InvoiceItem{
		Description: "",
		Quantity:    0,
		UnitPrice:   0,
		TotalPrice:  0,
		ItemType:    "separator",
	})

	// Meter reading info
	meterReadingFrom, meterReadingTo, meterName := bs.getMeterReadings(userPeriod.UserID, start, end)

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
			tr.Consumption, energyResult.TotalConsumption),
		Quantity:    energyResult.TotalConsumption,
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

	// Energy breakdown with correct vZEV logic
	items = append(items, models.InvoiceItem{
		Description: "ðŸ”† vZEV Energy Breakdown:",
		Quantity:    0,
		UnitPrice:   0,
		TotalPrice:  0,
		ItemType:    "vzev_breakdown_header",
	})

	// 1. Self-consumed solar (from own building)
	if energyResult.SelfConsumedSolar > 0 {
		selfConsumedCost := energyResult.SelfConsumedSolar * settings.SolarPowerPrice
		totalAmount += selfConsumedCost
		items = append(items, models.InvoiceItem{
			Description: fmt.Sprintf("  â””â”€ Own Building Solar: %.3f kWh × %.3f %s/kWh",
				energyResult.SelfConsumedSolar, settings.SolarPowerPrice, settings.Currency),
			Quantity:    energyResult.SelfConsumedSolar,
			UnitPrice:   settings.SolarPowerPrice,
			TotalPrice:  selfConsumedCost,
			ItemType:    "vzev_self_solar",
		})
		log.Printf("  Self-Consumed Solar: %.3f kWh × %.3f = %.3f %s", 
			energyResult.SelfConsumedSolar, settings.SolarPowerPrice, selfConsumedCost, settings.Currency)
	}

	// 2. Virtual PV (from other buildings in vZEV)
	if energyResult.VirtualPV > 0 {
		virtualPVCost := energyResult.VirtualPV * settings.VZEVExportPrice
		totalAmount += virtualPVCost
		items = append(items, models.InvoiceItem{
			Description: fmt.Sprintf("  â””â”€ Virtual PV (from vZEV): %.3f kWh × %.3f %s/kWh",
				energyResult.VirtualPV, settings.VZEVExportPrice, settings.Currency),
			Quantity:    energyResult.VirtualPV,
			UnitPrice:   settings.VZEVExportPrice,
			TotalPrice:  virtualPVCost,
			ItemType:    "vzev_virtual_pv",
		})
		log.Printf("  Virtual PV: %.3f kWh × %.3f = %.3f %s", 
			energyResult.VirtualPV, settings.VZEVExportPrice, virtualPVCost, settings.Currency)
	}

	// 3. Grid energy
	if energyResult.GridEnergy > 0 {
		gridCost := energyResult.GridEnergy * settings.NormalPowerPrice
		totalAmount += gridCost
		items = append(items, models.InvoiceItem{
			Description: fmt.Sprintf("  â””â”€ %s: %.3f kWh × %.3f %s/kWh",
				tr.NormalPowerGrid, energyResult.GridEnergy, settings.NormalPowerPrice, settings.Currency),
			Quantity:    energyResult.GridEnergy,
			UnitPrice:   settings.NormalPowerPrice,
			TotalPrice:  gridCost,
			ItemType:    "normal_power",
		})
		log.Printf("  Grid Energy: %.3f kWh × %.3f = %.3f %s", 
			energyResult.GridEnergy, settings.NormalPowerPrice, gridCost, settings.Currency)
	}

	// Car charging (same logic as ZEV)
	if userPeriod.ChargerIDs != "" {
		normalCharging, priorityCharging, firstSession, lastSession := bs.calculateChargingConsumption(buildingID, userPeriod.ChargerIDs, start, end)

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

			if !firstSession.IsZero() {
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
					Description: fmt.Sprintf("%s: %.3f kWh × %.3f %s/kWh",
						tr.SolarMode, normalCharging, settings.CarChargingNormalPrice, settings.Currency),
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
					Description: fmt.Sprintf("%s: %.3f kWh × %.3f %s/kWh",
						tr.PriorityMode, priorityCharging, settings.CarChargingPriorityPrice, settings.Currency),
					Quantity:    priorityCharging,
					UnitPrice:   settings.CarChargingPriorityPrice,
					TotalPrice:  priorityChargingCost,
					ItemType:    "car_charging_priority",
				})
			}
		}
	}

	// Shared meters and custom items (pro-rated)
	totalActiveUsers, _ := bs.countActiveUsers(buildingID)
	if totalActiveUsers == 0 {
		totalActiveUsers = 1
	}

	sharedMeterItems, sharedMeterCost, _ := bs.calculateSharedMeterCostsWithTranslations(
		buildingID, start, end, userPeriod.UserID, totalActiveUsers, tr, settings.Currency, userPeriod.ProrationFactor,
	)
	if len(sharedMeterItems) > 0 {
		items = append(items, sharedMeterItems...)
		totalAmount += sharedMeterCost
	}

	customItems, customCost, _ := bs.getCustomLineItemsWithTranslations(buildingID, tr, userPeriod.ProrationFactor)
	if len(customItems) > 0 {
		items = append(items, customItems...)
		totalAmount += customCost
	}

	// Create invoice record
	result, err := bs.db.Exec(`
		INSERT INTO invoices (
			invoice_number, user_id, building_id, period_start, period_end,
			total_amount, currency, status, is_vzev
		) VALUES (?, ?, ?, ?, ?, ?, ?, 'issued', 1)
	`, invoiceNumber, userPeriod.UserID, buildingID, fullStart.Format("2006-01-02"), fullEnd.Format("2006-01-02"),
		totalAmount, settings.Currency)

	if err != nil {
		return nil, fmt.Errorf("failed to create vZEV invoice: %v", err)
	}

	invoiceID, _ := result.LastInsertId()

	// Insert invoice items
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
		IsVZEV:        true,
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
			log.Printf("    [ZEV] %s: User %.3f kWh, Building %.3f kWh, Solar %.3f kWh â†’ %.3f solar + %.3f grid",
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
					log.Printf("  [CHARGING]     [%d] %s: %.3f kWh, mode=%s, state=%s â†’ BILLABLE",
						sessionNum, session.SessionTime.Format("15:04"), session.PowerKwh, session.Mode, session.State)
				} else {
					log.Printf("  [CHARGING]     [%d] %s: %.3f kWh, mode=%s, state=%s â†’ SKIP (idle)",
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
						log.Printf("  [CHARGING]     [%d] âœ“ %.3f kWh NORMAL (%.3f â†’ %.3f)",
							sessionNum, consumption, previousPower, session.PowerKwh)
					}
				} else if isPriority {
					chargerPriority += consumption
					if shouldLog {
						log.Printf("  [CHARGING]     [%d] âœ“ %.3f kWh PRIORITY (%.3f â†’ %.3f)",
							sessionNum, consumption, previousPower, session.PowerKwh)
					}
				} else {
					chargerNormal += consumption
					if shouldLog {
						log.Printf("  [CHARGING]     [%d] âœ“ %.3f kWh UNKNOWN mode '%s' â†’ NORMAL",
							sessionNum, consumption, session.Mode)
					}
				}
			} else if shouldLog {
				log.Printf("  [CHARGING]     [%d] Zero consumption (%.3f â†’ %.3f)",
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