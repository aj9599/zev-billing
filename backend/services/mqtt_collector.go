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
	clients        map[string]mqtt.Client    // broker URL -> MQTT client
	isRunning      bool
	mu             sync.RWMutex
	meterReadings  map[int]MQTTMeterReading  // meter_id -> last reading
	chargerData    map[int]MQTTChargerData   // charger_id -> last data
	meterBrokers   map[int]string            // meter_id -> broker URL
	meterTopics    map[int]string            // meter_id -> topic
	subscriptions  map[string][]string       // broker URL -> list of topics
	stopChan       chan bool
	stopOnce       sync.Once                 // Prevents double-close panic on stopChan
}

// MQTTMeterReading stores the latest reading from an MQTT meter
type MQTTMeterReading struct {
	Power         float64   // Total energy in kWh (import) - cumulative meter reading
	PowerExport   float64   // Export/return energy in kWh - cumulative meter reading
	LivePowerW    float64   // Current instantaneous power in Watts (for live display)
	LivePowerExpW float64   // Current instantaneous export power in Watts (for solar)
	Timestamp     time.Time
	LastUpdated   time.Time
	IsConnected   bool      // Track if this specific meter's broker is connected
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

// Shelly3EMMessage represents the JSON structure from Shelly 3EM devices (emdata:0 topic - cumulative energy)
type Shelly3EMMessage struct {
	ID                  int     `json:"id"`
	ATotalActEnergy     float64 `json:"a_total_act_energy"`      // Phase A import (Wh)
	ATotalActRetEnergy  float64 `json:"a_total_act_ret_energy"`  // Phase A export (Wh)
	BTotalActEnergy     float64 `json:"b_total_act_energy"`      // Phase B import (Wh)
	BTotalActRetEnergy  float64 `json:"b_total_act_ret_energy"`  // Phase B export (Wh)
	CTotalActEnergy     float64 `json:"c_total_act_energy"`      // Phase C import (Wh)
	CTotalActRetEnergy  float64 `json:"c_total_act_ret_energy"`  // Phase C export (Wh)
	TotalAct            float64 `json:"total_act"`               // Total import (Wh)
	TotalActRet         float64 `json:"total_act_ret"`           // Total export (Wh)
}

// Shelly3EMLiveMessage represents the JSON structure from Shelly 3EM em:0 topic (live power data)
type Shelly3EMLiveMessage struct {
	ID            int     `json:"id"`
	ACurrent      float64 `json:"a_current"`       // Phase A current (A)
	AVoltage      float64 `json:"a_voltage"`       // Phase A voltage (V)
	AActPower     float64 `json:"a_act_power"`     // Phase A active power (W)
	AAprtPower    float64 `json:"a_aprt_power"`    // Phase A apparent power (VA)
	APF           float64 `json:"a_pf"`            // Phase A power factor
	BCurrent      float64 `json:"b_current"`       // Phase B current (A)
	BVoltage      float64 `json:"b_voltage"`       // Phase B voltage (V)
	BActPower     float64 `json:"b_act_power"`     // Phase B active power (W)
	BAprtPower    float64 `json:"b_aprt_power"`    // Phase B apparent power (VA)
	BPF           float64 `json:"b_pf"`            // Phase B power factor
	CCurrent      float64 `json:"c_current"`       // Phase C current (A)
	CVoltage      float64 `json:"c_voltage"`       // Phase C voltage (V)
	CActPower     float64 `json:"c_act_power"`     // Phase C active power (W)
	CAprtPower    float64 `json:"c_aprt_power"`    // Phase C apparent power (VA)
	CPF           float64 `json:"c_pf"`            // Phase C power factor
	NCurrent      *float64 `json:"n_current"`      // Neutral current (A) - optional
	TotalCurrent  float64 `json:"total_current"`   // Total current (A)
	TotalActPower float64 `json:"total_act_power"` // Total active power (W) - THIS IS THE LIVE POWER
	TotalAprtPower float64 `json:"total_aprt_power"` // Total apparent power (VA)
}

// ShellyEMMessage represents the JSON structure from Shelly EM devices (single phase)
type ShellyEMMessage struct {
	ID              int     `json:"id"`
	TotalActEnergy  float64 `json:"total_act_energy"`      // Import (Wh)
	TotalActRetEnergy float64 `json:"total_act_ret_energy"` // Export (Wh)
	TotalAct        float64 `json:"total_act"`             // Total import (Wh)
	TotalActRet     float64 `json:"total_act_ret"`         // Total export (Wh)
}

// Shelly2PMMessage represents the JSON structure from Shelly 2PM devices (dual channel)
type Shelly2PMMessage struct {
	ID         int                    `json:"id"`
	Source     string                 `json:"source"`
	Output     bool                   `json:"output"`
	APower     float64                `json:"apower"`      // Current power in W
	Voltage    float64                `json:"voltage"`     // Voltage in V
	Freq       float64                `json:"freq"`        // Frequency in Hz
	Current    float64                `json:"current"`     // Current in A
	PF         float64                `json:"pf"`          // Power factor
	AEnergy    Shelly2PMEnergyObject  `json:"aenergy"`     // Total active energy (import+export)
	RetAEnergy Shelly2PMEnergyObject  `json:"ret_aenergy"` // Return/export energy
	Temperature map[string]float64    `json:"temperature"` // Temperature readings
}

// Shelly2PMEnergyObject represents the nested energy object in Shelly 2PM messages
type Shelly2PMEnergyObject struct {
	Total     float64   `json:"total"`      // Total energy in Wh
	ByMinute  []float64 `json:"by_minute"`  // Energy by minute
	MinuteTS  int64     `json:"minute_ts"`  // Timestamp
}

// GenericMQTTMessage for flexible JSON parsing
type GenericMQTTMessage struct {
	Energy       *float64 `json:"energy"`
	EnergyExport *float64 `json:"energy_export"`
	Power        *float64 `json:"power"`
	PowerKWh     *float64 `json:"power_kwh"`
	PowerExport  *float64 `json:"power_export"`
	Consumption  *float64 `json:"consumption"`
	TotalKWh     *float64 `json:"total_kwh"`
	TotalExport  *float64 `json:"total_export"`
	Import       *float64 `json:"import"`
	Export       *float64 `json:"export"`
	Value        *float64 `json:"value"`
	Reading      *float64 `json:"reading"`
	DeviceID     string   `json:"device_id"`
	Timestamp    int64    `json:"timestamp"`
}

func NewMQTTCollector(db *sql.DB) *MQTTCollector {
	return &MQTTCollector{
		db:            db,
		clients:       make(map[string]mqtt.Client),
		meterReadings: make(map[int]MQTTMeterReading),
		chargerData:   make(map[int]MQTTChargerData),
		meterBrokers:  make(map[int]string),
		meterTopics:   make(map[int]string),
		subscriptions: make(map[string][]string),
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
	
	// Connect to all configured MQTT brokers
	if err := mc.connectToAllBrokers(); err != nil {
		log.Printf("ERROR: Failed to initialize MQTT connections: %v", err)
		return
	}

	log.Println("=== MQTT Collector Started Successfully ===")

	// Keep running and reconnect if needed
	go mc.monitorConnections()
}

func (mc *MQTTCollector) Stop() {
	mc.mu.Lock()
	defer mc.mu.Unlock()

	if !mc.isRunning {
		return
	}

	log.Println("Stopping MQTT Collector...")
	mc.isRunning = false
	
	// Disconnect all clients
	for brokerURL, client := range mc.clients {
		if client != nil && client.IsConnected() {
			log.Printf("Disconnecting from MQTT broker: %s", brokerURL)
			client.Disconnect(250)
		}
	}
	
	// Use sync.Once to safely close stopChan exactly once (prevents double-close panic)
	mc.stopOnce.Do(func() {
		close(mc.stopChan)
	})
	
	log.Println("MQTT Collector stopped")
}

func (mc *MQTTCollector) connectToAllBrokers() error {
	// Get all unique broker configurations from meters
	rows, err := mc.db.Query(`
		SELECT DISTINCT connection_config
		FROM meters 
		WHERE is_active = 1 AND connection_type = 'mqtt'
	`)
	if err != nil {
		return fmt.Errorf("failed to query MQTT meters: %v", err)
	}
	defer rows.Close()

	brokerConfigs := make(map[string]map[string]interface{}) // broker URL -> config

	for rows.Next() {
		var configJSON string
		if err := rows.Scan(&configJSON); err != nil {
			continue
		}

		var config map[string]interface{}
		if err := json.Unmarshal([]byte(configJSON), &config); err != nil {
			log.Printf("ERROR: Failed to parse config: %v", err)
			continue
		}

		broker, _ := config["mqtt_broker"].(string)
		port, _ := config["mqtt_port"].(float64)
		if broker == "" {
			broker = "localhost"
		}
		if port == 0 {
			port = 1883
		}

		brokerURL := fmt.Sprintf("tcp://%s:%.0f", broker, port)
		brokerConfigs[brokerURL] = config
	}

	if len(brokerConfigs) == 0 {
		log.Println("No MQTT brokers configured")
		return nil
	}

	// Connect to each unique broker
	for brokerURL, config := range brokerConfigs {
		if err := mc.connectToBroker(brokerURL, config); err != nil {
			log.Printf("ERROR: Failed to connect to broker %s: %v", brokerURL, err)
			// Continue with other brokers even if one fails
		}
	}

	return nil
}

func (mc *MQTTCollector) connectToBroker(brokerURL string, config map[string]interface{}) error {
	clientID := fmt.Sprintf("zev-billing-%d-%s", time.Now().Unix(), strings.ReplaceAll(brokerURL, ":", "_"))

	opts := mqtt.NewClientOptions()
	opts.AddBroker(brokerURL)
	opts.SetClientID(clientID)
	opts.SetCleanSession(true)
	opts.SetAutoReconnect(true)
	opts.SetMaxReconnectInterval(10 * time.Second)
	opts.SetKeepAlive(60 * time.Second)
	opts.SetPingTimeout(10 * time.Second)
	opts.SetWriteTimeout(10 * time.Second)
	opts.SetConnectionLostHandler(mc.createConnectionLostHandler(brokerURL))
	opts.SetOnConnectHandler(mc.createOnConnectHandler(brokerURL))
	
	// Set authentication if provided
	username, _ := config["mqtt_username"].(string)
	password, _ := config["mqtt_password"].(string)
	if username != "" {
		opts.SetUsername(username)
		opts.SetPassword(password)
		log.Printf("Using authentication for broker %s (username: %s)", brokerURL, username)
	} else {
		log.Printf("No authentication configured for broker %s", brokerURL)
	}

	client := mqtt.NewClient(opts)

	log.Printf("Connecting to MQTT broker at %s...", brokerURL)
	
	if token := client.Connect(); token.Wait() && token.Error() != nil {
		return fmt.Errorf("failed to connect: %v", token.Error())
	}

	mc.mu.Lock()
	mc.clients[brokerURL] = client
	mc.mu.Unlock()

	log.Printf("✓ Connected to MQTT broker successfully: %s", brokerURL)
	return nil
}

func (mc *MQTTCollector) createOnConnectHandler(brokerURL string) func(mqtt.Client) {
	return func(client mqtt.Client) {
		log.Printf("MQTT connection established to %s, subscribing to device topics...", brokerURL)
		mc.subscribeToDevices(brokerURL)
	}
}

func (mc *MQTTCollector) createConnectionLostHandler(brokerURL string) func(mqtt.Client, error) {
	return func(client mqtt.Client, err error) {
		log.Printf("âš ï¸ MQTT connection lost to %s: %v - Will attempt to reconnect", brokerURL, err)
		
		// Mark all meters using this broker as disconnected
		mc.mu.Lock()
		for meterID, broker := range mc.meterBrokers {
			if broker == brokerURL {
				if reading, exists := mc.meterReadings[meterID]; exists {
					reading.IsConnected = false
					mc.meterReadings[meterID] = reading
				}
			}
		}
		mc.mu.Unlock()
	}
}

func (mc *MQTTCollector) monitorConnections() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-mc.stopChan:
			return
		case <-ticker.C:
			mc.mu.RLock()
			for brokerURL, client := range mc.clients {
				if !client.IsConnected() {
					log.Printf("MQTT client disconnected from %s, attempting to reconnect...", brokerURL)
					if token := client.Connect(); token.Wait() && token.Error() != nil {
						log.Printf("Failed to reconnect to %s: %v", brokerURL, token.Error())
					}
				}
			}
			mc.mu.RUnlock()
		}
	}
}

