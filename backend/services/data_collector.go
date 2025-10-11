package services

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

type DataCollector struct {
	db               *sql.DB
	udpListeners     map[int]*net.UDPConn
	mu               sync.Mutex
	lastCollection   time.Time
	udpPorts         []int
}

func NewDataCollector(db *sql.DB) *DataCollector {
	return &DataCollector{
		db:           db,
		udpListeners: make(map[int]*net.UDPConn),
		udpPorts:     []int{},
	}
}

func (dc *DataCollector) Start() {
	log.Println("===================================")
	log.Println("ZEV Data Collector Starting")
	log.Println("Collection Interval: 15 minutes")
	log.Println("===================================")

	// Initialize UDP listeners for all UDP meters
	dc.initializeUDPListeners()

	// Log initial status
	dc.logSystemStatus()

	// Run immediately on start
	dc.collectAllData()

	// Then run every 15 minutes
	ticker := time.NewTicker(15 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		dc.collectAllData()
	}
}

func (dc *DataCollector) logSystemStatus() {
	var activeMeters, totalMeters, activeChargers, totalChargers int
	dc.db.QueryRow("SELECT COUNT(*) FROM meters WHERE is_active = 1").Scan(&activeMeters)
	dc.db.QueryRow("SELECT COUNT(*) FROM meters").Scan(&totalMeters)
	dc.db.QueryRow("SELECT COUNT(*) FROM chargers WHERE is_active = 1").Scan(&activeChargers)
	dc.db.QueryRow("SELECT COUNT(*) FROM chargers").Scan(&totalChargers)

	log.Printf("System Status: %d/%d meters active, %d/%d chargers active", activeMeters, totalMeters, activeChargers, totalChargers)
	if len(dc.udpPorts) > 0 {
		log.Printf("UDP Listeners active on ports: %v", dc.udpPorts)
	}
}

func (dc *DataCollector) GetDebugInfo() map[string]interface{} {
	var activeMeters, totalMeters, activeChargers, totalChargers, recentErrors int
	dc.db.QueryRow("SELECT COUNT(*) FROM meters WHERE is_active = 1").Scan(&activeMeters)
	dc.db.QueryRow("SELECT COUNT(*) FROM meters").Scan(&totalMeters)
	dc.db.QueryRow("SELECT COUNT(*) FROM chargers WHERE is_active = 1").Scan(&activeChargers)
	dc.db.QueryRow("SELECT COUNT(*) FROM chargers").Scan(&totalChargers)
	dc.db.QueryRow(`SELECT COUNT(*) FROM admin_logs WHERE action LIKE '%error%' 
		OR action LIKE '%failed%' AND created_at > datetime('now', '-24 hours')`).Scan(&recentErrors)

	nextCollection := 15 - int(time.Since(dc.lastCollection).Minutes())
	if nextCollection < 0 {
		nextCollection = 0
	}

	return map[string]interface{}{
		"active_meters":           activeMeters,
		"total_meters":            totalMeters,
		"active_chargers":         activeChargers,
		"total_chargers":          totalChargers,
		"last_collection":         dc.lastCollection,
		"next_collection_minutes": nextCollection,
		"udp_listeners":           dc.udpPorts,
		"recent_errors":           recentErrors,
	}
}

func (dc *DataCollector) initializeUDPListeners() {
	rows, err := dc.db.Query(`
		SELECT id, name, connection_config
		FROM meters 
		WHERE is_active = 1 AND connection_type = 'udp'
	`)
	if err != nil {
		log.Printf("ERROR: Failed to query UDP meters: %v", err)
		dc.logToDatabase("UDP Init Error", fmt.Sprintf("Failed to query UDP meters: %v", err))
		return
	}
	defer rows.Close()

	for rows.Next() {
		var id int
		var name, connectionConfig string
		if err := rows.Scan(&id, &name, &connectionConfig); err != nil {
			continue
		}

		var config map[string]interface{}
		if err := json.Unmarshal([]byte(connectionConfig), &config); err != nil {
			log.Printf("ERROR: Failed to parse config for meter %s: %v", name, err)
			dc.logToDatabase("Config Parse Error", fmt.Sprintf("Meter %s: %v", name, err))
			continue
		}

		go dc.startUDPListener(id, name, config)
	}
}

