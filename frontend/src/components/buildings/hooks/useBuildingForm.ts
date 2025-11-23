import { useState } from 'react';
import { api } from '../../../api/client';
import { useTranslation } from '../../../i18n';
import type { Building } from '../../../types';

export function useBuildingForm(onSuccess: () => void) {
  const { t } = useTranslation();
  const [editingBuilding, setEditingBuilding] = useState<Building | null>(null);
  const [formData, setFormData] = useState<Partial<Building>>({
    name: '',
    address_street: '',
    address_city: '',
    address_zip: '',
    address_country: 'Switzerland',
    notes: '',
    is_group: false,
    group_buildings: [],
    has_apartments: false,
    floors_config: []
  });

  const handleSubmit = async (e: React.FormEvent): Promise<boolean> => {
    e.preventDefault();
    try {
      if (editingBuilding) {
        await api.updateBuilding(editingBuilding.id, formData);
      } else {
        await api.createBuilding(formData);
      }
      resetForm();
      onSuccess();
      return true;
    } catch (err) {
      alert(t('buildings.saveFailed'));
      return false;
    }
  };

  const handleEdit = (building: Building) => {
    setEditingBuilding(building);
    setFormData({
      ...building,
      floors_config: building.floors_config || []
    });
  };

  const resetForm = () => {
    setFormData({
      name: '',
      address_street: '',
      address_city: '',
      address_zip: '',
      address_country: 'Switzerland',
      notes: '',
      is_group: false,
      group_buildings: [],
      has_apartments: false,
      floors_config: []
    });
    setEditingBuilding(null);
  };

  return {
    editingBuilding,
    formData,
    setFormData,
    handleSubmit,
    handleEdit,
    resetForm,
    setEditingBuilding
  };
}