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
	db                *sql.DB
	udpListeners      map[int]*net.UDPConn
	udpMeterBuffers   map[int]float64
	udpChargerBuffers map[int]ChargerData
	partialChargerData map[int]*PartialChargerData
	loxoneCollector   *LoxoneCollector
	mu                sync.Mutex
	lastCollection    time.Time
	udpPorts          []int
	restartChannel    chan bool
	httpClient        *http.Client
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

// Loxone JSON response structure
type LoxoneResponse struct {
	LL LoxoneData `json:"LL"`
}

type LoxoneData struct {
	Control string                 `json:"control"`
	Value   string                 `json:"value"`
	Code    string                 `json:"Code"`
	Outputs map[string]LoxoneOutput `json:"-"`
}

type LoxoneOutput struct {
	Name  string      `json:"name"`
	Nr    int         `json:"nr"`
	Value interface{} `json:"value"`
}

// Custom unmarshal to handle dynamic output fields
func (ld *LoxoneData) UnmarshalJSON(data []byte) error {
	type Alias LoxoneData
	aux := &struct {
		*Alias
	}{
		Alias: (*Alias)(ld),
	}
	
	var raw map[string]interface{}
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	
	ld.Outputs = make(map[string]LoxoneOutput)
	
	for key, value := range raw {
		switch key {
		case "control":
			if v, ok := value.(string); ok {
				ld.Control = v
			}
		case "value":
			if v, ok := value.(string); ok {
				ld.Value = v
			}
		case "Code":
			if v, ok := value.(string); ok {
				ld.Code = v
			}
		default:
			if strings.HasPrefix(key, "output") {
				if outputMap, ok := value.(map[string]interface{}); ok {
					output := LoxoneOutput{}
					if name, ok := outputMap["name"].(string); ok {
						output.Name = name
					}
					if nr, ok := outputMap["nr"].(float64); ok {
						output.Nr = int(nr)
					}
					output.Value = outputMap["value"]
					ld.Outputs[key] = output
				}
			}
		}
	}
	
	return nil
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

// Get next 15-minute interval
func getNextQuarterHour(t time.Time) time.Time {
	minutes := t.Minute()
	
	if minutes < 15 {
		return time.Date(t.Year(), t.Month(), t.Day(), t.Hour(), 15, 0, 0, t.Location())
	} else if minutes < 30 {
		return time.Date(t.Year(), t.Month(), t.Day(), t.Hour(), 30, 0, 0, t.Location())
	} else if minutes < 45 {
		return time.Date(t.Year(), t.Month(), t.Day(), t.Hour(), 45, 0, 0, t.Location())
	} else {
		return time.Date(t.Year(), t.Month(), t.Day(), t.Hour()+1, 0, 0, 0, t.Location())
	}
}

// Linear interpolation between two readings
func interpolateReadings(startTime time.Time, startValue float64, endTime time.Time, endValue float64) []struct{time time.Time; value float64} {
	result := []struct{time time.Time; value float64}{}
	
	if endTime.Before(startTime) || endTime.Equal(startTime) {
		return result
	}
	
	currentTime := getNextQuarterHour(startTime)
	totalDuration := endTime.Sub(startTime).Seconds()
	totalValueChange := endValue - startValue
	
	for currentTime.Before(endTime) {
		elapsed := currentTime.Sub(startTime).Seconds()
		ratio := elapsed / totalDuration
		interpolatedValue := startValue + (totalValueChange * ratio)
		
		result = append(result, struct{time time.Time; value float64}{
			time: currentTime,
			value: interpolatedValue,
		})
		
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
	dc := &DataCollector{
		db:                 db,
		udpListeners:       make(map[int]*net.UDPConn),
		udpMeterBuffers:    make(map[int]float64),
		udpChargerBuffers:  make(map[int]ChargerData),
		partialChargerData: make(map[int]*PartialChargerData),
		udpPorts:           []int{},
		restartChannel:     make(chan bool, 1),
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
	
	// Initialize Loxone collector
	dc.loxoneCollector = NewLoxoneCollector(db)
	
	return dc
}

func (dc *DataCollector) RestartUDPListeners() {
	log.Println("=== Restarting UDP Listeners and Loxone Connections ===")
	
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
	dc.loxoneCollector.RestartConnections()
	
	log.Println("=== UDP Listeners and Loxone Connections Restarted ===")
	dc.logToDatabase("Listeners Restarted", "All UDP listeners and Loxone connections have been reinitialized")
}

func (dc *DataCollector) Start() {
	log.Println("===================================")
	log.Println("ZEV Data Collector Starting")
	log.Println("Collection Mode: HTTP Polling (primary) + UDP Monitoring (backup) + Loxone WebSocket (real-time)")
	log.Println("Collection Interval: 15 minutes (fixed at :00, :15, :30, :45)")
	log.Println("===================================")

	dc.initializeUDPListeners()
	
	// Start Loxone WebSocket collector
	go dc.loxoneCollector.Start()
	
	dc.logSystemStatus()
	
	// FIXED: Wait until the next exact 15-minute interval
	now := time.Now()
	nextCollection := getNextQuarterHour(now)
	waitDuration := nextCollection.Sub(now)
	
	log.Printf(">>> Current time: %s <<<", now.Format("15:04:05"))
	log.Printf(">>> WAITING UNTIL NEXT 15-MINUTE INTERVAL: %s <<<", nextCollection.Format("15:04:05"))
	log.Printf(">>> Time to wait: %.0f seconds <<<", waitDuration.Seconds())
	
	time.Sleep(waitDuration)
	
	log.Println(">>> INITIAL DATA COLLECTION AT EXACT INTERVAL <<<")
	dc.collectAllData()
	log.Println(">>> INITIAL DATA COLLECTION COMPLETED <<<")

	go dc.cleanupStalePartialData()

	// FIXED: Use a ticker that fires every 15 minutes, but we're already aligned
	ticker := time.NewTicker(15 * time.Minute)
	defer ticker.Stop()

	nextRun := getNextQuarterHour(time.Now())
	log.Printf(">>> Next data collection at %s <<<", nextRun.Format("15:04:05"))

	for {
		select {
		case <-ticker.C:
			currentTime := time.Now()
			log.Printf(">>> 15-minute interval reached at %s - starting collection <<<", currentTime.Format("15:04:05"))
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
		log.Printf("UDP Listeners active on ports: %v (for real-time monitoring)", dc.udpPorts)
	}
	log.Printf("HTTP polling will be used for precise 15-minute readings")
}

func (dc *DataCollector) GetDebugInfo() map[string]interface{} {
	var activeMeters, totalMeters, activeChargers, totalChargers, recentErrors int
	dc.db.QueryRow("SELECT COUNT(*) FROM meters WHERE is_active = 1").Scan(&activeMeters)
	dc.db.QueryRow("SELECT COUNT(*) FROM meters").Scan(&totalMeters)
	dc.db.QueryRow("SELECT COUNT(*) FROM chargers WHERE is_active = 1").Scan(&activeChargers)
	dc.db.QueryRow("SELECT COUNT(*) FROM chargers").Scan(&totalChargers)
	dc.db.QueryRow(`SELECT COUNT(*) FROM admin_logs WHERE (action LIKE '%error%' 
		OR action LIKE '%failed%') AND created_at > datetime('now', '-24 hours')`).Scan(&recentErrors)

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

	// Get Loxone connection status
	loxoneStatus := dc.loxoneCollector.GetConnectionStatus()

	return map[string]interface{}{
		"active_meters":           activeMeters,
		"total_meters":            totalMeters,
		"active_chargers":         activeChargers,
		"total_chargers":          totalChargers,
		"last_collection":         dc.lastCollection.Format("2006-01-02 15:04:05"),
		"next_collection":         nextCollection.Format("2006-01-02 15:04:05"),
		"next_collection_minutes": minutesToNext,
		"udp_listeners":           dc.udpPorts,
		"loxone_connections":      loxoneStatus,
		"recent_errors":           recentErrors,
		"charger_buffers":         chargerBufferStatus,
		"partial_charger_data":    partialStatus,
		"collection_mode":         "HTTP Polling + UDP Monitoring + Loxone WebSocket",
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
	log.Printf("SUCCESS: UDP listener started on port %d for %d devices (MONITORING MODE)", 
		port, deviceCount)
	log.Printf("NOTE: UDP is for real-time monitoring. HTTP polling will be used for precise readings.")
	dc.logToDatabase("UDP Listener Started", 
		fmt.Sprintf("Port: %d, Meters: %d, Chargers: %d (monitoring mode)", port, len(meters), len(chargers)))

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

		// Process meter data (for monitoring only)
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
					log.Printf("DEBUG: UDP monitoring data for meter '%s': %.2f kWh from %s", 
						meter.Name, reading, remoteAddr.IP)
				}
			}
		}

		// Process charger data (for monitoring only)
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
		
		if partial.Power != nil && partial.State != nil && partial.UserID != nil && partial.Mode != nil {
			completeData := ChargerData{
				Power:  *partial.Power,
				State:  *partial.State,
				UserID: *partial.UserID,
				Mode:   *partial.Mode,
			}
			
			dc.udpChargerBuffers[charger.ChargerID] = completeData
			
			log.Printf("DEBUG: UDP monitoring data for charger '%s': Power=%.4f kWh, User=%s", 
				charger.Name, completeData.Power, completeData.UserID)
			
			dc.partialChargerData[charger.ChargerID] = &PartialChargerData{
				LastUpdate: time.Now(),
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

	// Collect via HTTP for all devices (primary method)
	dc.collectMeterDataViaHTTP()
	dc.collectChargerDataViaHTTP()
	
	// Keep UDP buffers as backup/fallback
	dc.saveBufferedUDPDataAsBackup()

	log.Println("========================================")
	log.Println("Data collection cycle completed")
	log.Println("========================================")
	
	dc.logToDatabase("Data Collection Completed", "All active devices polled via HTTP")
}

// Collect meter data via HTTP polling at exact 15-minute intervals
func (dc *DataCollector) collectMeterDataViaHTTP() {
	rows, err := dc.db.Query(`
		SELECT id, name, meter_type, connection_type, connection_config, is_active
		FROM meters WHERE is_active = 1 AND connection_type != 'loxone_api'
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
			continue
		}

		var reading float64
		
		if connectionType == "http" {
			reading = dc.collectLoxoneHTTPData(name, config)
		} else if connectionType == "udp" {
			// Fallback to UDP buffer
			log.Printf("Meter '%s': UDP device - using buffered value", name)
			dc.mu.Lock()
			reading = dc.udpMeterBuffers[id]
			dc.mu.Unlock()
		} else if connectionType == "modbus_tcp" {
			reading = dc.collectModbusData(name, config)
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
				interpolated := interpolateReadings(lastTime, lastReading, currentTime, reading)
				
				if len(interpolated) > 0 {
					log.Printf("Meter '%s': Interpolating %d missing intervals", name, len(interpolated))
				}
				
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
			} else {
				dc.db.Exec(`
					UPDATE meters 
					SET last_reading = ?, last_reading_time = ?
					WHERE id = ?
				`, reading, currentTime, id)

				log.Printf("SUCCESS: Collected meter data: '%s' = %.2f kWh (consumption: %.2f kWh)", name, reading, consumption)
				successCount++
			}
		}
	}

	log.Printf("Meter collection summary: %d/%d successful via HTTP polling", successCount, meterCount)
	
	// Note: Loxone API meters are collected via WebSocket in real-time
	var loxoneCount int
	dc.db.QueryRow("SELECT COUNT(*) FROM meters WHERE is_active = 1 AND connection_type = 'loxone_api'").Scan(&loxoneCount)
	if loxoneCount > 0 {
		log.Printf("Loxone API meters: %d active (collected via WebSocket real-time)", loxoneCount)
	}
}

// Collect charger data via HTTP polling at exact 15-minute intervals
func (dc *DataCollector) collectChargerDataViaHTTP() {
	rows, err := dc.db.Query(`
		SELECT id, name, brand, preset, connection_type, connection_config, is_active
		FROM chargers WHERE is_active = 1
	`)
	if err != nil {
		log.Printf("ERROR: Failed to query chargers: %v", err)
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
			continue
		}

		var power float64
		var userID, mode, state string

		if connectionType == "http" || preset == "weidmuller" {
			power, userID, mode, state = dc.collectWeidmullerData(name, config)
		} else if connectionType == "udp" {
			// Fallback to UDP buffer
			log.Printf("Charger '%s': UDP device - using buffered value", name)
			dc.mu.Lock()
			if data, ok := dc.udpChargerBuffers[id]; ok {
				power = data.Power
				userID = data.UserID
				mode = data.Mode
				state = data.State
			}
			dc.mu.Unlock()
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
				interpolated := interpolateReadings(lastTime, lastPower, currentTime, power)
				
				if len(interpolated) > 0 {
					log.Printf("Charger '%s': Interpolating %d missing intervals", name, len(interpolated))
				}
				
				for _, point := range interpolated {
					dc.db.Exec(`
						INSERT INTO charger_sessions (charger_id, user_id, session_time, power_kwh, mode, state)
						VALUES (?, ?, ?, ?, ?, ?)
					`, id, userID, point.time, point.value, mode, state)
				}
			}

			_, err = dc.db.Exec(`
				INSERT INTO charger_sessions (charger_id, user_id, session_time, power_kwh, mode, state)
				VALUES (?, ?, ?, ?, ?, ?)
			`, id, userID, currentTime, power, mode, state)

			if err != nil {
				log.Printf("ERROR: Failed to save charger session for '%s': %v", name, err)
			} else {
				log.Printf("SUCCESS: Collected charger data: '%s' = %.2f kWh (user: %s, mode: %s)", 
					name, power, userID, mode)
				successCount++
			}
		}
	}

	log.Printf("Charger collection summary: %d/%d successful via HTTP polling", successCount, chargerCount)
}

// UDP buffer save is now backup/fallback only
func (dc *DataCollector) saveBufferedUDPDataAsBackup() {
	dc.mu.Lock()
	defer dc.mu.Unlock()

	log.Printf("Checking UDP buffers for any devices that failed HTTP polling...")
	
	// Only save UDP data for devices that don't have recent HTTP data
	currentTime := roundToQuarterHour(time.Now())
	
	savedCount := 0
	for meterID, reading := range dc.udpMeterBuffers {
		if reading > 0 {
			// Check if we already have data from HTTP
			var count int
			dc.db.QueryRow(`
				SELECT COUNT(*) FROM meter_readings 
				WHERE meter_id = ? AND reading_time = ?
			`, meterID, currentTime).Scan(&count)
			
			if count == 0 {
				log.Printf("Using UDP backup data for meter ID %d: %.2f kWh", meterID, reading)
				
				var lastReading float64
				var lastTime time.Time
				dc.db.QueryRow(`
					SELECT power_kwh, reading_time FROM meter_readings 
					WHERE meter_id = ? 
					ORDER BY reading_time DESC LIMIT 1
				`, meterID).Scan(&lastReading, &lastTime)

				consumption := reading - lastReading
				if consumption < 0 {
					consumption = reading
				}

				dc.db.Exec(`
					INSERT INTO meter_readings (meter_id, reading_time, power_kwh, consumption_kwh)
					VALUES (?, ?, ?, ?)
				`, meterID, currentTime, reading, consumption)
				
				savedCount++
			}
		}
	}
	
	if savedCount > 0 {
		log.Printf("Saved %d meter readings from UDP backup", savedCount)
	} else {
		log.Printf("All devices successfully polled via HTTP - no UDP backup needed")
	}
}

// NEW: Collect data from Loxone via HTTP with authentication
func (dc *DataCollector) collectLoxoneHTTPData(name string, config map[string]interface{}) float64 {
	baseURL, ok := config["http_base_url"].(string)
	if !ok || baseURL == "" {
		log.Printf("ERROR: No base URL configured for meter '%s'", name)
		return 0
	}

	meterID, ok := config["http_meter_id"].(string)
	if !ok || meterID == "" {
		log.Printf("ERROR: No meter ID configured for meter '%s'", name)
		return 0
	}

	username := ""
	if u, ok := config["http_username"].(string); ok {
		username = u
	}

	password := ""
	if p, ok := config["http_password"].(string); ok {
		password = p
	}

	// Build the URL: user:password@baseURL/jdev/sps/io/meterID/all
	var fullURL string
	if username != "" && password != "" {
		// Parse base URL to inject credentials
		baseURL = strings.TrimPrefix(baseURL, "http://")
		baseURL = strings.TrimPrefix(baseURL, "https://")
		fullURL = fmt.Sprintf("http://%s:%s@%s/jdev/sps/io/%s/all", username, password, baseURL, meterID)
	} else {
		// No authentication
		if !strings.HasPrefix(baseURL, "http://") && !strings.HasPrefix(baseURL, "https://") {
			baseURL = "http://" + baseURL
		}
		fullURL = fmt.Sprintf("%s/jdev/sps/io/%s/all", baseURL, meterID)
	}

	log.Printf("DEBUG: Polling Loxone meter '%s' at %s", name, fullURL)

	req, err := http.NewRequest("GET", fullURL, nil)
	if err != nil {
		log.Printf("ERROR: Failed to create request for meter '%s': %v", name, err)
		return 0
	}

	resp, err := dc.httpClient.Do(req)
	if err != nil {
		log.Printf("ERROR: HTTP request failed to %s: %v", fullURL, err)
		dc.logToDatabase("HTTP Request Failed", fmt.Sprintf("Meter: %s, URL: %s, Error: %v", name, fullURL, err))
		return 0
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		log.Printf("ERROR: HTTP request to %s returned status %d", fullURL, resp.StatusCode)
		return 0
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Printf("ERROR: Failed to read HTTP response: %v", err)
		return 0
	}

	log.Printf("DEBUG: Received response from '%s': %s", name, string(body))

	// Parse Loxone JSON response
	var loxoneResp LoxoneResponse
	if err := json.Unmarshal(body, &loxoneResp); err != nil {
		log.Printf("ERROR: Failed to parse Loxone JSON response: %v", err)
		return 0
	}

	// Extract output1.value (the kWh reading)
	if output1, ok := loxoneResp.LL.Outputs["output1"]; ok {
		switch v := output1.Value.(type) {
		case float64:
			log.Printf("SUCCESS: Extracted kWh value from meter '%s': %.3f", name, v)
			return v
		case string:
			if f, err := strconv.ParseFloat(v, 64); err == nil {
				log.Printf("SUCCESS: Extracted kWh value from meter '%s': %.3f", name, f)
				return f
			}
		}
	}

	log.Printf("WARNING: Could not find output1.value in Loxone response for meter '%s'", name)
	return 0
}

func (dc *DataCollector) collectModbusData(name string, config map[string]interface{}) float64 {
	log.Printf("INFO: Modbus TCP collection not yet implemented for meter '%s'", name)
	return 0
}

func (dc *DataCollector) collectWeidmullerData(name string, config map[string]interface{}) (power float64, userID, mode, state string) {
	endpoints := map[string]string{
		"power":   fmt.Sprintf("%v", config["power_endpoint"]),
		"state":   fmt.Sprintf("%v", config["state_endpoint"]),
		"user_id": fmt.Sprintf("%v", config["user_id_endpoint"]),
		"mode":    fmt.Sprintf("%v", config["mode_endpoint"]),
	}

	if resp, err := dc.httpClient.Get(endpoints["power"]); err == nil {
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		var data map[string]interface{}
		if json.Unmarshal(body, &data) == nil {
			if p, ok := data["power_kwh"].(float64); ok {
				power = p
			}
		}
	}

	if resp, err := dc.httpClient.Get(endpoints["state"]); err == nil {
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

	if resp, err := dc.httpClient.Get(endpoints["user_id"]); err == nil {
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

	if resp, err := dc.httpClient.Get(endpoints["mode"]); err == nil {
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