func (dc *DataCollector) startUDPListener(meterID int, meterName string, config map[string]interface{}) {
	port := 8888 // default
	if p, ok := config["listen_port"].(float64); ok {
		port = int(p)
	}

	addr := net.UDPAddr{
		Port: port,
		IP:   net.ParseIP("0.0.0.0"),
	}

	conn, err := net.ListenUDP("udp", &addr)
	if err != nil {
		log.Printf("ERROR: Failed to start UDP listener on port %d for meter '%s': %v", port, meterName, err)
		dc.logToDatabase("UDP Listener Failed", fmt.Sprintf("Port %d, Meter: %s, Error: %v", port, meterName, err))
		return
	}

	dc.mu.Lock()
	dc.udpListeners[port] = conn
	dc.udpPorts = append(dc.udpPorts, port)
	dc.mu.Unlock()

	log.Printf("SUCCESS: UDP listener started for meter '%s' on port %d (0.0.0.0:%d)", meterName, port, port)
	dc.logToDatabase("UDP Listener Started", fmt.Sprintf("Meter: %s, Port: %d", meterName, port))

	buffer := make([]byte, 1024)

	for {
		n, remoteAddr, err := conn.ReadFromUDP(buffer)
		if err != nil {
			log.Printf("WARNING: UDP read error on port %d: %v", port, err)
			continue
		}

		// Check if sender IP matches (if specified)
		if senderIP, ok := config["sender_ip"].(string); ok && senderIP != "" {
			if !strings.Contains(remoteAddr.IP.String(), senderIP) {
				log.Printf("DEBUG: Rejected UDP packet from %s (expected %s)", remoteAddr.IP.String(), senderIP)
				continue
			}
		}

		// Parse the received data
		data := buffer[:n]
		dataStr := string(data)
		log.Printf("DEBUG: UDP packet received on port %d from %s: %s", port, remoteAddr.IP, dataStr)
		
		reading := dc.parseUDPData(data, config)

		if reading > 0 {
			// Save reading to database
			_, err := dc.db.Exec(`
				INSERT INTO meter_readings (meter_id, reading_time, power_kwh)
				VALUES (?, ?, ?)
			`, meterID, time.Now(), reading)

			if err != nil {
				log.Printf("ERROR: Failed to save UDP reading for meter %s: %v", meterName, err)
				dc.logToDatabase("UDP Save Failed", fmt.Sprintf("Meter %s: %v", meterName, err))
			} else {
				// Update last reading
				dc.db.Exec(`
					UPDATE meters 
					SET last_reading = ?, last_reading_time = ?
					WHERE id = ?
				`, reading, time.Now(), meterID)

				log.Printf("SUCCESS: UDP data saved for meter '%s': %.2f kWh from %s", meterName, reading, remoteAddr.IP)
				dc.logToDatabase("UDP Data Received", fmt.Sprintf("Meter: %s, Value: %.2f kWh, From: %s", meterName, reading, remoteAddr.IP))
			}
		} else {
			log.Printf("WARNING: Could not parse UDP data from %s: %s", remoteAddr.IP, dataStr)
			dc.logToDatabase("UDP Parse Warning", fmt.Sprintf("Meter: %s, Data: %s, From: %s", meterName, dataStr, remoteAddr.IP))
		}
	}
}

