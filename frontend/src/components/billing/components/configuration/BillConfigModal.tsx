import { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import { api } from '../../../../api/client';
import type { Building, User, Meter, SharedMeterConfig, CustomLineItem } from '../../../../types';
import { useTranslation } from '../../../../i18n';
import { useConfigurationState, useBillGeneration } from '../../hooks/useBillGeneration';
import ConfigStepper from './ConfigStepper';
import ConfigStep1Selection from './ConfigStep1Selection';
import ConfigStep2Dates from './ConfigStep2Dates';
import ConfigStep3SharedMeters from './ConfigStep3SharedMeters';
import ConfigStep4CustomItems from './ConfigStep4CustomItems';
import ConfigStep5Review from './ConfigStep5Review';

interface BillConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function BillConfigModal({
  isOpen,
  onClose,
  onSuccess
}: BillConfigModalProps) {
  const { t } = useTranslation();
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [meters, setMeters] = useState<Meter[]>([]);
  const [sharedMeters, setSharedMeters] = useState<SharedMeterConfig[]>([]);
  const [customItems, setCustomItems] = useState<CustomLineItem[]>([]);

  const {
    step,
    setStep,
    config,
    updateConfig,
    selectedApartments,
    setSelectedApartments,
    selectedSharedMeters,
    setSelectedSharedMeters,
    selectedCustomItems,
    setSelectedCustomItems,
    isVZEVMode,
    setIsVZEVMode,
    buildApartmentsMap,
    resetConfiguration,
    canProceed
  } = useConfigurationState(buildings, users, meters);

  const { loading: generating, generateBills } = useBillGeneration(onSuccess);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  // Update vZEV mode when buildings change
  useEffect(() => {
    if (config.building_ids.length > 0) {
      const selectedBuildings = buildings.filter(b => config.building_ids.includes(b.id));
      const hasComplex = selectedBuildings.some(b => b.is_group);
      const hasRegularBuilding = selectedBuildings.some(b => !b.is_group);

      const vzevMode = hasComplex && !hasRegularBuilding;
      setIsVZEVMode(vzevMode);
      updateConfig({ is_vzev: vzevMode });

      if (hasComplex && hasRegularBuilding) {
        alert(t('billConfig.warning.mixingTypes'));
      }
    } else {
      setIsVZEVMode(false);
      updateConfig({ is_vzev: false });
    }
  }, [config.building_ids, buildings]);

  // Load administrator info when reaching step 5
  useEffect(() => {
    if (step === 5 && config.building_ids.length > 0) {
      loadAdministratorInfo();
    }
  }, [step, config.building_ids]);

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
      const regularUsers = usersData.filter(u => u.user_type === 'regular');
      setUsers(regularUsers);
      setMeters(metersData);
      setSharedMeters(sharedMetersData);
      setCustomItems(customItemsData.filter(item => item.is_active));
    } catch (err) {
      console.error('Failed to load data:', err);
    }
  };

  const loadAdministratorInfo = async () => {
    try {
      const allUsers = await api.getUsers(undefined, true);

      // Find an active administration user who manages any of the selected buildings
      const adminUser = allUsers.find(u => {
        if (u.user_type !== 'administration' || !u.is_active) return false;
        
        // Parse managed_buildings
        let managedBuildingIds: number[] = [];
        try {
          if (typeof u.managed_buildings === 'string') {
            managedBuildingIds = JSON.parse(u.managed_buildings);
          } else if (Array.isArray(u.managed_buildings)) {
            managedBuildingIds = u.managed_buildings;
          }
        } catch (e) {
          return false;
        }

        // Check if this admin manages any of the selected buildings
        // This includes both direct buildings and buildings within complexes
        for (const buildingId of config.building_ids) {
          if (managedBuildingIds.includes(buildingId)) return true;

          // Check if the admin manages a complex that includes this building
          const building = buildings.find(b => b.id === buildingId);
          if (building?.is_group && building.group_buildings) {
            const groupBuildingIds = typeof building.group_buildings === 'string'
              ? JSON.parse(building.group_buildings)
              : building.group_buildings;
            
            for (const groupBuildingId of groupBuildingIds) {
              if (managedBuildingIds.includes(groupBuildingId)) return true;
            }
          }

          // Check if any managed building is a complex that contains the selected building
          for (const managedId of managedBuildingIds) {
            const managedBuilding = buildings.find(b => b.id === managedId);
            if (managedBuilding?.is_group && managedBuilding.group_buildings) {
              const groupBuildingIds = typeof managedBuilding.group_buildings === 'string'
                ? JSON.parse(managedBuilding.group_buildings)
                : managedBuilding.group_buildings;
              if (groupBuildingIds.includes(buildingId)) return true;
            }
          }
        }

        return false;
      });

      if (adminUser) {
        updateConfig({
          sender_name: `${adminUser.first_name} ${adminUser.last_name}`.trim() || '',
          sender_address: adminUser.address_street || '',
          sender_city: adminUser.address_city || '',
          sender_zip: adminUser.address_zip || '',
          sender_country: adminUser.address_country || 'Switzerland',
          bank_name: adminUser.bank_name || '',
          bank_iban: adminUser.bank_iban || '',
          bank_account_holder: adminUser.bank_account_holder || ''
        });
      }
    } catch (err) {
      console.error('Failed to load administrator info:', err);
    }
  };

  const handleBuildingToggle = (buildingId: number) => {
    const building = buildings.find(b => b.id === buildingId);
    if (!building) return;

    const currentlySelectedBuildings = buildings.filter(b => config.building_ids.includes(b.id));
    const hasComplex = currentlySelectedBuildings.some(b => b.is_group);
    const hasRegular = currentlySelectedBuildings.some(b => !b.is_group);

    if (!config.building_ids.includes(buildingId)) {
      if ((building.is_group && hasRegular) || (!building.is_group && hasComplex)) {
        alert(t('billConfig.error.cannotMix'));
        return;
      }
    }

    const newBuildings = config.building_ids.includes(buildingId)
      ? config.building_ids.filter(id => id !== buildingId)
      : [...config.building_ids, buildingId];

    if (!newBuildings.includes(buildingId)) {
      const newSelectedApartments = new Set(selectedApartments);
      Array.from(selectedApartments).forEach(key => {
        if (key.startsWith(`${buildingId}|||`)) {
          newSelectedApartments.delete(key);
        }
      });
      setSelectedApartments(newSelectedApartments);
    }

    updateConfig({ building_ids: newBuildings });
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

    const apartmentsWithUsers = buildApartmentsMap();
    const userIds: number[] = [];
    const apartmentSelections: { building_id: number; apartment_unit: string; user_id?: number }[] = [];

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
        if (!userIds.includes(apartment.user.id)) {
          userIds.push(apartment.user.id);
        }

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

    updateConfig({
      user_ids: userIds,
      apartments: apartmentSelections
    });
  };

  const handleSelectAllActive = () => {
    const newSelected = new Set(selectedApartments);
    const apartmentsWithUsers = buildApartmentsMap();

    config.building_ids.forEach(buildingId => {
      const building = buildings.find(b => b.id === buildingId);

      let buildingsToProcess: number[] = [buildingId];
      if (building?.is_group && building.group_buildings) {
        buildingsToProcess = building.group_buildings;
      }

      buildingsToProcess.forEach(actualBuildingId => {
        const apartments = apartmentsWithUsers.get(actualBuildingId) || [];
        apartments.forEach(apt => {
          if (apt.user?.is_active) {
            newSelected.add(`${actualBuildingId}|||${apt.apartment_unit}`);
          }
        });
      });
    });

    setSelectedApartments(newSelected);

    const userIds: number[] = [];
    const apartmentSelections: { building_id: number; apartment_unit: string; user_id?: number }[] = [];

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
        if (!userIds.includes(apartment.user.id)) {
          userIds.push(apartment.user.id);
        }

        apartmentSelections.push({
          building_id: parsedBuildingId,
          apartment_unit: aptUnit,
          user_id: apartment.user.id
        });
      }
    });

    updateConfig({
      user_ids: userIds,
      apartments: apartmentSelections
    });
  };

  const handleGenerate = async () => {
    try {
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

      const result = await generateBills(finalConfig);
      alert(
        t('billConfig.successMessage') +
        ` ${result.length} ${result.length === 1 ? t('billing.invoice') : t('billing.invoicesPlural')}!`
      );
      onSuccess();
      onClose();
      resetConfiguration();
    } catch (err: any) {
      console.error('Failed to generate bills:', err);
      alert(t('billConfig.errorMessage') + ': ' + (err.message || err));
    }
  };

  const filteredSharedMeters = sharedMeters.filter(meter =>
    config.building_ids.includes(meter.building_id)
  );

  const filteredCustomItems = customItems.filter(item =>
    config.building_ids.includes(item.building_id)
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
        {/* Header */}
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

        {/* Stepper */}
        <ConfigStepper currentStep={step} totalSteps={5} />

        {/* Content */}
        <div style={{
          padding: '30px',
          flex: 1,
          overflowY: 'auto'
        }}>
          {step === 1 && (
            <ConfigStep1Selection
              buildings={buildings}
              selectedBuildingIds={config.building_ids}
              selectedApartments={selectedApartments}
              apartmentsWithUsers={buildApartmentsMap()}
              isVZEVMode={isVZEVMode}
              onBuildingToggle={handleBuildingToggle}
              onApartmentToggle={handleApartmentToggle}
              onSelectAllActive={handleSelectAllActive}
            />
          )}
          {step === 2 && (
            <ConfigStep2Dates
              startDate={config.start_date}
              endDate={config.end_date}
              onStartDateChange={(date) => updateConfig({ start_date: date })}
              onEndDateChange={(date) => updateConfig({ end_date: date })}
            />
          )}
          {step === 3 && (
            <ConfigStep3SharedMeters
              buildings={buildings}
              sharedMeters={filteredSharedMeters}
              selectedSharedMeters={selectedSharedMeters}
              onToggle={(meterId) => {
                if (selectedSharedMeters.includes(meterId)) {
                  setSelectedSharedMeters(selectedSharedMeters.filter(id => id !== meterId));
                } else {
                  setSelectedSharedMeters([...selectedSharedMeters, meterId]);
                }
              }}
            />
          )}
          {step === 4 && (
            <ConfigStep4CustomItems
              buildings={buildings}
              customItems={filteredCustomItems}
              selectedCustomItems={selectedCustomItems}
              onToggle={(itemId) => {
                if (selectedCustomItems.includes(itemId)) {
                  setSelectedCustomItems(selectedCustomItems.filter(id => id !== itemId));
                } else {
                  setSelectedCustomItems([...selectedCustomItems, itemId]);
                }
              }}
            />
          )}
          {step === 5 && (
            <ConfigStep5Review
              isVZEVMode={isVZEVMode}
              startDate={config.start_date}
              endDate={config.end_date}
              buildingCount={config.building_ids.length}
              apartmentCount={selectedApartments.size}
              userCount={config.user_ids.length}
              sharedMeterCount={selectedSharedMeters.length}
              customItemCount={selectedCustomItems.length}
              senderName={config.sender_name || ''}
              senderAddress={config.sender_address || ''}
              senderCity={config.sender_city || ''}
              senderZip={config.sender_zip || ''}
              bankName={config.bank_name || ''}
              bankIban={config.bank_iban || ''}
              bankAccountHolder={config.bank_account_holder || ''}
              onSenderNameChange={(value) => updateConfig({ sender_name: value })}
              onSenderAddressChange={(value) => updateConfig({ sender_address: value })}
              onSenderCityChange={(value) => updateConfig({ sender_city: value })}
              onSenderZipChange={(value) => updateConfig({ sender_zip: value })}
              onBankNameChange={(value) => updateConfig({ bank_name: value })}
              onBankIbanChange={(value) => updateConfig({ bank_iban: value })}
              onBankAccountHolderChange={(value) => updateConfig({ bank_account_holder: value })}
            />
          )}
        </div>

        {/* Footer */}
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
                disabled={!canProceed() || generating}
                style={{
                  padding: '12px 24px',
                  backgroundColor: (canProceed() && !generating) ? '#28a745' : '#ced4da',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: (canProceed() && !generating) ? 'pointer' : 'not-allowed',
                  fontSize: '15px',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <FileText size={18} />
                {generating
                  ? t('billConfig.navigation.generating')
                  : `${t('billConfig.navigation.generate')} ${config.user_ids.length} ${config.user_ids.length === 1 ? t('billing.invoice') : t('billing.invoicesPlural')}`
                }
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}