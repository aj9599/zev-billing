import { useState, useEffect } from 'react';
import { api } from '../../../api/client';
import type { Building, Meter, Charger, BuildingConsumption } from '../../../types';

export function useBuildingData() {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [meters, setMeters] = useState<Meter[]>([]);
  const [chargers, setChargers] = useState<Charger[]>([]);
  const [consumptionData, setConsumptionData] = useState<BuildingConsumption[]>([]);

  const loadData = async () => {
    try {
      const [buildingsData, metersData, chargersData, consumptionData] = await Promise.all([
        api.getBuildings(),
        api.getMeters(),
        api.getChargers(),
        api.getConsumptionByBuilding('24h')
      ]);
      setBuildings(buildingsData);
      setMeters(metersData);
      setChargers(chargersData);
      setConsumptionData(consumptionData);
    } catch (err) {
      console.error('Failed to load data:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Auto-reload data at quarter-hour intervals (00, 15, 30, 45 minutes)
  useEffect(() => {
    const scheduleNextReload = () => {
      const now = new Date();
      const minutes = now.getMinutes();
      const seconds = now.getSeconds();
      const milliseconds = now.getMilliseconds();

      // Calculate minutes until next quarter hour (0, 15, 30, 45)
      const minutesToNext = 15 - (minutes % 15);

      // Calculate total milliseconds until next quarter hour
      const msToNext = (minutesToNext * 60 * 1000) - (seconds * 1000) - milliseconds;

      console.log(`Next auto-reload scheduled in ${minutesToNext} minutes and ${60 - seconds} seconds`);

      const timeoutId = setTimeout(() => {
        console.log('Auto-reloading data at quarter-hour mark...');
        loadData();
        scheduleNextReload(); // Schedule the next reload
      }, msToNext);

      return timeoutId;
    };

    const timeoutId = scheduleNextReload();

    return () => {
      clearTimeout(timeoutId);
      console.log('Auto-reload timer cleared');
    };
  }, []);

  return {
    buildings,
    meters,
    chargers,
    consumptionData,
    loadData
  };
}