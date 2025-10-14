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
	partialChargerData map[int]*PartialChargerData
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

type PartialChargerData struct {
	Power      *float64
	State      *string
	UserID     *string
	Mode       *string
	LastUpdate time.Time
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

// FIXED: Helper function to round time to nearest 15-minute interval
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
		// Round up to next hour
		return time.Date(t.Year(), t.Month(), t.Day(), t.Hour()+1, 0, 0, 0, t.Location())
	}
	
	return time.Date(t.Year(), t.Month(), t.Day(), t.Hour(), roundedMinutes, 0, 0, t.Location())
}

// FIXED: Get next 15-minute interval
func getNextQuarterHour(t time.Time) time.Time {
	minutes := t.Minute()
	
	if minutes < 15 {
		return time.Date(t.Year(), t.Month(), t.Day(), t.Hour(), 15, 0, 0, t.Location())
	} else if minutes < 30 {
		return time.Date(t.Year(), t.Month(), t.Day(), t.Hour(), 30, 0, 0, t.Location())
	} else if minutes < 45 {
		return time.Date(t.Year(), t.Month(), t.Day(), t.Hour(), 45, 0, 0, t.Location())
	} else {
		// Next hour at :00
		return time.Date(t.Year(), t.Month(), t.Day(), t.Hour()+1, 0, 0, 0, t.Location())
	}
}

// FIXED: Linear interpolation between two readings
func interpolateReadings(startTime time.Time, startValue float64, endTime time.Time, endValue float64) []struct{time time.Time; value float64} {
	result := []struct{time time.Time; value float64}{}
	
	if endTime.Before(startTime) || endTime.Equal(startTime) {
		return result
	}
	
	// Get first quarter hour after start
	currentTime := getNextQuarterHour(startTime)
	
	// Calculate total time and value difference
	totalDuration := endTime.Sub(startTime).Seconds()
	totalValueChange := endValue - startValue
	
	// Generate interpolated points at 15-minute intervals
	for currentTime.Before(endTime) {
		// Calculate elapsed time from start
		elapsed := currentTime.Sub(startTime).Seconds()
		
		// Linear interpolation
		ratio := elapsed / totalDuration
		interpolatedValue := startValue + (totalValueChange * ratio)
		
		result = append(result, struct{time time.Time; value float64}{
			time: currentTime,
			value: interpolatedValue,
		})
		
		// Move to next 15-minute interval
		currentTime = currentTime.Add(15 * time.Minute)
	}
	
	return result
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
		db:                 db,
		udpListeners:       make(map[int]*net.UDPConn),
		udpMeterBuffers:    make(map[int]float64),
		udpChargerBuffers:  make(map[int]ChargerData),
		partialChargerData: make(map[int]*PartialChargerData),
		udpPorts:           []int{},
		restartChannel:     make(chan bool, 1),
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
	log.Println("Collection Interval: 15 minutes (fixed at :00, :15, :30, :45)")
	log.Println("===================================")

	dc.initializeUDPListeners()
	dc.logSystemStatus()
	
	// Calculate time until next quarter hour
	now := time.Now()
	nextCollection := getNextQuarterHour(now)
	waitDuration := nextCollection.Sub(now)
	
	log.Printf(">>> WAITING UNTIL NEXT 15-MINUTE INTERVAL: %s <<<", nextCollection.Format("15:04:05"))
	log.Printf(">>> Time to wait: %.0f seconds <<<", waitDuration.Seconds())
	
	time.Sleep(waitDuration)
	
	log.Println(">>> INITIAL DATA COLLECTION <<<")
	dc.collectAllData()
	log.Println(">>> INITIAL DATA COLLECTION COMPLETED <<<")

	go dc.cleanupStalePartialData()

	// Create ticker for 15-minute intervals
	ticker := time.NewTicker(15 * time.Minute)
	defer ticker.Stop()

	nextRun := getNextQuarterHour(time.Now())
	log.Printf(">>> Next data collection at %s <<<", nextRun.Format("15:04:05"))

	for {
		select {
		case <-ticker.C:
			log.Printf(">>> 15-minute interval reached - starting collection <<<")
			dc.collectAllData()
			nextRun = getNextQuarterHour(time.Now())
			log.Printf(">>> Next data collection at %s <<<", nextRun.Format("15:04:05"))
		case <-dc.restartChannel:
			log.Println("Received restart signal")
		}
	}
}

