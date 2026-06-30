package services

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/aj9599/zev-billing/backend/services/loxone"
	"github.com/aj9599/zev-billing/backend/services/zaptec"
)

// DataCollector is the main coordinator that manages all specialized collectors
// and handles the 15-minute data collection cycle
type DataCollector struct {
	db                 *sql.DB
	loxoneCollector    *LoxoneCollector
	modbusCollector    *ModbusCollector
	udpCollector       *UDPCollector
	mqttCollector      *MQTTCollector
	smartmeCollector   *SmartMeCollector
	zaptecCollector    *ZaptecCollector
	e3dcCollector      *E3DCCollector
	mu                 sync.Mutex
	lastCollection     time.Time
	isCollecting       bool
	collectingMu       sync.RWMutex
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

// formatDuration formats a duration into a human-readable string
func formatDuration(d time.Duration) string {
	hours := int(d.Hours())
	minutes := int(d.Minutes()) % 60
	seconds := int(d.Seconds()) % 60
	
	if hours > 0 {
		return fmt.Sprintf("%dh %dm", hours, minutes)
	} else if minutes > 0 {
		return fmt.Sprintf("%dm %ds", minutes, seconds)
	}
	return fmt.Sprintf("%ds", seconds)
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
	dc.smartmeCollector = NewSmartMeCollector(db)
	dc.zaptecCollector = NewZaptecCollector(db)
	dc.e3dcCollector = NewE3DCCollector(db)

	return dc
}

func (dc *DataCollector) Start() {
	log.Println("===================================")
	log.Println("ZEV Data Collector Starting")
	log.Println("Collection Mode: Multi-Collector Architecture")
	log.Println("  - Loxone WebSocket (real-time, session-based charger tracking)")
	log.Println("  - Modbus TCP (coordinated parallel polling)")
	log.Println("  - UDP Monitoring (continuous listening)")
	log.Println("  - MQTT Broker (flexible pub/sub messaging)")
	log.Println("  - Smart-me API (cloud-based polling)")
	log.Println("  - Zaptec API (cloud-based, session-based charger tracking)")
	log.Println("  - E3/DC (Modbus EMS metering + RSCP wallbox, energy-integrated)")
	log.Println("Collection Interval: 15 minutes (fixed at :00, :15, :30, :45)")
	log.Println("===================================")

	// Start all specialized collectors
	go dc.loxoneCollector.Start()
	go dc.modbusCollector.Start()
	go dc.udpCollector.Start()
	go dc.mqttCollector.Start()
	go dc.smartmeCollector.Start()
	go dc.zaptecCollector.Start()
	go dc.e3dcCollector.Start()

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
	
	if dc.smartmeCollector != nil {
		dc.smartmeCollector.Stop()
	}
	
	if dc.zaptecCollector != nil {
		dc.zaptecCollector.Stop()
	}

	if dc.e3dcCollector != nil {
		dc.e3dcCollector.Stop()
	}

	log.Println("Data Collector stopped")
}

func (dc *DataCollector) RestartUDPListeners() {
	log.Println("=== Restarting All Collectors ===")
	
	dc.loxoneCollector.RestartConnections()
	dc.modbusCollector.RestartConnections()
	dc.udpCollector.RestartConnections()
	dc.mqttCollector.RestartConnections()
	dc.smartmeCollector.RestartConnections()
	dc.zaptecCollector.RestartConnections()
	dc.e3dcCollector.RestartConnections()

	log.Println("=== All Collectors Restarted ===")
	dc.logToDatabase("Collectors Restarted", "All collectors (Loxone, Modbus, UDP, MQTT, Smart-me, Zaptec, E3/DC) have been reinitialized")
}

// GetSmartMeCollector returns the Smart-me collector instance
func (dc *DataCollector) GetSmartMeCollector() *SmartMeCollector {
	return dc.smartmeCollector
}

// GetBatterySocByMeter returns the latest live state-of-charge (%) for each
// battery meter that reports it, keyed by meter ID. Best-effort and live-only
// (SoC is not persisted), drawn from the Loxone and E3/DC collector status.
func (dc *DataCollector) GetBatterySocByMeter() map[int]float64 {
	out := map[int]float64{}
	if dc.loxoneCollector != nil {
		st := dc.loxoneCollector.GetConnectionStatus()
		if conns, ok := st["loxone_connections"].(map[int]map[string]interface{}); ok {
			for id, m := range conns {
				if v, ok := m["value"].(string); !ok || v != "battery" {
					continue
				}
				if soc, ok := m["soc"].(float64); ok {
					out[id] = soc
				}
			}
		}
	}
	if dc.e3dcCollector != nil {
		st := dc.e3dcCollector.GetConnectionStatus()
		if conns, ok := st["e3dc_meter_connections"].(map[string]interface{}); ok {
			for idStr, raw := range conns {
				m, ok := raw.(map[string]interface{})
				if !ok {
					continue
				}
				if v, _ := m["value"].(string); v != "battery" && v != "bat" {
					continue
				}
				if soc, ok := m["soc"].(float64); ok {
					var id int
					if _, err := fmt.Sscanf(idStr, "%d", &id); err == nil {
						out[id] = soc
					}
				}
			}
		}
	}
	return out
}

// GetZaptecChargerData returns Zaptec charger data for a specific charger
func (dc *DataCollector) GetZaptecChargerData(chargerID int) (*zaptec.ZaptecChargerData, bool) {
	if dc.zaptecCollector == nil {
		return nil, false
	}
	return dc.zaptecCollector.GetChargerData(chargerID)
}

// GetZaptecLiveSession returns Zaptec live session data for a specific charger
func (dc *DataCollector) GetZaptecLiveSession(chargerID int) (*zaptec.ZaptecSessionData, bool) {
	if dc.zaptecCollector == nil {
		return nil, false
	}
	return dc.zaptecCollector.GetLiveSession(chargerID)
}

// SyncZaptecChargeHistoryRange backfills charger_sessions from Zaptec's
// chargehistory API for the given charger and date range. Safe to re-run
// thanks to the unique index on (charger_id, session_time).
func (dc *DataCollector) SyncZaptecChargeHistoryRange(chargerID int, from, to time.Time) (*SyncResult, error) {
	if dc.zaptecCollector == nil {
		return nil, fmt.Errorf("Zaptec collector not initialised")
	}
	return dc.zaptecCollector.SyncChargeHistoryRange(chargerID, from, to)
}

// ========== NEW: LOXONE CHARGER LIVE DATA API ==========

// GetLoxoneChargerLiveData returns Loxone charger live data for a specific charger
func (dc *DataCollector) GetLoxoneChargerLiveData(chargerID int) (*loxone.ChargerLiveData, bool) {
	if dc.loxoneCollector == nil {
		return nil, false
	}
	return dc.loxoneCollector.GetLiveChargerData(chargerID)
}

// GetLoxoneChargerActiveSession returns Loxone charger active session for a specific charger
func (dc *DataCollector) GetLoxoneChargerActiveSession(chargerID int) (*loxone.ActiveChargerSession, bool) {
	if dc.loxoneCollector == nil {
		return nil, false
	}
	return dc.loxoneCollector.GetActiveSession(chargerID)
}

// ChargerLiveStatus represents unified live status for any charger type
type ChargerLiveStatus struct {
	ChargerID        int
	ChargerName      string
	ConnectionType   string  // "loxone_api", "zaptec_api", etc.
	IsOnline         bool
	
	// Current state
	State            string  // "0"=idle, "1"=charging
	StateDescription string
	
	// Live metrics
	CurrentPower_kW   float64
	TotalEnergy_kWh   float64
	SessionEnergy_kWh float64
	
	// Mode info
	Mode             string
	ModeDescription  string
	
	// User info
	UserID           string
	
	// Session timing
	SessionStart     time.Time
	SessionActive    bool
	SessionDuration  string
	
	Timestamp        time.Time
}

// GetChargerLiveStatus returns unified live status for any charger type
func (dc *DataCollector) GetChargerLiveStatus(chargerID int) (*ChargerLiveStatus, bool) {
	// Get connection type from database
	var connectionType string
	err := dc.db.QueryRow("SELECT connection_type FROM chargers WHERE id = ?", chargerID).Scan(&connectionType)
	if err != nil {
		return nil, false
	}
	
	switch connectionType {
	case "loxone_api":
		liveData, ok := dc.GetLoxoneChargerLiveData(chargerID)
		if !ok {
			return nil, false
		}
		
		status := &ChargerLiveStatus{
			ChargerID:         liveData.ChargerID,
			ChargerName:       liveData.ChargerName,
			ConnectionType:    "loxone_api",
			IsOnline:          liveData.IsOnline,
			State:             liveData.State,
			StateDescription:  liveData.StateDescription,
			CurrentPower_kW:   liveData.CurrentPower_kW,
			TotalEnergy_kWh:   liveData.TotalEnergy_kWh,
			SessionEnergy_kWh: liveData.SessionEnergy_kWh,
			Mode:              liveData.Mode,
			ModeDescription:   liveData.ModeDescription,
			UserID:            liveData.UserID,
			SessionStart:      liveData.SessionStart,
			SessionActive:     liveData.ChargingActive,
			Timestamp:         liveData.Timestamp,
		}
		
		if status.SessionActive && !status.SessionStart.IsZero() {
			status.SessionDuration = formatDuration(time.Since(status.SessionStart))
		}
		
		return status, true
		
	case "zaptec_api":
		liveData, ok := dc.GetZaptecChargerData(chargerID)
		if !ok {
			return nil, false
		}
		
		status := &ChargerLiveStatus{
			ChargerID:         chargerID,
			ChargerName:       liveData.ChargerName,
			ConnectionType:    "zaptec_api",
			IsOnline:          liveData.IsOnline,
			State:             liveData.State,
			StateDescription:  liveData.StateDescription,
			CurrentPower_kW:   liveData.CurrentPower_kW,
			TotalEnergy_kWh:   liveData.TotalEnergy_kWh,
			SessionEnergy_kWh: liveData.SessionEnergy_kWh,
			Mode:              liveData.Mode,
			UserID:            liveData.UserID,
			SessionStart:      liveData.SessionStart,
			SessionActive:     liveData.OperatingMode == 3, // 3 = Charging
			Timestamp:         liveData.Timestamp,
		}
		
		if status.SessionActive && !status.SessionStart.IsZero() {
			status.SessionDuration = formatDuration(time.Since(status.SessionStart))
		}
		
		return status, true
		
	default:
		return nil, false
	}
}

// ========== END NEW API ==========

func (dc *DataCollector) logSystemStatus() {
	var activeMeters, totalMeters, activeChargers, totalChargers int
	dc.db.QueryRow("SELECT COUNT(*) FROM meters WHERE is_active = 1").Scan(&activeMeters)
	dc.db.QueryRow("SELECT COUNT(*) FROM meters").Scan(&totalMeters)
	dc.db.QueryRow("SELECT COUNT(*) FROM chargers WHERE is_active = 1").Scan(&activeChargers)
	dc.db.QueryRow("SELECT COUNT(*) FROM chargers").Scan(&totalChargers)

	var loxoneMeterCount, modbusMeterCount, udpMeterCount, mqttMeterCount, smartmeMeterCount int
	var loxoneChargerCount, udpChargerCount, mqttChargerCount, zaptecChargerCount int
	
	dc.db.QueryRow("SELECT COUNT(*) FROM meters WHERE is_active = 1 AND connection_type = 'loxone_api'").Scan(&loxoneMeterCount)
	dc.db.QueryRow("SELECT COUNT(*) FROM meters WHERE is_active = 1 AND connection_type IN ('modbus_tcp', 'kostal')").Scan(&modbusMeterCount)
	dc.db.QueryRow("SELECT COUNT(*) FROM meters WHERE is_active = 1 AND connection_type = 'udp'").Scan(&udpMeterCount)
	dc.db.QueryRow("SELECT COUNT(*) FROM meters WHERE is_active = 1 AND connection_type = 'mqtt'").Scan(&mqttMeterCount)
	dc.db.QueryRow("SELECT COUNT(*) FROM meters WHERE is_active = 1 AND connection_type = 'smartme'").Scan(&smartmeMeterCount)
	
	dc.db.QueryRow("SELECT COUNT(*) FROM chargers WHERE is_active = 1 AND connection_type = 'loxone_api'").Scan(&loxoneChargerCount)
	dc.db.QueryRow("SELECT COUNT(*) FROM chargers WHERE is_active = 1 AND connection_type = 'udp'").Scan(&udpChargerCount)
	dc.db.QueryRow("SELECT COUNT(*) FROM chargers WHERE is_active = 1 AND connection_type = 'mqtt'").Scan(&mqttChargerCount)
	dc.db.QueryRow("SELECT COUNT(*) FROM chargers WHERE is_active = 1 AND connection_type = 'zaptec_api'").Scan(&zaptecChargerCount)

	log.Printf("System Status: %d/%d meters active, %d/%d chargers active", activeMeters, totalMeters, activeChargers, totalChargers)
	log.Printf("  - Loxone API: %d meters, %d chargers (WebSocket, session-based)", loxoneMeterCount, loxoneChargerCount)
	log.Printf("  - Modbus TCP: %d meters (coordinated polling)", modbusMeterCount)
	log.Printf("  - UDP: %d meters, %d chargers (continuous listening)", udpMeterCount, udpChargerCount)
	log.Printf("  - MQTT: %d meters, %d chargers (pub/sub messaging)", mqttMeterCount, mqttChargerCount)
	log.Printf("  - Smart-me: %d meters (cloud API polling)", smartmeMeterCount)
	log.Printf("  - Zaptec: %d chargers (cloud API, session-based)", zaptecChargerCount)
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
	smartmeStatus := dc.smartmeCollector.GetConnectionStatus()
	zaptecStatus := dc.zaptecCollector.GetConnectionStatus()
	e3dcStatus := dc.e3dcCollector.GetConnectionStatus()

	result := map[string]interface{}{
		"active_meters":           activeMeters,
		"total_meters":            totalMeters,
		"active_chargers":         activeChargers,
		"total_chargers":          totalChargers,
		"last_collection":         dc.lastCollection.Format("2006-01-02 15:04:05"),
		"next_collection":         nextCollection.Format("2006-01-02 15:04:05"),
		"next_collection_minutes": minutesToNext,
		"recent_errors":           recentErrors,
		"collection_mode":         "Multi-Collector: Loxone (session-based) + Modbus + UDP + MQTT + Smart-me + Zaptec (session-based)",
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
	for key, value := range smartmeStatus {
		result[key] = value
	}
	for key, value := range zaptecStatus {
		result[key] = value
	}
	for key, value := range e3dcStatus {
		result[key] = value
	}

	return result
}

// GetE3DCChargerData returns live E3/DC wallbox data for a specific charger.
func (dc *DataCollector) GetE3DCChargerData(chargerID int) (*E3DCChargerData, bool) {
	if dc.e3dcCollector == nil {
		return nil, false
	}
	return dc.e3dcCollector.GetChargerData(chargerID)
}

// RescanE3DCBackfill rebuilds reconstructed E3/DC session history for a charger
// within [from, to), without touching device-captured rows.
func (dc *DataCollector) RescanE3DCBackfill(chargerID int, from, to time.Time) (int, int, error) {
	if dc.e3dcCollector == nil {
		return 0, 0, fmt.Errorf("e3dc collector not running")
	}
	return dc.e3dcCollector.RescanBackfill(chargerID, from, to)
}

func (dc *DataCollector) collectAndSaveAllData() {
	dc.collectingMu.Lock()
	dc.isCollecting = true
	dc.collectingMu.Unlock()
	defer func() {
		dc.collectingMu.Lock()
		dc.isCollecting = false
		dc.collectingMu.Unlock()
	}()

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

// IsCollecting returns true if data collection is currently in progress
func (dc *DataCollector) IsCollecting() bool {
	dc.collectingMu.RLock()
	defer dc.collectingMu.RUnlock()
	return dc.isCollecting
}

// IsCollectionWindow returns true if we're within 2 minutes before or 1 minute after a quarter-hour mark
func IsCollectionWindow() bool {
	minute := time.Now().Minute()

	// Check each quarter-hour boundary: :00, :15, :30, :45
	for _, boundary := range []int{0, 15, 30, 45} {
		diff := minute - boundary
		// Handle wrap-around for :00 boundary (58, 59 are before next hour's :00)
		if boundary == 0 && minute >= 58 {
			diff = minute - 60
		}
		// Block from 2 min before through 1 min after each boundary
		if diff >= -2 && diff <= 1 {
			return true
		}
	}
	return false
}

// WaitForSafeUpdateWindow blocks until collection is done and we're outside the collection window.
// Returns a log function for status updates. Times out after 5 minutes.
func (dc *DataCollector) WaitForSafeUpdateWindow(statusFn func(string)) bool {
	deadline := time.After(5 * time.Minute)
	for {
		select {
		case <-deadline:
			statusFn("Timeout waiting for safe update window")
			return false
		default:
		}

		if dc.IsCollecting() {
			statusFn("Waiting for data collection to finish...")
			time.Sleep(5 * time.Second)
			continue
		}
		if IsCollectionWindow() {
			// Find which quarter-hour boundary we're near and compute when the window ends
			now := time.Now()
			minute := now.Minute()
			var nearestBoundary int
			if minute >= 58 || minute <= 1 {
				nearestBoundary = 0
			} else if minute >= 13 && minute <= 16 {
				nearestBoundary = 15
			} else if minute >= 28 && minute <= 31 {
				nearestBoundary = 30
			} else {
				nearestBoundary = 45
			}
			// Window ends at boundary + 2 minutes (1 minute after = boundary+1, so safe at boundary+2)
			windowEnd := time.Date(now.Year(), now.Month(), now.Day(), now.Hour(), nearestBoundary, 0, 0, now.Location())
			if nearestBoundary == 0 && minute >= 58 {
				windowEnd = windowEnd.Add(1 * time.Hour)
			}
			windowEnd = windowEnd.Add(2 * time.Minute)
			statusFn(fmt.Sprintf("Collection window active, starting update at %s...", windowEnd.Format("15:04")))
			time.Sleep(5 * time.Second)
			continue
		}
		return true
	}
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
	smartmeMeters := []int{}
	e3dcMeters := []int{}
	virtualMeters := []int{}

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
			
		case "modbus_tcp", "kostal":
			// Kostal inverters are read over Modbus TCP by the same collector.
			modbusMeters = append(modbusMeters, id)

		case "udp":
			udpMeters = append(udpMeters, id)
			
		case "mqtt":
			mqttMeters = append(mqttMeters, id)
			
		case "smartme":
			smartmeMeters = append(smartmeMeters, id)

		case "e3dc":
			e3dcMeters = append(e3dcMeters, id)

		case "virtual":
			// Computed meters are derived from other meters' readings; they are
			// processed last so their sources are already updated this cycle.
			virtualMeters = append(virtualMeters, id)
		}
	}

	// PARALLEL COLLECTION: Read all Modbus meters at once
	if len(modbusMeters) > 0 {
		log.Printf("Reading %d Modbus meters in parallel...", len(modbusMeters))
		modbusReadings := dc.modbusCollector.ReadAllMeters()
		
		for meterID, readings := range modbusReadings {
			info := meterInfo[meterID]
			importVal, exportVal := readings.Import, readings.Export
			// Solar meters track production in the EXPORT column (same convention
			// as the E3/DC PV integration, and what billing reads as solar
			// production). A single-register source like a Kostal inverter
			// reports its total yield as its only value, so move it into export.
			if info.meterType == "solar_meter" && exportVal == 0 && importVal > 0 {
				exportVal = importVal
				importVal = 0
			}
			if importVal > 0 || exportVal > 0 {
				if err := dc.saveMeterReading(meterID, info.name, currentTime, importVal, exportVal); err != nil {
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
		
		if err := dc.saveMeterReading(meterID, info.name, currentTime, reading, 0); err != nil {
			log.Printf("ERROR: Failed to save UDP meter '%s': %v", info.name, err)
		} else {
			successCount++
		}
	}

	// MQTT meters: Get buffered readings with import/export
	for _, meterID := range mqttMeters {
		info := meterInfo[meterID]
		readingImport, readingExport, hasReading := dc.mqttCollector.GetMeterReading(meterID)
		
		if !hasReading || readingImport == 0 {
			log.Printf("WARNING: No MQTT data for meter '%s'", info.name)
			continue
		}
		
		if err := dc.saveMeterReading(meterID, info.name, currentTime, readingImport, readingExport); err != nil {
			log.Printf("ERROR: Failed to save MQTT meter '%s': %v", info.name, err)
		} else {
			successCount++
		}
	}

	// Smart-me meters: Get API readings with import/export
	for _, meterID := range smartmeMeters {
		info := meterInfo[meterID]
		
		// Check if meter has too many consecutive failures
		if dc.smartmeCollector.ShouldSkipMeter(meterID) {
			log.Printf("WARNING: Skipping Smart-me meter '%s' due to consecutive failures", info.name)
			continue
		}
		
		// Get meter config to pass to collector
		var configJSON string
		err := dc.db.QueryRow("SELECT connection_config FROM meters WHERE id = ?", meterID).Scan(&configJSON)
		if err != nil {
			log.Printf("ERROR: Failed to get config for Smart-me meter '%s': %v", info.name, err)
			continue
		}
		
		// Fetch data directly from Smart-me API NOW (at exact collection time)
		readingImport, readingExport, err := dc.smartmeCollector.CollectMeterNow(meterID, info.name, configJSON)
		if err != nil {
			log.Printf("ERROR: Failed to fetch Smart-me data for meter '%s': %v", info.name, err)
			continue
		}
		
		if readingImport == 0 {
			log.Printf("WARNING: Zero reading from Smart-me meter '%s'", info.name)
			continue
		}
		
		// Save with REAL timestamp (no rounding needed - data just fetched!)
		if err := dc.saveMeterReading(meterID, info.name, currentTime, readingImport, readingExport); err != nil {
			log.Printf("ERROR: Failed to save Smart-me meter '%s': %v", info.name, err)
		} else {
			successCount++
			log.Printf("[Smart-me] ✔ Saved meter '%s' at EXACT time %s: %.3f kWh import, %.3f kWh export",
				info.name, currentTime.Format("15:04:05"), readingImport, readingExport)
		}
	}

	// E3/DC meters: read the cumulative energy the collector has integrated
	// from instantaneous power since the last cycle. Saved even when import is
	// zero (PV/solar meters carry their production in the export column).
	for _, meterID := range e3dcMeters {
		info := meterInfo[meterID]
		importVal, exportVal, ok := dc.e3dcCollector.GetMeterReading(meterID)
		if !ok {
			log.Printf("WARNING: No E3/DC data for meter '%s'", info.name)
			continue
		}
		if importVal == 0 && exportVal == 0 {
			log.Printf("WARNING: Zero reading from E3/DC meter '%s'", info.name)
			continue
		}
		if err := dc.saveMeterReading(meterID, info.name, currentTime, importVal, exportVal); err != nil {
			log.Printf("ERROR: Failed to save E3/DC meter '%s': %v", info.name, err)
		} else {
			successCount++
		}
	}

	// Virtual meters: computed from other meters AFTER all physical meters have
	// been read this cycle. Modbus/UDP/MQTT/Smart-me/E3-DC sources were already
	// saved above (synchronously), but Loxone meters are written by their own
	// WebSocket goroutine, so the current-bucket row may not exist yet at this
	// instant. Wait (bounded) for those rows, then compute from the readings at
	// THIS cycle's timestamp — otherwise the virtual meter would copy the source's
	// previous value and lag one 15-minute interval behind on the chart.
	if len(virtualMeters) > 0 {
		dc.waitForAsyncVirtualSources(virtualMeters, currentTime)
	}
	for _, meterID := range virtualMeters {
		info := meterInfo[meterID]

		var configJSON string
		if err := dc.db.QueryRow("SELECT connection_config FROM meters WHERE id = ?", meterID).Scan(&configJSON); err != nil {
			log.Printf("ERROR: Failed to get config for virtual meter '%s': %v", info.name, err)
			continue
		}

		var cfg virtualMeterConfig
		_ = json.Unmarshal([]byte(configJSON), &cfg)

		var importVal, exportVal float64
		var err error
		if cfg.Mode == "power" {
			importVal, exportVal, err = dc.computeVirtualPowerReadingAt(meterID, cfg, currentTime)
		} else {
			importVal, exportVal, err = dc.computeVirtualReadingAt(configJSON, currentTime)
		}
		if err != nil {
			log.Printf("ERROR: Failed to compute virtual meter '%s': %v", info.name, err)
			continue
		}

		if err := dc.saveMeterReading(meterID, info.name, currentTime, importVal, exportVal); err != nil {
			log.Printf("ERROR: Failed to save virtual meter '%s': %v", info.name, err)
		} else {
			successCount++
			log.Printf("[Virtual] ✔ Computed meter '%s': %.3f kWh import, %.3f kWh export", info.name, importVal, exportVal)
		}
	}

	log.Printf("--- METER COLLECTION COMPLETED: %d/%d successful ---", successCount, totalCount)
}

// VirtualMeterSource is one term in a virtual meter's formula: a source meter,
// whether its reading is added or subtracted, and which channel (import or
// export) of that meter to use. Field lets you mix channels — e.g. main meter
// import + solar meter export (production) to get total household consumption.
type VirtualMeterSource struct {
	MeterID int    `json:"meter_id"`
	Op      string `json:"op"`    // "+" or "-"
	Field   string `json:"field"` // "import" (default) or "export"
}

type virtualMeterConfig struct {
	Sources []VirtualMeterSource `json:"sources"`
	// Mode selects how the virtual meter is evaluated:
	//   "" / "energy" (legacy) — compose the sources' cumulative counters, picking
	//        an import/export channel per source (see VirtualMeterSource.Field).
	//   "power" — combine each source's NET energy flow (import − export) per
	//        interval with the +/- ops and integrate it into the virtual meter's
	//        own import/export counters; direction follows the sign of the flow,
	//        so no per-source channel choice is needed.
	Mode string `json:"mode"`
}

// computeVirtualReading evaluates a virtual meter's formula against the current
// cumulative readings of its source meters. Each source contributes its chosen
// channel (import = last_reading, export = last_reading_export). The result is a
// single combined value (clamped at 0) returned as the import reading; a virtual
// meter has no export of its own.
func (dc *DataCollector) computeVirtualReading(configJSON string) (float64, float64, error) {
	var cfg virtualMeterConfig
	if err := json.Unmarshal([]byte(configJSON), &cfg); err != nil {
		return 0, 0, fmt.Errorf("failed to parse config: %v", err)
	}
	if len(cfg.Sources) == 0 {
		return 0, 0, fmt.Errorf("no source meters configured")
	}

	var total float64
	for _, src := range cfg.Sources {
		var lastReading, lastReadingExport float64
		err := dc.db.QueryRow(
			"SELECT COALESCE(last_reading, 0), COALESCE(last_reading_export, 0) FROM meters WHERE id = ?",
			src.MeterID,
		).Scan(&lastReading, &lastReadingExport)
		if err != nil {
			return 0, 0, fmt.Errorf("source meter %d not found: %v", src.MeterID, err)
		}

		val := lastReading
		if src.Field == "export" {
			val = lastReadingExport
		}

		if src.Op == "-" {
			total -= val
		} else {
			total += val
		}
	}

	if total < 0 {
		total = 0
	}
	return total, 0, nil
}

// computeVirtualReadingAt evaluates a virtual meter's formula against its source
// meters' stored readings at a specific timestamp (this collection cycle's
// quarter-hour bucket). This keeps the virtual meter aligned in time with its
// sources on the chart. If a source has no row at that exact time (e.g. it did
// not report this cycle), it falls back to that source's live cumulative
// last_reading so the virtual meter still produces a value.
func (dc *DataCollector) computeVirtualReadingAt(configJSON string, at time.Time) (float64, float64, error) {
	var cfg virtualMeterConfig
	if err := json.Unmarshal([]byte(configJSON), &cfg); err != nil {
		return 0, 0, fmt.Errorf("failed to parse config: %v", err)
	}
	if len(cfg.Sources) == 0 {
		return 0, 0, fmt.Errorf("no source meters configured")
	}

	var total float64
	for _, src := range cfg.Sources {
		var lastReading, lastReadingExport float64

		// Prefer this cycle's reading so the virtual meter is time-aligned.
		err := dc.db.QueryRow(
			"SELECT power_kwh, COALESCE(power_kwh_export, 0) FROM meter_readings WHERE meter_id = ? AND reading_time = ?",
			src.MeterID, at,
		).Scan(&lastReading, &lastReadingExport)
		if err != nil {
			// Fall back to the live cumulative reading if the current bucket
			// isn't available for this source.
			if fErr := dc.db.QueryRow(
				"SELECT COALESCE(last_reading, 0), COALESCE(last_reading_export, 0) FROM meters WHERE id = ?",
				src.MeterID,
			).Scan(&lastReading, &lastReadingExport); fErr != nil {
				return 0, 0, fmt.Errorf("source meter %d not found: %v", src.MeterID, fErr)
			}
		}

		val := lastReading
		if src.Field == "export" {
			val = lastReadingExport
		}

		if src.Op == "-" {
			total -= val
		} else {
			total += val
		}
	}

	if total < 0 {
		total = 0
	}
	return total, 0, nil
}

// computeVirtualPowerReadingAt evaluates a "power-based" virtual meter for one
// collection cycle. Instead of composing the sources' cumulative counters, it
// combines each source's NET energy flow for this interval (its import delta
// minus its export delta) using the +/- ops, then integrates that net flow into
// the virtual meter's own cumulative import/export counters: a positive net flow
// adds to import (consumption), a negative net flow adds to export (feed-in).
//
// This is what lets a power-based virtual meter behave like a physical
// bidirectional meter — the user only picks meters and +/-, and the direction
// (consumption vs production) follows the sign of the measured flow. No
// per-source import/export channel choice is required.
//
// Returns the virtual meter's new cumulative (import, export) readings, which the
// caller hands to saveMeterReading exactly like a physical meter reading.
func (dc *DataCollector) computeVirtualPowerReadingAt(meterID int, cfg virtualMeterConfig, at time.Time) (float64, float64, error) {
	if len(cfg.Sources) == 0 {
		return 0, 0, fmt.Errorf("no source meters configured")
	}

	// Current cumulative counters for this virtual meter (kept in the meters row,
	// updated each cycle by saveMeterReading — survives restarts).
	var curImport, curExport float64
	if err := dc.db.QueryRow(
		"SELECT COALESCE(last_reading, 0), COALESCE(last_reading_export, 0) FROM meters WHERE id = ?",
		meterID,
	).Scan(&curImport, &curExport); err != nil {
		return 0, 0, fmt.Errorf("virtual meter %d not found: %v", meterID, err)
	}

	// Net energy flow over this interval, summed across the source meters. Each
	// source contributes its signed net flow (consumption +, production/feed-in −)
	// using the same convention the config UI shows, so what the user sees is what
	// gets integrated. Battery meters are inverted (charge +, discharge −) because
	// they store discharge in the import column and charge in the export column.
	var netDelta float64
	for _, src := range cfg.Sources {
		var impDelta, expDelta float64
		var mtype string
		_ = dc.db.QueryRow("SELECT COALESCE(meter_type, '') FROM meters WHERE id = ?", src.MeterID).Scan(&mtype)
		err := dc.db.QueryRow(
			"SELECT COALESCE(consumption_kwh, 0), COALESCE(consumption_export, 0) FROM meter_readings WHERE meter_id = ? AND reading_time = ?",
			src.MeterID, at,
		).Scan(&impDelta, &expDelta)
		if err != nil {
			// No row for this source at this bucket (didn't report this cycle) →
			// treat as no movement rather than failing the whole virtual meter.
			continue
		}
		net := impDelta - expDelta
		if mtype == "battery_meter" {
			net = expDelta - impDelta
		}
		if src.Op == "-" {
			netDelta -= net
		} else {
			netDelta += net
		}
	}

	if netDelta >= 0 {
		curImport += netDelta
	} else {
		curExport += -netDelta
	}
	return curImport, curExport, nil
}

// waitForAsyncVirtualSources blocks (bounded) until every Loxone source meter
// referenced by the given virtual meters has a stored reading at time `at`.
// Loxone meters are persisted asynchronously by their WebSocket goroutine; all
// other source types are already saved synchronously before the virtual pass,
// so only Loxone sources are awaited here.
func (dc *DataCollector) waitForAsyncVirtualSources(virtualMeterIDs []int, at time.Time) {
	wanted := make(map[int]bool)
	for _, vid := range virtualMeterIDs {
		var configJSON string
		if err := dc.db.QueryRow("SELECT connection_config FROM meters WHERE id = ?", vid).Scan(&configJSON); err != nil {
			continue
		}
		var cfg virtualMeterConfig
		if json.Unmarshal([]byte(configJSON), &cfg) != nil {
			continue
		}
		for _, src := range cfg.Sources {
			var connType string
			var isActive bool
			if err := dc.db.QueryRow(
				"SELECT connection_type, is_active FROM meters WHERE id = ?", src.MeterID,
			).Scan(&connType, &isActive); err == nil && isActive && connType == "loxone_api" {
				wanted[src.MeterID] = true
			}
		}
	}
	if len(wanted) == 0 {
		return
	}

	// Loxone usually writes within a few seconds of the boundary; cap the wait so
	// a slow/offline source can't stall the cycle (we then compute with fallback).
	deadline := time.Now().Add(90 * time.Second)
	for {
		missing := 0
		for id := range wanted {
			var n int
			dc.db.QueryRow(
				"SELECT COUNT(1) FROM meter_readings WHERE meter_id = ? AND reading_time = ?", id, at,
			).Scan(&n)
			if n == 0 {
				missing++
			}
		}
		if missing == 0 {
			log.Printf("[Virtual] All %d Loxone source meter(s) have a reading at %s", len(wanted), at.Format("15:04"))
			return
		}
		if time.Now().After(deadline) {
			log.Printf("[Virtual] WARNING: %d Loxone source meter(s) missing a reading at %s after wait; computing with fallback", missing, at.Format("15:04"))
			return
		}
		time.Sleep(3 * time.Second)
	}
}

// maxIntervalConsumptionKwh bounds a single 15-min interval's consumption. A
// newly added meter whose counter is already large (or a counter reset/swap)
// would otherwise record one giant delta — e.g. the whole 98'000 kWh counter —
// which dominates the 24h charts and energy-flow diagram. No realistic ZEV meter
// moves this much in 15 minutes (1000 kWh = 4 MW average), so anything above it
// is treated as a counter (re)initialisation and recorded as 0 for that interval.
// The cumulative power_kwh is still stored, so cumulative/billing reports are
// unaffected.
const maxIntervalConsumptionKwh = 1000.0

func (dc *DataCollector) saveMeterReading(meterID int, meterName string, currentTime time.Time, reading float64, readingExport float64) error {
	// Get last reading for interpolation
	var lastReading, lastReadingExport float64
	var lastTime time.Time
	err := dc.db.QueryRow(`
		SELECT power_kwh, power_kwh_export, reading_time FROM meter_readings 
		WHERE meter_id = ? 
		ORDER BY reading_time DESC LIMIT 1
	`, meterID).Scan(&lastReading, &lastReadingExport, &lastTime)

	var consumption, consumptionExport float64
	isFirstReading := false

	if err == nil && !lastTime.IsZero() {
		// Interpolate missing intervals
		interpolated := interpolateReadings(lastTime, lastReading, currentTime, reading)
		interpolatedExport := interpolateReadings(lastTime, lastReadingExport, currentTime, readingExport)
		
		if len(interpolated) > 0 {
			log.Printf("Meter '%s': Interpolating %d missing intervals", meterName, len(interpolated))
		}
		
		for i, point := range interpolated {
			intervalConsumption := point.value - lastReading
			if intervalConsumption < 0 || intervalConsumption > maxIntervalConsumptionKwh {
				intervalConsumption = 0
			}

			intervalExport := float64(0)
			exportValue := lastReadingExport
			if i < len(interpolatedExport) {
				exportValue = interpolatedExport[i].value
				intervalExport = exportValue - lastReadingExport
				if intervalExport < 0 || intervalExport > maxIntervalConsumptionKwh {
					intervalExport = 0
				}
			}

			_, interpErr := dc.db.Exec(`
				INSERT INTO meter_readings (meter_id, reading_time, power_kwh, power_kwh_export, consumption_kwh, consumption_export)
				VALUES (?, ?, ?, ?, ?, ?)
			`, meterID, point.time, point.value, exportValue, intervalConsumption, intervalExport)
			if interpErr != nil {
				log.Printf("ERROR: Failed to insert interpolated reading for meter '%s' at %s: %v",
					meterName, point.time.Format("15:04:05"), interpErr)
			}

			lastReading = point.value
			if i < len(interpolatedExport) {
				lastReadingExport = interpolatedExport[i].value
			}
		}
		
		// Calculate consumption for current reading
		consumption = reading - lastReading
		if consumption < 0 {
			consumption = 0
		}
		if consumption > maxIntervalConsumptionKwh {
			log.Printf("Meter '%s': implausible interval consumption %.1f kWh (counter init/reset?) — recording 0", meterName, consumption)
			consumption = 0
		}

		consumptionExport = readingExport - lastReadingExport
		if consumptionExport < 0 {
			consumptionExport = 0
		}
		if consumptionExport > maxIntervalConsumptionKwh {
			consumptionExport = 0
		}
	} else {
		// First reading
		log.Printf("Meter '%s': First reading - consumption set to 0", meterName)
		consumption = 0
		consumptionExport = 0
		isFirstReading = true
	}

	// Save current reading
	_, err = dc.db.Exec(`
		INSERT INTO meter_readings (meter_id, reading_time, power_kwh, power_kwh_export, consumption_kwh, consumption_export)
		VALUES (?, ?, ?, ?, ?, ?)
	`, meterID, currentTime, reading, readingExport, consumption, consumptionExport)

	if err != nil {
		return err
	}

	// Update meter table
	if _, updateErr := dc.db.Exec(`
		UPDATE meters
		SET last_reading = ?, last_reading_export = ?, last_reading_time = ?
		WHERE id = ?
	`, reading, readingExport, currentTime, meterID); updateErr != nil {
		log.Printf("WARNING: Failed to update meters table for '%s': %v", meterName, updateErr)
	}

	if isFirstReading {
		log.Printf("SUCCESS: First reading for meter '%s' = %.3f kWh import, %.3f kWh export (consumption: 0 kWh)", 
			meterName, reading, readingExport)
	} else {
		log.Printf("SUCCESS: Saved meter data: '%s' = %.3f kWh import (Δ%.3f), %.3f kWh export (Δ%.3f)", 
			meterName, reading, consumption, readingExport, consumptionExport)
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
			// NEW: Loxone now uses session-based tracking (like Zaptec)
			// Database writes happen after session completion, not during charging
			liveData, exists := dc.GetLoxoneChargerLiveData(id)
			if !exists {
				log.Printf("[%d/%d] WARNING: No Loxone live data for charger '%s'", totalCount, totalCount, name)
				continue
			}
			
			// Log live data for monitoring (no database write - handled by loxone_collector sessions)
			log.Printf("[%d/%d] Charger '%s': Loxone LIVE - Energy: %.3f kWh, Power: %.2f kW, User: %s, State: %s (%s)", 
				totalCount, totalCount, name, liveData.TotalEnergy_kWh, liveData.CurrentPower_kW, 
				liveData.UserID, liveData.State, liveData.StateDescription)
			
			// Count as success since we got data (database writes happen via session tracking)
			successCount++
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
			
		case "zaptec_api":
			// Zaptec uses session-based tracking - database writes happen after session completion
			data, exists := dc.zaptecCollector.GetChargerData(id)
			if !exists {
				log.Printf("[%d/%d] WARNING: No Zaptec data for charger '%s'", totalCount, totalCount, name)
				continue
			}
			
			// Log live data for monitoring (no database write - handled by zaptec_collector)
			log.Printf("[%d/%d] Charger '%s': Zaptec LIVE - Energy: %.3f kWh, Power: %.2f kW, User: %s, State: %s (%s)", 
				totalCount, totalCount, name, data.TotalEnergy, data.Power_kW, data.UserID, data.State, data.StateDescription)
			
			// Count as success since we got data (database writes happen via OCMF after session ends)
			successCount++
			continue

		case "e3dc_api":
			// E3/DC wallbox: the E3DCCollector writes cumulative energy to
			// charger_sessions at 15-min boundaries itself (like Zaptec). Here
			// we only confirm live data is flowing.
			data, exists := dc.e3dcCollector.GetChargerData(id)
			if !exists {
				log.Printf("[%d/%d] WARNING: No E3/DC data for charger '%s'", totalCount, totalCount, name)
				continue
			}
			log.Printf("[%d/%d] Charger '%s': E3/DC LIVE - Energy: %.3f kWh (solar %.3f), Power: %.2f kW, Charging: %t",
				totalCount, totalCount, name, data.TotalEnergy, data.SolarEnergy, data.Power_kW, data.IsCharging)
			successCount++
			continue

		default:
			log.Printf("[%d/%d] WARNING: Unknown connection type '%s' for charger '%s'", 
				totalCount, totalCount, connectionType, name)
			continue
		}

		// Save data for non-session-based chargers (UDP, MQTT)
		if hasData && mode != "" && state != "" {
			if err := dc.saveChargerSession(id, name, currentTime, power, userID, mode, state); err != nil {
				log.Printf("ERROR: Failed to save charger session for '%s': %v", name, err)
			} else {
				successCount++
			}
		}
	}

	log.Printf("--- CHARGER COLLECTION COMPLETED: %d/%d successful ---", successCount, totalCount)
}

// saveChargerSession - for non-session-based chargers (UDP, MQTT)
func (dc *DataCollector) saveChargerSession(chargerID int, chargerName string, currentTime time.Time, power float64, userID, mode, state string) error {
	// Get last reading for interpolation (by user_id)
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
			if _, interpErr := dc.db.Exec(`
				INSERT INTO charger_sessions (charger_id, user_id, session_time, power_kwh, mode, state)
				VALUES (?, ?, ?, ?, ?, ?)
			`, chargerID, userID, point.time, point.value, mode, state); interpErr != nil {
				log.Printf("ERROR: Failed to insert interpolated charger reading for '%s': %v",
					chargerName, interpErr)
			}
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

// ========== LIVE METER READING API ==========

// MeterLiveReading holds real-time meter data for live dashboard display
type MeterLiveReading struct {
	MeterID          int       `json:"meter_id"`
	MeterName        string    `json:"meter_name"`
	MeterType        string    `json:"meter_type"`
	BuildingID       int       `json:"building_id"`
	ConnectionType   string    `json:"connection_type"`
	CurrentPowerW    float64   `json:"current_power_w"`     // Instantaneous import power in Watts
	CurrentPowerExpW float64   `json:"current_power_exp_w"` // Instantaneous export power in Watts (for solar)
	// SignedPowerW is a single directional power value with a consistent sign:
	// positive = consumption/import, negative = production/feed-in. Battery meters
	// are normalised so charging is positive and discharging negative. Used by the
	// virtual-meter config UI so the user can verify each source's flow direction.
	SignedPowerW float64 `json:"signed_power_w"`
	HasLivePower     bool      `json:"has_live_power"`      // True if live power is from direct reading (not estimated)
	TotalImportKwh   float64   `json:"total_import_kwh"`    // Cumulative import reading
	TotalExportKwh   float64   `json:"total_export_kwh"`    // Cumulative export reading (solar)
	IsOnline         bool      `json:"is_online"`
	LastUpdate       time.Time `json:"last_update"`
}

// GetLiveMeterReadings returns real-time meter data without storing to database
// This is for live dashboard display only, does not affect 15-minute billing cycle
//
// For different meter types, power is calculated differently:
// - solar_meter: Power from EXPORT readings (solar production)
// - total_meter: Power from IMPORT readings (grid consumption)
// - apartment_meter: Power from IMPORT readings (apartment consumption)
func (dc *DataCollector) GetLiveMeterReadings(buildingID int) ([]MeterLiveReading, error) {
	var readings []MeterLiveReading

	// Query all active meters (optionally filtered by building)
	query := `
		SELECT m.id, m.name, m.meter_type, m.building_id, m.connection_type, m.connection_config
		FROM meters m
		WHERE m.is_active = 1
	`
	args := []interface{}{}
	if buildingID > 0 {
		query += " AND m.building_id = ?"
		args = append(args, buildingID)
	}

	rows, err := dc.db.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to query meters: %v", err)
	}
	defer rows.Close()

	for rows.Next() {
		var meterID, building int
		var name, meterType, connectionType string
		var configJSON sql.NullString

		if err := rows.Scan(&meterID, &name, &meterType, &building, &connectionType, &configJSON); err != nil {
			continue
		}

		reading := MeterLiveReading{
			MeterID:        meterID,
			MeterName:      name,
			MeterType:      meterType,
			BuildingID:     building,
			ConnectionType: connectionType,
			LastUpdate:     time.Now(),
		}

		// Determine which reading to use for power calculation based on meter type
		// Solar meters measure production via export, others measure consumption via import
		isSolarMeter := meterType == "solar_meter"

		// Get live reading based on connection type
		switch connectionType {
		case "loxone_api":
			// Loxone: get from WebSocket-updated in-memory device data
			if dc.loxoneCollector != nil {
				if device := dc.loxoneCollector.GetDeviceByMeterID(meterID); device != nil {
					reading.TotalImportKwh = device.LastReading
					reading.TotalExportKwh = device.LastReadingExport
					reading.LastUpdate = device.LastUpdate
					reading.IsOnline = time.Since(device.LastUpdate) < 60*time.Second // Live polling every 15 sec

					// Use live power if available (from Pf output or calculated from energy delta)
					// Live power is polled every 30 seconds, so we accept data up to 45 seconds old
					// to account for response delays
					livePowerAge := time.Since(device.LivePowerTime)
					hasRecentLivePower := !device.LivePowerTime.IsZero() && livePowerAge < 45*time.Second
					hasLivePowerValue := device.LivePowerW > 0 || device.LivePowerExpW > 0

					if hasRecentLivePower && hasLivePowerValue {
						reading.CurrentPowerW = device.LivePowerW
						reading.CurrentPowerExpW = device.LivePowerExpW
						reading.HasLivePower = true
					} else if hasRecentLivePower {
						// Live power time is recent but values are 0 - this means power flow is actually 0
						reading.CurrentPowerW = 0
						reading.CurrentPowerExpW = 0
						reading.HasLivePower = true
					}

					// Fallback: estimate power from DB readings if no live power
					if !reading.HasLivePower {
						if isSolarMeter {
							reading.CurrentPowerW = dc.estimatePowerFromRecentReadingsExport(meterID, device.LastReadingExport)
						} else {
							reading.CurrentPowerW = dc.estimatePowerFromRecentReadings(meterID, device.LastReading)
						}
					}
				}
			}

		case "modbus_tcp", "kostal":
			// Modbus: read directly (this is fast, just a TCP read).
			// Kostal inverters share the Modbus collector.
			if dc.modbusCollector != nil {
				importVal, exportVal, err := dc.modbusCollector.ReadMeter(meterID)
				if err == nil {
					reading.TotalImportKwh = importVal
					reading.TotalExportKwh = exportVal
					reading.IsOnline = true
					if isSolarMeter {
						reading.CurrentPowerW = dc.estimatePowerFromRecentReadingsExport(meterID, exportVal)
					} else {
						reading.CurrentPowerW = dc.estimatePowerFromRecentReadings(meterID, importVal)
					}
				}
			}

		case "udp":
			// UDP: get from buffered readings
			if dc.udpCollector != nil {
				if val, ok := dc.udpCollector.GetMeterReading(meterID); ok {
					reading.TotalImportKwh = val
					reading.IsOnline = true
					// UDP doesn't provide separate export, use import for all
					reading.CurrentPowerW = dc.estimatePowerFromRecentReadings(meterID, val)
				}
			}

		case "mqtt":
			// MQTT: get from buffered readings with live power support
			if dc.mqttCollector != nil {
				// First try to get live power directly
				livePowerW, livePowerExpW, hasLive := dc.mqttCollector.GetMeterLivePower(meterID)
				if hasLive {
					reading.CurrentPowerW = livePowerW
					reading.CurrentPowerExpW = livePowerExpW
					reading.HasLivePower = true
					reading.IsOnline = true
				}

				// Get cumulative energy readings
				importVal, exportVal, ok := dc.mqttCollector.GetMeterReading(meterID)
				if ok {
					reading.TotalImportKwh = importVal
					reading.TotalExportKwh = exportVal
					reading.IsOnline = true

					// Fallback: estimate power if no live power available
					if !reading.HasLivePower {
						if isSolarMeter {
							reading.CurrentPowerW = dc.estimatePowerFromRecentReadingsExport(meterID, exportVal)
						} else {
							reading.CurrentPowerW = dc.estimatePowerFromRecentReadings(meterID, importVal)
						}
					}
				}
			}

		case "e3dc":
			// E3/DC: read the collector's integrated cumulative energy + last
			// instantaneous power (no extra device round-trip).
			if dc.e3dcCollector != nil {
				importVal, exportVal, ok := dc.e3dcCollector.GetMeterReading(meterID)
				if ok {
					reading.TotalImportKwh = importVal
					reading.TotalExportKwh = exportVal
					reading.IsOnline = true
				}
				if pImp, pExp, hasLive := dc.e3dcCollector.GetMeterLivePower(meterID); hasLive {
					if isSolarMeter {
						reading.CurrentPowerW = pExp
					} else {
						reading.CurrentPowerW = pImp
					}
					reading.CurrentPowerExpW = pExp
					reading.HasLivePower = true
					reading.IsOnline = true
				}
			}

		case "smartme":
			// Smart-me: API call (cached if recent)
			if dc.smartmeCollector != nil && configJSON.Valid {
				importVal, exportVal, err := dc.smartmeCollector.CollectMeterNow(meterID, name, configJSON.String)
				if err == nil {
					reading.TotalImportKwh = importVal
					reading.TotalExportKwh = exportVal
					reading.IsOnline = true
					if isSolarMeter {
						reading.CurrentPowerW = dc.estimatePowerFromRecentReadingsExport(meterID, exportVal)
					} else {
						reading.CurrentPowerW = dc.estimatePowerFromRecentReadings(meterID, importVal)
					}
				}
			}

		case "virtual":
			// Virtual: computed live from the source meters' last readings.
			if configJSON.Valid {
				var vcfg virtualMeterConfig
				_ = json.Unmarshal([]byte(configJSON.String), &vcfg)
				if vcfg.Mode == "power" {
					// Power-based: the collector integrates net flow into this
					// meter's own counters, so read those directly and estimate
					// live power in both directions (import = consumption,
					// export = feed-in) from the most recent interval deltas.
					dc.db.QueryRow(
						"SELECT COALESCE(last_reading, 0), COALESCE(last_reading_export, 0) FROM meters WHERE id = ?",
						meterID,
					).Scan(&reading.TotalImportKwh, &reading.TotalExportKwh)
					reading.IsOnline = true
					reading.CurrentPowerW = dc.estimatePowerFromRecentReadings(meterID, reading.TotalImportKwh)
					reading.CurrentPowerExpW = dc.estimatePowerFromRecentReadingsExport(meterID, reading.TotalExportKwh)
				} else if importVal, exportVal, err := dc.computeVirtualReading(configJSON.String); err == nil {
					reading.TotalImportKwh = importVal
					reading.TotalExportKwh = exportVal
					reading.IsOnline = true
					if isSolarMeter {
						reading.CurrentPowerW = dc.estimatePowerFromRecentReadingsExport(meterID, exportVal)
					} else {
						reading.CurrentPowerW = dc.estimatePowerFromRecentReadings(meterID, importVal)
					}
				}
			}
		}

		// Derive a single signed power (consumption +, production/feed-in −).
		// Prefer the collector's TRUE instantaneous power where available; only
		// fall back to the recent-interval average for devices that expose just a
		// cumulative counter (Modbus/UDP/Smart-me). The average lags reality (it
		// drifts toward the real value over the 15-min window after a step change),
		// so using live power keeps the preview steady and accurate.
		var impW, expW float64
		haveLive := false
		switch connectionType {
		case "e3dc":
			if dc.e3dcCollector != nil {
				if pImp, pExp, ok := dc.e3dcCollector.GetMeterLivePower(meterID); ok {
					impW, expW, haveLive = pImp, pExp, true
				}
			}
		case "mqtt":
			if dc.mqttCollector != nil {
				if lImp, lExp, ok := dc.mqttCollector.GetMeterLivePower(meterID); ok {
					impW, expW, haveLive = lImp, lExp, true
				}
			}
		case "loxone_api":
			if dc.loxoneCollector != nil {
				if device := dc.loxoneCollector.GetDeviceByMeterID(meterID); device != nil {
					if !device.LivePowerTime.IsZero() && time.Since(device.LivePowerTime) < 45*time.Second {
						impW, expW, haveLive = device.LivePowerW, device.LivePowerExpW, true
					}
				}
			}
		}
		if !haveLive {
			impW = dc.estimatePowerFromRecentReadings(meterID, reading.TotalImportKwh)
			expW = dc.estimatePowerFromRecentReadingsExport(meterID, reading.TotalExportKwh)
		}
		// Battery meters store discharge in the import column and charge in the
		// export column, so invert them to keep "charging +, discharging −".
		if meterType == "battery_meter" {
			reading.SignedPowerW = expW - impW
		} else {
			reading.SignedPowerW = impW - expW
		}

		readings = append(readings, reading)
	}

	return readings, nil
}

// estimatePowerFromRecentReadings calculates instantaneous power by comparing current reading
// with the most recent stored reading (power = energy delta / time delta)
// This uses power_kwh (import) column - for consumption meters (total_meter, apartment_meter)
func (dc *DataCollector) estimatePowerFromRecentReadings(meterID int, currentReading float64) float64 {
	// Get the last stored reading from the database
	var lastReading float64
	var lastTime time.Time

	err := dc.db.QueryRow(`
		SELECT power_kwh, reading_time
		FROM meter_readings
		WHERE meter_id = ?
		ORDER BY reading_time DESC
		LIMIT 1
	`, meterID).Scan(&lastReading, &lastTime)

	if err != nil {
		log.Printf("estimatePowerFromRecentReadings: No previous reading for meter %d: %v", meterID, err)
		return 0 // No previous reading available
	}

	// Calculate time delta in hours
	timeDeltaHours := time.Since(lastTime).Hours()
	if timeDeltaHours <= 0 || timeDeltaHours > 1 { // Max 1 hour lookback
		return 0
	}

	// Calculate energy delta
	energyDeltaKwh := currentReading - lastReading
	if energyDeltaKwh < 0 {
		return 0 // Meter reset or error
	}

	// Power (W) = Energy (kWh) / Time (hours) * 1000
	powerW := (energyDeltaKwh / timeDeltaHours) * 1000

	return powerW
}

// estimatePowerFromRecentReadingsExport calculates instantaneous power from EXPORT readings
// This uses power_kwh_export column - for solar production meters
func (dc *DataCollector) estimatePowerFromRecentReadingsExport(meterID int, currentReading float64) float64 {
	// Get the last stored export reading from the database
	var lastReading float64
	var lastTime time.Time

	err := dc.db.QueryRow(`
		SELECT power_kwh_export, reading_time
		FROM meter_readings
		WHERE meter_id = ?
		ORDER BY reading_time DESC
		LIMIT 1
	`, meterID).Scan(&lastReading, &lastTime)

	if err != nil {
		log.Printf("estimatePowerFromRecentReadingsExport: No previous export reading for meter %d: %v", meterID, err)
		return 0 // No previous reading available
	}

	// Calculate time delta in hours
	timeDeltaHours := time.Since(lastTime).Hours()
	if timeDeltaHours <= 0 || timeDeltaHours > 1 { // Max 1 hour lookback
		return 0
	}

	// Calculate energy delta
	energyDeltaKwh := currentReading - lastReading
	if energyDeltaKwh < 0 {
		return 0 // Meter reset or error
	}

	// Power (W) = Energy (kWh) / Time (hours) * 1000
	powerW := (energyDeltaKwh / timeDeltaHours) * 1000

	return powerW
}