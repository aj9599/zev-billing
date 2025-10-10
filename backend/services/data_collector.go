package services

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"
)

type DataCollector struct {
	db *sql.DB
}

func NewDataCollector(db *sql.DB) *DataCollector {
	return &DataCollector{db: db}
}

func (dc *DataCollector) Start() {
	log.Println("Data collector started - collecting every 15 minutes")

	// Run immediately on start
	dc.collectAllData()

	// Then run every 15 minutes
	ticker := time.NewTicker(15 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		dc.collectAllData()
	}
}

func (dc *DataCollector) collectAllData() {
	log.Println("Starting data collection cycle...")
	
	// Collect meter data
	dc.collectMeterData()
	
	// Collect charger data
	dc.collectChargerData()
	
	log.Println("Data collection cycle completed")
}

func (dc *DataCollector) collectMeterData() {
	rows, err := dc.db.Query(`
		SELECT id, name, meter_type, connection_type, connection_config, is_active
		FROM meters WHERE is_active = 1
	`)
	if err != nil {
		log.Printf("Error querying meters: %v", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var id int
		var name, meterType, connectionType, connectionConfig string
		var isActive bool

		if err := rows.Scan(&id, &name, &meterType, &connectionType, &connectionConfig, &isActive); err != nil {
			continue
		}

		// Parse connection config
		var config map[string]interface{}
		if err := json.Unmarshal([]byte(connectionConfig), &config); err != nil {
			log.Printf("Error parsing config for meter %s: %v", name, err)
			continue
		}

		// Collect data based on connection type
		var reading float64
		switch connectionType {
		case "http":
			reading = dc.collectHTTPData(config)
		case "modbus_tcp":
			reading = dc.collectModbusData(config)
		case "udp":
			reading = dc.collectUDPData(config)
		default:
			log.Printf("Unknown connection type for meter %s: %s", name, connectionType)
			continue
		}

		// Save reading
		if reading > 0 {
			_, err := dc.db.Exec(`
				INSERT INTO meter_readings (meter_id, reading_time, power_kwh)
				VALUES (?, ?, ?)
			`, id, time.Now(), reading)

			if err != nil {
				log.Printf("Error saving meter reading for %s: %v", name, err)
			} else {
				// Update last reading
				dc.db.Exec(`
					UPDATE meters 
					SET last_reading = ?, last_reading_time = ?
					WHERE id = ?
				`, reading, time.Now(), id)
				
				log.Printf("Collected meter data: %s = %.2f kWh", name, reading)
			}
		}
	}
}

func (dc *DataCollector) collectChargerData() {
	rows, err := dc.db.Query(`
		SELECT id, name, brand, preset, connection_type, connection_config, is_active
		FROM chargers WHERE is_active = 1
	`)
	if err != nil {
		log.Printf("Error querying chargers: %v", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var id int
		var name, brand, preset, connectionType, connectionConfig string
		var isActive bool

		if err := rows.Scan(&id, &name, &brand, &preset, &connectionType, &connectionConfig, &isActive); err != nil {
			continue
		}

		// Parse connection config
		var config map[string]interface{}
		if err := json.Unmarshal([]byte(connectionConfig), &config); err != nil {
			log.Printf("Error parsing config for charger %s: %v", name, err)
			continue
		}

		// Collect data based on preset
		var power float64
		var userID, mode, state string

		if preset == "weidmuller" {
			power, userID, mode, state = dc.collectWeidmullerData(config)
		}

		// Save session data
		if power > 0 {
			_, err := dc.db.Exec(`
				INSERT INTO charger_sessions (charger_id, user_id, session_time, power_kwh, mode, state)
				VALUES (?, ?, ?, ?, ?, ?)
			`, id, userID, time.Now(), power, mode, state)

			if err != nil {
				log.Printf("Error saving charger session for %s: %v", name, err)
			} else {
				log.Printf("Collected charger data: %s = %.2f kWh (user: %s, mode: %s)", name, power, userID, mode)
			}
		}
	}
}

func (dc *DataCollector) collectHTTPData(config map[string]interface{}) float64 {
	endpoint, ok := config["endpoint"].(string)
	if !ok {
		return 0
	}

	resp, err := http.Get(endpoint)
	if err != nil {
		log.Printf("HTTP request failed: %v", err)
		return 0
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Printf("Error reading HTTP response: %v", err)
		return 0
	}

	var data map[string]interface{}
	if err := json.Unmarshal(body, &data); err != nil {
		log.Printf("Error parsing HTTP response: %v", err)
		return 0
	}

	// Extract power value based on field name in config
	fieldName, ok := config["power_field"].(string)
	if !ok {
		fieldName = "power_kwh"
	}

	if value, ok := data[fieldName].(float64); ok {
		return value
	}

	return 0
}

func (dc *DataCollector) collectModbusData(config map[string]interface{}) float64 {
	// Placeholder for Modbus TCP implementation
	// In production, you would use a Modbus library like github.com/goburrow/modbus
	log.Println("Modbus TCP collection not yet implemented")
	return 0
}

func (dc *DataCollector) collectUDPData(config map[string]interface{}) float64 {
	// Placeholder for UDP implementation
	log.Println("UDP collection not yet implemented")
	return 0
}

func (dc *DataCollector) collectWeidmullerData(config map[string]interface{}) (power float64, userID, mode, state string) {
	// Weidmüller requires 4 endpoints: power_consumed, state, user_id, mode
	endpoints := map[string]string{
		"power":   fmt.Sprintf("%v", config["power_endpoint"]),
		"state":   fmt.Sprintf("%v", config["state_endpoint"]),
		"user_id": fmt.Sprintf("%v", config["user_id_endpoint"]),
		"mode":    fmt.Sprintf("%v", config["mode_endpoint"]),
	}

	// Collect power
	if resp, err := http.Get(endpoints["power"]); err == nil {
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		var data map[string]interface{}
		if json.Unmarshal(body, &data) == nil {
			if p, ok := data["power_kwh"].(float64); ok {
				power = p
			}
		}
	}

	// Collect state
	if resp, err := http.Get(endpoints["state"]); err == nil {
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		var data map[string]interface{}
		if json.Unmarshal(body, &data) == nil {
			if s, ok := data["state"].(string); ok {
				state = s
			}
		}
	}

	// Collect user ID
	if resp, err := http.Get(endpoints["user_id"]); err == nil {
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		var data map[string]interface{}
		if json.Unmarshal(body, &data) == nil {
			if uid, ok := data["user_id"].(string); ok {
				userID = uid
			}
		}
	}

	// Collect mode
	if resp, err := http.Get(endpoints["mode"]); err == nil {
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		var data map[string]interface{}
		if json.Unmarshal(body, &data) == nil {
			if m, ok := data["mode"].(string); ok {
				mode = m
			}
		}
	}

	return power, userID, mode, state
}