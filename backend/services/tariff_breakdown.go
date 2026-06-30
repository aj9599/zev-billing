package services

import (
	"database/sql"
)

// TariffInterval is the solar/grid split of a single meter's consumption in one
// 15-minute reading interval.
type TariffInterval struct {
	ReadingTime string  `json:"reading_time"`
	Consumption float64 `json:"consumption_kwh"`
	SolarKWh    float64 `json:"solar_kwh"`
	GridKWh     float64 `json:"grid_kwh"`
}

// TariffBreakdown is the per-interval solar/grid split for one apartment meter
// over a date range, plus period totals.
type TariffBreakdown struct {
	MeterID          int              `json:"meter_id"`
	MeterName        string           `json:"meter_name"`
	MeterType        string           `json:"meter_type"`
	BuildingID       int              `json:"building_id"`
	StartDate        string           `json:"start_date"`
	EndDate          string           `json:"end_date"`
	TotalConsumption float64          `json:"total_consumption_kwh"`
	TotalSolar       float64          `json:"total_solar_kwh"`
	TotalGrid        float64          `json:"total_grid_kwh"`
	SolarPercent     float64          `json:"solar_percent"`
	Intervals        []TariffInterval `json:"intervals"`
}

// BuildingIntervalAgg holds, for one reading interval, the building-wide totals
// needed to allocate solar (and battery) between consumers.
type BuildingIntervalAgg struct {
	TotalConsumption float64
	SolarProduction  float64
	// BatteryCharge is solar stored into the battery this interval; it is removed
	// from the solar available to tenants now (it comes back later as discharge).
	BatteryCharge float64
	// BatteryDischarge is energy the battery supplied to the building this
	// interval — the battery pool, allocated after solar and priced at the
	// battery tariff.
	BatteryDischarge float64
}

// SplitSolarBatteryGrid allocates a meter's interval consumption across three
// tiers — solar, battery, then grid — each proportional to the meter's share of
// building consumption. Solar available to tenants this interval is the solar
// production minus what was stored into the battery (clamped at zero). The
// battery pool covers the consumption solar didn't, and the rest is grid.
//
// With no battery (charge and discharge both zero) this reduces exactly to
// SplitSolarGrid, so buildings without a battery are unaffected.
func SplitSolarBatteryGrid(meterConsumption, buildingConsumption, solarProduction, batteryCharge, batteryDischarge float64) (solar, battery, grid float64) {
	if meterConsumption <= 0 {
		return 0, 0, 0
	}
	if buildingConsumption <= 0 {
		return 0, 0, meterConsumption
	}
	availSolar := solarProduction - batteryCharge
	if availSolar < 0 {
		availSolar = 0
	}
	share := meterConsumption / buildingConsumption

	if availSolar >= buildingConsumption {
		return meterConsumption, 0, 0
	}
	solar = availSolar * share
	remaining := meterConsumption - solar

	// Battery tier covers the building consumption solar didn't reach.
	buildingRemaining := buildingConsumption - availSolar // > 0 here
	if batteryDischarge >= buildingRemaining {
		battery = remaining
	} else {
		battery = remaining * (batteryDischarge / buildingRemaining)
	}
	grid = remaining - battery
	return solar, battery, grid
}

// SplitSolarGrid allocates a meter's interval consumption into solar and grid,
// mirroring the per-interval logic in billing's calculateZEVConsumption: each
// consumer receives a share of the interval's solar proportional to its share
// of building consumption; the remainder is billed at the grid tariff.
func SplitSolarGrid(meterConsumption, buildingConsumption, solarProduction float64) (solar, grid float64) {
	if meterConsumption <= 0 {
		return 0, 0
	}
	if buildingConsumption <= 0 {
		return 0, meterConsumption
	}
	if solarProduction >= buildingConsumption {
		return meterConsumption, 0
	}
	share := meterConsumption / buildingConsumption
	solar = solarProduction * share
	grid = meterConsumption - solar
	return solar, grid
}

