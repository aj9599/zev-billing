import { useState } from 'react';
import type { User as UserType } from '../../../types';
import { api } from '../../../api/client';
import { formatDateForInput } from '../utils/dateUtils';

export function useUserForm(loadData: () => Promise<void>) {
  const [editingUser, setEditingUser] = useState<UserType | null>(null);
  const [formData, setFormData] = useState<Partial<UserType>>({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    address_street: '',
    address_city: '',
    address_zip: '',
    address_country: 'Switzerland',
    bank_name: '',
    bank_iban: '',
    bank_account_holder: '',
    charger_ids: '',
    notes: '',
    building_id: undefined,
    apartment_unit: '',
    user_type: 'regular',
    managed_buildings: [],
    language: 'de',
    is_active: true,
    rent_start_date: '',
    rent_end_date: ''
  });

  const handleEdit = (user: UserType) => {
    setEditingUser(user);
    
    let managedBuildingsArray: number[] = [];
    if (user.managed_buildings) {
      try {
        if (typeof user.managed_buildings === 'string') {
          managedBuildingsArray = JSON.parse(user.managed_buildings);
        } else if (Array.isArray(user.managed_buildings)) {
          managedBuildingsArray = user.managed_buildings;
        }
      } catch (e) {
        console.error('Error parsing managed_buildings:', e);
      }
    }

    const startDate = formatDateForInput(user.rent_start_date);
    const endDate = formatDateForInput(user.rent_end_date) || '2099-01-01';

    console.log('Editing user:', user.id);
    console.log('Rent start date from DB:', user.rent_start_date);
    console.log('Rent end date from DB:', user.rent_end_date);
    console.log('Setting form start date to:', startDate);
    console.log('Setting form end date to:', endDate);

    setFormData({
      ...user,
      managed_buildings: managedBuildingsArray,
      rent_start_date: startDate,
      rent_end_date: endDate
    });
  };

  const resetForm = () => {
    setFormData({
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      address_street: '',
      address_city: '',
      address_zip: '',
      address_country: 'Switzerland',
      bank_name: '',
      bank_iban: '',
      bank_account_holder: '',
      charger_ids: '',
      notes: '',
      building_id: undefined,
      apartment_unit: '',
      user_type: 'regular',
      managed_buildings: [],
      language: 'de',
      is_active: true,
      rent_start_date: '',
      rent_end_date: '2099-01-01'
    });
  };

  const handleSubmit = async (
    e: React.FormEvent,
    data: Partial<UserType>,
    editing: UserType | null,
    buildingsList: BuildingType[],
    onSuccess: () => void
  ) => {
    e.preventDefault();

    // Validate apartment selection for buildings with apartments
    if (data.user_type === 'regular' && data.building_id) {
      const selectedBuilding = buildingsList.find(b => b.id === data.building_id);
      if (selectedBuilding?.has_apartments && !data.apartment_unit) {
        alert('Please select an apartment');
        return;
      }
    }

    // Validate rent period for regular users
    if (data.user_type === 'regular' && !data.rent_start_date) {
      alert('Rent start date is required for regular users');
      return;
    }

    try {
      const dataToSend = {
        ...data,
        managed_buildings: data.user_type === 'administration' && data.managed_buildings
          ? JSON.stringify(data.managed_buildings)
          : undefined
      };

      if (editing) {
        await api.updateUser(editing.id, dataToSend);
      } else {
        await api.createUser(dataToSend);
      }
      
      onSuccess();
      await loadData();
    } catch (err: any) {
      console.error('Save error:', err);
      alert(err.message || 'Failed to save user');
    }
  };

  return {
    formData,
    setFormData,
    editingUser,
    setEditingUser,
    handleEdit,
    resetForm,
    handleSubmit
  };
}