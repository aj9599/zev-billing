package services

import (
	"crypto/sha1"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type LoxoneCollector struct {
	db          *sql.DB
	connections map[int]*LoxoneConnection // meterID -> connection
	mu          sync.RWMutex
}

type LoxoneConnection struct {
	MeterID     int
	MeterName   string
	Host        string
	Username    string
	Password    string
	DeviceID    string
	ws          *websocket.Conn
	isConnected bool
	lastReading float64
	lastUpdate  time.Time
	stopChan    chan bool
	mu          sync.Mutex
}

type LoxoneResponse struct {
	LL LoxoneLLData `json:"LL"`
}

type LoxoneLLData struct {
	Control string                    `json:"control"`
	Value   string                    `json:"value"`
	Code    string                    `json:"Code"`
	Outputs map[string]LoxoneOutput   `json:"-"`
}

type LoxoneOutput struct {
	Name  string      `json:"name"`
	Nr    int         `json:"nr"`
	Value interface{} `json:"value"`
}

// Custom unmarshal to handle dynamic output fields
func (ld *LoxoneLLData) UnmarshalJSON(data []byte) error {
	type Alias LoxoneLLData
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

func NewLoxoneCollector(db *sql.DB) *LoxoneCollector {
	return &LoxoneCollector{
		db:          db,
		connections: make(map[int]*LoxoneConnection),
	}
}

func (lc *LoxoneCollector) Start() {
	log.Println("===================================")
	log.Println("Loxone WebSocket Collector Starting")
	log.Println("===================================")
	
	lc.initializeConnections()
	
	// Monitor and reconnect dropped connections
	go lc.monitorConnections()
}

func (lc *LoxoneCollector) Stop() {
	lc.mu.Lock()
	defer lc.mu.Unlock()
	
	for _, conn := range lc.connections {
		conn.Close()
	}
	lc.connections = make(map[int]*LoxoneConnection)
}

func (lc *LoxoneCollector) RestartConnections() {
	log.Println("=== Restarting Loxone Connections ===")
	lc.Stop()
	time.Sleep(500 * time.Millisecond)
	lc.initializeConnections()
	log.Println("=== Loxone Connections Restarted ===")
}

func (lc *LoxoneCollector) initializeConnections() {
	rows, err := lc.db.Query(`
		SELECT id, name, connection_config
		FROM meters 
		WHERE is_active = 1 AND connection_type = 'loxone_api'
	`)
	if err != nil {
		log.Printf("ERROR: Failed to query Loxone meters: %v", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var id int
		var name, connectionConfig string
		
		if err := rows.Scan(&id, &name, &connectionConfig); err != nil {
			continue
		}

		var config map[string]interface{}
		if err := json.Unmarshal([]byte(connectionConfig), &config); err != nil {
			log.Printf("ERROR: Failed to parse config for meter %s: %v", name, err)
			continue
		}

		host := ""
		if h, ok := config["loxone_host"].(string); ok {
			host = h
		}

		username := ""
		if u, ok := config["loxone_username"].(string); ok {
			username = u
		}

		password := ""
		if p, ok := config["loxone_password"].(string); ok {
			password = p
		}

		deviceID := ""
		if d, ok := config["loxone_device_id"].(string); ok {
			deviceID = d
		}

		if host == "" || deviceID == "" {
			log.Printf("WARNING: Incomplete config for meter '%s'", name)
			continue
		}

		conn := &LoxoneConnection{
			MeterID:   id,
			MeterName: name,
			Host:      host,
			Username:  username,
			Password:  password,
			DeviceID:  deviceID,
			stopChan:  make(chan bool),
		}

		lc.mu.Lock()
		lc.connections[id] = conn
		lc.mu.Unlock()

		go conn.Connect(lc.db)
	}

	log.Printf("Initialized %d Loxone WebSocket connections", len(lc.connections))
}

func (lc *LoxoneCollector) monitorConnections() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		lc.mu.RLock()
		for meterID, conn := range lc.connections {
			if !conn.IsConnected() {
				log.Printf("Reconnecting Loxone meter %d (%s)...", meterID, conn.MeterName)
				go conn.Connect(lc.db)
			}
		}
		lc.mu.RUnlock()
	}
}

func (lc *LoxoneCollector) GetConnectionStatus() map[int]map[string]interface{} {
	lc.mu.RLock()
	defer lc.mu.RUnlock()

	status := make(map[int]map[string]interface{})
	for meterID, conn := range lc.connections {
		conn.mu.Lock()
		status[meterID] = map[string]interface{}{
			"meter_name":   conn.MeterName,
			"host":         conn.Host,
			"device_id":    conn.DeviceID,
			"is_connected": conn.isConnected,
			"last_reading": conn.lastReading,
			"last_update":  conn.lastUpdate.Format("2006-01-02 15:04:05"),
		}
		conn.mu.Unlock()
	}
	return status
}

func (conn *LoxoneConnection) Connect(db *sql.DB) {
	conn.mu.Lock()
	if conn.isConnected {
		conn.mu.Unlock()
		return
	}
	conn.mu.Unlock()

	// Build WebSocket URL
	wsURL := fmt.Sprintf("ws://%s/ws/rfc6455", conn.Host)

	log.Printf("Connecting to Loxone Miniserver at %s (Device: %s)...", conn.Host, conn.DeviceID)

	dialer := websocket.Dialer{
		HandshakeTimeout: 10 * time.Second,
	}

	ws, _, err := dialer.Dial(wsURL, nil)
	if err != nil {
		log.Printf("ERROR: Failed to connect to Loxone %s: %v", conn.Host, err)
		conn.mu.Lock()
		conn.isConnected = false
		conn.mu.Unlock()
		return
	}

	conn.mu.Lock()
	conn.ws = ws
	conn.mu.Unlock()

	// Authenticate
	if err := conn.authenticate(); err != nil {
		log.Printf("ERROR: Authentication failed for %s: %v", conn.MeterName, err)
		ws.Close()
		conn.mu.Lock()
		conn.isConnected = false
		conn.mu.Unlock()
		return
	}

	conn.mu.Lock()
	conn.isConnected = true
	conn.mu.Unlock()

	log.Printf("SUCCESS: Connected to Loxone meter '%s' (Device: %s)", conn.MeterName, conn.DeviceID)

	// Update meter status in database
	db.Exec(`UPDATE meters SET notes = ? WHERE id = ?`, 
		fmt.Sprintf("Connected at %s", time.Now().Format("2006-01-02 15:04:05")), 
		conn.MeterID)

	// Start reading data
	go conn.readLoop(db)
	go conn.requestData()
}

func (conn *LoxoneConnection) authenticate() error {
	// Request key exchange
	if err := conn.ws.WriteMessage(websocket.TextMessage, []byte("jdev/sys/getkey")); err != nil {
		return fmt.Errorf("failed to request key: %v", err)
	}

	// Read key response
	_, message, err := conn.ws.ReadMessage()
	if err != nil {
		return fmt.Errorf("failed to read key: %v", err)
	}

	var keyResponse struct {
		LL struct {
			Value string `json:"value"`
			Code  string `json:"Code"`
		} `json:"LL"`
	}

	if err := json.Unmarshal(message, &keyResponse); err != nil {
		return fmt.Errorf("failed to parse key response: %v", err)
	}

	if keyResponse.LL.Code != "200" {
		return fmt.Errorf("key exchange failed with code: %s", keyResponse.LL.Code)
	}

	key := keyResponse.LL.Value
	log.Printf("DEBUG: Received key from Loxone: %s", key)

	// Hash password with key
	pwHash := conn.hashPassword(conn.Password, key)

	// Authenticate
	authCmd := fmt.Sprintf("authenticate/%s", pwHash)
	if conn.Username != "" {
		authCmd = fmt.Sprintf("jdev/sys/authenticate/%s", pwHash)
	}

	if err := conn.ws.WriteMessage(websocket.TextMessage, []byte(authCmd)); err != nil {
		return fmt.Errorf("failed to send auth: %v", err)
	}

	// Read auth response
	_, message, err = conn.ws.ReadMessage()
	if err != nil {
		return fmt.Errorf("failed to read auth response: %v", err)
	}

	var authResponse struct {
		LL struct {
			Value string `json:"value"`
			Code  string `json:"Code"`
		} `json:"LL"`
	}

	if err := json.Unmarshal(message, &authResponse); err != nil {
		return fmt.Errorf("failed to parse auth response: %v", err)
	}

	if authResponse.LL.Code != "200" {
		return fmt.Errorf("authentication failed with code: %s", authResponse.LL.Code)
	}

	log.Printf("DEBUG: Authentication successful for meter '%s'", conn.MeterName)
	return nil
}

func (conn *LoxoneConnection) hashPassword(password, key string) string {
	// Loxone password hashing: SHA1(password + ":" + key)
	h := sha1.New()
	h.Write([]byte(password + ":" + key))
	pwHash := hex.EncodeToString(h.Sum(nil))
	
	// Then hash again: SHA1(username + ":" + pwHash)
	if conn.Username != "" {
		h = sha1.New()
		h.Write([]byte(conn.Username + ":" + pwHash))
		return strings.ToUpper(hex.EncodeToString(h.Sum(nil)))
	}
	
	return strings.ToUpper(pwHash)
}

func (conn *LoxoneConnection) requestData() {
	// Request data every 15 minutes at exact intervals
	for {
		now := time.Now()
		next := getNextQuarterHour(now)
		waitDuration := next.Sub(now)
		
		time.Sleep(waitDuration)
		
		conn.mu.Lock()
		if !conn.isConnected || conn.ws == nil {
			conn.mu.Unlock()
			return
		}
		
		// Request device data
		cmd := fmt.Sprintf("jdev/sps/io/%s/all", conn.DeviceID)
		if err := conn.ws.WriteMessage(websocket.TextMessage, []byte(cmd)); err != nil {
			log.Printf("ERROR: Failed to request data from %s: %v", conn.MeterName, err)
			conn.isConnected = false
			conn.mu.Unlock()
			return
		}
		conn.mu.Unlock()
		
		log.Printf("DEBUG: Requested data from Loxone meter '%s' (Device: %s)", conn.MeterName, conn.DeviceID)
	}
}

func (conn *LoxoneConnection) readLoop(db *sql.DB) {
	defer func() {
		conn.mu.Lock()
		if conn.ws != nil {
			conn.ws.Close()
		}
		conn.isConnected = false
		conn.mu.Unlock()
		log.Printf("Disconnected from Loxone meter '%s'", conn.MeterName)
	}()

	for {
		select {
		case <-conn.stopChan:
			return
		default:
			conn.mu.Lock()
			ws := conn.ws
			conn.mu.Unlock()
			
			if ws == nil {
				return
			}

			_, message, err := ws.ReadMessage()
			if err != nil {
				log.Printf("ERROR: WebSocket read error for %s: %v", conn.MeterName, err)
				return
			}

			// Parse Loxone response
			var response LoxoneResponse
			if err := json.Unmarshal(message, &response); err != nil {
				log.Printf("WARNING: Failed to parse Loxone response from %s: %v", conn.MeterName, err)
				continue
			}

			// Check if this is a response to our device request
			expectedControl := fmt.Sprintf("dev/sps/io/%s/all", conn.DeviceID)
			if !strings.Contains(response.LL.Control, expectedControl) {
				// Not our device response, skip
				continue
			}

			// Extract output1 value (kWh reading)
			if output1, ok := response.LL.Outputs["output1"]; ok {
				var reading float64
				
				switch v := output1.Value.(type) {
				case float64:
					reading = v
				case string:
					if f, err := strconv.ParseFloat(v, 64); err == nil {
						reading = f
					}
				}

				if reading > 0 {
					conn.mu.Lock()
					conn.lastReading = reading
					conn.lastUpdate = time.Now()
					conn.mu.Unlock()

					currentTime := roundToQuarterHour(time.Now())
					
					log.Printf("SUCCESS: Loxone meter '%s' reading: %.3f kWh at %s", 
						conn.MeterName, reading, currentTime.Format("15:04:05"))

					// Get last reading for interpolation
					var lastReading float64
					var lastTime time.Time
					err := db.QueryRow(`
						SELECT power_kwh, reading_time FROM meter_readings 
						WHERE meter_id = ? 
						ORDER BY reading_time DESC LIMIT 1
					`, conn.MeterID).Scan(&lastReading, &lastTime)

					if err == nil && !lastTime.IsZero() {
						// Interpolate missing intervals
						interpolated := interpolateReadings(lastTime, lastReading, currentTime, reading)
						
						if len(interpolated) > 0 {
							log.Printf("Loxone meter '%s': Interpolating %d missing intervals", 
								conn.MeterName, len(interpolated))
						}
						
						for _, point := range interpolated {
							consumption := point.value - lastReading
							if consumption < 0 {
								consumption = 0
							}
							
							db.Exec(`
								INSERT INTO meter_readings (meter_id, reading_time, power_kwh, consumption_kwh)
								VALUES (?, ?, ?, ?)
							`, conn.MeterID, point.time, point.value, consumption)
							
							lastReading = point.value
						}
					}

					// Save current reading
					consumption := reading - lastReading
					if consumption < 0 {
						consumption = reading
					}

					_, err = db.Exec(`
						INSERT INTO meter_readings (meter_id, reading_time, power_kwh, consumption_kwh)
						VALUES (?, ?, ?, ?)
					`, conn.MeterID, currentTime, reading, consumption)

					if err != nil {
						log.Printf("ERROR: Failed to save Loxone reading for %s: %v", conn.MeterName, err)
					} else {
						// Update meter last reading
						db.Exec(`
							UPDATE meters 
							SET last_reading = ?, last_reading_time = ?, 
							    notes = ?
							WHERE id = ?
						`, reading, currentTime, 
							fmt.Sprintf("Last update: %s (Connected)", time.Now().Format("2006-01-02 15:04:05")),
							conn.MeterID)
					}
				}
			} else {
				log.Printf("WARNING: No output1 found in Loxone response for %s", conn.MeterName)
			}
		}
	}
}

func (conn *LoxoneConnection) IsConnected() bool {
	conn.mu.Lock()
	defer conn.mu.Unlock()
	return conn.isConnected
}

func (conn *LoxoneConnection) Close() {
	conn.mu.Lock()
	defer conn.mu.Unlock()
	
	close(conn.stopChan)
	if conn.ws != nil {
		conn.ws.Close()
		conn.ws = nil
	}
	conn.isConnected = false
}