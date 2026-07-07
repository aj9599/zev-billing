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

// Bill content selects which cost blocks land on the invoice, independent of
// building type. It lets any building bill meters only, chargers only, or both.
const (
	BillContentBoth     = "both"     // meter consumption + car charging (default, empty == both)
	BillContentMeters   = "meters"   // apartment/meter consumption only — skip charging
	BillContentChargers = "chargers" // car charging only — skip meter consumption
)

// BillingScope controls which billing flow is used.
type BillingScope struct {
	Mode      string // "" or BillingModeApartments → existing apartment flow
	ChargerID *int   // required when Mode == BillingModeCharger
	Content   string // "" / BillContentBoth, BillContentMeters or BillContentChargers
}

// includeMeters reports whether apartment/meter consumption should be billed.
func (s BillingScope) includeMeters() bool { return s.Content != BillContentChargers }

// includeChargers reports whether car charging should be billed.
func (s BillingScope) includeChargers() bool { return s.Content != BillContentMeters }

// SkippedBill records a tenant whose invoice was deliberately NOT created, so the
// caller/UI can report it instead of the failure passing silently.
type SkippedBill struct {
	UserID     int    `json:"user_id"`
	UserName   string `json:"user_name"`
	BuildingID int    `json:"building_id"`
	Reason     string `json:"reason"`
}

// zeroBillEpsilon is the threshold below which an invoice total is treated as zero.
// A genuinely-zero bill is almost always a data problem, not a free period.
const zeroBillEpsilon = 0.005

// zeroBillReason returns an actionable explanation for why a bill came out to zero,
// used when blocking the creation of a useless 0.00 invoice.
func zeroBillReason(meterName string, consumption float64) string {
	if meterName == "" || meterName == "Unknown Meter" {
		return "no apartment meter is linked to this tenant, so no consumption could be billed — link the tenant's meter and retry"
	}
	if consumption <= 0 {
		return fmt.Sprintf("no metered consumption found for meter %q in this period — check that 15-minute readings exist for the period and the meter is linked to the tenant", meterName)
	}
	return "all tariffs/prices for this period evaluate to zero — check the building's pricing configuration"
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
		       battery_power_price, battery_charging_price, car_charging_normal_price, car_charging_priority_price,
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
			&s.NormalPowerPrice, &s.SolarPowerPrice, &s.BatteryPowerPrice, &s.BatteryChargingPrice,
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
	invoices, _, err := bs.GenerateBillsWithOptions(buildingIDs, userIDs, startDate, endDate, isVZEV, nil, BillingScope{})
	return invoices, err
}

// GenerateBillsWithOptions generates bills with custom item selection and an optional billing scope.
// It returns the invoices created, plus any tenants whose bills were deliberately
// skipped (e.g. a would-be 0.00 invoice) so the caller can report them.
func (bs *BillingService) GenerateBillsWithOptions(buildingIDs, userIDs []int, startDate, endDate string, isVZEV bool, customItemIDs []int, scope BillingScope) ([]models.Invoice, []SkippedBill, error) {
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
	skipped := []SkippedBill{}

	start, err := time.Parse("2006-01-02", startDate)
	if err != nil {
		return nil, nil, fmt.Errorf("invalid start date: %v", err)
	}
	// Set start to beginning of day (00:00:00)
	start = time.Date(start.Year(), start.Month(), start.Day(), 0, 0, 0, 0, start.Location())

	end, err := time.Parse("2006-01-02", endDate)
	if err != nil {
		return nil, nil, fmt.Errorf("invalid end date: %v", err)
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
		return nil, nil, fmt.Errorf("%s", errorMsg)
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
			complexInvoices, complexSkipped, err := bs.generateVZEVBillsWithOptions(buildingID, groupBuildings, userIDs, start, end, segments, customItemIDs)
			if err != nil {
				log.Printf("ERROR: vZEV billing failed: %v", err)
				continue
			}
			invoices = append(invoices, complexInvoices...)
			skipped = append(skipped, complexSkipped...)

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
					skipped = append(skipped, newSkippedBill(userPeriod, buildingID, err))
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
					skipped = append(skipped, newSkippedBill(userPeriod, buildingID, err))
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
				// Pass the scope through so the meters/chargers/both content
				// selector also applies to the standard apartment flow.
				invoice, err := bs.generateUserInvoiceForPeriodWithOptionsAndScope(userPeriod, buildingID, start, end, segments, customItemIDs, scope)
				if err != nil {
					log.Printf("ERROR: Failed to generate invoice for user %d: %v", userPeriod.UserID, err)
					skipped = append(skipped, newSkippedBill(userPeriod, buildingID, err))
					continue
				}
				invoices = append(invoices, *invoice)
			}
		}
	}

	log.Printf("\n=== BILL GENERATION COMPLETE: %d total invoices, %d skipped ===\n", len(invoices), len(skipped))
	return invoices, skipped, nil
}

