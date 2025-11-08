package services

import (
	"database/sql"
	"log"
	"sync"
	"time"
)

// DataCollector is the main coordinator that manages all specialized collectors
// and handles the 15-minute data collection cycle
type DataCollector struct {
	db                 *sql.DB
	loxoneCollector    *LoxoneCollector
	modbusCollector    *ModbusCollector
	udpCollector       *UDPCollector
	mqttCollector      *MQTTCollector
	mu                 sync.Mutex
	lastCollection     time.Time
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

func NewDataCollector(db *sql.DB) *DataCollector {
	dc := &DataCollector{
		db: db,
	}
	
	// Initialize all specialized collectors
	dc.loxoneCollector = NewLoxoneCollector(db)
	dc.modbusCollector = NewModbusCollector(db)
	dc.udpCollector = NewUDPCollector(db)
	dc.mqttCollector = NewMQTTCollector(db)
	
	return dc
}

func (dc *DataCollector) Start() {
	log.Println("===================================")
	log.Println("ZEV Data Collector Starting")
	log.Println("Collection Mode: Multi-Collector Architecture")
	log.Println("  - Loxone WebSocket (real-time, independent)")
	log.Println("  - Modbus TCP (coordinated parallel polling)")
	log.Println("  - UDP Monitoring (continuous listening)")
	log.Println("  - MQTT Broker (flexible pub/sub messaging)")
	log.Println("Collection Interval: 15 minutes (fixed at :00, :15, :30, :45)")
	log.Println("===================================")

	// Start all specialized collectors
	go dc.loxoneCollector.Start()
	go dc.modbusCollector.Start()
	go dc.udpCollector.Start()
	go dc.mqttCollector.Start()
	
	dc.logSystemStatus()
	
	// Wait until the next exact 15-minute interval
	now := time.Now()
	nextCollection := getNextQuarterHour(now)
	waitDuration := nextCollection.Sub(now)
	
	log.Printf(">>> Current time: %s <<<", now.Format("15:04:05"))
	log.Printf(">>> WAITING UNTIL NEXT 15-MINUTE INTERVAL: %s <<<", nextCollection.Format("15:04:05"))
	log.Printf(">>> Time to wait: %.0f seconds <<<", waitDuration.Seconds())
	
	time.Sleep(waitDuration)
	
	log.Println(">>> INITIAL DATA COLLECTION AT EXACT INTERVAL <<<")
	dc.collectAndSaveAllData()
	log.Println(">>> INITIAL DATA COLLECTION COMPLETED <<<")

	// Start 15-minute collection ticker
	ticker := time.NewTicker(15 * time.Minute)
	defer ticker.Stop()

	nextRun := getNextQuarterHour(time.Now())
	log.Printf(">>> Next data collection at %s <<<", nextRun.Format("15:04:05"))

	for range ticker.C {
		currentTime := time.Now()
		log.Printf(">>> 15-minute interval reached at %s - starting collection <<<", currentTime.Format("15:04:05"))
		dc.collectAndSaveAllData()
		nextRun = getNextQuarterHour(time.Now())
		log.Printf(">>> Next data collection at %s <<<", nextRun.Format("15:04:05"))
	}
}

func (dc *DataCollector) Stop() {
	log.Println("Stopping Data Collector...")
	
	// Stop all specialized collectors
	if dc.loxoneCollector != nil {
		dc.loxoneCollector.Stop()
	}
	
	if dc.modbusCollector != nil {
		dc.modbusCollector.Stop()
	}
	
	if dc.udpCollector != nil {
		dc.udpCollector.Stop()
	}
	
	if dc.mqttCollector != nil {
		dc.mqttCollector.Stop()
	}
	
	log.Println("Data Collector stopped")
}

func (dc *DataCollector) RestartUDPListeners() {
	log.Println("=== Restarting All Collectors ===")
	
	dc.loxoneCollector.RestartConnections()
	dc.modbusCollector.RestartConnections()
	dc.udpCollector.RestartConnections()
	dc.mqttCollector.RestartConnections()
	
	log.Println("=== All Collectors Restarted ===")
	dc.logToDatabase("Collectors Restarted", "All collectors (Loxone, Modbus, UDP, MQTT) have been reinitialized")
}

func (dc *DataCollector) logSystemStatus() {
	var activeMeters, totalMeters, activeChargers, totalChargers int
	dc.db.QueryRow("SELECT COUNT(*) FROM meters WHERE is_active = 1").Scan(&activeMeters)
	dc.db.QueryRow("SELECT COUNT(*) FROM meters").Scan(&totalMeters)
	dc.db.QueryRow("SELECT COUNT(*) FROM chargers WHERE is_active = 1").Scan(&activeChargers)
	dc.db.QueryRow("SELECT COUNT(*) FROM chargers").Scan(&totalChargers)

	var loxoneMeterCount, modbusMeterCount, udpMeterCount, mqttMeterCount int
	var loxoneChargerCount, udpChargerCount, mqttChargerCount int
	
	dc.db.QueryRow("SELECT COUNT(*) FROM meters WHERE is_active = 1 AND connection_type = 'loxone_api'").Scan(&loxoneMeterCount)
	dc.db.QueryRow("SELECT COUNT(*) FROM meters WHERE is_active = 1 AND connection_type = 'modbus_tcp'").Scan(&modbusMeterCount)
	dc.db.QueryRow("SELECT COUNT(*) FROM meters WHERE is_active = 1 AND connection_type = 'udp'").Scan(&udpMeterCount)
	dc.db.QueryRow("SELECT COUNT(*) FROM meters WHERE is_active = 1 AND connection_type = 'mqtt'").Scan(&mqttMeterCount)
	
	dc.db.QueryRow("SELECT COUNT(*) FROM chargers WHERE is_active = 1 AND connection_type = 'loxone_api'").Scan(&loxoneChargerCount)
	dc.db.QueryRow("SELECT COUNT(*) FROM chargers WHERE is_active = 1 AND connection_type = 'udp'").Scan(&udpChargerCount)
	dc.db.QueryRow("SELECT COUNT(*) FROM chargers WHERE is_active = 1 AND connection_type = 'mqtt'").Scan(&mqttChargerCount)

	log.Printf("System Status: %d/%d meters active, %d/%d chargers active", activeMeters, totalMeters, activeChargers, totalChargers)
	log.Printf("  - Loxone API: %d meters, %d chargers (WebSocket real-time)", loxoneMeterCount, loxoneChargerCount)
	log.Printf("  - Modbus TCP: %d meters (coordinated polling)", modbusMeterCount)
	log.Printf("  - UDP: %d meters, %d chargers (continuous listening)", udpMeterCount, udpChargerCount)
	log.Printf("  - MQTT: %d meters, %d chargers (pub/sub messaging)", mqttMeterCount, mqttChargerCount)
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

	// Get status from all collectors
	loxoneStatus := dc.loxoneCollector.GetConnectionStatus()
	modbusStatus := dc.modbusCollector.GetConnectionStatus()
	udpStatus := dc.udpCollector.GetConnectionStatus()
	mqttStatus := dc.mqttCollector.GetConnectionStatus()

	result := map[string]interface{}{
		"active_meters":           activeMeters,
		"total_meters":            totalMeters,
		"active_chargers":         activeChargers,
		"total_chargers":          totalChargers,
		"last_collection":         dc.lastCollection.Format("2006-01-02 15:04:05"),
		"next_collection":         nextCollection.Format("2006-01-02 15:04:05"),
		"next_collection_minutes": minutesToNext,
		"recent_errors":           recentErrors,
		"collection_mode":         "Multi-Collector: Loxone (independent) + Modbus (coordinated) + UDP (continuous) + MQTT (pub/sub)",
	}
   
	// Merge collector statuses
	for key, value := range loxoneStatus {
		result[key] = value
	}
	for key, value := range modbusStatus {
		result[key] = value
	}
	for key, value := range udpStatus {
		result[key] = value
	}
	for key, value := range mqttStatus {
		result[key] = value
	}
	for key, value := range udpStatus {
		result[key] = value
	}
	
	return result
}

func (dc *DataCollector) collectAndSaveAllData() {
	dc.lastCollection = time.Now()
	log.Println("========================================")
	log.Printf("Starting coordinated data collection at %s", dc.lastCollection.Format("2006-01-02 15:04:05"))
	log.Println("========================================")
	
	dc.logToDatabase("Data Collection Started", "15-minute collection cycle initiated")

	// Collect meters and chargers in parallel using goroutines
	wg := sync.WaitGroup{}
	
	wg.Add(1)
	go func() {
		defer wg.Done()
		dc.collectAndSaveMeters()
	}()
	
	wg.Add(1)
	go func() {
		defer wg.Done()
		dc.collectAndSaveChargers()
	}()
	
	// Wait for both to complete
	wg.Wait()

	log.Println("========================================")
	log.Println("Data collection cycle completed")
	log.Println("========================================")
	
	dc.logToDatabase("Data Collection Completed", "All active devices collected and saved")
}

func (dc *DataCollector) collectAndSaveMeters() {
	log.Println("--- METER COLLECTION STARTED ---")
	
	rows, err := dc.db.Query(`
		SELECT id, name, meter_type, connection_type
		FROM meters WHERE is_active = 1
	`)
	if err != nil {
		log.Printf("ERROR: Failed to query meters: %v", err)
		return
	}
	defer rows.Close()

	currentTime := roundToQuarterHour(time.Now())
	successCount := 0
	totalCount := 0

	// Separate meters by type for optimized collection
	modbusMeters := []int{}
	udpMeters := []int{}
	mqttMeters := []int{}
	
	meterInfo := make(map[int]struct{
		name string
		meterType string
		connectionType string
	})

	for rows.Next() {
		var id int
		var name, meterType, connectionType string

		if err := rows.Scan(&id, &name, &meterType, &connectionType); err != nil {
			continue
		}

		totalCount++
		meterInfo[id] = struct {
			name string
			meterType string
			connectionType string
		}{name, meterType, connectionType}

		switch connectionType {
		case "loxone_api":
			// Loxone handles its own data collection via WebSocket
			log.Printf("[%d/%d] Meter '%s': Loxone API - collected independently via WebSocket", 
				totalCount, totalCount, name)
			continue
			
		case "modbus_tcp":
			modbusMeters = append(modbusMeters, id)
			
		case "udp":
			udpMeters = append(udpMeters, id)
			
		case "mqtt":
			mqttMeters = append(mqttMeters, id)
		}
	}

	// PARALLEL COLLECTION: Read all Modbus meters at once
	if len(modbusMeters) > 0 {
		log.Printf("Reading %d Modbus meters in parallel...", len(modbusMeters))
		modbusReadings := dc.modbusCollector.ReadAllMeters()
		
		for meterID, reading := range modbusReadings {
			info := meterInfo[meterID]
			if reading > 0 {
				if err := dc.saveMeterReading(meterID, info.name, currentTime, reading); err != nil {
					log.Printf("ERROR: Failed to save Modbus meter '%s': %v", info.name, err)
				} else {
					successCount++
				}
			}
		}
	}

	// UDP meters: Get buffered readings
	for _, meterID := range udpMeters {
		info := meterInfo[meterID]
		reading, hasReading := dc.udpCollector.GetMeterReading(meterID)
		
		if !hasReading || reading == 0 {
			log.Printf("WARNING: No UDP data for meter '%s'", info.name)
			continue
		}
		
		if err := dc.saveMeterReading(meterID, info.name, currentTime, reading); err != nil {
			log.Printf("ERROR: Failed to save UDP meter '%s': %v", info.name, err)
		} else {
			successCount++
		}
	}

	// MQTT meters: Get buffered readings
	for _, meterID := range mqttMeters {
		info := meterInfo[meterID]
		reading, hasReading := dc.mqttCollector.GetMeterReading(meterID)
		
		if !hasReading || reading == 0 {
			log.Printf("WARNING: No MQTT data for meter '%s'", info.name)
			continue
		}
		
		if err := dc.saveMeterReading(meterID, info.name, currentTime, reading); err != nil {
			log.Printf("ERROR: Failed to save MQTT meter '%s': %v", info.name, err)
		} else {
			successCount++
		}
	}

	log.Printf("--- METER COLLECTION COMPLETED: %d/%d successful ---", successCount, totalCount)
}

func (dc *DataCollector) saveMeterReading(meterID int, meterName string, currentTime time.Time, reading float64) error {
	// Get last reading for interpolation
	var lastReading float64
	var lastTime time.Time
	err := dc.db.QueryRow(`
		SELECT power_kwh, reading_time FROM meter_readings 
		WHERE meter_id = ? 
		ORDER BY reading_time DESC LIMIT 1
	`, meterID).Scan(&lastReading, &lastTime)

	var consumption float64
	isFirstReading := false

	if err == nil && !lastTime.IsZero() {
		// Interpolate missing intervals
		interpolated := interpolateReadings(lastTime, lastReading, currentTime, reading)
		
		if len(interpolated) > 0 {
			log.Printf("Meter '%s': Interpolating %d missing intervals", meterName, len(interpolated))
		}
		
		for _, point := range interpolated {
			intervalConsumption := point.value - lastReading
			if intervalConsumption < 0 {
				intervalConsumption = 0
			}
			
			dc.db.Exec(`
				INSERT INTO meter_readings (meter_id, reading_time, power_kwh, consumption_kwh)
				VALUES (?, ?, ?, ?)
			`, meterID, point.time, point.value, intervalConsumption)
			
			lastReading = point.value
		}
		
		// Calculate consumption for current reading
		consumption = reading - lastReading
		if consumption < 0 {
			consumption = 0
		}
	} else {
		// First reading
		log.Printf("Meter '%s': First reading - consumption set to 0", meterName)
		consumption = 0
		isFirstReading = true
	}

	// Save current reading
	_, err = dc.db.Exec(`
		INSERT INTO meter_readings (meter_id, reading_time, power_kwh, consumption_kwh)
		VALUES (?, ?, ?, ?)
	`, meterID, currentTime, reading, consumption)

	if err != nil {
		return err
	}

	// Update meter table
	dc.db.Exec(`
		UPDATE meters 
		SET last_reading = ?, last_reading_time = ?
		WHERE id = ?
	`, reading, currentTime, meterID)

	if isFirstReading {
		log.Printf("SUCCESS: First reading for meter '%s' = %.3f kWh (consumption: 0 kWh)", meterName, reading)
	} else {
		log.Printf("SUCCESS: Saved meter data: '%s' = %.3f kWh (consumption: %.3f kWh)", meterName, reading, consumption)
	}

	return nil
}

func (dc *DataCollector) collectAndSaveChargers() {
	log.Println("--- CHARGER COLLECTION STARTED ---")
	
	rows, err := dc.db.Query(`
		SELECT id, name, brand, connection_type
		FROM chargers WHERE is_active = 1
	`)
	if err != nil {
		log.Printf("ERROR: Failed to query chargers: %v", err)
		return
	}
	defer rows.Close()

	currentTime := roundToQuarterHour(time.Now())
	successCount := 0
	totalCount := 0

	for rows.Next() {
		var id int
		var name, brand, connectionType string

		if err := rows.Scan(&id, &name, &brand, &connectionType); err != nil {
			continue
		}

		totalCount++

		var power float64
		var userID, mode, state string
		var hasData bool

		// Get data from appropriate collector
		switch connectionType {
		case "loxone_api":
			// Loxone handles its own data collection via WebSocket
			log.Printf("[%d/%d] Charger '%s': Loxone API - collected independently via WebSocket", 
				totalCount, totalCount, name)
			continue
			
		case "udp":
			data, exists := dc.udpCollector.GetChargerData(id)
			if !exists {
				log.Printf("[%d/%d] WARNING: No UDP data for charger '%s'", totalCount, totalCount, name)
				continue
			}
			power = data.Power
			userID = data.UserID
			mode = data.Mode
			state = data.State
			hasData = true
			
		case "mqtt":
			data, exists := dc.mqttCollector.GetChargerData(id)
			if !exists {
				log.Printf("[%d/%d] WARNING: No MQTT data for charger '%s'", totalCount, totalCount, name)
				continue
			}
			power = data.Power
			userID = data.UserID
			mode = data.Mode
			state = data.State
			hasData = true
			
		default:
			log.Printf("[%d/%d] WARNING: Unknown connection type '%s' for charger '%s'", 
				totalCount, totalCount, connectionType, name)
			continue
		}

		if hasData && userID != "" && mode != "" && state != "" {
			// Save to database with interpolation
			if err := dc.saveChargerSession(id, name, currentTime, power, userID, mode, state); err != nil {
				log.Printf("ERROR: Failed to save charger session for '%s': %v", name, err)
			} else {
				successCount++
			}
		}
	}

	log.Printf("--- CHARGER COLLECTION COMPLETED: %d/%d successful ---", successCount, totalCount)
}

func (dc *DataCollector) saveChargerSession(chargerID int, chargerName string, currentTime time.Time, power float64, userID, mode, state string) error {
	// Get last reading for interpolation
	var lastPower float64
	var lastTime time.Time
	err := dc.db.QueryRow(`
		SELECT power_kwh, session_time FROM charger_sessions 
		WHERE charger_id = ? AND user_id = ?
		ORDER BY session_time DESC LIMIT 1
	`, chargerID, userID).Scan(&lastPower, &lastTime)

	if err == nil && !lastTime.IsZero() {
		// Interpolate missing intervals
		interpolated := interpolateReadings(lastTime, lastPower, currentTime, power)
		
		if len(interpolated) > 0 {
			log.Printf("Charger '%s': Interpolating %d missing intervals", chargerName, len(interpolated))
		}
		
		for _, point := range interpolated {
			dc.db.Exec(`
				INSERT INTO charger_sessions (charger_id, user_id, session_time, power_kwh, mode, state)
				VALUES (?, ?, ?, ?, ?, ?)
			`, chargerID, userID, point.time, point.value, mode, state)
		}
	} else {
		// First reading for this charger/user combination
		log.Printf("Charger '%s': First reading for user %s", chargerName, userID)
	}

	// Save current session
	_, err = dc.db.Exec(`
		INSERT INTO charger_sessions (charger_id, user_id, session_time, power_kwh, mode, state)
		VALUES (?, ?, ?, ?, ?, ?)
	`, chargerID, userID, currentTime, power, mode, state)

	if err != nil {
		return err
	}

	log.Printf("SUCCESS: Saved charger data: '%s' = %.3f kWh (user: %s, mode: %s)", 
		chargerName, power, userID, mode)

	return nil
}

func (dc *DataCollector) logToDatabase(action, details string) {
	dc.db.Exec(`
		INSERT INTO admin_logs (action, details, ip_address)
		VALUES (?, ?, 'system')
	`, action, details)
}