import { useState } from 'react';
import { api } from '../../api/client';
import type { GenerateBillsRequest, Building, User, Meter, SharedMeterConfig, CustomLineItem, ApartmentWithUser } from '../../types';
import { useTranslation } from '../../i18n';

export function useBillGeneration(onSuccess: () => void) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateBills = async (config: GenerateBillsRequest) => {
    setLoading(true);
    setError(null);

    try {
      // Validate configuration
      if (!config.start_date || !config.end_date) {
        throw new Error(t('billConfig.validation.selectDates'));
      }

      if (config.building_ids.length === 0) {
        throw new Error(
          config.is_vzev 
            ? t('billConfig.validation.selectComplex') 
            : t('billConfig.validation.selectBuilding')
        );
      }

      if (config.user_ids.length === 0) {
        throw new Error(t('billConfig.validation.selectUser'));
      }

      // Validate vZEV mode
      if (config.is_vzev && !config.sender_name) {
        throw new Error(t('billConfig.validation.vzevComplexRequired'));
      }

      // Generate bills
      const result = await api.generateBills(config);
      
      onSuccess();
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate bills';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    error,
    generateBills
  };
}

export function useConfigurationState(
  buildings: Building[],
  users: User[],
  meters: Meter[]
) {
  const [step, setStep] = useState(1);
  const [selectedApartments, setSelectedApartments] = useState<Set<string>>(new Set());
  const [selectedSharedMeters, setSelectedSharedMeters] = useState<number[]>([]);
  const [selectedCustomItems, setSelectedCustomItems] = useState<number[]>([]);
  const [isVZEVMode, setIsVZEVMode] = useState(false);

  const [config, setConfig] = useState<GenerateBillsRequest>({
    building_ids: [],
    user_ids: [],
    apartments: [],
    start_date: '',
    end_date: '',
    include_shared_meters: false,
    shared_meter_configs: [],
    custom_line_items: [],
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

  const buildApartmentsMap = (): Map<number, ApartmentWithUser[]> => {
    const apartmentMap = new Map<number, ApartmentWithUser[]>();

    config.building_ids.forEach(buildingId => {
      const building = buildings.find(b => b.id === buildingId);
      if (!building) return;

      let buildingsToProcess: number[] = [buildingId];

      // If this is a complex (vZEV), process all buildings in the group
      if (building.is_group && building.group_buildings) {
        buildingsToProcess = building.group_buildings;
      }

      buildingsToProcess.forEach(processBuildingId => {
        const buildingMeters = meters.filter(
          m => m.building_id === processBuildingId &&
            m.apartment_unit &&
            m.meter_type === 'apartment_meter' &&
            m.is_active
        );

        const apartmentSet = new Set<string>();
        const buildingApartments: ApartmentWithUser[] = [];

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

            buildingApartments.push({
              building_id: processBuildingId,
              apartment_unit: meter.apartment_unit,
              user: user,
              meter: meter,
              has_meter: true
            });
          }
        });

        // Sort apartments
        buildingApartments.sort((a, b) => {
          const aNum = parseInt(a.apartment_unit.replace(/[^0-9]/g, '')) || 0;
          const bNum = parseInt(b.apartment_unit.replace(/[^0-9]/g, '')) || 0;
          return aNum - bNum;
        });

        apartmentMap.set(processBuildingId, buildingApartments);
      });
    });

    return apartmentMap;
  };

  const updateConfig = (updates: Partial<GenerateBillsRequest>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  };

  const resetConfiguration = () => {
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
    setSelectedSharedMeters([]);
    setSelectedCustomItems([]);
    setIsVZEVMode(false);
  };

  const canProceed = () => {
    switch (step) {
      case 1:
        return config.building_ids.length > 0 && config.user_ids.length > 0;
      case 2:
        return !!config.start_date && !!config.end_date;
      case 3:
      case 4:
        return true;
      case 5:
        return !!config.sender_name && !!config.bank_iban;
      default:
        return false;
    }
  };

  return {
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
  };
}