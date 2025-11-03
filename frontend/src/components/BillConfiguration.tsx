import { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Check, FileText, Zap, DollarSign, Home, User as UserIcon } from 'lucide-react';
import { api } from '../api/client';
import type { Building, User, Meter, SharedMeterConfig, CustomLineItem, GenerateBillsRequest, ApartmentWithUser } from '../types';
import { useTranslation } from '../i18n';

interface BillConfigurationProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: () => void;
}

export default function BillConfiguration({ isOpen, onClose, onGenerate }: BillConfigurationProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState(1);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [meters, setMeters] = useState<Meter[]>([]);
  const [sharedMeters, setSharedMeters] = useState<SharedMeterConfig[]>([]);
  const [customItems, setCustomItems] = useState<CustomLineItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [apartmentsWithUsers, setApartmentsWithUsers] = useState<Map<number, ApartmentWithUser[]>>(new Map());

  const [config, setConfig] = useState<GenerateBillsRequest>({
    building_ids: [],
    user_ids: [],
    apartments: [],
    start_date: '',
    end_date: '',
    include_shared_meters: false,
    shared_meter_configs: [],
    custom_line_items: [],
    sender_name: '',
    sender_address: '',
    sender_city: '',
    sender_zip: '',
    sender_country: 'Switzerland',
    bank_name: '',
    bank_iban: '',
    bank_account_holder: ''
  });

  const [selectedApartments, setSelectedApartments] = useState<Set<string>>(new Set());
  const [selectedSharedMeters, setSelectedSharedMeters] = useState<number[]>([]);
  const [selectedCustomItems, setSelectedCustomItems] = useState<number[]>([]);

  useEffect(() => {
    if (isOpen) {
      loadData();
      loadSavedInfo();
    }
  }, [isOpen]);

  // Rebuild apartments list whenever buildings, users, or meters change AND building_ids is set
  useEffect(() => {
    if (config.building_ids.length > 0 && users.length > 0 && meters.length > 0) {
      console.log('Rebuilding apartments list...');
      const newApartmentMap = buildApartmentsListSync();
      setApartmentsWithUsers(newApartmentMap);
      console.log('Apartments map updated:', newApartmentMap);
    }
  }, [config.building_ids, users, meters]);

  const loadData = async () => {
    try {
      const [buildingsData, usersData, metersData, sharedMetersData, customItemsData] = await Promise.all([
        api.getBuildings(),
        api.getUsers(undefined, true),
        api.getMeters(),
        api.getSharedMeterConfigs(),
        api.getCustomLineItems()
      ]);
      setBuildings(buildingsData);
      
      // Filter out administration users - only show regular users
      const regularUsers = usersData.filter(u => u.user_type === 'regular');
      setUsers(regularUsers);
      setMeters(metersData);
      setSharedMeters(sharedMetersData);
      setCustomItems(customItemsData.filter(item => item.is_active));
    } catch (err) {
      console.error('Failed to load data:', err);
    }
  };

  const loadSavedInfo = () => {
    try {
      const savedSender = sessionStorage.getItem('zev_sender_info');
      const savedBanking = sessionStorage.getItem('zev_banking_info');

      if (savedSender) {
        const parsed = JSON.parse(savedSender);
        setConfig(prev => ({
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
        setConfig(prev => ({
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

  // This returns the map instead of setting state, so it's synchronous
  const buildApartmentsListSync = (): Map<number, ApartmentWithUser[]> => {
    const apartmentMap = new Map<number, ApartmentWithUser[]>();

    config.building_ids.forEach(buildingId => {
      const building = buildings.find(b => b.id === buildingId);
      if (!building) return;

      const apartments: ApartmentWithUser[] = [];
      const apartmentSet = new Set<string>();

      // Get apartment meters for this building
      const buildingMeters = meters.filter(
        m => m.building_id === buildingId && 
        m.apartment_unit && 
        m.meter_type === 'apartment_meter' &&
        m.is_active
      );

      console.log(`Building ${buildingId} (${building.name}): Found ${buildingMeters.length} apartment meters`);

      buildingMeters.forEach(meter => {
        if (meter.apartment_unit && !apartmentSet.has(meter.apartment_unit)) {
          apartmentSet.add(meter.apartment_unit);
          
          // Find user - prioritize meter.user_id since it's the direct relationship
          let user: User | undefined;
          
          // Method 1: Direct user_id from meter (most reliable)
          if (meter.user_id) {
            user = users.find(u => u.id === meter.user_id);
          }
          
          // Method 2: Match by building_id AND apartment_unit
          if (!user) {
            user = users.find(
              u => u.building_id === buildingId && 
              u.apartment_unit === meter.apartment_unit
            );
          }
          
          // Method 3: Match by apartment_unit only (less reliable)
          if (!user) {
            user = users.find(u => u.apartment_unit === meter.apartment_unit);
          }

          console.log(`  Apartment "${meter.apartment_unit}": ${user ? `Found user ${user.first_name} ${user.last_name}` : 'NO USER'}`);

          apartments.push({
            building_id: buildingId,
            apartment_unit: meter.apartment_unit,
            user: user,
            meter: meter,
            has_meter: true
          });
        }
      });

      // Sort apartments naturally
      apartments.sort((a, b) => {
        const aNum = parseInt(a.apartment_unit.replace(/[^0-9]/g, '')) || 0;
        const bNum = parseInt(b.apartment_unit.replace(/[^0-9]/g, '')) || 0;
        return aNum - bNum;
      });

      apartmentMap.set(buildingId, apartments);
    });

    return apartmentMap;
  };

  const filteredSharedMeters = sharedMeters.filter(meter =>
    config.building_ids.includes(meter.building_id)
  );

  const filteredCustomItems = customItems.filter(item =>
    config.building_ids.includes(item.building_id)
  );

  const handleBuildingToggle = (buildingId: number) => {
    const newBuildings = config.building_ids.includes(buildingId)
      ? config.building_ids.filter(id => id !== buildingId)
      : [...config.building_ids, buildingId];
    
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
    
    setConfig({ ...config, building_ids: newBuildings });
  };

  const handleApartmentToggle = (buildingId: number, apartmentUnit: string) => {
    const key = `${buildingId}|||${apartmentUnit}`; // Use ||| as separator since apartment names can contain dashes
    const newSelected = new Set(selectedApartments);
    
    if (newSelected.has(key)) {
      newSelected.delete(key);
    } else {
      newSelected.add(key);
    }
    
    setSelectedApartments(newSelected);

    console.log('Current apartmentsWithUsers map:', apartmentsWithUsers);
    console.log('Looking for building', buildingId, 'in map...');

    const userIds: number[] = [];
    const apartmentSelections: { building_id: number; apartment_unit: string; user_id?: number }[] = [];
    
    newSelected.forEach(selectedKey => {
      const [bId, aptUnit] = selectedKey.split('|||'); // Split by ||| separator
      const parsedBuildingId = parseInt(bId);
      const apartments = apartmentsWithUsers.get(parsedBuildingId);
      
      console.log(`Processing key: ${selectedKey}`);
      console.log(`  Building ID: ${parsedBuildingId}`);
      console.log(`  Apartment unit: "${aptUnit}"`);
      console.log(`  Apartments for this building:`, apartments);
      
      const apartment = apartments?.find(a => a.apartment_unit === aptUnit);
      
      console.log(`  Found apartment:`, apartment);
      
      // Add user if exists and is active (already filtered for regular users in loadData)
      if (apartment?.user?.is_active) {
        console.log(`  ✓ Adding user ${apartment.user.id}: ${apartment.user.first_name} ${apartment.user.last_name}`);
        userIds.push(apartment.user.id);
        
        apartmentSelections.push({
          building_id: parsedBuildingId,
          apartment_unit: aptUnit,
          user_id: apartment.user.id
        });
      } else if (apartment) {
        console.log(`  ✗ Apartment found but no active user`);
        apartmentSelections.push({
          building_id: parsedBuildingId,
          apartment_unit: aptUnit,
          user_id: undefined
        });
      } else {
        console.log(`  ✗ Apartment not found in map!`);
      }
    });

    console.log('Final user IDs:', userIds);

    setConfig(prev => ({ 
      ...prev, 
      user_ids: userIds,
      apartments: apartmentSelections
    }));
  };

  const handleSharedMeterToggle = (meterId: number) => {
    if (selectedSharedMeters.includes(meterId)) {
      setSelectedSharedMeters(selectedSharedMeters.filter(id => id !== meterId));
    } else {
      setSelectedSharedMeters([...selectedSharedMeters, meterId]);
    }
  };

  const handleCustomItemToggle = (itemId: number) => {
    if (selectedCustomItems.includes(itemId)) {
      setSelectedCustomItems(selectedCustomItems.filter(id => id !== itemId));
    } else {
      setSelectedCustomItems([...selectedCustomItems, itemId]);
    }
  };

  const handleSelectAllActiveApartments = () => {
    const newSelected = new Set(selectedApartments);
    
    config.building_ids.forEach(buildingId => {
      const apartments = apartmentsWithUsers.get(buildingId) || [];
      apartments.forEach(apt => {
        // Only auto-select apartments with active users
        if (apt.user?.is_active) {
          newSelected.add(`${buildingId}|||${apt.apartment_unit}`);
        }
      });
    });

    setSelectedApartments(newSelected);

    // Update config with only active users
    const userIds: number[] = [];
    const apartmentSelections: { building_id: number; apartment_unit: string; user_id?: number }[] = [];
    
    newSelected.forEach(key => {
      const [bId, aptUnit] = key.split('|||');
      const parsedBuildingId = parseInt(bId);
      const apartments = apartmentsWithUsers.get(parsedBuildingId);
      const apartment = apartments?.find(a => a.apartment_unit === aptUnit);
      
      // Only add apartments with active users
      if (apartment?.user?.is_active) {
        userIds.push(apartment.user.id);
        
        apartmentSelections.push({
          building_id: parsedBuildingId,
          apartment_unit: aptUnit,
          user_id: apartment.user.id
        });
      }
    });

    setConfig(prev => ({ 
      ...prev, 
      user_ids: userIds,
      apartments: apartmentSelections
    }));
  };

  const handleGenerate = async () => {
    if (!config.start_date || !config.end_date) {
      alert(t('billConfig.validation.selectDates'));
      return;
    }

    if (config.building_ids.length === 0) {
      alert(t('billConfig.validation.selectBuilding'));
      return;
    }

    if (config.user_ids.length === 0) {
      alert(t('billConfig.validation.selectUser'));
      return;
    }

    setLoading(true);
    try {
      sessionStorage.setItem('zev_sender_info', JSON.stringify({
        name: config.sender_name,
        address: config.sender_address,
        city: config.sender_city,
        zip: config.sender_zip,
        country: config.sender_country
      }));

      sessionStorage.setItem('zev_banking_info', JSON.stringify({
        name: config.bank_name,
        iban: config.bank_iban,
        holder: config.bank_account_holder
      }));

      const sharedMeterConfigs = selectedSharedMeters.map(id => {
        const meter = sharedMeters.find(m => m.id === id);
        return meter!;
      });

      const customLineItems = selectedCustomItems.map(id => {
        const item = customItems.find(i => i.id === id);
        return {
          item_id: item!.id,
          description: item!.description,
          amount: item!.amount,
          category: item!.category,
          is_one_time: false
        };
      });

      const finalConfig = {
        ...config,
        include_shared_meters: selectedSharedMeters.length > 0,
        shared_meter_configs: sharedMeterConfigs,
        custom_line_items: customLineItems
      };

      console.log('Generating bills with config:', finalConfig);

      const result = await api.generateBills(finalConfig);
      alert(t('billConfig.successMessage') + ` ${result.length} ${result.length === 1 ? t('billing.invoice') : t('billing.invoicesPlural')}!`);
      onGenerate();
      onClose();
      resetForm();
    } catch (err: any) {
      console.error('Failed to generate bills:', err);
      alert(t('billConfig.errorMessage') + ': ' + (err.message || err));
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setStep(1);
    setConfig({
      building_ids: [],
      user_ids: [],
      apartments: [],
      start_date: '',
      end_date: '',
      include_shared_meters: false,
      shared_meter_configs: [],
      custom_line_items: [],
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
    setSelectedSharedMeters([]);
    setSelectedCustomItems([]);
  };

  const canProceed = () => {
    switch (step) {
      case 1:
        return config.building_ids.length > 0 && config.user_ids.length > 0;
      case 2:
        return config.start_date && config.end_date;
      case 3:
        return true;
      case 4:
        return true;
      case 5:
        return config.sender_name && config.bank_iban;
      default:
        return false;
    }
  };

  const renderStep1 = () => (
    <div>
      <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '24px' }}>
        {t('billConfig.step1.title')}
      </h3>

      <div style={{ marginBottom: '30px' }}>
        <label style={{ display: 'block', fontWeight: '600', marginBottom: '12px', fontSize: '15px' }}>
          1. {t('billConfig.step1.selectBuildings')} ({config.building_ids.length} {t('billConfig.step1.selected')})
        </label>
        <div style={{ 
          maxHeight: '200px', 
          overflowY: 'auto', 
          border: '1px solid #dee2e6', 
          borderRadius: '6px',
          backgroundColor: 'white'
        }}>
          {buildings.map(building => (
            <label
              key={building.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '12px 16px',
                cursor: 'pointer',
                borderBottom: '1px solid #f0f0f0',
                transition: 'background-color 0.2s'
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f8f9fa'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'white'}
            >
              <input
                type="checkbox"
                checked={config.building_ids.includes(building.id)}
                onChange={() => handleBuildingToggle(building.id)}
                style={{ marginRight: '12px', cursor: 'pointer', width: '18px', height: '18px' }}
              />
              <Home size={16} style={{ marginRight: '8px', color: '#667EEA' }} />
              <span style={{ fontSize: '15px', fontWeight: '500' }}>{building.name}</span>
            </label>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <label style={{ fontWeight: '600', fontSize: '15px' }}>
            2. {t('billConfig.step1.selectApartments')} ({selectedApartments.size} {t('billConfig.step1.selected')})
          </label>
          {config.building_ids.length > 0 && (
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
          {config.building_ids.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', color: '#6c757d' }}>
              <Home size={48} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
              <p>{t('billConfig.step1.selectBuildingFirst')}</p>
            </div>
          ) : (
            config.building_ids.map(buildingId => {
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
          <strong>{t('billConfig.step1.selectedSummary')}:</strong> {selectedApartments.size} {selectedApartments.size === 1 ? t('billConfig.step1.apartment') : t('billConfig.step1.apartments')} ({config.user_ids.length} {config.user_ids.length === 1 ? t('billConfig.step1.user') : t('billConfig.step1.users')})
        </div>
      )}
    </div>
  );

  const renderStep2 = () => (
    <div>
      <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '24px' }}>
        {t('billConfig.step2.titleNew')}
      </h3>

      <div style={{ padding: '20px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
        <label style={{ display: 'block', fontWeight: '600', marginBottom: '12px', fontSize: '15px' }}>
          {t('billConfig.step2.selectPeriod')}
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '14px', marginBottom: '6px', color: '#6c757d', fontWeight: '500' }}>
              {t('billConfig.step2.startDate')}
            </label>
            <input
              type="date"
              value={config.start_date}
              onChange={(e) => setConfig({ ...config, start_date: e.target.value })}
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #ced4da',
                borderRadius: '6px',
                fontSize: '15px'
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '14px', marginBottom: '6px', color: '#6c757d', fontWeight: '500' }}>
              {t('billConfig.step2.endDate')}
            </label>
            <input
              type="date"
              value={config.end_date}
              onChange={(e) => setConfig({ ...config, end_date: e.target.value })}
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #ced4da',
                borderRadius: '6px',
                fontSize: '15px'
              }}
            />
          </div>
        </div>

        {config.start_date && config.end_date && (
          <div style={{ marginTop: '16px', padding: '12px', backgroundColor: 'white', borderRadius: '6px', fontSize: '14px' }}>
            <strong>{t('billConfig.step2.periodSummary')}:</strong>{' '}
            {new Date(config.start_date).toLocaleDateString()} - {new Date(config.end_date).toLocaleDateString()}
            {' '}
            ({Math.ceil((new Date(config.end_date).getTime() - new Date(config.start_date).getTime()) / (1000 * 60 * 60 * 24))} {t('billConfig.step2.days')})
          </div>
        )}
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div>
      <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '16px' }}>
        {t('billConfig.step3.title')}
      </h3>
      <p style={{ color: '#6c757d', marginBottom: '24px', fontSize: '14px' }}>
        {t('billConfig.step3.description')}
      </p>

      {filteredSharedMeters.length === 0 ? (
        <div style={{ 
          padding: '40px', 
          textAlign: 'center', 
          backgroundColor: '#f8f9fa', 
          borderRadius: '8px',
          color: '#6c757d'
        }}>
          <Zap size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
          <p>{t('billConfig.step3.noMeters')}</p>
        </div>
      ) : (
        <div style={{ 
          border: '1px solid #dee2e6', 
          borderRadius: '6px',
          backgroundColor: 'white'
        }}>
          {filteredSharedMeters.map(meter => {
            const building = buildings.find(b => b.id === meter.building_id);
            return (
              <label
                key={meter.id}
                style={{
                  display: 'flex',
                  alignItems: 'start',
                  padding: '16px',
                  cursor: 'pointer',
                  borderBottom: '1px solid #f0f0f0',
                  transition: 'background-color 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f8f9fa'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'white'}
              >
                <input
                  type="checkbox"
                  checked={selectedSharedMeters.includes(meter.id)}
                  onChange={() => handleSharedMeterToggle(meter.id)}
                  style={{ marginRight: '12px', marginTop: '2px', cursor: 'pointer', width: '18px', height: '18px' }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '15px', fontWeight: '600', marginBottom: '4px' }}>
                    {meter.meter_name}
                  </div>
                  <div style={{ fontSize: '13px', color: '#6c757d' }}>
                    {building?.name} • {meter.split_type} {t('billConfig.step3.split')} • CHF {meter.unit_price.toFixed(3)}/kWh
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      )}

      <div style={{ 
        marginTop: '20px', 
        padding: '16px', 
        backgroundColor: '#e7f3ff', 
        borderRadius: '6px',
        fontSize: '14px',
        color: '#004a99'
      }}>
        <strong>{t('billConfig.step3.selected')}:</strong> {selectedSharedMeters.length} {t('billConfig.step3.meters')}
      </div>
    </div>
  );

  const renderStep4 = () => (
    <div>
      <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '16px' }}>
        {t('billConfig.step4.title')}
      </h3>
      <p style={{ color: '#6c757d', marginBottom: '24px', fontSize: '14px' }}>
        {t('billConfig.step4.description')}
      </p>

      {filteredCustomItems.length === 0 ? (
        <div style={{ 
          padding: '40px', 
          textAlign: 'center', 
          backgroundColor: '#f8f9fa', 
          borderRadius: '8px',
          color: '#6c757d'
        }}>
          <DollarSign size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
          <p>{t('billConfig.step4.noItems')}</p>
        </div>
      ) : (
        <div style={{ 
          border: '1px solid #dee2e6', 
          borderRadius: '6px',
          backgroundColor: 'white'
        }}>
          {filteredCustomItems.map(item => {
            const building = buildings.find(b => b.id === item.building_id);
            return (
              <label
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'start',
                  padding: '16px',
                  cursor: 'pointer',
                  borderBottom: '1px solid #f0f0f0',
                  transition: 'background-color 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f8f9fa'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'white'}
              >
                <input
                  type="checkbox"
                  checked={selectedCustomItems.includes(item.id)}
                  onChange={() => handleCustomItemToggle(item.id)}
                  style={{ marginRight: '12px', marginTop: '2px', cursor: 'pointer', width: '18px', height: '18px' }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '15px', fontWeight: '600', marginBottom: '4px' }}>
                    {item.description}
                  </div>
                  <div style={{ fontSize: '13px', color: '#6c757d' }}>
                    {building?.name} • CHF {item.amount.toFixed(2)} • {item.frequency} • {item.category}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      )}

      <div style={{ 
        marginTop: '20px', 
        padding: '16px', 
        backgroundColor: '#e7f3ff', 
        borderRadius: '6px',
        fontSize: '14px',
        color: '#004a99'
      }}>
        <strong>{t('billConfig.step4.selected')}:</strong> {selectedCustomItems.length} {t('billConfig.step4.items')}
      </div>
    </div>
  );

  const renderStep5 = () => (
    <div>
      <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '24px' }}>
        {t('billConfig.step5.title')}
      </h3>

      <div style={{ 
        marginBottom: '24px', 
        padding: '20px', 
        backgroundColor: '#f8f9fa', 
        borderRadius: '8px'
      }}>
        <h4 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px', color: '#667EEA' }}>
          {t('billConfig.step5.summary')}
        </h4>
        <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px', lineHeight: '1.8' }}>
          <li><strong>{t('billConfig.step5.period')}:</strong> {config.start_date} {t('billConfig.step5.to')} {config.end_date}</li>
          <li><strong>{t('billConfig.step5.buildings')}:</strong> {config.building_ids.length}</li>
          <li><strong>{t('billConfig.step5.apartments')}:</strong> {selectedApartments.size}</li>
          <li><strong>{t('billConfig.step5.users')}:</strong> {config.user_ids.length}</li>
          <li><strong>{t('billConfig.step5.sharedMeters')}:</strong> {selectedSharedMeters.length}</li>
          <li><strong>{t('billConfig.step5.customItems')}:</strong> {selectedCustomItems.length}</li>
          <li><strong>{t('billConfig.step5.estimatedInvoices')}:</strong> {config.user_ids.length}</li>
        </ul>
      </div>

      <div style={{ marginBottom: '24px' }}>
        <h4 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>
          {t('billConfig.step5.senderInfo')}
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '14px', marginBottom: '6px', fontWeight: '500' }}>
              {t('billConfig.step5.name')} *
            </label>
            <input
              type="text"
              value={config.sender_name}
              onChange={(e) => setConfig({ ...config, sender_name: e.target.value })}
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
              value={config.sender_address}
              onChange={(e) => setConfig({ ...config, sender_address: e.target.value })}
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
                value={config.sender_zip}
                onChange={(e) => setConfig({ ...config, sender_zip: e.target.value })}
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
                value={config.sender_city}
                onChange={(e) => setConfig({ ...config, sender_city: e.target.value })}
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

      <div>
        <h4 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>
          {t('billConfig.step5.bankingInfo')}
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '14px', marginBottom: '6px', fontWeight: '500' }}>
              {t('billConfig.step5.bankName')}
            </label>
            <input
              type="text"
              value={config.bank_name}
              onChange={(e) => setConfig({ ...config, bank_name: e.target.value })}
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
              {t('billConfig.step5.iban')} *
            </label>
            <input
              type="text"
              value={config.bank_iban}
              onChange={(e) => setConfig({ ...config, bank_iban: e.target.value })}
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
              value={config.bank_account_holder}
              onChange={(e) => setConfig({ ...config, bank_account_holder: e.target.value })}
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
    </div>
  );

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000,
      padding: '20px'
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
            {t('billConfig.title')}
          </h2>
          <button
            onClick={onClose}
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
                  {s === 1 && t('billConfig.steps.selection')}
                  {s === 2 && t('billConfig.steps.dates')}
                  {s === 3 && t('billConfig.steps.meters')}
                  {s === 4 && t('billConfig.steps.items')}
                  {s === 5 && t('billConfig.steps.review')}
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
            onClick={onClose}
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
                onClick={handleGenerate}
                disabled={!canProceed() || loading}
                style={{
                  padding: '12px 24px',
                  backgroundColor: (canProceed() && !loading) ? '#28a745' : '#ced4da',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: (canProceed() && !loading) ? 'pointer' : 'not-allowed',
                  fontSize: '15px',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <FileText size={18} />
                {loading ? t('billConfig.navigation.generating') : `${t('billConfig.navigation.generate')} ${config.user_ids.length} ${config.user_ids.length === 1 ? t('billing.invoice') : t('billConfig.invoicesPlural')}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}