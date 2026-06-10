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

// modeMatches reports whether a charger session's reported mode value matches a
// configured billing-mode setting. The configured value may be a single value
// ("1") or a comma-separated list of values ("1,99") so that several physical
// charger modes can map to the same billing category. Whitespace is ignored.
func modeMatches(sessionMode, configValue string) bool {
	sessionMode = strings.TrimSpace(sessionMode)
	if sessionMode == "" {
		return false
	}
	for _, v := range strings.Split(configValue, ",") {
		if strings.TrimSpace(v) == sessionMode {
			return true
		}
	}
	return false
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
	TotalConsumption  float64
	SelfConsumedSolar float64 // Solar produced and consumed in same building
	VirtualPV         float64 // Solar received from other buildings in vZEV
	GridEnergy        float64 // Energy from grid
}

// BillingOptions contains optional parameters for bill generation
type BillingOptions struct {
	CustomItemIDs []int // If empty/nil, no custom items are included. Use specific IDs to include selected items.
}

// Billing modes selectable from the bill-config UI.
const (
	BillingModeApartments = "apartments" // default — per-apartment ZEV/vZEV billing
	BillingModeBuilding   = "building"   // building without apartment management — bill all chargers in the building by charger_id
	BillingModeCharger    = "charger"    // bill only a specific charger (e.g. company-car at home)
)

// BillingScope controls which billing flow is used.
type BillingScope struct {
	Mode      string // "" or BillingModeApartments → existing apartment flow
	ChargerID *int   // required when Mode == BillingModeCharger
}

// PriceSegment is a contiguous sub-period of a billing run during which a
// single set of billing settings (prices) is in force. A bill that spans a
// price change is built from multiple segments.
type PriceSegment struct {
	Start    time.Time // inclusive (00:00:00 of first day)
	End      time.Time // exclusive (00:00:00 of day after last)
	Settings models.BillingSettings
}

// segmentSuffix renders a parenthetical date hint like " (01.12-31.12)" used
// to label per-segment line items on invoices that span a price change. Returns
// an empty string when there is only one segment so single-price bills keep
// their existing line-item format unchanged.
func segmentSuffix(seg PriceSegment, isMultiSegment bool) string {
	if !isMultiSegment {
		return ""
	}
	lastDay := seg.End.Add(-24 * time.Hour)
	return fmt.Sprintf(" (%s-%s)", seg.Start.Format("02.01"), lastDay.Format("02.01"))
}

// clipToSegment returns the intersection of [a, b) and [seg.Start, seg.End).
// ok is false when the intersection is empty.
func clipToSegment(seg PriceSegment, a, b time.Time) (start, end time.Time, ok bool) {
	start = a
	if seg.Start.After(start) {
		start = seg.Start
	}
	end = b
	if seg.End.Before(end) {
		end = seg.End
	}
	if !start.Before(end) {
		return time.Time{}, time.Time{}, false
	}
	return start, end, true
}

// parseStoredDate tolerantly parses a date string read from the DB. The
// mattn/go-sqlite3 driver auto-converts columns whose declared type is DATE
// to time.Time, which database/sql then re-formats as RFC3339 when scanned
// into a string — so the same column can come back as "2026-05-01" or as
// "2026-05-01T00:00:00Z" depending on the row and driver version. We accept
// either, plus a few near-relatives, and normalize to midnight UTC of the
// named day.
func parseStoredDate(s string) (time.Time, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return time.Time{}, fmt.Errorf("empty date string")
	}
	layouts := []string{
		"2006-01-02",
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02T15:04:05.999999999Z",
		"2006-01-02T15:04:05Z",
		"2006-01-02 15:04:05.999999999-07:00",
		"2006-01-02 15:04:05-07:00",
		"2006-01-02 15:04:05.999999999",
		"2006-01-02 15:04:05",
	}
	for _, layout := range layouts {
		if t, err := time.Parse(layout, s); err == nil {
			return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC), nil
		}
	}
	// Last resort: take the first 10 chars if they look date-like.
	if len(s) >= 10 {
		if t, err := time.Parse("2006-01-02", s[:10]); err == nil {
			return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC), nil
		}
	}
	return time.Time{}, fmt.Errorf("unrecognized date format %q", s)
}

// loadPriceSegments returns the ordered, contiguous price segments that cover
// the half-open interval [start, end) for the given building. When two active
// pricing rows overlap, the row with the later valid_from wins for the
// overlapping period (newer prices supersede older open-ended ones). Returns
// an error naming the uncovered date range if any portion of [start, end) has
// no active pricing.
func (bs *BillingService) loadPriceSegments(buildingID int, start, end time.Time) ([]PriceSegment, error) {
	rows, err := bs.db.Query(`
		SELECT id, building_id, is_complex, normal_power_price, solar_power_price,
		       car_charging_normal_price, car_charging_priority_price,
		       vzev_export_price, vat_included, vat_rate, currency, valid_from, valid_to
		FROM billing_settings
		WHERE building_id = ? AND is_active = 1
		ORDER BY valid_from ASC, id ASC
	`, buildingID)
	if err != nil {
		return nil, fmt.Errorf("failed to query billing_settings: %v", err)
	}
	defer rows.Close()

	type priceRow struct {
		settings   models.BillingSettings
		rangeStart time.Time // inclusive
		rangeEnd   time.Time // exclusive
	}

	var allRows []priceRow
	for rows.Next() {
		var s models.BillingSettings
		var validFromStr string
		var validToStr sql.NullString
		if err := rows.Scan(
			&s.ID, &s.BuildingID, &s.IsComplex,
			&s.NormalPowerPrice, &s.SolarPowerPrice,
			&s.CarChargingNormalPrice, &s.CarChargingPriorityPrice,
			&s.VZEVExportPrice, &s.VATIncluded, &s.VATRate, &s.Currency,
			&validFromStr, &validToStr,
		); err != nil {
			log.Printf("WARNING: skipping unreadable billing_settings row: %v", err)
			continue
		}
		rangeStart, err := parseStoredDate(validFromStr)
		if err != nil {
			log.Printf("ERROR: billing_settings ID %d has unparseable valid_from %q — row skipped: %v", s.ID, validFromStr, err)
			continue
		}
		// valid_to is inclusive of the named day; convert to half-open by
		// adding 24h. NULL means open-ended — clamp past the caller's window.
		var rangeEnd time.Time
		if validToStr.Valid && strings.TrimSpace(validToStr.String) != "" {
			parsed, err := parseStoredDate(validToStr.String)
			if err != nil {
				log.Printf("ERROR: billing_settings ID %d has unparseable valid_to %q — row skipped: %v", s.ID, validToStr.String, err)
				continue
			}
			rangeEnd = parsed.Add(24 * time.Hour)
		} else {
			rangeEnd = end.Add(24 * time.Hour)
			if rangeEnd.Before(rangeStart) {
				rangeEnd = rangeStart.Add(24 * time.Hour)
			}
		}
		log.Printf("  billing_settings ID %d: valid_from=%q → %s, valid_to=%q → %s",
			s.ID, validFromStr, rangeStart.Format("2006-01-02"),
			validToStr.String, rangeEnd.Add(-24*time.Hour).Format("2006-01-02"))
		allRows = append(allRows, priceRow{settings: s, rangeStart: rangeStart, rangeEnd: rangeEnd})
	}

	// If an earlier row's range extends into a later row's range, the later
	// (newer) row supersedes it from its valid_from onward.
	for i := 0; i < len(allRows)-1; i++ {
		if allRows[i].rangeEnd.After(allRows[i+1].rangeStart) {
			allRows[i].rangeEnd = allRows[i+1].rangeStart
		}
	}

	// Intersect with [start, end) and emit segments.
	var segments []PriceSegment
	for _, r := range allRows {
		segStart := r.rangeStart
		if segStart.Before(start) {
			segStart = start
		}
		segEnd := r.rangeEnd
		if segEnd.After(end) {
			segEnd = end
		}
		if !segStart.Before(segEnd) {
			continue
		}
		segments = append(segments, PriceSegment{
			Start:    segStart,
			End:      segEnd,
			Settings: r.settings,
		})
	}

	// Verify the segments fully cover [start, end) with no gaps.
	if len(segments) == 0 || segments[0].Start.After(start) {
		return nil, fmt.Errorf("no active pricing for the period starting %s", start.Format("2006-01-02"))
	}
	for i := 1; i < len(segments); i++ {
		if segments[i].Start.After(segments[i-1].End) {
			return nil, fmt.Errorf("pricing gap between %s and %s",
				segments[i-1].End.Format("2006-01-02"),
				segments[i].Start.Format("2006-01-02"))
		}
	}
	if segments[len(segments)-1].End.Before(end) {
		return nil, fmt.Errorf("no active pricing for the period ending %s", end.Add(-24*time.Hour).Format("2006-01-02"))
	}

	return segments, nil
}

// GenerateBills generates bills for the specified buildings and users
// customItemIDs: if nil or empty, no custom items are included. Pass specific IDs to include those items.
func (bs *BillingService) GenerateBills(buildingIDs, userIDs []int, startDate, endDate string, isVZEV bool) ([]models.Invoice, error) {
	// Call with empty custom item IDs for backward compatibility (no custom items)
	return bs.GenerateBillsWithOptions(buildingIDs, userIDs, startDate, endDate, isVZEV, nil, BillingScope{})
}

