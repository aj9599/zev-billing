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
	udpMeterBuffers  map[int]float64
	udpChargerBuffers map[int]ChargerData
	mu               sync.Mutex
	lastCollection   time.Time
	udpPorts         []int
	restartChannel   chan bool
}

type ChargerData struct {
	Power  float64
	State  string
	UserID string
	Mode   string
}

type UDPMeterConfig struct {
	MeterID int
	Name    string
	DataKey string
}

type UDPChargerConfig struct {
	ChargerID int
	Name      string
	PowerKey  string
	StateKey  string
	UserIDKey string
	ModeKey   string
}

func stripControlCharacters(str string) string {
	result := ""
	for _, char := range str {
		if char >= 32 && char != 127 {
			result += string(char)
		}
	}
	return strings.TrimSpace(result)
}

func NewDataCollector(db *sql.DB) *DataCollector {
	return &DataCollector{
		db:                db,
		udpListeners:      make(map[int]*net.UDPConn),
		udpMeterBuffers:   make(map[int]float64),
		udpChargerBuffers: make(map[int]ChargerData),
		udpPorts:          []int{},
		restartChannel:    make(chan bool, 1),
	}
}

func (dc *DataCollector) RestartUDPListeners() {
	log.Println("=== Restarting UDP Listeners ===")
	
	dc.mu.Lock()
	for port, conn := range dc.udpListeners {
		log.Printf("Closing UDP listener on port %d", port)
		conn.Close()
		delete(dc.udpListeners, port)
	}
	dc.udpPorts = []int{}
	dc.mu.Unlock()

	time.Sleep(500 * time.Millisecond)

	dc.initializeUDPListeners()
	
	log.Println("=== UDP Listeners Restarted ===")
	dc.logToDatabase("UDP Listeners Restarted", "All UDP listeners have been reinitialized")
}

func (dc *DataCollector) Start() {
	log.Println("===================================")
	log.Println("ZEV Data Collector Starting")
	log.Println("Collection Interval: 15 minutes")
	log.Println("===================================")

	dc.initializeUDPListeners()
	dc.logSystemStatus()
	dc.collectAllData()

	ticker := time.NewTicker(15 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			dc.collectAllData()
		case <-dc.restartChannel:
			log.Println("Received restart signal")
		}
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
	dc.db.QueryRow(`SELECT COUNT(*) FROM admin_logs WHERE (action LIKE '%error%' 
		OR action LIKE '%failed%') AND created_at > datetime('now', '-24 hours')`).Scan(&recentErrors)

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
	portDevices := make(map[int]struct {
		meters   []UDPMeterConfig
		chargers []UDPChargerConfig
	})

	meterRows, err := dc.db.Query(`
		SELECT id, name, connection_config
		FROM meters 
		WHERE is_active = 1 AND connection_type = 'udp'
	`)
	if err != nil {
		log.Printf("ERROR: Failed to query UDP meters: %v", err)
		dc.logToDatabase("UDP Init Error", fmt.Sprintf("Failed to query UDP meters: %v", err))
	} else {
		defer meterRows.Close()
		for meterRows.Next() {
			var id int
			var name, connectionConfig string
			if err := meterRows.Scan(&id, &name, &connectionConfig); err != nil {
				continue
			}

			var config map[string]interface{}
			if err := json.Unmarshal([]byte(connectionConfig), &config); err != nil {
				log.Printf("ERROR: Failed to parse config for meter %s: %v", name, err)
				continue
			}

			port := 8888
			if p, ok := config["listen_port"].(float64); ok {
				port = int(p)
			}

			dataKey := "power_kwh"
			if dk, ok := config["data_key"].(string); ok && dk != "" {
				dataKey = dk
			}

			devices := portDevices[port]
			devices.meters = append(devices.meters, UDPMeterConfig{
				MeterID: id,
				Name:    name,
				DataKey: dataKey,
			})
			portDevices[port] = devices
		}
	}

	chargerRows, err := dc.db.Query(`
		SELECT id, name, connection_config
		FROM chargers 
		WHERE is_active = 1 AND connection_type = 'udp'
	`)
	if err != nil {
		log.Printf("ERROR: Failed to query UDP chargers: %v", err)
		dc.logToDatabase("UDP Init Error", fmt.Sprintf("Failed to query UDP chargers: %v", err))
	} else {
		defer chargerRows.Close()
		for chargerRows.Next() {
			var id int
			var name, connectionConfig string
			if err := chargerRows.Scan(&id, &name, &connectionConfig); err != nil {
				continue
			}

			var config map[string]interface{}
			if err := json.Unmarshal([]byte(connectionConfig), &config); err != nil {
				log.Printf("ERROR: Failed to parse config for charger %s: %v", name, err)
				continue
			}

			port := 8888
			if p, ok := config["listen_port"].(float64); ok {
				port = int(p)
			}

			powerKey := "power_kwh"
			if pk, ok := config["power_key"].(string); ok && pk != "" {
				powerKey = pk
			}

			stateKey := "state"
			if sk, ok := config["state_key"].(string); ok && sk != "" {
				stateKey = sk
			}

			userIDKey := "user_id"
			if uk, ok := config["user_id_key"].(string); ok && uk != "" {
				userIDKey = uk
			}

			modeKey := "mode"
			if mk, ok := config["mode_key"].(string); ok && mk != "" {
				modeKey = mk
			}

			devices := portDevices[port]
			devices.chargers = append(devices.chargers, UDPChargerConfig{
				ChargerID: id,
				Name:      name,
				PowerKey:  powerKey,
				StateKey:  stateKey,
				UserIDKey: userIDKey,
				ModeKey:   modeKey,
			})
			portDevices[port] = devices
		}
	}

	for port, devices := range portDevices {
		go dc.startUDPListener(port, devices.meters, devices.chargers)
	}
}