// LoadBuildingIntervalAggregates returns, keyed by the exact reading_time string,
// the total apartment consumption and total solar production for a building over
// the given inclusive date range (dates as YYYY-MM-DD).
func LoadBuildingIntervalAggregates(db *sql.DB, buildingID int, startDate, endDate string) (map[string]*BuildingIntervalAgg, error) {
	rows, err := db.Query(`
		SELECT mr.reading_time, m.meter_type,
		       COALESCE(mr.consumption_kwh, 0), COALESCE(mr.consumption_export, 0)
		FROM meter_readings mr
		JOIN meters m ON mr.meter_id = m.id
		WHERE m.building_id = ?
		  AND m.meter_type IN ('apartment_meter', 'solar_meter')
		  AND substr(mr.reading_time, 1, 10) BETWEEN ? AND ?
	`, buildingID, startDate, endDate)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	agg := make(map[string]*BuildingIntervalAgg)
	for rows.Next() {
		var ts, meterType string
		var consumption, consumptionExport float64
		if err := rows.Scan(&ts, &meterType, &consumption, &consumptionExport); err != nil {
			continue
		}
		if agg[ts] == nil {
			agg[ts] = &BuildingIntervalAgg{}
		}
		switch meterType {
		case "apartment_meter":
			agg[ts].TotalConsumption += consumption
		case "solar_meter":
			// Solar production is the export energy of the solar meter.
			agg[ts].SolarProduction += consumptionExport
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Solar-priced split meters (e.g. a heating meter on a solar/grid split) draw from
	// the same solar pool, so they must be added to the building consumption total here
	// to keep this breakdown consistent with how billing allocates solar.
	splitRows, err := db.Query(`
		SELECT mr.reading_time, COALESCE(mr.consumption_kwh, 0)
		FROM meter_readings mr
		JOIN shared_meter_configs smc ON smc.meter_id = mr.meter_id
		WHERE smc.building_id = ?
		  AND smc.pricing_mode IN ('solar_grid_custom', 'solar_grid_pricing')
		  AND substr(mr.reading_time, 1, 10) BETWEEN ? AND ?
	`, buildingID, startDate, endDate)
	if err != nil {
		return nil, err
	}
	defer splitRows.Close()
	for splitRows.Next() {
		var ts string
		var consumption float64
		if err := splitRows.Scan(&ts, &consumption); err != nil {
			continue
		}
		if agg[ts] == nil {
			agg[ts] = &BuildingIntervalAgg{}
		}
		agg[ts].TotalConsumption += consumption
	}
	return agg, splitRows.Err()
}

// ComputeMeterTariffBreakdown computes the per-interval solar/grid split for a
// single apartment meter, faithful to how billing allocates ZEV consumption.
// Non-apartment meters have no split and return an empty interval list.
func ComputeMeterTariffBreakdown(db *sql.DB, meterID int, startDate, endDate string) (*TariffBreakdown, error) {
	var meterName, meterType string
	var buildingID int
	if err := db.QueryRow(
		`SELECT name, meter_type, building_id FROM meters WHERE id = ?`, meterID,
	).Scan(&meterName, &meterType, &buildingID); err != nil {
		return nil, err
	}

	result := &TariffBreakdown{
		MeterID:    meterID,
		MeterName:  meterName,
		MeterType:  meterType,
		BuildingID: buildingID,
		StartDate:  startDate,
		EndDate:    endDate,
		Intervals:  []TariffInterval{},
	}

	if meterType != "apartment_meter" {
		return result, nil
	}

	agg, err := LoadBuildingIntervalAggregates(db, buildingID, startDate, endDate)
	if err != nil {
		return nil, err
	}

	rows, err := db.Query(`
		SELECT reading_time, COALESCE(consumption_kwh, 0)
		FROM meter_readings
		WHERE meter_id = ?
		  AND substr(reading_time, 1, 10) BETWEEN ? AND ?
		ORDER BY reading_time
	`, meterID, startDate, endDate)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var ts string
		var consumption float64
		if err := rows.Scan(&ts, &consumption); err != nil {
			continue
		}
		if consumption <= 0 {
			continue
		}
		var buildingConsumption, solarProduction float64
		if a := agg[ts]; a != nil {
			buildingConsumption = a.TotalConsumption
			solarProduction = a.SolarProduction
		}
		solar, grid := SplitSolarGrid(consumption, buildingConsumption, solarProduction)
		result.Intervals = append(result.Intervals, TariffInterval{
			ReadingTime: ts,
			Consumption: consumption,
			SolarKWh:    solar,
			GridKWh:     grid,
		})
		result.TotalConsumption += consumption
		result.TotalSolar += solar
		result.TotalGrid += grid
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	if result.TotalConsumption > 0 {
		result.SolarPercent = result.TotalSolar / result.TotalConsumption * 100
	}
	return result, nil
}
