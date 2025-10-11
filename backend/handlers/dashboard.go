package handlers

import (
	"database/sql"
	"encoding/json"
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
	var stats models.DashboardStats

	// Get total counts
	h.db.QueryRow("SELECT COUNT(*) FROM users").Scan(&stats.TotalUsers)
	h.db.QueryRow("SELECT COUNT(*) FROM buildings").Scan(&stats.TotalBuildings)
	h.db.QueryRow("SELECT COUNT(*) FROM meters").Scan(&stats.TotalMeters)
	h.db.QueryRow("SELECT COUNT(*) FROM chargers").Scan(&stats.TotalChargers)
	h.db.QueryRow("SELECT COUNT(*) FROM meters WHERE is_active = 1").Scan(&stats.ActiveMeters)
	h.db.QueryRow("SELECT COUNT(*) FROM chargers WHERE is_active = 1").Scan(&stats.ActiveChargers)

	// Get today's consumption - Use consumption_kwh instead of power_kwh
	today := time.Now().Format("2006-01-02")
	h.db.QueryRow(`
		SELECT COALESCE(SUM(consumption_kwh), 0) 
		FROM meter_readings 
		WHERE DATE(reading_time) = ?
	`, today).Scan(&stats.TodayConsumption)

	// Get this month's consumption - Use consumption_kwh instead of power_kwh
	startOfMonth := time.Now().AddDate(0, 0, -time.Now().Day()+1).Format("2006-01-02")
	h.db.QueryRow(`
		SELECT COALESCE(SUM(consumption_kwh), 0) 
		FROM meter_readings 
		WHERE reading_time >= ?
	`, startOfMonth).Scan(&stats.MonthConsumption)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

func (h *DashboardHandler) GetConsumption(w http.ResponseWriter, r *http.Request) {
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

	// Use consumption_kwh instead of power_kwh for the chart
	rows, err := h.db.Query(`
		SELECT m.meter_type, mr.reading_time, mr.consumption_kwh
		FROM meter_readings mr
		JOIN meters m ON mr.meter_id = m.id
		WHERE mr.reading_time >= ?
		ORDER BY mr.reading_time ASC
	`, startTime)

	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
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

// NEW: Get consumption data grouped by building and meter
func (h *DashboardHandler) GetConsumptionByBuilding(w http.ResponseWriter, r *http.Request) {
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

	// Get all buildings
	buildingRows, err := h.db.Query(`
		SELECT id, name 
		FROM buildings 
		WHERE is_group = 0
		ORDER BY name
	`)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
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
			continue
		}

		building := BuildingConsumption{
			BuildingID:   buildingID,
			BuildingName: buildingName,
			Meters:       []MeterData{},
		}

		// Get all meters for this building
		meterRows, err := h.db.Query(`
			SELECT m.id, m.name, m.meter_type, m.user_id
			FROM meters m
			WHERE m.building_id = ? AND m.is_active = 1
			ORDER BY m.meter_type, m.name
		`, buildingID)

		if err != nil {
			continue
		}

		for meterRows.Next() {
			var meterID int
			var meterName, meterType string
			var userID sql.NullInt64
			
			if err := meterRows.Scan(&meterID, &meterName, &meterType, &userID); err != nil {
				continue
			}

			// Get user name if applicable
			userName := ""
			if userID.Valid {
				h.db.QueryRow(`
					SELECT first_name || ' ' || last_name 
					FROM users 
					WHERE id = ?
				`, userID.Int64).Scan(&userName)
			}

			// Get consumption data for this meter
			dataRows, err := h.db.Query(`
				SELECT reading_time, consumption_kwh
				FROM meter_readings
				WHERE meter_id = ? AND reading_time >= ?
				ORDER BY reading_time ASC
			`, meterID, startTime)

			if err != nil {
				continue
			}

			meterData := MeterData{
				MeterID:   meterID,
				MeterName: meterName,
				MeterType: meterType,
				UserName:  userName,
				Data:      []models.ConsumptionData{},
			}

			for dataRows.Next() {
				var timestamp time.Time
				var consumption float64
				if err := dataRows.Scan(&timestamp, &consumption); err == nil {
					meterData.Data = append(meterData.Data, models.ConsumptionData{
						Timestamp: timestamp,
						Power:     consumption,
						Source:    meterType,
					})
				}
			}
			dataRows.Close()

			building.Meters = append(building.Meters, meterData)
		}
		meterRows.Close()

		// Only add building if it has meters with data
		if len(building.Meters) > 0 {
			buildings = append(buildings, building)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(buildings)
}

func (h *DashboardHandler) GetLogs(w http.ResponseWriter, r *http.Request) {
	limit := r.URL.Query().Get("limit")
	if limit == "" {
		limit = "100"
	}

	rows, err := h.db.Query(`
		SELECT id, action, details, user_id, ip_address, created_at
		FROM admin_logs
		ORDER BY created_at DESC
		LIMIT ?
	`, limit)

	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
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