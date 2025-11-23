import { useState, useEffect } from 'react';
import { api } from '../../api/client';
import type { CustomLineItem, Building } from '../../../types';
import { useTranslation } from '../../i18n';
import { validateCustomItemForm } from '../utils/validationUtils';

interface CustomItemFormData {
  building_id: number;
  description: string;
  amount: number;
  frequency: 'once' | 'monthly' | 'quarterly' | 'yearly';
  category: 'meter_rent' | 'maintenance' | 'service' | 'other';
  is_active: boolean;
}

export function useCustomItems() {
  const { t } = useTranslation();
  const [items, setItems] = useState<CustomLineItem[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [itemsData, buildingsData] = await Promise.all([
        api.getCustomLineItems(),
        api.getBuildings()
      ]);
      setItems(itemsData);
      setBuildings(buildingsData.filter(b => !b.is_group));
    } catch (err) {
      console.error('Failed to load custom items:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const createItem = async (formData: CustomItemFormData) => {
    const errors = validateCustomItemForm(formData, t);
    if (Object.keys(errors).length > 0) {
      throw new Error(Object.values(errors)[0]);
    }

    setSaving(true);
    try {
      await api.createCustomLineItem(formData);
      await loadData();
    } catch (err) {
      console.error('Failed to create custom item:', err);
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const updateItem = async (id: number, formData: CustomItemFormData) => {
    const errors = validateCustomItemForm(formData, t);
    if (Object.keys(errors).length > 0) {
      throw new Error(Object.values(errors)[0]);
    }

    setSaving(true);
    try {
      await api.updateCustomLineItem(id, formData);
      await loadData();
    } catch (err) {
      console.error('Failed to update custom item:', err);
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const deleteItem = async (id: number) => {
    try {
      await api.deleteCustomLineItem(id);
      await loadData();
    } catch (err) {
      console.error('Failed to delete custom item:', err);
      throw err;
    }
  };

  return {
    items,
    buildings,
    loading,
    saving,
    error,
    createItem,
    updateItem,
    deleteItem,
    refresh: loadData
  };
}