func (dc *DataCollector) cleanupStalePartialData() {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		dc.mu.Lock()
		now := time.Now()
		for chargerID, partial := range dc.partialChargerData {
			if now.Sub(partial.LastUpdate) > 5*time.Minute {
				log.Printf("DEBUG: Cleaning up stale partial data for charger %d (last update: %v)", 
					chargerID, partial.LastUpdate)
				delete(dc.partialChargerData, chargerID)
			}
		}
		dc.mu.Unlock()
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

	// Calculate time to next collection
	now := time.Now()
	nextCollection := getNextQuarterHour(now)
	minutesToNext := int(nextCollection.Sub(now).Minutes())

	dc.mu.Lock()
	chargerBufferStatus := make(map[string]interface{})
	for chargerID, data := range dc.udpChargerBuffers {
		chargerBufferStatus[fmt.Sprintf("charger_%d", chargerID)] = map[string]interface{}{
			"power":   data.Power,
			"state":   data.State,
			"user_id": data.UserID,
			"mode":    data.Mode,
		}
	}
	
	partialStatus := make(map[string]interface{})
	for chargerID, partial := range dc.partialChargerData {
		status := map[string]interface{}{
			"last_update": partial.LastUpdate.Format("15:04:05"),
		}
		if partial.Power != nil {
			status["power"] = *partial.Power
		}
		if partial.State != nil {
			status["state"] = *partial.State
		}
		if partial.UserID != nil {
			status["user_id"] = *partial.UserID
		}
		if partial.Mode != nil {
			status["mode"] = *partial.Mode
		}
		partialStatus[fmt.Sprintf("charger_%d", chargerID)] = status
	}
	dc.mu.Unlock()

	return map[string]interface{}{
		"active_meters":           activeMeters,
		"total_meters":            totalMeters,
		"active_chargers":         activeChargers,
		"total_chargers":          totalChargers,
		"last_collection":         dc.lastCollection.Format("2006-01-02 15:04:05"),
		"next_collection":         nextCollection.Format("2006-01-02 15:04:05"),
		"next_collection_minutes": minutesToNext,
		"udp_listeners":           dc.udpPorts,
		"recent_errors":           recentErrors,
		"charger_buffers":         chargerBufferStatus,
		"partial_charger_data":    partialStatus,
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
		dc.partialChargerData[c.ChargerID] = &PartialChargerData{
			LastUpdate: time.Now(),
		}
	}
	dc.mu.Unlock()

	deviceCount := len(meters) + len(chargers)
	log.Printf("SUCCESS: UDP listener started on port %d for %d devices (%d meters, %d chargers)", 
		port, deviceCount, len(meters), len(chargers))
	log.Printf("INFO: Chargers will accept data in combined JSON or separate packets")
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

		// Process meter data
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

		// Process charger data
		for _, charger := range chargers {
			dc.processChargerPacket(charger, jsonData, remoteAddr.IP.String())
		}
	}
}

