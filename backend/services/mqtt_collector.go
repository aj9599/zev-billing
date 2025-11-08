package services

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
)

// MQTTCollector manages MQTT connections and collects meter data from MQTT devices
type MQTTCollector struct {
	db             *sql.DB
	client         mqtt.Client
	isRunning      bool
	mu             sync.RWMutex
	meterReadings  map[int]MQTTMeterReading  // meter_id -> last reading
	chargerData    map[int]MQTTChargerData   // charger_id -> last data
	stopChan       chan bool
}

// MQTTMeterReading stores the latest reading from an MQTT meter
type MQTTMeterReading struct {
	Power         float64   // Current power in kWh
	Timestamp     time.Time
	LastUpdated   time.Time
}

// MQTTChargerData stores the latest data from an MQTT charger
type MQTTChargerData struct {
	Power       float64
	UserID      string
	Mode        string
	State       string
	Timestamp   time.Time
	LastUpdated time.Time
}

// WhatWattGoMessage represents the JSON structure from WhatWatt Go devices
type WhatWattGoMessage struct {
	DeviceID    string  `json:"device_id"`     // Unique device identifier
	Timestamp   int64   `json:"timestamp"`     // Unix timestamp in milliseconds
	Energy      float64 `json:"energy"`        // Total energy in kWh
	Power       float64 `json:"power"`         // Current power in W
	Voltage     float64 `json:"voltage"`       // Voltage in V
	Current     float64 `json:"current"`       // Current in A
	Frequency   float64 `json:"frequency"`     // Frequency in Hz
	PowerFactor float64 `json:"power_factor"`  // Power factor (0-1)
}

// GenericMQTTMessage for flexible JSON parsing
type GenericMQTTMessage struct {
	Energy      *float64 `json:"energy"`
	Power       *float64 `json:"power"`
	PowerKWh    *float64 `json:"power_kwh"`
	Consumption *float64 `json:"consumption"`
	TotalKWh    *float64 `json:"total_kwh"`
	Value       *float64 `json:"value"`
	Reading     *float64 `json:"reading"`
	DeviceID    string   `json:"device_id"`
	Timestamp   int64    `json:"timestamp"`
}

func NewMQTTCollector(db *sql.DB) *MQTTCollector {
	return &MQTTCollector{
		db:            db,
		meterReadings: make(map[int]MQTTMeterReading),
		chargerData:   make(map[int]MQTTChargerData),
		stopChan:      make(chan bool),
	}
}

func (mc *MQTTCollector) Start() {
	mc.mu.Lock()
	if mc.isRunning {
		mc.mu.Unlock()
		return
	}
	mc.isRunning = true
	mc.mu.Unlock()

	log.Println("=== MQTT Collector Starting ===")
	
	// Connect to MQTT broker
	if err := mc.connectToBroker(); err != nil {
		log.Printf("ERROR: Failed to connect to MQTT broker: %v", err)
		return
	}

	// Subscribe to all active MQTT meters and chargers
	mc.subscribeToDevices()

	log.Println("=== MQTT Collector Started Successfully ===")

	// Keep running and reconnect if needed
	go mc.monitorConnection()
}

func (mc *MQTTCollector) Stop() {
	mc.mu.Lock()
	defer mc.mu.Unlock()

	if !mc.isRunning {
		return
	}

	log.Println("Stopping MQTT Collector...")
	mc.isRunning = false
	
	if mc.client != nil && mc.client.IsConnected() {
		mc.client.Disconnect(250)
	}
	
	close(mc.stopChan)
	log.Println("MQTT Collector stopped")
}

