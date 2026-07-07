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

// generateVZEVBillsWithOptions handles virtual energy allocation with custom item selection
func (bs *BillingService) generateVZEVBillsWithOptions(complexID int, groupBuildingsJSON string, userIDs []int, start, end time.Time, segments []PriceSegment, customItemIDs []int) ([]models.Invoice, []SkippedBill, error) {
	log.Printf("\n=== vZEV BILLING START ===")
	log.Printf("Complex ID: %d, Period: %s to %s", complexID, start.Format("2006-01-02"), end.Format("2006-01-02"))

	// Parse group buildings
	var groupBuildings []int
	if groupBuildingsJSON != "" {
		if err := json.Unmarshal([]byte(groupBuildingsJSON), &groupBuildings); err != nil {
			return nil, nil, fmt.Errorf("failed to parse group buildings: %v", err)
		}
	}

	if len(groupBuildings) == 0 {
		return nil, nil, fmt.Errorf("no buildings in complex group")
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
	skipped := []SkippedBill{}

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
			skipped = append(skipped, newSkippedBill(userInfo.UserPeriod, userInfo.BuildingID, err))
			continue
		}

		invoices = append(invoices, *invoice)
	}

	log.Printf("\n=== vZEV BILLING COMPLETE: %d invoices, %d skipped ===", len(invoices), len(skipped))
	return invoices, skipped, nil
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

	// Cache which solar meters store production in the main register (export 0).
	mainRegSolar := make(map[int]bool)
	for _, r := range allReadings {
		if r.MeterType == "solar_meter" {
			if _, seen := mainRegSolar[r.MeterID]; !seen {
				mainRegSolar[r.MeterID] = bs.solarUsesMainRegister(r.MeterID)
			}
		}
	}

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
			// Production is normally the export energy, but some meters record it
			// in the main register instead (export stays 0).
			if mainRegSolar[reading.MeterID] {
				interval.BuildingSolarProd[reading.BuildingID] += reading.ConsumptionKWh
			} else {
				interval.BuildingSolarProd[reading.BuildingID] += reading.ConsumptionExport
			}
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
		if bs.chargingCounterResetDetected(buildingID, BillingScope{Mode: BillingModeApartments}, userPeriod.ChargerIDs, winStart, winEnd) {
			items = append(items, models.InvoiceItem{Description: tr.ChargerCounterResetWarning, ItemType: "charging_warning"})
		}
	}

	// Shared meters and custom items (pro-rated)
	totalActiveUsers, _ := bs.countActiveUsers(buildingID)
	if totalActiveUsers == 0 {
		totalActiveUsers = 1
	}

	sharedMeterItems, sharedMeterCost, _ := bs.calculateSharedMeterCostsWithTranslations(
		buildingID, start, end, userPeriod.UserID, totalActiveUsers, tr, primary.Currency, userPeriod.ProrationFactor, primary,
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

	// SAFETY: never persist a 0.00 vZEV invoice (see generateUserInvoiceForPeriodWithOptionsAndScope).
	if grossAmount <= zeroBillEpsilon {
		return nil, fmt.Errorf("%s 0.00 invoice not created for %s %s: no billable consumption found for this period — check meter linkage, readings and pricing",
			primary.Currency, userPeriod.FirstName, userPeriod.LastName)
	}

	// Create invoice record (+ items) atomically; vZEV flag set.
	invoiceID, err := bs.insertInvoiceWithItems(
		invoiceNumber, userPeriod.UserID, buildingID,
		fullStart.Format("2006-01-02"), displayEnd.Format("2006-01-02"),
		totalAmount, netAmount, vatAmount, primary.VATRate, primary.VATIncluded, primary.Currency,
		true, items,
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
		IsVZEV:        true,
		Items:         items,
		GeneratedAt:   time.Now(),
	}

	return invoice, nil
}