func (dc *DataCollector) startUDPListener(port int, meters []UDPMeterConfig, chargers []UDPChargerConfig) {
	addr := net.UDPAddr{
		Port: port,
		IP:   net.ParseIP("0.0.0.0"),
	}

	conn, err := net.ListenUDP("udp", &addr)
	if err != nil {
		log.Printf("ERROR: Failed to start UDP listener on port %d: %v", port, err)
		dc.logToDatabase("UDP Listener Failed", fmt.Sprintf("Port %d, Error: %v", port, err))
		return
	}

	dc.mu.Lock()
	dc.udpListeners[port] = conn
	dc.udpPorts = append(dc.udpPorts, port)
	for _, m := range meters {
		dc.udpMeterBuffers[m.MeterID] = 0
	}
	for _, c := range chargers {
		dc.udpChargerBuffers[c.ChargerID] = ChargerData{}
	}
	dc.mu.Unlock()

	deviceCount := len(meters) + len(chargers)
	log.Printf("SUCCESS: UDP listener started on port %d for %d devices (%d meters, %d chargers)", 
		port, deviceCount, len(meters), len(chargers))
	dc.logToDatabase("UDP Listener Started", 
		fmt.Sprintf("Port: %d, Meters: %d, Chargers: %d", port, len(meters), len(chargers)))

	buffer := make([]byte, 1024)

	for {
		n, remoteAddr, err := conn.ReadFromUDP(buffer)
		if err != nil {
			if strings.Contains(err.Error(), "closed") {
				log.Printf("UDP listener on port %d closed", port)
				return
			}
			log.Printf("WARNING: UDP read error on port %d: %v", port, err)
			continue
		}

		data := buffer[:n]
		cleanData := stripControlCharacters(string(data))

		var jsonData map[string]interface{}
		if err := json.Unmarshal([]byte(cleanData), &jsonData); err != nil {
			log.Printf("WARNING: Failed to parse UDP JSON on port %d: %v", port, err)
			continue
		}

		for _, meter := range meters {
			if value, ok := jsonData[meter.DataKey]; ok {
				var reading float64
				switch v := value.(type) {
				case float64:
					reading = v
				case string:
					if f, err := strconv.ParseFloat(v, 64); err == nil {
						reading = f
					}
				}

				if reading > 0 {
					dc.mu.Lock()
					dc.udpMeterBuffers[meter.MeterID] = reading
					dc.mu.Unlock()
					log.Printf("DEBUG: UDP data buffered for meter '%s' (key: %s): %.2f kWh from %s", 
						meter.Name, meter.DataKey, reading, remoteAddr.IP)
				}
			}
		}

		for _, charger := range chargers {
			chargerData := ChargerData{}
			updated := false

			if value, ok := jsonData[charger.PowerKey]; ok {
				switch v := value.(type) {
				case float64:
					chargerData.Power = v
					updated = true
				case string:
					if f, err := strconv.ParseFloat(v, 64); err == nil {
						chargerData.Power = f
						updated = true
					}
				}
			}

			// State can be string or numeric
			if value, ok := jsonData[charger.StateKey]; ok {
				switch v := value.(type) {
				case string:
					chargerData.State = v
					updated = true
				case float64:
					chargerData.State = fmt.Sprintf("%.0f", v)
					updated = true
				}
			}

			// User ID as string
			if value, ok := jsonData[charger.UserIDKey]; ok {
				switch v := value.(type) {
				case string:
					chargerData.UserID = v
					updated = true
				case float64:
					chargerData.UserID = fmt.Sprintf("%.0f", v)
					updated = true
				}
			}

			// Mode can be string or numeric
			if value, ok := jsonData[charger.ModeKey]; ok {
				switch v := value.(type) {
				case string:
					chargerData.Mode = v
					updated = true
				case float64:
					chargerData.Mode = fmt.Sprintf("%.0f", v)
					updated = true
				}
			}

			if updated {
				dc.mu.Lock()
				dc.udpChargerBuffers[charger.ChargerID] = chargerData
				dc.mu.Unlock()
				log.Printf("DEBUG: UDP data buffered for charger '%s': Power=%.2f, State=%s, User=%s, Mode=%s from %s", 
					charger.Name, chargerData.Power, chargerData.State, chargerData.UserID, chargerData.Mode, remoteAddr.IP)
			}
		}
	}
}