func (mc *MQTTCollector) connectToBroker() error {
	// MQTT broker configuration - using localhost since broker runs on same Pi
	brokerURL := "tcp://localhost:1883"
	clientID := fmt.Sprintf("zev-billing-%d", time.Now().Unix())

	opts := mqtt.NewClientOptions()
	opts.AddBroker(brokerURL)
	opts.SetClientID(clientID)
	opts.SetCleanSession(true)
	opts.SetAutoReconnect(true)
	opts.SetMaxReconnectInterval(10 * time.Second)
	opts.SetConnectionLostHandler(mc.onConnectionLost)
	opts.SetOnConnectHandler(mc.onConnect)

	// Optional: Set username/password if configured
	// opts.SetUsername("zev-billing")
	// opts.SetPassword("your-password")

	mc.client = mqtt.NewClient(opts)

	log.Printf("Connecting to MQTT broker at %s...", brokerURL)
	
	if token := mc.client.Connect(); token.Wait() && token.Error() != nil {
		return fmt.Errorf("failed to connect to MQTT broker: %v", token.Error())
	}

	log.Println("âœ… Connected to MQTT broker successfully")
	return nil
}

func (mc *MQTTCollector) onConnect(client mqtt.Client) {
	log.Println("MQTT connection established, subscribing to device topics...")
	mc.subscribeToDevices()
}

func (mc *MQTTCollector) onConnectionLost(client mqtt.Client, err error) {
	log.Printf("âš ï¸ MQTT connection lost: %v - Will attempt to reconnect", err)
}

func (mc *MQTTCollector) monitorConnection() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-mc.stopChan:
			return
		case <-ticker.C:
			if !mc.client.IsConnected() {
				log.Println("MQTT client disconnected, attempting to reconnect...")
				if token := mc.client.Connect(); token.Wait() && token.Error() != nil {
					log.Printf("Failed to reconnect: %v", token.Error())
				}
			}
		}
	}
}

func (mc *MQTTCollector) subscribeToDevices() {
	// Subscribe to all MQTT meters
	rows, err := mc.db.Query(`
		SELECT id, name, connection_config
		FROM meters 
		WHERE is_active = 1 AND connection_type = 'mqtt'
	`)
	if err != nil {
		log.Printf("ERROR: Failed to query MQTT meters: %v", err)
		return
	}
	defer rows.Close()

	meterCount := 0
	for rows.Next() {
		var id int
		var name, configJSON string
		if err := rows.Scan(&id, &name, &configJSON); err != nil {
			continue
		}

		var config map[string]interface{}
		if err := json.Unmarshal([]byte(configJSON), &config); err != nil {
			log.Printf("ERROR: Failed to parse config for meter '%s': %v", name, err)
			continue
		}

		topic, ok := config["mqtt_topic"].(string)
		if !ok || topic == "" {
			log.Printf("WARNING: No MQTT topic configured for meter '%s'", name)
			continue
		}

		// Subscribe to the meter's topic
		if token := mc.client.Subscribe(topic, 1, mc.createMeterHandler(id, name)); token.Wait() && token.Error() != nil {
			log.Printf("ERROR: Failed to subscribe to topic '%s' for meter '%s': %v", topic, name, token.Error())
		} else {
			log.Printf("âœ… Subscribed to MQTT topic '%s' for meter '%s'", topic, name)
			meterCount++
		}
	}

	// Subscribe to all MQTT chargers
	rows, err = mc.db.Query(`
		SELECT id, name, connection_config
		FROM chargers 
		WHERE is_active = 1 AND connection_type = 'mqtt'
	`)
	if err != nil {
		log.Printf("ERROR: Failed to query MQTT chargers: %v", err)
		return
	}
	defer rows.Close()

	chargerCount := 0
	for rows.Next() {
		var id int
		var name, configJSON string
		if err := rows.Scan(&id, &name, &configJSON); err != nil {
			continue
		}

		var config map[string]interface{}
		if err := json.Unmarshal([]byte(configJSON), &config); err != nil {
			log.Printf("ERROR: Failed to parse config for charger '%s': %v", name, err)
			continue
		}

		topic, ok := config["mqtt_topic"].(string)
		if !ok || topic == "" {
			log.Printf("WARNING: No MQTT topic configured for charger '%s'", name)
			continue
		}

		// Subscribe to the charger's topic
		if token := mc.client.Subscribe(topic, 1, mc.createChargerHandler(id, name)); token.Wait() && token.Error() != nil {
			log.Printf("ERROR: Failed to subscribe to topic '%s' for charger '%s': %v", topic, name, token.Error())
		} else {
			log.Printf("âœ… Subscribed to MQTT topic '%s' for charger '%s'", topic, name)
			chargerCount++
		}
	}

	log.Printf("MQTT Subscriptions: %d meters, %d chargers", meterCount, chargerCount)
}

