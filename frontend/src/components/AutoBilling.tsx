import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, HelpCircle, X, Calendar, Clock, Building, Users, PlayCircle, PauseCircle, ChevronLeft, ChevronRight, Check, Home, User as UserIcon } from 'lucide-react';
import { api } from '../api/client';
import { useTranslation } from '../i18n';
import type { Building as BuildingType, User, Meter, ApartmentWithUser } from '../types';

interface AutoBillingConfig {
  id: number;
  name: string;
  building_ids: number[];
  apartments?: ApartmentSelection[];
  frequency: 'monthly' | 'quarterly' | 'half_yearly' | 'yearly';
  generation_day: number;
  first_execution_date?: string;
  is_active: boolean;
  is_vzev?: boolean;
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

interface ApartmentSelection {
  building_id: number;
  apartment_unit: string;
  user_id?: number;
}

export default function AutoBilling() {
  const { t } = useTranslation();
  const [configs, setConfigs] = useState<AutoBillingConfig[]>([]);
  const [buildings, setBuildings] = useState<BuildingType[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [meters, setMeters] = useState<Meter[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [editingConfig, setEditingConfig] = useState<AutoBillingConfig | null>(null);
  const [step, setStep] = useState(1);
  const [apartmentsWithUsers, setApartmentsWithUsers] = useState<Map<number, ApartmentWithUser[]>>(new Map());
  const [selectedApartments, setSelectedApartments] = useState<Set<string>>(new Set());
  const [isVZEVMode, setIsVZEVMode] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    building_ids: [] as number[],
    apartments: [] as ApartmentSelection[],
    frequency: 'monthly' as 'monthly' | 'quarterly' | 'half_yearly' | 'yearly',
    generation_day: 1,
    first_execution_date: '',
    is_active: true,
    is_vzev: false,
    sender_name: '',
    sender_address: '',
    sender_city: '',
    sender_zip: '',
    sender_country: 'Switzerland',
    bank_name: '',
    bank_iban: '',
    bank_account_holder: ''
  });

  useEffect(() => {
    loadData();
    loadSavedInfo();
  }, []);

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
      
      // Show warning if mixing complexes and buildings
      if (hasComplex && hasRegularBuilding) {
        alert('Warning: Cannot mix building complexes (vZEV) with regular buildings (ZEV). Please select only complexes OR only regular buildings.');
      }
    } else {
      setIsVZEVMode(false);
      setFormData(prev => ({ ...prev, is_vzev: false }));
    }
  }, [formData.building_ids, buildings]);

  // Rebuild apartments list when buildings change
  useEffect(() => {
    if (formData.building_ids.length > 0 && users.length > 0 && meters.length > 0 && buildings.length > 0) {
      console.log('Rebuilding apartments list for auto billing...');
      console.log('Selected building IDs:', formData.building_ids);
      console.log('Total buildings available:', buildings.length);
      console.log('Total users available:', users.length);
      console.log('Total meters available:', meters.length);
      
      const newApartmentMap = buildApartmentsListSync();
      setApartmentsWithUsers(newApartmentMap);
      console.log('Apartments map updated:', newApartmentMap);
    }
  }, [formData.building_ids, users, meters, buildings]);

  const loadData = async () => {
    try {
      const [configsData, buildingsData, usersData, metersData] = await Promise.all([
        api.getAutoBillingConfigs(),
        api.getBuildings(),
        api.getUsers(undefined, true),
        api.getMeters()
      ]);
      
      console.log('=== AUTO BILLING DATA LOADED ===');
      console.log('Configs from API:', configsData);
      console.log('Buildings:', buildingsData);
      console.log('Users (before filter):', usersData.length);
      console.log('Meters:', metersData.length);
      
      setConfigs(configsData);
      setBuildings(buildingsData);
      
      // Filter out administration users - only show regular users
      const regularUsers = usersData.filter(u => u.user_type === 'regular');
      console.log('Regular users (after filter):', regularUsers.length);
      setUsers(regularUsers);
      setMeters(metersData);
    } catch (err) {
      console.error('Failed to load data:', err);
      alert('Failed to load auto billing data: ' + err);
    }
  };

  const loadSavedInfo = () => {
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
  };

  const buildApartmentsListSync = (): Map<number, ApartmentWithUser[]> => {
    const apartmentMap = new Map<number, ApartmentWithUser[]>();

    console.log('=== BUILDING APARTMENTS LIST ===');
    console.log('Processing building IDs:', formData.building_ids);

    formData.building_ids.forEach(buildingId => {
      const building = buildings.find(b => b.id === buildingId);
      if (!building) {
        console.log(`Building ${buildingId} not found in buildings list`);
        return;
      }

      console.log(`Processing building: ${building.name} (ID: ${buildingId}, is_group: ${building.is_group})`);

      let buildingsToProcess: number[] = [buildingId];

      // If this is a complex (vZEV), process all buildings in the group
      if (building.is_group && building.group_buildings) {
        buildingsToProcess = building.group_buildings;
        console.log(`vZEV Complex: Processing ${buildingsToProcess.length} buildings in group:`, buildingsToProcess);
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

        console.log(`  Building ${processBuildingId}: Found ${buildingMeters.length} apartment meters`);

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

            console.log(`    Apartment ${meter.apartment_unit}: User ${user ? user.first_name + ' ' + user.last_name : 'NOT FOUND'}`);

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

      console.log(`Total apartments for building ${buildingId}: ${apartments.length}`);
      apartmentMap.set(buildingId, apartments);
    });

    console.log('=== APARTMENTS LIST COMPLETE ===');
    return apartmentMap;
  };

  const handleBuildingToggle = (buildingId: number) => {
    const building = buildings.find(b => b.id === buildingId);
    if (!building) return;

    console.log('Toggling building:', building.name, buildingId);

    // Check if trying to mix complex and regular buildings
    const currentlySelectedBuildings = buildings.filter(b => formData.building_ids.includes(b.id));
    const hasComplex = currentlySelectedBuildings.some(b => b.is_group);
    const hasRegular = currentlySelectedBuildings.some(b => !b.is_group);

    // If adding a building
    if (!formData.building_ids.includes(buildingId)) {
      // Prevent mixing
      if ((building.is_group && hasRegular) || (!building.is_group && hasComplex)) {
        alert('Cannot mix building complexes (vZEV) with regular buildings (ZEV). Please deselect existing buildings first.');
        return;
      }
    }

    const newBuildings = formData.building_ids.includes(buildingId)
      ? formData.building_ids.filter(id => id !== buildingId)
      : [...formData.building_ids, buildingId];
    
    console.log('New building IDs:', newBuildings);
    
    // Clear apartment selections for removed buildings
    if (!newBuildings.includes(buildingId)) {
      const newSelectedApartments = new Set(selectedApartments);
      Array.from(selectedApartments).forEach(key => {
        if (key.startsWith(`${buildingId}|||`)) {
          newSelectedApartments.delete(key);
        }
      });
      setSelectedApartments(newSelectedApartments);
    }
    
    setFormData({ ...formData, building_ids: newBuildings });
  };

  const handleApartmentToggle = (buildingId: number, apartmentUnit: string) => {
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
      const [bId, aptUnit] = selectedKey.split('|||');
      const parsedBuildingId = parseInt(bId);
      const apartments = apartmentsWithUsers.get(parsedBuildingId);
      const apartment = apartments?.find(a => a.apartment_unit === aptUnit);
      
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
  };

  const handleSelectAllActiveApartments = () => {
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
      const [bId, aptUnit] = key.split('|||');
      const parsedBuildingId = parseInt(bId);
      const apartments = apartmentsWithUsers.get(parsedBuildingId);
      const apartment = apartments?.find(a => a.apartment_unit === aptUnit);
      
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
  };

  const handleSubmit = async () => {
    console.log('=== SUBMITTING AUTO BILLING CONFIG ===');
    console.log('Form data:', formData);
    
    if (formData.building_ids.length === 0) {
      alert(isVZEVMode ? 'Please select a building complex' : t('autoBilling.selectAtLeastOneBuilding'));
      return;
    }

    if (formData.apartments.length === 0) {
      alert(t('billConfig.validation.selectUser'));
      return;
    }

    if (!formData.name) {
      alert('Please enter a configuration name');
      return;
    }

    // Additional vZEV validation
    if (isVZEVMode) {
      const selectedBuildings = buildings.filter(b => formData.building_ids.includes(b.id));
      if (selectedBuildings.some(b => !b.is_group)) {
        alert('vZEV mode requires all selected buildings to be complexes');
        return;
      }
    }

    try {
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

      console.log('Sending to API:', formData);

      if (editingConfig) {
        await api.updateAutoBillingConfig(editingConfig.id, formData);
      } else {
        await api.createAutoBillingConfig(formData);
      }
      
      setShowModal(false);
      resetForm();
      await loadData();
      alert(editingConfig ? t('autoBilling.updateSuccess') : t('autoBilling.createSuccess'));
    } catch (err: any) {
      console.error('Submit error:', err);
      alert(t('autoBilling.saveFailed') + '\n' + (err.message || err));
    }
  };

  const handleEdit = (config: AutoBillingConfig) => {
    console.log('Editing config:', config);
    setEditingConfig(config);
    
    // Restore apartment selections if available
    const apartmentKeys = new Set<string>();
    if (config.apartments && config.apartments.length > 0) {
      config.apartments.forEach(apt => {
        apartmentKeys.add(`${apt.building_id}|||${apt.apartment_unit}`);
      });
    }
    
    setSelectedApartments(apartmentKeys);
    
    setFormData({
      name: config.name,
      building_ids: config.building_ids,
      apartments: config.apartments || [],
      frequency: config.frequency,
      generation_day: config.generation_day,
      first_execution_date: config.first_execution_date || '',
      is_active: config.is_active,
      is_vzev: config.is_vzev || false,
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
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t('autoBilling.deleteConfirm'))) return;
    
    try {
      await api.deleteAutoBillingConfig(id);
      await loadData();
      alert(t('autoBilling.deleteSuccess'));
    } catch (err) {
      alert(t('autoBilling.deleteFailed') + ' ' + err);
    }
  };

  const toggleActive = async (config: AutoBillingConfig) => {
    try {
      await api.updateAutoBillingConfig(config.id, {
        ...config,
        is_active: !config.is_active
      });
      await loadData();
    } catch (err) {
      alert(t('autoBilling.toggleFailed') + ' ' + err);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      building_ids: [],
      apartments: [],
      frequency: 'monthly',
      generation_day: 1,
      first_execution_date: '',
      is_active: true,
      is_vzev: false,
      sender_name: '',
      sender_address: '',
      sender_city: '',
      sender_zip: '',
      sender_country: 'Switzerland',
      bank_name: '',
      bank_iban: '',
      bank_account_holder: ''
    });
    setSelectedApartments(new Set());
    setEditingConfig(null);
    setStep(1);
    setIsVZEVMode(false);
  };

  const canProceed = () => {
    switch (step) {
      case 1:
        return formData.building_ids.length > 0 && formData.apartments.length > 0;
      case 2:
        return formData.name && formData.frequency && formData.generation_day >= 1 && formData.generation_day <= 28;
      case 3:
        return true; // Sender info is optional
      case 4:
        return true; // Banking info is optional
      case 5:
        return formData.sender_name && formData.bank_iban; // Required for final step
      default:
        return false;
    }
  };

  const getFrequencyLabel = (freq: string) => {
    return t(`autoBilling.frequency.${freq}`);
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('de-CH');
  };

  const getBuildingNames = (buildingIds: number[]) => {
    return buildingIds
      .map(id => buildings.find(b => b.id === id)?.name)
      .filter(Boolean)
      .join(', ');
  };

  const getApartmentCount = (apartments?: ApartmentSelection[]) => {
    if (!apartments || apartments.length === 0) return t('autoBilling.allUsers');
    return `${apartments.length} ${apartments.length === 1 ? t('billConfig.step1.apartment') : t('billConfig.step1.apartments')}`;
  };

  // Step renderers
  const renderStep1 = () => (
    <div>
      <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '24px' }}>
        {t('billConfig.step1.title')}
      </h3>

      {/* vZEV Mode Indicator */}
      {isVZEVMode && (
        <div style={{
          padding: '16px',
          backgroundColor: '#e0e7ff',
          borderRadius: '8px',
          marginBottom: '20px',
          border: '2px solid #4338ca'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span style={{ fontSize: '24px' }}>⚡</span>
            <h4 style={{ fontSize: '16px', fontWeight: '600', margin: 0, color: '#4338ca' }}>
              vZEV Mode (Virtual Energy Allocation)
            </h4>
          </div>
          <p style={{ fontSize: '14px', margin: 0, color: '#4338ca' }}>
            You are billing a building complex with virtual energy allocation.
            Surplus PV from buildings with solar will be virtually allocated to other buildings in the complex.
          </p>
        </div>
      )}

      {formData.building_ids.length > 0 && !isVZEVMode && (
        <div style={{
          padding: '16px',
          backgroundColor: '#dbeafe',
          borderRadius: '8px',
          marginBottom: '20px',
          border: '2px solid #3b82f6'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span style={{ fontSize: '24px' }}>🔌</span>
            <h4 style={{ fontSize: '16px', fontWeight: '600', margin: 0, color: '#1e40af' }}>
              ZEV Mode (Direct Energy Sharing)
            </h4>
          </div>
          <p style={{ fontSize: '14px', margin: 0, color: '#1e40af' }}>
            You are billing regular buildings with direct energy sharing.
          </p>
        </div>
      )}

      <div style={{ marginBottom: '30px' }}>
        <label style={{ display: 'block', fontWeight: '600', marginBottom: '12px', fontSize: '15px' }}>
          1. {isVZEVMode ? 'Select Complex (vZEV)' : 'Select Buildings (ZEV)'} ({formData.building_ids.length} {t('billConfig.step1.selected')})
        </label>
        <div style={{ 
          maxHeight: '200px', 
          overflowY: 'auto', 
          border: '1px solid #dee2e6', 
          borderRadius: '6px',
          backgroundColor: 'white'
        }}>
          {buildings.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', color: '#6c757d' }}>
              <Building size={48} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
              <p>No buildings available</p>
            </div>
          ) : (
            buildings.map(building => (
              <label
                key={building.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '12px 16px',
                  cursor: 'pointer',
                  borderBottom: '1px solid #f0f0f0',
                  transition: 'background-color 0.2s',
                  backgroundColor: building.is_group ? '#f0f9ff' : 'white'
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = building.is_group ? '#e0f2fe' : '#f8f9fa'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = building.is_group ? '#f0f9ff' : 'white'}
              >
                <input
                  type="checkbox"
                  checked={formData.building_ids.includes(building.id)}
                  onChange={() => handleBuildingToggle(building.id)}
                  style={{ marginRight: '12px', cursor: 'pointer', width: '18px', height: '18px' }}
                />
                <Home size={16} style={{ marginRight: '8px', color: building.is_group ? '#0284c7' : '#667EEA' }} />
                <span style={{ fontSize: '15px', fontWeight: '500' }}>{building.name}</span>
                {building.is_group && (
                  <span style={{
                    marginLeft: '8px',
                    padding: '2px 8px',
                    backgroundColor: '#4338ca',
                    color: 'white',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: '600'
                  }}>
                    vZEV COMPLEX
                  </span>
                )}
              </label>
            ))
          )}
        </div>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <label style={{ fontWeight: '600', fontSize: '15px' }}>
            2. {t('billConfig.step1.selectApartments')} ({selectedApartments.size} {t('billConfig.step1.selected')})
          </label>
          {formData.building_ids.length > 0 && (
            <button
              onClick={handleSelectAllActiveApartments}
              style={{
                padding: '6px 12px',
                backgroundColor: '#667EEA',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                fontSize: '13px',
                cursor: 'pointer',
                fontWeight: '500'
              }}
            >
              {t('billConfig.step1.selectAllActive')}
            </button>
          )}
        </div>
        
        <div style={{ 
          maxHeight: '350px', 
          overflowY: 'auto', 
          border: '1px solid #dee2e6', 
          borderRadius: '6px',
          backgroundColor: 'white'
        }}>
          {formData.building_ids.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', color: '#6c757d' }}>
              <Home size={48} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
              <p>{t('billConfig.step1.selectBuildingFirst')}</p>
            </div>
          ) : (
            formData.building_ids.map(buildingId => {
              const building = buildings.find(b => b.id === buildingId);
              const apartments = apartmentsWithUsers.get(buildingId) || [];

              if (apartments.length === 0) {
                return (
                  <div key={buildingId} style={{ padding: '20px', borderBottom: '2px solid #e9ecef' }}>
                    <div style={{ fontWeight: '600', marginBottom: '8px', color: '#667EEA' }}>
                      {building?.name}
                    </div>
                    <div style={{ color: '#6c757d', fontSize: '14px', fontStyle: 'italic' }}>
                      {t('billConfig.step1.noApartmentsFound')}
                    </div>
                  </div>
                );
              }

              return (
                <div key={buildingId} style={{ borderBottom: '2px solid #e9ecef' }}>
                  <div style={{ 
                    padding: '12px 16px', 
                    backgroundColor: '#f8f9fa',
                    fontWeight: '600',
                    color: '#667EEA',
                    fontSize: '14px',
                    borderBottom: '1px solid #dee2e6'
                  }}>
                    {building?.name} ({apartments.length} {apartments.length === 1 ? t('billConfig.step1.apartment') : t('billConfig.step1.apartments')})
                  </div>
                  {apartments.map(apartment => {
                    const key = `${buildingId}|||${apartment.apartment_unit}`;
                    const isSelected = selectedApartments.has(key);
                    const hasUser = !!apartment.user;
                    const isActive = apartment.user?.is_active ?? false;

                    return (
                      <label
                        key={key}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '12px 16px',
                          cursor: hasUser ? 'pointer' : 'not-allowed',
                          borderBottom: '1px solid #f0f0f0',
                          transition: 'background-color 0.2s',
                          opacity: hasUser ? (isActive ? 1 : 0.6) : 0.4,
                          backgroundColor: isSelected ? '#e7f3ff' : 'white'
                        }}
                        onMouseOver={(e) => hasUser && (e.currentTarget.style.backgroundColor = isSelected ? '#d0e7ff' : '#f8f9fa')}
                        onMouseOut={(e) => hasUser && (e.currentTarget.style.backgroundColor = isSelected ? '#e7f3ff' : 'white')}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => hasUser && handleApartmentToggle(buildingId, apartment.apartment_unit)}
                          disabled={!hasUser}
                          style={{ 
                            marginRight: '12px', 
                            cursor: hasUser ? 'pointer' : 'not-allowed',
                            width: '18px',
                            height: '18px'
                          }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <Home size={14} style={{ color: '#667EEA' }} />
                            <span style={{ fontSize: '15px', fontWeight: '600' }}>
                              {t('billConfig.step1.apartmentLabel')} {apartment.apartment_unit}
                            </span>
                          </div>
                          {hasUser ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#6c757d', paddingLeft: '22px' }}>
                              <UserIcon size={12} />
                              <span>
                                {apartment.user?.first_name} {apartment.user?.last_name}
                                {!isActive && (
                                  <span style={{ color: '#dc3545', marginLeft: '6px', fontWeight: '500' }}>
                                    ({t('billConfig.step1.archived')})
                                  </span>
                                )}
                              </span>
                            </div>
                          ) : (
                            <div style={{ fontSize: '13px', color: '#dc3545', paddingLeft: '22px', fontStyle: 'italic' }}>
                              {t('billConfig.step1.noUserAssigned')}
                            </div>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      </div>

      {selectedApartments.size > 0 && (
        <div style={{ 
          padding: '16px', 
          backgroundColor: '#e7f3ff', 
          borderRadius: '6px',
          fontSize: '14px',
          color: '#004a99'
        }}>
          <strong>{t('billConfig.step1.selectedSummary')}:</strong> {selectedApartments.size} {selectedApartments.size === 1 ? t('billConfig.step1.apartment') : t('billConfig.step1.apartments')} ({formData.apartments.filter(a => a.user_id).length} {t('billConfig.step1.users')})
        </div>
      )}
    </div>
  );

  const renderStep2 = () => (
    <div>
      <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '24px' }}>
        {t('autoBilling.configName')}
      </h3>

      <div style={{ padding: '20px', backgroundColor: '#f8f9fa', borderRadius: '8px', marginBottom: '24px' }}>
        <label style={{ display: 'block', fontWeight: '600', marginBottom: '12px', fontSize: '15px' }}>
          {t('autoBilling.configName')} *
        </label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          style={{
            width: '100%',
            padding: '12px',
            border: '1px solid #ced4da',
            borderRadius: '6px',
            fontSize: '15px'
          }}
          placeholder={t('autoBilling.configNamePlaceholder')}
        />
      </div>

      <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '16px' }}>
        Billing Schedule
      </h3>

      <div style={{ padding: '20px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
              {t('autoBilling.frequency')} *
            </label>
            <select
              value={formData.frequency}
              onChange={(e) => setFormData({ ...formData, frequency: e.target.value as any })}
              style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}
            >
              <option value="monthly">{t('autoBilling.frequency.monthly')}</option>
              <option value="quarterly">{t('autoBilling.frequency.quarterly')}</option>
              <option value="half_yearly">{t('autoBilling.frequency.half_yearly')}</option>
              <option value="yearly">{t('autoBilling.frequency.yearly')}</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
              {t('autoBilling.generationDay')} *
            </label>
            <input
              type="number"
              min="1"
              max="28"
              value={formData.generation_day}
              onChange={(e) => setFormData({ ...formData, generation_day: parseInt(e.target.value) })}
              style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}
            />
            <small style={{ fontSize: '12px', color: '#666' }}>{t('autoBilling.generationDayHelp')}</small>
          </div>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
            {t('autoBilling.firstExecutionDate')}
          </label>
          <input
            type="date"
            value={formData.first_execution_date}
            onChange={(e) => setFormData({ ...formData, first_execution_date: e.target.value })}
            style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}
          />
          <small style={{ fontSize: '12px', color: '#666' }}>{t('autoBilling.firstExecutionDateHelp')}</small>
        </div>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div>
      <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '24px' }}>
        {t('billConfig.step5.senderInfo')}
      </h3>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '14px', marginBottom: '6px', fontWeight: '500' }}>
            {t('billConfig.step5.name')}
          </label>
          <input
            type="text"
            value={formData.sender_name}
            onChange={(e) => setFormData({ ...formData, sender_name: e.target.value })}
            placeholder="Company or Organization Name"
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #ced4da',
              borderRadius: '6px',
              fontSize: '15px'
            }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '14px', marginBottom: '6px', fontWeight: '500' }}>
            {t('billConfig.step5.address')}
          </label>
          <input
            type="text"
            value={formData.sender_address}
            onChange={(e) => setFormData({ ...formData, sender_address: e.target.value })}
            placeholder="Street and Number"
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #ced4da',
              borderRadius: '6px',
              fontSize: '15px'
            }}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '14px', marginBottom: '6px', fontWeight: '500' }}>
              {t('billConfig.step5.zip')}
            </label>
            <input
              type="text"
              value={formData.sender_zip}
              onChange={(e) => setFormData({ ...formData, sender_zip: e.target.value })}
              placeholder="1234"
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ced4da',
                borderRadius: '6px',
                fontSize: '15px'
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '14px', marginBottom: '6px', fontWeight: '500' }}>
              {t('billConfig.step5.city')}
            </label>
            <input
              type="text"
              value={formData.sender_city}
              onChange={(e) => setFormData({ ...formData, sender_city: e.target.value })}
              placeholder="City Name"
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ced4da',
                borderRadius: '6px',
                fontSize: '15px'
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );

  const renderStep4 = () => (
    <div>
      <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '24px' }}>
        {t('billConfig.step5.bankingInfo')}
      </h3>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '14px', marginBottom: '6px', fontWeight: '500' }}>
            {t('billConfig.step5.bankName')}
          </label>
          <input
            type="text"
            value={formData.bank_name}
            onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
            placeholder="Bank Name"
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #ced4da',
              borderRadius: '6px',
              fontSize: '15px'
            }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '14px', marginBottom: '6px', fontWeight: '500' }}>
            {t('billConfig.step5.iban')}
          </label>
          <input
            type="text"
            value={formData.bank_iban}
            onChange={(e) => setFormData({ ...formData, bank_iban: e.target.value })}
            placeholder="CH93 0000 0000 0000 0000 0"
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #ced4da',
              borderRadius: '6px',
              fontSize: '15px'
            }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '14px', marginBottom: '6px', fontWeight: '500' }}>
            {t('billConfig.step5.accountHolder')}
          </label>
          <input
            type="text"
            value={formData.bank_account_holder}
            onChange={(e) => setFormData({ ...formData, bank_account_holder: e.target.value })}
            placeholder="Account Holder Name"
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #ced4da',
              borderRadius: '6px',
              fontSize: '15px'
            }}
          />
        </div>
      </div>
    </div>
  );

  const renderStep5 = () => (
    <div>
      <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '24px' }}>
        Review Configuration
      </h3>

      <div style={{ 
        marginBottom: '24px', 
        padding: '20px', 
        backgroundColor: '#f8f9fa', 
        borderRadius: '8px'
      }}>
        <h4 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px', color: '#667EEA' }}>
          Configuration Summary
        </h4>
        <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px', lineHeight: '1.8' }}>
          <li><strong>Name:</strong> {formData.name}</li>
          <li><strong>Mode:</strong> {isVZEVMode ? 'vZEV (Virtual Allocation)' : 'ZEV (Direct Sharing)'}</li>
          <li><strong>{t('billConfig.step5.buildings')}:</strong> {formData.building_ids.length}</li>
          <li><strong>{t('billConfig.step5.apartments')}:</strong> {selectedApartments.size}</li>
          <li><strong>{t('billConfig.step5.users')}:</strong> {formData.apartments.filter(a => a.user_id).length}</li>
          <li><strong>{t('autoBilling.frequency')}:</strong> {getFrequencyLabel(formData.frequency)}</li>
          <li><strong>{t('autoBilling.generationDay')}:</strong> Day {formData.generation_day}</li>
          {formData.first_execution_date && (
            <li><strong>{t('autoBilling.firstExecutionDate')}:</strong> {formData.first_execution_date}</li>
          )}
        </ul>
      </div>

      {formData.sender_name && (
        <div style={{ 
          marginBottom: '16px', 
          padding: '16px', 
          backgroundColor: '#e7f3ff', 
          borderRadius: '8px'
        }}>
          <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>
            {t('billConfig.step5.senderInfo')}
          </h4>
          <p style={{ margin: 0, fontSize: '13px', lineHeight: '1.6' }}>
            {formData.sender_name}<br />
            {formData.sender_address && `${formData.sender_address}, `}
            {formData.sender_zip} {formData.sender_city}
          </p>
        </div>
      )}

      {formData.bank_iban && (
        <div style={{ 
          padding: '16px', 
          backgroundColor: '#e8f5e9', 
          borderRadius: '8px'
        }}>
          <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>
            {t('billConfig.step5.bankingInfo')}
          </h4>
          <p style={{ margin: 0, fontSize: '13px', lineHeight: '1.6' }}>
            {formData.bank_name && `${formData.bank_name} - `}
            {formData.bank_iban}
          </p>
        </div>
      )}
    </div>
  );

  const InstructionsModal = () => (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', zIndex: 2000, padding: '20px'
    }}>
      <div style={{
        backgroundColor: 'white', borderRadius: '12px', padding: '30px',
        maxWidth: '700px', maxHeight: '90vh', overflow: 'auto', width: '100%'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold' }}>{t('autoBilling.instructions.title')}</h2>
          <button onClick={() => setShowInstructions(false)}
            style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        <div style={{ lineHeight: '1.8', color: '#374151' }}>
          <div style={{ backgroundColor: 'rgba(219, 234, 254, 0.5)', padding: '16px', borderRadius: '8px', marginBottom: '16px', border: '2px solid rgba(59, 130, 246, 0.3)' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '10px', color: '#1f2937', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Calendar size={20} color="#3b82f6" />
              {t('autoBilling.instructions.whatIsAutoBilling')}
            </h3>
            <p>{t('autoBilling.instructions.autoBillingDescription')}</p>
          </div>

          <h3 style={{ fontSize: '18px', fontWeight: '600', marginTop: '20px', marginBottom: '10px', color: '#1f2937' }}>
            {t('autoBilling.instructions.howItWorks')}
          </h3>
          <ul style={{ marginLeft: '20px' }}>
            <li>{t('autoBilling.instructions.work1')}</li>
            <li>{t('autoBilling.instructions.work2')}</li>
            <li>{t('autoBilling.instructions.work3')}</li>
            <li>{t('autoBilling.instructions.work4')}</li>
          </ul>

          <h3 style={{ fontSize: '18px', fontWeight: '600', marginTop: '20px', marginBottom: '10px', color: '#1f2937' }}>
            {t('autoBilling.instructions.frequencies')}
          </h3>
          <ul style={{ marginLeft: '20px' }}>
            <li><strong>{t('autoBilling.frequency.monthly')}:</strong> {t('autoBilling.instructions.freq1')}</li>
            <li><strong>{t('autoBilling.frequency.quarterly')}:</strong> {t('autoBilling.instructions.freq2')}</li>
            <li><strong>{t('autoBilling.frequency.half_yearly')}:</strong> {t('autoBilling.instructions.freq3')}</li>
            <li><strong>{t('autoBilling.frequency.yearly')}:</strong> {t('autoBilling.instructions.freq4')}</li>
          </ul>

          <h3 style={{ fontSize: '18px', fontWeight: '600', marginTop: '20px', marginBottom: '10px', color: '#1f2937' }}>
            {t('autoBilling.instructions.howToUse')}
          </h3>
          <ul style={{ marginLeft: '20px' }}>
            <li>{t('autoBilling.instructions.step1')}</li>
            <li>{t('autoBilling.instructions.step2')}</li>
            <li>{t('autoBilling.instructions.step3')}</li>
            <li>{t('autoBilling.instructions.step4')}</li>
            <li>{t('autoBilling.instructions.step5')}</li>
          </ul>

          <div style={{ backgroundColor: 'rgba(254, 243, 199, 0.5)', padding: '16px', borderRadius: '8px', marginTop: '16px', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px', color: '#1f2937' }}>
              {t('autoBilling.instructions.important')}
            </h3>
            <ul style={{ marginLeft: '20px', fontSize: '14px' }}>
              <li>{t('autoBilling.instructions.important1')}</li>
              <li>{t('autoBilling.instructions.important2')}</li>
              <li>{t('autoBilling.instructions.important3')}</li>
              <li>{t('autoBilling.instructions.important4')}</li>
            </ul>
          </div>

          <div style={{ backgroundColor: 'rgba(240, 253, 244, 0.5)', padding: '16px', borderRadius: '8px', marginTop: '16px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px', color: '#1f2937' }}>
              {t('autoBilling.instructions.tips')}
            </h3>
            <ul style={{ marginLeft: '20px', fontSize: '14px' }}>
              <li>{t('autoBilling.instructions.tip1')}</li>
              <li>{t('autoBilling.instructions.tip2')}</li>
              <li>{t('autoBilling.instructions.tip3')}</li>
              <li>{t('autoBilling.instructions.tip4')}</li>
            </ul>
          </div>
        </div>

        <button onClick={() => setShowInstructions(false)} style={{
          width: '100%', marginTop: '24px', padding: '12px',
          backgroundColor: '#007bff', color: 'white', border: 'none',
          borderRadius: '6px', fontSize: '14px', fontWeight: '500', cursor: 'pointer'
        }}>
          {t('common.close')}
        </button>
      </div>
    </div>
  );

  return (
    <div className="auto-billing-container" style={{ width: '100%', maxWidth: '100%' }}>
      <div className="auto-billing-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', gap: '15px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{
            fontSize: '36px',
            fontWeight: '800',
            marginBottom: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
          }}>
            <Calendar size={36} style={{ color: '#667eea' }} />
            {t('autoBilling.title')}
          </h1>
          <p style={{ color: '#6b7280', fontSize: '16px' }}>
            {t('autoBilling.subtitle')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            onClick={() => setShowInstructions(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
              backgroundColor: 'rgba(23, 162, 184, 0.9)', color: 'white', border: 'none', borderRadius: '6px',
              fontSize: '14px', cursor: 'pointer', transition: 'all 0.2s'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(23, 162, 184, 1)'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'rgba(23, 162, 184, 0.9)'}
          >
            <HelpCircle size={18} />
            {t('autoBilling.setupInstructions')}
          </button>
          <button
            onClick={() => { resetForm(); setShowModal(true); }}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
              backgroundColor: 'rgba(40, 167, 69, 0.9)', color: 'white', border: 'none', borderRadius: '6px',
              fontSize: '14px', cursor: 'pointer', transition: 'all 0.2s'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(40, 167, 69, 1)'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'rgba(40, 167, 69, 0.9)'}
          >
            <Plus size={18} />
            {t('autoBilling.addConfig')}
          </button>
        </div>
      </div>

      {configs.length === 0 ? (
        <div style={{
          backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          padding: '60px 20px', textAlign: 'center', color: '#999'
        }}>
          {t('autoBilling.noConfigs')}
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))',
          gap: '20px'
        }}>
          {configs.map(config => (
            <div key={config.id} style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              padding: '24px',
              border: config.is_active ? '2px solid rgba(40, 167, 69, 0.3)' : '2px solid rgba(221, 221, 221, 0.5)',
              transition: 'all 0.3s'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px', color: '#1f2937' }}>
                    {config.name}
                  </h3>
                  {config.is_vzev && (
                    <span style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      backgroundColor: '#4338ca',
                      color: 'white',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: '600',
                      marginBottom: '8px'
                    }}>
                      vZEV MODE
                    </span>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <Clock size={16} color="#6b7280" />
                    <span style={{ fontSize: '14px', color: '#6b7280' }}>
                      {getFrequencyLabel(config.frequency)} - {t('autoBilling.day')} {config.generation_day}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => toggleActive(config)}
                  style={{
                    padding: '8px',
                    backgroundColor: config.is_active ? 'rgba(34, 197, 94, 0.1)' : 'rgba(156, 163, 175, 0.1)',
                    color: config.is_active ? '#22c55e' : '#9ca3af',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    transition: 'all 0.2s'
                  }}
                  title={config.is_active ? t('autoBilling.pause') : t('autoBilling.activate')}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = config.is_active ? 'rgba(34, 197, 94, 0.2)' : 'rgba(156, 163, 175, 0.2)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = config.is_active ? 'rgba(34, 197, 94, 0.1)' : 'rgba(156, 163, 175, 0.1)';
                  }}
                >
                  {config.is_active ? <PauseCircle size={16} /> : <PlayCircle size={16} />}
                </button>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '10px', padding: '10px', backgroundColor: 'rgba(249, 250, 251, 0.8)', borderRadius: '6px' }}>
                  <Building size={16} color="#6b7280" style={{ marginTop: '2px', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '4px' }}>
                      {config.building_ids.length} {config.building_ids.length === 1 ? t('autoBilling.building') : t('autoBilling.buildings')}:
                    </div>
                    <div style={{ fontSize: '13px', color: '#374151' }}>
                      {getBuildingNames(config.building_ids) || t('autoBilling.noBuildings')}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '10px', backgroundColor: 'rgba(249, 250, 251, 0.8)', borderRadius: '6px' }}>
                  <Users size={16} color="#6b7280" style={{ marginTop: '2px', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '4px' }}>
                      {t('autoBilling.users')}:
                    </div>
                    <div style={{ fontSize: '13px', color: '#374151' }}>
                      {getApartmentCount(config.apartments)}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{
                padding: '12px',
                backgroundColor: 'rgba(243, 244, 246, 0.6)',
                borderRadius: '8px',
                marginBottom: '12px'
              }}>
                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '6px' }}>
                  {t('autoBilling.lastRun')}: <strong style={{ color: '#374151' }}>{formatDate(config.last_run)}</strong>
                </div>
                <div style={{ fontSize: '12px', color: '#6b7280' }}>
                  {t('autoBilling.nextRun')}: <strong style={{ color: 'rgba(40, 167, 69, 0.9)', fontWeight: '600' }}>{formatDate(config.next_run)}</strong>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid rgba(243, 244, 246, 0.8)', paddingTop: '12px' }}>
                <button
                  onClick={() => handleEdit(config)}
                  style={{
                    flex: 1,
                    padding: '8px',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    color: '#3b82f6',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.2)'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.1)'}
                >
                  <Edit2 size={14} />
                  {t('common.edit')}
                </button>
                <button
                  onClick={() => handleDelete(config.id)}
                  style={{
                    flex: 1,
                    padding: '8px',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    color: '#ef4444',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.2)'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)'}
                >
                  <Trash2 size={14} />
                  {t('common.delete')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showInstructions && <InstructionsModal />}

      {showModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', zIndex: 1000, padding: '20px'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            maxWidth: '900px',
            width: '100%',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 10px 40px rgba(0,0,0,0.2)'
          }}>
            <div style={{ 
              padding: '24px 30px', 
              borderBottom: '1px solid #dee2e6',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h2 style={{ 
                fontSize: '24px', 
                fontWeight: 'bold', 
                margin: 0,
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text'
              }}>
                {editingConfig ? t('autoBilling.editConfig') : t('autoBilling.addConfig')}
              </h2>
              <button
                onClick={() => { setShowModal(false); resetForm(); }}
                style={{
                  padding: '8px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <X size={24} />
              </button>
            </div>

            <div style={{ 
              padding: '20px 30px', 
              borderBottom: '1px solid #dee2e6',
              backgroundColor: '#f8f9fa'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative' }}>
                {[1, 2, 3, 4, 5].map(s => (
                  <div key={s} style={{ 
                    flex: 1, 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center',
                    position: 'relative'
                  }}>
                    {s < 5 && (
                      <div style={{
                        position: 'absolute',
                        top: '20px',
                        left: '50%',
                        right: '-50%',
                        height: '2px',
                        backgroundColor: step > s ? '#28a745' : '#dee2e6',
                        zIndex: 0
                      }} />
                    )}
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      backgroundColor: step >= s ? (step > s ? '#28a745' : '#667EEA') : '#dee2e6',
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 'bold',
                      position: 'relative',
                      zIndex: 1
                    }}>
                      {step > s ? <Check size={20} /> : s}
                    </div>
                    <div style={{ 
                      marginTop: '8px', 
                      fontSize: '11px', 
                      textAlign: 'center',
                      fontWeight: step === s ? '600' : 'normal',
                      color: step === s ? '#667EEA' : '#6c757d',
                      lineHeight: '1.3'
                    }}>
                      {s === 1 && 'Selection'}
                      {s === 2 && 'Schedule'}
                      {s === 3 && 'Sender'}
                      {s === 4 && 'Banking'}
                      {s === 5 && 'Review'}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ 
              padding: '30px', 
              flex: 1, 
              overflowY: 'auto' 
            }}>
              {step === 1 && renderStep1()}
              {step === 2 && renderStep2()}
              {step === 3 && renderStep3()}
              {step === 4 && renderStep4()}
              {step === 5 && renderStep5()}
            </div>

            <div style={{ 
              padding: '20px 30px', 
              borderTop: '1px solid #dee2e6',
              display: 'flex',
              justifyContent: 'space-between',
              gap: '12px',
              backgroundColor: '#f8f9fa'
            }}>
              <button
                onClick={() => { setShowModal(false); resetForm(); }}
                style={{
                  padding: '12px 24px',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '15px',
                  fontWeight: '500'
                }}
              >
                {t('common.cancel')}
              </button>
              
              <div style={{ display: 'flex', gap: '12px' }}>
                {step > 1 && (
                  <button
                    onClick={() => setStep(step - 1)}
                    style={{
                      padding: '12px 24px',
                      backgroundColor: 'white',
                      color: '#667EEA',
                      border: '1px solid #667EEA',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '15px',
                      fontWeight: '500',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <ChevronLeft size={18} />
                    {t('billConfig.navigation.previous')}
                  </button>
                )}
                
                {step < 5 ? (
                  <button
                    onClick={() => setStep(step + 1)}
                    disabled={!canProceed()}
                    style={{
                      padding: '12px 24px',
                      backgroundColor: canProceed() ? '#667EEA' : '#ced4da',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: canProceed() ? 'pointer' : 'not-allowed',
                      fontSize: '15px',
                      fontWeight: '500',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    {t('billConfig.navigation.next')}
                    <ChevronRight size={18} />
                  </button>
                ) : (
                  <button
                    onClick={handleSubmit}
                    disabled={!canProceed()}
                    style={{
                      padding: '12px 24px',
                      backgroundColor: canProceed() ? '#28a745' : '#ced4da',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: canProceed() ? 'pointer' : 'not-allowed',
                      fontSize: '15px',
                      fontWeight: '500',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <Check size={18} />
                    {editingConfig ? t('common.update') : t('common.create')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .auto-billing-container h1 {
            font-size: 24px !important;
          }

          .auto-billing-container h1 svg {
            width: 24px !important;
            height: 24px !important;
          }

          .auto-billing-header {
            flex-direction: column !important;
            align-items: stretch !important;
          }

          .auto-billing-header > div:last-child {
            width: 100%;
          }

          .auto-billing-header button {
            width: 100% !important;
            justify-content: center !important;
          }
        }
      `}</style>
    </div>
  );
}