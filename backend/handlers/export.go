package handlers

import (
	"database/sql"
	"encoding/csv"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/xuri/excelize/v2"
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

	switch exportType {
	case "all":
		// Export all data as Excel
		h.exportAllData(w, startDate, endDate)
	case "meters":
		// Export meter data as CSV
		data, err := h.exportMeterData(startDate, endDate, meterIDStr)
		if err != nil {
			log.Printf("Export error: %v", err)
			http.Error(w, fmt.Sprintf("Failed to export data: %v", err), http.StatusInternalServerError)
			return
		}
		h.writeCSV(w, data, "meters", startDate, endDate)
	case "chargers":
		// Export charger data as CSV
		data, err := h.exportChargerData(startDate, endDate, chargerIDStr)
		if err != nil {
			log.Printf("Export error: %v", err)
			http.Error(w, fmt.Sprintf("Failed to export data: %v", err), http.StatusInternalServerError)
			return
		}
		h.writeCSV(w, data, "chargers", startDate, endDate)
	default:
		log.Printf("Invalid export type: %s", exportType)
		http.Error(w, "Invalid export type. Must be 'all', 'meters' or 'chargers'", http.StatusBadRequest)
		return
	}
}

func (h *ExportHandler) writeCSV(w http.ResponseWriter, data [][]string, exportType, startDate, endDate string) {
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

func (h *ExportHandler) exportAllData(w http.ResponseWriter, startDate, endDate string) {
	f := excelize.NewFile()
	defer f.Close()

	// Export Users
	h.exportUsersSheet(f, startDate, endDate)
	
	// Export Buildings
	h.exportBuildingsSheet(f, startDate, endDate)
	
	// Export Meters
	h.exportMetersSheet(f, startDate, endDate)
	
	// Export Chargers
	h.exportChargersSheet(f, startDate, endDate)
	
	// Export Invoices
	h.exportInvoicesSheet(f, startDate, endDate)
	
	// Export Activity Logs
	h.exportLogsSheet(f, startDate, endDate)
	
	// Delete default sheet
	f.DeleteSheet("Sheet1")

	// Set response headers
	filename := fmt.Sprintf("zev-billing-export-%s.xlsx", time.Now().Format("2006-01-02"))
	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
	w.Header().Set("Cache-Control", "no-cache")

	// Write to response
	if err := f.Write(w); err != nil {
		log.Printf("Error writing Excel file: %v", err)
		http.Error(w, "Failed to generate Excel file", http.StatusInternalServerError)
		return
	}

	log.Printf("Export completed successfully: %s", filename)
}

func (h *ExportHandler) exportUsersSheet(f *excelize.File, startDate, endDate string) {
	sheetName := "Users"
	f.NewSheet(sheetName)

	// Headers
	headers := []string{"ID", "First Name", "Last Name", "Email", "Phone", "Building", "Apartment", "User Type", "Active", "Created At"}
	for i, header := range headers {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		f.SetCellValue(sheetName, cell, header)
	}

	// Data
	rows, err := h.db.Query(`
		SELECT u.id, u.first_name, u.last_name, u.email, u.phone, 
		       COALESCE(b.name, 'N/A') as building_name,
		       COALESCE(u.apartment_unit, 'N/A') as apartment_unit,
		       u.user_type, u.is_active, u.created_at
		FROM users u
		LEFT JOIN buildings b ON u.building_id = b.id
		WHERE DATE(u.created_at) <= ?
		ORDER BY u.id
	`, endDate)
	if err != nil {
		log.Printf("Error querying users: %v", err)
		return
	}
	defer rows.Close()

	rowIndex := 2
	for rows.Next() {
		var id int
		var firstName, lastName, email, phone, buildingName, apartmentUnit, userType, createdAt string
		var isActive bool

		if err := rows.Scan(&id, &firstName, &lastName, &email, &phone, &buildingName, &apartmentUnit, &userType, &isActive, &createdAt); err != nil {
			continue
		}

		f.SetCellValue(sheetName, fmt.Sprintf("A%d", rowIndex), id)
		f.SetCellValue(sheetName, fmt.Sprintf("B%d", rowIndex), firstName)
		f.SetCellValue(sheetName, fmt.Sprintf("C%d", rowIndex), lastName)
		f.SetCellValue(sheetName, fmt.Sprintf("D%d", rowIndex), email)
		f.SetCellValue(sheetName, fmt.Sprintf("E%d", rowIndex), phone)
		f.SetCellValue(sheetName, fmt.Sprintf("F%d", rowIndex), buildingName)
		f.SetCellValue(sheetName, fmt.Sprintf("G%d", rowIndex), apartmentUnit)
		f.SetCellValue(sheetName, fmt.Sprintf("H%d", rowIndex), userType)
		f.SetCellValue(sheetName, fmt.Sprintf("I%d", rowIndex), isActive)
		f.SetCellValue(sheetName, fmt.Sprintf("J%d", rowIndex), createdAt)
		rowIndex++
	}
}

func (h *ExportHandler) exportBuildingsSheet(f *excelize.File, startDate, endDate string) {
	sheetName := "Buildings"
	f.NewSheet(sheetName)

	headers := []string{"ID", "Name", "Street", "City", "ZIP", "Country", "Has Apartments", "Created At"}
	for i, header := range headers {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		f.SetCellValue(sheetName, cell, header)
	}

	rows, err := h.db.Query(`
		SELECT id, name, address_street, address_city, address_zip, address_country, has_apartments, created_at
		FROM buildings
		WHERE DATE(created_at) <= ?
		ORDER BY id
	`, endDate)
	if err != nil {
		log.Printf("Error querying buildings: %v", err)
		return
	}
	defer rows.Close()

	rowIndex := 2
	for rows.Next() {
		var id int
		var name, street, city, zip, country, createdAt string
		var hasApartments bool

		if err := rows.Scan(&id, &name, &street, &city, &zip, &country, &hasApartments, &createdAt); err != nil {
			continue
		}

		f.SetCellValue(sheetName, fmt.Sprintf("A%d", rowIndex), id)
		f.SetCellValue(sheetName, fmt.Sprintf("B%d", rowIndex), name)
		f.SetCellValue(sheetName, fmt.Sprintf("C%d", rowIndex), street)
		f.SetCellValue(sheetName, fmt.Sprintf("D%d", rowIndex), city)
		f.SetCellValue(sheetName, fmt.Sprintf("E%d", rowIndex), zip)
		f.SetCellValue(sheetName, fmt.Sprintf("F%d", rowIndex), country)
		f.SetCellValue(sheetName, fmt.Sprintf("G%d", rowIndex), hasApartments)
		f.SetCellValue(sheetName, fmt.Sprintf("H%d", rowIndex), createdAt)
		rowIndex++
	}
}

func (h *ExportHandler) exportMetersSheet(f *excelize.File, startDate, endDate string) {
	sheetName := "Meters"
	f.NewSheet(sheetName)

	headers := []string{"ID", "Name", "Type", "Building", "User", "Last Reading", "Last Reading Time", "Active", "Created At"}
	for i, header := range headers {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		f.SetCellValue(sheetName, cell, header)
	}

	rows, err := h.db.Query(`
		SELECT m.id, m.name, m.meter_type, b.name as building_name,
		       COALESCE(u.first_name || ' ' || u.last_name, 'N/A') as user_name,
		       m.last_reading, COALESCE(m.last_reading_time, ''), m.is_active, m.created_at
		FROM meters m
		JOIN buildings b ON m.building_id = b.id
		LEFT JOIN users u ON m.user_id = u.id
		WHERE DATE(m.created_at) <= ?
		ORDER BY m.id
	`, endDate)
	if err != nil {
		log.Printf("Error querying meters: %v", err)
		return
	}
	defer rows.Close()

	rowIndex := 2
	for rows.Next() {
		var id int
		var name, meterType, buildingName, userName, lastReadingTime, createdAt string
		var lastReading float64
		var isActive bool

		if err := rows.Scan(&id, &name, &meterType, &buildingName, &userName, &lastReading, &lastReadingTime, &isActive, &createdAt); err != nil {
			continue
		}

		f.SetCellValue(sheetName, fmt.Sprintf("A%d", rowIndex), id)
		f.SetCellValue(sheetName, fmt.Sprintf("B%d", rowIndex), name)
		f.SetCellValue(sheetName, fmt.Sprintf("C%d", rowIndex), meterType)
		f.SetCellValue(sheetName, fmt.Sprintf("D%d", rowIndex), buildingName)
		f.SetCellValue(sheetName, fmt.Sprintf("E%d", rowIndex), userName)
		f.SetCellValue(sheetName, fmt.Sprintf("F%d", rowIndex), lastReading)
		f.SetCellValue(sheetName, fmt.Sprintf("G%d", rowIndex), lastReadingTime)
		f.SetCellValue(sheetName, fmt.Sprintf("H%d", rowIndex), isActive)
		f.SetCellValue(sheetName, fmt.Sprintf("I%d", rowIndex), createdAt)
		rowIndex++
	}
}

func (h *ExportHandler) exportChargersSheet(f *excelize.File, startDate, endDate string) {
	sheetName := "Chargers"
	f.NewSheet(sheetName)

	headers := []string{"ID", "Name", "Brand", "Building", "Supports Priority", "Active", "Created At"}
	for i, header := range headers {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		f.SetCellValue(sheetName, cell, header)
	}

	rows, err := h.db.Query(`
		SELECT c.id, c.name, c.brand, b.name as building_name,
		       c.supports_priority, c.is_active, c.created_at
		FROM chargers c
		JOIN buildings b ON c.building_id = b.id
		WHERE DATE(c.created_at) <= ?
		ORDER BY c.id
	`, endDate)
	if err != nil {
		log.Printf("Error querying chargers: %v", err)
		return
	}
	defer rows.Close()

	rowIndex := 2
	for rows.Next() {
		var id int
		var name, brand, buildingName, createdAt string
		var supportsPriority, isActive bool

		if err := rows.Scan(&id, &name, &brand, &buildingName, &supportsPriority, &isActive, &createdAt); err != nil {
			continue
		}

		f.SetCellValue(sheetName, fmt.Sprintf("A%d", rowIndex), id)
		f.SetCellValue(sheetName, fmt.Sprintf("B%d", rowIndex), name)
		f.SetCellValue(sheetName, fmt.Sprintf("C%d", rowIndex), brand)
		f.SetCellValue(sheetName, fmt.Sprintf("D%d", rowIndex), buildingName)
		f.SetCellValue(sheetName, fmt.Sprintf("E%d", rowIndex), supportsPriority)
		f.SetCellValue(sheetName, fmt.Sprintf("F%d", rowIndex), isActive)
		f.SetCellValue(sheetName, fmt.Sprintf("G%d", rowIndex), createdAt)
		rowIndex++
	}
}

func (h *ExportHandler) exportInvoicesSheet(f *excelize.File, startDate, endDate string) {
	sheetName := "Invoices"
	f.NewSheet(sheetName)

	headers := []string{"ID", "Invoice Number", "User", "Building", "Period Start", "Period End", "Amount", "Currency", "Status", "Generated At"}
	for i, header := range headers {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		f.SetCellValue(sheetName, cell, header)
	}

	rows, err := h.db.Query(`
		SELECT i.id, i.invoice_number, 
		       u.first_name || ' ' || u.last_name as user_name,
		       b.name as building_name,
		       i.period_start, i.period_end, i.total_amount, i.currency, i.status, i.generated_at
		FROM invoices i
		JOIN users u ON i.user_id = u.id
		JOIN buildings b ON i.building_id = b.id
		WHERE DATE(i.generated_at) BETWEEN ? AND ?
		ORDER BY i.generated_at DESC
	`, startDate, endDate)
	if err != nil {
		log.Printf("Error querying invoices: %v", err)
		return
	}
	defer rows.Close()

	rowIndex := 2
	for rows.Next() {
		var id int
		var invoiceNumber, userName, buildingName, periodStart, periodEnd, currency, status, generatedAt string
		var totalAmount float64

		if err := rows.Scan(&id, &invoiceNumber, &userName, &buildingName, &periodStart, &periodEnd, &totalAmount, &currency, &status, &generatedAt); err != nil {
			continue
		}

		f.SetCellValue(sheetName, fmt.Sprintf("A%d", rowIndex), id)
		f.SetCellValue(sheetName, fmt.Sprintf("B%d", rowIndex), invoiceNumber)
		f.SetCellValue(sheetName, fmt.Sprintf("C%d", rowIndex), userName)
		f.SetCellValue(sheetName, fmt.Sprintf("D%d", rowIndex), buildingName)
		f.SetCellValue(sheetName, fmt.Sprintf("E%d", rowIndex), periodStart)
		f.SetCellValue(sheetName, fmt.Sprintf("F%d", rowIndex), periodEnd)
		f.SetCellValue(sheetName, fmt.Sprintf("G%d", rowIndex), totalAmount)
		f.SetCellValue(sheetName, fmt.Sprintf("H%d", rowIndex), currency)
		f.SetCellValue(sheetName, fmt.Sprintf("I%d", rowIndex), status)
		f.SetCellValue(sheetName, fmt.Sprintf("J%d", rowIndex), generatedAt)
		rowIndex++
	}
}

func (h *ExportHandler) exportLogsSheet(f *excelize.File, startDate, endDate string) {
	sheetName := "Activity Logs"
	f.NewSheet(sheetName)

	headers := []string{"ID", "Action", "Details", "IP Address", "Created At"}
	for i, header := range headers {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		f.SetCellValue(sheetName, cell, header)
	}

	rows, err := h.db.Query(`
		SELECT id, action, details, ip_address, created_at
		FROM admin_logs
		WHERE DATE(created_at) BETWEEN ? AND ?
		ORDER BY created_at DESC
		LIMIT 10000
	`, startDate, endDate)
	if err != nil {
		log.Printf("Error querying logs: %v", err)
		return
	}
	defer rows.Close()

	rowIndex := 2
	for rows.Next() {
		var id int
		var action, details, ipAddress, createdAt string

		if err := rows.Scan(&id, &action, &details, &ipAddress, &createdAt); err != nil {
			continue
		}

		f.SetCellValue(sheetName, fmt.Sprintf("A%d", rowIndex), id)
		f.SetCellValue(sheetName, fmt.Sprintf("B%d", rowIndex), action)
		f.SetCellValue(sheetName, fmt.Sprintf("C%d", rowIndex), details)
		f.SetCellValue(sheetName, fmt.Sprintf("D%d", rowIndex), ipAddress)
		f.SetCellValue(sheetName, fmt.Sprintf("E%d", rowIndex), createdAt)
		rowIndex++
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
			COALESCE(mr.power_kwh_export, 0) as power_kwh_export,
			COALESCE(mr.consumption_kwh, 0) as consumption_kwh,
			COALESCE(mr.consumption_export, 0) as consumption_export
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
		{"Meter ID", "Meter Name", "Meter Type", "Building", "User", "Reading Time", 
		 "Import Energy (kWh)", "Export Energy (kWh)", "Import Consumption (kWh)", "Export Consumption (kWh)"},
	}

	for rows.Next() {
		var meterID int
		var meterName, meterType, buildingName, userName, readingTime string
		var powerKWh, powerKWhExport, consumptionKWh, consumptionExport float64

		err := rows.Scan(&meterID, &meterName, &meterType, &buildingName, &userName, &readingTime, 
			&powerKWh, &powerKWhExport, &consumptionKWh, &consumptionExport)
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
			fmt.Sprintf("%.3f", powerKWh),
			fmt.Sprintf("%.3f", powerKWhExport),
			fmt.Sprintf("%.3f", consumptionKWh),
			fmt.Sprintf("%.3f", consumptionExport),
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