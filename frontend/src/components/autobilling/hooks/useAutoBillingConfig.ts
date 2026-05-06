import { useState, useEffect, useCallback } from 'react';
import { api } from '../../../api/client';
import type { Building, User, Meter, ApartmentWithUser, SharedMeterConfig, CustomLineItem, Charger, BillingMode } from '../../../types';

export interface AutoBillingFormData {
  name: string;
  building_ids: number[];
  apartments: ApartmentSelection[];
  frequency: 'monthly' | 'quarterly' | 'half_yearly' | 'yearly';
  generation_day: number;
  first_execution_date: string;
  is_active: boolean;
  is_vzev: boolean;
  // Billing mode (parallels manual flow): 'apartments' | 'building' | 'charger'.
  // 'building' / 'charger' apply to non-apartment buildings only.
  billing_mode: BillingMode;
  charger_id?: number;
  auto_send_email: boolean;
  // Shared meters and custom items
  shared_meter_ids: number[];
  custom_item_ids: number[];
  // Sender info
  sender_name: string;
  sender_address: string;
  sender_city: string;
  sender_zip: string;
  sender_country: string;
  // Banking info
  bank_name: string;
  bank_iban: string;
  bank_account_holder: string;
}

export interface ApartmentSelection {
  building_id: number;
  apartment_unit: string;
  user_id?: number;
}

export interface AutoBillingConfig {
  id: number;
  name: string;
  building_ids: number[];
  apartments?: ApartmentSelection[];
  frequency: 'monthly' | 'quarterly' | 'half_yearly' | 'yearly';
  generation_day: number;
  first_execution_date?: string;
  is_active: boolean;
  is_vzev?: boolean;
  billing_mode?: BillingMode;
  charger_id?: number;
  auto_send_email?: boolean;
  shared_meter_ids?: number[];
  custom_item_ids?: number[];
  last_run?: string;
  next_run?: string;
  sender_name?: string;
  sender_address?: string;
  sender_city?: string;
  sender_zip?: string;
  sender_country?: string;
  bank_name?: string;
  bank_iban?: string;
  bank_account_holder?: string;
  created_at: string;
  updated_at: string;
}

const DEFAULT_FORM_DATA: AutoBillingFormData = {
  name: '',
  building_ids: [],
  apartments: [],
  frequency: 'monthly',
  generation_day: 1,
  first_execution_date: '',
  is_active: true,
  is_vzev: false,
  billing_mode: 'apartments',
  charger_id: undefined,
  auto_send_email: false,
  shared_meter_ids: [],
  custom_item_ids: [],
  sender_name: '',
  sender_address: '',
  sender_city: '',
  sender_zip: '',
  sender_country: 'Switzerland',
  bank_name: '',
  bank_iban: '',
  bank_account_holder: ''
};

