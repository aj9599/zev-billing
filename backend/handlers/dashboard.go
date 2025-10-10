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

	// Get today's consumption (sum of all meter readings from today)
	today := time.Now().Format("2006-01-02")
	h.db.QueryRow(`
		SELECT COALESCE(SUM(power_kwh), 0) 
		FROM meter_readings 
		WHERE DATE(reading_time) = ?
	`, today).Scan(&stats.TodayConsumption)

	// Get this month's consumption
	startOfMonth := time.Now().AddDate(0, 0, -time.Now().Day()+1).Format("2006-01-02")
	h.db.QueryRow(`
		SELECT COALESCE(SUM(power_kwh), 0) 
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

	rows, err := h.db.Query(`
		SELECT m.meter_type, mr.reading_time, mr.power_kwh
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