func (dc *DataCollector) parseUDPData(data []byte, config map[string]interface{}) float64 {
	dataFormat := "json"
	if format, ok := config["data_format"].(string); ok {
		dataFormat = format
	}

	dataStr := string(data)
	log.Printf("DEBUG: Parsing UDP data with format '%s': %s", dataFormat, dataStr)

	switch dataFormat {
	case "json":
		var jsonData map[string]interface{}
		if err := json.Unmarshal(data, &jsonData); err != nil {
			log.Printf("WARNING: Failed to parse UDP JSON: %v, Data: %s", err, dataStr)
			return 0
		}

		// Try to find power value in common field names
		fieldNames := []string{"power_kwh", "power", "value", "kwh", "energy"}

		for _, field := range fieldNames {
			if value, ok := jsonData[field]; ok {
				switch v := value.(type) {
				case float64:
					log.Printf("DEBUG: Found power value in field '%s': %.2f", field, v)
					return v
				case string:
					if f, err := strconv.ParseFloat(v, 64); err == nil {
						log.Printf("DEBUG: Found power value in field '%s': %.2f (parsed from string)", field, f)
						return f
					}
				}
			}
		}
		log.Printf("WARNING: No power field found in JSON. Fields present: %v", jsonData)

	case "csv":
		// Parse CSV format: "value,timestamp" or just "value"
		parts := strings.Split(strings.TrimSpace(string(data)), ",")
		if len(parts) > 0 {
			if value, err := strconv.ParseFloat(strings.TrimSpace(parts[0]), 64); err == nil {
				log.Printf("DEBUG: Parsed CSV value: %.2f", value)
				return value
			} else {
				log.Printf("WARNING: Failed to parse CSV value: %v, Data: %s", err, parts[0])
			}
		}

	case "raw":
		// Try to parse as plain number
		if value, err := strconv.ParseFloat(strings.TrimSpace(string(data)), 64); err == nil {
			log.Printf("DEBUG: Parsed raw value: %.2f", value)
			return value
		} else {
			log.Printf("WARNING: Failed to parse raw value: %v, Data: %s", err, dataStr)
		}
	}

	return 0
}

func (dc *DataCollector) collectAllData() {
	dc.lastCollection = time.Now()
	log.Println("========================================")
	log.Printf("Starting data collection cycle at %s", dc.lastCollection.Format("2006-01-02 15:04:05"))
	log.Println("========================================")
	
	dc.logToDatabase("Data Collection Started", "15-minute collection cycle initiated")

	// Collect meter data (HTTP and Modbus)
	dc.collectMeterData()

	// Collect charger data
	dc.collectChargerData()

	log.Println("========================================")
	log.Println("Data collection cycle completed")
	log.Println("========================================")
	
	dc.logToDatabase("Data Collection Completed", "All active devices polled")
}

func (dc *DataCollector) collectMeterData() {
	rows, err := dc.db.Query(`
		SELECT id, name, meter_type, connection_type, connection_config, is_active
		FROM meters WHERE is_active = 1 AND connection_type != 'udp'
	`)
	if err != nil {
		log.Printf("ERROR: Failed to query meters: %v", err)
		dc.logToDatabase("Meter Query Error", fmt.Sprintf("Failed to query meters: %v", err))
		return
	}
	defer rows.Close()

	meterCount := 0
	successCount := 0

	for rows.Next() {
		var id int
		var name, meterType, connectionType, connectionConfig string
		var isActive bool

		if err := rows.Scan(&id, &name, &meterType, &connectionType, &connectionConfig, &isActive); err != nil {
			continue
		}

		meterCount++
		log.Printf("Processing meter [%d/%d]: '%s' (%s via %s)", meterCount, meterCount, name, meterType, connectionType)

		// Parse connection config
		var config map[string]interface{}
		if err := json.Unmarshal([]byte(connectionConfig), &config); err != nil {
			log.Printf("ERROR: Failed to parse config for meter '%s': %v", name, err)
			dc.logToDatabase("Config Parse Error", fmt.Sprintf("Meter: %s, Error: %v", name, err))
			continue
		}

		// Collect data based on connection type
		var reading float64
		switch connectionType {
		case "http":
			reading = dc.collectHTTPData(name, config)
		case "modbus_tcp":
			reading = dc.collectModbusData(name, config)
		default:
			log.Printf("ERROR: Unknown connection type for meter '%s': %s", name, connectionType)
			continue
		}

		// Save reading
		if reading > 0 {
			_, err := dc.db.Exec(`
				INSERT INTO meter_readings (meter_id, reading_time, power_kwh)
				VALUES (?, ?, ?)
			`, id, time.Now(), reading)

			if err != nil {
				log.Printf("ERROR: Failed to save reading for meter '%s': %v", name, err)
				dc.logToDatabase("Save Error", fmt.Sprintf("Meter: %s, Error: %v", name, err))
			} else {
				// Update last reading
				dc.db.Exec(`
					UPDATE meters 
					SET last_reading = ?, last_reading_time = ?
					WHERE id = ?
				`, reading, time.Now(), id)

				log.Printf("SUCCESS: Collected meter data: '%s' = %.2f kWh", name, reading)
				dc.logToDatabase("Meter Data Collected", fmt.Sprintf("%s: %.2f kWh", name, reading))
				successCount++
			}
		}
	}

	log.Printf("Meter collection summary: %d/%d successful", successCount, meterCount)
}