func (dc *DataCollector) processChargerPacket(charger UDPChargerConfig, jsonData map[string]interface{}, remoteIP string) {
	dc.mu.Lock()
	defer dc.mu.Unlock()

	partial := dc.partialChargerData[charger.ChargerID]
	if partial == nil {
		partial = &PartialChargerData{}
		dc.partialChargerData[charger.ChargerID] = partial
	}

	updated := false
	fieldsReceived := []string{}

	// Check for power
	if value, ok := jsonData[charger.PowerKey]; ok {
		switch v := value.(type) {
		case float64:
			partial.Power = &v
			updated = true
			fieldsReceived = append(fieldsReceived, "power")
		case string:
			if f, err := strconv.ParseFloat(v, 64); err == nil {
				partial.Power = &f
				updated = true
				fieldsReceived = append(fieldsReceived, "power")
			}
		}
	}

	// Check for state
	if value, ok := jsonData[charger.StateKey]; ok {
		var stateStr string
		switch v := value.(type) {
		case string:
			stateStr = v
		case float64:
			stateStr = fmt.Sprintf("%.0f", v)
		}
		if stateStr != "" {
			partial.State = &stateStr
			updated = true
			fieldsReceived = append(fieldsReceived, "state")
		}
	}

	// Check for user_id
	if value, ok := jsonData[charger.UserIDKey]; ok {
		var userStr string
		switch v := value.(type) {
		case string:
			userStr = v
		case float64:
			userStr = fmt.Sprintf("%.0f", v)
		}
		if userStr != "" {
			partial.UserID = &userStr
			updated = true
			fieldsReceived = append(fieldsReceived, "user_id")
		}
	}

	// Check for mode
	if value, ok := jsonData[charger.ModeKey]; ok {
		var modeStr string
		switch v := value.(type) {
		case string:
			modeStr = v
		case float64:
			modeStr = fmt.Sprintf("%.0f", v)
		}
		if modeStr != "" {
			partial.Mode = &modeStr
			updated = true
			fieldsReceived = append(fieldsReceived, "mode")
		}
	}

	if updated {
		partial.LastUpdate = time.Now()
		
		if len(fieldsReceived) > 0 {
			log.Printf("DEBUG: Charger '%s' received fields [%s] from %s", 
				charger.Name, strings.Join(fieldsReceived, ", "), remoteIP)
		}

		// Check if we have all 4 fields
		if partial.Power != nil && partial.State != nil && partial.UserID != nil && partial.Mode != nil {
			completeData := ChargerData{
				Power:  *partial.Power,
				State:  *partial.State,
				UserID: *partial.UserID,
				Mode:   *partial.Mode,
			}
			
			dc.udpChargerBuffers[charger.ChargerID] = completeData
			
			log.Printf("✅ Complete charger data buffered for '%s': Power=%.4f kWh, State=%s, User=%s, Mode=%s", 
				charger.Name, completeData.Power, completeData.State, completeData.UserID, completeData.Mode)
			
			// Reset partial data for next cycle
			dc.partialChargerData[charger.ChargerID] = &PartialChargerData{
				LastUpdate: time.Now(),
			}
		} else {
			missing := []string{}
			if partial.Power == nil {
				missing = append(missing, "power")
			}
			if partial.State == nil {
				missing = append(missing, "state")
			}
			if partial.UserID == nil {
				missing = append(missing, "user_id")
			}
			if partial.Mode == nil {
				missing = append(missing, "mode")
			}
			log.Printf("DEBUG: Charger '%s' waiting for fields: [%s]", 
				charger.Name, strings.Join(missing, ", "))
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

// FIXED: Save UDP data with interpolation for missing intervals
func (dc *DataCollector) saveBufferedUDPData() {
	dc.mu.Lock()
	defer dc.mu.Unlock()

	currentTime := roundToQuarterHour(time.Now())
	log.Printf("Saving buffered data at 15-minute interval: %s", currentTime.Format("15:04:05"))

	metersWithData := make(map[int]bool)

	// Save meter data with interpolation
	for meterID, reading := range dc.udpMeterBuffers {
		if reading > 0 {
			// Get last reading
			var lastReading float64
			var lastTime time.Time
			err := dc.db.QueryRow(`
				SELECT power_kwh, reading_time FROM meter_readings 
				WHERE meter_id = ? 
				ORDER BY reading_time DESC LIMIT 1
			`, meterID).Scan(&lastReading, &lastTime)

			if err == nil {
				// Interpolate missing intervals
				interpolated := interpolateReadings(lastTime, lastReading, currentTime, reading)
				
				log.Printf("Meter ID %d: Interpolating %d missing intervals between %s (%.2f kWh) and %s (%.2f kWh)", 
					meterID, len(interpolated), lastTime.Format("15:04"), lastReading, 
					currentTime.Format("15:04"), reading)
				
				// Save interpolated points
				for _, point := range interpolated {
					consumption := point.value - lastReading
					if consumption < 0 {
						consumption = 0
					}
					
					_, err := dc.db.Exec(`
						INSERT INTO meter_readings (meter_id, reading_time, power_kwh, consumption_kwh)
						VALUES (?, ?, ?, ?)
					`, meterID, point.time, point.value, consumption)
					
					if err == nil {
						log.Printf("  Interpolated: %s -> %.2f kWh (consumption: %.2f kWh)", 
							point.time.Format("15:04"), point.value, consumption)
					}
					
					lastReading = point.value
				}
			}

			// Save current reading
			consumption := reading - lastReading
			if consumption < 0 {
				consumption = reading
			}

			_, err = dc.db.Exec(`
				INSERT INTO meter_readings (meter_id, reading_time, power_kwh, consumption_kwh)
				VALUES (?, ?, ?, ?)
			`, meterID, currentTime, reading, consumption)

			if err == nil {
				dc.db.Exec(`
					UPDATE meters 
					SET last_reading = ?, last_reading_time = ?
					WHERE id = ?
				`, reading, currentTime, meterID)

				log.Printf("SUCCESS: UDP meter data saved for meter ID %d: %.2f kWh (consumption: %.2f kWh)", 
					meterID, reading, consumption)
				dc.logToDatabase("UDP Meter Data Saved", 
					fmt.Sprintf("Meter ID: %d, Reading: %.2f kWh, Consumption: %.2f kWh", meterID, reading, consumption))
			} else {
				log.Printf("ERROR: Failed to save UDP meter data for meter ID %d: %v", meterID, err)
			}
			metersWithData[meterID] = true
		}
	}

	// Save charger data with interpolation
	log.Printf("Processing %d chargers in buffer", len(dc.udpChargerBuffers))
	for chargerID, data := range dc.udpChargerBuffers {
		// Validate all required fields are present
		if data.UserID == "" || data.State == "" || data.Mode == "" {
			log.Printf("WARNING: Incomplete charger data for charger ID %d (user=%s, state=%s, mode=%s) - skipping",
				chargerID, data.UserID, data.State, data.Mode)
			continue
		}

		// Get last reading for this charger and user
		var lastPower float64
		var lastTime time.Time
		err := dc.db.QueryRow(`
			SELECT power_kwh, session_time FROM charger_sessions 
			WHERE charger_id = ? AND user_id = ?
			ORDER BY session_time DESC LIMIT 1
		`, chargerID, data.UserID).Scan(&lastPower, &lastTime)

		if err == nil {
			// Interpolate missing intervals
			interpolated := interpolateReadings(lastTime, lastPower, currentTime, data.Power)
			
			log.Printf("Charger ID %d (User %s): Interpolating %d missing intervals between %s (%.4f kWh) and %s (%.4f kWh)", 
				chargerID, data.UserID, len(interpolated), lastTime.Format("15:04"), lastPower, 
				currentTime.Format("15:04"), data.Power)
			
			// Save interpolated points
			for _, point := range interpolated {
				_, err := dc.db.Exec(`
					INSERT INTO charger_sessions (charger_id, user_id, session_time, power_kwh, mode, state)
					VALUES (?, ?, ?, ?, ?, ?)
				`, chargerID, data.UserID, point.time, point.value, data.Mode, data.State)
				
				if err == nil {
					log.Printf("  Interpolated: %s -> %.4f kWh", point.time.Format("15:04"), point.value)
				}
			}
		}

		// Save current reading
		_, err = dc.db.Exec(`
			INSERT INTO charger_sessions (charger_id, user_id, session_time, power_kwh, mode, state)
			VALUES (?, ?, ?, ?, ?, ?)
		`, chargerID, data.UserID, currentTime, data.Power, data.Mode, data.State)

		if err == nil {
			log.Printf("✅ SUCCESS: Charger data saved - ID=%d, Power=%.4f kWh, User=%s, Mode=%s, State=%s, Time=%s", 
				chargerID, data.Power, data.UserID, data.Mode, data.State, currentTime.Format("15:04:05"))
			dc.logToDatabase("UDP Charger Data Saved", 
				fmt.Sprintf("Charger ID: %d, Power: %.4f kWh, User: %s, Mode: %s, State: %s", 
					chargerID, data.Power, data.UserID, data.Mode, data.State))
		} else {
			log.Printf("❌ ERROR: Failed to save charger data for charger ID %d: %v", chargerID, err)
			dc.logToDatabase("Charger Save Error", fmt.Sprintf("Charger ID: %d, Error: %v", chargerID, err))
		}
	}
	
	log.Printf("Charger buffer processing complete")
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
	currentTime := roundToQuarterHour(time.Now())

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
			// Get last reading and interpolate
			var lastReading float64
			var lastTime time.Time
			err := dc.db.QueryRow(`
				SELECT power_kwh, reading_time FROM meter_readings 
				WHERE meter_id = ? 
				ORDER BY reading_time DESC LIMIT 1
			`, id).Scan(&lastReading, &lastTime)

			if err == nil {
				// Interpolate missing intervals
				interpolated := interpolateReadings(lastTime, lastReading, currentTime, reading)
				
				log.Printf("Meter '%s': Interpolating %d missing intervals", name, len(interpolated))
				
				// Save interpolated points
				for _, point := range interpolated {
					consumption := point.value - lastReading
					if consumption < 0 {
						consumption = 0
					}
					
					dc.db.Exec(`
						INSERT INTO meter_readings (meter_id, reading_time, power_kwh, consumption_kwh)
						VALUES (?, ?, ?, ?)
					`, id, point.time, point.value, consumption)
					
					lastReading = point.value
				}
			}

			// Save current reading
			consumption := reading - lastReading
			if consumption < 0 {
				consumption = reading
			}

			_, err = dc.db.Exec(`
				INSERT INTO meter_readings (meter_id, reading_time, power_kwh, consumption_kwh)
				VALUES (?, ?, ?, ?)
			`, id, currentTime, reading, consumption)

			if err != nil {
				log.Printf("ERROR: Failed to save reading for meter '%s': %v", name, err)
				dc.logToDatabase("Save Error", fmt.Sprintf("Meter: %s, Error: %v", name, err))
			} else {
				dc.db.Exec(`
					UPDATE meters 
					SET last_reading = ?, last_reading_time = ?
					WHERE id = ?
				`, reading, currentTime, id)

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
	currentTime := roundToQuarterHour(time.Now())

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

		if userID != "" && mode != "" && state != "" {
			// Get last reading and interpolate
			var lastPower float64
			var lastTime time.Time
			err := dc.db.QueryRow(`
				SELECT power_kwh, session_time FROM charger_sessions 
				WHERE charger_id = ? AND user_id = ?
				ORDER BY session_time DESC LIMIT 1
			`, id, userID).Scan(&lastPower, &lastTime)

			if err == nil {
				// Interpolate missing intervals
				interpolated := interpolateReadings(lastTime, lastPower, currentTime, power)
				
				log.Printf("Charger '%s': Interpolating %d missing intervals", name, len(interpolated))
				
				// Save interpolated points
				for _, point := range interpolated {
					dc.db.Exec(`
						INSERT INTO charger_sessions (charger_id, user_id, session_time, power_kwh, mode, state)
						VALUES (?, ?, ?, ?, ?, ?)
					`, id, userID, point.time, point.value, mode, state)
				}
			}

			// Save current reading
			_, err = dc.db.Exec(`
				INSERT INTO charger_sessions (charger_id, user_id, session_time, power_kwh, mode, state)
				VALUES (?, ?, ?, ?, ?, ?)
			`, id, userID, currentTime, power, mode, state)

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