func (mc *MQTTCollector) unsubscribeFromAllTopics(brokerURL string) {
	mc.mu.Lock()
	defer mc.mu.Unlock()
	
	client := mc.clients[brokerURL]
	if client == nil || !client.IsConnected() {
		log.Printf("Cannot unsubscribe - client for %s is not connected", brokerURL)
		return
	}
	
	// Unsubscribe from all topics for this broker
	if topics, exists := mc.subscriptions[brokerURL]; exists && len(topics) > 0 {
		log.Printf("Unsubscribing from %d existing topics for broker %s", len(topics), brokerURL)
		for _, topic := range topics {
			log.Printf("  - Unsubscribing from: %s", topic)
			if token := client.Unsubscribe(topic); token.Wait() && token.Error() != nil {
				log.Printf("    WARNING: Failed to unsubscribe: %v", token.Error())
			}
		}
		// Clear the subscription list for this broker
		mc.subscriptions[brokerURL] = []string{}
		log.Printf("✓ Cleared all subscriptions for broker %s", brokerURL)
	} else {
		log.Printf("No existing subscriptions found for broker %s", brokerURL)
	}
}

func (mc *MQTTCollector) subscribeToDevices(brokerURL string) {
	log.Printf("=== Starting subscription process for broker: %s ===", brokerURL)
	
	// First, unsubscribe from all existing topics for this broker to prevent duplicates
	mc.unsubscribeFromAllTopics(brokerURL)
	
	// Get all MQTT meters using this broker
	rows, err := mc.db.Query(`
		SELECT id, name, connection_config, device_type
		FROM meters 
		WHERE is_active = 1 AND connection_type = 'mqtt'
	`)
	if err != nil {
		log.Printf("ERROR: Failed to query MQTT meters: %v", err)
		return
	}
	defer rows.Close()

	mc.mu.RLock()
	client := mc.clients[brokerURL]
	mc.mu.RUnlock()

	if client == nil {
		log.Printf("ERROR: No client found for broker %s", brokerURL)
		return
	}

	meterCount := 0
	subscribedTopics := []string{}
	
	for rows.Next() {
		var id int
		var name, configJSON string
		var deviceType sql.NullString
		if err := rows.Scan(&id, &name, &configJSON, &deviceType); err != nil {
			continue
		}

		var config map[string]interface{}
		if err := json.Unmarshal([]byte(configJSON), &config); err != nil {
			log.Printf("ERROR: Failed to parse config for meter '%s': %v", name, err)
			continue
		}

		// Check if this meter uses this broker
		broker, _ := config["mqtt_broker"].(string)
		port, _ := config["mqtt_port"].(float64)
		if broker == "" {
			broker = "localhost"
		}
		if port == 0 {
			port = 1883
		}
		meterBrokerURL := fmt.Sprintf("tcp://%s:%.0f", broker, port)

		if meterBrokerURL != brokerURL {
			continue // This meter uses a different broker
		}

		topic, ok := config["mqtt_topic"].(string)
		if !ok || topic == "" {
			log.Printf("WARNING: No MQTT topic configured for meter '%s'", name)
			continue
		}

		deviceTypeStr := "generic"
		if deviceType.Valid && deviceType.String != "" {
			deviceTypeStr = deviceType.String
		}

		// Store broker and topic mapping
		mc.mu.Lock()
		mc.meterBrokers[id] = brokerURL
		mc.meterTopics[id] = topic
		mc.mu.Unlock()

		// Subscribe to the meter's topic
		// Note: If you need wildcard subscriptions, add # or + to the topic in the meter configuration
		subscribeTopics := []string{topic}

		// For Shelly 3EM, also subscribe to em:0 topic for live power data
		// If the main topic contains emdata:0, add the corresponding em:0 topic for live power
		if deviceTypeStr == "shelly-3em" {
			if strings.Contains(topic, "/emdata:0") {
				liveTopic := strings.Replace(topic, "/emdata:0", "/em:0", 1)
				subscribeTopics = append(subscribeTopics, liveTopic)
				log.Printf("  ⚡ Adding live power topic for Shelly 3EM: %s", liveTopic)
			} else if strings.Contains(topic, "/em:0") {
				// Main topic is em:0 (live), also subscribe to emdata:0 (energy)
				energyTopic := strings.Replace(topic, "/em:0", "/emdata:0", 1)
				subscribeTopics = append(subscribeTopics, energyTopic)
				log.Printf("  📊 Adding energy topic for Shelly 3EM: %s", energyTopic)
			} else {
				// Topic doesn't match known patterns, try to derive both
				// e.g., if topic is "meters/device/status", add both em:0 and emdata:0
				baseTopic := strings.TrimSuffix(topic, "/status")
				if baseTopic != topic {
					subscribeTopics = append(subscribeTopics, baseTopic+"/status/em:0")
					subscribeTopics = append(subscribeTopics, baseTopic+"/status/emdata:0")
					log.Printf("  ⚡📊 Adding derived topics for Shelly 3EM: em:0 and emdata:0")
				}
			}
		}

		for _, subTopic := range subscribeTopics {
			// Check if already subscribed to prevent duplicate subscriptions
			alreadySubscribed := false
			for _, existingTopic := range subscribedTopics {
				if existingTopic == subTopic {
					alreadySubscribed = true
					break
				}
			}
			
			if alreadySubscribed {
				log.Printf("âš ï¸  Already subscribed to topic '%s' in this session, skipping", subTopic)
				continue
			}
			
			if token := client.Subscribe(subTopic, 1, mc.createMeterHandler(id, name, deviceTypeStr, brokerURL)); token.Wait() && token.Error() != nil {
				log.Printf("ERROR: Failed to subscribe to topic '%s' for meter '%s': %v", subTopic, name, token.Error())
			} else {
				log.Printf("✓ Subscribed to MQTT topic '%s' for meter '%s' (device: %s)", subTopic, name, deviceTypeStr)
				subscribedTopics = append(subscribedTopics, subTopic)
				meterCount++
			}
		}
	}

	// Subscribe to all MQTT chargers using this broker
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

		// Check if this charger uses this broker
		broker, _ := config["mqtt_broker"].(string)
		port, _ := config["mqtt_port"].(float64)
		if broker == "" {
			broker = "localhost"
		}
		if port == 0 {
			port = 1883
		}
		chargerBrokerURL := fmt.Sprintf("tcp://%s:%.0f", broker, port)

		if chargerBrokerURL != brokerURL {
			continue // This charger uses a different broker
		}

		topic, ok := config["mqtt_topic"].(string)
		if !ok || topic == "" {
			log.Printf("WARNING: No MQTT topic configured for charger '%s'", name)
			continue
		}

		// Check if already subscribed
		alreadySubscribed := false
		for _, existingTopic := range subscribedTopics {
			if existingTopic == topic {
				alreadySubscribed = true
				break
			}
		}
		
		if alreadySubscribed {
			log.Printf("âš ï¸  Already subscribed to topic '%s' in this session, skipping", topic)
			continue
		}

		// Subscribe to the charger's topic
		if token := client.Subscribe(topic, 1, mc.createChargerHandler(id, name)); token.Wait() && token.Error() != nil {
			log.Printf("ERROR: Failed to subscribe to topic '%s' for charger '%s': %v", topic, name, token.Error())
		} else {
			log.Printf("✓ Subscribed to MQTT topic '%s' for charger '%s'", topic, name)
			subscribedTopics = append(subscribedTopics, topic)
			chargerCount++
		}
	}

	// Store all subscribed topics for this broker
	mc.mu.Lock()
	mc.subscriptions[brokerURL] = subscribedTopics
	mc.mu.Unlock()

	log.Printf("=== MQTT Subscriptions Complete for %s ===", brokerURL)
	log.Printf("    Meters: %d, Chargers: %d, Unique Topics: %d", meterCount, chargerCount, len(subscribedTopics))
	log.Printf("    Topics: %v", subscribedTopics)
}

