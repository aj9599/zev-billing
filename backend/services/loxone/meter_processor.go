package loxone

import (
	"database/sql"
	"fmt"
	"log"
	"strconv"
	"time"
)

// processMeterData processes meter readings from Loxone responses
func (conn *WebSocketConnection) processMeterData(device *Device, response LoxoneResponse, db *sql.DB, isExport bool) {
	var reading float64

	// Determine if this meter type supports export
	var meterType string
	db.QueryRow("SELECT meter_type FROM meters WHERE id = ?", device.ID).Scan(&meterType)
	supportsExport := (meterType == "total_meter" || meterType == "solar_meter")
	isSolarMeter := (meterType == "solar_meter")

	// Try to get reading from different response formats based on mode
	if device.LoxoneMode == "meter_block" {
		// METER BLOCK MODE - Process BOTH import and export from the SAME response
		var importReading, exportReading float64
		var livePowerW float64

		// Get import reading from output1 (Mrc)
		if output1, ok := response.LL.Outputs["output1"]; ok {
			switch v := output1.Value.(type) {
			case float64:
				importReading = v
			case string:
				if f, err := strconv.ParseFloat(v, 64); err == nil {
					importReading = f
				}
			}
		}

		// Get live power from output0 (Pf - Power Flow in W)
		if output0, ok := response.LL.Outputs["output0"]; ok {
			switch v := output0.Value.(type) {
			case float64:
				livePowerW = v
			case string:
				if f, err := strconv.ParseFloat(v, 64); err == nil {
					livePowerW = f
				}
			}
		}

		// Get export reading from output8 (Mrd) (only for total/solar meters)
		if supportsExport {
			if output8, ok := response.LL.Outputs["output8"]; ok {
				switch v := output8.Value.(type) {
				case float64:
					exportReading = v
				case string:
					if f, err := strconv.ParseFloat(v, 64); err == nil {
						exportReading = f
					}
				}
			}
		}

		// Update device state with BOTH values AND live power
		device.LastReading = importReading
		device.LastReadingExport = exportReading
		device.LastUpdate = time.Now()
		device.ReadingGaps = 0

		// Update live power - positive = import/consumption, negative = export
		if livePowerW >= 0 {
			device.LivePowerW = livePowerW
			device.LivePowerExpW = 0
		} else {
			device.LivePowerW = 0
			device.LivePowerExpW = -livePowerW // Make positive for export
		}
		device.LivePowerTime = time.Now()

		log.Printf("   📥 Import reading (output1/Mrc): %.3f kWh", importReading)
		log.Printf("   ⚡ Live power (output0/Pf): %.1f W", livePowerW)
		if supportsExport {
			log.Printf("   📤 Export reading (output8/Mrd): %.3f kWh", exportReading)
		}

		reading = importReading

	} else if device.LoxoneMode == "energy_meter_block" {
		// ENERGY METER BLOCK MODE - Single value from output1 (Mr)
		if output1, ok := response.LL.Outputs["output1"]; ok {
			switch v := output1.Value.(type) {
			case float64:
				reading = v
			case string:
				if f, err := strconv.ParseFloat(v, 64); err == nil {
					reading = f
				}
			}
		}

		if reading <= 0 {
			return
		}

		device.LastReading = reading
		device.LastUpdate = time.Now()
		device.ReadingGaps = 0
		log.Printf("   📊 Reading (output1/Mr): %.3f kWh", reading)

	} else if device.LoxoneMode == "virtual_output_dual" {
		// VIRTUAL OUTPUT DUAL MODE - Separate UUIDs for import and export
		// CRITICAL FIX: Buffer readings and only save when BOTH are available

		var currentValue float64
		if output1, ok := response.LL.Outputs["output1"]; ok {
			switch v := output1.Value.(type) {
			case float64:
				currentValue = v
			case string:
				if f, err := strconv.ParseFloat(v, 64); err == nil {
					currentValue = f
				}
			}
		} else if response.LL.Value != "" {
			if f, err := strconv.ParseFloat(response.LL.Value, 64); err == nil {
				currentValue = f
			}
		}

		// Get or create buffer for this meter
		conn.MeterBufferMu.Lock()
		buffer, exists := conn.MeterReadingBuffers[device.ID]
		if !exists {
			buffer = &MeterReadingBuffer{}
			conn.MeterReadingBuffers[device.ID] = buffer
		}

		// Update buffer based on whether this is import or export reading
		if isExport {
			// Export reading
			if currentValue <= 0 && !isSolarMeter {
				log.Printf("   ⚠️ Export reading is 0 or negative, skipping")
				conn.MeterBufferMu.Unlock()
				return
			}

			buffer.ExportValue = currentValue
			buffer.HasExport = true
			buffer.LastUpdateTime = time.Now()
			log.Printf("   📤 Export reading buffered: %.3f kWh", currentValue)

			// For solar meters, allow zero export
			if isSolarMeter && currentValue == 0 {
				buffer.ExportValue = 0
				buffer.HasExport = true
			}
		} else {
			// Import reading
			if currentValue > 0 {
				buffer.ImportValue = currentValue
				buffer.HasImport = true
				buffer.LastUpdateTime = time.Now()
				log.Printf("   📥 Import reading buffered: %.3f kWh", currentValue)
			} else if isSolarMeter {
				// For solar meters, allow zero import and try to load last value from DB
				var lastImportFromDB float64
				err := db.QueryRow(`
						SELECT power_kwh FROM meter_readings 
						WHERE meter_id = ? 
						ORDER BY reading_time DESC LIMIT 1
					`, device.ID).Scan(&lastImportFromDB)

				if err == nil && lastImportFromDB > 0 {
					log.Printf("   ☀️ Solar meter: Import is 0, using last DB value: %.3f kWh", lastImportFromDB)
					buffer.ImportValue = lastImportFromDB
				} else {
					log.Printf("   ☀️ Solar meter: Import is 0, no previous value, using 0")
					buffer.ImportValue = 0
				}
				buffer.HasImport = true
				buffer.LastUpdateTime = time.Now()
			} else {
				log.Printf("   ⚠️ Import reading is 0 or negative, skipping")
				conn.MeterBufferMu.Unlock()
				return
			}
		}

		// Check if we have BOTH readings and they're recent (within 2 seconds)
		hasBothReadings := buffer.HasImport && buffer.HasExport
		readingsAreRecent := time.Since(buffer.LastUpdateTime) < 2*time.Second

		if hasBothReadings && readingsAreRecent {
			// We have both readings! Save to database
			importValue := buffer.ImportValue
			exportValue := buffer.ExportValue

			log.Printf("   ✅ Both readings available - Import: %.3f kWh, Export: %.3f kWh",
				importValue, exportValue)

			// Clear buffer BEFORE saving to prevent race conditions
			buffer.HasImport = false
			buffer.HasExport = false
			conn.MeterBufferMu.Unlock()

			// Update device state
			device.LastReading = importValue
			device.LastReadingExport = exportValue
			device.LastUpdate = time.Now()
			device.ReadingGaps = 0
			reading = importValue

			// Proceed to save (code below will handle this)
		} else {
			// Still waiting for the other reading
			if buffer.HasImport && !buffer.HasExport {
				log.Printf("   ⏳ Waiting for export reading...")
			} else if buffer.HasExport && !buffer.HasImport {
				log.Printf("   ⏳ Waiting for import reading...")
			}
			conn.MeterBufferMu.Unlock()
			return
		}

	} else if device.LoxoneMode == "virtual_output_single" {
		// VIRTUAL OUTPUT SINGLE MODE - Single UUID, single value
		if output1, ok := response.LL.Outputs["output1"]; ok {
			switch v := output1.Value.(type) {
			case float64:
				reading = v
			case string:
				if f, err := strconv.ParseFloat(v, 64); err == nil {
					reading = f
				}
			}
		} else if response.LL.Value != "" {
			if f, err := strconv.ParseFloat(response.LL.Value, 64); err == nil {
				reading = f
			}
		}

		if reading <= 0 {
			return
		}

		device.LastReading = reading
		device.LastUpdate = time.Now()
		device.ReadingGaps = 0
		log.Printf("   📊 Reading: %.3f kWh", reading)
	}

	// Save to database
	if reading < 0 {
		return
	}
	if reading == 0 && !isSolarMeter {
		return
	}
	if reading == 0 && isSolarMeter && device.LastReadingExport <= 0 {
		return
	}

	currentTime := RoundToQuarterHour(time.Now())

	var lastReading, lastReadingExport float64
	var lastTime time.Time
	err := db.QueryRow(`
        SELECT power_kwh, power_kwh_export, reading_time FROM meter_readings 
        WHERE meter_id = ? 
        ORDER BY reading_time DESC LIMIT 1
    `, device.ID).Scan(&lastReading, &lastReadingExport, &lastTime)

	var consumption, consumptionExport float64
	isFirstReading := false

	if err == nil && !lastTime.IsZero() {
		interpolated := InterpolateReadings(lastTime, lastReading, currentTime, reading)

		var interpolatedExport []struct {
			time  time.Time
			value float64
		}
		if supportsExport {
			interpolatedExport = InterpolateReadings(lastTime, lastReadingExport, currentTime, device.LastReadingExport)
		}

		for i, point := range interpolated {
			intervalConsumption := point.value - lastReading
			if intervalConsumption < 0 {
				intervalConsumption = 0
			}

			intervalExport := float64(0)
			exportValue := lastReadingExport
			if supportsExport && i < len(interpolatedExport) {
				exportValue = interpolatedExport[i].value
				intervalExport = exportValue - lastReadingExport
				if intervalExport < 0 {
					intervalExport = 0
				}
			}

			db.Exec(`
                INSERT INTO meter_readings (meter_id, reading_time, power_kwh, power_kwh_export, consumption_kwh, consumption_export)
                VALUES (?, ?, ?, ?, ?, ?)
            `, device.ID, point.time, point.value,
				exportValue,
				intervalConsumption,
				intervalExport)

			lastReading = point.value
			if supportsExport && i < len(interpolatedExport) {
				lastReadingExport = interpolatedExport[i].value
			}
		}

		if len(interpolated) > 0 {
			device.ReadingGaps += len(interpolated)
			log.Printf("   ⚠️ Filled %d reading gaps for meter %s", len(interpolated), device.Name)
		}

		consumption = reading - lastReading
		if consumption < 0 {
			consumption = 0
		}

		if supportsExport {
			consumptionExport = device.LastReadingExport - lastReadingExport
			if consumptionExport < 0 {
				consumptionExport = 0
			}
		}
	} else {
		consumption = 0
		consumptionExport = 0
		isFirstReading = true
	}

	_, err = db.Exec(`
        INSERT INTO meter_readings (meter_id, reading_time, power_kwh, power_kwh_export, consumption_kwh, consumption_export)
        VALUES (?, ?, ?, ?, ?, ?)
    `, device.ID, currentTime, reading, device.LastReadingExport, consumption, consumptionExport)

	if err != nil {
		log.Printf("❌ Failed to save reading to database: %v", err)
		conn.Mu.Lock()
		conn.LastError = fmt.Sprintf("DB save failed: %v", err)
		conn.Mu.Unlock()
	} else {
		db.Exec(`
            UPDATE meters 
            SET last_reading = ?, last_reading_export = ?, last_reading_time = ?, 
                notes = ?
            WHERE id = ?
        `, reading, device.LastReadingExport, currentTime,
			fmt.Sprintf("🟢 Last update: %s", time.Now().Format("2006-01-02 15:04:05")),
			device.ID)

		if !isFirstReading {
			if supportsExport {
				log.Printf("✔️ METER [%s]: %.3f kWh import (Δ%.3f), %.3f kWh export (Δ%.3f)",
					device.Name, reading, consumption, device.LastReadingExport, consumptionExport)
			} else {
				log.Printf("✔️ METER [%s]: %.3f kWh (Δ%.3f)",
					device.Name, reading, consumption)
			}
		} else {
			if supportsExport {
				log.Printf("✔️ METER [%s]: %.3f kWh import, %.3f kWh export (first reading)",
					device.Name, reading, device.LastReadingExport)
			} else {
				log.Printf("✔️ METER [%s]: %.3f kWh (first reading)",
					device.Name, reading)
			}
		}
	}
}
