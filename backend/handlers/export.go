package handlers

import (
	"database/sql"
	"encoding/csv"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/aj9599/zev-billing/backend/services"
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
	meterIDsStr := r.URL.Query().Get("meter_ids")
	chargerIDStr := r.URL.Query().Get("charger_id")
	chargerIDsStr := r.URL.Query().Get("charger_ids")

	log.Printf("Export request: type=%s, start=%s, end=%s, meter_id=%s, meter_ids=%s, charger_id=%s, charger_ids=%s",
		exportType, startDate, endDate, meterIDStr, meterIDsStr, chargerIDStr, chargerIDsStr)

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
		// Support both single meter_id and comma-separated meter_ids
		effectiveMeterIDs := meterIDStr
		if meterIDsStr != "" {
			effectiveMeterIDs = meterIDsStr
		}
		data, err = h.exportMeterData(startDate, endDate, effectiveMeterIDs)
	case "chargers":
		// Support both single charger_id and comma-separated charger_ids.
		effectiveChargerIDs := chargerIDStr
		if chargerIDsStr != "" {
			effectiveChargerIDs = chargerIDsStr
		}
		data, err = h.exportChargerData(startDate, endDate, effectiveChargerIDs)
	case "building-summary":
		data, err = h.exportBuildingSummary(startDate, endDate)
	case "vat-summary":
		data, err = h.exportVATSummary(startDate, endDate)
	default:
		log.Printf("Invalid export type: %s", exportType)
		http.Error(w, "Invalid export type. Must be 'meters', 'chargers', 'building-summary' or 'vat-summary'", http.StatusBadRequest)
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

	// reading_time is stored with a timezone offset like "2026-05-06 14:30:00+02:00".
	// SQLite's DATE() function returns NULL on that format, which would silently
	// exclude every row. Compare the leading 10 characters (YYYY-MM-DD) instead.
	baseQuery := `
		SELECT
			m.id,
			m.name,
			m.meter_type,
			m.building_id,
			b.name as building_name,
			COALESCE(u.first_name || ' ' || u.last_name, 'N/A') as user_name,
			mr.reading_time,
			mr.power_kwh,
			COALESCE(mr.power_kwh_export, 0) as power_kwh_export,
			COALESCE(mr.consumption_kwh, 0) as consumption_kwh,
			COALESCE(mr.consumption_export, 0) as consumption_export
		FROM meter_readings mr
		JOIN meters m ON mr.meter_id = m.id
		JOIN buildings b ON m.building_id = b.id
		LEFT JOIN users u ON m.user_id = u.id
		WHERE substr(mr.reading_time, 1, 10) BETWEEN ? AND ?
	`

	if meterIDStr != "" {
		// Support comma-separated meter IDs (e.g., "1,2,3")
		idParts := strings.Split(meterIDStr, ",")
		var meterIDs []interface{}
		meterIDs = append(meterIDs, startDate, endDate)
		placeholders := make([]string, 0, len(idParts))
		for _, part := range idParts {
			part = strings.TrimSpace(part)
			if part == "" {
				continue
			}
			id, parseErr := strconv.Atoi(part)
			if parseErr != nil {
				return nil, fmt.Errorf("invalid meter_id '%s': %v", part, parseErr)
			}
			meterIDs = append(meterIDs, id)
			placeholders = append(placeholders, "?")
		}
		if len(placeholders) == 0 {
			return nil, fmt.Errorf("no valid meter IDs provided")
		}
		baseQuery += " AND m.id IN (" + strings.Join(placeholders, ",") + ")"
		baseQuery += " ORDER BY m.id, mr.reading_time"
		rows, err = h.db.Query(baseQuery, meterIDs...)
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
		{"Meter ID", "Meter Name", "Meter Type", "Building", "User", "Reading Time",
			"Import Energy (kWh)", "Export Energy (kWh)", "Import Consumption (kWh)", "Export Consumption (kWh)",
			"Solar Consumption (kWh)", "Grid Consumption (kWh)", "Tariff"},
	}

	// Per-building interval aggregates, loaded lazily and cached, so each
	// apartment meter reading can be split into its solar/grid share using the
	// same allocation billing applies.
	aggCache := make(map[int]map[string]*services.BuildingIntervalAgg)

	for rows.Next() {
		var meterID, buildingID int
		var meterName, meterType, buildingName, userName, readingTime string
		var powerKWh, powerKWhExport, consumptionKWh, consumptionExport float64

		err := rows.Scan(&meterID, &meterName, &meterType, &buildingID, &buildingName, &userName, &readingTime,
			&powerKWh, &powerKWhExport, &consumptionKWh, &consumptionExport)
		if err != nil {
			log.Printf("Error scanning meter row: %v", err)
			continue
		}

		solarStr, gridStr, tariff := "", "", ""
		if meterType == "apartment_meter" {
			agg, ok := aggCache[buildingID]
			if !ok {
				agg, err = services.LoadBuildingIntervalAggregates(h.db, buildingID, startDate, endDate)
				if err != nil {
					return nil, fmt.Errorf("failed to load interval aggregates: %v", err)
				}
				aggCache[buildingID] = agg
			}
			var buildingConsumption, solarProduction float64
			if a := agg[readingTime]; a != nil {
				buildingConsumption = a.TotalConsumption
				solarProduction = a.SolarProduction
			}
			solar, grid := services.SplitSolarGrid(consumptionKWh, buildingConsumption, solarProduction)
			solarStr = fmt.Sprintf("%.3f", solar)
			gridStr = fmt.Sprintf("%.3f", grid)
			switch {
			case solar > 0 && grid > 0:
				tariff = "mixed"
			case solar > 0:
				tariff = "solar"
			case grid > 0:
				tariff = "grid"
			}
		}

		data = append(data, []string{
			fmt.Sprintf("%d", meterID),
			meterName,
			meterType,
			buildingName,
			userName,
			readingTime,
			fmt.Sprintf("%.3f", powerKWh),
			fmt.Sprintf("%.3f", powerKWhExport),
			fmt.Sprintf("%.3f", consumptionKWh),
			fmt.Sprintf("%.3f", consumptionExport),
			solarStr,
			gridStr,
			tariff,
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

	// See note above: SQLite's DATE() returns NULL on "YYYY-MM-DD HH:MM:SS+HH:MM"
	// timestamps, which is exactly the format both Loxone and Zaptec write.
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
		WHERE substr(cs.session_time, 1, 10) BETWEEN ? AND ?
	`

	if chargerIDStr != "" {
		// Accept either a single id ("12") or a comma-separated list ("12,13").
		idParts := strings.Split(chargerIDStr, ",")
		args := []interface{}{startDate, endDate}
		placeholders := make([]string, 0, len(idParts))
		for _, part := range idParts {
			part = strings.TrimSpace(part)
			if part == "" {
				continue
			}
			id, parseErr := strconv.Atoi(part)
			if parseErr != nil {
				return nil, fmt.Errorf("invalid charger_id '%s': %v", part, parseErr)
			}
			args = append(args, id)
			placeholders = append(placeholders, "?")
		}
		if len(placeholders) == 0 {
			return nil, fmt.Errorf("no valid charger IDs provided")
		}
		baseQuery += " AND c.id IN (" + strings.Join(placeholders, ",") + ")"
		baseQuery += " ORDER BY c.id, cs.session_time"
		rows, err = h.db.Query(baseQuery, args...)
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
			fmt.Sprintf("%.3f", powerKWh),
			mode,
			state,
		})
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("row iteration error: %v", err)
	}

	return data, nil
}

// exportBuildingSummary aggregates invoices issued in the date range per building
// and currency: count, net/VAT/gross totals and paid vs outstanding amounts.
func (h *ExportHandler) exportBuildingSummary(startDate, endDate string) ([][]string, error) {
	rows, err := h.db.Query(`
		SELECT COALESCE(b.name, 'Building #' || i.building_id) AS building,
		       i.currency,
		       COUNT(*) AS invoices,
		       SUM(COALESCE(i.net_amount, 0)) AS net,
		       SUM(COALESCE(i.vat_amount, 0)) AS vat,
		       SUM(i.total_amount) AS gross,
		       SUM(CASE WHEN COALESCE(i.payment_status,'unpaid') = 'paid' THEN i.total_amount ELSE 0 END) AS paid,
		       SUM(CASE WHEN COALESCE(i.payment_status,'unpaid') = 'paid' THEN 0 ELSE i.total_amount END) AS outstanding
		FROM invoices i
		LEFT JOIN buildings b ON b.id = i.building_id
		WHERE date(i.generated_at) BETWEEN ? AND ?
		GROUP BY i.building_id, i.currency
		ORDER BY building, i.currency
	`, startDate, endDate)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	data := [][]string{{"Building", "Currency", "Invoices", "Net", "VAT", "Gross", "Paid", "Outstanding"}}
	for rows.Next() {
		var building, currency string
		var count int
		var net, vat, gross, paid, outstanding float64
		if err := rows.Scan(&building, &currency, &count, &net, &vat, &gross, &paid, &outstanding); err != nil {
			return nil, err
		}
		data = append(data, []string{
			building, currency, strconv.Itoa(count),
			fmt.Sprintf("%.2f", net), fmt.Sprintf("%.2f", vat), fmt.Sprintf("%.2f", gross),
			fmt.Sprintf("%.2f", paid), fmt.Sprintf("%.2f", outstanding),
		})
	}
	return data, rows.Err()
}

// exportVATSummary aggregates invoices issued in the date range per building,
// currency and VAT rate — the breakdown an accountant needs for VAT filing.
func (h *ExportHandler) exportVATSummary(startDate, endDate string) ([][]string, error) {
	rows, err := h.db.Query(`
		SELECT COALESCE(b.name, 'Building #' || i.building_id) AS building,
		       i.currency,
		       COALESCE(i.vat_rate, 0) AS vat_rate,
		       COUNT(*) AS invoices,
		       SUM(COALESCE(i.net_amount, 0)) AS net,
		       SUM(COALESCE(i.vat_amount, 0)) AS vat,
		       SUM(i.total_amount) AS gross
		FROM invoices i
		LEFT JOIN buildings b ON b.id = i.building_id
		WHERE date(i.generated_at) BETWEEN ? AND ?
		GROUP BY i.building_id, i.currency, i.vat_rate
		ORDER BY building, i.currency, vat_rate
	`, startDate, endDate)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	data := [][]string{{"Building", "Currency", "VAT Rate %", "Invoices", "Net", "VAT", "Gross"}}
	for rows.Next() {
		var building, currency string
		var vatRate float64
		var count int
		var net, vat, gross float64
		if err := rows.Scan(&building, &currency, &vatRate, &count, &net, &vat, &gross); err != nil {
			return nil, err
		}
		data = append(data, []string{
			building, currency, fmt.Sprintf("%.1f", vatRate), strconv.Itoa(count),
			fmt.Sprintf("%.2f", net), fmt.Sprintf("%.2f", vat), fmt.Sprintf("%.2f", gross),
		})
	}
	return data, rows.Err()
}
