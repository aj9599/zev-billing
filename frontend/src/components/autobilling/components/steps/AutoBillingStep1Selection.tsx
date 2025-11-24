import { Home, User as UserIcon, Building, Zap, Plug } from 'lucide-react';
import type { Building as BuildingType, ApartmentWithUser } from '../../../../types';
import { useTranslation } from '../../../../i18n';

interface AutoBillingStep1SelectionProps {
  buildings: BuildingType[];
  selectedBuildingIds: number[];
  selectedApartments: Set<string>;
  apartmentsWithUsers: Map<number, ApartmentWithUser[]>;
  isVZEVMode: boolean;
  onBuildingToggle: (buildingId: number) => boolean;
  onApartmentToggle: (buildingId: number, apartmentUnit: string) => void;
  onSelectAllActive: () => void;
  onMixingWarning: () => void;
}

export default function AutoBillingStep1Selection({
  buildings,
  selectedBuildingIds,
  selectedApartments,
  apartmentsWithUsers,
  isVZEVMode,
  onBuildingToggle,
  onApartmentToggle,
  onSelectAllActive,
  onMixingWarning
}: AutoBillingStep1SelectionProps) {
  const { t } = useTranslation();

  const handleBuildingToggle = (buildingId: number) => {
    const success = onBuildingToggle(buildingId);
    if (!success) {
      onMixingWarning();
    }
  };

  const getActiveUsersCount = () => {
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
  };

  return (
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
            <Zap size={24} style={{ color: '#4338ca' }} />
            <h4 style={{ fontSize: '16px', fontWeight: '600', margin: 0, color: '#4338ca' }}>
              {t('autoBilling.vzevMode.title')}
            </h4>
          </div>
          <p style={{ fontSize: '14px', margin: 0, color: '#4338ca' }}>
            {t('autoBilling.vzevMode.description')}
          </p>
        </div>
      )}

      {selectedBuildingIds.length > 0 && !isVZEVMode && (
        <div style={{
          padding: '16px',
          backgroundColor: '#dbeafe',
          borderRadius: '8px',
          marginBottom: '20px',
          border: '2px solid #3b82f6'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <Plug size={24} style={{ color: '#1e40af' }} />
            <h4 style={{ fontSize: '16px', fontWeight: '600', margin: 0, color: '#1e40af' }}>
              {t('autoBilling.zevMode.title')}
            </h4>
          </div>
          <p style={{ fontSize: '14px', margin: 0, color: '#1e40af' }}>
            {t('autoBilling.zevMode.description')}
          </p>
        </div>
      )}

      {/* Building Selection */}
      <div style={{ marginBottom: '30px' }}>
        <label style={{ display: 'block', fontWeight: '600', marginBottom: '12px', fontSize: '15px' }}>
          1. {isVZEVMode ? t('autoBilling.selectComplex') : t('autoBilling.selectBuildings')} ({selectedBuildingIds.length} {t('billConfig.step1.selected')})
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
              <p>{t('autoBilling.noBuildingsAvailable')}</p>
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
                  checked={selectedBuildingIds.includes(building.id)}
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
                    {t('autoBilling.vzevComplex')}
                  </span>
                )}
              </label>
            ))
          )}
        </div>
      </div>

      {/* Apartment Selection */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <label style={{ fontWeight: '600', fontSize: '15px' }}>
            2. {t('billConfig.step1.selectApartments')} ({selectedApartments.size} {t('billConfig.step1.selected')})
          </label>
          {selectedBuildingIds.length > 0 && (
            <button
              onClick={onSelectAllActive}
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
          {selectedBuildingIds.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', color: '#6c757d' }}>
              <Home size={48} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
              <p>{t('billConfig.step1.selectBuildingFirst')}</p>
            </div>
          ) : (
            selectedBuildingIds.map(buildingId => {
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
                          onChange={() => hasUser && onApartmentToggle(buildingId, apartment.apartment_unit)}
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

      {/* Selection Summary */}
      {selectedApartments.size > 0 && (
        <div style={{
          padding: '16px',
          backgroundColor: '#e7f3ff',
          borderRadius: '6px',
          fontSize: '14px',
          color: '#004a99'
        }}>
          <strong>{t('billConfig.step1.selectedSummary')}:</strong> {selectedApartments.size} {selectedApartments.size === 1 ? t('billConfig.step1.apartment') : t('billConfig.step1.apartments')} ({getActiveUsersCount()} {t('billConfig.step1.users')})
        </div>
      )}
    </div>
  );
}