// GenerateBillsWithOptions generates bills with custom item selection and an optional billing scope.
func (bs *BillingService) GenerateBillsWithOptions(buildingIDs, userIDs []int, startDate, endDate string, isVZEV bool, customItemIDs []int, scope BillingScope) ([]models.Invoice, error) {
	log.Printf("=== BILL GENERATION START ===")
	log.Printf("Mode: %s, Buildings: %v, Users: %v, Period: %s to %s",
		func() string {
			if isVZEV {
				return "vZEV (Virtual Allocation)"
			} else {
				return "ZEV (Direct Sharing)"
			}
		}(),
		buildingIDs, userIDs, startDate, endDate)
	log.Printf("Custom Item IDs: %v", customItemIDs)

	invoices := []models.Invoice{}

	start, err := time.Parse("2006-01-02", startDate)
	if err != nil {
		return nil, fmt.Errorf("invalid start date: %v", err)
	}
	// Set start to beginning of day (00:00:00)
	start = time.Date(start.Year(), start.Month(), start.Day(), 0, 0, 0, 0, start.Location())

	end, err := time.Parse("2006-01-02", endDate)
	if err != nil {
		return nil, fmt.Errorf("invalid end date: %v", err)
	}
	// Set end to 00:00:00 of the NEXT day (inclusive of full end date)
	end = time.Date(end.Year(), end.Month(), end.Day(), 0, 0, 0, 0, end.Location()).Add(24 * time.Hour)

	log.Printf("Parsed dates - Start: %s, End: %s", start, end)

	// VALIDATION: every selected building must have pricing covering the
	// entire period. loadPriceSegments returns one segment per price era the
	// period passes through (e.g. Dec 2025 at 2025 rates + Jan-Feb 2026 at
	// 2026 rates) and an error naming any uncovered date range.
	buildingSegments := make(map[int][]PriceSegment, len(buildingIDs))
	buildingsWithoutPricing := []string{}
	for _, buildingID := range buildingIDs {
		segments, err := bs.loadPriceSegments(buildingID, start, end)
		if err != nil {
			var buildingName string
			bs.db.QueryRow("SELECT name FROM buildings WHERE id = ?", buildingID).Scan(&buildingName)
			if buildingName == "" {
				buildingName = fmt.Sprintf("Building ID %d", buildingID)
			}
			buildingsWithoutPricing = append(buildingsWithoutPricing, fmt.Sprintf("%s (%v)", buildingName, err))
			continue
		}
		buildingSegments[buildingID] = segments
	}

	if len(buildingsWithoutPricing) > 0 {
		errorMsg := fmt.Sprintf("Pricing problem for the following building(s): %s. Please configure pricing in the Pricing section for the full billing period.",
			strings.Join(buildingsWithoutPricing, "; "))
		log.Printf("ERROR: %s", errorMsg)
		return nil, fmt.Errorf("%s", errorMsg)
	}

	for _, buildingID := range buildingIDs {
		log.Printf("\n--- Processing Building ID: %d ---", buildingID)
		segments := buildingSegments[buildingID]

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

		log.Printf("Building %d: %d price segment(s) covering the period", buildingID, len(segments))
		for i, seg := range segments {
			log.Printf("  Segment %d: %s to %s — Normal=%.3f, Solar=%.3f, vZEV Export=%.3f, Currency=%s",
				i+1,
				seg.Start.Format("2006-01-02"),
				seg.End.Add(-24*time.Hour).Format("2006-01-02"),
				seg.Settings.NormalPowerPrice, seg.Settings.SolarPowerPrice,
				seg.Settings.VZEVExportPrice, seg.Settings.Currency)
		}

		// Route to appropriate billing logic
		switch {
		case isVZEV && isComplex:
			// vZEV: Virtual allocation between buildings in complex
			log.Printf("Using vZEV billing logic for complex %d", buildingID)
			complexInvoices, err := bs.generateVZEVBillsWithOptions(buildingID, groupBuildings, userIDs, start, end, segments, customItemIDs)
			if err != nil {
				log.Printf("ERROR: vZEV billing failed: %v", err)
				continue
			}
			invoices = append(invoices, complexInvoices...)

		case scope.Mode == BillingModeCharger:
			// Single-charger bill — only the specified charger's consumption is billed.
			if scope.ChargerID == nil {
				log.Printf("ERROR: charger billing mode requires charger_id; skipping building %d", buildingID)
				continue
			}
			log.Printf("Using single-charger billing logic for building %d (charger %d)", buildingID, *scope.ChargerID)
			userPeriods, err := bs.getUserPeriodsForBilling(buildingID, userIDs, start, end)
			if err != nil {
				log.Printf("ERROR: Failed to get user periods: %v", err)
				continue
			}
			for _, userPeriod := range userPeriods {
				invoice, err := bs.generateChargerOnlyInvoice(userPeriod, buildingID, *scope.ChargerID, start, end, segments, customItemIDs)
				if err != nil {
					log.Printf("ERROR: Failed to generate charger-only invoice for user %d: %v", userPeriod.UserID, err)
					continue
				}
				invoices = append(invoices, *invoice)
			}

		case scope.Mode == BillingModeBuilding:
			// Building-wide bill (no apartment management) — bill ALL chargers in the building by charger_id.
			log.Printf("Using building-wide billing logic for building %d", buildingID)
			userPeriods, err := bs.getUserPeriodsForBilling(buildingID, userIDs, start, end)
			if err != nil {
				log.Printf("ERROR: Failed to get user periods: %v", err)
				continue
			}
			for _, userPeriod := range userPeriods {
				invoice, err := bs.generateUserInvoiceForPeriodWithOptionsAndScope(userPeriod, buildingID, start, end, segments, customItemIDs, scope)
				if err != nil {
					log.Printf("ERROR: Failed to generate invoice for user %d: %v", userPeriod.UserID, err)
					continue
				}
				invoices = append(invoices, *invoice)
			}

		default:
			// ZEV: Direct meter-based billing (existing apartment flow)
			log.Printf("Using ZEV billing logic for building %d", buildingID)
			userPeriods, err := bs.getUserPeriodsForBilling(buildingID, userIDs, start, end)
			if err != nil {
				log.Printf("ERROR: Failed to get user periods: %v", err)
				continue
			}

			for _, userPeriod := range userPeriods {
				invoice, err := bs.generateUserInvoiceForPeriodWithOptions(userPeriod, buildingID, start, end, segments, customItemIDs)
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
	return bs.getCustomLineItemsWithTranslations(buildingID, tr, 1.0, time.Now(), time.Now(), nil)
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

// vatBreakdown computes the net / VAT / gross split for an invoice total given the
// building's VAT (MwSt.) settings.
//
//   - vat_rate <= 0  → no VAT applied; gross == total (identical to pre-VAT behaviour).
//   - vat_included   → the supplied total already contains VAT and is decomposed.
//   - otherwise      → VAT is added on top of the supplied (net) total.
//
// The gross value is what the tenant actually pays and is stored as the invoice total
// (and used for the QR-bill amount).
func vatBreakdown(total float64, s models.BillingSettings) (net, vat, gross float64) {
	if s.VATRate <= 0 {
		return total, 0, total
	}
	r := s.VATRate / 100.0
	if s.VATIncluded {
		net = total / (1 + r)
		vat = total - net
		gross = total
	} else {
		net = total
		vat = total * r
		gross = total + vat
	}
	return net, vat, gross
}

// calculateFrequencyProration calculates the proration factor based on item frequency and billing period
// For example: yearly item of 120 CHF on a 30-day billing period = 120 * (30/365) ≈ 9.86 CHF
func calculateFrequencyProration(frequency string, billingPeriodDays float64) float64 {
	switch frequency {
	case "once":
		// One-time charges are charged in full
		return 1.0
	case "monthly":
		// Monthly items: if billing period is 30 days, factor is 1.0
		// If billing period is 90 days (quarterly), factor is 3.0
		return billingPeriodDays / 30.44 // Average days per month
	case "quarterly":
		// Quarterly items: if billing period is 30 days, factor is ~0.33
		// 365/4 = 91.25 days per quarter
		return billingPeriodDays / 91.25
	case "yearly":
		// Yearly items: if billing period is 30 days, factor is ~0.082
		return billingPeriodDays / 365.0
	default:
		// Unknown frequency, treat as monthly
		return billingPeriodDays / 30.44
	}
}

// getCustomLineItemsWithTranslations fetches custom line items with proper frequency and occupancy proration
// customItemIDs: if nil or empty, no custom items are included. Pass specific IDs to include those items.
func (bs *BillingService) getCustomLineItemsWithTranslations(buildingID int, tr InvoiceTranslations, occupancyProration float64, billingStart, billingEnd time.Time, customItemIDs []int) ([]models.InvoiceItem, float64, error) {
	// Calculate billing period in days
	billingPeriodDays := billingEnd.Sub(billingStart).Hours() / 24
	if billingPeriodDays <= 0 {
		billingPeriodDays = 30 // Default to 30 days if calculation fails
	}

	log.Printf("  [CUSTOM ITEMS] Getting custom line items for building %d", buildingID)
	log.Printf("  [CUSTOM ITEMS] Billing period: %.1f days, Occupancy proration: %.3f", billingPeriodDays, occupancyProration)
	log.Printf("  [CUSTOM ITEMS] Selected custom item IDs: %v", customItemIDs)

	// If no custom item IDs specified, return empty - no custom items will be included
	if len(customItemIDs) == 0 {
		log.Printf("  [CUSTOM ITEMS] No custom items selected - skipping custom items")
		return nil, 0, nil
	}

	// Build query with ID filter
	placeholders := make([]string, len(customItemIDs))
	args := []interface{}{buildingID}
	for i, id := range customItemIDs {
		placeholders[i] = "?"
		args = append(args, id)
	}

	query := fmt.Sprintf(`
		SELECT id, description, amount, frequency, category
		FROM custom_line_items
		WHERE building_id = ? AND is_active = 1 AND id IN (%s)
		ORDER BY category, description
	`, strings.Join(placeholders, ","))

	rows, err := bs.db.Query(query, args...)
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
			frequencyLabel = tr.FrequencyOnce
		case "monthly":
			frequencyLabel = tr.FrequencyMonthly
		case "quarterly":
			frequencyLabel = tr.FrequencyQuarterly
		case "yearly":
			frequencyLabel = tr.FrequencyYearly
		default:
			frequencyLabel = frequency
		}

		var categoryLabel string
		switch category {
		case "meter_rent":
			categoryLabel = tr.CategoryMeterRent
		case "maintenance":
			categoryLabel = tr.CategoryMaintenance
		case "service":
			categoryLabel = tr.CategoryService
		case "other":
			categoryLabel = tr.CategoryOther
		default:
			categoryLabel = category
		}

		// Calculate frequency proration (e.g., yearly item on monthly bill)
		frequencyProration := calculateFrequencyProration(frequency, billingPeriodDays)

		// Calculate final amount: base amount × frequency proration × occupancy proration
		// Example: 120 CHF yearly, 30-day bill, full occupancy = 120 × (30/365) × 1.0 ≈ 9.86 CHF
		// Example: 120 CHF yearly, 30-day bill, 50% occupancy = 120 × (30/365) × 0.5 ≈ 4.93 CHF
		proratedAmount := amount * frequencyProration * occupancyProration

		log.Printf("  [CUSTOM ITEMS] Item #%d (ID %d): %s", itemCount, itemID, description)
		log.Printf("  [CUSTOM ITEMS]   Base amount: %.2f CHF (%s)", amount, frequencyLabel)
		log.Printf("  [CUSTOM ITEMS]   Frequency proration: %.4f (%.1f days / %s cycle)",
			frequencyProration, billingPeriodDays,
			func() string {
				switch frequency {
				case "yearly":
					return "365"
				case "quarterly":
					return "91.25"
				case "monthly":
					return "30.44"
				default:
					return "N/A"
				}
			}())
		log.Printf("  [CUSTOM ITEMS]   Occupancy proration: %.4f", occupancyProration)
		log.Printf("  [CUSTOM ITEMS]   Final amount: %.2f × %.4f × %.4f = %.2f CHF",
			amount, frequencyProration, occupancyProration, proratedAmount)

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

		// Build description with proration details
		descriptionText := fmt.Sprintf("%s: %s", categoryLabel, description)

		// Add proration explanation
		prorationDetails := []string{}
		if frequency != "once" {
			prorationDetails = append(prorationDetails, fmt.Sprintf("%.2f %s × %.1f %s", amount, frequencyLabel, billingPeriodDays, tr.Days))
		}
		if occupancyProration < 1.0 {
			prorationDetails = append(prorationDetails, fmt.Sprintf("%.1f%% %s", occupancyProration*100, tr.OfPeriod))
		}

		if len(prorationDetails) > 0 {
			descriptionText += " (" + strings.Join(prorationDetails, ", ") + ")"
		}

		items = append(items, models.InvoiceItem{
			Description: descriptionText,
			Quantity:    frequencyProration * occupancyProration,
			UnitPrice:   amount,
			TotalPrice:  proratedAmount,
			ItemType:    "custom_item",
		})

		totalCost += proratedAmount
	}

	if itemCount == 0 {
		log.Printf("  [CUSTOM ITEMS] No matching custom line items found for building %d with IDs %v", buildingID, customItemIDs)
	} else {
		log.Printf("  [CUSTOM ITEMS] Added %d custom items, total cost: %.2f", itemCount, totalCost)
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

// generateUserInvoiceForPeriodWithOptions generates invoice with custom item selection (default apartment scope).
func (bs *BillingService) generateUserInvoiceForPeriodWithOptions(userPeriod UserPeriod, buildingID int, fullStart, fullEnd time.Time, segments []PriceSegment, customItemIDs []int) (*models.Invoice, error) {
	return bs.generateUserInvoiceForPeriodWithOptionsAndScope(userPeriod, buildingID, fullStart, fullEnd, segments, customItemIDs, BillingScope{})
}

// generateUserInvoiceForPeriodWithOptionsAndScope generates invoice with optional scope override.
// When scope.Mode == BillingModeBuilding, charging is calculated for ALL chargers in the building (matched by charger_id, no RFID required).
// The segments slice must be ordered, contiguous, and cover [fullStart, fullEnd) — the
// energy and charging blocks are computed once per segment so a bill that spans a price
// change is priced correctly. Shared meters, custom items, proration and the meter-reading
// summary line stay computed once on the full user period; segments[0].Settings provides
// the invoice currency.
func (bs *BillingService) generateUserInvoiceForPeriodWithOptionsAndScope(userPeriod UserPeriod, buildingID int, fullStart, fullEnd time.Time, segments []PriceSegment, customItemIDs []int, scope BillingScope) (*models.Invoice, error) {
	if len(segments) == 0 {
		return nil, fmt.Errorf("no price segments supplied")
	}
	primary := segments[0].Settings
	multiSeg := len(segments) > 1

	tr := GetTranslations(userPeriod.Language)

	invoiceYear := fullStart.Year()
	// Stored period_end is the inclusive last billed day (for display). Billing math uses the exclusive [fullStart, fullEnd) window.
	displayEnd := fullEnd.AddDate(0, 0, -1)
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
			Quantity:   0,
			UnitPrice:  0,
			TotalPrice: 0,
			ItemType:   "proration_notice",
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

	// CRITICAL: Calculate consumption per price segment so a bill that spans a
	// price change is priced correctly. Each segment is clipped to the user's
	// actual billing period.
	type zevSegment struct {
		seg              PriceSegment
		segStart, segEnd time.Time
		normalPower      float64
		solarPower       float64
	}
	var zevSegs []zevSegment
	var totalNormal, totalSolar, totalConsumption float64
	for _, seg := range segments {
		segStart, segEnd, ok := clipToSegment(seg, start, end)
		if !ok {
			continue
		}
		normalPower, solarPower, segConsumption := bs.calculateZEVConsumption(userPeriod.UserID, buildingID, segStart, segEnd)
		totalNormal += normalPower
		totalSolar += solarPower
		totalConsumption += segConsumption
		zevSegs = append(zevSegs, zevSegment{seg: seg, segStart: segStart, segEnd: segEnd, normalPower: normalPower, solarPower: solarPower})
	}

	log.Printf("  Meter: %s (Period: %s to %s)", meterName, start.Format("2006-01-02"), end.Format("2006-01-02"))
	log.Printf("  Reading from: %.3f kWh, Reading to: %.3f kWh", meterReadingFrom, meterReadingTo)
	log.Printf("  Calculated ACTUAL consumption for this period: %.3f kWh (Normal: %.3f, Solar: %.3f, segments: %d)",
		totalConsumption, totalNormal, totalSolar, len(zevSegs))

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
				tr.Period, start.Format("02.01"), end.AddDate(0, 0, -1).Format("02.01"),
				tr.OldReading, meterReadingFrom,
				tr.NewReading, meterReadingTo,
				tr.Consumption, totalConsumption),
			Quantity:   totalConsumption,
			UnitPrice:  0,
			TotalPrice: 0,
			ItemType:   "meter_reading_compact",
		})

		items = append(items, models.InvoiceItem{
			Description: "",
			Quantity:    0,
			UnitPrice:   0,
			TotalPrice:  0,
			ItemType:    "separator",
		})
	}

	for _, zs := range zevSegs {
		suffix := segmentSuffix(PriceSegment{Start: zs.segStart, End: zs.segEnd}, multiSeg)
		s := zs.seg.Settings
		if zs.solarPower > 0 {
			solarCost := zs.solarPower * s.SolarPowerPrice
			totalAmount += solarCost
			items = append(items, models.InvoiceItem{
				Description: fmt.Sprintf("%s%s: %.3f kWh × %.3f %s/kWh", tr.SolarPower, suffix, zs.solarPower, s.SolarPowerPrice, s.Currency),
				Quantity:    zs.solarPower,
				UnitPrice:   s.SolarPowerPrice,
				TotalPrice:  solarCost,
				ItemType:    "solar_power",
			})
			log.Printf("  Solar Cost%s: %.3f kWh × %.3f = %.3f %s", suffix, zs.solarPower, s.SolarPowerPrice, solarCost, s.Currency)
		}
		if zs.normalPower > 0 {
			normalCost := zs.normalPower * s.NormalPowerPrice
			totalAmount += normalCost
			items = append(items, models.InvoiceItem{
				Description: fmt.Sprintf("%s%s: %.3f kWh × %.3f %s/kWh", tr.NormalPowerGrid, suffix, zs.normalPower, s.NormalPowerPrice, s.Currency),
				Quantity:    zs.normalPower,
				UnitPrice:   s.NormalPowerPrice,
				TotalPrice:  normalCost,
				ItemType:    "normal_power",
			})
			log.Printf("  Normal Cost%s: %.3f kWh × %.3f = %.3f %s", suffix, zs.normalPower, s.NormalPowerPrice, normalCost, s.Currency)
		}
	}

	// CRITICAL: Car charging for THIS USER'S ACTUAL PERIOD
	// In building mode, all chargers in the building are billed (charger_id match, no RFID required).
	// In default (apartment) mode, only the chargers matching the user's RFIDs are billed.
	// Solar-split chargers are billed via a proportional solar share; mode-based
	// chargers by their reported charge mode. computeCharging keeps the two separate.
	hasChargingSource := scope.Mode == BillingModeBuilding || userPeriod.ChargerIDs != ""
	if hasChargingSource {
		log.Printf("  [CHARGING] Calculating for period: %s to %s (mode=%s)", start.Format("2006-01-02"), end.Format("2006-01-02"), scope.Mode)
		chargingSegs, firstSessionOverall, lastSessionOverall := bs.computeCharging(buildingID, scope.Mode, userPeriod.ChargerIDs, 0, segments, start, end)
		totalAmount += appendChargingItems(&items, chargingSegs, firstSessionOverall, lastSessionOverall, multiSeg, tr, tr.CarCharging)
	}

	// Shared meters and custom items ARE pro-rated by days
	totalActiveUsers, err := bs.countActiveUsers(buildingID)
	if err != nil || totalActiveUsers == 0 {
		totalActiveUsers = 1
	}
	log.Printf("  Total active users in building: %d", totalActiveUsers)

	log.Printf("  Checking for shared meters (pro-rated by %.1f%% of period)...", userPeriod.ProrationFactor*100)
	sharedMeterItems, sharedMeterCost, err := bs.calculateSharedMeterCostsWithTranslations(
		buildingID, start, end, userPeriod.UserID, totalActiveUsers, tr, primary.Currency, userPeriod.ProrationFactor,
	)
	if err != nil {
		log.Printf("  WARNING: Failed to calculate shared meter costs: %v", err)
	} else if len(sharedMeterItems) > 0 {
		items = append(items, sharedMeterItems...)
		totalAmount += sharedMeterCost
		log.Printf("  ✅ Added %d shared meter items (total: %.3f)", len(sharedMeterItems), sharedMeterCost)
	}

	// Custom items with frequency and occupancy proration
	log.Printf("  Checking for custom line items...")
	customItems, customCost, err := bs.getCustomLineItemsWithTranslations(buildingID, tr, userPeriod.ProrationFactor, fullStart, fullEnd, customItemIDs)
	if err != nil {
		log.Printf("  WARNING: Failed to get custom line items: %v", err)
	} else if len(customItems) > 0 {
		items = append(items, customItems...)
		totalAmount += customCost
		log.Printf("  ✅ Added %d custom items (total: %.3f)", len(customItems), customCost)
	}

	// Resolve VAT (MwSt.) from the primary segment and store the breakdown so the
	// invoice/PDF can render it. gross becomes the stored total (and QR amount).
	netAmount, vatAmount, grossAmount := vatBreakdown(totalAmount, primary)
	totalAmount = grossAmount

	log.Printf("  INVOICE TOTAL: %s %.3f (net %.3f, VAT %.3f @ %.1f%%)", primary.Currency, totalAmount, netAmount, vatAmount, primary.VATRate)
	log.Printf("  INVOICE NUMBER: %s (Year: %d)", invoiceNumber, invoiceYear)

	result, err := bs.db.Exec(`
		INSERT INTO invoices (
			invoice_number, user_id, building_id, period_start, period_end,
			total_amount, net_amount, vat_amount, vat_rate, vat_included, currency, status
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'issued')
	`, invoiceNumber, userPeriod.UserID, buildingID, fullStart.Format("2006-01-02"), displayEnd.Format("2006-01-02"),
		totalAmount, netAmount, vatAmount, primary.VATRate, primary.VATIncluded, primary.Currency)

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
		PeriodEnd:     displayEnd.Format("2006-01-02"),
		TotalAmount:   totalAmount,
		NetAmount:     netAmount,
		VATAmount:     vatAmount,
		VATRate:       primary.VATRate,
		VATIncluded:   primary.VATIncluded,
		Currency:      primary.Currency,
		Status:        "issued",
		Items:         items,
		GeneratedAt:   time.Now(),
	}

	return invoice, nil
}

