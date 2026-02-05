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

	consumptionMeterTypes := []string{"apartment_meter"}
	stats.TodayConsumption = calculateTotalConsumption(h.db, ctx, consumptionMeterTypes, todayStart, todayEnd)
	stats.MonthConsumption = calculateTotalConsumption(h.db, ctx, consumptionMeterTypes, startOfMonth, now)

	// For solar, we calculate export (generation) separately
	solarMeterTypes := []string{"solar_meter"}
	stats.TodaySolar = calculateTotalSolarExport(h.db, ctx, solarMeterTypes, todayStart, todayEnd)
	stats.MonthSolar = calculateTotalSolarExport(h.db, ctx, solarMeterTypes, startOfMonth, now)

	stats.TodayCharging = calculateTotalChargingConsumption(h.db, ctx, todayStart, todayEnd)
	stats.MonthCharging = calculateTotalChargingConsumption(h.db, ctx, startOfMonth, now)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
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

		var firstReading sql.NullFloat64
		db.QueryRowContext(ctx, `
			SELECT power_kwh FROM meter_readings 
			WHERE meter_id = ? AND reading_time >= ? AND reading_time < ?
			ORDER BY reading_time ASC LIMIT 1
		`, meterID, periodStart, periodEnd).Scan(&firstReading)

		var latestReading sql.NullFloat64
		db.QueryRowContext(ctx, `
			SELECT power_kwh FROM meter_readings 
			WHERE meter_id = ? AND reading_time >= ? AND reading_time < ?
			ORDER BY reading_time DESC LIMIT 1
		`, meterID, periodStart, periodEnd).Scan(&latestReading)

		if firstReading.Valid && latestReading.Valid {
			var baselineReading sql.NullFloat64
			db.QueryRowContext(ctx, `
				SELECT power_kwh FROM meter_readings 
				WHERE meter_id = ? AND reading_time < ?
				ORDER BY reading_time DESC LIMIT 1
			`, meterID, periodStart).Scan(&baselineReading)

			var baseline float64
			if baselineReading.Valid {
				baseline = baselineReading.Float64
			} else {
				baseline = firstReading.Float64
			}

			consumption := latestReading.Float64 - baseline
			if consumption > 0 {
				totalConsumption += consumption
			}
		}
	}
	
	return totalConsumption
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

		// Get first export reading in period
		var firstReading sql.NullFloat64
		db.QueryRowContext(ctx, `
			SELECT power_kwh_export FROM meter_readings 
			WHERE meter_id = ? AND reading_time >= ? AND reading_time < ?
			ORDER BY reading_time ASC LIMIT 1
		`, meterID, periodStart, periodEnd).Scan(&firstReading)

		// Get latest export reading in period
		var latestReading sql.NullFloat64
		db.QueryRowContext(ctx, `
			SELECT power_kwh_export FROM meter_readings 
			WHERE meter_id = ? AND reading_time >= ? AND reading_time < ?
			ORDER BY reading_time DESC LIMIT 1
		`, meterID, periodStart, periodEnd).Scan(&latestReading)

		if firstReading.Valid && latestReading.Valid {
			// Get baseline (reading before period)
			var baselineReading sql.NullFloat64
			db.QueryRowContext(ctx, `
				SELECT power_kwh_export FROM meter_readings 
				WHERE meter_id = ? AND reading_time < ?
				ORDER BY reading_time DESC LIMIT 1
			`, meterID, periodStart).Scan(&baselineReading)

			var baseline float64
			if baselineReading.Valid {
				baseline = baselineReading.Float64
			} else {
				baseline = firstReading.Float64
			}

			// Calculate total export for the period
			exportEnergy := latestReading.Float64 - baseline
			if exportEnergy > 0 {
				totalExport += exportEnergy
			}
		}
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

		userRows, err := db.QueryContext(ctx, `
			SELECT DISTINCT user_id 
			FROM charger_sessions 
			WHERE charger_id = ?
			AND session_time >= ? AND session_time < ?
		`, chargerID, periodStart, periodEnd)
		
		if err != nil {
			continue
		}

		for userRows.Next() {
			var userID string
			if err := userRows.Scan(&userID); err != nil {
				continue
			}

			var firstReading sql.NullFloat64
			db.QueryRowContext(ctx, `
				SELECT power_kwh FROM charger_sessions 
				WHERE charger_id = ? AND user_id = ? 
				AND session_time >= ? AND session_time < ?
				ORDER BY session_time ASC LIMIT 1
			`, chargerID, userID, periodStart, periodEnd).Scan(&firstReading)

			var latestReading sql.NullFloat64
			db.QueryRowContext(ctx, `
				SELECT power_kwh FROM charger_sessions 
				WHERE charger_id = ? AND user_id = ? 
				AND session_time >= ? AND session_time < ?
				ORDER BY session_time DESC LIMIT 1
			`, chargerID, userID, periodStart, periodEnd).Scan(&latestReading)

			if firstReading.Valid && latestReading.Valid {
				var baselineReading sql.NullFloat64
				db.QueryRowContext(ctx, `
					SELECT power_kwh FROM charger_sessions 
					WHERE charger_id = ? AND user_id = ? 
					AND session_time < ?
					ORDER BY session_time DESC LIMIT 1
				`, chargerID, userID, periodStart).Scan(&baselineReading)

				var baseline float64
				if baselineReading.Valid {
					baseline = baselineReading.Float64
				} else {
					baseline = firstReading.Float64
				}

				consumption := latestReading.Float64 - baseline
				if consumption > 0 {
					totalConsumption += consumption
				}
			}
		}
		userRows.Close()
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
		MeterID   int                        `json:"meter_id"`
		MeterName string                     `json:"meter_name"`
		MeterType string                     `json:"meter_type"`
		UserName  string                     `json:"user_name,omitempty"`
		Data      []models.ConsumptionData   `json:"data"`
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
			AND m.meter_type IN ('apartment_meter', 'solar_meter', 'total_meter')
			ORDER BY m.meter_type, m.name
		`, bi.id)

		if err != nil {
			log.Printf("  Error querying meters for building %d: %v", bi.id, err)
			buildings = append(buildings, building)
			continue
		}

		type meterInfo struct {
			id       int
			name     string
			meterType string
			userID   sql.NullInt64
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
							rfidOrUserID,                    // Exact: "2"
							"%" + rfidOrUserID + ",%",       // Start: "2,3"
							"%," + rfidOrUserID + ",%",      // Middle: "1,2,3"
							"%," + rfidOrUserID,             // End: "1,2"
							"%\"" + rfidOrUserID + "\"%",    // JSON: ["2"]
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

	// Total building consumption (apartment meters)
	consumptionTypes := []string{"apartment_meter"}
	todayConsumption := calculateTotalConsumption(h.db, ctx, consumptionTypes, todayStart, todayEnd)
	monthConsumption := calculateTotalConsumption(h.db, ctx, consumptionTypes, startOfMonth, now)

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
		SELECT c.id, c.name, COALESCE(b.name, ''), COALESCE(c.is_active, 1),
			(SELECT MAX(session_time) FROM charger_sessions WHERE charger_id = c.id)
		FROM chargers c
		LEFT JOIN buildings b ON c.building_id = b.id
		ORDER BY c.name
	`)
	if err != nil {
		log.Printf("Error querying chargers for health: %v", err)
	} else {
		for chargerRows.Next() {
			var d models.DeviceHealth
			var lastReading sql.NullTime
			var isActive int
			if err := chargerRows.Scan(&d.ID, &d.Name, &d.BuildingName, &isActive, &lastReading); err != nil {
				continue
			}
			d.Type = "charger"
			d.MeterType = "charger"
			d.IsActive = isActive == 1
			if lastReading.Valid {
				t := lastReading.Time
				d.LastReading = &t
			}

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

	// Get buildings with active pricing
	buildingRows, err := h.db.QueryContext(ctx, `
		SELECT b.id, b.name, bs.normal_power_price, bs.solar_power_price,
			bs.car_charging_normal_price, COALESCE(bs.currency, 'CHF')
		FROM buildings b
		JOIN billing_settings bs ON bs.building_id = b.id AND bs.is_active = 1
		WHERE COALESCE(b.is_group, 0) = 0
		ORDER BY b.name
	`)
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
func calcMeterConsumption(db *sql.DB, ctx context.Context, meterID int, column string, periodStart, periodEnd time.Time) float64 {
	query := fmt.Sprintf(`SELECT %s FROM meter_readings WHERE meter_id = ? AND reading_time >= ? AND reading_time < ? ORDER BY reading_time`, column)

	var firstReading sql.NullFloat64
	db.QueryRowContext(ctx, query+" ASC LIMIT 1", meterID, periodStart, periodEnd).Scan(&firstReading)

	var latestReading sql.NullFloat64
	db.QueryRowContext(ctx, query+" DESC LIMIT 1", meterID, periodStart, periodEnd).Scan(&latestReading)

	if !firstReading.Valid || !latestReading.Valid {
		return 0
	}

	var baselineReading sql.NullFloat64
	baseQuery := fmt.Sprintf(`SELECT %s FROM meter_readings WHERE meter_id = ? AND reading_time < ? ORDER BY reading_time DESC LIMIT 1`, column)
	db.QueryRowContext(ctx, baseQuery, meterID, periodStart).Scan(&baselineReading)

	baseline := firstReading.Float64
	if baselineReading.Valid {
		baseline = baselineReading.Float64
	}

	consumption := latestReading.Float64 - baseline
	if consumption > 0 {
		return consumption
	}
	return 0
}

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
	var buildingFilter string
	var buildingArgs []interface{}
	if buildingIDStr != "" && buildingIDStr != "0" {
		buildingFilter = " AND m.building_id = ?"
		var bid int
		fmt.Sscanf(buildingIDStr, "%d", &bid)
		buildingArgs = append(buildingArgs, bid)
	}

	// Calculate solar produced (from solar_meter export readings)
	solarQuery := fmt.Sprintf(`SELECT id FROM meters WHERE meter_type = 'solar_meter' AND COALESCE(is_active, 1) = 1%s`,
		strings.Replace(buildingFilter, "m.", "", 1))
	solarRows, err := h.db.QueryContext(ctx, solarQuery, buildingArgs...)
	if err == nil {
		for solarRows.Next() {
			var meterID int
			if solarRows.Scan(&meterID) == nil {
				flow.SolarProducedKwh += calcMeterConsumption(h.db, ctx, meterID, "power_kwh_export", startTime, now)
			}
		}
		solarRows.Close()
	}

	// Calculate total consumption (from apartment_meter import readings)
	consQuery := fmt.Sprintf(`SELECT id FROM meters WHERE meter_type = 'apartment_meter' AND COALESCE(is_active, 1) = 1%s`,
		strings.Replace(buildingFilter, "m.", "", 1))
	consRows, err := h.db.QueryContext(ctx, consQuery, buildingArgs...)
	if err == nil {
		for consRows.Next() {
			var meterID int
			if consRows.Scan(&meterID) == nil {
				flow.TotalConsumptionKwh += calcMeterConsumption(h.db, ctx, meterID, "power_kwh", startTime, now)
			}
		}
		consRows.Close()
	}

	// Calculate EV charging
	chargerQuery := fmt.Sprintf(`SELECT id FROM chargers WHERE COALESCE(is_active, 1) = 1%s`,
		strings.Replace(buildingFilter, "m.", "", 1))
	chargerRows, err := h.db.QueryContext(ctx, chargerQuery, buildingArgs...)
	if err == nil {
		for chargerRows.Next() {
			var chargerID int
			if chargerRows.Scan(&chargerID) == nil {
				var firstReading, latestReading, baselineReading sql.NullFloat64
				h.db.QueryRowContext(ctx, `SELECT power_kwh FROM charger_sessions WHERE charger_id = ? AND session_time >= ? AND session_time < ? ORDER BY session_time ASC LIMIT 1`,
					chargerID, startTime, now).Scan(&firstReading)
				h.db.QueryRowContext(ctx, `SELECT power_kwh FROM charger_sessions WHERE charger_id = ? AND session_time >= ? AND session_time < ? ORDER BY session_time DESC LIMIT 1`,
					chargerID, startTime, now).Scan(&latestReading)
				h.db.QueryRowContext(ctx, `SELECT power_kwh FROM charger_sessions WHERE charger_id = ? AND session_time < ? ORDER BY session_time DESC LIMIT 1`,
					chargerID, startTime).Scan(&baselineReading)
				if firstReading.Valid && latestReading.Valid {
					baseline := firstReading.Float64
					if baselineReading.Valid {
						baseline = baselineReading.Float64
					}
					consumption := latestReading.Float64 - baseline
					if consumption > 0 {
						flow.EvChargingKwh += consumption
					}
				}
			}
		}
		chargerRows.Close()
	}

	// Derive self-consumption and grid import/export
	if flow.SolarProducedKwh > 0 {
		flow.SolarSelfConsumedKwh = flow.SolarProducedKwh
		if flow.TotalConsumptionKwh < flow.SolarProducedKwh {
			flow.SolarSelfConsumedKwh = flow.TotalConsumptionKwh
		}
		flow.SolarExportedKwh = flow.SolarProducedKwh - flow.SolarSelfConsumedKwh
		flow.SelfConsumptionPct = (flow.SolarSelfConsumedKwh / flow.SolarProducedKwh) * 100
	}
	flow.GridImportKwh = flow.TotalConsumptionKwh - flow.SolarSelfConsumedKwh
	if flow.GridImportKwh < 0 {
		flow.GridImportKwh = 0
	}

	// Per-building breakdown (only if no specific building filter)
	if buildingIDStr == "" || buildingIDStr == "0" {
		buildingRows, err := h.db.QueryContext(ctx, `
			SELECT id, name FROM buildings WHERE COALESCE(is_group, 0) = 0 ORDER BY name
		`)
		if err == nil {
			for buildingRows.Next() {
				var bid int
				var bname string
				if buildingRows.Scan(&bid, &bname) != nil {
					continue
				}

				var bf models.BuildingEnergyFlow
				bf.BuildingID = bid
				bf.BuildingName = bname

				// Solar for this building
				sRows, err := h.db.QueryContext(ctx, `SELECT id FROM meters WHERE building_id = ? AND meter_type = 'solar_meter' AND COALESCE(is_active, 1) = 1`, bid)
				if err == nil {
					for sRows.Next() {
						var mid int
						if sRows.Scan(&mid) == nil {
							bf.SolarProducedKwh += calcMeterConsumption(h.db, ctx, mid, "power_kwh_export", startTime, now)
						}
					}
					sRows.Close()
				}

				// Consumption for this building
				cRows, err := h.db.QueryContext(ctx, `SELECT id FROM meters WHERE building_id = ? AND meter_type = 'apartment_meter' AND COALESCE(is_active, 1) = 1`, bid)
				if err == nil {
					for cRows.Next() {
						var mid int
						if cRows.Scan(&mid) == nil {
							bf.TotalConsumptionKwh += calcMeterConsumption(h.db, ctx, mid, "power_kwh", startTime, now)
						}
					}
					cRows.Close()
				}

				// Charging for this building
				chRows, err := h.db.QueryContext(ctx, `SELECT id FROM chargers WHERE building_id = ? AND COALESCE(is_active, 1) = 1`, bid)
				if err == nil {
					for chRows.Next() {
						var cid int
						if chRows.Scan(&cid) == nil {
							var fr, lr, br sql.NullFloat64
							h.db.QueryRowContext(ctx, `SELECT power_kwh FROM charger_sessions WHERE charger_id = ? AND session_time >= ? AND session_time < ? ORDER BY session_time ASC LIMIT 1`, cid, startTime, now).Scan(&fr)
							h.db.QueryRowContext(ctx, `SELECT power_kwh FROM charger_sessions WHERE charger_id = ? AND session_time >= ? AND session_time < ? ORDER BY session_time DESC LIMIT 1`, cid, startTime, now).Scan(&lr)
							h.db.QueryRowContext(ctx, `SELECT power_kwh FROM charger_sessions WHERE charger_id = ? AND session_time < ? ORDER BY session_time DESC LIMIT 1`, cid, startTime).Scan(&br)
							if fr.Valid && lr.Valid {
								bl := fr.Float64
								if br.Valid {
									bl = br.Float64
								}
								c := lr.Float64 - bl
								if c > 0 {
									bf.EvChargingKwh += c
								}
							}
						}
					}
					chRows.Close()
				}

				// Derive self-consumption for this building
				if bf.SolarProducedKwh > 0 {
					bf.SolarSelfConsumedKwh = bf.SolarProducedKwh
					if bf.TotalConsumptionKwh < bf.SolarProducedKwh {
						bf.SolarSelfConsumedKwh = bf.TotalConsumptionKwh
					}
				}
				bf.GridImportKwh = bf.TotalConsumptionKwh - bf.SolarSelfConsumedKwh
				if bf.GridImportKwh < 0 {
					bf.GridImportKwh = 0
				}

				flow.PerBuilding = append(flow.PerBuilding, bf)
			}
			buildingRows.Close()
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(flow)
}

// GetEnergyFlowLive returns real-time power data for live dashboard display
// This reads meters directly without storing to database - purely for UI
func (h *DashboardHandler) GetEnergyFlowLive(w http.ResponseWriter, r *http.Request) {
	defer func() {
		if rec := recover(); rec != nil {
			log.Printf("PANIC in GetEnergyFlowLive: %v", rec)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
		}
	}()

	buildingIDStr := r.URL.Query().Get("building_id")
	var buildingID int
	if buildingIDStr != "" && buildingIDStr != "0" {
		fmt.Sscanf(buildingIDStr, "%d", &buildingID)
	}

	// Check if data collector is available
	if h.dataCollector == nil {
		http.Error(w, "Data collector not available", http.StatusServiceUnavailable)
		return
	}

	// Get live meter readings
	readings, err := h.dataCollector.GetLiveMeterReadings(buildingID)
	if err != nil {
		log.Printf("GetEnergyFlowLive error: %v", err)
		http.Error(w, "Failed to get live readings", http.StatusInternalServerError)
		return
	}

	// Aggregate by building
	buildingPower := make(map[int]*models.BuildingEnergyFlowLive)
	buildingNames := make(map[int]string)

	// Get building names
	rows, _ := h.db.Query(`SELECT id, name FROM buildings WHERE COALESCE(is_group, 0) = 0`)
	if rows != nil {
		for rows.Next() {
			var id int
			var name string
			if rows.Scan(&id, &name) == nil {
				buildingNames[id] = name
				buildingPower[id] = &models.BuildingEnergyFlowLive{
					BuildingID:   id,
					BuildingName: name,
				}
			}
		}
		rows.Close()
	}

	// Aggregate meter readings
	var totalSolarW, totalConsumptionW, totalEvW float64
	for _, reading := range readings {
		powerKw := reading.CurrentPowerW / 1000.0

		if bp, exists := buildingPower[reading.BuildingID]; exists {
			switch reading.MeterType {
			case "solar_meter":
				bp.SolarPowerKw += powerKw
				totalSolarW += reading.CurrentPowerW
			case "apartment_meter":
				bp.ConsumptionPowerKw += powerKw
				totalConsumptionW += reading.CurrentPowerW
			}
		}
	}

	// Get live charger power (from existing charger live data)
	chargerRows, _ := h.db.Query(`SELECT id, building_id, connection_type FROM chargers WHERE COALESCE(is_active, 1) = 1`)
	if chargerRows != nil {
		for chargerRows.Next() {
			var chargerID, chBuildingID int
			var connectionType string
			if chargerRows.Scan(&chargerID, &chBuildingID, &connectionType) == nil {
				var chargerPowerKw float64

				// Get live charger data based on connection type
				if status, ok := h.dataCollector.GetChargerLiveStatus(chargerID); ok && status != nil {
					chargerPowerKw = status.CurrentPower_kW
				}

				if bp, exists := buildingPower[chBuildingID]; exists {
					bp.EvChargingPowerKw += chargerPowerKw
				}
				totalEvW += chargerPowerKw * 1000
			}
		}
		chargerRows.Close()
	}

	// Calculate grid power for each building and totals
	for _, bp := range buildingPower {
		// Grid power = consumption - solar (negative means exporting)
		bp.GridPowerKw = bp.ConsumptionPowerKw - bp.SolarPowerKw
	}

	// Calculate totals
	totalSolarKw := totalSolarW / 1000.0
	totalConsumptionKw := totalConsumptionW / 1000.0
	totalEvKw := totalEvW / 1000.0

	// Self-consumption: min(solar, consumption) / solar
	var selfConsumptionPct float64
	if totalSolarKw > 0 {
		selfConsumed := totalSolarKw
		if totalConsumptionKw < totalSolarKw {
			selfConsumed = totalConsumptionKw
		}
		selfConsumptionPct = (selfConsumed / totalSolarKw) * 100
	}

	// Grid power = consumption - solar (positive = import, negative = export)
	gridPowerKw := totalConsumptionKw - totalSolarKw
	isExporting := gridPowerKw < 0

	// Build response
	response := models.EnergyFlowLiveData{
		Period:             "live",
		SolarPowerKw:       totalSolarKw,
		ConsumptionPowerKw: totalConsumptionKw,
		GridPowerKw:        gridPowerKw,
		EvChargingPowerKw:  totalEvKw,
		SelfConsumptionPct: selfConsumptionPct,
		IsExporting:        isExporting,
		Timestamp:          time.Now().Format(time.RFC3339),
	}

	// Add per-building breakdown if not filtered to single building
	if buildingID == 0 {
		for _, bp := range buildingPower {
			response.PerBuilding = append(response.PerBuilding, *bp)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}