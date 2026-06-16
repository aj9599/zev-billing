package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/aj9599/zev-billing/backend/models"
	"github.com/aj9599/zev-billing/backend/services"
)

type DashboardHandler struct {
	db            *sql.DB
	dataCollector *services.DataCollector
}

func NewDashboardHandler(db *sql.DB, dataCollector *services.DataCollector) *DashboardHandler {
	return &DashboardHandler{db: db, dataCollector: dataCollector}
}

// Helper function to round time to nearest 15-minute interval
func roundTo15Min(t time.Time) time.Time {
	minutes := t.Minute()
	var roundedMinutes int

	if minutes < 8 {
		roundedMinutes = 0
	} else if minutes < 23 {
		roundedMinutes = 15
	} else if minutes < 38 {
		roundedMinutes = 30
	} else if minutes < 53 {
		roundedMinutes = 45
	} else {
		return time.Date(t.Year(), t.Month(), t.Day(), t.Hour()+1, 0, 0, 0, t.Location())
	}

	return time.Date(t.Year(), t.Month(), t.Day(), t.Hour(), roundedMinutes, 0, 0, t.Location())
}

func (h *DashboardHandler) GetStats(w http.ResponseWriter, r *http.Request) {
	defer func() {
		if rec := recover(); rec != nil {
			log.Printf("PANIC in GetStats: %v", rec)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
		}
	}()

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var stats models.DashboardStats

	// Count all users
	if err := h.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM users").Scan(&stats.TotalUsers); err != nil {
		log.Printf("Error counting users: %v", err)
		stats.TotalUsers = 0
	}

	// Count regular users
	if err := h.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM users WHERE COALESCE(user_type, 'regular') = 'regular'").Scan(&stats.RegularUsers); err != nil {
		log.Printf("Error counting regular users: %v", err)
		stats.RegularUsers = 0
	}

	// Count admin users
	if err := h.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM users WHERE user_type = 'administration'").Scan(&stats.AdminUsers); err != nil {
		log.Printf("Error counting admin users: %v", err)
		stats.AdminUsers = 0
	}

	// Count buildings (excluding groups/complexes)
	if err := h.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM buildings WHERE COALESCE(is_group, 0) = 0").Scan(&stats.TotalBuildings); err != nil {
		log.Printf("Error counting buildings: %v", err)
		stats.TotalBuildings = 0
	}

	// Count complexes (building groups)
	if err := h.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM buildings WHERE is_group = 1").Scan(&stats.TotalComplexes); err != nil {
		log.Printf("Error counting complexes: %v", err)
		stats.TotalComplexes = 0
	}

	if err := h.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM meters").Scan(&stats.TotalMeters); err != nil {
		log.Printf("Error counting meters: %v", err)
		stats.TotalMeters = 0
	}

	if err := h.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM chargers").Scan(&stats.TotalChargers); err != nil {
		log.Printf("Error counting chargers: %v", err)
		stats.TotalChargers = 0
	}

	if err := h.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM meters WHERE is_active = 1").Scan(&stats.ActiveMeters); err != nil {
		log.Printf("Error counting active meters: %v", err)
		stats.ActiveMeters = 0
	}

	if err := h.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM chargers WHERE is_active = 1").Scan(&stats.ActiveChargers); err != nil {
		log.Printf("Error counting active chargers: %v", err)
		stats.ActiveChargers = 0
	}

	now := time.Now()
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	todayEnd := todayStart.Add(24 * time.Hour)
	startOfMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())

	// "Consumption" stat on the dashboard means grid usage (imported energy).
	// Solar self-consumed is shown separately via the Solar / self-consumption
	// stats, so we don't include it here — that would double-count.
	stats.TodayConsumption = calculateGridUsage(h.db, ctx, todayStart, todayEnd)
	stats.MonthConsumption = calculateGridUsage(h.db, ctx, startOfMonth, now)

	// For solar, we calculate export (generation) separately
	solarMeterTypes := []string{"solar_meter"}
	stats.TodaySolar = calculateTotalSolarExport(h.db, ctx, solarMeterTypes, todayStart, todayEnd)
	stats.MonthSolar = calculateTotalSolarExport(h.db, ctx, solarMeterTypes, startOfMonth, now)

	stats.TodayCharging = calculateTotalChargingConsumption(h.db, ctx, todayStart, todayEnd)
	stats.MonthCharging = calculateTotalChargingConsumption(h.db, ctx, startOfMonth, now)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

// cumulativeDeltaInPeriod returns the energy delivered inside
// [periodStart, periodEnd) for a single cumulative-meter series, identified
// by the three positional args (id, periodStart, periodEnd).
//
// Strategy: latest_in_period − baseline, with a corruption fallback. When
// the row immediately before the period exists and is ≤ the latest in-period
// reading, that's the most accurate baseline (it captures the slice from
// the period boundary forward). When it's > the latest (a sign of a stale
// over-counted historical row, e.g. the SessionEnergy double-count rows
// from before the recent Zaptec fixes), we fall back to the first reading
// in the period so a single bad row can't trash the whole stat.
//
// firstQuery / latestQuery select a REAL column with the args
// (id, periodStart, periodEnd); baselineQuery selects with (id, periodStart).
func cumulativeDeltaInPeriod(db *sql.DB, ctx context.Context, firstQuery, latestQuery, baselineQuery string, id interface{}, periodStart, periodEnd time.Time) float64 {
	var first, latest, before sql.NullFloat64
	_ = db.QueryRowContext(ctx, firstQuery, id, periodStart, periodEnd).Scan(&first)
	_ = db.QueryRowContext(ctx, latestQuery, id, periodStart, periodEnd).Scan(&latest)
	_ = db.QueryRowContext(ctx, baselineQuery, id, periodStart).Scan(&before)

	if !latest.Valid {
		return 0
	}

	var baseline float64
	switch {
	case before.Valid && before.Float64 <= latest.Float64:
		// Healthy baseline: trust the row before the period.
		baseline = before.Float64
	case first.Valid:
		// Corrupt baseline (over-counted historical row) — fall back to the
		// first reading inside the period.
		baseline = first.Float64
	default:
		return 0
	}

	delta := latest.Float64 - baseline
	if delta < 0 {
		return 0
	}
	return delta
}

func calculateTotalConsumption(db *sql.DB, ctx context.Context, meterTypes []string, periodStart, periodEnd time.Time) float64 {
	if len(meterTypes) == 0 {
		return 0
	}

	placeholders := make([]string, len(meterTypes))
	args := make([]interface{}, len(meterTypes))
	for i, mt := range meterTypes {
		placeholders[i] = "?"
		args[i] = mt
	}

	meterTypeFilter := strings.Join(placeholders, ",")

	meterQuery := fmt.Sprintf(`
		SELECT id FROM meters
		WHERE meter_type IN (%s)
		AND COALESCE(is_active, 1) = 1
	`, meterTypeFilter)

	meterRows, err := db.QueryContext(ctx, meterQuery, args...)
	if err != nil {
		log.Printf("Error querying meters: %v", err)
		return 0
	}
	defer meterRows.Close()

	totalConsumption := 0.0

	for meterRows.Next() {
		var meterID int
		if err := meterRows.Scan(&meterID); err != nil {
			continue
		}

		totalConsumption += cumulativeDeltaInPeriod(db, ctx,
			`SELECT power_kwh FROM meter_readings
			 WHERE meter_id = ? AND reading_time >= ? AND reading_time < ?
			 ORDER BY reading_time ASC LIMIT 1`,
			`SELECT power_kwh FROM meter_readings
			 WHERE meter_id = ? AND reading_time >= ? AND reading_time < ?
			 ORDER BY reading_time DESC LIMIT 1`,
			`SELECT power_kwh FROM meter_readings
			 WHERE meter_id = ? AND reading_time < ?
			 ORDER BY reading_time DESC LIMIT 1`,
			meterID, periodStart, periodEnd)
	}

	return totalConsumption
}

// calculateGridUsage returns the energy imported from the public grid in
// [periodStart, periodEnd) — i.e. only the share that crossed the grid
// boundary, NOT the building's total consumption (which would include
// solar self-consumed onsite).
//
//   - When a total_meter is configured we use it directly (its power_kwh
//     column is the grid-import register).
//   - Otherwise, when apartment meters are available, fall back to
//     apartment_total − solar_production. Per-apartment readings include
//     both grid import and solar self-consumed; subtracting solar
//     production removes the latter, leaving only the grid share.
//     Clamped to zero in case of edge anomalies.
func calculateGridUsage(db *sql.DB, ctx context.Context, periodStart, periodEnd time.Time) float64 {
	if hasMeterOfType(db, ctx, "total_meter") {
		return calculateTotalConsumption(db, ctx, []string{"total_meter"}, periodStart, periodEnd)
	}
	if !hasMeterOfType(db, ctx, "apartment_meter") {
		return 0
	}
	apartmentTotal := calculateTotalConsumption(db, ctx, []string{"apartment_meter"}, periodStart, periodEnd)
	solarProduction := calculateTotalSolarExport(db, ctx, []string{"solar_meter"}, periodStart, periodEnd)
	usage := apartmentTotal - solarProduction
	if usage < 0 {
		return 0
	}
	return usage
}