// newSkippedBill builds a SkippedBill report entry from a tenant and the error that
// prevented their invoice from being created.
func newSkippedBill(up UserPeriod, buildingID int, err error) SkippedBill {
	name := strings.TrimSpace(up.FirstName + " " + up.LastName)
	if name == "" {
		name = fmt.Sprintf("User #%d", up.UserID)
	}
	return SkippedBill{
		UserID:     up.UserID,
		UserName:   name,
		BuildingID: buildingID,
		Reason:     err.Error(),
	}
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

// solarUsesMainRegister reports whether a solar meter records its production in
// the main (consumption) register rather than the export register. Some meters
// (e.g. single-counter solar meters) store production in the main column and
// leave export at 0. Mirrors the dashboard/collector helpers of the same name so
// billing sees solar production the same way the Live view and virtual meters do.
func (bs *BillingService) solarUsesMainRegister(meterID int) bool {
	var maxExport, maxMain sql.NullFloat64
	if err := bs.db.QueryRow(
		`SELECT MAX(consumption_export), MAX(consumption_kwh) FROM meter_readings WHERE meter_id = ?`, meterID,
	).Scan(&maxExport, &maxMain); err != nil {
		return false
	}
	return (!maxExport.Valid || maxExport.Float64 <= 0) && maxMain.Valid && maxMain.Float64 > 0
}

// mainRegisterSolarMeters returns the set of solar meters in a building whose
// production is recorded in the main (consumption) register instead of export.
// For those meters, callers must read production from consumption_kwh, not
// consumption_export.
func (bs *BillingService) mainRegisterSolarMeters(buildingID int) map[int]bool {
	out := make(map[int]bool)
	rows, err := bs.db.Query(
		`SELECT id FROM meters WHERE building_id = ? AND meter_type = 'solar_meter'`, buildingID)
	if err != nil {
		return out
	}
	var ids []int
	for rows.Next() {
		var id int
		if rows.Scan(&id) == nil {
			ids = append(ids, id)
		}
	}
	rows.Close()
	for _, id := range ids {
		if bs.solarUsesMainRegister(id) {
			out[id] = true
		}
	}
	return out
}

// solarSplitMode returns how solar is allocated for a building: "total" (fair
// per-Watt share of the building's true total consumption) or "metered" (share
// only among metered participants — the default and legacy behaviour).
func (bs *BillingService) solarSplitMode(buildingID int) string {
	var mode string
	err := bs.db.QueryRow(
		`SELECT COALESCE(solar_split_mode, 'metered') FROM billing_settings
		 WHERE building_id = ? AND is_active = 1 ORDER BY valid_from DESC LIMIT 1`,
		buildingID,
	).Scan(&mode)
	if err != nil || mode != "total" {
		return "metered"
	}
	return "total"
}

// buildingTotalConsumptionIntervals returns, per 15-minute interval, the
// building's TRUE total consumption (all loads, including ones without their own
// meter), derived from the physical meters:
//
//	grid_import − grid_export + solar_production + battery_discharge − battery_charge
//
// This is the denominator for "total" solar-split mode. It requires a total/grid
// meter; without one the true consumption is unknowable, so an empty map is
// returned and callers fall back to the metered pool.
func (bs *BillingService) buildingTotalConsumptionIntervals(buildingID int, start, end time.Time) map[time.Time]float64 {
	out := make(map[time.Time]float64)
	mainRegSolar := bs.mainRegisterSolarMeters(buildingID)

	rows, err := bs.db.Query(`
		SELECT m.id, m.meter_type, mr.reading_time,
		       COALESCE(mr.consumption_kwh, 0), COALESCE(mr.consumption_export, 0)
		FROM meter_readings mr
		JOIN meters m ON mr.meter_id = m.id
		WHERE m.building_id = ?
		  AND m.meter_type IN ('total_meter', 'solar_meter', 'battery_meter')
		  AND mr.reading_time >= ? AND mr.reading_time <= ?
	`, buildingID, start, end)
	if err != nil {
		log.Printf("    [TOTAL-SPLIT] ERROR querying building total consumption: %v", err)
		return out
	}
	defer rows.Close()

	hasGrid := false
	for rows.Next() {
		var mid int
		var mt string
		var t time.Time
		var cons, exp float64
		if rows.Scan(&mid, &mt, &t, &cons, &exp) != nil {
			continue
		}
		ts := floorTo15min(t)
		switch mt {
		case "total_meter":
			// Grid: import (consumption) minus export (feed-in).
			out[ts] += cons - exp
			hasGrid = true
		case "solar_meter":
			solar := exp
			if mainRegSolar[mid] {
				solar = cons
			}
			out[ts] += solar
		case "battery_meter":
			// Discharge supplies the house (+), charge stores from it (−).
			out[ts] += cons - exp
		}
	}

	if !hasGrid {
		// No grid meter → cannot know true total consumption. Signal "unavailable"
		// so callers keep the metered pool.
		return map[time.Time]float64{}
	}
	return out
}

// buildingIntervalAggregates returns, per fixed 15-minute interval, the building's
// pooled consumption and solar production used for solar allocation. The pool
// mirrors calculateZEVConsumption exactly: apartment meters + solar-split chargers
// + solar-priced split meters all draw from the same solar production, so the
// denominator used to split a shared meter's solar matches the one apartments use.
func (bs *BillingService) buildingIntervalAggregates(buildingID int, start, end time.Time) map[time.Time]*BuildingIntervalAgg {
	agg := make(map[time.Time]*BuildingIntervalAgg)
	get := func(ts time.Time) *BuildingIntervalAgg {
		if agg[ts] == nil {
			agg[ts] = &BuildingIntervalAgg{}
		}
		return agg[ts]
	}

	mainRegSolar := bs.mainRegisterSolarMeters(buildingID)

	rows, err := bs.db.Query(`
		SELECT m.id, m.meter_type, mr.reading_time, COALESCE(mr.consumption_kwh, 0), COALESCE(mr.consumption_export, 0)
		FROM meter_readings mr
		JOIN meters m ON mr.meter_id = m.id
		WHERE m.building_id = ?
		  AND m.meter_type IN ('apartment_meter', 'solar_meter', 'battery_meter')
		  AND mr.reading_time >= ? AND mr.reading_time <= ?
	`, buildingID, start, end)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var mid int
			var mt string
			var t time.Time
			var cons, exp float64
			if err := rows.Scan(&mid, &mt, &t, &cons, &exp); err != nil {
				continue
			}
			ts := floorTo15min(t)
			switch mt {
			case "apartment_meter":
				get(ts).TotalConsumption += cons
			case "solar_meter":
				// Production is normally in the export column, but some meters
				// record it in the main register instead (export stays 0).
				solar := exp
				if mainRegSolar[mid] {
					solar = cons
				}
				get(ts).SolarProduction += solar
			case "battery_meter":
				// Import column = discharge (energy supplied to the building),
				// export column = charge (energy stored from solar).
				get(ts).BatteryDischarge += cons
				get(ts).BatteryCharge += exp
			}
		}
	} else {
		log.Printf("    [POOL] ERROR querying building aggregates: %v", err)
	}

	// Solar-split chargers participate in the building consumption pool.
	if splitIDs := bs.solarSplitChargerIDsForBuilding(buildingID); len(splitIDs) > 0 {
		chargerIntervals, _, _ := bs.chargerIntervalKwh(buildingID, chargerSessionFilter{
			useChargerIDs: true,
			chargerIDs:    splitIDs,
		}, start, end, true)
		for ts, kwh := range chargerIntervals {
			get(ts).TotalConsumption += kwh
		}
	}

	// Solar-priced split meters participate in the building consumption pool.
	for ts, kwh := range bs.solarModeSplitMeterIntervals(buildingID, start, end) {
		get(ts).TotalConsumption += kwh
	}

	// "total" solar-split mode: raise the denominator to the building's true total
	// consumption so shared meters get the same per-Watt solar share as apartments.
	if bs.solarSplitMode(buildingID) == "total" {
		totals := bs.buildingTotalConsumptionIntervals(buildingID, start, end)
		for ts, a := range agg {
			if tot, ok := totals[ts]; ok && tot > a.TotalConsumption {
				a.TotalConsumption = tot
			}
		}
	}

	return agg
}