func (dc *DataCollector) collectAllData() {
	dc.lastCollection = time.Now()
	log.Println("========================================")
	log.Printf("Starting data collection cycle at %s", dc.lastCollection.Format("2006-01-02 15:04:05"))
	log.Println("========================================")
	
	dc.logToDatabase("Data Collection Started", "15-minute collection cycle initiated")

	dc.collectMeterData()
	dc.collectChargerData()
	dc.saveBufferedUDPData()

	log.Println("========================================")
	log.Println("Data collection cycle completed")
	log.Println("========================================")
	
	dc.logToDatabase("Data Collection Completed", "All active devices polled")
}

func (dc *DataCollector) saveBufferedUDPData() {
	dc.mu.Lock()
	defer dc.mu.Unlock()

	metersWithData := make(map[int]bool)

	for meterID, reading := range dc.udpMeterBuffers {
		if reading > 0 {
			var prevReading float64
			dc.db.QueryRow(`
				SELECT power_kwh FROM meter_readings 
				WHERE meter_id = ? 
				ORDER BY reading_time DESC LIMIT 1
			`, meterID).Scan(&prevReading)

			consumption := reading - prevReading
			if consumption < 0 {
				consumption = reading
			}

			_, err := dc.db.Exec(`
				INSERT INTO meter_readings (meter_id, reading_time, power_kwh, consumption_kwh)
				VALUES (?, ?, ?, ?)
			`, meterID, time.Now(), reading, consumption)

			if err == nil {
				dc.db.Exec(`
					UPDATE meters 
					SET last_reading = ?, last_reading_time = ?
					WHERE id = ?
				`, reading, time.Now(), meterID)

				log.Printf("SUCCESS: UDP meter data saved for meter ID %d: %.2f kWh (consumption: %.2f kWh)", 
					meterID, reading, consumption)
				dc.logToDatabase("UDP Meter Data Saved", 
					fmt.Sprintf("Meter ID: %d, Reading: %.2f kWh, Consumption: %.2f kWh", meterID, reading, consumption))
			}
			metersWithData[meterID] = true
		}
	}

	for meterID := range dc.udpMeterBuffers {
		if !metersWithData[meterID] {
			var lastReading float64
			err := dc.db.QueryRow(`
				SELECT power_kwh FROM meter_readings 
				WHERE meter_id = ? 
				ORDER BY reading_time DESC LIMIT 1
			`, meterID).Scan(&lastReading)

			if err == nil && lastReading > 0 {
				_, insertErr := dc.db.Exec(`
					INSERT INTO meter_readings (meter_id, reading_time, power_kwh, consumption_kwh)
					VALUES (?, ?, ?, 0)
				`, meterID, time.Now(), lastReading)

				if insertErr == nil {
					log.Printf("INFO: Maintained last reading (%.2f kWh) with zero consumption for inactive meter ID %d", 
						lastReading, meterID)
					dc.logToDatabase("Last Reading Maintained", 
						fmt.Sprintf("Meter ID: %d, Last Reading: %.2f kWh (no new data this cycle)", meterID, lastReading))
				}
			}
		}
	}

	// Save charger data
	for chargerID, data := range dc.udpChargerBuffers {
		// Always save charger data, even if power is 0 (important for state tracking)
		if data.UserID != "" && data.State != "" && data.Mode != "" {
			_, err := dc.db.Exec(`
				INSERT INTO charger_sessions (charger_id, user_id, session_time, power_kwh, mode, state)
				VALUES (?, ?, ?, ?, ?, ?)
			`, chargerID, data.UserID, time.Now(), data.Power, data.Mode, data.State)

			if err == nil {
				log.Printf("SUCCESS: UDP charger data saved for charger ID %d: %.2f kWh (user: %s, mode: %s, state: %s)", 
					chargerID, data.Power, data.UserID, data.Mode, data.State)
				dc.logToDatabase("UDP Charger Data Saved", 
					fmt.Sprintf("Charger ID: %d, Power: %.2f kWh, User: %s, Mode: %s, State: %s", 
						chargerID, data.Power, data.UserID, data.Mode, data.State))
			} else {
				log.Printf("ERROR: Failed to save charger data: %v", err)
			}
		}
	}
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
		log.Printf("Processing meter [%d]: '%s' (%s via %s)", meterCount, name, meterType, connectionType)

		var config map[string]interface{}
		if err := json.Unmarshal([]byte(connectionConfig), &config); err != nil {
			log.Printf("ERROR: Failed to parse config for meter '%s': %v", name, err)
			dc.logToDatabase("Config Parse Error", fmt.Sprintf("Meter: %s, Error: %v", name, err))
			continue
		}

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

		if reading > 0 {
			var prevReading float64
			dc.db.QueryRow(`
				SELECT power_kwh FROM meter_readings 
				WHERE meter_id = ? 
				ORDER BY reading_time DESC LIMIT 1
			`, id).Scan(&prevReading)

			consumption := reading - prevReading
			if consumption < 0 {
				consumption = reading
			}

			_, err := dc.db.Exec(`
				INSERT INTO meter_readings (meter_id, reading_time, power_kwh, consumption_kwh)
				VALUES (?, ?, ?, ?)
			`, id, time.Now(), reading, consumption)

			if err != nil {
				log.Printf("ERROR: Failed to save reading for meter '%s': %v", name, err)
				dc.logToDatabase("Save Error", fmt.Sprintf("Meter: %s, Error: %v", name, err))
			} else {
				dc.db.Exec(`
					UPDATE meters 
					SET last_reading = ?, last_reading_time = ?
					WHERE id = ?
				`, reading, time.Now(), id)

				log.Printf("SUCCESS: Collected meter data: '%s' = %.2f kWh (consumption: %.2f kWh)", name, reading, consumption)
				dc.logToDatabase("Meter Data Collected", fmt.Sprintf("%s: %.2f kWh, Consumption: %.2f kWh", name, reading, consumption))
				successCount++
			}
		}
	}

	log.Printf("Meter collection summary: %d/%d successful", successCount, meterCount)
}