func (mc *MQTTCollector) createMeterHandler(meterID int, meterName string) mqtt.MessageHandler {
	return func(client mqtt.Client, msg mqtt.Message) {
		payload := msg.Payload()
		topic := msg.Topic()
		
		log.Printf("MQTT: Received message for meter '%s' on topic '%s': %s", meterName, topic, string(payload))

		// Try to parse as WhatWatt Go format first
		var whatwattMsg WhatWattGoMessage
		if err := json.Unmarshal(payload, &whatwattMsg); err == nil && whatwattMsg.Energy > 0 {
			// WhatWatt Go format detected
			mc.mu.Lock()
			mc.meterReadings[meterID] = MQTTMeterReading{
				Power:       whatwattMsg.Energy, // Energy field contains total kWh
				Timestamp:   time.Unix(whatwattMsg.Timestamp/1000, 0),
				LastUpdated: time.Now(),
			}
			mc.mu.Unlock()
			
			log.Printf("âœ… MQTT: Saved WhatWatt Go reading for meter '%s': %.3f kWh (power: %.0f W)", 
				meterName, whatwattMsg.Energy, whatwattMsg.Power)
			return
		}

		// Try generic JSON format with flexible field names
		var genericMsg GenericMQTTMessage
		if err := json.Unmarshal(payload, &genericMsg); err == nil {
			var powerValue float64
			
			// Check various possible field names for energy reading
			if genericMsg.Energy != nil {
				powerValue = *genericMsg.Energy
			} else if genericMsg.PowerKWh != nil {
				powerValue = *genericMsg.PowerKWh
			} else if genericMsg.TotalKWh != nil {
				powerValue = *genericMsg.TotalKWh
			} else if genericMsg.Consumption != nil {
				powerValue = *genericMsg.Consumption
			} else if genericMsg.Value != nil {
				powerValue = *genericMsg.Value
			} else if genericMsg.Reading != nil {
				powerValue = *genericMsg.Reading
			} else if genericMsg.Power != nil {
				// If only instant power is provided, we might need to integrate it
				// For now, treat it as kWh if it's the only value
				powerValue = *genericMsg.Power
			}

			if powerValue > 0 {
				timestamp := time.Now()
				if genericMsg.Timestamp > 0 {
					timestamp = time.Unix(genericMsg.Timestamp/1000, 0)
				}

				mc.mu.Lock()
				mc.meterReadings[meterID] = MQTTMeterReading{
					Power:       powerValue,
					Timestamp:   timestamp,
					LastUpdated: time.Now(),
				}
				mc.mu.Unlock()
				
				log.Printf("âœ… MQTT: Saved reading for meter '%s': %.3f kWh", meterName, powerValue)
				return
			}
		}

		// Try simple numeric value
		var numericValue float64
		if err := json.Unmarshal(payload, &numericValue); err == nil && numericValue > 0 {
			mc.mu.Lock()
			mc.meterReadings[meterID] = MQTTMeterReading{
				Power:       numericValue,
				Timestamp:   time.Now(),
				LastUpdated: time.Now(),
			}
			mc.mu.Unlock()
			
			log.Printf("âœ… MQTT: Saved numeric reading for meter '%s': %.3f kWh", meterName, numericValue)
			return
		}

		log.Printf("WARNING: Could not parse MQTT message for meter '%s': %s", meterName, string(payload))
	}
}

