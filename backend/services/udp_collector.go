package services

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"strconv"
	"strings"
	"sync"
	"time"
)

type UDPCollector struct {
	db                 *sql.DB
	listeners          map[int]*net.UDPConn
	meterBuffers       map[int]float64
	chargerBuffers     map[int]UDPChargerData
	partialChargerData map[int]*PartialUDPChargerData
	mu                 sync.Mutex
	activePorts        []int
}

type UDPChargerData struct {
	Power  float64
	State  string
	UserID string
	Mode   string
}

type PartialUDPChargerData struct {
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

func NewUDPCollector(db *sql.DB) *UDPCollector {
	return &UDPCollector{
		db:                 db,
		listeners:          make(map[int]*net.UDPConn),
		meterBuffers:       make(map[int]float64),
		chargerBuffers:     make(map[int]UDPChargerData),
		partialChargerData: make(map[int]*PartialUDPChargerData),
		activePorts:        []int{},
	}
}

func (uc *UDPCollector) Start() {
	log.Println("=== UDP Collector Starting ===")
	uc.initializeListeners()
	
	// Start cleanup routine for stale partial data
	go uc.cleanupStaleData()
	
	log.Println("=== UDP Collector Started ===")
}

func (uc *UDPCollector) Stop() {
	log.Println("Stopping UDP Collector...")
	
	uc.mu.Lock()
	defer uc.mu.Unlock()
	
	for port, conn := range uc.listeners {
		log.Printf("Closing UDP listener on port %d", port)
		conn.Close()
		delete(uc.listeners, port)
	}
	
	uc.activePorts = []int{}
	
	log.Println("UDP Collector stopped")
}

func (uc *UDPCollector) RestartConnections() {
	log.Println("=== Restarting UDP Listeners ===")
	
	uc.Stop()
	time.Sleep(500 * time.Millisecond)
	uc.initializeListeners()
	
	log.Println("=== UDP Listeners Restarted ===")
}

func (uc *UDPCollector) initializeListeners() {
	portDevices := make(map[int]struct {
		meters   []UDPMeterConfig
		chargers []UDPChargerConfig
	})

	// Query UDP meters
	meterRows, err := uc.db.Query(`
		SELECT id, name, connection_config
		FROM meters 
		WHERE is_active = 1 AND connection_type = 'udp'
	`)
	if err != nil {
		log.Printf("ERROR: Failed to query UDP meters: %v", err)
		uc.logToDatabase("UDP Init Error", fmt.Sprintf("Failed to query UDP meters: %v", err))
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

	// Query UDP chargers
	chargerRows, err := uc.db.Query(`
		SELECT id, name, connection_config
		FROM chargers 
		WHERE is_active = 1 AND connection_type = 'udp'
	`)
	if err != nil {
		log.Printf("ERROR: Failed to query UDP chargers: %v", err)
		uc.logToDatabase("UDP Init Error", fmt.Sprintf("Failed to query UDP chargers: %v", err))
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

	// Start listeners for each port
	for port, devices := range portDevices {
		go uc.startListener(port, devices.meters, devices.chargers)
	}
}

func (uc *UDPCollector) startListener(port int, meters []UDPMeterConfig, chargers []UDPChargerConfig) {
	addr := net.UDPAddr{
		Port: port,
		IP:   net.ParseIP("0.0.0.0"),
	}

	conn, err := net.ListenUDP("udp", &addr)
	if err != nil {
		log.Printf("ERROR: Failed to start UDP listener on port %d: %v", port, err)
		uc.logToDatabase("UDP Listener Failed", fmt.Sprintf("Port %d, Error: %v", port, err))
		return
	}

	uc.mu.Lock()
	uc.listeners[port] = conn
	uc.activePorts = append(uc.activePorts, port)
	for _, m := range meters {
		uc.meterBuffers[m.MeterID] = 0
	}
	for _, c := range chargers {
		uc.chargerBuffers[c.ChargerID] = UDPChargerData{}
		uc.partialChargerData[c.ChargerID] = &PartialUDPChargerData{
			LastUpdate: time.Now(),
		}
	}
	uc.mu.Unlock()

	deviceCount := len(meters) + len(chargers)
	log.Printf("SUCCESS: UDP listener started on port %d for %d devices", port, deviceCount)
	uc.logToDatabase("UDP Listener Started", 
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
					uc.mu.Lock()
					uc.meterBuffers[meter.MeterID] = reading
					uc.mu.Unlock()
					log.Printf("DEBUG: UDP data for meter '%s': %.3f kWh from %s", 
						meter.Name, reading, remoteAddr.IP)
				}
			}
		}

		// Process charger data
		for _, charger := range chargers {
			uc.processChargerPacket(charger, jsonData, remoteAddr.IP.String())
		}
	}
}