func (dc *DataCollector) collectChargerData() {
	rows, err := dc.db.Query(`
		SELECT id, name, brand, preset, connection_type, connection_config, is_active
		FROM chargers WHERE is_active = 1 AND connection_type != 'udp'
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
		log.Printf("Processing charger [%d]: '%s' (%s)", chargerCount, name, brand)

		var config map[string]interface{}
		if err := json.Unmarshal([]byte(connectionConfig), &config); err != nil {
			log.Printf("ERROR: Failed to parse config for charger '%s': %v", name, err)
			dc.logToDatabase("Config Parse Error", fmt.Sprintf("Charger: %s, Error: %v", name, err))
			continue
		}

		var power float64
		var userID, mode, state string

		if preset == "weidmuller" {
			power, userID, mode, state = dc.collectWeidmullerData(name, config)
		}

		// Save charger data even if power is 0 (for state tracking)
		if userID != "" && mode != "" && state != "" {
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
					fmt.Sprintf("%s: %.2f kWh, User: %s, Mode: %s, State: %s", name, power, userID, mode, state))
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

	var data map[string]interface{}
	if err := json.Unmarshal(body, &data); err != nil {
		log.Printf("ERROR: Failed to parse HTTP response as JSON: %v", err)
		dc.logToDatabase("HTTP Parse Error", fmt.Sprintf("Meter: %s, Error: %v", name, err))
		return 0
	}

	fieldName, ok := config["power_field"].(string)
	if !ok {
		fieldName = "power_kwh"
	}

	if value, ok := data[fieldName].(float64); ok {
		return value
	}

	return 0
}

func (dc *DataCollector) collectModbusData(name string, config map[string]interface{}) float64 {
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

	client := &http.Client{
		Timeout: 10 * time.Second,
	}

	if resp, err := client.Get(endpoints["power"]); err == nil {
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		var data map[string]interface{}
		if json.Unmarshal(body, &data) == nil {
			if p, ok := data["power_kwh"].(float64); ok {
				power = p
			}
		}
	}

	if resp, err := client.Get(endpoints["state"]); err == nil {
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		var data map[string]interface{}
		if json.Unmarshal(body, &data) == nil {
			switch v := data["state"].(type) {
			case string:
				state = v
			case float64:
				state = fmt.Sprintf("%.0f", v)
			}
		}
	}

	if resp, err := client.Get(endpoints["user_id"]); err == nil {
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		var data map[string]interface{}
		if json.Unmarshal(body, &data) == nil {
			switch v := data["user_id"].(type) {
			case string:
				userID = v
			case float64:
				userID = fmt.Sprintf("%.0f", v)
			}
		}
	}

	if resp, err := client.Get(endpoints["mode"]); err == nil {
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		var data map[string]interface{}
		if json.Unmarshal(body, &data) == nil {
			switch v := data["mode"].(type) {
			case string:
				mode = v
			case float64:
				mode = fmt.Sprintf("%.0f", v)
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