import { Home, User as UserIcon, Zap, Plug, Gauge, Layers } from 'lucide-react';
import type { Building, ApartmentWithUser, User, Charger, BillingMode, BillContent } from '../../../../types';
import { useTranslation } from '../../../../i18n';

interface ConfigStep1SelectionProps {
  buildings: Building[];
  users: User[];
  chargers: Charger[];
  selectedBuildingIds: number[];
  selectedApartments: Set<string>;
  apartmentsWithUsers: Map<number, ApartmentWithUser[]>;
  isVZEVMode: boolean;
  billingMode: BillingMode;
  billContent: BillContent;
  chargerOnly: boolean;
  recipientUserId?: number;
  selectedChargerId?: number;
  onBuildingToggle: (buildingId: number) => void;
  onApartmentToggle: (buildingId: number, apartmentUnit: string) => void;
  onSelectAllActive: () => void;
  onRecipientChange: (userId: number | null) => void;
  onChargerChange: (chargerId: number | null) => void;
  onChargerOnlyToggle: (enabled: boolean) => void;
  onBillContentChange: (content: BillContent) => void;
}

export default function ConfigStep1Selection({
  buildings,
  users,
  chargers,
  selectedBuildingIds,
  selectedApartments,
  apartmentsWithUsers,
  isVZEVMode,
  billingMode,
  billContent,
  chargerOnly,
  recipientUserId,
  selectedChargerId,
  onBuildingToggle,
  onApartmentToggle,
  onSelectAllActive,
  onRecipientChange,
  onChargerChange,
  onChargerOnlyToggle,
  onBillContentChange
}: ConfigStep1SelectionProps) {
  const { t } = useTranslation();

  const isBuildingScope = billingMode === 'building' || billingMode === 'charger';
  // The meters/chargers/both selector applies to apartment-managed buildings, where
  // billing both meter consumption and EV charging is possible. Non-apartment buildings
  // keep their dedicated chargers / single-charger flow below.
  const showBillContent = !isVZEVMode && selectedBuildingIds.length > 0 && !isBuildingScope;
  const billContentOptions: { value: BillContent; label: string; icon: typeof Layers }[] = [
    { value: 'both', label: t('billConfig.step1.contentBoth'), icon: Layers },
    { value: 'meters', label: t('billConfig.step1.contentMeters'), icon: Gauge },
    { value: 'chargers', label: t('billConfig.step1.contentChargers'), icon: Plug },
  ];
  const recipientCandidates = users.filter(
    u => u.user_type === 'regular' && u.is_active && u.building_id != null && selectedBuildingIds.includes(u.building_id)
  );
  const chargerCandidates = chargers.filter(c => selectedBuildingIds.includes(c.building_id));

  return (
    <div>
      <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '16px' }}>
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
            <Zap size={24} color="#4338ca" />
            <h4 style={{ fontSize: '16px', fontWeight: '600', margin: 0, color: '#4338ca' }}>
              {t('billConfig.vzevMode.title')}
            </h4>
          </div>
          <p style={{ fontSize: '14px', margin: 0, color: '#4338ca' }}>
            {t('billConfig.vzevMode.description')}
          </p>
        </div>
      )}

      {/* Building Selection */}
      <div style={{ marginBottom: '30px' }}>
        <label style={{ display: 'block', fontWeight: '600', marginBottom: '12px', fontSize: '15px' }}>
          1. {isVZEVMode ? t('billConfig.step1.selectComplex') : t('billConfig.step1.selectBuildings')} ({selectedBuildingIds.length} {t('billConfig.step1.selected')})
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
                transition: 'background-color 0.2s',
                backgroundColor: building.is_group ? '#f0f9ff' : 'white'
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = building.is_group ? '#e0f2fe' : '#f8f9fa'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = building.is_group ? '#f0f9ff' : 'white'}
            >
              <input
                type="checkbox"
                checked={selectedBuildingIds.includes(building.id)}
                onChange={() => onBuildingToggle(building.id)}
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
          ))}
        </div>
      </div>

      {/* What to bill: meters / chargers / both — available for every building type */}
      {showBillContent && (
        <div style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', fontWeight: '600', marginBottom: '8px', fontSize: '15px' }}>
            {t('billConfig.step1.contentTitle')}
          </label>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {billContentOptions.map(opt => {
              const Icon = opt.icon;
              const active = billContent === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onBillContentChange(opt.value)}
                  style={{
                    flex: '1 1 0',
                    minWidth: '120px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '12px 14px',
                    borderRadius: '8px',
                    border: active ? '2px solid #667EEA' : '1px solid #dee2e6',
                    backgroundColor: active ? '#eef0ff' : 'white',
                    color: active ? '#3b41a8' : '#495057',
                    fontWeight: active ? 600 : 500,
                    fontSize: '14px',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                >
                  <Icon size={16} />
                  {opt.label}
                </button>
              );
            })}
          </div>
          <p style={{ fontSize: '12px', color: '#6c757d', margin: '8px 2px 0' }}>
            {t('billConfig.step1.contentHint')}
          </p>
        </div>
      )}

      {/* Building-mode banner (no apartment management) */}
      {isBuildingScope && (
        <div style={{
          padding: '14px 16px',
          backgroundColor: '#fff7ed',
          borderRadius: '8px',
          marginBottom: '20px',
          border: '2px solid #f59e0b'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <Home size={20} color="#b45309" />
            <h4 style={{ fontSize: '15px', fontWeight: '600', margin: 0, color: '#b45309' }}>
              {billingMode === 'charger' ? t('billConfig.step1.modeCharger') : t('billConfig.step1.modeBuilding')}
            </h4>
          </div>
          <p style={{ fontSize: '13px', margin: 0, color: '#92400e' }}>
            {billingMode === 'charger'
              ? t('billConfig.step1.modeChargerDescription')
              : t('billConfig.step1.modeBuildingDescription')}
          </p>
        </div>
      )}

      {/* Recipient + charger picker for building / charger mode */}
      {isBuildingScope && selectedBuildingIds.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', fontWeight: '600', marginBottom: '8px', fontSize: '15px' }}>
            2. {t('billConfig.step1.selectRecipient')}
          </label>
          {recipientCandidates.length === 0 ? (
            <div style={{ padding: '12px 14px', borderRadius: '6px', backgroundColor: '#fee2e2', color: '#991b1b', fontSize: '13px' }}>
              {t('billConfig.step1.noRecipientFound')}
            </div>
          ) : (
            <select
              value={recipientUserId ?? ''}
              onChange={(e) => onRecipientChange(e.target.value ? Number(e.target.value) : null)}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '6px',
                border: '1px solid #dee2e6',
                fontSize: '14px',
                backgroundColor: 'white'
              }}
            >
              <option value="">{t('billConfig.step1.selectRecipientPlaceholder')}</option>
              {recipientCandidates.map(u => (
                <option key={u.id} value={u.id}>
                  {u.first_name} {u.last_name}{u.email ? ` — ${u.email}` : ''}
                </option>
              ))}
            </select>
          )}

          {/* Charger-only toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '14px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={chargerOnly}
              onChange={(e) => onChargerOnlyToggle(e.target.checked)}
              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
            />
            <span style={{ fontSize: '14px', fontWeight: '500' }}>
              {t('billConfig.step1.chargerOnlyToggle')}
            </span>
          </label>

          {/* Charger picker */}
          {chargerOnly && (
            <div style={{ marginTop: '12px' }}>
              <label style={{ display: 'block', fontWeight: '600', marginBottom: '8px', fontSize: '14px' }}>
                <Plug size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                {t('billConfig.step1.selectCharger')}
              </label>
              {chargerCandidates.length === 0 ? (
                <div style={{ padding: '12px 14px', borderRadius: '6px', backgroundColor: '#fee2e2', color: '#991b1b', fontSize: '13px' }}>
                  {t('billConfig.step1.noChargerFound')}
                </div>
              ) : (
                <select
                  value={selectedChargerId ?? ''}
                  onChange={(e) => onChargerChange(e.target.value ? Number(e.target.value) : null)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '6px',
                    border: '1px solid #dee2e6',
                    fontSize: '14px',
                    backgroundColor: 'white'
                  }}
                >
                  <option value="">{t('billConfig.step1.selectChargerPlaceholder')}</option>
                  {chargerCandidates.map(c => {
                    const bldg = buildings.find(b => b.id === c.building_id);
                    return (
                      <option key={c.id} value={c.id}>
                        {c.name}{bldg ? ` — ${bldg.name}` : ''}
                      </option>
                    );
                  })}
                </select>
              )}
            </div>
          )}
        </div>
      )}

      {/* Apartment Selection — only for apartment-managed buildings */}
      {!isBuildingScope && (
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
            selectedBuildingIds.flatMap(buildingId => {
              const building = buildings.find(b => b.id === buildingId);

              // For vZEV complexes, get all buildings in the group
              let buildingsToShow: number[] = [buildingId];
              if (building?.is_group && building.group_buildings) {
                buildingsToShow = building.group_buildings;
              }

              return buildingsToShow.map(actualBuildingId => {
                const actualBuilding = buildings.find(b => b.id === actualBuildingId);
                const apartments = apartmentsWithUsers.get(actualBuildingId) || [];

                if (apartments.length === 0) {
                  return (
                    <div key={actualBuildingId} style={{ padding: '20px', borderBottom: '2px solid #e9ecef' }}>
                      <div style={{ fontWeight: '600', marginBottom: '8px', color: '#667EEA' }}>
                        {actualBuilding?.name}
                        {building?.is_group && (
                          <span style={{ marginLeft: '8px', fontSize: '12px', color: '#6c757d' }}>
                            (in {building.name})
                          </span>
                        )}
                      </div>
                      <div style={{ color: '#6c757d', fontSize: '14px', fontStyle: 'italic' }}>
                        {t('billConfig.step1.noApartmentsFound')}
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={actualBuildingId} style={{ borderBottom: '2px solid #e9ecef' }}>
                    <div style={{
                      padding: '12px 16px',
                      backgroundColor: '#f8f9fa',
                      fontWeight: '600',
                      color: '#667EEA',
                      fontSize: '14px',
                      borderBottom: '1px solid #dee2e6'
                    }}>
                      {actualBuilding?.name} ({apartments.length} {apartments.length === 1 ? t('billConfig.step1.apartment') : t('billConfig.step1.apartments')})
                      {building?.is_group && (
                        <span style={{ marginLeft: '8px', fontSize: '12px', fontWeight: 'normal', color: '#6c757d' }}>
                          (in {building.name})
                        </span>
                      )}
                    </div>
                    {apartments.map(apartment => {
                      const key = `${actualBuildingId}|||${apartment.apartment_unit}`;
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
                            onChange={() => hasUser && onApartmentToggle(actualBuildingId, apartment.apartment_unit)}
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
              });
            })
          )}
        </div>
      </div>
      )}

      {/* Summary */}
      {!isBuildingScope && selectedApartments.size > 0 && (
        <div style={{
          padding: '16px',
          backgroundColor: '#e7f3ff',
          borderRadius: '6px',
          fontSize: '14px',
          color: '#004a99'
        }}>
          <strong>{t('billConfig.step1.selectedSummary')}:</strong> {selectedApartments.size} {selectedApartments.size === 1 ? t('billConfig.step1.apartment') : t('billConfig.step1.apartments')}
        </div>
      )}
      {isBuildingScope && recipientUserId && (
        <div style={{
          padding: '16px',
          backgroundColor: '#e7f3ff',
          borderRadius: '6px',
          fontSize: '14px',
          color: '#004a99'
        }}>
          <strong>{t('billConfig.step1.selectedSummary')}:</strong>{' '}
          {billingMode === 'charger'
            ? t('billConfig.step1.summaryCharger')
            : t('billConfig.step1.summaryBuilding')}
        </div>
      )}
    </div>
  );
}