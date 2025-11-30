package loxone

import (
	"database/sql"
	"fmt"
	"log"
	"regexp"
	"strconv"
	"time"
)

// processChargerField processes individual charger UUID data (multi-UUID mode)
func (conn *WebSocketConnection) processChargerField(device *Device, response LoxoneResponse, fieldName string, collection *ChargerDataCollection, db *sql.DB) {
	log.Printf("   🔍 [%s] Processing field '%s'", device.Name, fieldName)
	log.Printf("   🔍 Response Control: %s", response.LL.Control)
	log.Printf("   🔍 Response Code: %s", response.LL.Code)
	log.Printf("   🔍 Response Value: %s", response.LL.Value)
	log.Printf("   🔍 Number of outputs: %d", len(response.LL.Outputs))

	for key := range response.LL.Outputs {
		log.Printf("   🔍 Found output key: %s", key)
	}

	if output1, ok := response.LL.Outputs["output1"]; ok {
		log.Printf("   🔍 output1 found - Value type: %T, Value: %v", output1.Value, output1.Value)
		switch fieldName {
		case "power":
			var power float64
			switch v := output1.Value.(type) {
			case float64:
				power = v
			case string:
				cleanValue := StripUnitSuffix(v)
				if f, err := strconv.ParseFloat(cleanValue, 64); err == nil {
					power = f
				} else {
					log.Printf("   ⚠️  [%s] Failed to parse power from output1: '%s' (err: %v)", device.Name, v, err)
				}
			}
			collection.Power = &power
			log.Printf("   📜 [%s] Received power: %.4f kWh", device.Name, power)

		case "state":
			var state string
			switch v := output1.Value.(type) {
			case string:
				state = v
			case float64:
				state = fmt.Sprintf("%.0f", v)
			}
			collection.State = &state
			log.Printf("   🔒 [%s] Received state: %s", device.Name, state)

		case "user_id":
			var userID string
			switch v := output1.Value.(type) {
			case string:
				userID = v
			case float64:
				userID = fmt.Sprintf("%.0f", v)
			}
			collection.UserID = &userID
			log.Printf("   👩‍🔧 [%s] Received user_id: %s", device.Name, userID)

		case "mode":
			var mode string
			switch v := output1.Value.(type) {
			case string:
				mode = v
			case float64:
				mode = fmt.Sprintf("%.0f", v)
			}
			collection.Mode = &mode
			log.Printf("   ⚙️  [%s] Received mode: %s", device.Name, mode)
		}

		hasAll := collection.Power != nil && collection.State != nil &&
			collection.UserID != nil && collection.Mode != nil

		log.Printf("   📦 [%s] Collection status: Power=%v State=%v UserID=%v Mode=%v (Complete=%v)",
			device.Name,
			collection.Power != nil, collection.State != nil,
			collection.UserID != nil, collection.Mode != nil,
			hasAll)

		if hasAll {
			log.Printf("   ✔️ [%s] All fields collected, saving to database", device.Name)
			conn.saveChargerDataLegacy(device, collection, db)

			collection.Power = nil
			collection.State = nil
			collection.UserID = nil
			collection.Mode = nil
		}
	} else {
		log.Printf("   ⚠️  [%s] output1 not found in response for field '%s'", device.Name, fieldName)

		if response.LL.Value != "" {
			log.Printf("   🔍 Trying to use response.LL.Value: %s", response.LL.Value)

			switch fieldName {
			case "power":
				cleanValue := StripUnitSuffix(response.LL.Value)
				if f, err := strconv.ParseFloat(cleanValue, 64); err == nil {
					collection.Power = &f
					log.Printf("   📜 [%s] Received power from Value: %.4f kWh (from '%s')", device.Name, f, response.LL.Value)
				} else {
					log.Printf("   ❌ [%s] Failed to parse power from Value: '%s' (err: %v)", device.Name, response.LL.Value, err)
				}
			case "state":
				state := response.LL.Value
				collection.State = &state
				log.Printf("   🔒 [%s] Received state from Value: %s", device.Name, state)
			case "user_id":
				userID := response.LL.Value
				collection.UserID = &userID
				log.Printf("   👩‍🔧 [%s] Received user_id from Value: %s", device.Name, userID)
			case "mode":
				mode := response.LL.Value
				collection.Mode = &mode
				log.Printf("   ⚙️  [%s] Received mode from Value: %s", device.Name, mode)
			}

			hasAll := collection.Power != nil && collection.State != nil &&
				collection.UserID != nil && collection.Mode != nil

			log.Printf("   📦 [%s] Collection status: Power=%v State=%v UserID=%v Mode=%v (Complete=%v)",
				device.Name,
				collection.Power != nil, collection.State != nil,
				collection.UserID != nil, collection.Mode != nil,
				hasAll)

			if hasAll {
				log.Printf("   ✔️ [%s] All fields collected, saving to database", device.Name)
				conn.saveChargerDataLegacy(device, collection, db)

				collection.Power = nil
				collection.State = nil
				collection.UserID = nil
				collection.Mode = nil
			}
		} else {
			log.Printf("   ❌ [%s] No data found for field '%s' in response", device.Name, fieldName)
		}
	}
}