func (dc *DataCollector) collectChargerData() {
	rows, err := dc.db.Query(`
		SELECT id, name, brand, preset, connection_type, connection_config, is_active
		FROM chargers WHERE is_active = 1
	`)
	if err != nil {
		log.Printf("ERROR: Failed to query chargers: %v", err)
		dc.logToDatabase("Charger Query Error", fmt.Sprintf("Failed to query chargers: %v", err))
		return
	}
	defer rows.Close()

	chargerCount := 0
	successCount := 0

	for rows.Next() {
		var id int
		var name, brand, preset, connectionType, connectionConfig string
		var isActive bool

		if err := rows.Scan(&id, &name, &brand, &preset, &connectionType, &connectionConfig, &isActive); err != nil {
			continue
		}

		chargerCount++
		log.Printf("Processing charger [%d/%d]: '%s' (%s)", chargerCount, chargerCount, name, brand)

		// Parse connection config
		var config map[string]interface{}
		if err := json.Unmarshal([]byte(connectionConfig), &config); err != nil {
			log.Printf("ERROR: Failed to parse config for charger '%s': %v", name, err)
			dc.logToDatabase("Config Parse Error", fmt.Sprintf("Charger: %s, Error: %v", name, err))
			continue
		}

		// Collect data based on preset
		var power float64
		var userID, mode, state string

		if preset == "weidmuller" {
			power, userID, mode, state = dc.collectWeidmullerData(name, config)
		}

		// Save session data
		if power > 0 {
			_, err := dc.db.Exec(`
				INSERT INTO charger_sessions (charger_id, user_id, session_time, power_kwh, mode, state)
				VALUES (?, ?, ?, ?, ?, ?)
			`, id, userID, time.Now(), power, mode, state)

			if err != nil {
				log.Printf("ERROR: Failed to save charger session for '%s': %v", name, err)
				dc.logToDatabase("Save Error", fmt.Sprintf("Charger: %s, Error: %v", name, err))
			} else {
				log.Printf("SUCCESS: Collected charger data: '%s' = %.2f kWh (user: %s, mode: %s, state: %s)", 
					name, power, userID, mode, state)
				dc.logToDatabase("Charger Data Collected", 
					fmt.Sprintf("%s: %.2f kWh, User: %s, Mode: %s", name, power, userID, mode))
				successCount++
			}
		}
	}

	log.Printf("Charger collection summary: %d/%d successful", successCount, chargerCount)
}