// calculateBuildingConsumption returns the building's total consumed energy
// (solar self-consumed + grid imported). Used for the self-consumption
// percentage; not displayed as a top-level stat.
func calculateBuildingConsumption(db *sql.DB, ctx context.Context, periodStart, periodEnd time.Time) float64 {
	if hasMeterOfType(db, ctx, "apartment_meter") {
		return calculateTotalConsumption(db, ctx, []string{"apartment_meter"}, periodStart, periodEnd)
	}

	solarProduction := calculateTotalSolarExport(db, ctx, []string{"solar_meter"}, periodStart, periodEnd)
	gridImport := calculateTotalConsumption(db, ctx, []string{"total_meter"}, periodStart, periodEnd)
	gridExport := calculateTotalSolarExport(db, ctx, []string{"total_meter"}, periodStart, periodEnd)

	consumption := solarProduction + gridImport - gridExport
	if consumption < 0 {
		return 0
	}
	return consumption
}

// hasMeterOfType returns true when at least one active meter of the given
// type is configured.
func hasMeterOfType(db *sql.DB, ctx context.Context, meterType string) bool {
	var count int
	err := db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM meters
		WHERE meter_type = ? AND COALESCE(is_active, 1) = 1
	`, meterType).Scan(&count)
	if err != nil {
		return false
	}
	return count > 0
}

// New function specifically for solar export calculation
func calculateTotalSolarExport(db *sql.DB, ctx context.Context, meterTypes []string, periodStart, periodEnd time.Time) float64 {
	if len(meterTypes) == 0 {
		return 0
	}

	placeholders := make([]string, len(meterTypes))
	args := make([]interface{}, len(meterTypes))
	for i, mt := range meterTypes {
		placeholders[i] = "?"
		args[i] = mt
	}

	meterTypeFilter := strings.Join(placeholders, ",")

	meterQuery := fmt.Sprintf(`
		SELECT id FROM meters 
		WHERE meter_type IN (%s) 
		AND COALESCE(is_active, 1) = 1
	`, meterTypeFilter)

	meterRows, err := db.QueryContext(ctx, meterQuery, args...)
	if err != nil {
		log.Printf("Error querying solar meters: %v", err)
		return 0
	}
	defer meterRows.Close()

	totalExport := 0.0

	for meterRows.Next() {
		var meterID int
		if err := meterRows.Scan(&meterID); err != nil {
			continue
		}

		totalExport += cumulativeDeltaInPeriod(db, ctx,
			`SELECT power_kwh_export FROM meter_readings
			 WHERE meter_id = ? AND reading_time >= ? AND reading_time < ?
			 ORDER BY reading_time ASC LIMIT 1`,
			`SELECT power_kwh_export FROM meter_readings
			 WHERE meter_id = ? AND reading_time >= ? AND reading_time < ?
			 ORDER BY reading_time DESC LIMIT 1`,
			`SELECT power_kwh_export FROM meter_readings
			 WHERE meter_id = ? AND reading_time < ?
			 ORDER BY reading_time DESC LIMIT 1`,
			meterID, periodStart, periodEnd)
	}

	return totalExport
}

func calculateTotalChargingConsumption(db *sql.DB, ctx context.Context, periodStart, periodEnd time.Time) float64 {
	chargerRows, err := db.QueryContext(ctx, `
		SELECT id FROM chargers 
		WHERE COALESCE(is_active, 1) = 1
	`)
	if err != nil {
		log.Printf("Error querying chargers: %v", err)
		return 0
	}
	defer chargerRows.Close()

	totalConsumption := 0.0

	for chargerRows.Next() {
		var chargerID int
		if err := chargerRows.Scan(&chargerID); err != nil {
			continue
		}

		// charger_sessions stores a single cumulative meter for the charger.
		// Use latest − baseline (with corruption fallback) so a historical
		// over-counted row outside the period can't inflate the total.
		totalConsumption += cumulativeDeltaInPeriod(db, ctx,
			`SELECT power_kwh FROM charger_sessions
			 WHERE charger_id = ? AND session_time >= ? AND session_time < ?
			 ORDER BY session_time ASC LIMIT 1`,
			`SELECT power_kwh FROM charger_sessions
			 WHERE charger_id = ? AND session_time >= ? AND session_time < ?
			 ORDER BY session_time DESC LIMIT 1`,
			`SELECT power_kwh FROM charger_sessions
			 WHERE charger_id = ? AND session_time < ?
			 ORDER BY session_time DESC LIMIT 1`,
			chargerID, periodStart, periodEnd)
	}

	return totalConsumption
}

func (h *DashboardHandler) GetConsumption(w http.ResponseWriter, r *http.Request) {
	defer func() {
		if rec := recover(); rec != nil {
			log.Printf("PANIC in GetConsumption: %v", rec)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
		}
	}()

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	period := r.URL.Query().Get("period")
	if period == "" {
		period = "24h"
	}

	now := time.Now()
	var startTime time.Time
	switch period {
	case "1h":
		startTime = now.Add(-1 * time.Hour)
	case "24h":
		startTime = now.Add(-24 * time.Hour)
	case "7d":
		startTime = now.Add(-7 * 24 * time.Hour)
	case "30d":
		startTime = now.Add(-30 * 24 * time.Hour)
	default:
		startTime = now.Add(-24 * time.Hour)
	}

	log.Printf("GetConsumption: period=%s, startTime=%s, endTime=%s",
		period, startTime.Format("2006-01-02 15:04:05"), now.Format("2006-01-02 15:04:05"))

	rows, err := h.db.QueryContext(ctx, `
		SELECT m.meter_type, mr.reading_time, mr.consumption_kwh
		FROM meter_readings mr
		JOIN meters m ON mr.meter_id = m.id
		WHERE mr.reading_time >= ? AND mr.reading_time <= ?
		ORDER BY mr.reading_time ASC
	`, startTime, now)

	if err != nil {
		log.Printf("Error querying consumption: %v", err)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]interface{}{})
		return
	}
	defer rows.Close()

	consumption := []models.ConsumptionData{}
	for rows.Next() {
		var c models.ConsumptionData
		if err := rows.Scan(&c.Source, &c.Timestamp, &c.Power); err == nil {
			consumption = append(consumption, c)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(consumption)
}

func (h *DashboardHandler) GetConsumptionByBuilding(w http.ResponseWriter, r *http.Request) {
	defer func() {
		if rec := recover(); rec != nil {
			log.Printf("PANIC in GetConsumptionByBuilding: %v", rec)
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode([]interface{}{})
		}
	}()

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	period := r.URL.Query().Get("period")
	if period == "" {
		period = "24h"
	}

	now := time.Now()
	var startTime time.Time
	switch period {
	case "1h":
		startTime = now.Add(-1 * time.Hour)
	case "24h":
		startTime = now.Add(-24 * time.Hour)
	case "7d":
		startTime = now.Add(-7 * 24 * time.Hour)
	case "30d":
		startTime = now.Add(-30 * 24 * time.Hour)
	default:
		startTime = now.Add(-24 * time.Hour)
	}

	log.Printf("GetConsumptionByBuilding: period=%s, startTime=%s, endTime=%s",
		period, startTime.Format("2006-01-02 15:04:05"), now.Format("2006-01-02 15:04:05"))

	buildingRows, err := h.db.QueryContext(ctx, `
		SELECT id, name 
		FROM buildings 
		WHERE COALESCE(is_group, 0) = 0
		ORDER BY name
	`)
	if err != nil {
		log.Printf("Error querying buildings: %v", err)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]interface{}{})
		return
	}

	type buildingInfo struct {
		id   int
		name string
	}
	buildingInfos := []buildingInfo{}

	for buildingRows.Next() {
		var bi buildingInfo
		if err := buildingRows.Scan(&bi.id, &bi.name); err != nil {
			log.Printf("Error scanning building row: %v", err)
			continue
		}
		buildingInfos = append(buildingInfos, bi)
	}
	buildingRows.Close()

	log.Printf("Found %d buildings to process", len(buildingInfos))

	type MeterData struct {
		MeterID   int                      `json:"meter_id"`
		MeterName string                   `json:"meter_name"`
		MeterType string                   `json:"meter_type"`
		UserName  string                   `json:"user_name,omitempty"`
		Data      []models.ConsumptionData `json:"data"`
	}

	type BuildingConsumption struct {
		BuildingID   int         `json:"building_id"`
		BuildingName string      `json:"building_name"`
		Meters       []MeterData `json:"meters"`
	}

	buildings := []BuildingConsumption{}

	for _, bi := range buildingInfos {
		log.Printf("Processing building ID: %d, Name: %s", bi.id, bi.name)

		building := BuildingConsumption{
			BuildingID:   bi.id,
			BuildingName: bi.name,
			Meters:       []MeterData{},
		}

		// Process meters with fixed 15-minute intervals
		log.Printf("  Querying meters for building %d...", bi.id)
		meterRows, err := h.db.QueryContext(ctx, `
			SELECT m.id, m.name, m.meter_type, m.user_id
			FROM meters m
			WHERE m.building_id = ? 
			AND COALESCE(m.is_active, 1) = 1
			AND m.meter_type IN ('apartment_meter', 'solar_meter', 'total_meter', 'heating_meter', 'house_meter', 'battery_meter', 'other')
			ORDER BY m.meter_type, m.name
		`, bi.id)

		if err != nil {
			log.Printf("  Error querying meters for building %d: %v", bi.id, err)
			buildings = append(buildings, building)
			continue
		}

		type meterInfo struct {
			id        int
			name      string
			meterType string
			userID    sql.NullInt64
		}
		meterInfos := []meterInfo{}

		for meterRows.Next() {
			var mi meterInfo
			if err := meterRows.Scan(&mi.id, &mi.name, &mi.meterType, &mi.userID); err != nil {
				log.Printf("  Error scanning meter row: %v", err)
				continue
			}
			meterInfos = append(meterInfos, mi)
		}
		meterRows.Close()

		log.Printf("  Found %d meters for building %d", len(meterInfos), bi.id)

		for _, mi := range meterInfos {
			log.Printf("    Processing meter ID: %d, Name: %s, Type: %s", mi.id, mi.name, mi.meterType)

			userName := ""
			if mi.userID.Valid {
				err = h.db.QueryRowContext(ctx, `
					SELECT first_name || ' ' || last_name 
					FROM users 
					WHERE id = ?
				`, mi.userID.Int64).Scan(&userName)

				if err != nil && err != sql.ErrNoRows {
					log.Printf("    Error getting user name for user %d: %v", mi.userID.Int64, err)
				}
			}

			// Get data at 15-minute intervals and convert consumption to power
			// For solar meters, we use export data (negative values for display)
			var dataRows *sql.Rows
			if mi.meterType == "solar_meter" {
				// For solar, get export consumption (will be displayed as negative)
				dataRows, err = h.db.QueryContext(ctx, `
					SELECT reading_time, power_kwh_export, consumption_export
					FROM meter_readings
					WHERE meter_id = ? 
					AND reading_time >= ? 
					AND reading_time <= ?
					ORDER BY reading_time ASC
				`, mi.id, startTime, now)
			} else {
				// For other meters, get import consumption
				dataRows, err = h.db.QueryContext(ctx, `
					SELECT reading_time, power_kwh, consumption_kwh
					FROM meter_readings
					WHERE meter_id = ? 
					AND reading_time >= ? 
					AND reading_time <= ?
					ORDER BY reading_time ASC
				`, mi.id, startTime, now)
			}

			meterData := MeterData{
				MeterID:   mi.id,
				MeterName: mi.name,
				MeterType: mi.meterType,
				UserName:  userName,
				Data:      []models.ConsumptionData{},
			}

			if err != nil {
				log.Printf("    Error querying readings for meter %d: %v", mi.id, err)
				building.Meters = append(building.Meters, meterData)
				continue
			}

			for dataRows.Next() {
				var timestamp time.Time
				var powerKwh, consumptionKwh float64
				if err := dataRows.Scan(&timestamp, &powerKwh, &consumptionKwh); err != nil {
					continue
				}

				// Convert consumption (kWh over 15 min) to power (W)
				// Power (W) = Energy (kWh) / Time (h) * 1000
				// Time = 15 min = 0.25 h
				powerW := (consumptionKwh / 0.25) * 1000

				// For solar meters, make power negative to show as generation/export
				if mi.meterType == "solar_meter" {
					powerW = -powerW
				}

				meterData.Data = append(meterData.Data, models.ConsumptionData{
					Timestamp: timestamp,
					Power:     powerW,
					Source:    mi.meterType,
				})
			}
			dataRows.Close()

			log.Printf("    Meter ID: %d has %d data points at 15-min intervals", mi.id, len(meterData.Data))

			building.Meters = append(building.Meters, meterData)
		}

		// Process chargers with fixed 15-minute intervals
		log.Printf("  Querying chargers for building %d...", bi.id)
		chargerRows, err := h.db.QueryContext(ctx, `
			SELECT c.id, c.name
			FROM chargers c
			WHERE c.building_id = ? 
			AND COALESCE(c.is_active, 1) = 1
			ORDER BY c.name
		`, bi.id)

		if err != nil {
			log.Printf("  Error querying chargers for building %d: %v", bi.id, err)
		} else {
			type chargerInfo struct {
				id   int
				name string
			}
			chargerInfos := []chargerInfo{}

			for chargerRows.Next() {
				var ci chargerInfo
				if err := chargerRows.Scan(&ci.id, &ci.name); err != nil {
					log.Printf("  Error scanning charger row: %v", err)
					continue
				}
				chargerInfos = append(chargerInfos, ci)
			}
			chargerRows.Close()

			log.Printf("  Found %d chargers for building %d", len(chargerInfos), bi.id)

			for _, ci := range chargerInfos {
				log.Printf("    Processing charger ID: %d, Name: %s", ci.id, ci.name)

				// First, collect all session times for this charger to know when to break the baseline
				// Use STRING keys to avoid timezone comparison issues
				sessionTimes := make(map[string]bool)
				var allSessionRows *sql.Rows
				allSessionRows, err = h.db.QueryContext(ctx, `
					SELECT DISTINCT session_time
					FROM charger_sessions
					WHERE charger_id = ? 
					AND session_time >= ?
					AND session_time <= ?
					AND state != '1'
					ORDER BY session_time ASC
				`, ci.id, startTime, now)

				if err == nil {
					sessionCount := 0
					for allSessionRows.Next() {
						var sessionTime time.Time
						if allSessionRows.Scan(&sessionTime) == nil {
							// Round to 15-minute interval
							rounded := roundTo15Min(sessionTime)
							// Use formatted string as key to avoid timezone issues
							timeKey := rounded.Format("2006-01-02T15:04:05")
							sessionTimes[timeKey] = true
							sessionCount++
							if sessionCount <= 5 {
								log.Printf("      ðŸ” Session at %s rounds to %s (key: %s)",
									sessionTime.Format("15:04:05"),
									rounded.Format("15:04:05"),
									timeKey)
							}
						}
					}
					allSessionRows.Close()
					log.Printf("      Found %d session times, %d unique 15-min intervals to exclude", sessionCount, len(sessionTimes))
				}

				// Generate 0W baseline at 15-minute intervals, but SKIP times where sessions exist
				baselineData := []models.ConsumptionData{}
				currentTime := roundTo15Min(startTime)
				roundedNow := roundTo15Min(now)
				excludedCount := 0
				for currentTime.Before(roundedNow) {
					// Create time key for lookup (without timezone)
					timeKey := currentTime.Format("2006-01-02T15:04:05")

					// Only add baseline point if NO session at this time
					if !sessionTimes[timeKey] {
						baselineData = append(baselineData, models.ConsumptionData{
							Timestamp: currentTime,
							Power:     0,
							Source:    "charger",
						})
					} else {
						excludedCount++
						if excludedCount <= 5 {
							log.Printf("      â­ï¸  Skipping baseline at %s (key: %s - session exists)",
								currentTime.Format("15:04:05"),
								timeKey)
						}
					}
					currentTime = currentTime.Add(15 * time.Minute)
				}

				// Only add baseline if there are any 0W points
				if len(baselineData) > 0 {
					baselineMeter := MeterData{
						MeterID:   ci.id,
						MeterName: ci.name,
						MeterType: "charger",
						UserName:  ci.name + " (Baseline)",
						Data:      baselineData,
					}
					log.Printf("    ðŸ“Š Added 0W baseline with %d points (excluded %d intervals with sessions)", len(baselineData), len(sessionTimes))
					building.Meters = append(building.Meters, baselineMeter)
				}

				var userRows *sql.Rows
				// Exclude disconnected states (state=1) to avoid post-session spikes
				// Allow empty user_ids for Zaptec chargers
				userRows, err = h.db.QueryContext(ctx, `
					SELECT DISTINCT COALESCE(user_id, '') as user_id
					FROM charger_sessions
					WHERE charger_id = ? 
					AND session_time >= ?
					AND session_time <= ?
					AND state != '1'
					ORDER BY user_id
				`, ci.id, startTime, now)

				if err != nil {
					log.Printf("    Error querying users for charger %d: %v", ci.id, err)
					continue
				}

				type userInfo struct {
					userID     string
					actualUser int
					userName   string
				}
				userInfos := []userInfo{}

				for userRows.Next() {
					var rfidOrUserID string
					if err := userRows.Scan(&rfidOrUserID); err != nil {
						continue
					}

					// Try to map RFID tag to actual user
					var actualUserID int
					var actualUserName string
					var found bool

					// If user_id is empty (Zaptec), use charger name as display name
					if rfidOrUserID == "" {
						actualUserName = ci.name
						actualUserID = 0
						found = true
						log.Printf("      Empty user_id (Zaptec charger) - using charger name: '%s'", actualUserName)
					} else {
						log.Printf("      Looking up RFID/UserID: '%s'", rfidOrUserID)

						// Try multiple patterns for charger_ids field
						patterns := []string{
							rfidOrUserID,                 // Exact: "2"
							"%" + rfidOrUserID + ",%",    // Start: "2,3"
							"%," + rfidOrUserID + ",%",   // Middle: "1,2,3"
							"%," + rfidOrUserID,          // End: "1,2"
							"%\"" + rfidOrUserID + "\"%", // JSON: ["2"]
						}

						for _, pattern := range patterns {
							err := h.db.QueryRowContext(ctx, `
								SELECT id, first_name || ' ' || last_name 
								FROM users 
								WHERE charger_ids = ? OR charger_ids LIKE ?
								LIMIT 1
							`, rfidOrUserID, pattern).Scan(&actualUserID, &actualUserName)

							if err == nil {
								found = true
								log.Printf("      âœ… Mapped RFID '%s' to user %d (%s)", rfidOrUserID, actualUserID, actualUserName)
								break
							}
						}

						// If not found in charger_ids, show as Unknown User
						if !found {
							actualUserName = fmt.Sprintf("Unknown User (RFID %s)", rfidOrUserID)
							actualUserID = 0 // No actual user
							log.Printf("      âš ï¸  RFID '%s' not found in any user's charger_ids - showing as Unknown User", rfidOrUserID)

							// DEBUG: Show what charger_ids exist in database to help diagnose
							debugRows, debugErr := h.db.QueryContext(ctx, `
								SELECT id, first_name || ' ' || last_name, charger_ids 
								FROM users 
								WHERE charger_ids IS NOT NULL AND charger_ids != ''
							`)
							if debugErr == nil && debugRows != nil {
								log.Printf("      ðŸ” DEBUG: All users with charger_ids:")
								count := 0
								for debugRows.Next() {
									var debugID int
									var debugName, debugChargerIDs string
									if debugRows.Scan(&debugID, &debugName, &debugChargerIDs) == nil {
										log.Printf("         User %d (%s): charger_ids='%s'", debugID, debugName, debugChargerIDs)
										count++
									}
									if count >= 10 {
										log.Printf("         ... (showing first 10)")
										break
									}
								}
								debugRows.Close()
							}
						}
					}

					userInfos = append(userInfos, userInfo{
						userID:     rfidOrUserID,
						actualUser: actualUserID,
						userName:   actualUserName,
					})
				}
				userRows.Close()

				log.Printf("    Found %d users with sessions for charger %d", len(userInfos), ci.id)

				// Process each user's sessions
				for _, ui := range userInfos {
					log.Printf("      Processing RFID/User: %s (Actual user: %d - %s)", ui.userID, ui.actualUser, ui.userName)

					// Get charger data at 15-minute intervals
					// Filter out maintenance readings (state=1) that create spikes after sessions
					var sessionRows *sql.Rows
					sessionRows, err = h.db.QueryContext(ctx, `
						SELECT session_time, power_kwh, state
						FROM charger_sessions
						WHERE charger_id = ? 
						AND user_id = ?
						AND session_time >= ?
						AND session_time <= ?
						AND state != '1'
						ORDER BY session_time ASC
					`, ci.id, ui.userID, startTime, now)

					if err != nil {
						log.Printf("      Error querying sessions for charger %d, RFID/user %s: %v", ci.id, ui.userID, err)
						continue
					}

					consumptionData := []models.ConsumptionData{}
					var previousPower float64
					var hasPrevious bool

					for sessionRows.Next() {
						var timestamp time.Time
						var powerKwh float64
						var state string

						if err := sessionRows.Scan(&timestamp, &powerKwh, &state); err != nil {
							continue
						}

						if !hasPrevious {
							previousPower = powerKwh
							hasPrevious = true
							// First point with zero power
							consumptionData = append(consumptionData, models.ConsumptionData{
								Timestamp: timestamp,
								Power:     0,
								Source:    "charger",
							})
							continue
						}

						// Calculate consumption
						consumptionKwh := powerKwh - previousPower

						// Check for unrealistic jumps that indicate post-session accumulation
						// If the consumption is more than 10 kWh in 15 minutes (40 kW average), it's likely a spike
						if consumptionKwh > 10.0 {
							log.Printf("      Detected unrealistic consumption spike: %.2f kWh at %s, skipping", consumptionKwh, timestamp.Format("15:04"))
							// Don't update previousPower, so next reading will be calculated from last valid point
							continue
						}

						if consumptionKwh < 0 {
							// Meter reset
							log.Printf("      Meter reset detected at %s", timestamp.Format("15:04"))
							previousPower = powerKwh
							continue
						}

						// Convert consumption (kWh over 15 min) to power (W)
						powerW := (consumptionKwh / 0.25) * 1000

						// Cap unrealistic values
						if powerW > 50000 {
							powerW = 50000
						}

						consumptionData = append(consumptionData, models.ConsumptionData{
							Timestamp: timestamp,
							Power:     powerW,
							Source:    "charger",
						})

						previousPower = powerKwh
					}
					sessionRows.Close()

					// Add trailing 0W point after last charging data to bring line back to zero
					if len(consumptionData) > 1 {
						lastPoint := consumptionData[len(consumptionData)-1]
						if lastPoint.Power > 0 {
							consumptionData = append(consumptionData, models.ConsumptionData{
								Timestamp: lastPoint.Timestamp.Add(15 * time.Minute),
								Power:     0,
								Source:    "charger",
							})
						}
					}

					// Only add this user's data if they actually have charging data
					if len(consumptionData) > 0 {
						chargerData := MeterData{
							MeterID:   ci.id,
							MeterName: ci.name,
							MeterType: "charger",
							UserName:  ui.userName,
							Data:      consumptionData,
						}

						log.Printf("      Ã¢Å“â€¦ Charger ID: %d has %d data points for user %s", ci.id, len(consumptionData), ui.userName)
						building.Meters = append(building.Meters, chargerData)
					}
				}
			}
		}

		log.Printf("  Building %d processed with %d meters/chargers total", bi.id, len(building.Meters))
		buildings = append(buildings, building)
	}

	log.Printf("Returning %d buildings with consumption data", len(buildings))

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(buildings); err != nil {
		log.Printf("Error encoding JSON response: %v", err)
	}
}

func (h *DashboardHandler) GetLogs(w http.ResponseWriter, r *http.Request) {
	defer func() {
		if rec := recover(); rec != nil {
			log.Printf("PANIC in GetLogs: %v", rec)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
		}
	}()

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	limit := r.URL.Query().Get("limit")
	if limit == "" {
		limit = "100"
	}

	since := r.URL.Query().Get("since")

	var rows *sql.Rows
	var err error

	if since != "" {
		// Filter by time: return logs since the given ISO timestamp
		rows, err = h.db.QueryContext(ctx, `
			SELECT id, action, details, user_id, ip_address, created_at
			FROM admin_logs
			WHERE created_at >= ?
			ORDER BY created_at DESC
		`, since)
	} else {
		rows, err = h.db.QueryContext(ctx, `
			SELECT id, action, details, user_id, ip_address, created_at
			FROM admin_logs
			ORDER BY created_at DESC
			LIMIT ?
		`, limit)
	}

	if err != nil {
		log.Printf("Error querying logs: %v", err)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]interface{}{})
		return
	}
	defer rows.Close()

	logs := []models.AdminLog{}
	for rows.Next() {
		var l models.AdminLog
		if err := rows.Scan(&l.ID, &l.Action, &l.Details, &l.UserID, &l.IPAddress, &l.CreatedAt); err == nil {
			logs = append(logs, l)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(logs)
}

func (h *DashboardHandler) GetSelfConsumption(w http.ResponseWriter, r *http.Request) {
	defer func() {
		if rec := recover(); rec != nil {
			log.Printf("PANIC in GetSelfConsumption: %v", rec)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
		}
	}()

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	now := time.Now()
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	todayEnd := todayStart.Add(24 * time.Hour)
	startOfMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())

	var data models.SelfConsumptionData

	// Solar produced (export energy from solar meters)
	solarTypes := []string{"solar_meter"}
	data.TodaySolarProduced = calculateTotalSolarExport(h.db, ctx, solarTypes, todayStart, todayEnd)
	data.MonthSolarProduced = calculateTotalSolarExport(h.db, ctx, solarTypes, startOfMonth, now)

	// Total building consumption — same calc as the dashboard summary.
	todayConsumption := calculateBuildingConsumption(h.db, ctx, todayStart, todayEnd)
	monthConsumption := calculateBuildingConsumption(h.db, ctx, startOfMonth, now)

	// Self-consumed solar = min(solar produced, total consumption)
	if data.TodaySolarProduced > 0 {
		data.TodaySolarConsumed = data.TodaySolarProduced
		if todayConsumption < data.TodaySolarProduced {
			data.TodaySolarConsumed = todayConsumption
		}
		data.TodaySelfConsumption = (data.TodaySolarConsumed / data.TodaySolarProduced) * 100
	}

	if data.MonthSolarProduced > 0 {
		data.MonthSolarConsumed = data.MonthSolarProduced
		if monthConsumption < data.MonthSolarProduced {
			data.MonthSolarConsumed = monthConsumption
		}
		data.MonthSelfConsumption = (data.MonthSolarConsumed / data.MonthSolarProduced) * 100
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

// parseFlexibleTime parses the various datetime string formats SQLite/Go may
// store, returning ok=false for empty or unparseable (e.g. junk) values.
func parseFlexibleTime(s string) (time.Time, bool) {
	s = strings.TrimSpace(s)
	if s == "" {
		return time.Time{}, false
	}
	layouts := []string{
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02 15:04:05.999999999-07:00",
		"2006-01-02 15:04:05-07:00",
		"2006-01-02 15:04:05.999999999",
		"2006-01-02 15:04:05",
		"2006-01-02T15:04:05Z07:00",
	}
	for _, l := range layouts {
		if t, err := time.Parse(l, s); err == nil {
			return t, true
		}
	}
	return time.Time{}, false
}

// chargerLiveOnline returns the live reachability of an API-connected charger
// from the data collector (the same source the charger card uses), and whether a
// fresh status was available. For non-API chargers or when no fresh reading
// exists it returns ok=false so the caller falls back to session recency.
func (h *DashboardHandler) chargerLiveOnline(connType string, id int) (online bool, ok bool) {
	if h.dataCollector == nil {
		return false, false
	}
	switch connType {
	case "e3dc_api":
		if d, found := h.dataCollector.GetE3DCChargerData(id); found {
			return d.IsOnline, true
		}
	case "zaptec_api":
		if d, found := h.dataCollector.GetZaptecChargerData(id); found {
			return d.IsOnline, true
		}
	case "loxone_api":
		if d, found := h.dataCollector.GetLoxoneChargerLiveData(id); found {
			return d.IsOnline, true
		}
	}
	return false, false
}

func (h *DashboardHandler) GetSystemHealth(w http.ResponseWriter, r *http.Request) {
	defer func() {
		if rec := recover(); rec != nil {
			log.Printf("PANIC in GetSystemHealth: %v", rec)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
		}
	}()

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	now := time.Now()
	var health models.SystemHealth
	health.Devices = []models.DeviceHealth{}

	// Query meters with their latest reading time
	meterRows, err := h.db.QueryContext(ctx, `
		SELECT m.id, m.name, m.meter_type, COALESCE(b.name, ''), COALESCE(m.is_active, 1),
			(SELECT MAX(reading_time) FROM meter_readings WHERE meter_id = m.id)
		FROM meters m
		LEFT JOIN buildings b ON m.building_id = b.id
		ORDER BY m.name
	`)
	if err != nil {
		log.Printf("Error querying meters for health: %v", err)
	} else {
		for meterRows.Next() {
			var d models.DeviceHealth
			var lastReading sql.NullTime
			var isActive int
			if err := meterRows.Scan(&d.ID, &d.Name, &d.MeterType, &d.BuildingName, &isActive, &lastReading); err != nil {
				continue
			}
			d.Type = "meter"
			d.IsActive = isActive == 1
			if lastReading.Valid {
				t := lastReading.Time
				d.LastReading = &t
			}

			// Classify status
			if !d.IsActive {
				d.Status = "offline"
			} else if d.LastReading == nil {
				d.Status = "offline"
			} else {
				age := now.Sub(*d.LastReading)
				if age < 30*time.Minute {
					d.Status = "online"
				} else if age < 2*time.Hour {
					d.Status = "stale"
				} else {
					d.Status = "offline"
				}
			}

			health.Devices = append(health.Devices, d)
		}
		meterRows.Close()
	}

	// Query chargers with their latest session time
	chargerRows, err := h.db.QueryContext(ctx, `
		SELECT c.id, c.name, COALESCE(b.name, ''), COALESCE(c.is_active, 1), COALESCE(c.connection_type, ''),
			(SELECT MAX(session_time) FROM charger_sessions WHERE charger_id = c.id)
		FROM chargers c
		LEFT JOIN buildings b ON c.building_id = b.id
		ORDER BY c.name
	`)
	if err != nil {
		log.Printf("Error querying chargers for health: %v", err)
	} else {
		rowCount := 0
		for chargerRows.Next() {
			rowCount++
			var d models.DeviceHealth
			// MAX(session_time) is scanned as text and parsed leniently: an earlier
			// bad CSV import could have written non-date junk into session_time, and
			// scanning that straight into a time.Time would fail and silently drop
			// the whole charger from this overview.
			var lastReading sql.NullString
			var isActive int
			var connType string
			if err := chargerRows.Scan(&d.ID, &d.Name, &d.BuildingName, &isActive, &connType, &lastReading); err != nil {
				log.Printf("SystemHealth: charger row %d scan failed: %v", rowCount, err)
				continue
			}
			d.Type = "charger"
			d.MeterType = "charger"
			d.IsActive = isActive == 1
			if lastReading.Valid {
				if t, ok := parseFlexibleTime(lastReading.String); ok {
					d.LastReading = &t
				}
			}

			// API-connected chargers (e3dc/zaptec/loxone) report a real live
			// reachability that the 15-min charger_sessions cadence doesn't — use
			// it so this overview matches the charger card. Fall back to session
			// recency for push-based chargers (webhook/udp/mqtt) or when the
			// collector has no fresh reading.
			liveOnline, liveKnown := h.chargerLiveOnline(connType, d.ID)
			if !d.IsActive {
				d.Status = "offline"
			} else if liveKnown {
				if liveOnline {
					d.Status = "online"
				} else {
					d.Status = "offline"
				}
			} else if d.LastReading == nil {
				d.Status = "offline"
			} else {
				age := now.Sub(*d.LastReading)
				if age < 30*time.Minute {
					d.Status = "online"
				} else if age < 2*time.Hour {
					d.Status = "stale"
				} else {
					d.Status = "offline"
				}
			}

			log.Printf("SystemHealth charger %q (id=%d type=%q active=%v): liveKnown=%v liveOnline=%v lastReading=%v -> status=%s",
				d.Name, d.ID, connType, d.IsActive, liveKnown, liveOnline, d.LastReading, d.Status)

			health.Devices = append(health.Devices, d)
		}
		chargerRows.Close()
	}

	// Count statuses
	for _, d := range health.Devices {
		switch d.Status {
		case "online":
			health.OnlineCount++
		case "stale":
			health.StaleCount++
		case "offline":
			health.OfflineCount++
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(health)
}

func (h *DashboardHandler) GetCostOverview(w http.ResponseWriter, r *http.Request) {
	defer func() {
		if rec := recover(); rec != nil {
			log.Printf("PANIC in GetCostOverview: %v", rec)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
		}
	}()

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	now := time.Now()
	startOfMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())

	var overview models.CostOverview
	overview.Buildings = []models.BuildingCostEstimate{}
	overview.Currency = "CHF"

	// Get buildings with the pricing record valid for today. Without the date
	// filter (and LIMIT 1 per building) we would either pick an arbitrary
	// historical price or produce one duplicate row per active price record.
	today := now.Format("2006-01-02")
	buildingRows, err := h.db.QueryContext(ctx, `
		SELECT b.id, b.name, bs.normal_power_price, bs.solar_power_price,
			bs.car_charging_normal_price, COALESCE(bs.currency, 'CHF')
		FROM buildings b
		JOIN billing_settings bs ON bs.id = (
			SELECT id FROM billing_settings
			WHERE building_id = b.id AND is_active = 1
			  AND valid_from <= ?
			  AND (valid_to IS NULL OR valid_to >= ?)
			ORDER BY valid_from DESC
			LIMIT 1
		)
		WHERE COALESCE(b.is_group, 0) = 0
		ORDER BY b.name
	`, today, today)
	if err != nil {
		log.Printf("Error querying buildings for cost overview: %v", err)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(overview)
		return
	}
	defer buildingRows.Close()

	for buildingRows.Next() {
		var est models.BuildingCostEstimate
		var gridPrice, solarPrice, chargingPrice float64
		if err := buildingRows.Scan(&est.BuildingID, &est.BuildingName, &gridPrice, &solarPrice, &chargingPrice, &est.Currency); err != nil {
			continue
		}

		// Get grid consumption for this building's apartment meters
		var gridConsumption float64
		meterRows, err := h.db.QueryContext(ctx, `
			SELECT id FROM meters WHERE building_id = ? AND meter_type = 'apartment_meter' AND COALESCE(is_active, 1) = 1
		`, est.BuildingID)
		if err == nil {
			for meterRows.Next() {
				var meterID int
				if meterRows.Scan(&meterID) != nil {
					continue
				}
				gridConsumption += calcMeterConsumption(h.db, ctx, meterID, "power_kwh", startOfMonth, now)
			}
			meterRows.Close()
		}

		// Get solar consumption for this building
		var solarConsumption float64
		solarRows, err := h.db.QueryContext(ctx, `
			SELECT id FROM meters WHERE building_id = ? AND meter_type = 'solar_meter' AND COALESCE(is_active, 1) = 1
		`, est.BuildingID)
		if err == nil {
			for solarRows.Next() {
				var meterID int
				if solarRows.Scan(&meterID) != nil {
					continue
				}
				solarConsumption += calcMeterConsumption(h.db, ctx, meterID, "power_kwh_export", startOfMonth, now)
			}
			solarRows.Close()
		}

		// Get charging consumption for this building
		var chargingConsumption float64
		chargerRows, err := h.db.QueryContext(ctx, `
			SELECT id FROM chargers WHERE building_id = ? AND COALESCE(is_active, 1) = 1
		`, est.BuildingID)
		if err == nil {
			for chargerRows.Next() {
				var chargerID int
				if chargerRows.Scan(&chargerID) != nil {
					continue
				}

				var firstReading, latestReading, baselineReading sql.NullFloat64
				h.db.QueryRowContext(ctx, `
					SELECT power_kwh FROM charger_sessions WHERE charger_id = ? AND session_time >= ? AND session_time < ? ORDER BY session_time ASC LIMIT 1
				`, chargerID, startOfMonth, now).Scan(&firstReading)
				h.db.QueryRowContext(ctx, `
					SELECT power_kwh FROM charger_sessions WHERE charger_id = ? AND session_time >= ? AND session_time < ? ORDER BY session_time DESC LIMIT 1
				`, chargerID, startOfMonth, now).Scan(&latestReading)
				h.db.QueryRowContext(ctx, `
					SELECT power_kwh FROM charger_sessions WHERE charger_id = ? AND session_time < ? ORDER BY session_time DESC LIMIT 1
				`, chargerID, startOfMonth).Scan(&baselineReading)

				if firstReading.Valid && latestReading.Valid {
					baseline := firstReading.Float64
					if baselineReading.Valid {
						baseline = baselineReading.Float64
					}
					consumption := latestReading.Float64 - baseline
					if consumption > 0 {
						chargingConsumption += consumption
					}
				}
			}
			chargerRows.Close()
		}

		est.GridCost = gridConsumption * gridPrice
		est.SolarCost = solarConsumption * solarPrice
		est.ChargingCost = chargingConsumption * chargingPrice
		est.TotalCost = est.GridCost + est.SolarCost + est.ChargingCost

		overview.Buildings = append(overview.Buildings, est)
		overview.TotalCost += est.TotalCost
		if est.Currency != "" {
			overview.Currency = est.Currency
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(overview)
}

// calcMeterConsumption calculates the consumption delta for a single meter in a period
// calcMeterConsumption returns the per-meter delta of the given cumulative
// column over [periodStart, periodEnd). Mirrors cumulativeDeltaInPeriod's
// corruption fallback: prefer the row before the period as the baseline,
// but fall back to the first in-period reading if that baseline ended up
// greater than the latest in-period reading (a sign that some historical
// row got over-counted by a previous code path). This is what made the
// dashboard's Energy Flow diagram look empty — `latest − corrupt_baseline`
// went negative and the `> 0` guard zeroed the value out.
func calcMeterConsumption(db *sql.DB, ctx context.Context, meterID int, column string, periodStart, periodEnd time.Time) float64 {
	query := fmt.Sprintf(`SELECT %s FROM meter_readings WHERE meter_id = ? AND reading_time >= ? AND reading_time < ? ORDER BY reading_time`, column)

	var firstReading sql.NullFloat64
	db.QueryRowContext(ctx, query+" ASC LIMIT 1", meterID, periodStart, periodEnd).Scan(&firstReading)

	var latestReading sql.NullFloat64
	db.QueryRowContext(ctx, query+" DESC LIMIT 1", meterID, periodStart, periodEnd).Scan(&latestReading)

	if !latestReading.Valid {
		return 0
	}

	var baselineReading sql.NullFloat64
	baseQuery := fmt.Sprintf(`SELECT %s FROM meter_readings WHERE meter_id = ? AND reading_time < ? ORDER BY reading_time DESC LIMIT 1`, column)
	db.QueryRowContext(ctx, baseQuery, meterID, periodStart).Scan(&baselineReading)

	var baseline float64
	switch {
	case baselineReading.Valid && baselineReading.Float64 <= latestReading.Float64:
		baseline = baselineReading.Float64
	case firstReading.Valid:
		baseline = firstReading.Float64
	default:
		return 0
	}

	consumption := latestReading.Float64 - baseline
	if consumption < 0 {
		return 0
	}
	return consumption
}

// GetEnergyFlow returns historical energy data (kWh) for the energy flow diagram
//
// ZEV Energy Flow Model:
// - total_meter (grid): Measures what flows in/out from the public grid
//   - Import (power_kwh): Energy drawn FROM the grid
//   - Export (power_kwh_export): Energy sent TO the grid (excess solar)
//
// - solar_meter: Measures solar production (power_kwh_export = generation)
// - apartment_meter: Measures individual apartment consumption (for billing)
// - Building consumption = Grid Import + Solar Self-Consumed
func (h *DashboardHandler) GetEnergyFlow(w http.ResponseWriter, r *http.Request) {
	defer func() {
		if rec := recover(); rec != nil {
			log.Printf("PANIC in GetEnergyFlow: %v", rec)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
		}
	}()

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	period := r.URL.Query().Get("period")
	if period == "" {
		period = "today"
	}
	buildingIDStr := r.URL.Query().Get("building_id")

	now := time.Now()
	var startTime time.Time
	switch period {
	case "live":
		// Last 15 minutes for live data
		startTime = now.Add(-15 * time.Minute)
	case "today":
		startTime = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	case "week":
		startTime = now.AddDate(0, 0, -7)
	case "month":
		startTime = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	default:
		startTime = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
		period = "today"
	}

	var flow models.EnergyFlowData
	flow.Period = period

	// Determine building filter
	var buildingID int
	if buildingIDStr != "" && buildingIDStr != "0" {
		fmt.Sscanf(buildingIDStr, "%d", &buildingID)
	}

	// Helper to calculate consumption for a set of buildings
	calcBuildingEnergy := func(bid int) (solar, gridImport, gridExport, evCharging float64, hasSolar, hasGrid bool) {
		// Calculate solar produced (from solar_meter export readings)
		solarRows, err := h.db.QueryContext(ctx, `SELECT id FROM meters WHERE building_id = ? AND meter_type = 'solar_meter' AND COALESCE(is_active, 1) = 1`, bid)
		if err == nil {
			for solarRows.Next() {
				var meterID int
				if solarRows.Scan(&meterID) == nil {
					solar += calcMeterConsumption(h.db, ctx, meterID, "power_kwh_export", startTime, now)
					hasSolar = true
				}
			}
			solarRows.Close()
		}

		// Calculate grid import/export (from total_meter)
		gridRows, err := h.db.QueryContext(ctx, `SELECT id FROM meters WHERE building_id = ? AND meter_type = 'total_meter' AND COALESCE(is_active, 1) = 1`, bid)
		if err == nil {
			for gridRows.Next() {
				var meterID int
				if gridRows.Scan(&meterID) == nil {
					gridImport += calcMeterConsumption(h.db, ctx, meterID, "power_kwh", startTime, now)
					gridExport += calcMeterConsumption(h.db, ctx, meterID, "power_kwh_export", startTime, now)
					hasGrid = true
				}
			}
			gridRows.Close()
		}

		// Calculate EV charging — same corruption-fallback pattern as
		// calcMeterConsumption / cumulativeDeltaInPeriod so a stale
		// over-counted historical row can't blank out the diagram.
		chargerRows, err := h.db.QueryContext(ctx, `SELECT id FROM chargers WHERE building_id = ? AND COALESCE(is_active, 1) = 1`, bid)
		if err == nil {
			for chargerRows.Next() {
				var chargerID int
				if chargerRows.Scan(&chargerID) != nil {
					continue
				}
				evCharging += cumulativeDeltaInPeriod(h.db, ctx,
					`SELECT power_kwh FROM charger_sessions
					 WHERE charger_id = ? AND session_time >= ? AND session_time < ?
					 ORDER BY session_time ASC LIMIT 1`,
					`SELECT power_kwh FROM charger_sessions
					 WHERE charger_id = ? AND session_time >= ? AND session_time < ?
					 ORDER BY session_time DESC LIMIT 1`,
					`SELECT power_kwh FROM charger_sessions
					 WHERE charger_id = ? AND session_time < ?
					 ORDER BY session_time DESC LIMIT 1`,
					chargerID, startTime, now)
			}
			chargerRows.Close()
		}

		return solar, gridImport, gridExport, evCharging, hasSolar, hasGrid
	}

	// Get all buildings or single building
	var buildingIDs []int
	var buildingNames = make(map[int]string)

	if buildingID > 0 {
		buildingIDs = []int{buildingID}
		var name string
		h.db.QueryRowContext(ctx, `SELECT name FROM buildings WHERE id = ?`, buildingID).Scan(&name)
		buildingNames[buildingID] = name
	} else {
		buildingRows, err := h.db.QueryContext(ctx, `SELECT id, name FROM buildings WHERE COALESCE(is_group, 0) = 0 ORDER BY name`)
		if err == nil {
			for buildingRows.Next() {
				var bid int
				var bname string
				if buildingRows.Scan(&bid, &bname) == nil {
					buildingIDs = append(buildingIDs, bid)
					buildingNames[bid] = bname
				}
			}
			buildingRows.Close()
		}
	}

	// Calculate totals across all relevant buildings
	var totalSolar, totalGridImport, totalGridExport, totalEvCharging float64
	var hasAnySolar, hasAnyGrid bool

	for _, bid := range buildingIDs {
		solar, gridImport, gridExport, evCharging, hasSolar, hasGrid := calcBuildingEnergy(bid)

		totalSolar += solar
		totalGridImport += gridImport
		totalGridExport += gridExport
		totalEvCharging += evCharging

		if hasSolar {
			hasAnySolar = true
		}
		if hasGrid {
			hasAnyGrid = true
		}

		// Per-building breakdown (only if not filtered to single building)
		if buildingID == 0 {
			var bf models.BuildingEnergyFlow
			bf.BuildingID = bid
			bf.BuildingName = buildingNames[bid]
			bf.SolarProducedKwh = solar
			bf.EvChargingKwh = evCharging

			// Calculate consumption and self-consumption for this building
			if hasGrid && hasSolar {
				// Consumption = Grid Import + Solar - Grid Export
				bf.TotalConsumptionKwh = gridImport + solar - gridExport
				bf.GridImportKwh = gridImport

				// Solar self-consumed = Solar - Grid Export
				bf.SolarSelfConsumedKwh = solar - gridExport
				if bf.SolarSelfConsumedKwh < 0 {
					bf.SolarSelfConsumedKwh = 0
				}
			} else if hasGrid {
				// No solar - consumption = grid import
				bf.TotalConsumptionKwh = gridImport
				bf.GridImportKwh = gridImport
			} else if hasSolar {
				// No grid meter - assume all solar is self-consumed
				bf.TotalConsumptionKwh = solar
				bf.SolarSelfConsumedKwh = solar
			}

			if bf.TotalConsumptionKwh < 0 {
				bf.TotalConsumptionKwh = 0
			}

			// Only add buildings that have data
			if hasSolar || hasGrid || evCharging > 0 {
				flow.PerBuilding = append(flow.PerBuilding, bf)
			}
		}
	}

	// Set total values
	flow.SolarProducedKwh = totalSolar
	flow.EvChargingKwh = totalEvCharging

	// Calculate total consumption and grid values
	if hasAnyGrid && hasAnySolar {
		// We have grid meters - use actual readings
		flow.GridImportKwh = totalGridImport
		flow.SolarExportedKwh = totalGridExport

		// Total consumption = Grid Import + Solar - Grid Export
		flow.TotalConsumptionKwh = totalGridImport + totalSolar - totalGridExport
		if flow.TotalConsumptionKwh < 0 {
			flow.TotalConsumptionKwh = 0
		}

		// Solar self-consumed = Solar produced - Grid export
		flow.SolarSelfConsumedKwh = totalSolar - totalGridExport
		if flow.SolarSelfConsumedKwh < 0 {
			flow.SolarSelfConsumedKwh = 0
		}
		if flow.SolarSelfConsumedKwh > totalSolar {
			flow.SolarSelfConsumedKwh = totalSolar
		}

		// Self-consumption percentage
		if totalSolar > 0.001 {
			flow.SelfConsumptionPct = (flow.SolarSelfConsumedKwh / totalSolar) * 100
			if flow.SelfConsumptionPct > 100 {
				flow.SelfConsumptionPct = 100
			}
		}
	} else if hasAnyGrid {
		// Only grid meter, no solar
		flow.GridImportKwh = totalGridImport
		flow.TotalConsumptionKwh = totalGridImport
	} else if hasAnySolar {
		// Only solar meter, no grid meter - assume all self-consumed
		flow.TotalConsumptionKwh = totalSolar
		flow.SolarSelfConsumedKwh = totalSolar
		flow.SelfConsumptionPct = 100
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(flow)
}

// GetEnergyFlowLive returns real-time power data for the dashboard's Live tab.
// We derive every value from the DB (latest meter_readings / charger_sessions
// rows) so the diagram shows the same numbers as the per-building card on
// the Buildings page. The data collector's in-memory cache used to be the
// primary source, but on installations where it isn't populated the diagram
// rendered as all-zeros.
//
// ZEV Energy Flow Model:
//   - total_meter (grid): import = positive, export = negative.
//   - solar_meter: production (always positive).
//   - charger_sessions: live charging power inferred from the kWh delta across
//     the most recent 15-min slot.
//   - Building consumption = Grid Import + Solar Self-Consumed
//     = Grid Import + (Solar - Grid Export)
func (h *DashboardHandler) GetEnergyFlowLive(w http.ResponseWriter, r *http.Request) {
	defer func() {
		if rec := recover(); rec != nil {
			log.Printf("PANIC in GetEnergyFlowLive: %v", rec)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
		}
	}()

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	buildingIDStr := r.URL.Query().Get("building_id")
	var buildingID int
	if buildingIDStr != "" && buildingIDStr != "0" {
		fmt.Sscanf(buildingIDStr, "%d", &buildingID)
	}

	h.getEnergyFlowLiveFromDB(w, r, ctx, buildingID)
}

// getEnergyFlowLiveLegacy is the original collector-cache path. Kept around
// for reference only — wire it back into GetEnergyFlowLive if you ever need
// a true real-time view that doesn't wait for the next 15-min DB write.
func (h *DashboardHandler) getEnergyFlowLiveLegacy(w http.ResponseWriter, r *http.Request) {
	defer func() {
		if rec := recover(); rec != nil {
			log.Printf("PANIC in getEnergyFlowLiveLegacy: %v", rec)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
		}
	}()

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	buildingIDStr := r.URL.Query().Get("building_id")
	var buildingID int
	if buildingIDStr != "" && buildingIDStr != "0" {
		fmt.Sscanf(buildingIDStr, "%d", &buildingID)
	}

	if h.dataCollector == nil {
		h.getEnergyFlowLiveFromDB(w, r, ctx, buildingID)
		return
	}

	readings, err := h.dataCollector.GetLiveMeterReadings(buildingID)
	if err != nil {
		h.getEnergyFlowLiveFromDB(w, r, ctx, buildingID)
		return
	}

	// Structure to hold building power data
	type buildingData struct {
		id            int
		name          string
		solarPowerKw  float64 // From solar_meter (production)
		gridImportKw  float64 // From total_meter import
		gridExportKw  float64 // From total_meter export
		hasGridMeter  bool
		hasSolarMeter bool
		hasLiveData   bool
		evChargingKw  float64
	}

	buildingPower := make(map[int]*buildingData)

	// Get building names
	rows, err := h.db.QueryContext(ctx, `SELECT id, name FROM buildings WHERE COALESCE(is_group, 0) = 0`)
	if err != nil {
		log.Printf("GetEnergyFlowLive: Error querying buildings: %v", err)
		http.Error(w, "Failed to query buildings", http.StatusInternalServerError)
		return
	}
	for rows.Next() {
		var id int
		var name string
		if rows.Scan(&id, &name) == nil {
			buildingPower[id] = &buildingData{
				id:   id,
				name: name,
			}
		}
	}
	rows.Close()

	// Aggregate live meter readings by building
	for _, reading := range readings {
		bp, exists := buildingPower[reading.BuildingID]
		if !exists {
			continue
		}

		// Convert W to kW
		powerKw := reading.CurrentPowerW / 1000.0
		powerExpKw := reading.CurrentPowerExpW / 1000.0

		switch reading.MeterType {
		case "solar_meter":
			// Solar production - use export power for solar meters
			// If HasLivePower, the export power is in CurrentPowerExpW
			// If not, CurrentPowerW might contain estimated power
			if reading.HasLivePower && powerExpKw > 0 {
				bp.solarPowerKw += powerExpKw
			} else if powerKw > 0 {
				// Fallback: use CurrentPowerW (estimated from export readings)
				bp.solarPowerKw += powerKw
			}
			bp.hasSolarMeter = true
			if reading.HasLivePower {
				bp.hasLiveData = true
			}
			log.Printf("GetEnergyFlowLive: Solar meter %d (%s): power=%.3f kW, expPower=%.3f kW, hasLive=%v",
				reading.MeterID, reading.MeterName, powerKw, powerExpKw, reading.HasLivePower)

		case "total_meter":
			// Grid meter - positive power = import, negative = export
			// The collector returns CurrentPowerW for import and CurrentPowerExpW for export
			if reading.HasLivePower {
				bp.gridImportKw += powerKw
				bp.gridExportKw += powerExpKw
				bp.hasLiveData = true
			} else {
				// Fallback: CurrentPowerW is estimated from import readings
				bp.gridImportKw += powerKw
			}
			bp.hasGridMeter = true
			log.Printf("GetEnergyFlowLive: Grid meter %d (%s): import=%.3f kW, export=%.3f kW, hasLive=%v",
				reading.MeterID, reading.MeterName, powerKw, powerExpKw, reading.HasLivePower)
		}
	}

	// Get live charger power
	chargerQuery := `SELECT id, building_id FROM chargers WHERE COALESCE(is_active, 1) = 1`
	chargerArgs := []interface{}{}
	if buildingID > 0 {
		chargerQuery += " AND building_id = ?"
		chargerArgs = append(chargerArgs, buildingID)
	}

	chargerRows, _ := h.db.QueryContext(ctx, chargerQuery, chargerArgs...)
	if chargerRows != nil {
		for chargerRows.Next() {
			var chargerID, chBuildingID int
			if chargerRows.Scan(&chargerID, &chBuildingID) == nil {
				var chargerPowerKw float64

				// Try to get live charger data from data collector
				// ONLY use live data - don't estimate from historical sessions
				// because that would show power even when no car is connected
				if h.dataCollector != nil {
					if status, ok := h.dataCollector.GetChargerLiveStatus(chargerID); ok && status != nil {
						// Only show power if the charger reports active charging
						if status.SessionActive || status.CurrentPower_kW > 0.1 {
							chargerPowerKw = status.CurrentPower_kW
						}
					}
				}

				if bp, exists := buildingPower[chBuildingID]; exists {
					bp.evChargingKw += chargerPowerKw
				}
			}
		}
		chargerRows.Close()
	}

	// Calculate totals
	var totalSolarKw, totalGridImportKw, totalGridExportKw, totalEvKw float64
	var hasAnyGridMeter, hasAnySolarMeter bool

	for _, bp := range buildingPower {
		if buildingID > 0 && bp.id != buildingID {
			continue
		}

		totalSolarKw += bp.solarPowerKw
		totalGridImportKw += bp.gridImportKw
		totalGridExportKw += bp.gridExportKw
		totalEvKw += bp.evChargingKw

		if bp.hasGridMeter {
			hasAnyGridMeter = true
		}
		if bp.hasSolarMeter {
			hasAnySolarMeter = true
		}
	}

	// Calculate net grid power (positive = import, negative = export)
	totalGridKw := totalGridImportKw - totalGridExportKw
	isExporting := totalGridKw < 0

	// Calculate building consumption and self-consumption
	var consumptionKw float64
	var selfConsumptionPct float64

	// total_meter measures everything that flows in/out of the building's grid
	// connection — including the EV charger when it shares the main feed.
	// Apparent inconsistencies between the live charger value (fresh) and the
	// Loxone meter reading (slower polling) resolve themselves on the next
	// meter update, so don't try to compensate by adding EV power here.
	if hasAnyGridMeter && hasAnySolarMeter {
		// Consumption = Solar + Grid Import - Grid Export = Solar + Net Grid
		consumptionKw = totalSolarKw + totalGridKw
		if consumptionKw < 0 {
			consumptionKw = 0
		}

		// Self-consumption = solar used in building / solar produced
		if totalSolarKw > 0.001 {
			solarSelfConsumed := totalSolarKw - totalGridExportKw
			if solarSelfConsumed < 0 {
				solarSelfConsumed = 0
			}
			if solarSelfConsumed > totalSolarKw {
				solarSelfConsumed = totalSolarKw
			}
			selfConsumptionPct = (solarSelfConsumed / totalSolarKw) * 100
		}
	} else if hasAnyGridMeter {
		consumptionKw = totalGridImportKw
	} else if hasAnySolarMeter {
		consumptionKw = totalSolarKw
		selfConsumptionPct = 100
	}

	log.Printf("GetEnergyFlowLive: Totals - Solar=%.3f kW, GridImport=%.3f kW, GridExport=%.3f kW, NetGrid=%.3f kW, Consumption=%.3f kW, SelfConsumption=%.1f%%",
		totalSolarKw, totalGridImportKw, totalGridExportKw, totalGridKw, consumptionKw, selfConsumptionPct)

	// Build response
	response := models.EnergyFlowLiveData{
		Period:             "live",
		SolarPowerKw:       totalSolarKw,
		ConsumptionPowerKw: consumptionKw,
		GridPowerKw:        totalGridKw,
		EvChargingPowerKw:  totalEvKw,
		SelfConsumptionPct: selfConsumptionPct,
		IsExporting:        isExporting,
		Timestamp:          time.Now().Format(time.RFC3339),
	}

	// Add per-building breakdown if not filtered to single building
	if buildingID == 0 {
		for _, bp := range buildingPower {
			bpGridKw := bp.gridImportKw - bp.gridExportKw
			var bpConsumption float64

			if bp.hasGridMeter && bp.hasSolarMeter {
				bpConsumption = bp.solarPowerKw + bpGridKw
			} else if bp.hasGridMeter {
				bpConsumption = bp.gridImportKw
			} else if bp.hasSolarMeter {
				bpConsumption = bp.solarPowerKw
			}

			if bpConsumption < 0 {
				bpConsumption = 0
			}

			bpLive := models.BuildingEnergyFlowLive{
				BuildingID:         bp.id,
				BuildingName:       bp.name,
				SolarPowerKw:       bp.solarPowerKw,
				ConsumptionPowerKw: bpConsumption,
				GridPowerKw:        bpGridKw,
				EvChargingPowerKw:  bp.evChargingKw,
			}

			if bp.hasGridMeter || bp.hasSolarMeter || bp.evChargingKw > 0 {
				response.PerBuilding = append(response.PerBuilding, bpLive)
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// getEnergyFlowLiveFromDB is a fallback that uses database readings when live collector data is unavailable
func (h *DashboardHandler) getEnergyFlowLiveFromDB(w http.ResponseWriter, r *http.Request, ctx context.Context, buildingID int) {
	type buildingData struct {
		id            int
		name          string
		solarPowerKw  float64
		gridImportKw  float64
		gridExportKw  float64
		hasGridMeter  bool
		hasSolarMeter bool
		evChargingKw  float64
	}

	buildingPower := make(map[int]*buildingData)

	// Get building names
	rows, err := h.db.QueryContext(ctx, `SELECT id, name FROM buildings WHERE COALESCE(is_group, 0) = 0`)
	if err != nil {
		log.Printf("getEnergyFlowLiveFromDB: Error querying buildings: %v", err)
		http.Error(w, "Failed to query buildings", http.StatusInternalServerError)
		return
	}
	for rows.Next() {
		var id int
		var name string
		if rows.Scan(&id, &name) == nil {
			buildingPower[id] = &buildingData{id: id, name: name}
		}
	}
	rows.Close()

	// Get the most recent meter readings from the database
	meterQuery := `
		SELECT m.id, m.building_id, m.meter_type,
			COALESCE(mr.consumption_kwh, 0), COALESCE(mr.consumption_export, 0),
			mr.reading_time
		FROM meters m
		LEFT JOIN (
			SELECT meter_id, consumption_kwh, consumption_export, reading_time
			FROM meter_readings mr1
			WHERE reading_time = (
				SELECT MAX(reading_time)
				FROM meter_readings mr2
				WHERE mr2.meter_id = mr1.meter_id
			)
		) mr ON m.id = mr.meter_id
		WHERE m.is_active = 1
		AND m.meter_type IN ('solar_meter', 'total_meter')
	`
	meterArgs := []interface{}{}
	if buildingID > 0 {
		meterQuery += " AND m.building_id = ?"
		meterArgs = append(meterArgs, buildingID)
	}

	meterRows, err := h.db.QueryContext(ctx, meterQuery, meterArgs...)
	if err != nil {
		log.Printf("getEnergyFlowLiveFromDB: Error querying meters: %v", err)
		http.Error(w, "Failed to query meters", http.StatusInternalServerError)
		return
	}
	defer meterRows.Close()

	for meterRows.Next() {
		var meterID, bID int
		var meterType string
		var consumptionKwh, consumptionExport float64
		var readingTime sql.NullTime

		if err := meterRows.Scan(&meterID, &bID, &meterType, &consumptionKwh, &consumptionExport, &readingTime); err != nil {
			continue
		}

		bp, exists := buildingPower[bID]
		if !exists || !readingTime.Valid {
			continue
		}

		// Convert consumption (kWh over 15 min) to power (kW)
		switch meterType {
		case "solar_meter":
			powerKw := consumptionExport / 0.25
			if powerKw < 0 {
				powerKw = -powerKw
			}
			bp.solarPowerKw += powerKw
			bp.hasSolarMeter = true

		case "total_meter":
			bp.gridImportKw += consumptionKwh / 0.25
			bp.gridExportKw += consumptionExport / 0.25
			bp.hasGridMeter = true
		}
	}

	// Live charger power per building from the kWh delta over the last
	// 15-min slot. charger_sessions stores cumulative kWh, so the most
	// recent two rows let us infer the average power across that slot.
	chargerQuery := `SELECT id, building_id FROM chargers WHERE COALESCE(is_active, 1) = 1`
	chargerArgs := []interface{}{}
	if buildingID > 0 {
		chargerQuery += " AND building_id = ?"
		chargerArgs = append(chargerArgs, buildingID)
	}
	chargerRows, _ := h.db.QueryContext(ctx, chargerQuery, chargerArgs...)
	if chargerRows != nil {
		for chargerRows.Next() {
			var chargerID, chBuildingID int
			if chargerRows.Scan(&chargerID, &chBuildingID) != nil {
				continue
			}
			bp, exists := buildingPower[chBuildingID]
			if !exists {
				continue
			}

			// Pull the latest two cumulative readings for this charger.
			rows2, err := h.db.QueryContext(ctx, `
				SELECT power_kwh, session_time FROM charger_sessions
				WHERE charger_id = ?
				ORDER BY session_time DESC LIMIT 2
			`, chargerID)
			if err != nil {
				continue
			}
			var cumLatest, cumPrev float64
			var tLatest, tPrev time.Time
			gotLatest, gotPrev := false, false
			for rows2.Next() {
				var v float64
				var t time.Time
				if rows2.Scan(&v, &t) != nil {
					continue
				}
				if !gotLatest {
					cumLatest = v
					tLatest = t
					gotLatest = true
				} else if !gotPrev {
					cumPrev = v
					tPrev = t
					gotPrev = true
				}
			}
			rows2.Close()
			if !gotLatest || !gotPrev {
				continue
			}
			deltaKwh := cumLatest - cumPrev
			deltaHours := tLatest.Sub(tPrev).Hours()
			if deltaKwh > 0 && deltaHours > 0 && deltaHours < 1 {
				bp.evChargingKw += deltaKwh / deltaHours
			}
		}
		chargerRows.Close()
	}

	// Calculate totals
	var totalSolarKw, totalGridImportKw, totalGridExportKw, totalEvKw float64
	var hasAnyGridMeter, hasAnySolarMeter bool

	for _, bp := range buildingPower {
		if buildingID > 0 && bp.id != buildingID {
			continue
		}
		totalSolarKw += bp.solarPowerKw
		totalGridImportKw += bp.gridImportKw
		totalGridExportKw += bp.gridExportKw
		totalEvKw += bp.evChargingKw
		if bp.hasGridMeter {
			hasAnyGridMeter = true
		}
		if bp.hasSolarMeter {
			hasAnySolarMeter = true
		}
	}

	totalGridKw := totalGridImportKw - totalGridExportKw
	isExporting := totalGridKw < 0

	var consumptionKw, selfConsumptionPct float64
	if hasAnyGridMeter && hasAnySolarMeter {
		consumptionKw = totalSolarKw + totalGridKw
		if consumptionKw < 0 {
			consumptionKw = 0
		}
		if totalSolarKw > 0.001 {
			solarSelfConsumed := totalSolarKw - totalGridExportKw
			if solarSelfConsumed < 0 {
				solarSelfConsumed = 0
			}
			selfConsumptionPct = (solarSelfConsumed / totalSolarKw) * 100
		}
	} else if hasAnyGridMeter {
		consumptionKw = totalGridImportKw
	} else if hasAnySolarMeter {
		consumptionKw = totalSolarKw
		selfConsumptionPct = 100
	}

	response := models.EnergyFlowLiveData{
		Period:             "live",
		SolarPowerKw:       totalSolarKw,
		ConsumptionPowerKw: consumptionKw,
		GridPowerKw:        totalGridKw,
		EvChargingPowerKw:  totalEvKw,
		SelfConsumptionPct: selfConsumptionPct,
		IsExporting:        isExporting,
		Timestamp:          time.Now().Format(time.RFC3339),
	}

	if buildingID == 0 {
		for _, bp := range buildingPower {
			bpGridKw := bp.gridImportKw - bp.gridExportKw
			var bpConsumption float64
			if bp.hasGridMeter && bp.hasSolarMeter {
				bpConsumption = bp.solarPowerKw + bpGridKw
			} else if bp.hasGridMeter {
				bpConsumption = bp.gridImportKw
			} else if bp.hasSolarMeter {
				bpConsumption = bp.solarPowerKw
			}
			if bpConsumption < 0 {
				bpConsumption = 0
			}
			if bp.hasGridMeter || bp.hasSolarMeter || bp.evChargingKw > 0 {
				response.PerBuilding = append(response.PerBuilding, models.BuildingEnergyFlowLive{
					BuildingID:         bp.id,
					BuildingName:       bp.name,
					SolarPowerKw:       bp.solarPowerKw,
					ConsumptionPowerKw: bpConsumption,
					GridPowerKw:        bpGridKw,
					EvChargingPowerKw:  bp.evChargingKw,
				})
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}