// processChargerSingleBlock processes all charger data from a single Loxone response
func (conn *WebSocketConnection) processChargerSingleBlock(device *Device, response LoxoneResponse, db *sql.DB, collector LoxoneCollectorInterface) {
	log.Printf("   🔍 [%s] Processing single-block response (session tracking mode)", device.Name)
	log.Printf("   📦 Number of outputs: %d", len(response.LL.Outputs))

	// Extract values from the response outputs
	var totalEnergyKWh float64
	var chargingPowerKW float64
	var modeValue string
	var userID string
	var vehicleConnected int
	var chargingActive int
	var currentSessionEnergyKWh float64
	var lastSessionLog string

	// Extract output1 (Vc) - Vehicle Connected
	if output1, ok := response.LL.Outputs["output1"]; ok {
		switch v := output1.Value.(type) {
		case float64:
			vehicleConnected = int(v)
		case string:
			if f, err := strconv.ParseFloat(v, 64); err == nil {
				vehicleConnected = int(f)
			}
		}
		log.Printf("      ├─ output1 (Vc - Vehicle Connected): %d", vehicleConnected)
	}

	// Extract output2 (Cac) - Charging Active
	if output2, ok := response.LL.Outputs["output2"]; ok {
		switch v := output2.Value.(type) {
		case float64:
			chargingActive = int(v)
		case string:
			if f, err := strconv.ParseFloat(v, 64); err == nil {
				chargingActive = int(f)
			}
		}
		log.Printf("      ├─ output2 (Cac - Charging Active): %d", chargingActive)
	}

	// Extract output3 (Cp) - Charging Power
	if output3, ok := response.LL.Outputs["output3"]; ok {
		switch v := output3.Value.(type) {
		case float64:
			chargingPowerKW = v
		case string:
			cleanValue := StripUnitSuffix(v)
			if f, err := strconv.ParseFloat(cleanValue, 64); err == nil {
				chargingPowerKW = f
			}
		}
		log.Printf("      ├─ output3 (Cp - Charging Power): %.3f kW", chargingPowerKW)
	}

	// Extract output4 (M) - Mode
	if output4, ok := response.LL.Outputs["output4"]; ok {
		switch v := output4.Value.(type) {
		case string:
			modeValue = v
		case float64:
			modeValue = fmt.Sprintf("%.0f", v)
		}
		log.Printf("      ├─ output4 (M - Mode): %s", modeValue)
	}

	// Extract output7 (Mr) - Total Energy Meter
	if output7, ok := response.LL.Outputs["output7"]; ok {
		switch v := output7.Value.(type) {
		case float64:
			totalEnergyKWh = v
		case string:
			cleanValue := StripUnitSuffix(v)
			if f, err := strconv.ParseFloat(cleanValue, 64); err == nil {
				totalEnergyKWh = f
			}
		}
		log.Printf("      ├─ output7 (Mr - Total Energy): %.3f kWh", totalEnergyKWh)
	}

	// Extract output8 (Ccc) - Current Session Energy
	if output8, ok := response.LL.Outputs["output8"]; ok {
		switch v := output8.Value.(type) {
		case float64:
			currentSessionEnergyKWh = v
		case string:
			cleanValue := StripUnitSuffix(v)
			if f, err := strconv.ParseFloat(cleanValue, 64); err == nil {
				currentSessionEnergyKWh = f
			}
		}
		log.Printf("      ├─ output8 (Ccc - Current Session Energy): %.3f kWh", currentSessionEnergyKWh)
	}

	// Extract output17 (Lcl) - Last Session Log
	if output17, ok := response.LL.Outputs["output17"]; ok {
		switch v := output17.Value.(type) {
		case string:
			lastSessionLog = v
		}
		log.Printf("      ├─ output17 (Lcl - Last Session Log): %s", lastSessionLog)
	}

	// Extract output21 (Uid) - User ID
	if output21, ok := response.LL.Outputs["output21"]; ok {
		switch v := output21.Value.(type) {
		case string:
			userID = v
		case float64:
			if v > 0 {
				userID = fmt.Sprintf("%.0f", v)
			}
		}
		log.Printf("      └─ output21 (Uid - User ID): '%s'", userID)
	}

	// Determine state
	var stateValue string
	var stateDescription string
	if vehicleConnected == 0 {
		stateValue = "0"
		stateDescription = "Disconnected"
	} else if chargingActive == 1 {
		stateValue = "1"
		stateDescription = "Charging"
	} else {
		stateValue = "0"
		stateDescription = "Connected (not charging)"
	}

	modeDescription := GetModeDescription(modeValue)

	device.LastReading = totalEnergyKWh
	device.LastUpdate = time.Now()
	device.ReadingGaps = 0

	// Update live data for UI
	if collector != nil {
		liveData, _ := collector.GetLiveChargerData(device.ID)
		if liveData == nil {
			liveData = &ChargerLiveData{
				ChargerID:   device.ID,
				ChargerName: device.Name,
			}
		}

		liveData.IsOnline = true
		liveData.VehicleConnected = vehicleConnected == 1
		liveData.ChargingActive = chargingActive == 1
		liveData.State = stateValue
		liveData.StateDescription = stateDescription
		liveData.CurrentPower_kW = chargingPowerKW
		liveData.TotalEnergy_kWh = totalEnergyKWh
		liveData.SessionEnergy_kWh = currentSessionEnergyKWh
		liveData.Mode = modeValue
		liveData.ModeDescription = modeDescription
		liveData.UserID = userID
		liveData.Timestamp = time.Now()

		collector.UpdateLiveChargerData(device.ID, liveData)

		activeSession, _ := collector.GetActiveSession(device.ID)

		// Session tracking logic
		if chargingActive == 1 {
			if activeSession == nil {
				log.Printf("   ⚡ [%s] CHARGING STARTED - Creating new session", device.Name)
				newSession := &ActiveChargerSession{
					ChargerID:       device.ID,
					ChargerName:     device.Name,
					StartTime:       RoundToQuarterHour(time.Now()),
					StartEnergy_kWh: totalEnergyKWh,
					UserID:          userID,
					Mode:            modeValue,
					LastLclValue:    lastSessionLog,
					Readings:        []ChargerSessionReading{},
				}

				newSession.Readings = append(newSession.Readings, ChargerSessionReading{
					Timestamp:  RoundToQuarterHour(time.Now()),
					Energy_kWh: totalEnergyKWh,
					Power_kW:   chargingPowerKW,
					Mode:       modeValue,
				})

				collector.SetActiveSession(device.ID, newSession)
				liveData.SessionStart = newSession.StartTime
				collector.UpdateLiveChargerData(device.ID, liveData)

				collector.LogToDatabase("Loxone Charger Session Started",
					fmt.Sprintf("Charger '%s': Session started at %.3f kWh", device.Name, totalEnergyKWh))
			} else {
				reading := ChargerSessionReading{
					Timestamp:  RoundToQuarterHour(time.Now()),
					Energy_kWh: totalEnergyKWh,
					Power_kW:   chargingPowerKW,
					Mode:       modeValue,
				}

				activeSession.Readings = append(activeSession.Readings, reading)
				if userID != "" && activeSession.UserID == "" {
					activeSession.UserID = userID
				}
				collector.SetActiveSession(device.ID, activeSession)

				log.Printf("   ⚡ [%s] CHARGING: Session reading added - Energy: %.3f kWh, Power: %.2f kW, Readings: %d",
					device.Name, totalEnergyKWh, chargingPowerKW, len(activeSession.Readings))
			}
		} else {
			if activeSession != nil {
				lclChanged := lastSessionLog != activeSession.LastLclValue && lastSessionLog != ""

				if lclChanged {
					log.Printf("   🏁 [%s] CHARGING ENDED - Lcl changed, processing session", device.Name)

					parsedUserID, parsedEnergy, parsedEndTime := ParseLclString(lastSessionLog)
					if parsedUserID == "" {
						parsedUserID = activeSession.UserID
					}
					if parsedUserID == "" {
						parsedUserID = "unknown"
					}

					activeSession.Readings = append(activeSession.Readings, ChargerSessionReading{
						Timestamp:  RoundToQuarterHour(time.Now()),
						Energy_kWh: totalEnergyKWh,
						Power_kW:   0,
						Mode:       modeValue,
					})

					completedSession := &CompletedChargerSession{
						ChargerID:       device.ID,
						ChargerName:     device.Name,
						UserID:          parsedUserID,
						StartTime:       activeSession.StartTime,
						EndTime:         parsedEndTime,
						StartEnergy_kWh: activeSession.StartEnergy_kWh,
						EndEnergy_kWh:   totalEnergyKWh,
						TotalEnergy_kWh: parsedEnergy,
						Mode:            activeSession.Mode,
						Readings:        activeSession.Readings,
					}

					collector.DeleteActiveSession(device.ID)

					go ProcessCompletedChargerSession(completedSession, db, collector)
				} else {
					energyDelta := totalEnergyKWh - activeSession.StartEnergy_kWh
					if energyDelta > 0.1 {
						log.Printf("   ⏳ [%s] Charging stopped (Δ%.3f kWh) - waiting for Lcl update", device.Name, energyDelta)
					} else {
						log.Printf("   📸 [%s] Session discarded (Δ%.3f kWh too small)", device.Name, energyDelta)
						collector.DeleteActiveSession(device.ID)
					}
				}
			}
		}
	}

	log.Printf("   ✅ [%s] Live data updated: Energy=%.3f kWh, Power=%.2f kW, State=%s (%s), Mode=%s",
		device.Name, totalEnergyKWh, chargingPowerKW, stateValue, stateDescription, modeDescription)
}

