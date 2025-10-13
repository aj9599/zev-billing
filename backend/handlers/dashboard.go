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
)

type DashboardHandler struct {
	db *sql.DB
}

func NewDashboardHandler(db *sql.DB) *DashboardHandler {
	return &DashboardHandler{db: db}
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

	if err := h.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM users").Scan(&stats.TotalUsers); err != nil {
		log.Printf("Error counting users: %v", err)
		stats.TotalUsers = 0
	}
	
	if err := h.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM buildings").Scan(&stats.TotalBuildings); err != nil {
		log.Printf("Error counting buildings: %v", err)
		stats.TotalBuildings = 0
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

	solarMeterTypes := []string{"solar_meter"}
	stats.TodaySolar = calculateTotalConsumption(h.db, ctx, solarMeterTypes, todayStart, todayEnd)
	stats.MonthSolar = calculateTotalConsumption(h.db, ctx, solarMeterTypes, startOfMonth, now)

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

// FIXED: Smart detection of instantaneous vs cumulative charger data
func detectChargerDataType(sessions []float64) string {
	if len(sessions) < 2 {
		return "cumulative" // Default to cumulative for safety
	}

	// Analyze the pattern of values
	increasing := 0
	decreasing := 0
	identical := 0
	
	// Check the range and pattern
	minVal := sessions[0]
	maxVal := sessions[0]
	
	for i := 1; i < len(sessions); i++ {
		diff := sessions[i] - sessions[i-1]
		
		if sessions[i] < minVal {
			minVal = sessions[i]
		}
		if sessions[i] > maxVal {
			maxVal = sessions[i]
		}
		
		if diff > 0.0001 {
			increasing++
		} else if diff < -0.0001 {
			decreasing++
		} else {
			identical++
		}
	}

	valueRange := maxVal - minVal
	
	// Key insight: If values are large (>100) and always increasing, it's cumulative
	// Instantaneous power readings would fluctuate and be in single/double digits (kW)
	if minVal > 100 {
		// Values over 100 are almost certainly cumulative kWh totals
		return "cumulative"
	}
	
	// If values are consistently increasing (even slowly), it's cumulative
	if increasing > (len(sessions) * 3 / 4) {
		return "cumulative"
	}
	
	// If most values are identical, could be idle charger - treat as cumulative
	if identical > (len(sessions) / 2) {
		return "cumulative"
	}
	
	// If values fluctuate up and down, likely instantaneous
	if increasing > 0 && decreasing > 0 && valueRange < 50 {
		return "instantaneous"
	}

	// Default to cumulative - safer assumption
	return "cumulative"
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

		// Process meters (apartment_meter and solar_meter)
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

			type readingData struct {
				timestamp      time.Time
				cumulativeKwh  float64
			}

			// Get baseline reading (last reading before period)
			var baselineReading *readingData
			var baselineTimestamp time.Time
			var baselinePowerKwh float64
			
			err = h.db.QueryRowContext(ctx, `
				SELECT reading_time, power_kwh
				FROM meter_readings
				WHERE meter_id = ? AND reading_time < ?
				ORDER BY reading_time DESC
				LIMIT 1
			`, mi.id, startTime).Scan(&baselineTimestamp, &baselinePowerKwh)
			
			if err == nil {
				baselineReading = &readingData{
					timestamp:      baselineTimestamp,
					cumulativeKwh:  baselinePowerKwh,
				}
				log.Printf("    Found baseline reading for meter %d at %v: %.2f kWh", 
					mi.id, baselineTimestamp, baselinePowerKwh)
			}
			
			// Get all readings within period
			var dataRows *sql.Rows
			dataRows, err = h.db.QueryContext(ctx, `
				SELECT reading_time, power_kwh
				FROM meter_readings
				WHERE meter_id = ? 
				AND reading_time >= ? 
				AND reading_time <= ?
				ORDER BY reading_time ASC
			`, mi.id, startTime, now)

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

			previousReading := baselineReading
			
			for dataRows.Next() {
				var timestamp time.Time
				var cumulativeKwh float64
				if err := dataRows.Scan(&timestamp, &cumulativeKwh); err != nil {
					continue
				}

				currentReading := &readingData{
					timestamp:      timestamp,
					cumulativeKwh:  cumulativeKwh,
				}

				// Calculate power from energy difference
				if previousReading != nil {
					consumptionKwh := currentReading.cumulativeKwh - previousReading.cumulativeKwh
					
					if consumptionKwh < 0 {
						consumptionKwh = 0
						log.Printf("    WARNING: Negative consumption detected for meter %d at %v (possible meter reset)", 
							mi.id, timestamp)
					}
					
					// Calculate actual time difference in hours
					timeDiffHours := currentReading.timestamp.Sub(previousReading.timestamp).Hours()
					if timeDiffHours <= 0 {
						timeDiffHours = 0.25 // Default to 15 minutes if times are equal
					}
					
					// Convert consumption to power in Watts: Power (W) = Energy (kWh) / Time (h) * 1000
					powerW := (consumptionKwh / timeDiffHours) * 1000
					
					meterData.Data = append(meterData.Data, models.ConsumptionData{
						Timestamp: currentReading.timestamp,
						Power:     powerW,
						Source:    mi.meterType,
					})
				}

				previousReading = currentReading
			}
			dataRows.Close()

			log.Printf("    Meter ID: %d has %d valid data points", mi.id, len(meterData.Data))

			building.Meters = append(building.Meters, meterData)
		}

		// FIXED: Process chargers with smart detection of data type
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

				// Get all distinct users who have sessions for this charger in the period
				var userRows *sql.Rows
				userRows, err = h.db.QueryContext(ctx, `
					SELECT DISTINCT user_id
					FROM charger_sessions
					WHERE charger_id = ? 
					AND session_time >= ?
					AND session_time <= ?
					ORDER BY user_id
				`, ci.id, startTime, now)

				if err != nil {
					log.Printf("    Error querying users for charger %d: %v", ci.id, err)
					continue
				}

				type userInfo struct {
					userID string
				}
				userInfos := []userInfo{}
				
				for userRows.Next() {
					var ui userInfo
					if err := userRows.Scan(&ui.userID); err != nil {
						continue
					}
					userInfos = append(userInfos, ui)
				}
				userRows.Close()

				log.Printf("    Found %d users with sessions for charger %d", len(userInfos), ci.id)

				for _, ui := range userInfos {
					log.Printf("      Processing user: %s", ui.userID)

					// Get user name
					userName := fmt.Sprintf("User %s", ui.userID)
					err = h.db.QueryRowContext(ctx, `
						SELECT first_name || ' ' || last_name 
						FROM users 
						WHERE id = ?
					`, ui.userID).Scan(&userName)
					
					if err != nil && err != sql.ErrNoRows {
						log.Printf("      Error getting user name for user %s: %v", ui.userID, err)
					}

					type sessionReading struct {
						sessionTime time.Time
						powerKwh    float64
						state       string
					}

					// Get baseline reading for this user (last session before period)
					var baselineReading *sessionReading
					var baselineTime time.Time
					var baselinePowerKwh float64
					var baselineState string
					
					err = h.db.QueryRowContext(ctx, `
						SELECT session_time, power_kwh, state
						FROM charger_sessions
						WHERE charger_id = ? 
						AND user_id = ?
						AND session_time < ?
						ORDER BY session_time DESC
						LIMIT 1
					`, ci.id, ui.userID, startTime).Scan(&baselineTime, &baselinePowerKwh, &baselineState)
					
					if err == nil {
						baselineReading = &sessionReading{
							sessionTime: baselineTime,
							powerKwh:    baselinePowerKwh,
							state:       baselineState,
						}
						log.Printf("      Found baseline for charger %d, user %s at %v: %.4f kWh, state=%s", 
							ci.id, ui.userID, baselineTime, baselinePowerKwh, baselineState)
					} else {
						log.Printf("      No baseline found for charger %d, user %s", ci.id, ui.userID)
					}

					// Get all sessions for this user in the period
					var sessionRows *sql.Rows
					sessionRows, err = h.db.QueryContext(ctx, `
						SELECT session_time, power_kwh, state
						FROM charger_sessions
						WHERE charger_id = ? 
						AND user_id = ?
						AND session_time >= ?
						AND session_time <= ?
						ORDER BY session_time ASC
					`, ci.id, ui.userID, startTime, now)

					if err != nil {
						log.Printf("      Error querying sessions for charger %d, user %s: %v", ci.id, ui.userID, err)
						continue
					}

					sessions := []sessionReading{}
					sessionValues := []float64{}
					for sessionRows.Next() {
						var sr sessionReading
						if err := sessionRows.Scan(&sr.sessionTime, &sr.powerKwh, &sr.state); err != nil {
							continue
						}
						sessions = append(sessions, sr)
						sessionValues = append(sessionValues, sr.powerKwh)
					}
					sessionRows.Close()

					log.Printf("      Found %d sessions for charger %d, user %s", len(sessions), ci.id, ui.userID)

					if len(sessions) == 0 {
						log.Printf("      No sessions found, skipping user %s", ui.userID)
						continue
					}

					// FIXED: Detect if charger data is instantaneous or cumulative
					dataType := detectChargerDataType(sessionValues)
					log.Printf("      🔍 Detected charger data type: %s (based on %d readings)", dataType, len(sessionValues))
					
					// Log sample values for debugging
					if len(sessionValues) >= 3 {
						log.Printf("      Sample values: %.4f, %.4f, %.4f kWh (min=%.4f, max=%.4f)", 
							sessionValues[0], sessionValues[1], sessionValues[len(sessionValues)-1],
							findMin(sessionValues), findMax(sessionValues))
					}

					consumptionData := []models.ConsumptionData{}
					previousReading := baselineReading

					// Log the starting point
					if previousReading != nil {
						log.Printf("      Starting with baseline: time=%v, energy=%.6f kWh", 
							previousReading.sessionTime, previousReading.powerKwh)
					} else {
						log.Printf("      No baseline found, will use first reading as baseline")
					}

					for idx, currentReading := range sessions {
						var powerW float64
						
						if dataType == "instantaneous" {
							// FIXED: Treat as instantaneous power reading in kW
							// Convert directly to Watts
							powerW = currentReading.powerKwh * 1000
							log.Printf("      ⚡ Session %d: INSTANTANEOUS power=%.2f kW → %.0f W (time=%v)", 
								idx, currentReading.powerKwh, powerW, currentReading.sessionTime)
							
						} else {
							// Treat as cumulative energy reading (default and most common)
							if previousReading != nil {
								consumptionKwh := currentReading.powerKwh - previousReading.powerKwh
								
								// Log the raw values for debugging
								log.Printf("      📊 Session %d: current=%.6f kWh, previous=%.6f kWh, diff=%.6f kWh", 
									idx, currentReading.powerKwh, previousReading.powerKwh, consumptionKwh)
								
								// Handle meter reset (negative consumption)
								if consumptionKwh < 0 {
									log.Printf("      ⚠️  Session %d: Negative consumption (%.6f kWh) - meter may have reset", 
										idx, consumptionKwh)
									// FIXED: Make a copy, not a pointer
									previousReading = &sessionReading{
										sessionTime: currentReading.sessionTime,
										powerKwh:    currentReading.powerKwh,
										state:       currentReading.state,
									}
									continue
								}
								
								// Calculate actual time difference in hours
								timeDiffHours := currentReading.sessionTime.Sub(previousReading.sessionTime).Hours()
								if timeDiffHours <= 0 {
									timeDiffHours = 0.25 // Default to 15 minutes
									log.Printf("      ⚠️  Session %d: Invalid time diff, using default 0.25h", idx)
								}
								
								// IMPORTANT: Accept ALL consumption >= 0, even if very small or zero
								// Zero consumption means charger is idle, which is valid data
								if consumptionKwh == 0 {
									log.Printf("      💤 Session %d: Zero consumption (charger idle), adding 0W point", idx)
								}
								
								// Convert consumption to power in Watts: Power (W) = Energy (kWh) / Time (h) * 1000
								powerW = (consumptionKwh / timeDiffHours) * 1000
								
								// Cap unrealistic power values
								if powerW > 50000 {
									log.Printf("      ⚠️  Session %d: Power too high (%.0f W), capping at 50kW", idx, powerW)
									powerW = 50000
								}
								
								// Log the final calculated power
								if powerW > 0 {
									log.Printf("      ✅ Session %d: energy=%.6f kWh, time=%.2f h → POWER=%.0f W", 
										idx, consumptionKwh, timeDiffHours, powerW)
								} else {
									log.Printf("      ⭕ Session %d: Zero power (idle)", idx)
								}
								
							} else {
								// First point - use as baseline with zero power
								log.Printf("      🔵 Session %d: First reading, using as baseline (%.6f kWh)", idx, currentReading.powerKwh)
								consumptionData = append(consumptionData, models.ConsumptionData{
									Timestamp: currentReading.sessionTime,
									Power:     0,
									Source:    "charger",
								})
								// FIXED: Make a copy, not a pointer
								previousReading = &sessionReading{
									sessionTime: currentReading.sessionTime,
									powerKwh:    currentReading.powerKwh,
									state:       currentReading.state,
								}
								continue
							}
						}
						
						// Add the data point
						consumptionData = append(consumptionData, models.ConsumptionData{
							Timestamp: currentReading.sessionTime,
							Power:     powerW,
							Source:    "charger",
						})
						
						// FIXED: Make a copy, not a pointer to the loop variable
						previousReading = &sessionReading{
							sessionTime: currentReading.sessionTime,
							powerKwh:    currentReading.powerKwh,
							state:       currentReading.state,
						}
					}

					// Log summary of what we collected
					nonZeroCount := 0
					totalPower := 0.0
					for _, d := range consumptionData {
						if d.Power > 0 {
							nonZeroCount++
							totalPower += d.Power
						}
					}
					
					if nonZeroCount > 0 {
						avgPower := totalPower / float64(nonZeroCount)
						log.Printf("      📈 Summary: %d total points, %d non-zero (avg %.0f W)", 
							len(consumptionData), nonZeroCount, avgPower)
					} else {
						log.Printf("      ⚠️  Summary: %d total points, but ALL are zero! Charger may be idle.", 
							len(consumptionData))
					}

					// Always add charger data if we have ANY data points
					if len(consumptionData) > 0 {
						chargerData := MeterData{
							MeterID:   ci.id,
							MeterName: ci.name,
							MeterType: "charger",
							UserName:  userName,
							Data:      consumptionData,
						}

						log.Printf("      ✅ Charger ID: %d has %d data points for user %s (avg power: %.0f W)", 
							ci.id, len(consumptionData), userName, calculateAvgPower(consumptionData))
						building.Meters = append(building.Meters, chargerData)
					} else {
						log.Printf("      ⚠️  Charger ID: %d has no valid data points for user %s", ci.id, userName)
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

// Helper function to calculate average power
func calculateAvgPower(data []models.ConsumptionData) float64 {
	if len(data) == 0 {
		return 0
	}
	total := 0.0
	for _, d := range data {
		total += d.Power
	}
	return total / float64(len(data))
}

// Helper function to find minimum value
func findMin(values []float64) float64 {
	if len(values) == 0 {
		return 0
	}
	min := values[0]
	for _, v := range values {
		if v < min {
			min = v
		}
	}
	return min
}

// Helper function to find maximum value
func findMax(values []float64) float64 {
	if len(values) == 0 {
		return 0
	}
	max := values[0]
	for _, v := range values {
		if v > max {
			max = v
		}
	}
	return max
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

	rows, err := h.db.QueryContext(ctx, `
		SELECT id, action, details, user_id, ip_address, created_at
		FROM admin_logs
		ORDER BY created_at DESC
		LIMIT ?
	`, limit)

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