package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
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

	today := time.Now().Format("2006-01-02")
	if err := h.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(consumption_kwh), 0) 
		FROM meter_readings 
		WHERE DATE(reading_time) = ?
	`, today).Scan(&stats.TodayConsumption); err != nil {
		log.Printf("Error getting today's consumption: %v", err)
		stats.TodayConsumption = 0
	}

	startOfMonth := time.Now().AddDate(0, 0, -time.Now().Day()+1).Format("2006-01-02")
	if err := h.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(consumption_kwh), 0) 
		FROM meter_readings 
		WHERE reading_time >= ?
	`, startOfMonth).Scan(&stats.MonthConsumption); err != nil {
		log.Printf("Error getting month's consumption: %v", err)
		stats.MonthConsumption = 0
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
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

	var startTime time.Time
	switch period {
	case "1h":
		startTime = time.Now().Add(-1 * time.Hour)
	case "24h":
		startTime = time.Now().Add(-24 * time.Hour)
	case "7d":
		startTime = time.Now().Add(-7 * 24 * time.Hour)
	case "30d":
		startTime = time.Now().Add(-30 * 24 * time.Hour)
	default:
		startTime = time.Now().Add(-24 * time.Hour)
	}

	rows, err := h.db.QueryContext(ctx, `
		SELECT m.meter_type, mr.reading_time, mr.consumption_kwh
		FROM meter_readings mr
		JOIN meters m ON mr.meter_id = m.id
		WHERE mr.reading_time >= ?
		ORDER BY mr.reading_time ASC
	`, startTime)

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

	log.Printf("GetConsumptionByBuilding called with period: %s", period)

	var startTime time.Time
	switch period {
	case "1h":
		startTime = time.Now().Add(-1 * time.Hour)
	case "24h":
		startTime = time.Now().Add(-24 * time.Hour)
	case "7d":
		startTime = time.Now().Add(-7 * 24 * time.Hour)
	case "30d":
		startTime = time.Now().Add(-30 * 24 * time.Hour)
	default:
		startTime = time.Now().Add(-24 * time.Hour)
	}

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
	defer buildingRows.Close()

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

	for buildingRows.Next() {
		var buildingID int
		var buildingName string
		if err := buildingRows.Scan(&buildingID, &buildingName); err != nil {
			log.Printf("Error scanning building row: %v", err)
			continue
		}

		log.Printf("Processing building ID: %d, Name: %s", buildingID, buildingName)

		building := BuildingConsumption{
			BuildingID:   buildingID,
			BuildingName: buildingName,
			Meters:       []MeterData{},
		}

		// FIXED: Query meters and close immediately after reading
		log.Printf("  Querying meters for building %d...", buildingID)
		meterRows, err := h.db.QueryContext(ctx, `
			SELECT m.id, m.name, m.meter_type, m.user_id
			FROM meters m
			WHERE m.building_id = ? AND COALESCE(m.is_active, 1) = 1
			ORDER BY m.meter_type, m.name
		`, buildingID)

		if err != nil {
			log.Printf("  Error querying meters for building %d: %v", buildingID, err)
			buildings = append(buildings, building)
			continue
		}

		// Collect all meter info first, then close the rows immediately
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
		meterRows.Close() // CRITICAL: Close immediately after reading
		
		log.Printf("  Found %d meters for building %d", len(meterInfos), buildingID)

		// Now process each meter without holding the meterRows open
		for _, mi := range meterInfos {
			log.Printf("    Processing meter ID: %d, Name: %s, Type: %s", mi.id, mi.name, mi.meterType)

			userName := ""
			if mi.userID.Valid {
				err := h.db.QueryRowContext(ctx, `
					SELECT first_name || ' ' || last_name 
					FROM users 
					WHERE id = ?
				`, mi.userID.Int64).Scan(&userName)
				
				if err != nil && err != sql.ErrNoRows {
					log.Printf("    Error getting user name for user %d: %v", mi.userID.Int64, err)
				}
			}

			// Query readings and close immediately
			dataRows, err := h.db.QueryContext(ctx, `
				SELECT reading_time, consumption_kwh
				FROM meter_readings
				WHERE meter_id = ? AND reading_time >= ?
				ORDER BY reading_time ASC
			`, mi.id, startTime)

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

			// Read all data points
			for dataRows.Next() {
				var timestamp time.Time
				var consumption float64
				if err := dataRows.Scan(&timestamp, &consumption); err == nil {
					meterData.Data = append(meterData.Data, models.ConsumptionData{
						Timestamp: timestamp,
						Power:     consumption,
						Source:    mi.meterType,
					})
				}
			}
			dataRows.Close() // CRITICAL: Close immediately after reading

			log.Printf("    Meter ID: %d has %d data points", mi.id, len(meterData.Data))

			building.Meters = append(building.Meters, meterData)
		}

		log.Printf("  Building %d processed with %d meters", buildingID, len(building.Meters))
		buildings = append(buildings, building)
	}

	log.Printf("Returning %d buildings", len(buildings))

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