// saveChargerDataLegacy saves charger data in legacy multi-UUID mode
func (conn *WebSocketConnection) saveChargerDataLegacy(device *Device, collection *ChargerDataCollection, db *sql.DB) {
	power := *collection.Power
	state := *collection.State
	userID := *collection.UserID
	mode := *collection.Mode

	device.LastReading = power
	device.LastUpdate = time.Now()
	device.ReadingGaps = 0

	currentTime := RoundToQuarterHour(time.Now())

	var lastPower float64
	var lastTime time.Time
	err := db.QueryRow(`
		SELECT power_kwh, session_time FROM charger_sessions 
		WHERE charger_id = ? AND user_id = ?
		ORDER BY session_time DESC LIMIT 1
	`, device.ID, userID).Scan(&lastPower, &lastTime)

	if err == nil && !lastTime.IsZero() {
		interpolated := InterpolateReadings(lastTime, lastPower, currentTime, power)

		for _, point := range interpolated {
			db.Exec(`
				INSERT INTO charger_sessions (charger_id, user_id, session_time, power_kwh, mode, state)
				VALUES (?, ?, ?, ?, ?, ?)
			`, device.ID, userID, point.time, point.value, mode, state)
		}

		if len(interpolated) > 0 {
			device.ReadingGaps += len(interpolated)
			log.Printf("   ⚠️  Filled %d reading gaps for charger %s", len(interpolated), device.Name)
		}
	}

	_, err = db.Exec(`
		INSERT INTO charger_sessions (charger_id, user_id, session_time, power_kwh, mode, state)
		VALUES (?, ?, ?, ?, ?, ?)
	`, device.ID, userID, currentTime, power, mode, state)

	if err != nil {
		log.Printf("❌ Failed to save charger session to database: %v", err)
		conn.Mu.Lock()
		conn.LastError = fmt.Sprintf("DB save failed: %v", err)
		conn.Mu.Unlock()
	} else {
		log.Printf("✔️ CHARGER [%s]: %.4f kWh (user: %s, mode: %s, state: %s)",
			device.Name, power, userID, mode, state)

		db.Exec(`
			UPDATE chargers 
			SET notes = ?
			WHERE id = ?
		`, fmt.Sprintf("🟢 Last update: %s", time.Now().Format("2006-01-02 15:04:05")),
			device.ID)
	}
}

