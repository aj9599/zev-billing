package handlers

import (
	"database/sql"
	"encoding/csv"
	"fmt"
	"log"
	"net/http"
	"strconv"
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

	if exportType == "" || startDate == "" || endDate == "" {
		http.Error(w, "Missing required parameters", http.StatusBadRequest)
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
		http.Error(w, "Invalid export type", http.StatusBadRequest)
		return
	}

	if err != nil {
		log.Printf("Export error: %v", err)
		http.Error(w, "Failed to export data", http.StatusInternalServerError)
		return
	}

	// Create CSV
	w.Header().Set("Content-Type", "text/csv")
	filename := fmt.Sprintf("%s-export-%s-to-%s.csv", exportType, startDate, endDate)
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s", filename))

	writer := csv.NewWriter(w)
	defer writer.Flush()

	for _, row := range data {
		if err := writer.Write(row); err != nil {
			log.Printf("Error writing CSV: %v", err)
			return
		}
	}
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
			mr.consumption_kwh
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
	} else {
		baseQuery += " ORDER BY m.id, mr.reading_time"
		rows, err = h.db.Query(baseQuery, startDate, endDate)
	}

	if err != nil {
		return nil, err
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
			cs.user_id,
			cs.power_kwh,
			cs.mode,
			cs.state
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
	} else {
		baseQuery += " ORDER BY c.id, cs.session_time"
		rows, err = h.db.Query(baseQuery, startDate, endDate)
	}

	if err != nil {
		return nil, err
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

	return data, nil
}