func (uc *UDPCollector) processChargerPacket(charger UDPChargerConfig, jsonData map[string]interface{}, remoteIP string) {
	uc.mu.Lock()
	defer uc.mu.Unlock()

	partial := uc.partialChargerData[charger.ChargerID]
	if partial == nil {
		partial = &PartialUDPChargerData{}
		uc.partialChargerData[charger.ChargerID] = partial
	}

	updated := false

	if value, ok := jsonData[charger.PowerKey]; ok {
		switch v := value.(type) {
		case float64:
			partial.Power = &v
			updated = true
		case string:
			if f, err := strconv.ParseFloat(v, 64); err == nil {
				partial.Power = &f
				updated = true
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
		}
	}

	if updated {
		partial.LastUpdate = time.Now()
		
		// Check if we have all fields
		if partial.Power != nil && partial.State != nil && partial.UserID != nil && partial.Mode != nil {
			completeData := UDPChargerData{
				Power:  *partial.Power,
				State:  *partial.State,
				UserID: *partial.UserID,
				Mode:   *partial.Mode,
			}
			
			uc.chargerBuffers[charger.ChargerID] = completeData
			
			log.Printf("DEBUG: UDP data for charger '%s': Power=%.4f kWh, User=%s", 
				charger.Name, completeData.Power, completeData.UserID)
			
			// Reset partial data
			uc.partialChargerData[charger.ChargerID] = &PartialUDPChargerData{
				LastUpdate: time.Now(),
			}
		}
	}
}

func (uc *UDPCollector) cleanupStaleData() {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		uc.mu.Lock()
		now := time.Now()
		for chargerID, partial := range uc.partialChargerData {
			if now.Sub(partial.LastUpdate) > 5*time.Minute {
				log.Printf("DEBUG: Cleaning up stale partial data for charger %d", chargerID)
				delete(uc.partialChargerData, chargerID)
			}
		}
		uc.mu.Unlock()
	}
}

// GetMeterReading returns the latest buffered reading for a meter
func (uc *UDPCollector) GetMeterReading(meterID int) (float64, bool) {
	uc.mu.Lock()
	defer uc.mu.Unlock()
	
	reading, exists := uc.meterBuffers[meterID]
	return reading, exists
}

// GetChargerData returns the latest buffered data for a charger
func (uc *UDPCollector) GetChargerData(chargerID int) (UDPChargerData, bool) {
	uc.mu.Lock()
	defer uc.mu.Unlock()
	
	data, exists := uc.chargerBuffers[chargerID]
	return data, exists
}

func (uc *UDPCollector) GetConnectionStatus() map[string]interface{} {
	uc.mu.Lock()
	defer uc.mu.Unlock()
	
	meterStatus := make(map[int]map[string]interface{})
	chargerStatus := make(map[int]map[string]interface{})
	
	for meterID, reading := range uc.meterBuffers {
		meterStatus[meterID] = map[string]interface{}{
			"last_reading": reading,
			"buffer_active": reading > 0,
		}
	}
	
	for chargerID, data := range uc.chargerBuffers {
		chargerStatus[chargerID] = map[string]interface{}{
			"power":   data.Power,
			"state":   data.State,
			"user_id": data.UserID,
			"mode":    data.Mode,
		}
	}
	
	partialStatus := make(map[int]map[string]interface{})
	for chargerID, partial := range uc.partialChargerData {
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
		partialStatus[chargerID] = status
	}
	
	return map[string]interface{}{
		"active_ports":        uc.activePorts,
		"udp_meter_buffers":   meterStatus,
		"udp_charger_buffers": chargerStatus,
		"partial_charger_data": partialStatus,
	}
}

func (uc *UDPCollector) logToDatabase(action, details string) {
	uc.db.Exec(`
		INSERT INTO admin_logs (action, details, ip_address)
		VALUES (?, ?, 'udp-system')
	`, action, details)
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