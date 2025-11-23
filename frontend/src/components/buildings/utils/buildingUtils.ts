import type { Building, Meter, Charger } from '../../../types';

export function getBuildingMeters(buildingId: number, meters: Meter[]): Meter[] {
  return meters.filter(m => m.building_id === buildingId);
}

export function getBuildingChargers(buildingId: number, chargers: Charger[]): Charger[] {
  return chargers.filter(c => c.building_id === buildingId);
}

export function hasSolarMeter(buildingId: number, meters: Meter[]): boolean {
  const buildingMeters = getBuildingMeters(buildingId, meters);
  return buildingMeters.some(m => m.meter_type === 'solar_meter');
}

export function getAvailableBuildings(buildings: Building[], excludeId?: number): Building[] {
  return buildings.filter(b => !b.is_group && b.id !== excludeId);
}

export function getBuildingsInComplex(complex: Building, buildings: Building[]): Building[] {
  return buildings.filter(b => complex.group_buildings?.includes(b.id));
}

export function getTotalApartments(building: Building): number {
  return building.floors_config?.reduce((sum, floor) => sum + floor.apartments.length, 0) || 0;
}