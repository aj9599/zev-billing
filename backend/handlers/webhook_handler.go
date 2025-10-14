package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"time"
)

type WebhookHandler struct {
	db *sql.DB
}

func NewWebhookHandler(db *sql.DB) *WebhookHandler {
	return &WebhookHandler{db: db}
}

// Helper function to round time to nearest 15-minute interval
func roundToQuarterHour(t time.Time) time.Time {
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

// ReceiveMeterReading handles incoming meter readings from devices (push model)
// Endpoint: /webhook/meter/{meter_id}
// Supports both GET with query params and POST with JSON body
func (h *WebhookHandler) ReceiveMeterReading(w http.ResponseWriter, r *http.Request) {
	// Extract meter_id from URL path
	meterIDStr := r.URL.Query().Get("meter_id")
	if meterIDStr == "" {
		log.Printf("ERROR: No meter_id provided in request from %s", r.RemoteAddr)
		http.Error(w, "meter_id is required", http.StatusBadRequest)
		return
	}

	meterID, err := strconv.Atoi(meterIDStr)
	if err != nil {
		log.Printf("ERROR: Invalid meter_id '%s' from %s", meterIDStr, r.RemoteAddr)
		http.Error(w, "Invalid meter_id", http.StatusBadRequest)
		return
	}

	// Check if meter exists
	var meterName, meterType string
	var buildingID int
	err = h.db.QueryRow(`
		SELECT name, meter_type, building_id 
		FROM meters 
		WHERE id = ? AND is_active = 1
	`, meterID).Scan(&meterName, &meterType, &buildingID)

	if err == sql.ErrNoRows {
		log.Printf("ERROR: Meter ID %d not found or inactive from %s", meterID, r.RemoteAddr)
		http.Error(w, "Meter not found or inactive", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Printf("ERROR: Database error checking meter %d: %v", meterID, err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	var powerKwh float64

	// Handle both GET and POST methods
	if r.Method == "POST" {
		// POST with JSON body
		body, err := io.ReadAll(r.Body)
		if err != nil {
			log.Printf("ERROR: Failed to read request body from %s: %v", r.RemoteAddr, err)
			http.Error(w, "Failed to read request body", http.StatusBadRequest)
			return
		}

		var data map[string]interface{}
		if err := json.Unmarshal(body, &data); err != nil {
			log.Printf("ERROR: Failed to parse JSON from %s: %v. Body: %s", r.RemoteAddr, err, string(body))
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}

		// Try different field names
		if val, ok := data["power_kwh"].(float64); ok {
			powerKwh = val
		} else if val, ok := data["power"].(float64); ok {
			powerKwh = val
		} else if val, ok := data["value"].(float64); ok {
			powerKwh = val
		} else {
			log.Printf("ERROR: No valid power field in JSON from %s. Data: %v", r.RemoteAddr, data)
			http.Error(w, "Missing power_kwh field", http.StatusBadRequest)
			return
		}
	} else {
		// GET with query parameters
		powerStr := r.URL.Query().Get("power_kwh")
		if powerStr == "" {
			powerStr = r.URL.Query().Get("power")
		}
		if powerStr == "" {
			powerStr = r.URL.Query().Get("value")
		}

		if powerStr == "" {
			log.Printf("ERROR: No power parameter in GET request from %s", r.RemoteAddr)
			http.Error(w, "power_kwh parameter is required", http.StatusBadRequest)
			return
		}

		powerKwh, err = strconv.ParseFloat(powerStr, 64)
		if err != nil {
			log.Printf("ERROR: Invalid power value '%s' from %s", powerStr, r.RemoteAddr)
			http.Error(w, "Invalid power_kwh value", http.StatusBadRequest)
			return
		}
	}

	if powerKwh <= 0 {
		log.Printf("WARNING: Zero or negative power value %.2f received for meter %d from %s", 
			powerKwh, meterID, r.RemoteAddr)
	}

	// Round to nearest 15-minute interval
	currentTime := roundToQuarterHour(time.Now())

	// Check if we already have a reading for this interval
	var existingReading float64
	err = h.db.QueryRow(`
		SELECT power_kwh FROM meter_readings 
		WHERE meter_id = ? AND reading_time = ?
	`, meterID, currentTime).Scan(&existingReading)

	if err == nil {
		// Reading already exists for this interval - update it
		log.Printf("INFO: Updating existing reading for meter %d '%s' at %s: %.3f kWh (was %.3f kWh)", 
			meterID, meterName, currentTime.Format("15:04"), powerKwh, existingReading)
		
		// Get previous reading for consumption calculation
		var lastReading float64
		var lastTime time.Time
		err = h.db.QueryRow(`
			SELECT power_kwh, reading_time FROM meter_readings 
			WHERE meter_id = ? AND reading_time < ?
			ORDER BY reading_time DESC LIMIT 1
		`, meterID, currentTime).Scan(&lastReading, &lastTime)

		consumption := powerKwh - lastReading
		if err != nil || consumption < 0 {
			consumption = 0
		}

		_, err = h.db.Exec(`
			UPDATE meter_readings 
			SET power_kwh = ?, consumption_kwh = ?
			WHERE meter_id = ? AND reading_time = ?
		`, powerKwh, consumption, meterID, currentTime)

		if err != nil {
			log.Printf("ERROR: Failed to update reading for meter %d: %v", meterID, err)
			http.Error(w, "Failed to update reading", http.StatusInternalServerError)
			return
		}
	} else {
		// New reading for this interval
		// Get last reading for consumption calculation
		var lastReading float64
		var lastTime time.Time
		err = h.db.QueryRow(`
			SELECT power_kwh, reading_time FROM meter_readings 
			WHERE meter_id = ? 
			ORDER BY reading_time DESC LIMIT 1
		`, meterID).Scan(&lastReading, &lastTime)

		consumption := powerKwh - lastReading
		if err != nil || consumption < 0 {
			consumption = 0
		}

		log.Printf("SUCCESS: New reading for meter %d '%s' at %s: %.3f kWh (consumption: %.3f kWh)", 
			meterID, meterName, currentTime.Format("15:04"), powerKwh, consumption)

		_, err = h.db.Exec(`
			INSERT INTO meter_readings (meter_id, reading_time, power_kwh, consumption_kwh)
			VALUES (?, ?, ?, ?)
		`, meterID, currentTime, powerKwh, consumption)

		if err != nil {
			log.Printf("ERROR: Failed to insert reading for meter %d: %v", meterID, err)
			http.Error(w, "Failed to save reading", http.StatusInternalServerError)
			return
		}
	}

	// Update meter's last reading
	_, err = h.db.Exec(`
		UPDATE meters 
		SET last_reading = ?, last_reading_time = ?
		WHERE id = ?
	`, powerKwh, currentTime, meterID)

	if err != nil {
		log.Printf("WARNING: Failed to update meter %d last reading: %v", meterID, err)
	}

	// Log to admin_logs
	h.db.Exec(`
		INSERT INTO admin_logs (action, details, ip_address)
		VALUES (?, ?, ?)
	`, "Meter Reading Received", 
		fmt.Sprintf("Meter: %s (ID: %d), Value: %.3f kWh at %s", meterName, meterID, powerKwh, currentTime.Format("15:04")), 
		r.RemoteAddr)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":       "success",
		"meter_id":     meterID,
		"meter_name":   meterName,
		"power_kwh":    powerKwh,
		"reading_time": currentTime.Format("2006-01-02 15:04:05"),
		"message":      "Reading recorded successfully",
	})
}

// ReceiveChargerData handles incoming charger data from devices (push model)
// Endpoint: /webhook/charger/{charger_id}
func (h *WebhookHandler) ReceiveChargerData(w http.ResponseWriter, r *http.Request) {
	chargerIDStr := r.URL.Query().Get("charger_id")
	if chargerIDStr == "" {
		log.Printf("ERROR: No charger_id provided in request from %s", r.RemoteAddr)
		http.Error(w, "charger_id is required", http.StatusBadRequest)
		return
	}

	chargerID, err := strconv.Atoi(chargerIDStr)
	if err != nil {
		log.Printf("ERROR: Invalid charger_id '%s' from %s", chargerIDStr, r.RemoteAddr)
		http.Error(w, "Invalid charger_id", http.StatusBadRequest)
		return
	}

	// Check if charger exists
	var chargerName string
	var buildingID int
	err = h.db.QueryRow(`
		SELECT name, building_id 
		FROM chargers 
		WHERE id = ? AND is_active = 1
	`, chargerID).Scan(&chargerName, &buildingID)

	if err == sql.ErrNoRows {
		log.Printf("ERROR: Charger ID %d not found or inactive from %s", chargerID, r.RemoteAddr)
		http.Error(w, "Charger not found or inactive", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Printf("ERROR: Database error checking charger %d: %v", chargerID, err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	var data map[string]interface{}

	if r.Method == "POST" {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, "Failed to read request body", http.StatusBadRequest)
			return
		}

		if err := json.Unmarshal(body, &data); err != nil {
			log.Printf("ERROR: Failed to parse JSON from %s: %v", r.RemoteAddr, err)
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}
	} else {
		// GET - build data from query parameters
		data = make(map[string]interface{})
		for key, values := range r.URL.Query() {
			if len(values) > 0 && key != "charger_id" {
				// Try to parse as float, otherwise keep as string
				if f, err := strconv.ParseFloat(values[0], 64); err == nil {
					data[key] = f
				} else {
					data[key] = values[0]
				}
			}
		}
	}

	// Extract charger data
	var powerKwh float64
	var userID, mode, state string

	if val, ok := data["power_kwh"].(float64); ok {
		powerKwh = val
	} else if val, ok := data["power"].(float64); ok {
		powerKwh = val
	}

	if val, ok := data["user_id"].(string); ok {
		userID = val
	} else if val, ok := data["user_id"].(float64); ok {
		userID = fmt.Sprintf("%.0f", val)
	}

	if val, ok := data["mode"].(string); ok {
		mode = val
	} else if val, ok := data["mode"].(float64); ok {
		mode = fmt.Sprintf("%.0f", val)
	}

	if val, ok := data["state"].(string); ok {
		state = val
	} else if val, ok := data["state"].(float64); ok {
		state = fmt.Sprintf("%.0f", val)
	}

	if userID == "" || mode == "" || state == "" {
		log.Printf("ERROR: Missing required fields for charger %d from %s. Data: %v", chargerID, r.RemoteAddr, data)
		http.Error(w, "Missing required fields: user_id, mode, state", http.StatusBadRequest)
		return
	}

	currentTime := roundToQuarterHour(time.Now())

	_, err = h.db.Exec(`
		INSERT INTO charger_sessions (charger_id, user_id, session_time, power_kwh, mode, state)
		VALUES (?, ?, ?, ?, ?, ?)
	`, chargerID, userID, currentTime, powerKwh, mode, state)

	if err != nil {
		log.Printf("ERROR: Failed to insert charger session for charger %d: %v", chargerID, err)
		http.Error(w, "Failed to save charger data", http.StatusInternalServerError)
		return
	}

	log.Printf("SUCCESS: Charger data received for %d '%s': User=%s, Power=%.3f kWh, Mode=%s, State=%s", 
		chargerID, chargerName, userID, powerKwh, mode, state)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":       "success",
		"charger_id":   chargerID,
		"charger_name": chargerName,
		"user_id":      userID,
		"reading_time": currentTime.Format("2006-01-02 15:04:05"),
		"message":      "Charger data recorded successfully",
	})
}