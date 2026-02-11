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
	stopChan        chan bool
	stopOnce        sync.Once
}

type ModbusClient struct {
	meterID              int
	meterName            string
	handler              *modbus.TCPClientHandler
	client               modbus.Client
	ipAddress            string
	port                 int
	registerAddress      uint16
	registerCount        uint16
	unitID               byte
	functionCode         byte
	dataType             string
	hasExportRegister    bool
	exportRegisterAddr   uint16
	isConnected          bool
	lastReadingImport    float64
	lastReadingExport    float64
	lastReadTime         time.Time
	lastError            string
	mu                   sync.Mutex
}

type ModbusMeterConfig struct {
	MeterID              int
	MeterName            string
	IPAddress            string
	Port                 int
	RegisterAddress      int
	RegisterCount        int
	UnitID               int
	FunctionCode         int
	DataType             string
	HasExportRegister    bool
	ExportRegisterAddr   int
}

func NewModbusCollector(db *sql.DB) *ModbusCollector {
	mc := &ModbusCollector{
		db:              db,
		clients:         make(map[int]*ModbusClient),
		reconnectTicker: time.NewTicker(30 * time.Second),
		stopChan:        make(chan bool),
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
		WHERE is_active = 1 AND connection_type = 'modbus_tcp'
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
			log.Printf("SUCCESS: Connected to Modbus meter '%s' at %s:%d (Unit:%d, FC:%d, Type:%s)", 
				config.MeterName, config.IPAddress, config.Port, config.UnitID, config.FunctionCode, config.DataType)
			if config.HasExportRegister {
				log.Printf("  → Export register enabled at address %d", config.ExportRegisterAddr)
			}
		}
	}
}

func (mc *ModbusCollector) createModbusClient(config ModbusMeterConfig) *ModbusClient {
	handler := modbus.NewTCPClientHandler(fmt.Sprintf("%s:%d", config.IPAddress, config.Port))
	handler.Timeout = 10 * time.Second
	handler.SlaveId = byte(config.UnitID)
	
	return &ModbusClient{
		meterID:            config.MeterID,
		meterName:          config.MeterName,
		handler:            handler,
		ipAddress:          config.IPAddress,
		port:               config.Port,
		registerAddress:    uint16(config.RegisterAddress),
		registerCount:      uint16(config.RegisterCount),
		unitID:             byte(config.UnitID),
		functionCode:       byte(config.FunctionCode),
		dataType:           config.DataType,
		hasExportRegister:  config.HasExportRegister,
		exportRegisterAddr: uint16(config.ExportRegisterAddr),
		isConnected:        false,
	}
}