// solarModeSplitMeterIntervals returns, per fixed 15-minute interval, the combined
// consumption of all split meters in the building configured with a solar/grid
// pricing mode. These meters draw from the shared solar pool just like apartments.
func (bs *BillingService) solarModeSplitMeterIntervals(buildingID int, start, end time.Time) map[time.Time]float64 {
	out := map[time.Time]float64{}
	rows, err := bs.db.Query(`
		SELECT mr.reading_time, COALESCE(mr.consumption_kwh, 0)
		FROM meter_readings mr
		JOIN shared_meter_configs smc ON smc.meter_id = mr.meter_id
		WHERE smc.building_id = ?
		  AND smc.pricing_mode IN ('solar_grid_custom', 'solar_grid_pricing')
		  AND mr.reading_time >= ? AND mr.reading_time <= ?
	`, buildingID, start, end)
	if err != nil {
		log.Printf("    [POOL] ERROR querying solar-mode split meters: %v", err)
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var t time.Time
		var cons float64
		if err := rows.Scan(&t, &cons); err != nil {
			continue
		}
		out[floorTo15min(t)] += cons
	}
	return out
}

// splitMeterIntervalConsumption returns one split meter's own consumption per fixed
// 15-minute interval over [start, end].
func (bs *BillingService) splitMeterIntervalConsumption(meterID int, start, end time.Time) map[time.Time]float64 {
	out := map[time.Time]float64{}
	rows, err := bs.db.Query(`
		SELECT reading_time, COALESCE(consumption_kwh, 0)
		FROM meter_readings
		WHERE meter_id = ? AND reading_time >= ? AND reading_time <= ?
	`, meterID, start, end)
	if err != nil {
		log.Printf("  [SHARED METERS] ERROR querying meter %d intervals: %v", meterID, err)
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var t time.Time
		var cons float64
		if err := rows.Scan(&t, &cons); err != nil {
			continue
		}
		out[floorTo15min(t)] += cons
	}
	return out
}