// generateVZEVBillsWithOptions handles virtual energy allocation with custom item selection
func (bs *BillingService) generateVZEVBillsWithOptions(complexID int, groupBuildingsJSON string, userIDs []int, start, end time.Time, segments []PriceSegment, customItemIDs []int) ([]models.Invoice, error) {
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
		UserID     int
		BuildingID int
		UserPeriod UserPeriod
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

	// Calculate vZEV energy distribution for each (user, price segment) pair so
	// a bill that spans a price change is priced correctly. Each segment is
	// clipped to the user's actual billing period.
	userSegmentResults := make(map[int][]vzevSegmentResult)

	for _, userInfo := range allUsers {
		for _, seg := range segments {
			segStart, segEnd, ok := clipToSegment(seg, userInfo.UserPeriod.BillingStart, userInfo.UserPeriod.BillingEnd)
			if !ok {
				continue
			}
			result, err := bs.calculateVZEVEnergyForUser(
				userInfo.UserID,
				userInfo.BuildingID,
				groupBuildings,
				segStart,
				segEnd,
			)
			if err != nil {
				log.Printf("ERROR: Failed to calculate vZEV energy for user %d (segment %s..%s): %v",
					userInfo.UserID, segStart.Format("2006-01-02"), segEnd.Format("2006-01-02"), err)
				continue
			}
			userSegmentResults[userInfo.UserID] = append(userSegmentResults[userInfo.UserID], vzevSegmentResult{
				Segment: PriceSegment{Start: segStart, End: segEnd, Settings: seg.Settings},
				Result:  result,
			})

			log.Printf("  User %d segment %s..%s: total=%.3f self=%.3f virtual=%.3f grid=%.3f",
				userInfo.UserID,
				segStart.Format("2006-01-02"), segEnd.Format("2006-01-02"),
				result.TotalConsumption, result.SelfConsumedSolar, result.VirtualPV, result.GridEnergy)
		}
	}

	// Generate invoices for each user
	invoices := []models.Invoice{}

	for _, userInfo := range allUsers {
		segResults := userSegmentResults[userInfo.UserID]
		if len(segResults) == 0 {
			continue
		}

		invoice, err := bs.generateVZEVInvoiceWithOptions(
			userInfo.UserPeriod,
			userInfo.BuildingID,
			start,
			end,
			segResults,
			customItemIDs,
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

// vzevSegmentResult pairs a price segment with the vZEV energy allocation
// computed for it. Used by generateVZEVInvoiceWithOptions to emit one set of
// cost line items per segment.
type vzevSegmentResult struct {
	Segment PriceSegment
	Result  *VZEVEnergyResult
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
		Timestamp           time.Time
		BuildingConsumption map[int]float64 // buildingID -> consumption
		BuildingSolarProd   map[int]float64 // buildingID -> solar production
		UserConsumption     map[int]float64 // userID -> consumption
		UserBuildingMap     map[int]int     // userID -> buildingID
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

// generateVZEVInvoiceWithOptions creates a vZEV invoice with custom item selection.
// segResults pairs each price segment with the vZEV energy allocation computed
// for that segment, so a bill that spans a price change is priced correctly.
// Shared meters, custom items, proration and the meter-reading summary line
// are computed once on the full user period; segResults[0].Segment.Settings
// provides the invoice currency.
func (bs *BillingService) generateVZEVInvoiceWithOptions(userPeriod UserPeriod, buildingID int, fullStart, fullEnd time.Time, segResults []vzevSegmentResult, customItemIDs []int) (*models.Invoice, error) {
	if len(segResults) == 0 {
		return nil, fmt.Errorf("no vZEV segment results supplied")
	}
	primary := segResults[0].Segment.Settings
	multiSeg := len(segResults) > 1

	tr := GetTranslations(userPeriod.Language)

	invoiceYear := fullStart.Year()
	// Stored period_end is the inclusive last billed day (for display). Billing math uses the exclusive [fullStart, fullEnd) window.
	displayEnd := fullEnd.AddDate(0, 0, -1)
	timestamp := time.Now().Format("20060102150405")
	invoiceNumber := fmt.Sprintf("VZEV-%d-%d-%d-%s", invoiceYear, buildingID, userPeriod.UserID, timestamp)

	items := []models.InvoiceItem{}
	totalAmount := 0.0

	start := userPeriod.BillingStart
	end := userPeriod.BillingEnd

	// Add vZEV mode notice
	items = append(items, models.InvoiceItem{
		Description: "⚡ vZEV Mode: Virtual Self-Consumption Community",
		Quantity:    0,
		UnitPrice:   0,
		TotalPrice:  0,
		ItemType:    "vzev_notice",
	})

	// Add period notice if prorated
	if userPeriod.ProrationFactor < 1.0 {
		items = append(items, models.InvoiceItem{
			Description: fmt.Sprintf("⚠️ %s: %s to %s (%.1f%% of billing period)",
				tr.PartialPeriod,
				start.Format("02.01.2006"),
				end.Format("02.01.2006"),
				userPeriod.ProrationFactor*100),
			Quantity:   0,
			UnitPrice:  0,
			TotalPrice: 0,
			ItemType:   "proration_notice",
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

	// Sum consumption across all segments for the meter-reading summary line.
	var totalConsumption float64
	for _, sr := range segResults {
		totalConsumption += sr.Result.TotalConsumption
	}

	items = append(items, models.InvoiceItem{
		Description: fmt.Sprintf("%s: %s", tr.ApartmentMeter, meterName),
		Quantity:    0,
		UnitPrice:   0,
		TotalPrice:  0,
		ItemType:    "meter_info",
	})

	items = append(items, models.InvoiceItem{
		Description: fmt.Sprintf("%s: %s-%s | %s: %.3f kWh | %s: %.3f kWh | %s: %.3f kWh",
			tr.Period, start.Format("02.01"), end.AddDate(0, 0, -1).Format("02.01"),
			tr.OldReading, meterReadingFrom,
			tr.NewReading, meterReadingTo,
			tr.Consumption, totalConsumption),
		Quantity:   totalConsumption,
		UnitPrice:  0,
		TotalPrice: 0,
		ItemType:   "meter_reading_compact",
	})

	items = append(items, models.InvoiceItem{
		Description: "",
		Quantity:    0,
		UnitPrice:   0,
		TotalPrice:  0,
		ItemType:    "separator",
	})

	// Energy breakdown with correct vZEV logic, emitted per price segment.
	items = append(items, models.InvoiceItem{
		Description: "🔋 vZEV Energy Breakdown:",
		Quantity:    0,
		UnitPrice:   0,
		TotalPrice:  0,
		ItemType:    "vzev_breakdown_header",
	})

	for _, sr := range segResults {
		suffix := segmentSuffix(sr.Segment, multiSeg)
		s := sr.Segment.Settings
		er := sr.Result

		// 1. Self-consumed solar (from own building)
		if er.SelfConsumedSolar > 0 {
			cost := er.SelfConsumedSolar * s.SolarPowerPrice
			totalAmount += cost
			items = append(items, models.InvoiceItem{
				Description: fmt.Sprintf("  ├─ Own Building Solar%s: %.3f kWh × %.3f %s/kWh",
					suffix, er.SelfConsumedSolar, s.SolarPowerPrice, s.Currency),
				Quantity:   er.SelfConsumedSolar,
				UnitPrice:  s.SolarPowerPrice,
				TotalPrice: cost,
				ItemType:   "vzev_self_solar",
			})
			log.Printf("  Self-Consumed Solar%s: %.3f kWh × %.3f = %.3f %s",
				suffix, er.SelfConsumedSolar, s.SolarPowerPrice, cost, s.Currency)
		}

		// 2. Virtual PV (from other buildings in vZEV)
		if er.VirtualPV > 0 {
			cost := er.VirtualPV * s.VZEVExportPrice
			totalAmount += cost
			items = append(items, models.InvoiceItem{
				Description: fmt.Sprintf("  ├─ Virtual PV (from vZEV)%s: %.3f kWh × %.3f %s/kWh",
					suffix, er.VirtualPV, s.VZEVExportPrice, s.Currency),
				Quantity:   er.VirtualPV,
				UnitPrice:  s.VZEVExportPrice,
				TotalPrice: cost,
				ItemType:   "vzev_virtual_pv",
			})
			log.Printf("  Virtual PV%s: %.3f kWh × %.3f = %.3f %s",
				suffix, er.VirtualPV, s.VZEVExportPrice, cost, s.Currency)
		}

		// 3. Grid energy
		if er.GridEnergy > 0 {
			cost := er.GridEnergy * s.NormalPowerPrice
			totalAmount += cost
			items = append(items, models.InvoiceItem{
				Description: fmt.Sprintf("  └─ %s%s: %.3f kWh × %.3f %s/kWh",
					tr.NormalPowerGrid, suffix, er.GridEnergy, s.NormalPowerPrice, s.Currency),
				Quantity:   er.GridEnergy,
				UnitPrice:  s.NormalPowerPrice,
				TotalPrice: cost,
				ItemType:   "normal_power",
			})
			log.Printf("  Grid Energy%s: %.3f kWh × %.3f = %.3f %s",
				suffix, er.GridEnergy, s.NormalPowerPrice, cost, s.Currency)
		}
	}

	// Car charging — mode-based and solar-split chargers handled together. The solar
	// split here uses the charger's own building pool (the vZEV virtual-PV sharing
	// applies to apartment energy, not to charger billing).
	if userPeriod.ChargerIDs != "" {
		segs := make([]PriceSegment, 0, len(segResults))
		var winStart, winEnd time.Time
		for _, sr := range segResults {
			segs = append(segs, sr.Segment)
			if winStart.IsZero() || sr.Segment.Start.Before(winStart) {
				winStart = sr.Segment.Start
			}
			if sr.Segment.End.After(winEnd) {
				winEnd = sr.Segment.End
			}
		}
		chargingSegs, firstSessionOverall, lastSessionOverall := bs.computeCharging(buildingID, BillingModeApartments, userPeriod.ChargerIDs, 0, segs, winStart, winEnd)
		totalAmount += appendChargingItems(&items, chargingSegs, firstSessionOverall, lastSessionOverall, multiSeg, tr, tr.CarCharging)
	}

	// Shared meters and custom items (pro-rated)
	totalActiveUsers, _ := bs.countActiveUsers(buildingID)
	if totalActiveUsers == 0 {
		totalActiveUsers = 1
	}

	sharedMeterItems, sharedMeterCost, _ := bs.calculateSharedMeterCostsWithTranslations(
		buildingID, start, end, userPeriod.UserID, totalActiveUsers, tr, primary.Currency, userPeriod.ProrationFactor,
	)
	if len(sharedMeterItems) > 0 {
		items = append(items, sharedMeterItems...)
		totalAmount += sharedMeterCost
	}

	// Custom items with frequency and occupancy proration
	customItems, customCost, _ := bs.getCustomLineItemsWithTranslations(buildingID, tr, userPeriod.ProrationFactor, fullStart, fullEnd, customItemIDs)
	if len(customItems) > 0 {
		items = append(items, customItems...)
		totalAmount += customCost
	}

	// Resolve VAT (MwSt.) from the primary segment; gross becomes the stored total.
	netAmount, vatAmount, grossAmount := vatBreakdown(totalAmount, primary)
	totalAmount = grossAmount

	// Create invoice record
	result, err := bs.db.Exec(`
		INSERT INTO invoices (
			invoice_number, user_id, building_id, period_start, period_end,
			total_amount, net_amount, vat_amount, vat_rate, vat_included, currency, status, is_vzev
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'issued', 1)
	`, invoiceNumber, userPeriod.UserID, buildingID, fullStart.Format("2006-01-02"), displayEnd.Format("2006-01-02"),
		totalAmount, netAmount, vatAmount, primary.VATRate, primary.VATIncluded, primary.Currency)

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
		PeriodEnd:     displayEnd.Format("2006-01-02"),
		TotalAmount:   totalAmount,
		NetAmount:     netAmount,
		VATAmount:     vatAmount,
		VATRate:       primary.VATRate,
		VATIncluded:   primary.VATIncluded,
		Currency:      primary.Currency,
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
    	ORDER BY reading_time DESC 
    	LIMIT 1
	`, meterID, start).Scan(&readingFrom, &readingFromTime)

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
    	AND reading_time >= ?
    	AND reading_time < ?
    	ORDER BY reading_time ASC 
    	LIMIT 1
	`, meterID, end, end.Add(15*time.Minute)).Scan(&readingTo, &readingToTime)

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
		MeterID           int
		MeterType         string
		UserID            sql.NullInt64
		ReadingTime       time.Time
		ConsumptionKWh    float64
		ConsumptionExport float64 // NEW: For solar export energy
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
		SolarProduction     float64 // FIXED: Now uses export energy
	}

	intervalData := make(map[time.Time]*IntervalData)

	for _, reading := range allReadings {
		// Snap to the fixed 15-minute grid so meter readings and charger sessions
		// land in the same buckets (required for the shared solar pool below).
		roundedTime := floorTo15min(reading.ReadingTime)

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

	// Solar-split chargers participate in the building consumption pool just like
	// apartment meters: their per-interval consumption is added to the building
	// total so solar production is shared between meters AND chargers. This dilutes
	// the solar credited to apartments by the chargers' share — the physically
	// correct "everyone draws from the same sun" model.
	if splitIDs := bs.solarSplitChargerIDsForBuilding(buildingID); len(splitIDs) > 0 {
		chargerIntervals, _, _ := bs.chargerIntervalKwh(buildingID, chargerSessionFilter{
			useChargerIDs: true,
			chargerIDs:    splitIDs,
		}, start, end, true)
		for ts, kwh := range chargerIntervals {
			if intervalData[ts] == nil {
				intervalData[ts] = &IntervalData{}
			}
			intervalData[ts].BuildingConsumption += kwh
		}
		log.Printf("    [ZEV] Added %d solar-split charger interval(s) to building pool", len(chargerIntervals))
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

// chargerSessionFilter selects charger sessions by either RFID (user_id) match or by charger_id list.
// Exactly one mode is used per call.
type chargerSessionFilter struct {
	useChargerIDs bool
	rfidCards     []string // when useChargerIDs=false
	chargerIDs    []int    // when useChargerIDs=true
}

// calculateChargingForBuilding bills every active charger in the building, regardless of RFID assignment.
// Used by the "building" billing mode (single-family-home / no apartment management).
func (bs *BillingService) calculateChargingForBuilding(buildingID int, start, end time.Time) (normal, priority float64, firstSession, lastSession time.Time) {
	rows, err := bs.db.Query(`SELECT id FROM chargers WHERE building_id = ? AND is_active = 1`, buildingID)
	if err != nil {
		log.Printf("  [CHARGING-BLD] ERROR querying chargers for building %d: %v", buildingID, err)
		return 0, 0, time.Time{}, time.Time{}
	}
	defer rows.Close()

	chargerIDs := []int{}
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err == nil {
			chargerIDs = append(chargerIDs, id)
		}
	}
	if len(chargerIDs) == 0 {
		log.Printf("  [CHARGING-BLD] No active chargers in building %d", buildingID)
		return 0, 0, time.Time{}, time.Time{}
	}
	log.Printf("  [CHARGING-BLD] Building %d has %d active chargers: %v", buildingID, len(chargerIDs), chargerIDs)
	return bs.calculateChargingForChargers(buildingID, chargerIDs, start, end)
}

// calculateChargingForChargers bills exactly the listed chargers (matched by charger_id).
// Used by both building-mode (all chargers) and charger-mode (one charger).
func (bs *BillingService) calculateChargingForChargers(buildingID int, chargerIDs []int, start, end time.Time) (normal, priority float64, firstSession, lastSession time.Time) {
	if len(chargerIDs) == 0 {
		return 0, 0, time.Time{}, time.Time{}
	}
	return bs.calculateChargingFiltered(buildingID, chargerSessionFilter{
		useChargerIDs: true,
		chargerIDs:    chargerIDs,
	}, start, end)
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

	// Solar-split chargers are billed separately (proportional solar share), so the
	// classic mode-based RFID path must ignore them to avoid double-counting.
	chargerRows, err := bs.db.Query(`
		SELECT id, name, connection_config FROM chargers
		WHERE building_id = ? AND is_active = 1 AND COALESCE(billing_method, 'mode_based') != 'solar_split'
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
		var firstBillablePower, lastBillablePower float64
		var genuineReset bool

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
				firstBillablePower = session.PowerKwh
				lastBillablePower = session.PowerKwh
				hasPreviousPower = true
				if shouldLog {
					log.Printf("  [CHARGING]     [%d] Established baseline at %.3f kWh", sessionNum, session.PowerKwh)
				}
				continue
			}

			lastBillablePower = session.PowerKwh

			consumption := session.PowerKwh - previousPower

			if consumption < 0 {
				// power_kwh is a cumulative counter. A genuine reset goes back to
				// near zero (new charger / firmware reset). A non-zero drop is a
				// sync/corruption artifact — re-baselining at the low value caused
				// the climb back up to be billed a second time. Hold the previous
				// high so the recovery isn't double-counted.
				if session.PowerKwh < 1.0 {
					if shouldLog {
						log.Printf("  [CHARGING]     [%d] NEGATIVE consumption %.3f kWh - genuine reset, re-baselining at %.3f",
							sessionNum, consumption, session.PowerKwh)
					}
					previousPower = session.PowerKwh
					genuineReset = true
				} else if shouldLog {
					log.Printf("  [CHARGING]     [%d] NEGATIVE consumption %.3f kWh (spurious drop %.3f → %.3f) - holding baseline at %.3f",
						sessionNum, consumption, previousPower, session.PowerKwh, previousPower)
				}
				continue
			}

			if consumption > 0 {
				chargerBillable++

				isPriority := modeMatches(session.Mode, config.ModePriority)
				isNormal := !isPriority && modeMatches(session.Mode, config.ModeNormal)

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

		// Sanity cap: for a cumulative counter, total consumption cannot exceed
		// (last reading − first reading). If upstream data corruption introduced
		// a phantom spike that later settled back, the delta sum will overshoot
		// this bound — scale modes proportionally to recover the correct total.
		// Skipped when a genuine reset happened mid-period (bound is invalid).
		if hasPreviousPower && !genuineReset {
			chargerTotal := chargerNormal + chargerPriority
			bound := lastBillablePower - firstBillablePower
			if bound < 0 {
				bound = 0
			}
			if chargerTotal > bound+0.001 {
				factor := 0.0
				if chargerTotal > 0 {
					factor = bound / chargerTotal
				}
				log.Printf("  [CHARGING] Charger %d (%s): SANITY CAP — sum %.3f kWh > bound %.3f kWh (last %.3f − first %.3f); scaling by %.4f",
					chargerID, config.ChargerName, chargerTotal, bound, lastBillablePower, firstBillablePower, factor)
				chargerNormal *= factor
				chargerPriority *= factor
			}
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

// calculateChargingFiltered runs the same accounting logic as calculateChargingConsumption,
// but selects charger_sessions by charger_id IN (...) rather than by RFID/user_id.
// It is used for building-mode and charger-mode billing where chargers may have no RFIDs assigned.
func (bs *BillingService) calculateChargingFiltered(buildingID int, filter chargerSessionFilter, start, end time.Time) (normal, priority float64, firstSession, lastSession time.Time) {
	if !filter.useChargerIDs || len(filter.chargerIDs) == 0 {
		log.Printf("  [CHARGING-CID] ERROR: filter must specify chargerIDs")
		return 0, 0, time.Time{}, time.Time{}
	}

	log.Printf("  [CHARGING-CID] ========================================")
	log.Printf("  [CHARGING-CID] Building ID: %d, charger IDs: %v", buildingID, filter.chargerIDs)
	log.Printf("  [CHARGING-CID] Period: %s to %s", start.Format("2006-01-02 15:04"), end.Format("2006-01-02 15:04"))

	chargerPlaceholders := make([]string, len(filter.chargerIDs))
	chargerArgs := []interface{}{}
	for i, id := range filter.chargerIDs {
		chargerPlaceholders[i] = "?"
		chargerArgs = append(chargerArgs, id)
	}
	chargerIn := strings.Join(chargerPlaceholders, ",")

	chargerRows, err := bs.db.Query(fmt.Sprintf(`
		SELECT id, name, connection_config FROM chargers
		WHERE building_id = ? AND id IN (%s) AND is_active = 1
	`, chargerIn), append([]interface{}{buildingID}, chargerArgs...)...)
	if err != nil {
		log.Printf("  [CHARGING-CID] ERROR: Could not query chargers: %v", err)
		return 0, 0, time.Time{}, time.Time{}
	}
	defer chargerRows.Close()

	type chargerCfg struct {
		ChargerID    int
		ChargerName  string
		StateIdle    string
		ModeNormal   string
		ModePriority string
	}

	configs := []chargerCfg{}
	for chargerRows.Next() {
		var id int
		var name, connConfigJSON string
		if err := chargerRows.Scan(&id, &name, &connConfigJSON); err != nil {
			continue
		}
		var connConfig map[string]interface{}
		if err := json.Unmarshal([]byte(connConfigJSON), &connConfig); err != nil {
			log.Printf("  [CHARGING-CID] WARN: bad config for charger %d: %v", id, err)
			continue
		}
		configs = append(configs, chargerCfg{
			ChargerID:    id,
			ChargerName:  name,
			StateIdle:    getConfigString(connConfig, "state_idle", "50"),
			ModeNormal:   getConfigString(connConfig, "mode_normal", "1"),
			ModePriority: getConfigString(connConfig, "mode_priority", "2"),
		})
	}
	if len(configs) == 0 {
		log.Printf("  [CHARGING-CID] No active chargers matched in building %d", buildingID)
		return 0, 0, time.Time{}, time.Time{}
	}

	sessionArgs := append([]interface{}{}, chargerArgs...)
	sessionArgs = append(sessionArgs, start, end)
	rows, err := bs.db.Query(fmt.Sprintf(`
		SELECT charger_id, session_time, power_kwh, mode, state
		FROM charger_sessions
		WHERE charger_id IN (%s)
		AND session_time >= ? AND session_time <= ?
		ORDER BY charger_id, session_time ASC
	`, chargerIn), sessionArgs...)
	if err != nil {
		log.Printf("  [CHARGING-CID] ERROR querying sessions: %v", err)
		return 0, 0, time.Time{}, time.Time{}
	}
	defer rows.Close()

	type sessionData struct {
		SessionTime time.Time
		PowerKwh    float64
		Mode        string
		State       string
	}
	bySession := make(map[int][]sessionData)
	totalSessions := 0
	for rows.Next() {
		var chargerID int
		var t time.Time
		var power float64
		var mode, state string
		if err := rows.Scan(&chargerID, &t, &power, &mode, &state); err != nil {
			continue
		}
		bySession[chargerID] = append(bySession[chargerID], sessionData{t, power, mode, state})
		totalSessions++
	}
	log.Printf("  [CHARGING-CID] Found %d sessions across %d chargers", totalSessions, len(bySession))

	for _, cfg := range configs {
		sessions := bySession[cfg.ChargerID]
		if len(sessions) == 0 {
			continue
		}

		var prevPower float64
		var hasPrev bool
		var firstBillablePower, lastBillablePower float64
		var genuineReset bool
		var chargerNormal, chargerPriority float64
		for _, s := range sessions {
			if s.State == cfg.StateIdle {
				continue
			}
			if firstSession.IsZero() || s.SessionTime.Before(firstSession) {
				firstSession = s.SessionTime
			}
			if s.SessionTime.After(lastSession) {
				lastSession = s.SessionTime
			}
			if !hasPrev {
				prevPower = s.PowerKwh
				firstBillablePower = s.PowerKwh
				lastBillablePower = s.PowerKwh
				hasPrev = true
				continue
			}
			lastBillablePower = s.PowerKwh
			delta := s.PowerKwh - prevPower
			if delta < 0 {
				// Cumulative counter dropped. Only re-baseline on a genuine reset
				// (back to ~0). For a non-zero drop, hold the previous high so the
				// climb back up isn't billed a second time.
				if s.PowerKwh < 1.0 {
					prevPower = s.PowerKwh
					genuineReset = true
				}
				continue
			}
			if delta > 0 {
				if modeMatches(s.Mode, cfg.ModePriority) {
					chargerPriority += delta
				} else {
					chargerNormal += delta
				}
			}
			prevPower = s.PowerKwh
		}

		// Sanity cap: for a cumulative counter, total consumption cannot exceed
		// (last reading − first reading). If upstream data corruption introduced
		// a phantom spike that later settled back, the delta sum will overshoot
		// this bound — scale modes proportionally to recover the correct total.
		// Skipped when a genuine reset happened mid-period (bound is invalid).
		chargerTotal := chargerNormal + chargerPriority
		if hasPrev && !genuineReset {
			bound := lastBillablePower - firstBillablePower
			if bound < 0 {
				bound = 0
			}
			if chargerTotal > bound+0.001 {
				factor := 0.0
				if chargerTotal > 0 {
					factor = bound / chargerTotal
				}
				log.Printf("  [CHARGING-CID] Charger %d (%s): SANITY CAP — sum %.3f kWh > bound %.3f kWh (last %.3f − first %.3f); scaling by %.4f",
					cfg.ChargerID, cfg.ChargerName, chargerTotal, bound, lastBillablePower, firstBillablePower, factor)
				chargerNormal *= factor
				chargerPriority *= factor
			}
		}

		normal += chargerNormal
		priority += chargerPriority
		log.Printf("  [CHARGING-CID] Charger %d (%s): %d sessions processed (normal=%.3f, priority=%.3f)",
			cfg.ChargerID, cfg.ChargerName, len(sessions), chargerNormal, chargerPriority)
	}

	log.Printf("  [CHARGING-CID] FINAL — Normal: %.3f kWh, Priority: %.3f kWh", normal, priority)
	log.Printf("  [CHARGING-CID] ========================================")
	return normal, priority, firstSession, lastSession
}

// floorTo15min snaps a timestamp down to the fixed 15-minute grid (Swiss metering
// standard) so meter readings and charger sessions share the same interval keys.
func floorTo15min(t time.Time) time.Time {
	return t.Truncate(15 * time.Minute)
}

// solarSplitChargerIDsForBuilding returns the IDs of active chargers in the building
// whose billing_method is "solar_split".
func (bs *BillingService) solarSplitChargerIDsForBuilding(buildingID int) []int {
	rows, err := bs.db.Query(`
		SELECT id FROM chargers
		WHERE building_id = ? AND is_active = 1 AND COALESCE(billing_method, 'mode_based') = 'solar_split'
	`, buildingID)
	if err != nil {
		log.Printf("  [SOLAR-SPLIT] ERROR querying solar-split chargers for building %d: %v", buildingID, err)
		return nil
	}
	defer rows.Close()
	var ids []int
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err == nil {
			ids = append(ids, id)
		}
	}
	return ids
}

// chargerIntervalKwh returns per-15-minute-interval consumption (keyed by the floored
// session time) summed across the selected chargers, plus the first/last billable
// session time. It applies the same cumulative-counter delta logic as the mode-based
// path (idle sessions skipped, genuine resets / spurious drops handled, per-charger
// sanity cap), but buckets the energy by interval instead of by charge mode.
//
// Selection mirrors chargerSessionFilter: by charger_id list, or by RFID/user_id.
// When onlySolarSplit is true, only chargers with billing_method="solar_split" count.
func (bs *BillingService) chargerIntervalKwh(buildingID int, filter chargerSessionFilter, start, end time.Time, onlySolarSplit bool) (map[time.Time]float64, time.Time, time.Time) {
	result := make(map[time.Time]float64)
	var firstSession, lastSession time.Time

	var where string
	var args []interface{}
	if filter.useChargerIDs {
		if len(filter.chargerIDs) == 0 {
			return result, firstSession, lastSession
		}
		ph := make([]string, len(filter.chargerIDs))
		for i, id := range filter.chargerIDs {
			ph[i] = "?"
			args = append(args, id)
		}
		where = "cs.charger_id IN (" + strings.Join(ph, ",") + ")"
	} else {
		if len(filter.rfidCards) == 0 {
			return result, firstSession, lastSession
		}
		ph := make([]string, len(filter.rfidCards))
		for i, rfid := range filter.rfidCards {
			ph[i] = "?"
			args = append(args, rfid)
		}
		where = "cs.user_id IN (" + strings.Join(ph, ",") + ")"
	}

	splitClause := ""
	if onlySolarSplit {
		splitClause = "AND COALESCE(c.billing_method, 'mode_based') = 'solar_split'"
	}

	query := fmt.Sprintf(`
		SELECT cs.charger_id, cs.session_time, cs.power_kwh, cs.state, c.connection_config
		FROM charger_sessions cs
		JOIN chargers c ON cs.charger_id = c.id
		WHERE c.building_id = ? AND c.is_active = 1 %s AND %s
		AND cs.session_time >= ? AND cs.session_time <= ?
		ORDER BY cs.charger_id, cs.session_time ASC
	`, splitClause, where)

	qArgs := append([]interface{}{buildingID}, args...)
	qArgs = append(qArgs, start, end)

	rows, err := bs.db.Query(query, qArgs...)
	if err != nil {
		log.Printf("  [SOLAR-SPLIT] ERROR querying charger intervals: %v", err)
		return result, firstSession, lastSession
	}
	defer rows.Close()

	type sess struct {
		t     time.Time
		power float64
		state string
	}
	byCharger := make(map[int][]sess)
	idleByCharger := make(map[int]string)
	for rows.Next() {
		var id int
		var t time.Time
		var power float64
		var state, connConfigJSON string
		if err := rows.Scan(&id, &t, &power, &state, &connConfigJSON); err != nil {
			continue
		}
		if _, ok := idleByCharger[id]; !ok {
			idleByCharger[id] = "50"
			var cc map[string]interface{}
			if json.Unmarshal([]byte(connConfigJSON), &cc) == nil {
				idleByCharger[id] = getConfigString(cc, "state_idle", "50")
			}
		}
		byCharger[id] = append(byCharger[id], sess{t, power, state})
	}

	for id, sessions := range byCharger {
		stateIdle := idleByCharger[id]
		var prevPower, firstBillable, lastBillable float64
		var hasPrev, genuineReset bool
		perInterval := make(map[time.Time]float64)

		for _, s := range sessions {
			if s.state == stateIdle {
				continue
			}
			if firstSession.IsZero() || s.t.Before(firstSession) {
				firstSession = s.t
			}
			if s.t.After(lastSession) {
				lastSession = s.t
			}
			if !hasPrev {
				prevPower = s.power
				firstBillable = s.power
				lastBillable = s.power
				hasPrev = true
				continue
			}
			lastBillable = s.power
			delta := s.power - prevPower
			if delta < 0 {
				// Genuine reset (back to ~0) re-baselines; a spurious non-zero drop
				// holds the previous high so the climb back isn't billed twice.
				if s.power < 1.0 {
					prevPower = s.power
					genuineReset = true
				}
				continue
			}
			if delta > 0 {
				perInterval[floorTo15min(s.t)] += delta
			}
			prevPower = s.power
		}

		// Per-charger sanity cap: total cannot exceed (last − first) reading.
		if hasPrev && !genuineReset {
			var sum float64
			for _, v := range perInterval {
				sum += v
			}
			bound := lastBillable - firstBillable
			if bound < 0 {
				bound = 0
			}
			if sum > bound+0.001 && sum > 0 {
				factor := bound / sum
				for ts := range perInterval {
					perInterval[ts] *= factor
				}
			}
		}

		for ts, v := range perInterval {
			result[ts] += v
		}
	}

	return result, firstSession, lastSession
}

// buildingMeterIntervals returns, per 15-minute interval, the building's total
// apartment consumption and solar production (export energy). Used as the base for
// the charger solar split.
func (bs *BillingService) buildingMeterIntervals(buildingID int, start, end time.Time) (apt, solar map[time.Time]float64) {
	apt = make(map[time.Time]float64)
	solar = make(map[time.Time]float64)

	rows, err := bs.db.Query(`
		SELECT m.meter_type, mr.reading_time, mr.consumption_kwh, mr.consumption_export
		FROM meter_readings mr
		JOIN meters m ON mr.meter_id = m.id
		WHERE m.building_id = ?
		AND m.meter_type IN ('apartment_meter', 'solar_meter')
		AND mr.reading_time >= ? AND mr.reading_time <= ?
	`, buildingID, start, end)
	if err != nil {
		log.Printf("  [SOLAR-SPLIT] ERROR querying building meter intervals: %v", err)
		return apt, solar
	}
	defer rows.Close()

	for rows.Next() {
		var mtype string
		var t time.Time
		var cons, exportE float64
		if err := rows.Scan(&mtype, &t, &cons, &exportE); err != nil {
			continue
		}
		ts := floorTo15min(t)
		if mtype == "apartment_meter" {
			apt[ts] += cons
		} else if mtype == "solar_meter" {
			solar[ts] += exportE
		}
	}
	return apt, solar
}

// calculateChargingSolarSplit bills the selected solar-split chargers by giving them a
// proportional share of the building's solar production, exactly like apartment meters.
// Per interval the consumption pool is (apartment consumption + ALL solar-split chargers
// in the building); the selected chargers receive solar in proportion to their share of
// that pool, and the remainder is grid energy. The pool here matches the one
// calculateZEVConsumption uses to dilute apartments, so solar is conserved.
//
// Returns the selected chargers' solar and grid kWh plus the first/last session time.
func (bs *BillingService) calculateChargingSolarSplit(buildingID int, target chargerSessionFilter, start, end time.Time) (solar, grid float64, firstSession, lastSession time.Time) {
	targetIntervals, fS, lS := bs.chargerIntervalKwh(buildingID, target, start, end, true)
	firstSession, lastSession = fS, lS
	if len(targetIntervals) == 0 {
		return 0, 0, firstSession, lastSession
	}

	aptIntervals, solarIntervals := bs.buildingMeterIntervals(buildingID, start, end)
	var poolCharger map[time.Time]float64
	if allSplit := bs.solarSplitChargerIDsForBuilding(buildingID); len(allSplit) > 0 {
		poolCharger, _, _ = bs.chargerIntervalKwh(buildingID, chargerSessionFilter{
			useChargerIDs: true,
			chargerIDs:    allSplit,
		}, start, end, true)
	}

	for ts, tKwh := range targetIntervals {
		if tKwh <= 0 {
			continue
		}
		poolCh := poolCharger[ts]
		// A target subset (RFID-filtered) must never exceed the pool's charger total
		// for the same interval (delta baselines can differ slightly).
		if tKwh > poolCh {
			poolCh = tKwh
		}
		pool := aptIntervals[ts] + poolCh
		solarProd := solarIntervals[ts]

		if pool <= 0 {
			grid += tKwh
			continue
		}
		if solarProd >= pool {
			solar += tKwh
			continue
		}
		s := solarProd * (tKwh / pool)
		if s > tKwh {
			s = tKwh
		}
		solar += s
		grid += tKwh - s
	}

	log.Printf("  [SOLAR-SPLIT] Building %d: target solar=%.3f kWh, grid=%.3f kWh", buildingID, solar, grid)
	return solar, grid, firstSession, lastSession
}

// modeBasedChargerIDsForBuilding returns active chargers in the building that are NOT
// billed via the solar split (i.e. classic charge-mode billing).
func (bs *BillingService) modeBasedChargerIDsForBuilding(buildingID int) []int {
	rows, err := bs.db.Query(`
		SELECT id FROM chargers
		WHERE building_id = ? AND is_active = 1 AND COALESCE(billing_method, 'mode_based') != 'solar_split'
	`, buildingID)
	if err != nil {
		log.Printf("  [CHARGING] ERROR querying mode-based chargers for building %d: %v", buildingID, err)
		return nil
	}
	defer rows.Close()
	var ids []int
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err == nil {
			ids = append(ids, id)
		}
	}
	return ids
}

// chargerBillingMethod returns the billing_method for a single charger ("mode_based"
// or "solar_split"), defaulting to "mode_based".
func (bs *BillingService) chargerBillingMethod(chargerID int) string {
	var method sql.NullString
	if err := bs.db.QueryRow(`SELECT billing_method FROM chargers WHERE id = ?`, chargerID).Scan(&method); err != nil {
		return "mode_based"
	}
	if method.Valid && method.String == "solar_split" {
		return "solar_split"
	}
	return "mode_based"
}

// cleanRfidList splits and trims a comma-separated RFID string.
func cleanRfidList(rfidCards string) []string {
	var out []string
	for _, r := range strings.Split(rfidCards, ",") {
		if c := strings.TrimSpace(r); c != "" {
			out = append(out, c)
		}
	}
	return out
}

// chargingSeg holds per-price-segment charging energy split across both billing methods.
type chargingSeg struct {
	seg              PriceSegment
	segStart, segEnd time.Time
	modeNormal       float64 // mode-based "solar mode" kWh  (CarChargingNormalPrice)
	modePriority     float64 // mode-based "priority mode" kWh (CarChargingPriorityPrice)
	splitSolar       float64 // solar-split solar kWh          (CarChargingNormalPrice)
	splitGrid        float64 // solar-split grid kWh           (CarChargingPriorityPrice)
}

// computeCharging gathers charging energy per price segment for the given selection,
// keeping mode-based and solar-split chargers separate so each is priced correctly.
// scopeMode is "" / BillingModeApartments (RFID), BillingModeBuilding (all chargers),
// or BillingModeCharger (the single singleChargerID).
func (bs *BillingService) computeCharging(buildingID int, scopeMode, rfids string, singleChargerID int, segments []PriceSegment, start, end time.Time) ([]chargingSeg, time.Time, time.Time) {
	var segs []chargingSeg
	var firstOverall, lastOverall time.Time
	merge := func(fS, lS time.Time) {
		if !fS.IsZero() && (firstOverall.IsZero() || fS.Before(firstOverall)) {
			firstOverall = fS
		}
		if !lS.IsZero() && (lastOverall.IsZero() || lS.After(lastOverall)) {
			lastOverall = lS
		}
	}

	for _, seg := range segments {
		segStart, segEnd, ok := clipToSegment(seg, start, end)
		if !ok {
			continue
		}
		cs := chargingSeg{seg: seg, segStart: segStart, segEnd: segEnd}

		switch scopeMode {
		case BillingModeBuilding:
			if modeIDs := bs.modeBasedChargerIDsForBuilding(buildingID); len(modeIDs) > 0 {
				nC, pC, fS, lS := bs.calculateChargingForChargers(buildingID, modeIDs, segStart, segEnd)
				cs.modeNormal, cs.modePriority = nC, pC
				merge(fS, lS)
			}
			if splitIDs := bs.solarSplitChargerIDsForBuilding(buildingID); len(splitIDs) > 0 {
				sol, grd, fS, lS := bs.calculateChargingSolarSplit(buildingID, chargerSessionFilter{useChargerIDs: true, chargerIDs: splitIDs}, segStart, segEnd)
				cs.splitSolar, cs.splitGrid = sol, grd
				merge(fS, lS)
			}

		case BillingModeCharger:
			if bs.chargerBillingMethod(singleChargerID) == "solar_split" {
				sol, grd, fS, lS := bs.calculateChargingSolarSplit(buildingID, chargerSessionFilter{useChargerIDs: true, chargerIDs: []int{singleChargerID}}, segStart, segEnd)
				cs.splitSolar, cs.splitGrid = sol, grd
				merge(fS, lS)
			} else {
				nC, pC, fS, lS := bs.calculateChargingForChargers(buildingID, []int{singleChargerID}, segStart, segEnd)
				cs.modeNormal, cs.modePriority = nC, pC
				merge(fS, lS)
			}

		default: // apartment / RFID flow
			// Mode-based path (already excludes solar-split chargers internally).
			nC, pC, fS, lS := bs.calculateChargingConsumption(buildingID, rfids, segStart, segEnd)
			cs.modeNormal, cs.modePriority = nC, pC
			merge(fS, lS)
			// Solar-split chargers attributed to this user's RFID cards.
			if rfidList := cleanRfidList(rfids); len(rfidList) > 0 {
				sol, grd, fS2, lS2 := bs.calculateChargingSolarSplit(buildingID, chargerSessionFilter{rfidCards: rfidList}, segStart, segEnd)
				cs.splitSolar, cs.splitGrid = sol, grd
				merge(fS2, lS2)
			}
		}

		segs = append(segs, cs)
	}
	return segs, firstOverall, lastOverall
}

// appendChargingItems renders the car-charging invoice section (header, session-period
// line, and per-segment line items for both billing methods) into items, returning the
// added cost. Mode-based: SolarMode @ normal price, PriorityMode @ priority price.
// Solar-split: SolarCharging @ normal price, GridCharging @ priority price.
func appendChargingItems(items *[]models.InvoiceItem, segs []chargingSeg, firstSession, lastSession time.Time, multiSeg bool, tr InvoiceTranslations, header string) float64 {
	var grand float64
	for _, cs := range segs {
		grand += cs.modeNormal + cs.modePriority + cs.splitSolar + cs.splitGrid
	}
	if grand <= 0 {
		return 0
	}

	*items = append(*items, models.InvoiceItem{ItemType: "separator"})
	*items = append(*items, models.InvoiceItem{Description: header, ItemType: "charging_header"})
	if !firstSession.IsZero() && !lastSession.IsZero() {
		*items = append(*items, models.InvoiceItem{
			Description: fmt.Sprintf("%s: %s - %s | %s: %.3f kWh",
				tr.Period, firstSession.Format("02.01 15:04"), lastSession.Format("02.01 15:04"), tr.Total, grand),
			Quantity: grand,
			ItemType: "charging_session_compact",
		})
		*items = append(*items, models.InvoiceItem{ItemType: "separator"})
	}

	var cost float64
	add := func(label, suffix string, kwh, price float64, currency, itemType string) {
		c := kwh * price
		cost += c
		*items = append(*items, models.InvoiceItem{
			Description: fmt.Sprintf("%s%s: %.3f kWh × %.3f %s/kWh", label, suffix, kwh, price, currency),
			Quantity:    kwh,
			UnitPrice:   price,
			TotalPrice:  c,
			ItemType:    itemType,
		})
	}

	for _, cs := range segs {
		suffix := segmentSuffix(PriceSegment{Start: cs.segStart, End: cs.segEnd}, multiSeg)
		s := cs.seg.Settings
		if cs.modeNormal > 0 {
			add(tr.SolarMode, suffix, cs.modeNormal, s.CarChargingNormalPrice, s.Currency, "car_charging_normal")
		}
		if cs.modePriority > 0 {
			add(tr.PriorityMode, suffix, cs.modePriority, s.CarChargingPriorityPrice, s.Currency, "car_charging_priority")
		}
		if cs.splitSolar > 0 {
			add(tr.SolarCharging, suffix, cs.splitSolar, s.CarChargingNormalPrice, s.Currency, "car_charging_normal")
		}
		if cs.splitGrid > 0 {
			add(tr.GridCharging, suffix, cs.splitGrid, s.CarChargingPriorityPrice, s.Currency, "car_charging_priority")
		}
	}
	return cost
}

// generateChargerOnlyInvoice produces an invoice that contains ONLY the consumption of the specified charger,
// optionally including selected custom items. Used by BillingModeCharger.
func (bs *BillingService) generateChargerOnlyInvoice(userPeriod UserPeriod, buildingID, chargerID int, fullStart, fullEnd time.Time, segments []PriceSegment, customItemIDs []int) (*models.Invoice, error) {
	if len(segments) == 0 {
		return nil, fmt.Errorf("no price segments supplied")
	}
	primary := segments[0].Settings
	multiSeg := len(segments) > 1

	tr := GetTranslations(userPeriod.Language)

	var chargerName string
	var chargerBuildingID int
	err := bs.db.QueryRow(`SELECT name, building_id FROM chargers WHERE id = ? AND is_active = 1`, chargerID).Scan(&chargerName, &chargerBuildingID)
	if err != nil {
		return nil, fmt.Errorf("charger %d not found or inactive: %v", chargerID, err)
	}
	if chargerBuildingID != buildingID {
		return nil, fmt.Errorf("charger %d does not belong to building %d", chargerID, buildingID)
	}

	invoiceYear := fullStart.Year()
	// Stored period_end is the inclusive last billed day (for display). Billing math uses the exclusive [fullStart, fullEnd) window.
	displayEnd := fullEnd.AddDate(0, 0, -1)
	timestamp := time.Now().Format("20060102150405")
	invoiceNumber := fmt.Sprintf("INV-%d-%d-%d-CH%d-%s", invoiceYear, buildingID, userPeriod.UserID, chargerID, timestamp)

	totalAmount := 0.0
	items := []models.InvoiceItem{}

	start := userPeriod.BillingStart
	end := userPeriod.BillingEnd

	if userPeriod.ProrationFactor < 1.0 {
		items = append(items, models.InvoiceItem{
			Description: fmt.Sprintf("⚠️ %s: %s to %s (%.1f%% of billing period)",
				tr.PartialPeriod,
				start.Format("02.01.2006"),
				end.Format("02.01.2006"),
				userPeriod.ProrationFactor*100),
			ItemType: "proration_notice",
		})
		items = append(items, models.InvoiceItem{ItemType: "separator"})
	}

	// Compute charging per price segment (clipped to the user's billing period) so a
	// bill that spans a price change is priced correctly. Routes to the solar split
	// or mode-based billing based on this charger's billing_method.
	chargingSegs, firstSessionOverall, lastSessionOverall := bs.computeCharging(buildingID, BillingModeCharger, "", chargerID, segments, start, end)
	log.Printf("  [CHARGER-ONLY] Charger %d (%s): %d segment(s)", chargerID, chargerName, len(chargingSegs))
	totalAmount += appendChargingItems(&items, chargingSegs, firstSessionOverall, lastSessionOverall, multiSeg, tr, fmt.Sprintf("%s: %s", tr.CarCharging, chargerName))

	if len(customItemIDs) > 0 {
		customItems, customCost, err := bs.getCustomLineItemsWithTranslations(buildingID, tr, userPeriod.ProrationFactor, fullStart, fullEnd, customItemIDs)
		if err != nil {
			log.Printf("  [CHARGER-ONLY] WARN: custom items lookup failed: %v", err)
		} else if len(customItems) > 0 {
			items = append(items, customItems...)
			totalAmount += customCost
		}
	}

	// Resolve VAT (MwSt.) from the primary segment; gross becomes the stored total.
	netAmount, vatAmount, grossAmount := vatBreakdown(totalAmount, primary)
	totalAmount = grossAmount

	result, err := bs.db.Exec(`
		INSERT INTO invoices (
			invoice_number, user_id, building_id, period_start, period_end,
			total_amount, net_amount, vat_amount, vat_rate, vat_included, currency, status
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'issued')
	`, invoiceNumber, userPeriod.UserID, buildingID, fullStart.Format("2006-01-02"), displayEnd.Format("2006-01-02"),
		totalAmount, netAmount, vatAmount, primary.VATRate, primary.VATIncluded, primary.Currency)
	if err != nil {
		return nil, fmt.Errorf("failed to create charger-only invoice: %v", err)
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

	return &models.Invoice{
		ID:            int(invoiceID),
		InvoiceNumber: invoiceNumber,
		UserID:        userPeriod.UserID,
		BuildingID:    buildingID,
		PeriodStart:   fullStart.Format("2006-01-02"),
		PeriodEnd:     displayEnd.Format("2006-01-02"),
		TotalAmount:   totalAmount,
		NetAmount:     netAmount,
		VATAmount:     vatAmount,
		VATRate:       primary.VATRate,
		VATIncluded:   primary.VATIncluded,
		Currency:      primary.Currency,
		Status:        "issued",
		Items:         items,
		GeneratedAt:   time.Now(),
	}, nil
}