func (mc *MQTTCollector) createMeterHandler(meterID int, meterName string, deviceType string, brokerURL string) mqtt.MessageHandler {
	return func(client mqtt.Client, msg mqtt.Message) {
		// Recover from panics in message handlers to prevent crashing the MQTT connection
		defer func() {
			if r := recover(); r != nil {
				log.Printf("ERROR: MQTT meter handler panic for '%s': %v", meterName, r)
			}
		}()

		payload := msg.Payload()
		topic := msg.Topic()

		log.Printf("MQTT: Received message for meter '%s' (type: %s) on topic '%s': %s", meterName, deviceType, topic, string(payload))

		var importValue, exportValue float64
		var timestamp time.Time
		found := false

		// Parse based on device type
		switch deviceType {
		case "whatwatt-go":
			var whatwattMsg WhatWattGoMessage
			if err := json.Unmarshal(payload, &whatwattMsg); err == nil && whatwattMsg.Energy > 0 {
				importValue = whatwattMsg.Energy
				exportValue = 0 // WhatWatt Go doesn't track export
				timestamp = time.Unix(whatwattMsg.Timestamp/1000, 0)
				found = true
				log.Printf("✓ Parsed WhatWatt Go format: import=%.3f kWh", importValue)
			}

		case "shelly-3em":
			// First try to parse as live power data (em:0 topic)
			// Check if this looks like em:0 data (has total_act_power field)
			if strings.Contains(string(payload), "total_act_power") {
				var shellyLiveMsg Shelly3EMLiveMessage
				if err := json.Unmarshal(payload, &shellyLiveMsg); err == nil {
					// This is live power data from em:0 topic
					// Store live power in Watts (positive = import, negative = export)
					mc.mu.Lock()
					existing := mc.meterReadings[meterID]
					if shellyLiveMsg.TotalActPower >= 0 {
						existing.LivePowerW = shellyLiveMsg.TotalActPower
						existing.LivePowerExpW = 0
					} else {
						existing.LivePowerW = 0
						existing.LivePowerExpW = -shellyLiveMsg.TotalActPower // Make positive for export
					}
					existing.LastUpdated = time.Now()
					existing.IsConnected = true
					mc.meterReadings[meterID] = existing
					mc.mu.Unlock()
					log.Printf("✓ Parsed Shelly 3EM LIVE power: %.1f W (import: %.1f W, export: %.1f W)",
						shellyLiveMsg.TotalActPower, existing.LivePowerW, existing.LivePowerExpW)
					return // Don't continue to energy parsing for live data
				}
			}

			// Try to parse as energy data (emdata:0 topic)
			var shellyMsg Shelly3EMMessage
			if err := json.Unmarshal(payload, &shellyMsg); err == nil {
				// Check if we have valid data (Wh values)
				if shellyMsg.TotalAct > 0 || shellyMsg.ATotalActEnergy > 0 {
					// Convert Wh to kWh
					if shellyMsg.TotalAct > 0 {
						importValue = shellyMsg.TotalAct / 1000.0
						exportValue = shellyMsg.TotalActRet / 1000.0
					} else {
						// Sum individual phases
						importValue = (shellyMsg.ATotalActEnergy + shellyMsg.BTotalActEnergy + shellyMsg.CTotalActEnergy) / 1000.0
						exportValue = (shellyMsg.ATotalActRetEnergy + shellyMsg.BTotalActRetEnergy + shellyMsg.CTotalActRetEnergy) / 1000.0
					}
					timestamp = time.Now()
					found = true
					log.Printf("✓ Parsed Shelly 3EM energy: import=%.3f kWh, export=%.3f kWh", importValue, exportValue)
				}
			} else {
				log.Printf("DEBUG: Failed to parse as Shelly 3EM: %v", err)
			}

		case "shelly-em":
			var shellyMsg ShellyEMMessage
			if err := json.Unmarshal(payload, &shellyMsg); err == nil {
				if shellyMsg.TotalAct > 0 {
					// Convert Wh to kWh
					importValue = shellyMsg.TotalAct / 1000.0
					exportValue = shellyMsg.TotalActRet / 1000.0
					timestamp = time.Now()
					found = true
					log.Printf("✓ Parsed Shelly EM format: import=%.3f kWh, export=%.3f kWh", importValue, exportValue)
				} else if shellyMsg.TotalActEnergy > 0 {
					// Alternative field names
					importValue = shellyMsg.TotalActEnergy / 1000.0
					exportValue = shellyMsg.TotalActRetEnergy / 1000.0
					timestamp = time.Now()
					found = true
					log.Printf("✓ Parsed Shelly EM format (alt): import=%.3f kWh, export=%.3f kWh", importValue, exportValue)
				}
			}

		case "shelly-2pm":
			var shelly2PMMsg Shelly2PMMessage
			if err := json.Unmarshal(payload, &shelly2PMMsg); err == nil {
				log.Printf("DEBUG: Shelly 2PM parsed - ID:%d, AEnergy.Total:%.3f, RetAEnergy.Total:%.3f, APower:%.1f W",
					shelly2PMMsg.ID, shelly2PMMsg.AEnergy.Total, shelly2PMMsg.RetAEnergy.Total, shelly2PMMsg.APower)

				// Capture live power (APower) - always available
				var livePowerW, livePowerExpW float64
				if shelly2PMMsg.APower >= 0 {
					livePowerW = shelly2PMMsg.APower
					livePowerExpW = 0
				} else {
					livePowerW = 0
					livePowerExpW = -shelly2PMMsg.APower // Make positive for export
				}

				// Check if we have valid energy data (Wh values)
				// Note: Total can be very large (e.g., 170204.016 Wh), so just check >= 0
				if shelly2PMMsg.AEnergy.Total >= 0 {
					// Convert Wh to kWh
					// aenergy contains total active energy (import + export)
					// ret_aenergy contains return/export energy
					// Therefore: real import = aenergy - ret_aenergy
					importValue = (shelly2PMMsg.AEnergy.Total - shelly2PMMsg.RetAEnergy.Total) / 1000.0
					exportValue = shelly2PMMsg.RetAEnergy.Total / 1000.0
					timestamp = time.Now()
					found = true
					log.Printf("✓ Parsed Shelly 2PM: import=%.3f kWh, export=%.3f kWh, LIVE power=%.1f W (export: %.1f W)",
						importValue, exportValue, livePowerW, livePowerExpW)
				} else {
					log.Printf("DEBUG: Shelly 2PM AEnergy.Total is not valid: %.3f", shelly2PMMsg.AEnergy.Total)
				}

				// Always update live power even if energy data isn't valid yet
				mc.mu.Lock()
				existing := mc.meterReadings[meterID]
				existing.LivePowerW = livePowerW
				existing.LivePowerExpW = livePowerExpW
				existing.LastUpdated = time.Now()
				existing.IsConnected = true
				if found {
					existing.Power = importValue
					existing.PowerExport = exportValue
					existing.Timestamp = timestamp
				}
				mc.meterReadings[meterID] = existing
				mc.mu.Unlock()

				if found {
					return // We've already stored everything
				}
			} else {
				log.Printf("DEBUG: Failed to parse as Shelly 2PM: %v", err)
				log.Printf("DEBUG: Payload was: %s", string(payload))
			}

		case "generic", "custom", "":
			// Try generic JSON format with flexible field names
			var genericMsg GenericMQTTMessage
			if err := json.Unmarshal(payload, &genericMsg); err == nil {
				// Check various possible field names for import energy reading
				if genericMsg.Energy != nil {
					importValue = *genericMsg.Energy
				} else if genericMsg.PowerKWh != nil {
					importValue = *genericMsg.PowerKWh
				} else if genericMsg.TotalKWh != nil {
					importValue = *genericMsg.TotalKWh
				} else if genericMsg.Consumption != nil {
					importValue = *genericMsg.Consumption
				} else if genericMsg.Import != nil {
					importValue = *genericMsg.Import
				} else if genericMsg.Value != nil {
					importValue = *genericMsg.Value
				} else if genericMsg.Reading != nil {
					importValue = *genericMsg.Reading
				} else if genericMsg.Power != nil {
					importValue = *genericMsg.Power
				}

				// Check for export energy
				if genericMsg.EnergyExport != nil {
					exportValue = *genericMsg.EnergyExport
				} else if genericMsg.PowerExport != nil {
					exportValue = *genericMsg.PowerExport
				} else if genericMsg.TotalExport != nil {
					exportValue = *genericMsg.TotalExport
				} else if genericMsg.Export != nil {
					exportValue = *genericMsg.Export
				}

				if importValue > 0 {
					timestamp = time.Now()
					if genericMsg.Timestamp > 0 {
						timestamp = time.Unix(genericMsg.Timestamp/1000, 0)
					}
					found = true
					log.Printf("✓ Parsed generic format: import=%.3f kWh, export=%.3f kWh", importValue, exportValue)
				}
			}

			// Try simple numeric value as fallback
			if !found {
				var numericValue float64
				if err := json.Unmarshal(payload, &numericValue); err == nil && numericValue > 0 {
					importValue = numericValue
					exportValue = 0
					timestamp = time.Now()
					found = true
					log.Printf("✓ Parsed numeric format: import=%.3f kWh", importValue)
				}
			}
		}

		if found && importValue >= 0 {
			mc.mu.Lock()
			// IMPORTANT: Preserve existing live power values when updating energy data
			existing := mc.meterReadings[meterID]
			existing.Power = importValue
			existing.PowerExport = exportValue
			existing.Timestamp = timestamp
			existing.LastUpdated = time.Now()
			existing.IsConnected = true
			// Keep LivePowerW and LivePowerExpW if they were set from em:0 topic
			mc.meterReadings[meterID] = existing
			mc.mu.Unlock()

			log.Printf("✓ MQTT: Saved reading for meter '%s': import=%.3f kWh, export=%.3f kWh (live power preserved: %.1f W)",
				meterName, importValue, exportValue, existing.LivePowerW)
		} else {
			log.Printf("WARNING: Could not parse MQTT message for meter '%s' (device type: %s): %s",
				meterName, deviceType, string(payload))
		}
	}
}