func (mc *MQTTCollector) createChargerHandler(chargerID int, chargerName string) mqtt.MessageHandler {
	return func(client mqtt.Client, msg mqtt.Message) {
		payload := msg.Payload()
		topic := msg.Topic()
		
		log.Printf("MQTT: Received message for charger '%s' on topic '%s': %s", chargerName, topic, string(payload))

		// Parse charger data (simplified, adjust based on your charger's format)
		var data map[string]interface{}
		if err := json.Unmarshal(payload, &data); err != nil {
			log.Printf("WARNING: Could not parse MQTT message for charger '%s': %v", chargerName, err)
			return
		}

		// Extract relevant fields with flexible naming
		power, _ := extractFloat(data, "energy", "power_kwh", "power", "total_kwh")
		userID, _ := extractString(data, "user_id", "user", "rfid", "card_id")
		mode, _ := extractString(data, "mode", "charging_mode")
		state, _ := extractString(data, "state", "status", "charging_state")

		if power > 0 {
			mc.mu.Lock()
			mc.chargerData[chargerID] = MQTTChargerData{
				Power:       power,
				UserID:      userID,
				Mode:        mode,
				State:       state,
				Timestamp:   time.Now(),
				LastUpdated: time.Now(),
			}
			mc.mu.Unlock()
			
			log.Printf("âœ… MQTT: Saved charger data for '%s': %.3f kWh (user: %s, mode: %s)", 
				chargerName, power, userID, mode)
		}
	}
}

// Helper function to extract float from map with multiple possible keys
func extractFloat(data map[string]interface{}, keys ...string) (float64, bool) {
	for _, key := range keys {
		if val, ok := data[key]; ok {
			switch v := val.(type) {
			case float64:
				return v, true
			case float32:
				return float64(v), true
			case int:
				return float64(v), true
			case int64:
				return float64(v), true
			}
		}
	}
	return 0, false
}

// Helper function to extract string from map with multiple possible keys
func extractString(data map[string]interface{}, keys ...string) (string, bool) {
	for _, key := range keys {
		if val, ok := data[key]; ok {
			if str, ok := val.(string); ok {
				return str, true
			}
		}
	}
	return "", false
}

func (mc *MQTTCollector) GetMeterReading(meterID int) (float64, bool) {
	mc.mu.RLock()
	defer mc.mu.RUnlock()

	reading, exists := mc.meterReadings[meterID]
	if !exists {
		return 0, false
	}

	// Check if reading is too old (more than 30 minutes)
	if time.Since(reading.LastUpdated) > 30*time.Minute {
		log.Printf("WARNING: MQTT reading for meter %d is stale (%.0f minutes old)", 
			meterID, time.Since(reading.LastUpdated).Minutes())
		return 0, false
	}

	return reading.Power, true
}

func (mc *MQTTCollector) GetChargerData(chargerID int) (MQTTChargerData, bool) {
	mc.mu.RLock()
	defer mc.mu.RUnlock()

	data, exists := mc.chargerData[chargerID]
	if !exists {
		return MQTTChargerData{}, false
	}

	// Check if data is too old
	if time.Since(data.LastUpdated) > 30*time.Minute {
		return MQTTChargerData{}, false
	}

	return data, true
}

func (mc *MQTTCollector) RestartConnections() {
	log.Println("=== Restarting MQTT Collector ===")
	
	mc.Stop()
	time.Sleep(2 * time.Second)
	mc.Start()
	
	log.Println("=== MQTT Collector Restarted ===")
}

func (mc *MQTTCollector) GetConnectionStatus() map[string]interface{} {
	mc.mu.RLock()
	defer mc.mu.RUnlock()

	isConnected := false
	if mc.client != nil {
		isConnected = mc.client.IsConnected()
	}

	// Count active MQTT devices
	var mqttMeterCount, mqttChargerCount int
	mc.db.QueryRow("SELECT COUNT(*) FROM meters WHERE is_active = 1 AND connection_type = 'mqtt'").Scan(&mqttMeterCount)
	mc.db.QueryRow("SELECT COUNT(*) FROM chargers WHERE is_active = 1 AND connection_type = 'mqtt'").Scan(&mqttChargerCount)

	// Get recent readings info
	recentReadings := 0
	for _, reading := range mc.meterReadings {
		if time.Since(reading.LastUpdated) < 5*time.Minute {
			recentReadings++
		}
	}

	return map[string]interface{}{
		"mqtt_broker_connected": isConnected,
		"mqtt_meters_count":     mqttMeterCount,
		"mqtt_chargers_count":   mqttChargerCount,
		"mqtt_recent_readings":  recentReadings,
		"mqtt_broker_url":       "tcp://localhost:1883",
	}
}

