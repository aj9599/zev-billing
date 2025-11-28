package services

import (
	"database/sql"
	"fmt"
	"log"
	"strconv"
	"time"
)

// ========== METER DATA PROCESSING ==========

func (conn *LoxoneWebSocketConnection) processMeterData(device *LoxoneDevice, response LoxoneResponse, db *sql.DB, isExport bool) {
	var reading float64

	var meterType string
	db.QueryRow("SELECT meter_type FROM meters WHERE id = ?", device.ID).Scan(&meterType)
	supportsExport := (meterType == "total_meter" || meterType == "solar_meter")
	isSolarMeter := (meterType == "solar_meter")

	if device.LoxoneMode == "meter_block" {
		var importReading, exportReading float64

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

		device.lastReading = importReading
		device.lastReadingExport = exportReading
		device.lastUpdate = time.Now()
		device.readingGaps = 0

		log.Printf("   📥 Import reading (output1/Mrc): %.3f kWh", importReading)
		if supportsExport {
			log.Printf("   📤 Export reading (output8/Mrd): %.3f kWh", exportReading)
		}

		reading = importReading

	} else if device.LoxoneMode == "energy_meter_block" {
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

		device.lastReading = reading
		device.lastUpdate = time.Now()
		device.readingGaps = 0
		log.Printf("   📊 Reading (output1/Mr): %.3f kWh", reading)

	} else if device.LoxoneMode == "virtual_output_dual" {
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

		if isExport {
			if currentValue <= 0 {
				log.Printf("   ⚠️ Export reading is 0 or negative, skipping")
				return
			}

			device.lastReadingExport = currentValue
			log.Printf("   📤 Export reading received: %.3f kWh", currentValue)

			if time.Since(device.lastUpdate) < 30*time.Second && device.lastReading > 0 {
				log.Printf("   ✅ Both readings available (import: %.3f kWh), saving to database", device.lastReading)
				reading = device.lastReading
			} else if isSolarMeter {
				var lastImportFromDB float64
				err := db.QueryRow(`
					SELECT power_kwh FROM meter_readings 
					WHERE meter_id = ? 
					ORDER BY reading_time DESC LIMIT 1
				`, device.ID).Scan(&lastImportFromDB)

				if err == nil && lastImportFromDB > 0 {
					log.Printf("   ☀️ Solar meter: No recent import, using last DB value: %.3f kWh", lastImportFromDB)
					device.lastReading = lastImportFromDB
					reading = lastImportFromDB
				} else {
					log.Printf("   ☀️ Solar meter: No import value available, using 0")
					device.lastReading = 0
					reading = 0
				}
				device.lastUpdate = time.Now()
			} else {
				log.Printf("   ⏳ Waiting for import reading...")
				return
			}
		} else {
			if currentValue > 0 {
				device.lastReading = currentValue
				log.Printf("   📥 Import reading received: %.3f kWh", currentValue)
			} else if isSolarMeter {
				var lastImportFromDB float64
				err := db.QueryRow(`
					SELECT power_kwh FROM meter_readings 
					WHERE meter_id = ? 
					ORDER BY reading_time DESC LIMIT 1
				`, device.ID).Scan(&lastImportFromDB)

				if err == nil && lastImportFromDB > 0 {
					log.Printf("   ☀️ Solar meter: Import is 0, using last DB value: %.3f kWh", lastImportFromDB)
					device.lastReading = lastImportFromDB
				} else {
					log.Printf("   ☀️ Solar meter: Import is 0, no previous value, using 0")
					device.lastReading = 0
				}
			} else {
				log.Printf("   ⚠️ Import reading is 0 or negative, skipping")
				return
			}

			device.lastUpdate = time.Now()

			if device.lastReadingExport > 0 {
				log.Printf("   ✅ Both readings available (export: %.3f kWh), saving to database", device.lastReadingExport)
				reading = device.lastReading
			} else {
				log.Printf("   ⏳ Waiting for export reading...")
				return
			}
		}

		device.readingGaps = 0

	} else if device.LoxoneMode == "virtual_output_single" {
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

		device.lastReading = reading
		device.lastUpdate = time.Now()
		device.readingGaps = 0
		log.Printf("   📊 Reading: %.3f kWh", reading)
	}

	if reading < 0 {
		return
	}
	if reading == 0 && !isSolarMeter {
		return
	}
	if reading == 0 && isSolarMeter && device.lastReadingExport <= 0 {
		return
	}

	currentTime := roundToQuarterHour(time.Now())

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
		interpolated := interpolateReadings(lastTime, lastReading, currentTime, reading)

		var interpolatedExport []struct {
			time  time.Time
			value float64
		}
		if supportsExport {
			interpolatedExport = interpolateReadings(lastTime, lastReadingExport, currentTime, device.lastReadingExport)
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
			device.readingGaps += len(interpolated)
			log.Printf("   ⚠️ Filled %d reading gaps for meter %s", len(interpolated), device.Name)
		}

		consumption = reading - lastReading
		if consumption < 0 {
			consumption = 0
		}

		if supportsExport {
			consumptionExport = device.lastReadingExport - lastReadingExport
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
    `, device.ID, currentTime, reading, device.lastReadingExport, consumption, consumptionExport)

	if err != nil {
		log.Printf("❌ Failed to save reading to database: %v", err)
		conn.mu.Lock()
		conn.lastError = fmt.Sprintf("DB save failed: %v", err)
		conn.mu.Unlock()
	} else {
		db.Exec(`
            UPDATE meters 
            SET last_reading = ?, last_reading_export = ?, last_reading_time = ?, 
                notes = ?
            WHERE id = ?
        `, reading, device.lastReadingExport, currentTime,
			fmt.Sprintf("🟢 Last update: %s", time.Now().Format("2006-01-02 15:04:05")),
			device.ID)

		if !isFirstReading {
			if supportsExport {
				log.Printf("✅ METER [%s]: %.3f kWh import (Δ%.3f), %.3f kWh export (Δ%.3f)",
					device.Name, reading, consumption, device.lastReadingExport, consumptionExport)
			} else {
				log.Printf("✅ METER [%s]: %.3f kWh (Δ%.3f)",
					device.Name, reading, consumption)
			}
		} else {
			if supportsExport {
				log.Printf("✅ METER [%s]: %.3f kWh import, %.3f kWh export (first reading)",
					device.Name, reading, device.lastReadingExport)
			} else {
				log.Printf("✅ METER [%s]: %.3f kWh (first reading)",
					device.Name, reading)
			}
		}
	}
}