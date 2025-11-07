package services

import (
	"database/sql"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"sync"
	"time"

	"github.com/goburrow/modbus"
)

type ModbusCollector struct {
	db              *sql.DB
	clients         map[int]*ModbusClient
	mu              sync.RWMutex
	reconnectTicker *time.Ticker
}

type ModbusClient struct {
	meterID         int
	meterName       string
	handler         *modbus.TCPClientHandler
	client          modbus.Client
	ipAddress       string
	port            int
	registerAddress uint16
	registerCount   uint16
	unitID          byte
	isConnected     bool
	lastReading     float64
	lastReadTime    time.Time
	lastError       string
	mu              sync.Mutex
}

type ModbusMeterConfig struct {
	MeterID         int
	MeterName       string
	IPAddress       string
	Port            int
	RegisterAddress int
	RegisterCount   int
	UnitID          int
}

func NewModbusCollector(db *sql.DB) *ModbusCollector {
	mc := &ModbusCollector{
		db:              db,
		clients:         make(map[int]*ModbusClient),
		reconnectTicker: time.NewTicker(30 * time.Second),
	}
	return mc
}

func (mc *ModbusCollector) Start() {
	log.Println("=== Modbus TCP Collector Starting ===")
	
	// Initialize Modbus connections
	mc.initializeModbusConnections()
	
	// Start reconnection routine
	go mc.reconnectionRoutine()
	
	log.Println("=== Modbus TCP Collector Started ===")
}

func (mc *ModbusCollector) initializeModbusConnections() {
	mc.mu.Lock()
	defer mc.mu.Unlock()
	
	// Close existing connections
	for _, client := range mc.clients {
		if client.handler != nil {
			client.handler.Close()
		}
	}
	mc.clients = make(map[int]*ModbusClient)
	
	// Query all active Modbus TCP meters
	rows, err := mc.db.Query(`
		SELECT id, name, connection_config
		FROM meters
		WHERE is_active = 1 AND connection_type = 'modbus_tcp' AND is_archived = 0
	`)
	if err != nil {
		log.Printf("ERROR: Failed to query Modbus meters: %v", err)
		return
	}
	defer rows.Close()
	
	configs := []ModbusMeterConfig{}
	for rows.Next() {
		var id int
		var name, configJSON string
		if err := rows.Scan(&id, &name, &configJSON); err != nil {
			continue
		}
		
		config, err := parseModbusConfig(configJSON)
		if err != nil {
			log.Printf("ERROR: Failed to parse Modbus config for meter '%s': %v", name, err)
			continue
		}
		
		config.MeterID = id
		config.MeterName = name
		configs = append(configs, config)
	}
	
	log.Printf("Found %d active Modbus TCP meters", len(configs))
	
	// Create connections
	for _, config := range configs {
		client := mc.createModbusClient(config)
		mc.clients[config.MeterID] = client
		
		// Try initial connection
		if err := client.connect(); err != nil {
			log.Printf("WARNING: Failed initial connection to meter '%s': %v", config.MeterName, err)
		} else {
			log.Printf("SUCCESS: Connected to Modbus meter '%s' at %s:%d", 
				config.MeterName, config.IPAddress, config.Port)
		}
	}
}

func (mc *ModbusCollector) createModbusClient(config ModbusMeterConfig) *ModbusClient {
	handler := modbus.NewTCPClientHandler(fmt.Sprintf("%s:%d", config.IPAddress, config.Port))
	handler.Timeout = 10 * time.Second
	handler.SlaveId = byte(config.UnitID)
	
	return &ModbusClient{
		meterID:         config.MeterID,
		meterName:       config.MeterName,
		handler:         handler,
		ipAddress:       config.IPAddress,
		port:            config.Port,
		registerAddress: uint16(config.RegisterAddress),
		registerCount:   uint16(config.RegisterCount),
		unitID:          byte(config.UnitID),
		isConnected:     false,
	}
}

func (mc *ModbusCollector) reconnectionRoutine() {
	for range mc.reconnectTicker.C {
		mc.mu.RLock()
		clients := make([]*ModbusClient, 0, len(mc.clients))
		for _, client := range mc.clients {
			clients = append(clients, client)
		}
		mc.mu.RUnlock()
		
		for _, client := range clients {
			client.mu.Lock()
			if !client.isConnected {
				log.Printf("Attempting to reconnect to Modbus meter '%s'...", client.meterName)
				if err := client.connect(); err != nil {
					log.Printf("Reconnection failed for '%s': %v", client.meterName, err)
				} else {
					log.Printf("Successfully reconnected to '%s'", client.meterName)
				}
			}
			client.mu.Unlock()
		}
	}
}