export function useAutoBillingConfig() {
  const [configs, setConfigs] = useState<AutoBillingConfig[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [meters, setMeters] = useState<Meter[]>([]);
  const [sharedMeters, setSharedMeters] = useState<SharedMeterConfig[]>([]);
  const [customItems, setCustomItems] = useState<CustomLineItem[]>([]);
  const [chargers, setChargers] = useState<Charger[]>([]);
  const [chargerOnly, setChargerOnly] = useState(false);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [editingConfig, setEditingConfig] = useState<AutoBillingConfig | null>(null);
  const [step, setStep] = useState(1);

  // Form state
  const [formData, setFormData] = useState<AutoBillingFormData>(DEFAULT_FORM_DATA);
  const [selectedApartments, setSelectedApartments] = useState<Set<string>>(new Set());
  const [selectedSharedMeters, setSelectedSharedMeters] = useState<number[]>([]);
  const [selectedCustomItems, setSelectedCustomItems] = useState<number[]>([]);
  const [apartmentsWithUsers, setApartmentsWithUsers] = useState<Map<number, ApartmentWithUser[]>>(new Map());
  const [isVZEVMode, setIsVZEVMode] = useState(false);

  // Total steps
  const TOTAL_STEPS = 7;

  // Load initial data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [configsData, buildingsData, usersData, metersData, sharedMetersData, customItemsData, chargersData] = await Promise.all([
        api.getAutoBillingConfigs(),
        api.getBuildings(),
        api.getUsers(undefined, true),
        api.getMeters(),
        api.getSharedMeterConfigs(),
        api.getCustomLineItems(),
        api.getChargers()
      ]);

      setConfigs(configsData);
      setBuildings(buildingsData);

      // Filter out administration users - only show regular users
      const regularUsers = usersData.filter(u => u.user_type === 'regular');
      setUsers(regularUsers);
      setMeters(metersData);
      setSharedMeters(sharedMetersData);
      // Only active custom items
      setCustomItems(customItemsData.filter(item => item.is_active));
      setChargers(chargersData.filter(c => c.is_active));
    } catch (err) {
      console.error('Failed to load data:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Load saved sender/banking info from session storage
  const loadSavedInfo = useCallback(() => {
    try {
      const savedSender = sessionStorage.getItem('zev_sender_info');
      const savedBanking = sessionStorage.getItem('zev_banking_info');

      if (savedSender) {
        const parsed = JSON.parse(savedSender);
        setFormData(prev => ({
          ...prev,
          sender_name: parsed.name || '',
          sender_address: parsed.address || '',
          sender_city: parsed.city || '',
          sender_zip: parsed.zip || '',
          sender_country: parsed.country || 'Switzerland'
        }));
      }

      if (savedBanking) {
        const parsed = JSON.parse(savedBanking);
        setFormData(prev => ({
          ...prev,
          bank_name: parsed.name || '',
          bank_iban: parsed.iban || '',
          bank_account_holder: parsed.holder || ''
        }));
      }
    } catch (e) {
      console.error('Failed to load saved info:', e);
    }
  }, []);

  // Build apartments list
  const buildApartmentsList = useCallback((): Map<number, ApartmentWithUser[]> => {
    const apartmentMap = new Map<number, ApartmentWithUser[]>();

    formData.building_ids.forEach(buildingId => {
      const building = buildings.find(b => b.id === buildingId);
      if (!building) return;

      let buildingsToProcess: number[] = [buildingId];

      // If this is a complex (vZEV), process all buildings in the group
      if (building.is_group && building.group_buildings) {
        buildingsToProcess = building.group_buildings;
      }

      const apartments: ApartmentWithUser[] = [];
      const apartmentSet = new Set<string>();

      // Process all buildings (either just the one, or all in the complex)
      buildingsToProcess.forEach(processBuildingId => {
        const buildingMeters = meters.filter(
          m => m.building_id === processBuildingId &&
            m.apartment_unit &&
            m.meter_type === 'apartment_meter' &&
            m.is_active
        );

        buildingMeters.forEach(meter => {
          const key = `${processBuildingId}-${meter.apartment_unit}`;
          if (meter.apartment_unit && !apartmentSet.has(key)) {
            apartmentSet.add(key);

            // Find user
            let user: User | undefined;
            if (meter.user_id) {
              user = users.find(u => u.id === meter.user_id);
            }
            if (!user) {
              user = users.find(
                u => u.building_id === processBuildingId &&
                  u.apartment_unit === meter.apartment_unit
              );
            }

            apartments.push({
              building_id: processBuildingId,
              apartment_unit: meter.apartment_unit,
              user: user,
              meter: meter,
              has_meter: true
            });
          }
        });
      });

      // Sort apartments
      apartments.sort((a, b) => {
        const aNum = parseInt(a.apartment_unit.replace(/[^0-9]/g, '')) || 0;
        const bNum = parseInt(b.apartment_unit.replace(/[^0-9]/g, '')) || 0;
        return aNum - bNum;
      });

      apartmentMap.set(buildingId, apartments);
    });

    return apartmentMap;
  }, [formData.building_ids, buildings, users, meters]);

  // Update apartments when buildings change
  useEffect(() => {
    if (formData.building_ids.length > 0 && users.length > 0 && meters.length > 0 && buildings.length > 0) {
      const newApartmentMap = buildApartmentsList();
      setApartmentsWithUsers(newApartmentMap);
    }
  }, [formData.building_ids, users, meters, buildings, buildApartmentsList]);

  // Detect vZEV mode based on selected buildings
  useEffect(() => {
    if (formData.building_ids.length > 0 && buildings.length > 0) {
      const selectedBuildings = buildings.filter(b => formData.building_ids.includes(b.id));
      const hasComplex = selectedBuildings.some(b => b.is_group);
      const hasRegularBuilding = selectedBuildings.some(b => !b.is_group);

      // vZEV mode: Only complexes selected, no regular buildings
      const vzevMode = hasComplex && !hasRegularBuilding;
      setIsVZEVMode(vzevMode);
      setFormData(prev => ({ ...prev, is_vzev: vzevMode }));
    } else {
      setIsVZEVMode(false);
      setFormData(prev => ({ ...prev, is_vzev: false }));
    }
  }, [formData.building_ids, buildings]);

  // Detect billing mode based on the selected buildings' has_apartments flag
  // (mirrors the manual BillConfigModal). vZEV complexes always use 'apartments'.
  useEffect(() => {
    if (formData.building_ids.length === 0 || isVZEVMode) {
      setFormData(prev => ({ ...prev, billing_mode: 'apartments', charger_id: undefined }));
      setChargerOnly(false);
      return;
    }
    const selected = buildings.filter(b => formData.building_ids.includes(b.id) && !b.is_group);
    if (selected.length === 0) {
      setFormData(prev => ({ ...prev, billing_mode: 'apartments', charger_id: undefined }));
      return;
    }
    const allApartmentBldgs = selected.every(b => b.has_apartments);
    const noApartmentBldgs = selected.every(b => !b.has_apartments);

    if (allApartmentBldgs) {
      setFormData(prev => ({ ...prev, billing_mode: 'apartments', charger_id: undefined }));
      setChargerOnly(false);
    } else if (noApartmentBldgs) {
      setFormData(prev => ({
        ...prev,
        billing_mode: chargerOnly ? 'charger' : 'building',
        charger_id: chargerOnly ? prev.charger_id : undefined,
      }));
    } else {
      setFormData(prev => ({ ...prev, billing_mode: 'apartments', charger_id: undefined }));
      setChargerOnly(false);
    }
  }, [formData.building_ids, buildings, chargerOnly, isVZEVMode]);

  // Update form data
  const updateFormData = useCallback((updates: Partial<AutoBillingFormData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
  }, []);

  // Handle building toggle
  const handleBuildingToggle = useCallback((buildingId: number) => {
    const building = buildings.find(b => b.id === buildingId);
    if (!building) return false;

    const currentlySelectedBuildings = buildings.filter(b => formData.building_ids.includes(b.id));
    const hasComplex = currentlySelectedBuildings.some(b => b.is_group);
    const hasRegular = currentlySelectedBuildings.some(b => !b.is_group);

    // If adding a building, prevent mixing
    if (!formData.building_ids.includes(buildingId)) {
      if ((building.is_group && hasRegular) || (!building.is_group && hasComplex)) {
        return false; // Cannot mix
      }
    }

    const newBuildings = formData.building_ids.includes(buildingId)
      ? formData.building_ids.filter(id => id !== buildingId)
      : [...formData.building_ids, buildingId];

    // Clear apartment selections for removed buildings
    if (!newBuildings.includes(buildingId)) {
      const newSelectedApartments = new Set(selectedApartments);
      Array.from(selectedApartments).forEach(key => {
        if (key.startsWith(`${buildingId}|||`)) {
          newSelectedApartments.delete(key);
        }
      });
      setSelectedApartments(newSelectedApartments);

      // Also clear shared meters and custom items for this building
      setSelectedSharedMeters(prev => 
        prev.filter(id => {
          const meter = sharedMeters.find(m => m.id === id);
          return meter && newBuildings.includes(meter.building_id);
        })
      );
      setSelectedCustomItems(prev => 
        prev.filter(id => {
          const item = customItems.find(i => i.id === id);
          return item && newBuildings.includes(item.building_id);
        })
      );
    }

    setFormData(prev => ({ ...prev, building_ids: newBuildings }));
    return true;
  }, [buildings, formData.building_ids, selectedApartments, sharedMeters, customItems]);

  // Handle apartment toggle
  const handleApartmentToggle = useCallback((buildingId: number, apartmentUnit: string) => {
    const key = `${buildingId}|||${apartmentUnit}`;
    const newSelected = new Set(selectedApartments);

    if (newSelected.has(key)) {
      newSelected.delete(key);
    } else {
      newSelected.add(key);
    }

    setSelectedApartments(newSelected);

    const apartmentSelections: ApartmentSelection[] = [];

    newSelected.forEach(selectedKey => {
      const parts = selectedKey.split('|||');
      if (parts.length < 2) return;

      const parsedBuildingId = parseInt(parts[0]);
      const aptUnit = parts.slice(1).join('|||');

      const apartments = apartmentsWithUsers.get(parsedBuildingId);

      const apartment = apartments?.find(a =>
        a.building_id === parsedBuildingId &&
        a.apartment_unit === aptUnit
      );

      if (apartment?.user?.is_active) {
        apartmentSelections.push({
          building_id: parsedBuildingId,
          apartment_unit: aptUnit,
          user_id: apartment.user.id
        });
      } else if (apartment) {
        apartmentSelections.push({
          building_id: parsedBuildingId,
          apartment_unit: aptUnit,
          user_id: undefined
        });
      }
    });

    setFormData(prev => ({
      ...prev,
      apartments: apartmentSelections
    }));
  }, [selectedApartments, apartmentsWithUsers]);

  // Select all active apartments
  const handleSelectAllActive = useCallback(() => {
    const newSelected = new Set(selectedApartments);

    formData.building_ids.forEach(buildingId => {
      const apartments = apartmentsWithUsers.get(buildingId) || [];
      apartments.forEach(apt => {
        if (apt.user?.is_active) {
          newSelected.add(`${buildingId}|||${apt.apartment_unit}`);
        }
      });
    });

    setSelectedApartments(newSelected);

    const apartmentSelections: ApartmentSelection[] = [];

    newSelected.forEach(key => {
      const parts = key.split('|||');
      if (parts.length < 2) return;

      const parsedBuildingId = parseInt(parts[0]);
      const aptUnit = parts.slice(1).join('|||');

      const apartments = apartmentsWithUsers.get(parsedBuildingId);

      const apartment = apartments?.find(a =>
        a.building_id === parsedBuildingId &&
        a.apartment_unit === aptUnit
      );

      if (apartment?.user?.is_active) {
        apartmentSelections.push({
          building_id: parsedBuildingId,
          apartment_unit: aptUnit,
          user_id: apartment.user.id
        });
      }
    });

    setFormData(prev => ({
      ...prev,
      apartments: apartmentSelections
    }));
  }, [formData.building_ids, apartmentsWithUsers, selectedApartments]);

  // Shared meter handlers
  const handleSharedMeterToggle = useCallback((meterId: number) => {
    setSelectedSharedMeters(prev => {
      if (prev.includes(meterId)) {
        return prev.filter(id => id !== meterId);
      } else {
        return [...prev, meterId];
      }
    });
  }, []);

  const handleSelectAllSharedMeters = useCallback(() => {
    const filteredMeters = sharedMeters.filter(m => 
      formData.building_ids.includes(m.building_id)
    );
    setSelectedSharedMeters(filteredMeters.map(m => m.id));
  }, [sharedMeters, formData.building_ids]);

  const handleDeselectAllSharedMeters = useCallback(() => {
    setSelectedSharedMeters([]);
  }, []);

  // Recipient picker for building / charger billing modes — when no apartments
  // are involved, we still need exactly one user to receive the invoice.
  // We persist the recipient as a single synthetic apartments[] entry so the
  // existing scheduler pipeline (which extracts user_ids from apartments) keeps
  // working unchanged.
  const handleRecipientChange = useCallback((userId: number | null) => {
    if (formData.building_ids.length === 0) return;
    if (userId === null) {
      setFormData(prev => ({ ...prev, apartments: [] }));
      setSelectedApartments(new Set());
      return;
    }
    const buildingId = formData.building_ids[0];
    setFormData(prev => ({
      ...prev,
      apartments: [{ building_id: buildingId, apartment_unit: '', user_id: userId }]
    }));
    setSelectedApartments(new Set([`${buildingId}|||`]));
  }, [formData.building_ids]);

  const handleChargerChange = useCallback((chargerId: number | null) => {
    setFormData(prev => ({ ...prev, charger_id: chargerId ?? undefined }));
  }, []);

  const handleChargerOnlyToggle = useCallback((enabled: boolean) => {
    setChargerOnly(enabled);
    if (!enabled) {
      setFormData(prev => ({ ...prev, charger_id: undefined }));
    }
  }, []);

  // Custom item handlers
  const handleCustomItemToggle = useCallback((itemId: number) => {
    setSelectedCustomItems(prev => {
      if (prev.includes(itemId)) {
        return prev.filter(id => id !== itemId);
      } else {
        return [...prev, itemId];
      }
    });
  }, []);

  const handleSelectAllCustomItems = useCallback(() => {
    const filteredItems = customItems.filter(i => 
      formData.building_ids.includes(i.building_id) && i.is_active
    );
    setSelectedCustomItems(filteredItems.map(i => i.id));
  }, [customItems, formData.building_ids]);

  const handleDeselectAllCustomItems = useCallback(() => {
    setSelectedCustomItems([]);
  }, []);

  // Reset form
  const resetForm = useCallback(() => {
    setFormData(DEFAULT_FORM_DATA);
    setSelectedApartments(new Set());
    setSelectedSharedMeters([]);
    setSelectedCustomItems([]);
    setEditingConfig(null);
    setStep(1);
    setIsVZEVMode(false);
    setChargerOnly(false);
  }, []);

  // Open modal for editing
  const openEditModal = useCallback((config: AutoBillingConfig) => {
    setEditingConfig(config);

    // Restore apartment selections if available
    const apartmentKeys = new Set<string>();
    if (config.apartments && config.apartments.length > 0) {
      config.apartments.forEach(apt => {
        apartmentKeys.add(`${apt.building_id}|||${apt.apartment_unit}`);
      });
    }

    setSelectedApartments(apartmentKeys);
    setSelectedSharedMeters(config.shared_meter_ids || []);
    setSelectedCustomItems(config.custom_item_ids || []);

    const mode: BillingMode = (config.billing_mode as BillingMode) || 'apartments';
    setChargerOnly(mode === 'charger');
    setFormData({
      name: config.name,
      building_ids: config.building_ids,
      apartments: config.apartments || [],
      frequency: config.frequency,
      generation_day: config.generation_day,
      first_execution_date: config.first_execution_date || '',
      is_active: config.is_active,
      is_vzev: config.is_vzev || false,
      billing_mode: mode,
      charger_id: config.charger_id,
      auto_send_email: !!config.auto_send_email,
      shared_meter_ids: config.shared_meter_ids || [],
      custom_item_ids: config.custom_item_ids || [],
      sender_name: config.sender_name || '',
      sender_address: config.sender_address || '',
      sender_city: config.sender_city || '',
      sender_zip: config.sender_zip || '',
      sender_country: config.sender_country || 'Switzerland',
      bank_name: config.bank_name || '',
      bank_iban: config.bank_iban || '',
      bank_account_holder: config.bank_account_holder || ''
    });
    setStep(1);
    setShowModal(true);
  }, []);

  // Open modal for creating
  const openCreateModal = useCallback(() => {
    resetForm();
    loadSavedInfo();
    setShowModal(true);
  }, [resetForm, loadSavedInfo]);

  // Close modal
  const closeModal = useCallback(() => {
    setShowModal(false);
    resetForm();
  }, [resetForm]);

  // Submit form
  const submitForm = useCallback(async () => {
    // Save sender and banking info to session storage
    sessionStorage.setItem('zev_sender_info', JSON.stringify({
      name: formData.sender_name,
      address: formData.sender_address,
      city: formData.sender_city,
      zip: formData.sender_zip,
      country: formData.sender_country
    }));

    sessionStorage.setItem('zev_banking_info', JSON.stringify({
      name: formData.bank_name,
      iban: formData.bank_iban,
      holder: formData.bank_account_holder
    }));

    const dataToSubmit = {
      ...formData,
      shared_meter_ids: selectedSharedMeters,
      custom_item_ids: selectedCustomItems
    };

    if (editingConfig) {
      await api.updateAutoBillingConfig(editingConfig.id, dataToSubmit);
    } else {
      await api.createAutoBillingConfig(dataToSubmit);
    }

    closeModal();
    await loadData();
  }, [formData, selectedSharedMeters, selectedCustomItems, editingConfig, closeModal, loadData]);

  // Delete config
  const deleteConfig = useCallback(async (id: number) => {
    await api.deleteAutoBillingConfig(id);
    await loadData();
  }, [loadData]);

  // Toggle active status
  const toggleActive = useCallback(async (config: AutoBillingConfig) => {
    await api.updateAutoBillingConfig(config.id, {
      ...config,
      is_active: !config.is_active
    });
    await loadData();
  }, [loadData]);

  // Check if can proceed to next step
  const canProceed = useCallback((): boolean => {
    switch (step) {
      case 1: {
        if (formData.building_ids.length === 0) return false;
        if (formData.billing_mode === 'charger') {
          return formData.apartments.length > 0 && !!formData.charger_id;
        }
        if (formData.billing_mode === 'building') {
          return formData.apartments.length > 0;
        }
        return formData.apartments.length > 0;
      }
      case 2:
        return !!(formData.name && formData.frequency && formData.generation_day >= 1 && formData.generation_day <= 28);
      case 3:
        return true; // Shared meters are optional
      case 4:
        return true; // Custom items are optional
      case 5:
        return true; // Sender info validation done in final step
      case 6:
        return true; // Banking info validation done in final step
      case 7:
        return !!(formData.sender_name && formData.bank_iban); // Required for final step
      default:
        return false;
    }
  }, [step, formData]);

  // Get active users count
  const getActiveUsersCount = useCallback(() => {
    let count = 0;
    selectedApartments.forEach(key => {
      const parts = key.split('|||');
      if (parts.length < 2) return;
      const buildingId = parseInt(parts[0]);
      const aptUnit = parts.slice(1).join('|||');
      const apartments = apartmentsWithUsers.get(buildingId);
      const apartment = apartments?.find(a => 
        a.building_id === buildingId && 
        a.apartment_unit === aptUnit
      );
      if (apartment?.user?.is_active) count++;
    });
    return count;
  }, [selectedApartments, apartmentsWithUsers]);

  // Initialize data on mount
  useEffect(() => {
    loadData();
  }, [loadData]);

  return {
    // Data
    configs,
    buildings,
    users,
    meters,
    sharedMeters,
    customItems,
    chargers,
    loading,

    // Modal state
    showModal,
    showInstructions,
    setShowInstructions,
    editingConfig,
    step,
    setStep,
    TOTAL_STEPS,

    // Form state
    formData,
    updateFormData,
    selectedApartments,
    selectedSharedMeters,
    selectedCustomItems,
    apartmentsWithUsers,
    isVZEVMode,
    chargerOnly,

    // Actions
    handleBuildingToggle,
    handleApartmentToggle,
    handleSelectAllActive,
    handleRecipientChange,
    handleChargerChange,
    handleChargerOnlyToggle,
    handleSharedMeterToggle,
    handleSelectAllSharedMeters,
    handleDeselectAllSharedMeters,
    handleCustomItemToggle,
    handleSelectAllCustomItems,
    handleDeselectAllCustomItems,
    openCreateModal,
    openEditModal,
    closeModal,
    submitForm,
    deleteConfig,
    toggleActive,
    canProceed,
    getActiveUsersCount,
    loadData
  };
}