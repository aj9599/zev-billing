import { useState, useEffect } from 'react';
import { api } from '../../api/client';
import type { SharedMeterConfig, Building, Meter, User } from '../../types';
import { useTranslation } from '../../i18n';
import { validateSharedMeterForm } from '../utils/validationUtils';

interface SharedMeterFormData {
  meter_id: number;
  building_id: number;
  meter_name: string;
  split_type: 'equal' | 'custom';
  unit_price: number;
  custom_splits?: Record<number, number>;
}

export function useSharedMeters() {
  const { t } = useTranslation();
  const [configs, setConfigs] = useState<SharedMeterConfig[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [meters, setMeters] = useState<Meter[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [configsData, buildingsData, metersData, usersData] = await Promise.all([
        api.getSharedMeterConfigs(),
        api.getBuildings(),
        api.getMeters(),
        api.getUsers()
      ]);
      
      setConfigs(configsData);
      setBuildings(buildingsData.filter(b => !b.is_group));
      
      // Only show Heating and Other meters (exclude Apartment, Solar, Total)
      const filteredMeters = metersData.filter(m => {
        if (m.user_id) return false; // Exclude user-specific meters
        const meterType = m.meter_type?.toLowerCase() || '';
        return meterType === 'heating' || meterType === 'other';
      });
      setMeters(filteredMeters);
      setUsers(usersData.filter(u => u.is_active));
    } catch (err) {
      console.error('Failed to load shared meters:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const createConfig = async (formData: SharedMeterFormData) => {
    const buildingUsers = users.filter(u => u.building_id === formData.building_id && u.is_active);
    const errors = validateSharedMeterForm(formData, buildingUsers.length, t);
    
    if (Object.keys(errors).length > 0) {
      throw new Error(Object.values(errors)[0]);
    }

    setSaving(true);
    try {
      const saveData = {
        ...formData,
        custom_splits: formData.split_type === 'custom' ? formData.custom_splits : undefined
      };
      await api.createSharedMeterConfig(saveData);
      await loadData();
    } catch (err) {
      console.error('Failed to create shared meter config:', err);
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const updateConfig = async (id: number, formData: SharedMeterFormData) => {
    const buildingUsers = users.filter(u => u.building_id === formData.building_id && u.is_active);
    const errors = validateSharedMeterForm(formData, buildingUsers.length, t);
    
    if (Object.keys(errors).length > 0) {
      throw new Error(Object.values(errors)[0]);
    }

    setSaving(true);
    try {
      const saveData = {
        ...formData,
        custom_splits: formData.split_type === 'custom' ? formData.custom_splits : undefined
      };
      await api.updateSharedMeterConfig(id, saveData);
      await loadData();
    } catch (err) {
      console.error('Failed to update shared meter config:', err);
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const deleteConfig = async (id: number) => {
    try {
      await api.deleteSharedMeterConfig(id);
      await loadData();
    } catch (err) {
      console.error('Failed to delete shared meter config:', err);
      throw err;
    }
  };

  const getBuildingUsers = (buildingId: number) => {
    return users.filter(u => u.building_id === buildingId && u.is_active);
  };

  const getMetersForBuilding = (buildingId: number) => {
    return meters.filter(m => m.building_id === buildingId);
  };

  return {
    configs,
    buildings,
    meters,
    users,
    loading,
    saving,
    error,
    createConfig,
    updateConfig,
    deleteConfig,
    getBuildingUsers,
    getMetersForBuilding,
    refresh: loadData
  };
}