func (dc *DataCollector) collectHTTPData(name string, config map[string]interface{}) float64 {
	endpoint, ok := config["endpoint"].(string)
	if !ok {
		log.Printf("ERROR: No endpoint configured for meter '%s'", name)
		return 0
	}

	log.Printf("DEBUG: Making HTTP request to %s", endpoint)

	client := &http.Client{
		Timeout: 10 * time.Second,
	}

	resp, err := client.Get(endpoint)
	if err != nil {
		log.Printf("ERROR: HTTP request failed to %s: %v", endpoint, err)
		dc.logToDatabase("HTTP Request Failed", fmt.Sprintf("Meter: %s, Endpoint: %s, Error: %v", name, endpoint, err))
		return 0
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		log.Printf("ERROR: HTTP request to %s returned status %d", endpoint, resp.StatusCode)
		dc.logToDatabase("HTTP Error Status", fmt.Sprintf("Meter: %s, Status: %d", name, resp.StatusCode))
		return 0
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Printf("ERROR: Failed to read HTTP response: %v", err)
		return 0
	}

	log.Printf("DEBUG: HTTP response from %s: %s", endpoint, string(body))

	var data map[string]interface{}
	if err := json.Unmarshal(body, &data); err != nil {
		log.Printf("ERROR: Failed to parse HTTP response as JSON: %v, Response: %s", err, string(body))
		dc.logToDatabase("HTTP Parse Error", fmt.Sprintf("Meter: %s, Error: %v", name, err))
		return 0
	}

	// Extract power value based on field name in config
	fieldName, ok := config["power_field"].(string)
	if !ok {
		fieldName = "power_kwh"
	}

	if value, ok := data[fieldName].(float64); ok {
		log.Printf("DEBUG: Found power value in field '%s': %.2f", fieldName, value)
		return value
	}

	log.Printf("WARNING: Power field '%s' not found in response. Available fields: %v", fieldName, data)
	return 0
}

func (dc *DataCollector) collectModbusData(name string, config map[string]interface{}) float64 {
	// Placeholder for Modbus TCP implementation
	log.Printf("INFO: Modbus TCP collection not yet implemented for meter '%s'", name)
	dc.logToDatabase("Modbus Not Implemented", fmt.Sprintf("Meter: %s", name))
	return 0
}

func (dc *DataCollector) collectWeidmullerData(name string, config map[string]interface{}) (power float64, userID, mode, state string) {
	endpoints := map[string]string{
		"power":   fmt.Sprintf("%v", config["power_endpoint"]),
		"state":   fmt.Sprintf("%v", config["state_endpoint"]),
		"user_id": fmt.Sprintf("%v", config["user_id_endpoint"]),
		"mode":    fmt.Sprintf("%v", config["mode_endpoint"]),
	}

	log.Printf("DEBUG: Collecting Weidmüller data for charger '%s'", name)

	client := &http.Client{
		Timeout: 10 * time.Second,
	}

	// Collect power
	if resp, err := client.Get(endpoints["power"]); err == nil {
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		log.Printf("DEBUG: Power endpoint response: %s", string(body))
		var data map[string]interface{}
		if json.Unmarshal(body, &data) == nil {
			if p, ok := data["power_kwh"].(float64); ok {
				power = p
			}
		}
	} else {
		log.Printf("ERROR: Failed to get power data for charger '%s': %v", name, err)
	}

	// Collect state
	if resp, err := client.Get(endpoints["state"]); err == nil {
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		log.Printf("DEBUG: State endpoint response: %s", string(body))
		var data map[string]interface{}
		if json.Unmarshal(body, &data) == nil {
			if s, ok := data["state"].(string); ok {
				state = s
			}
		}
	}

	// Collect user ID
	if resp, err := client.Get(endpoints["user_id"]); err == nil {
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		log.Printf("DEBUG: User ID endpoint response: %s", string(body))
		var data map[string]interface{}
		if json.Unmarshal(body, &data) == nil {
			if uid, ok := data["user_id"].(string); ok {
				userID = uid
			}
		}
	}

	// Collect mode
	if resp, err := client.Get(endpoints["mode"]); err == nil {
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		log.Printf("DEBUG: Mode endpoint response: %s", string(body))
		var data map[string]interface{}
		if json.Unmarshal(body, &data) == nil {
			if m, ok := data["mode"].(string); ok {
				mode = m
			}
		}
	}

	return power, userID, mode, state
}

func (dc *DataCollector) logToDatabase(action, details string) {
	dc.db.Exec(`
		INSERT INTO admin_logs (action, details, ip_address)
		VALUES (?, ?, 'system')
	`, action, details)
}