func (bs *BillingService) getCustomLineItems(buildingID int) ([]models.InvoiceItem, float64, error) {
	tr := GetTranslations("de")
	return bs.getCustomLineItemsWithTranslations(buildingID, tr, 1.0, time.Now(), time.Now(), nil)
}

func (bs *BillingService) calculateSharedMeterCostsWithTranslations(buildingID int, start, end time.Time, userID int, totalActiveUsers int, tr InvoiceTranslations, currency string, prorationFactor float64, primary models.BillingSettings) ([]models.InvoiceItem, float64, error) {
	log.Printf("  [SHARED METERS] Calculating shared meter costs for building %d, user %d (%d active users, proration: %.3f)", buildingID, userID, totalActiveUsers, prorationFactor)

	rows, err := bs.db.Query(`
		SELECT id, meter_id, meter_name, split_type, unit_price,
		       COALESCE(pricing_mode, 'single'), COALESCE(solar_price, 0), COALESCE(grid_price, 0)
		FROM shared_meter_configs
		WHERE building_id = ?
	`, buildingID)
	if err != nil {
		log.Printf("  [SHARED METERS] ERROR: Failed to query shared meter configs: %v", err)
		return nil, 0, err
	}
	defer rows.Close()

	// Building-wide solar pool is only needed for solar/grid pricing modes; load it
	// lazily and reuse across configs.
	var poolAgg map[time.Time]*BuildingIntervalAgg

	items := []models.InvoiceItem{}
	totalCost := 0.0
	configCount := 0

	for rows.Next() {
		var configID, meterID int
		var meterName, splitType, pricingMode string
		var unitPrice, solarPrice, gridPrice float64

		if err := rows.Scan(&configID, &meterID, &meterName, &splitType, &unitPrice, &pricingMode, &solarPrice, &gridPrice); err != nil {
			log.Printf("  [SHARED METERS] ERROR: Failed to scan config row: %v", err)
			continue
		}
		if pricingMode == "" {
			pricingMode = "single"
		}

		configCount++
		log.Printf("  [SHARED METERS] Config #%d: Meter '%s' (ID %d), split=%s, pricing=%s, price=%.3f",
			configCount, meterName, meterID, splitType, pricingMode, unitPrice)

		var consumption, totalMeterCost, solarKWh, batteryKWh, gridKWh float64
		var costDetail string

		if pricingMode == "solar_grid_custom" || pricingMode == "solar_grid_pricing" {
			// Proportional solar/battery/grid split: the meter draws from the
			// building solar pool, then the battery pool, each 15-min interval; the
			// rest is grid. Mirrors apartment billing.
			if poolAgg == nil {
				poolAgg = bs.buildingIntervalAggregates(buildingID, start, end)
			}
			for ts, cons := range bs.splitMeterIntervalConsumption(meterID, start, end) {
				var bCons, sProd, batCharge, batDischarge float64
				if a := poolAgg[ts]; a != nil {
					bCons = a.TotalConsumption
					sProd = a.SolarProduction
					batCharge = a.BatteryCharge
					batDischarge = a.BatteryDischarge
				}
				solar, battery, grid := SplitSolarBatteryGrid(cons, bCons, sProd, batCharge, batDischarge)
				solarKWh += solar
				batteryKWh += battery
				gridKWh += grid
			}
			consumption = solarKWh + batteryKWh + gridKWh
			if consumption <= 0 {
				log.Printf("  [SHARED METERS] WARNING: Meter '%s' has no interval consumption for solar/grid split - skipping", meterName)
				continue
			}

			solarRate, gridRate := solarPrice, gridPrice
			batteryRate := primary.BatteryPowerPrice
			if pricingMode == "solar_grid_pricing" {
				solarRate = primary.SolarPowerPrice
				gridRate = primary.NormalPowerPrice
			}
			totalMeterCost = solarKWh*solarRate + batteryKWh*batteryRate + gridKWh*gridRate
			if batteryKWh > 0.0005 {
				costDetail = fmt.Sprintf("%.3f kWh (%s %.3f × %.3f + %s %.3f × %.3f + %s %.3f × %.3f) = %.3f %s",
					consumption, tr.SolarPower, solarKWh, solarRate, tr.BatteryPower, batteryKWh, batteryRate, tr.NormalPowerGrid, gridKWh, gridRate, totalMeterCost, currency)
			} else {
				costDetail = fmt.Sprintf("%.3f kWh (%s %.3f × %.3f + %s %.3f × %.3f) = %.3f %s",
					consumption, tr.SolarPower, solarKWh, solarRate, tr.NormalPowerGrid, gridKWh, gridRate, totalMeterCost, currency)
			}

			log.Printf("  [SHARED METERS]   Solar/battery/grid split: %.3f kWh solar @ %.3f + %.3f kWh battery @ %.3f + %.3f kWh grid @ %.3f = %.3f",
				solarKWh, solarRate, batteryKWh, batteryRate, gridKWh, gridRate, totalMeterCost)
		} else {
			// Flat (single) price from cumulative meter readings.
			var readingFrom, readingTo float64
			err := bs.db.QueryRow(`
				SELECT
					COALESCE(
						(SELECT power_kwh FROM meter_readings
						 WHERE meter_id = ? AND reading_time <= ?
						 ORDER BY reading_time DESC LIMIT 1),
						0
					) as reading_from,
					COALESCE(
						(SELECT power_kwh FROM meter_readings
						 WHERE meter_id = ? AND reading_time <= ?
						 ORDER BY reading_time DESC LIMIT 1),
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

			consumption = readingTo - readingFrom
			totalMeterCost = consumption * unitPrice
			costDetail = fmt.Sprintf("%s: %.3f kWh × %.3f %s/kWh = %.3f %s",
				tr.TotalConsumption, consumption, unitPrice, currency, totalMeterCost, currency)

			log.Printf("  [SHARED METERS]   Readings: %.3f → %.3f kWh (consumption: %.3f kWh)",
				readingFrom, readingTo, consumption)
			log.Printf("  [SHARED METERS]   Total meter cost: %.3f × %.3f = %.3f",
				consumption, unitPrice, totalMeterCost)
		}

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
			Description: fmt.Sprintf("  %s", costDetail),
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

// insertInvoiceWithItems atomically writes an invoice row and all of its line
// items inside one transaction, returning the new invoice id. If any item fails
// the whole invoice is rolled back, so a half-written invoice (header with
// missing line items) can never be persisted — previously items were inserted
// one-by-one and failures were only logged. Shared by the apartment, vZEV and
// charger-only invoice paths.
func (bs *BillingService) insertInvoiceWithItems(
	invoiceNumber string, userID, buildingID int,
	periodStart, periodEnd string,
	totalAmount, netAmount, vatAmount, vatRate float64, vatIncluded bool, currency string,
	isVZEV bool, items []models.InvoiceItem,
) (int64, error) {
	tx, err := bs.db.Begin()
	if err != nil {
		return 0, fmt.Errorf("failed to begin invoice transaction: %v", err)
	}
	defer tx.Rollback() // no-op once committed

	result, err := tx.Exec(`
		INSERT INTO invoices (
			invoice_number, user_id, building_id, period_start, period_end,
			total_amount, net_amount, vat_amount, vat_rate, vat_included, currency, status, is_vzev
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'issued', ?)
	`, invoiceNumber, userID, buildingID, periodStart, periodEnd,
		totalAmount, netAmount, vatAmount, vatRate, vatIncluded, currency, isVZEV)
	if err != nil {
		return 0, fmt.Errorf("failed to create invoice: %v", err)
	}
	invoiceID, _ := result.LastInsertId()

	for _, item := range items {
		if _, err := tx.Exec(`
			INSERT INTO invoice_items (
				invoice_id, description, quantity, unit_price, total_price, item_type
			) VALUES (?, ?, ?, ?, ?, ?)
		`, invoiceID, item.Description, item.Quantity, item.UnitPrice, item.TotalPrice, item.ItemType); err != nil {
			return 0, fmt.Errorf("failed to insert invoice item: %v", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return 0, fmt.Errorf("failed to commit invoice: %v", err)
	}
	return invoiceID, nil
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

	// Which cost blocks to bill (meters / chargers / both) — see BillingScope.Content.
	includeMeters := scope.includeMeters()
	includeChargers := scope.includeChargers()

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
		batteryPower     float64
	}
	var zevSegs []zevSegment
	var totalNormal, totalSolar, totalBattery, totalConsumption float64
	for _, seg := range segments {
		segStart, segEnd, ok := clipToSegment(seg, start, end)
		if !ok {
			continue
		}
		normalPower, solarPower, batteryPower, segConsumption := bs.calculateZEVConsumption(userPeriod.UserID, buildingID, segStart, segEnd)
		totalNormal += normalPower
		totalSolar += solarPower
		totalBattery += batteryPower
		totalConsumption += segConsumption
		zevSegs = append(zevSegs, zevSegment{seg: seg, segStart: segStart, segEnd: segEnd, normalPower: normalPower, solarPower: solarPower, batteryPower: batteryPower})
	}

	log.Printf("  Meter: %s (Period: %s to %s)", meterName, start.Format("2006-01-02"), end.Format("2006-01-02"))
	log.Printf("  Reading from: %.3f kWh, Reading to: %.3f kWh", meterReadingFrom, meterReadingTo)
	log.Printf("  Calculated ACTUAL consumption for this period: %.3f kWh (Normal: %.3f, Solar: %.3f, Battery: %.3f, segments: %d)",
		totalConsumption, totalNormal, totalSolar, totalBattery, len(zevSegs))

	if includeMeters && totalConsumption > 0 {
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
		if !includeMeters {
			break // chargers-only bill: skip apartment/meter energy costs
		}
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
		if zs.batteryPower > 0 {
			batteryCost := zs.batteryPower * s.BatteryPowerPrice
			totalAmount += batteryCost
			items = append(items, models.InvoiceItem{
				Description: fmt.Sprintf("%s%s: %.3f kWh × %.3f %s/kWh", tr.BatteryPower, suffix, zs.batteryPower, s.BatteryPowerPrice, s.Currency),
				Quantity:    zs.batteryPower,
				UnitPrice:   s.BatteryPowerPrice,
				TotalPrice:  batteryCost,
				ItemType:    "battery_power",
			})
			log.Printf("  Battery Cost%s: %.3f kWh × %.3f = %.3f %s", suffix, zs.batteryPower, s.BatteryPowerPrice, batteryCost, s.Currency)
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
	hasChargingSource := includeChargers && (scope.Mode == BillingModeBuilding || userPeriod.ChargerIDs != "")
	if hasChargingSource {
		log.Printf("  [CHARGING] Calculating for period: %s to %s (mode=%s)", start.Format("2006-01-02"), end.Format("2006-01-02"), scope.Mode)
		chargingSegs, firstSessionOverall, lastSessionOverall := bs.computeCharging(buildingID, scope.Mode, userPeriod.ChargerIDs, 0, segments, start, end)
		totalAmount += appendChargingItems(&items, chargingSegs, firstSessionOverall, lastSessionOverall, multiSeg, tr, tr.CarCharging)

		// Flag the invoice for review if a charger counter reset/glitch occurred in
		// the period — charging is held through such dips, so the number may need a
		// manual sanity check before sending.
		if bs.chargingCounterResetDetected(buildingID, scope, userPeriod.ChargerIDs, start, end) {
			log.Printf("  [CHARGING] ⚠️ Counter reset/glitch detected in period — flagging invoice for review")
			items = append(items, models.InvoiceItem{
				Description: tr.ChargerCounterResetWarning,
				ItemType:    "charging_warning",
			})
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
		buildingID, start, end, userPeriod.UserID, totalActiveUsers, tr, primary.Currency, userPeriod.ProrationFactor, primary,
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

	// SAFETY: never persist a 0.00 invoice. A zero total almost always signals a data
	// problem (meter not linked, no readings, zero-priced tariffs) rather than a
	// genuinely free period — block it with an actionable error instead.
	if grossAmount <= zeroBillEpsilon {
		return nil, fmt.Errorf("%s 0.00 invoice not created for %s %s: %s",
			primary.Currency, userPeriod.FirstName, userPeriod.LastName, zeroBillReason(meterName, totalConsumption))
	}

	log.Printf("  INVOICE TOTAL: %s %.3f (net %.3f, VAT %.3f @ %.1f%%)", primary.Currency, totalAmount, netAmount, vatAmount, primary.VATRate)
	log.Printf("  INVOICE NUMBER: %s (Year: %d)", invoiceNumber, invoiceYear)

	invoiceID, err := bs.insertInvoiceWithItems(
		invoiceNumber, userPeriod.UserID, buildingID,
		fullStart.Format("2006-01-02"), displayEnd.Format("2006-01-02"),
		totalAmount, netAmount, vatAmount, primary.VATRate, primary.VATIncluded, primary.Currency,
		false, items,
	)
	if err != nil {
		return nil, err
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
func (bs *BillingService) calculateZEVConsumption(userID, buildingID int, start, end time.Time) (normal, solar, battery, total float64) {
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
		AND m.meter_type IN ('apartment_meter', 'solar_meter', 'battery_meter')
		AND mr.reading_time >= ? AND mr.reading_time <= ?
		ORDER BY mr.reading_time, m.id
	`, buildingID, start, end)

	if err != nil {
		log.Printf("    [ZEV] ERROR querying readings: %v", err)
		return 0, 0, 0, 0
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

	// Solar meters that store production in the main register instead of export.
	mainRegSolar := bs.mainRegisterSolarMeters(buildingID)

	if len(allReadings) == 0 {
		log.Printf("    [ZEV] ERROR: No readings found")
		return 0, 0, 0, 0
	}

	type IntervalData struct {
		UserConsumption     float64
		BuildingConsumption float64
		SolarProduction     float64 // FIXED: Now uses export energy
		BatteryCharge       float64 // solar stored into the battery this interval
		BatteryDischarge    float64 // energy the battery supplied this interval
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
			// Production is normally in the export column, but some meters record
			// it in the main register instead (export stays 0).
			solar := reading.ConsumptionExport
			if mainRegSolar[reading.MeterID] {
				solar = reading.ConsumptionKWh
			}
			intervalData[roundedTime].SolarProduction += solar
		} else if reading.MeterType == "battery_meter" {
			// Import column = discharge (supplied to building), export column =
			// charge (stored from solar).
			intervalData[roundedTime].BatteryDischarge += reading.ConsumptionKWh
			intervalData[roundedTime].BatteryCharge += reading.ConsumptionExport
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

	// Solar-priced split meters (e.g. a heating meter billed on a solar/grid split)
	// join the building consumption pool too, so apartments and split meters share
	// the same solar production. Single-price split meters do NOT draw solar and are
	// intentionally excluded.
	if splitMeterIntervals := bs.solarModeSplitMeterIntervals(buildingID, start, end); len(splitMeterIntervals) > 0 {
		for ts, kwh := range splitMeterIntervals {
			if intervalData[ts] == nil {
				intervalData[ts] = &IntervalData{}
			}
			intervalData[ts].BuildingConsumption += kwh
		}
		log.Printf("    [ZEV] Added %d solar-mode split-meter interval(s) to building pool", len(splitMeterIntervals))
	}

	// "total" solar-split mode: replace the metered consumption pool with the
	// building's true total consumption (incl. unmetered loads) so every consumed
	// Watt draws the same solar share. Per interval, only ever raise the
	// denominator (never below the metered pool) so missing/degraded grid data
	// falls back safely to the legacy behaviour.
	if bs.solarSplitMode(buildingID) == "total" {
		totals := bs.buildingTotalConsumptionIntervals(buildingID, start, end)
		overridden := 0
		for ts, data := range intervalData {
			if tot, ok := totals[ts]; ok && tot > data.BuildingConsumption {
				data.BuildingConsumption = tot
				overridden++
			}
		}
		log.Printf("    [ZEV] Solar split mode=total: raised denominator on %d/%d interval(s)", overridden, len(intervalData))
	}

	totalNormal := 0.0
	totalSolar := 0.0
	totalBattery := 0.0
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

		// Three tiers in priority order: solar → battery → grid, each proportional
		// to the user's share of building consumption.
		userSolar, userBattery, userNormal := SplitSolarBatteryGrid(
			data.UserConsumption, data.BuildingConsumption, data.SolarProduction,
			data.BatteryCharge, data.BatteryDischarge)

		totalSolar += userSolar
		totalBattery += userBattery
		totalNormal += userNormal

		if userSolar > 0 {
			solarUsed += userSolar
		}

		if (intervalCount <= 5) || (userSolar > 0 && solarUsed <= userSolar*3) {
			log.Printf("    [ZEV] %s: User %.3f kWh, Building %.3f kWh, Solar %.3f kWh, Bat d/c %.3f/%.3f → %.3f solar + %.3f battery + %.3f grid",
				timestamp.Format("15:04"), data.UserConsumption, data.BuildingConsumption,
				data.SolarProduction, data.BatteryDischarge, data.BatteryCharge, userSolar, userBattery, userNormal)
		}
	}

	if intervalCount == 0 {
		log.Printf("    [ZEV] WARNING: No valid intervals processed")
	} else {
		log.Printf("    [ZEV] Processed %d intervals (15-minute fixed intervals)", intervalCount)
		if totalConsumption > 0 {
			log.Printf("    [ZEV] RESULT - Total: %.3f kWh, Solar: %.3f kWh (%.1f%%), Battery: %.3f kWh (%.1f%%), Grid: %.3f kWh (%.1f%%)",
				totalConsumption, totalSolar, (totalSolar/totalConsumption)*100,
				totalBattery, (totalBattery/totalConsumption)*100,
				totalNormal, (totalNormal/totalConsumption)*100)
		}
	}

	return totalNormal, totalSolar, totalBattery, totalConsumption
}