// ParseLclString parses the Lcl (Last Session Log) string to extract session details
func ParseLclString(lcl string) (userID string, energy float64, endTime time.Time) {
	if lcl == "" {
		return "", 0, time.Time{}
	}

	// Parse end time from beginning
	if len(lcl) >= 19 {
		timeStr := lcl[:19]
		if t, err := time.ParseInLocation("2006-01-02 15:04:05", timeStr, time.Local); err == nil {
			endTime = t
		}
	}

	// Parse user ID
	userRegex := regexp.MustCompile(`user:(\d+)`)
	if matches := userRegex.FindStringSubmatch(lcl); len(matches) > 1 {
		userID = matches[1]
	}

	// Parse energy
	energyRegex := regexp.MustCompile(`Geladene Energie:(\d+\.?\d*)kWh`)
	if matches := energyRegex.FindStringSubmatch(lcl); len(matches) > 1 {
		if e, err := strconv.ParseFloat(matches[1], 64); err == nil {
			energy = e
		}
	}

	return userID, energy, endTime
}

// GetModeDescription returns a human-readable description of the charging mode
func GetModeDescription(mode string) string {
	switch mode {
	case "1", "2", "3", "4", "5":
		return fmt.Sprintf("Solar Mode %s", mode)
	case "99":
		return "Priority Charging"
	default:
		return fmt.Sprintf("Mode %s", mode)
	}
}