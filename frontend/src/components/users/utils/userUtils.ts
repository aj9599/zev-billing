import type { User as UserType, Building as BuildingType } from '../../../types';

export function getBuildingName(buildingId: number | undefined, buildings: BuildingType[]): string {
  if (!buildingId) return '-';
  return buildings.find(b => b.id === buildingId)?.name || '-';
}

export function getManagedBuildingsNames(
  managedBuildings: number[] | string | undefined,
  buildings: BuildingType[]
): string {
  let buildingIds: number[] = [];

  if (!managedBuildings) return '-';

  try {
    if (typeof managedBuildings === 'string') {
      buildingIds = JSON.parse(managedBuildings);
    } else if (Array.isArray(managedBuildings)) {
      buildingIds = managedBuildings;
    }
  } catch (e) {
    return '-';
  }

  if (buildingIds.length === 0) return '-';
  return buildingIds.map(id => buildings.find(b => b.id === id)?.name || `ID ${id}`).join(', ');
}

export function getUserCountForBuilding(buildingId: number, users: UserType[]): number {
  return users.filter(u => u.building_id === buildingId && u.is_active).length;
}

export function getAvailableApartments(
  buildingId: number | undefined,
  buildings: BuildingType[],
  users: UserType[],
  editingUserId?: number
): string[] {
  if (!buildingId) return [];

  const building = buildings.find(b => b.id === buildingId);
  if (!building || !building.has_apartments || !building.floors_config) return [];

  const allApartments: string[] = [];
  building.floors_config.forEach(floor => {
    floor.apartments.forEach(apt => {
      allApartments.push(`${floor.floor_name} - ${apt}`);
    });
  });

  // Filter out occupied apartments (only by active users, excluding current user if editing)
  const occupiedApartments = users
    .filter(u => u.building_id === buildingId && u.is_active && u.apartment_unit && u.id !== editingUserId)
    .map(u => u.apartment_unit);

  return allApartments.filter(apt => !occupiedApartments.includes(apt));
}

export function userManagesBuilding(user: UserType, buildingId: number, buildings: BuildingType[]): boolean {
  if (user.user_type !== 'administration' || !user.managed_buildings) return false;

  let managedBuildingIds: number[] = [];
  try {
    if (typeof user.managed_buildings === 'string') {
      managedBuildingIds = JSON.parse(user.managed_buildings);
    } else if (Array.isArray(user.managed_buildings)) {
      managedBuildingIds = user.managed_buildings;
    }
  } catch (e) {
    return false;
  }

  // Check if the building is directly managed
  if (managedBuildingIds.includes(buildingId)) return true;

  // Check if the user manages a complex that includes this building
  for (const managedId of managedBuildingIds) {
    const managedBuilding = buildings.find(b => b.id === managedId);
    if (managedBuilding && managedBuilding.is_group && managedBuilding.group_buildings) {
      const groupBuildingIds = typeof managedBuilding.group_buildings === 'string'
        ? JSON.parse(managedBuilding.group_buildings)
        : managedBuilding.group_buildings;
      if (groupBuildingIds.includes(buildingId)) return true;
    }
  }

  return false;
}

export function filterUsers(
  users: UserType[],
  buildings: BuildingType[],
  selectedBuildingId: number | 'all',
  searchQuery: string,
  showArchive: boolean
): UserType[] {
  return users.filter(user => {
    // Filter by active/inactive status
    const matchesActiveStatus = showArchive ? !user.is_active : user.is_active;

    // Filter by building
    let matchesBuilding = false;
    if (selectedBuildingId === 'all') {
      matchesBuilding = true;
    } else if (user.user_type === 'regular') {
      matchesBuilding = user.building_id === selectedBuildingId;
    } else if (user.user_type === 'administration') {
      matchesBuilding = userManagesBuilding(user, selectedBuildingId as number, buildings);
    }

    // Filter by search query
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = searchQuery === '' ||
      `${user.first_name} ${user.last_name}`.toLowerCase().includes(searchLower) ||
      user.email.toLowerCase().includes(searchLower) ||
      (user.apartment_unit && user.apartment_unit.toLowerCase().includes(searchLower));

    return matchesActiveStatus && matchesBuilding && matchesSearch;
  });
}