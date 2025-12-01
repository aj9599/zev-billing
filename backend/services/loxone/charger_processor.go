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
	log.Printf("   🔋 [%s] Processing field '%s'", device.Name, fieldName)
	log.Printf("   📋 Response Control: %s", response.LL.Control)
	log.Printf("   📋 Response Code: %s", response.LL.Code)
	log.Printf("   📋 Response Value: %s", response.LL.Value)
	log.Printf("   📋 Number of outputs: %d", len(response.LL.Outputs))

	for key := range response.LL.Outputs {
		log.Printf("   📋 Found output key: %s", key)
	}

	if output1, ok := response.LL.Outputs["output1"]; ok {
		log.Printf("   📋 output1 found - Value type: %T, Value: %v", output1.Value, output1.Value)
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
					log.Printf("   ⚠️ [%s] Failed to parse power from output1: '%s' (err: %v)", device.Name, v, err)
				}
			}
			collection.Power = &power
			log.Printf("   📊 [%s] Received power: %.4f kWh", device.Name, power)

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
			log.Printf("   ⚙️ [%s] Received mode: %s", device.Name, mode)
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
		log.Printf("   ⚠️ [%s] output1 not found in response for field '%s'", device.Name, fieldName)

		if response.LL.Value != "" {
			log.Printf("   📋 Trying to use response.LL.Value: %s", response.LL.Value)

			switch fieldName {
			case "power":
				cleanValue := StripUnitSuffix(response.LL.Value)
				if f, err := strconv.ParseFloat(cleanValue, 64); err == nil {
					collection.Power = &f
					log.Printf("   📊 [%s] Received power from Value: %.4f kWh (from '%s')", device.Name, f, response.LL.Value)
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
				log.Printf("   ⚙️ [%s] Received mode from Value: %s", device.Name, mode)
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
	log.Printf("   🔋 [%s] Processing single-block response (enhanced session tracking)", device.Name)
	log.Printf("   📦 Number of outputs: %d", len(response.LL.Outputs))

	// Extract all values from the response outputs
	var totalEnergyKWh float64          // Mr - output7
	var chargingPowerKW float64         // Cp - output3
	var modeValue string                // M - output4
	var userID string                   // Uid - output21
	var vehicleConnected int            // Vc - output1
	var chargingActive int              // Cac - output2
	var currentSessionEnergyKWh float64 // Ccc - output8
	var lastSessionEnergyKWh float64    // Clc - output9
	var lastSessionDurationSec float64  // Cld - output11 (in hours, need to convert)
	var weeklyEnergyKWh float64         // Cw - output12
	var monthlyEnergyKWh float64        // Cm - output13
	var lastMonthEnergyKWh float64      // Clm - output14
	var yearlyEnergyKWh float64         // Cy - output15
	var lastYearEnergyKWh float64       // Cly - output16
	var lastSessionLog string           // Lcl - output17

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

	// Extract output9 (Clc) - Last Session Energy
	if output9, ok := response.LL.Outputs["output9"]; ok {
		switch v := output9.Value.(type) {
		case float64:
			lastSessionEnergyKWh = v
		case string:
			cleanValue := StripUnitSuffix(v)
			if f, err := strconv.ParseFloat(cleanValue, 64); err == nil {
				lastSessionEnergyKWh = f
			}
		}
		log.Printf("      ├─ output9 (Clc - Last Session Energy): %.3f kWh", lastSessionEnergyKWh)
	}

	// Extract output11 (Cld) - Last Session Duration (in hours)
	if output11, ok := response.LL.Outputs["output11"]; ok {
		switch v := output11.Value.(type) {
		case float64:
			lastSessionDurationSec = v * 3600 // Convert hours to seconds
		case string:
			cleanValue := StripUnitSuffix(v)
			if f, err := strconv.ParseFloat(cleanValue, 64); err == nil {
				lastSessionDurationSec = f * 3600
			}
		}
		log.Printf("      ├─ output11 (Cld - Last Session Duration): %.3f hours (%.0f seconds)", lastSessionDurationSec/3600, lastSessionDurationSec)
	}

	// Extract output12 (Cw) - Weekly Energy
	if output12, ok := response.LL.Outputs["output12"]; ok {
		switch v := output12.Value.(type) {
		case float64:
			weeklyEnergyKWh = v
		case string:
			cleanValue := StripUnitSuffix(v)
			if f, err := strconv.ParseFloat(cleanValue, 64); err == nil {
				weeklyEnergyKWh = f
			}
		}
		log.Printf("      ├─ output12 (Cw - Weekly Energy): %.3f kWh", weeklyEnergyKWh)
	}

	// Extract output13 (Cm) - Monthly Energy
	if output13, ok := response.LL.Outputs["output13"]; ok {
		switch v := output13.Value.(type) {
		case float64:
			monthlyEnergyKWh = v
		case string:
			cleanValue := StripUnitSuffix(v)
			if f, err := strconv.ParseFloat(cleanValue, 64); err == nil {
				monthlyEnergyKWh = f
			}
		}
		log.Printf("      ├─ output13 (Cm - Monthly Energy): %.3f kWh", monthlyEnergyKWh)
	}

	// Extract output14 (Clm) - Last Month Energy
	if output14, ok := response.LL.Outputs["output14"]; ok {
		switch v := output14.Value.(type) {
		case float64:
			lastMonthEnergyKWh = v
		case string:
			cleanValue := StripUnitSuffix(v)
			if f, err := strconv.ParseFloat(cleanValue, 64); err == nil {
				lastMonthEnergyKWh = f
			}
		}
		log.Printf("      ├─ output14 (Clm - Last Month Energy): %.3f kWh", lastMonthEnergyKWh)
	}

	// Extract output15 (Cy) - Yearly Energy
	if output15, ok := response.LL.Outputs["output15"]; ok {
		switch v := output15.Value.(type) {
		case float64:
			yearlyEnergyKWh = v
		case string:
			cleanValue := StripUnitSuffix(v)
			if f, err := strconv.ParseFloat(cleanValue, 64); err == nil {
				yearlyEnergyKWh = f
			}
		}
		log.Printf("      ├─ output15 (Cy - Yearly Energy): %.3f kWh", yearlyEnergyKWh)
	}

	// Extract output16 (Cly) - Last Year Energy
	if output16, ok := response.LL.Outputs["output16"]; ok {
		switch v := output16.Value.(type) {
		case float64:
			lastYearEnergyKWh = v
		case string:
			cleanValue := StripUnitSuffix(v)
			if f, err := strconv.ParseFloat(cleanValue, 64); err == nil {
				lastYearEnergyKWh = f
			}
		}
		log.Printf("      ├─ output16 (Cly - Last Year Energy): %.3f kWh", lastYearEnergyKWh)
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

	// Determine state based on vehicle connection and charging status
	// State mapping matches Zaptec for consistency:
	// State 1 = Disconnected (Vc=0)
	// State 5 = Complete (Vc=1, Cac=0 - vehicle connected but not charging)
	// State 3 = Charging (Vc=1, Cac=1 - vehicle connected and charging)
	var stateValue string
	var stateDescription string
	if vehicleConnected == 0 {
		stateValue = "1"
		stateDescription = "Disconnected"
	} else if chargingActive == 1 {
		stateValue = "3"
		stateDescription = "Charging"
	} else {
		stateValue = "5"
		stateDescription = "Complete"
	}

	modeDescription := GetModeDescription(modeValue)

	device.LastReading = totalEnergyKWh
	device.LastUpdate = time.Now()
	device.ReadingGaps = 0

	// CRITICAL FIX: Always update enhanced stats in database, not just in memory
	UpdateChargerStatsInDatabase(db, device.ID, lastSessionEnergyKWh, lastSessionDurationSec,
		weeklyEnergyKWh, monthlyEnergyKWh, lastMonthEnergyKWh, yearlyEnergyKWh, lastYearEnergyKWh)

	// Update live data for UI with all enhanced fields
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

		// Enhanced live data fields
		liveData.LastSessionEnergy_kWh = lastSessionEnergyKWh
		liveData.LastSessionDuration_sec = lastSessionDurationSec
		liveData.WeeklyEnergy_kWh = weeklyEnergyKWh
		liveData.MonthlyEnergy_kWh = monthlyEnergyKWh
		liveData.LastMonthEnergy_kWh = lastMonthEnergyKWh
		liveData.YearlyEnergy_kWh = yearlyEnergyKWh
		liveData.LastYearEnergy_kWh = lastYearEnergyKWh

		collector.UpdateLiveChargerData(device.ID, liveData)

		activeSession, _ := collector.GetActiveSession(device.ID)

		// SESSION LOGIC - Enhanced with proper start/end detection
		sessionActive := vehicleConnected == 1 || chargingPowerKW > 0

		if sessionActive {
			if activeSession == nil {
				// Session start detected
				log.Printf("   ⚡ [%s] SESSION STARTED - Creating new session", device.Name)
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

				// Add first reading
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
					fmt.Sprintf("Charger '%s': Session started at %.3f kWh (Vehicle connected: %v, Power: %.3f kW)",
						device.Name, totalEnergyKWh, vehicleConnected == 1, chargingPowerKW))
			} else {
				// Session ongoing - add reading at 15-min intervals
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
				// Update last Lcl value to detect changes
				activeSession.LastLclValue = lastSessionLog
				collector.SetActiveSession(device.ID, activeSession)

				log.Printf("   ⚡ [%s] SESSION ONGOING: Reading added - Energy: %.3f kWh, Power: %.2f kW, Readings: %d",
					device.Name, totalEnergyKWh, chargingPowerKW, len(activeSession.Readings))
			}
		} else {
			// No session active - vehicle disconnected and no power
			if activeSession != nil {
				// Session ended - check if Lcl changed
				lclChanged := lastSessionLog != activeSession.LastLclValue && lastSessionLog != ""

				if lclChanged {
					log.Printf("   🏁 [%s] SESSION ENDED - Lcl changed, processing completed session", device.Name)

					// Parse Lcl to get exact session details
					parsedUserID, parsedEnergy, parsedEndTime, parsedDuration := ParseLclString(lastSessionLog)
					if parsedUserID == "" {
						parsedUserID = activeSession.UserID
					}
					if parsedUserID == "" {
						parsedUserID = "unknown"
					}

					// Calculate exact start time from Lcl duration
					var exactStartTime time.Time
					if parsedDuration > 0 && !parsedEndTime.IsZero() {
						exactStartTime = parsedEndTime.Add(-time.Duration(parsedDuration) * time.Second)
					} else {
						exactStartTime = activeSession.StartTime
					}

					// Use parsed energy or calculate from readings
					finalEnergy := parsedEnergy
					if finalEnergy == 0 && len(activeSession.Readings) > 0 {
						finalEnergy = activeSession.Readings[len(activeSession.Readings)-1].Energy_kWh - activeSession.StartEnergy_kWh
					}

					completedSession := &CompletedChargerSession{
						ChargerID:       device.ID,
						ChargerName:     device.Name,
						UserID:          parsedUserID,
						StartTime:       exactStartTime,
						EndTime:         parsedEndTime,
						StartEnergy_kWh: activeSession.StartEnergy_kWh,
						EndEnergy_kWh:   totalEnergyKWh,
						TotalEnergy_kWh: finalEnergy,
						Duration_sec:    parsedDuration,
						Mode:            activeSession.Mode,
						Readings:        activeSession.Readings,
					}

					collector.DeleteActiveSession(device.ID)

					// Process session asynchronously (will handle backfilling)
					go ProcessCompletedChargerSession(completedSession, db, collector)
				} else {
					// Still waiting for Lcl update
					energyDelta := totalEnergyKWh - activeSession.StartEnergy_kWh
					if energyDelta > 0.1 {
						log.Printf("   ⏳ [%s] Session paused (Δ%.3f kWh) - waiting for Lcl update", device.Name, energyDelta)
					} else {
						// Very small energy, discard session
						log.Printf("   🗑️ [%s] Session discarded (Δ%.3f kWh too small)", device.Name, energyDelta)
						collector.DeleteActiveSession(device.ID)
					}
				}
			} else {
				// No active session - write 15-min maintenance readings with no user
				// This ensures database is filled even when charger is idle
				go WriteMaintenanceReading(device.ID, device.Name, totalEnergyKWh, modeValue, db, collector)
			}
		}
	}

	log.Printf("   ✅ [%s] Live data updated: Energy=%.3f kWh, Power=%.2f kW, State=%s (%s), Mode=%s",
		device.Name, totalEnergyKWh, chargingPowerKW, stateValue, stateDescription, modeDescription)
}

// UpdateChargerStatsInDatabase updates the enhanced statistics in the charger_stats table
func UpdateChargerStatsInDatabase(db *sql.DB, chargerID int, lastSessionEnergy, lastSessionDuration,
	weeklyEnergy, monthlyEnergy, lastMonthEnergy, yearlyEnergy, lastYearEnergy float64) {
	
	// Insert or update charger_stats table
	_, err := db.Exec(`
		INSERT INTO charger_stats (
			charger_id, 
			last_session_energy_kwh, 
			last_session_duration_sec,
			weekly_energy_kwh, 
			monthly_energy_kwh, 
			last_month_energy_kwh,
			yearly_energy_kwh, 
			last_year_energy_kwh,
			updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(charger_id) DO UPDATE SET
			last_session_energy_kwh = excluded.last_session_energy_kwh,
			last_session_duration_sec = excluded.last_session_duration_sec,
			weekly_energy_kwh = excluded.weekly_energy_kwh,
			monthly_energy_kwh = excluded.monthly_energy_kwh,
			last_month_energy_kwh = excluded.last_month_energy_kwh,
			yearly_energy_kwh = excluded.yearly_energy_kwh,
			last_year_energy_kwh = excluded.last_year_energy_kwh,
			updated_at = CURRENT_TIMESTAMP
	`, chargerID, lastSessionEnergy, lastSessionDuration, weeklyEnergy, 
	   monthlyEnergy, lastMonthEnergy, yearlyEnergy, lastYearEnergy)
	
	if err != nil {
		log.Printf("ERROR: Could not update charger stats: %v", err)
	} else {
		log.Printf("   💾 [Charger %d] Stats saved to charger_stats table", chargerID)
	}
}

// WriteMaintenanceReading writes a 15-min reading when no session is active (idle state)
// Writes to charger_sessions table like Zaptec does
func WriteMaintenanceReading(chargerID int, chargerName string, totalEnergy float64, mode string, db *sql.DB, collector LoxoneCollectorInterface) {
	currentTime := RoundToQuarterHour(time.Now())

	// Check if we already have a reading for this timestamp
	var exists int
	err := db.QueryRow(`
		SELECT COUNT(*) FROM charger_sessions 
		WHERE charger_id = ? AND session_time = ?
	`, chargerID, currentTime.Format("2006-01-02 15:04:05")).Scan(&exists)

	if err == nil && exists > 0 {
		// Already have a reading for this timestamp
		return
	}

	// Write maintenance reading with no user (idle state)
	// Use state "1" for disconnected (matches Zaptec: 1 = Disconnected)
	_, err = db.Exec(`
		INSERT INTO charger_sessions (charger_id, user_id, session_time, power_kwh, mode, state)
		VALUES (?, ?, ?, ?, ?, ?)
	`, chargerID, "", currentTime.Format("2006-01-02 15:04:05"),
		totalEnergy, mode, "1") // state = 1 (disconnected, like Zaptec)

	if err != nil {
		log.Printf("   ⚠️ [%s] Failed to write maintenance reading: %v", chargerName, err)
	} else {
		log.Printf("   📝 [%s] Maintenance reading written: %.3f kWh at %s (disconnected, no user)",
			chargerName, totalEnergy, currentTime.Format("15:04:05"))
	}
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
			log.Printf("   ⚠️ Filled %d reading gaps for charger %s", len(interpolated), device.Name)
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
func ParseLclString(lcl string) (userID string, energy float64, endTime time.Time, duration float64) {
	if lcl == "" {
		return "", 0, time.Time{}, 0
	}

	// Parse end time from beginning (format: "2025-11-29 12:17:16")
	if len(lcl) >= 19 {
		timeStr := lcl[:19]
		if t, err := time.ParseInLocation("2006-01-02 15:04:05", timeStr, time.Local); err == nil {
			endTime = t
		}
	}

	// Parse user ID (format: "user:1")
	userRegex := regexp.MustCompile(`user:(\d+)`)
	if matches := userRegex.FindStringSubmatch(lcl); len(matches) > 1 {
		userID = matches[1]
	}

	// Parse energy (format: "Geladene Energie:37.2kWh")
	energyRegex := regexp.MustCompile(`Geladene Energie:(\d+\.?\d*)kWh`)
	if matches := energyRegex.FindStringSubmatch(lcl); len(matches) > 1 {
		if e, err := strconv.ParseFloat(matches[1], 64); err == nil {
			energy = e
		}
	}

	// Parse duration (format: "Dauer:65357 s")
	durationRegex := regexp.MustCompile(`Dauer:(\d+)\s*s`)
	if matches := durationRegex.FindStringSubmatch(lcl); len(matches) > 1 {
		if d, err := strconv.ParseFloat(matches[1], 64); err == nil {
			duration = d
		}
	}

	return userID, energy, endTime, duration
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