func (mc *MQTTCollector) createChargerHandler(chargerID int, chargerName string) mqtt.MessageHandler {
	return func(client mqtt.Client, msg mqtt.Message) {
		// Recover from panics in message handlers to prevent crashing the MQTT connection
		defer func() {
			if r := recover(); r != nil {
				log.Printf("ERROR: MQTT charger handler panic for '%s': %v", chargerName, r)
			}
		}()

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
			
			log.Printf("✓ MQTT: Saved charger data for '%s': %.3f kWh (user: %s, mode: %s)", 
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

func (mc *MQTTCollector) GetMeterReading(meterID int) (float64, float64, bool) {
	mc.mu.RLock()
	defer mc.mu.RUnlock()

	reading, exists := mc.meterReadings[meterID]
	if !exists {
		return 0, 0, false
	}

	// Check if reading is too old (more than 30 minutes)
	if time.Since(reading.LastUpdated) > 30*time.Minute {
		log.Printf("WARNING: MQTT reading for meter %d is stale (%.0f minutes old)",
			meterID, time.Since(reading.LastUpdated).Minutes())
		return 0, 0, false
	}

	return reading.Power, reading.PowerExport, true
}

// GetMeterLivePower returns the instantaneous power in Watts for a meter
// Returns (importPowerW, exportPowerW, hasData)
// hasData is true if we have received live power data recently (even if power is 0)
func (mc *MQTTCollector) GetMeterLivePower(meterID int) (float64, float64, bool) {
	mc.mu.RLock()
	defer mc.mu.RUnlock()

	reading, exists := mc.meterReadings[meterID]
	if !exists {
		return 0, 0, false
	}

	// Check if reading is too old (more than 2 minutes for live data)
	if time.Since(reading.LastUpdated) > 2*time.Minute {
		return 0, 0, false
	}

	// Return live power if we have any live power data
	// Note: Both can be 0 if the power flow is exactly balanced
	// We check if the values are non-negative (they should always be >= 0 after processing)
	// A meter with live power will have at least one value set, or both are explicitly 0
	if reading.LivePowerW > 0 || reading.LivePowerExpW > 0 {
		return reading.LivePowerW, reading.LivePowerExpW, true
	}

	// If both are 0 but we have a recent reading, check if this meter has ever received live power
	// by checking if the reading was updated recently (within 30 seconds)
	// This handles the case where power flow is exactly 0
	if reading.LivePowerW == 0 && reading.LivePowerExpW == 0 && time.Since(reading.LastUpdated) < 30*time.Second {
		// Check if we have energy readings - if so, this meter is connected but just happens to have 0 power
		if reading.Power > 0 || reading.PowerExport > 0 {
			return 0, 0, true // Return 0 power as valid live data
		}
	}

	return 0, 0, false
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

	// Reset stopOnce and create a new channel for the fresh lifecycle
	mc.mu.Lock()
	mc.stopOnce = sync.Once{}
	mc.stopChan = make(chan bool)
	mc.mu.Unlock()

	time.Sleep(2 * time.Second)
	mc.Start()

	log.Println("=== MQTT Collector Restarted ===")
}

func (mc *MQTTCollector) GetConnectionStatus() map[string]interface{} {
	mc.mu.RLock()
	defer mc.mu.RUnlock()

	// Check if any broker is connected
	anyBrokerConnected := false
	connectedBrokers := []string{}
	totalBrokers := len(mc.clients)

	for brokerURL, client := range mc.clients {
		if client != nil && client.IsConnected() {
			anyBrokerConnected = true
			connectedBrokers = append(connectedBrokers, brokerURL)
		}
	}

	// Count active MQTT devices
	var mqttMeterCount, mqttChargerCount int
	mc.db.QueryRow("SELECT COUNT(*) FROM meters WHERE is_active = 1 AND connection_type = 'mqtt'").Scan(&mqttMeterCount)
	mc.db.QueryRow("SELECT COUNT(*) FROM chargers WHERE is_active = 1 AND connection_type = 'mqtt'").Scan(&mqttChargerCount)

	// Get recent readings info
	recentReadings := 0
	connectedMeters := 0
	for _, reading := range mc.meterReadings {
		if reading.IsConnected && time.Since(reading.LastUpdated) < 5*time.Minute {
			recentReadings++
			connectedMeters++
		}
	}

	// Build per-meter connection status
	mqttConnections := make(map[int]map[string]interface{})
	for meterID, reading := range mc.meterReadings {
		brokerURL := mc.meterBrokers[meterID]
		topic := mc.meterTopics[meterID]
		client := mc.clients[brokerURL]
		isBrokerConnected := client != nil && client.IsConnected()
		
		mqttConnections[meterID] = map[string]interface{}{
			"is_connected":       reading.IsConnected && isBrokerConnected,
			"last_reading":       reading.Power,
			"last_reading_export": reading.PowerExport,
			"last_update":        reading.LastUpdated.Format(time.RFC3339),
			"topic":              topic,
		}
		
		if !isBrokerConnected {
			mqttConnections[meterID]["last_error"] = fmt.Sprintf("Broker %s is not connected", brokerURL)
		} else if !reading.IsConnected {
			mqttConnections[meterID]["last_error"] = "Waiting for data"
		}
	}

	return map[string]interface{}{
		"mqtt_broker_connected":  anyBrokerConnected,
		"mqtt_brokers_total":     totalBrokers,
		"mqtt_brokers_connected": len(connectedBrokers),
		"mqtt_connected_brokers": connectedBrokers,
		"mqtt_meters_count":      mqttMeterCount,
		"mqtt_chargers_count":    mqttChargerCount,
		"mqtt_recent_readings":   recentReadings,
		"mqtt_connected_meters":  connectedMeters,
		"mqtt_connections":       mqttConnections,
	}
}