package handlers

import (
	"database/sql"
	"encoding/csv"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"
)

type ExportHandler struct {
	db *sql.DB
}

func NewExportHandler(db *sql.DB) *ExportHandler {
	return &ExportHandler{db: db}
}

func (h *ExportHandler) ExportData(w http.ResponseWriter, r *http.Request) {
	exportType := r.URL.Query().Get("type")
	startDate := r.URL.Query().Get("start_date")
	endDate := r.URL.Query().Get("end_date")
	meterIDStr := r.URL.Query().Get("meter_id")
	chargerIDStr := r.URL.Query().Get("charger_id")

	log.Printf("Export request: type=%s, start=%s, end=%s, meter_id=%s, charger_id=%s", 
		exportType, startDate, endDate, meterIDStr, chargerIDStr)

	if exportType == "" || startDate == "" || endDate == "" {
		log.Printf("Missing required parameters")
		http.Error(w, "Missing required parameters: type, start_date, end_date", http.StatusBadRequest)
		return
	}

	// Validate date format
	if _, err := time.Parse("2006-01-02", startDate); err != nil {
		log.Printf("Invalid start_date format: %v", err)
		http.Error(w, "Invalid start_date format. Use YYYY-MM-DD", http.StatusBadRequest)
		return
	}
	if _, err := time.Parse("2006-01-02", endDate); err != nil {
		log.Printf("Invalid end_date format: %v", err)
		http.Error(w, "Invalid end_date format. Use YYYY-MM-DD", http.StatusBadRequest)
		return
	}

	var data [][]string
	var err error

	switch exportType {
	case "meters":
		data, err = h.exportMeterData(startDate, endDate, meterIDStr)
	case "chargers":
		data, err = h.exportChargerData(startDate, endDate, chargerIDStr)
	default:
		log.Printf("Invalid export type: %s", exportType)
		http.Error(w, "Invalid export type. Must be 'meters' or 'chargers'", http.StatusBadRequest)
		return
	}

	if err != nil {
		log.Printf("Export error: %v", err)
		http.Error(w, fmt.Sprintf("Failed to export data: %v", err), http.StatusInternalServerError)
		return
	}

	if len(data) <= 1 {
		log.Printf("No data found for export")
	} else {
		log.Printf("Exporting %d rows", len(data)-1)
	}

	// Create CSV
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	filename := fmt.Sprintf("%s-export-%s-to-%s.csv", exportType, startDate, endDate)
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
	w.Header().Set("Cache-Control", "no-cache")

	writer := csv.NewWriter(w)
	defer writer.Flush()

	for _, row := range data {
		if err := writer.Write(row); err != nil {
			log.Printf("Error writing CSV: %v", err)
			return
		}
	}

	log.Printf("Export completed successfully: %s", filename)
}

func (h *ExportHandler) exportMeterData(startDate, endDate, meterIDStr string) ([][]string, error) {
	var rows *sql.Rows
	var err error

	baseQuery := `
		SELECT 
			m.id,
			m.name,
			m.meter_type,
			b.name as building_name,
			COALESCE(u.first_name || ' ' || u.last_name, 'N/A') as user_name,
			mr.reading_time,
			mr.power_kwh,
			COALESCE(mr.consumption_kwh, 0) as consumption_kwh
		FROM meter_readings mr
		JOIN meters m ON mr.meter_id = m.id
		JOIN buildings b ON m.building_id = b.id
		LEFT JOIN users u ON m.user_id = u.id
		WHERE DATE(mr.reading_time) BETWEEN ? AND ?
	`

	if meterIDStr != "" {
		meterID, err := strconv.Atoi(meterIDStr)
		if err != nil {
			return nil, fmt.Errorf("invalid meter_id: %v", err)
		}
		baseQuery += " AND m.id = ?"
		baseQuery += " ORDER BY mr.reading_time"
		rows, err = h.db.Query(baseQuery, startDate, endDate, meterID)
		if err != nil {
			return nil, fmt.Errorf("query failed: %v", err)
		}
	} else {
		baseQuery += " ORDER BY m.id, mr.reading_time"
		rows, err = h.db.Query(baseQuery, startDate, endDate)
		if err != nil {
			return nil, fmt.Errorf("query failed: %v", err)
		}
	}
	defer rows.Close()

	data := [][]string{
		{"Meter ID", "Meter Name", "Meter Type", "Building", "User", "Reading Time", "Power (kWh)", "Consumption (kWh)"},
	}

	for rows.Next() {
		var meterID int
		var meterName, meterType, buildingName, userName, readingTime string
		var powerKWh, consumptionKWh float64

		err := rows.Scan(&meterID, &meterName, &meterType, &buildingName, &userName, &readingTime, &powerKWh, &consumptionKWh)
		if err != nil {
			log.Printf("Error scanning meter row: %v", err)
			continue
		}

		data = append(data, []string{
			fmt.Sprintf("%d", meterID),
			meterName,
			meterType,
			buildingName,
			userName,
			readingTime,
			fmt.Sprintf("%.2f", powerKWh),
			fmt.Sprintf("%.2f", consumptionKWh),
		})
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("row iteration error: %v", err)
	}

	return data, nil
}

func (h *ExportHandler) exportChargerData(startDate, endDate, chargerIDStr string) ([][]string, error) {
	var rows *sql.Rows
	var err error

	baseQuery := `
		SELECT 
			c.id,
			c.name,
			c.brand,
			b.name as building_name,
			cs.session_time,
			COALESCE(cs.user_id, 'N/A') as user_id,
			cs.power_kwh,
			COALESCE(cs.mode, 'N/A') as mode,
			COALESCE(cs.state, 'N/A') as state
		FROM charger_sessions cs
		JOIN chargers c ON cs.charger_id = c.id
		JOIN buildings b ON c.building_id = b.id
		WHERE DATE(cs.session_time) BETWEEN ? AND ?
	`

	if chargerIDStr != "" {
		chargerID, err := strconv.Atoi(chargerIDStr)
		if err != nil {
			return nil, fmt.Errorf("invalid charger_id: %v", err)
		}
		baseQuery += " AND c.id = ?"
		baseQuery += " ORDER BY cs.session_time"
		rows, err = h.db.Query(baseQuery, startDate, endDate, chargerID)
		if err != nil {
			return nil, fmt.Errorf("query failed: %v", err)
		}
	} else {
		baseQuery += " ORDER BY c.id, cs.session_time"
		rows, err = h.db.Query(baseQuery, startDate, endDate)
		if err != nil {
			return nil, fmt.Errorf("query failed: %v", err)
		}
	}
	defer rows.Close()

	data := [][]string{
		{"Charger ID", "Charger Name", "Brand", "Building", "Session Time", "User ID", "Power (kWh)", "Mode", "State"},
	}

	for rows.Next() {
		var chargerID int
		var chargerName, brand, buildingName, sessionTime, userID, mode, state string
		var powerKWh float64

		err := rows.Scan(&chargerID, &chargerName, &brand, &buildingName, &sessionTime, &userID, &powerKWh, &mode, &state)
		if err != nil {
			log.Printf("Error scanning charger row: %v", err)
			continue
		}

		data = append(data, []string{
			fmt.Sprintf("%d", chargerID),
			chargerName,
			brand,
			buildingName,
			sessionTime,
			userID,
			fmt.Sprintf("%.2f", powerKWh),
			mode,
			state,
		})
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("row iteration error: %v", err)
	}

	return data, nil
}