func (mc *ModbusCollector) RestartConnections() {
	log.Println("Restarting Modbus TCP connections...")
	mc.initializeModbusConnections()
}

func (mc *ModbusCollector) ReadMeter(meterID int) (float64, error) {
	mc.mu.RLock()
	client, exists := mc.clients[meterID]
	mc.mu.RUnlock()
	
	if !exists {
		return 0, fmt.Errorf("meter %d not found in Modbus collector", meterID)
	}
	
	return client.readValue()
}

func (mc *ModbusCollector) GetConnectionStatus() map[string]interface{} {
	mc.mu.RLock()
	defer mc.mu.RUnlock()
	
	status := make(map[string]interface{})
	
	for meterID, client := range mc.clients {
		client.mu.Lock()
		status[fmt.Sprintf("meter_%d", meterID)] = map[string]interface{}{
			"meter_name":    client.meterName,
			"ip_address":    fmt.Sprintf("%s:%d", client.ipAddress, client.port),
			"is_connected":  client.isConnected,
			"last_reading":  client.lastReading,
			"last_update":   client.lastReadTime.Format("2006-01-02 15:04:05"),
			"last_error":    client.lastError,
			"register_addr": client.registerAddress,
			"unit_id":       client.unitID,
		}
		client.mu.Unlock()
	}
	
	return status
}

func (mc *ModbusCollector) Stop() {
	log.Println("Stopping Modbus TCP Collector...")
	
	if mc.reconnectTicker != nil {
		mc.reconnectTicker.Stop()
	}
	
	mc.mu.Lock()
	defer mc.mu.Unlock()
	
	for _, client := range mc.clients {
		if client.handler != nil {
			client.handler.Close()
		}
	}
	
	log.Println("Modbus TCP Collector stopped")
}

// ModbusClient methods

func (c *ModbusClient) connect() error {
	if err := c.handler.Connect(); err != nil {
		c.isConnected = false
		c.lastError = err.Error()
		return err
	}
	
	c.client = modbus.NewClient(c.handler)
	c.isConnected = true
	c.lastError = ""
	return nil
}

func (c *ModbusClient) readValue() (float64, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	
	if !c.isConnected {
		if err := c.connect(); err != nil {
			return 0, fmt.Errorf("not connected: %v", err)
		}
	}
	
	// Read holding registers (function code 3)
	results, err := c.client.ReadHoldingRegisters(c.registerAddress, c.registerCount)
	if err != nil {
		c.isConnected = false
		c.lastError = err.Error()
		log.Printf("ERROR: Modbus read failed for '%s': %v", c.meterName, err)
		return 0, err
	}
	
	// Parse the result based on register count
	var value float64
	
	if c.registerCount == 1 {
		// Single 16-bit register (unsigned integer)
		value = float64(binary.BigEndian.Uint16(results))
	} else if c.registerCount == 2 {
		// Two 16-bit registers = 32-bit float (IEEE 754)
		bits := binary.BigEndian.Uint32(results)
		value = float64(math.Float32frombits(bits))
	} else if c.registerCount == 4 {
		// Four 16-bit registers = 64-bit float (IEEE 754)
		bits := binary.BigEndian.Uint64(results)
		value = math.Float64frombits(bits)
	} else {
		// Default: treat as 32-bit unsigned integer
		if len(results) >= 4 {
			value = float64(binary.BigEndian.Uint32(results[:4]))
		} else {
			value = float64(binary.BigEndian.Uint16(results))
		}
	}
	
	// Update status
	c.lastReading = value
	c.lastReadTime = time.Now()
	c.lastError = ""
	c.isConnected = true
	
	return value, nil
}

// Helper functions

func parseModbusConfig(configJSON string) (ModbusMeterConfig, error) {
	var rawConfig map[string]interface{}
	if err := json.Unmarshal([]byte(configJSON), &rawConfig); err != nil {
		return ModbusMeterConfig{}, err
	}
	
	result := ModbusMeterConfig{
		Port:            502, // Default Modbus port
		RegisterAddress: 0,
		RegisterCount:   2,
		UnitID:          1,
	}
	
	if ip, ok := rawConfig["ip_address"].(string); ok {
		result.IPAddress = ip
	}
	
	if port, ok := rawConfig["port"].(float64); ok {
		result.Port = int(port)
	}
	
	if regAddr, ok := rawConfig["register_address"].(float64); ok {
		result.RegisterAddress = int(regAddr)
	}
	
	if regCount, ok := rawConfig["register_count"].(float64); ok {
		result.RegisterCount = int(regCount)
	}
	
	if unitID, ok := rawConfig["unit_id"].(float64); ok {
		result.UnitID = int(unitID)
	}
	
	if result.IPAddress == "" {
		return result, fmt.Errorf("ip_address is required")
	}
	
	return result, nil
}