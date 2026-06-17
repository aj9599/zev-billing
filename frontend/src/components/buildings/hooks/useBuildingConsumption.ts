import type { BuildingConsumption } from '../../../types';

interface ConsumptionResult {
  total: number;
  solar: number;
  charging: number;
  actualHouseConsumption: number;
  gridPower: number;
  solarProduction: number;
  solarConsumption: number;
  solarToGrid: number;
  solarToHouse: number;
  gridToHouse: number;
  // Battery (kW): charge = energy stored, discharge = energy supplied to house.
  // batteryNet > 0 = charging, < 0 = discharging.
  batteryCharge: number;
  batteryDischarge: number;
  batteryNet: number;
  hasBattery: boolean;
}

export function useBuildingConsumption(consumptionData: BuildingConsumption[]) {
  const getBuildingConsumption = (buildingId: number): ConsumptionResult => {
    const data = consumptionData.find(d => d.building_id === buildingId);
    if (!data) {
      return {
        total: 0,
        solar: 0,
        charging: 0,
        actualHouseConsumption: 0,
        gridPower: 0,
        solarProduction: 0,
        solarConsumption: 0,
        solarToGrid: 0,
        solarToHouse: 0,
        gridToHouse: 0,
        batteryCharge: 0,
        batteryDischarge: 0,
        batteryNet: 0,
        hasBattery: false
      };
    }

    const buildingMeters = data.meters || [];
    let totalMeterImport = 0;
    let totalMeterExport = 0;
    let solarMeterImport = 0;
    let solarMeterExport = 0;
    let charging = 0;
    let batteryCharge = 0;
    let batteryDischarge = 0;
    let hasBattery = false;

    // Latest value of a given source series within a meter's data.
    const latestBySource = (meter: typeof buildingMeters[number], source: string) => {
      const pts = (meter.data || []).filter(d => d.source === source);
      return pts.length ? pts[pts.length - 1].power / 1000 : 0; // W → kW
    };

    buildingMeters.forEach(meter => {
      const latestData = meter.data?.[meter.data.length - 1];
      if (!latestData) return;

      if (meter.meter_type === 'total_meter') {
        // Total meter: import = buying from grid, export = selling to grid
        totalMeterImport += latestData.power / 1000; // Convert W to kW

        // Look for export data - it may be in a separate data point
        const exportData = meter.data.find(d => d.source === 'total_meter_export');
        if (exportData) {
          totalMeterExport += exportData.power / 1000;
        }
      } else if (meter.meter_type === 'solar_meter') {
        // Solar meter: import = consuming from grid (at night), export = producing
        solarMeterImport += latestData.power / 1000;

        const exportData = meter.data.find(d => d.source === 'solar_meter_export');
        if (exportData) {
          solarMeterExport += exportData.power / 1000;
        }
      } else if (meter.meter_type === 'battery_meter') {
        // Battery: discharge feeds the house (series "battery_meter"),
        // charge stores energy from the bus (series "battery_meter_charge").
        hasBattery = true;
        batteryDischarge += latestBySource(meter, 'battery_meter');
        batteryCharge += latestBySource(meter, 'battery_meter_charge');
      } else if (meter.meter_type === 'charger') {
        charging += latestData.power / 1000;
      }
    });

    const batteryNet = batteryCharge - batteryDischarge; // + = charging

    // Determine solar behavior: producing (export > import) or consuming (import > export)
    const solarNetProduction = solarMeterExport - solarMeterImport;
    const solarProduction = solarNetProduction > 0 ? solarNetProduction : 0;
    const solarConsumption = solarNetProduction < 0 ? Math.abs(solarNetProduction) : 0;

    // Determine grid behavior: importing (import > export) or exporting (export > import)
    const gridNet = totalMeterImport - totalMeterExport;
    const gridPower = gridNet; // Positive = importing, Negative = exporting
    const isExporting = gridNet < 0;

    // Calculate energy flows
    let solarToHouse = 0;
    let solarToGrid = 0;
    let gridToHouse = 0;
    let actualHouseConsumption = 0;

    if (solarProduction > 0) {
      // Solar is producing
      if (isExporting) {
        // Producing more than consuming - exporting to grid
        solarToGrid = Math.abs(gridNet);
        solarToHouse = solarProduction - solarToGrid;
        actualHouseConsumption = solarToHouse;
      } else {
        // Producing but still need grid power
        solarToHouse = solarProduction;
        gridToHouse = gridNet;
        actualHouseConsumption = solarToHouse + gridToHouse;
      }
    } else {
      // Solar not producing or consuming
      gridToHouse = gridNet;
      actualHouseConsumption = gridToHouse + solarConsumption;
    }

    // Full energy balance so battery flow is reflected in house consumption.
    // The bus balances to: house = solar + gridNet − batteryNet (+ any solar
    // self-consumption). Without this, a house running off the battery with
    // only a few watts from the grid would read as a few watts of consumption.
    // (The branch attribution above is retained only for the solar/grid arrows.)
    actualHouseConsumption = Math.max(0, solarProduction + solarConsumption + gridNet - batteryNet);

    return {
      total: totalMeterImport,
      solar: solarNetProduction, // Positive = producing, Negative = consuming
      charging,
      actualHouseConsumption,
      gridPower, // Positive = importing, Negative = exporting
      solarProduction,
      solarConsumption,
      solarToGrid,
      solarToHouse,
      gridToHouse,
      batteryCharge,
      batteryDischarge,
      batteryNet,
      hasBattery
    };
  };

  return { getBuildingConsumption };
}