func (mc *ModbusCollector) reconnectionRoutine() {
	for {
		select {
		case <-mc.stopChan:
			log.Println("Modbus reconnection routine stopping")
			return
		case <-mc.reconnectTicker.C:
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
}

func (mc *ModbusCollector) RestartConnections() {
	log.Println("Restarting Modbus TCP connections...")
	// Reset stopOnce and recreate channel for fresh lifecycle
	mc.stopOnce = sync.Once{}
	mc.stopChan = make(chan bool)
	mc.initializeModbusConnections()
	go mc.reconnectionRoutine()
}

// ReadMeter reads import and export energy for a single meter
func (mc *ModbusCollector) ReadMeter(meterID int) (float64, float64, error) {
	mc.mu.RLock()
	client, exists := mc.clients[meterID]
	mc.mu.RUnlock()
	
	if !exists {
		return 0, 0, fmt.Errorf("meter %d not found in Modbus collector", meterID)
	}
	
	return client.readValues()
}

// ReadAllMeters reads all meters in parallel
func (mc *ModbusCollector) ReadAllMeters() map[int]struct{ Import, Export float64 } {
	mc.mu.RLock()
	clients := make([]*ModbusClient, 0, len(mc.clients))
	for _, client := range mc.clients {
		clients = append(clients, client)
	}
	mc.mu.RUnlock()
	
	results := make(map[int]struct{ Import, Export float64 })
	resultsMu := sync.Mutex{}
	wg := sync.WaitGroup{}
	
	for _, client := range clients {
		wg.Add(1)
		go func(c *ModbusClient) {
			defer wg.Done()
			
			importVal, exportVal, err := c.readValues()
			if err != nil {
				log.Printf("ERROR: Failed to read Modbus meter '%s': %v", c.meterName, err)
				return
			}
			
			resultsMu.Lock()
			results[c.meterID] = struct{ Import, Export float64 }{importVal, exportVal}
			resultsMu.Unlock()
			
			if c.hasExportRegister {
				log.Printf("SUCCESS: Read Modbus meter '%s': %.3f kWh import, %.3f kWh export", c.meterName, importVal, exportVal)
			} else {
				log.Printf("SUCCESS: Read Modbus meter '%s': %.3f kWh", c.meterName, importVal)
			}
		}(client)
	}
	
	// Wait for all reads to complete (with timeout)
	done := make(chan bool)
	go func() {
		wg.Wait()
		done <- true
	}()
	
	select {
	case <-done:
		log.Printf("All Modbus meters read successfully (%d devices)", len(results))
	case <-time.After(30 * time.Second):
		log.Printf("WARNING: Modbus read timeout - some devices may not have responded")
	}
	
	return results
}

func (mc *ModbusCollector) GetConnectionStatus() map[string]interface{} {
	mc.mu.RLock()
	defer mc.mu.RUnlock()
	
	status := make(map[string]interface{})
	
	for meterID, client := range mc.clients {
		client.mu.Lock()
		clientStatus := map[string]interface{}{
			"meter_name":         client.meterName,
			"ip_address":         fmt.Sprintf("%s:%d", client.ipAddress, client.port),
			"is_connected":       client.isConnected,
			"last_reading":       client.lastReadingImport,
			"last_reading_export": client.lastReadingExport,
			"last_update":        client.lastReadTime.Format(time.RFC3339),
			"last_error":         client.lastError,
			"unit_id":            client.unitID,
			"function_code":      client.functionCode,
			"data_type":          client.dataType,
			"register_addr":      client.registerAddress,
			"has_export":         client.hasExportRegister,
		}
		if client.hasExportRegister {
			clientStatus["export_register_addr"] = client.exportRegisterAddr
		}
		status[fmt.Sprintf("%d", meterID)] = clientStatus
		client.mu.Unlock()
	}
	
	return map[string]interface{}{
		"modbus_connections": status,
	}
}

func (mc *ModbusCollector) Stop() {
	log.Println("Stopping Modbus TCP Collector...")

	// Use sync.Once to safely close stopChan exactly once (prevents double-close panic)
	mc.stopOnce.Do(func() {
		close(mc.stopChan)
	})

	if mc.reconnectTicker != nil {
		mc.reconnectTicker.Stop()
	}

	mc.mu.Lock()
	defer mc.mu.Unlock()

	for id, client := range mc.clients {
		if client.handler != nil {
			client.handler.Close()
			client.handler = nil
			client.client = nil
			client.isConnected = false
		}
		mc.clients[id] = client
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

func (c *ModbusClient) readValues() (float64, float64, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	
	if !c.isConnected {
		if err := c.connect(); err != nil {
			return 0, 0, fmt.Errorf("not connected: %v", err)
		}
	}
	
	// Read import energy
	importValue, err := c.readRegister(c.registerAddress, c.registerCount)
	if err != nil {
		c.isConnected = false
		c.lastError = err.Error()
		log.Printf("ERROR: Modbus read failed for '%s': %v", c.meterName, err)
		return 0, 0, err
	}
	
	// Read export energy if available
	var exportValue float64
	if c.hasExportRegister {
		exportValue, err = c.readRegister(c.exportRegisterAddr, c.registerCount)
		if err != nil {
			log.Printf("WARNING: Export register read failed for '%s': %v (continuing with import only)", c.meterName, err)
			exportValue = 0 // Continue even if export fails
		}
	}
	
	// Update status
	c.lastReadingImport = importValue
	c.lastReadingExport = exportValue
	c.lastReadTime = time.Now()
	c.lastError = ""
	c.isConnected = true
	
	return importValue, exportValue, nil
}

func (c *ModbusClient) readRegister(address uint16, count uint16) (float64, error) {
	var results []byte
	var err error
	
	// Use the configured function code
	switch c.functionCode {
	case 1: // Read Coils
		results, err = c.client.ReadCoils(address, count)
	case 2: // Read Discrete Inputs
		results, err = c.client.ReadDiscreteInputs(address, count)
	case 3: // Read Holding Registers
		results, err = c.client.ReadHoldingRegisters(address, count)
	case 4: // Read Input Registers
		results, err = c.client.ReadInputRegisters(address, count)
	default:
		return 0, fmt.Errorf("unsupported function code: %d", c.functionCode)
	}
	
	if err != nil {
		return 0, err
	}
	
	// Parse the result based on data type
	return c.parseValue(results)
}

func (c *ModbusClient) parseValue(data []byte) (float64, error) {
	if len(data) < 2 {
		return 0, fmt.Errorf("insufficient data: got %d bytes", len(data))
	}
	
	switch c.dataType {
	case "float32":
		if len(data) < 4 {
			return 0, fmt.Errorf("insufficient data for float32: got %d bytes", len(data))
		}
		bits := binary.BigEndian.Uint32(data)
		return float64(math.Float32frombits(bits)), nil
		
	case "float64":
		if len(data) < 8 {
			return 0, fmt.Errorf("insufficient data for float64: got %d bytes", len(data))
		}
		bits := binary.BigEndian.Uint64(data)
		return math.Float64frombits(bits), nil
		
	case "int16":
		value := int16(binary.BigEndian.Uint16(data))
		return float64(value), nil
		
	case "int32":
		if len(data) < 4 {
			return 0, fmt.Errorf("insufficient data for int32: got %d bytes", len(data))
		}
		value := int32(binary.BigEndian.Uint32(data))
		return float64(value), nil
		
	case "uint16":
		value := binary.BigEndian.Uint16(data)
		return float64(value), nil
		
	case "uint32":
		if len(data) < 4 {
			return 0, fmt.Errorf("insufficient data for uint32: got %d bytes", len(data))
		}
		value := binary.BigEndian.Uint32(data)
		return float64(value), nil
		
	default:
		// Default to float32 if type not recognized
		if len(data) >= 4 {
			bits := binary.BigEndian.Uint32(data)
			return float64(math.Float32frombits(bits)), nil
		}
		// Fallback to uint16
		value := binary.BigEndian.Uint16(data)
		return float64(value), nil
	}
}

// Helper functions

func parseModbusConfig(configJSON string) (ModbusMeterConfig, error) {
	var rawConfig map[string]interface{}
	if err := json.Unmarshal([]byte(configJSON), &rawConfig); err != nil {
		return ModbusMeterConfig{}, err
	}
	
	result := ModbusMeterConfig{
		Port:               502,
		RegisterAddress:    0,
		RegisterCount:      2,
		UnitID:             1,
		FunctionCode:       3,
		DataType:           "float32",
		HasExportRegister:  false,
		ExportRegisterAddr: 0,
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
	
	if funcCode, ok := rawConfig["function_code"].(float64); ok {
		result.FunctionCode = int(funcCode)
	}
	
	if dataType, ok := rawConfig["data_type"].(string); ok {
		result.DataType = dataType
	}
	
	if hasExport, ok := rawConfig["has_export_register"].(bool); ok {
		result.HasExportRegister = hasExport
	}
	
	if exportAddr, ok := rawConfig["export_register_address"].(float64); ok {
		result.ExportRegisterAddr = int(exportAddr)
	}
	
	if result.IPAddress == "" {
		return result, fmt.Errorf("ip_address is required")
	}
	
	return result, nil
}