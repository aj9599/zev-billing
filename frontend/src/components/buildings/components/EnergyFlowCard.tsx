import { Edit2, Trash2, Sun, Zap, Building2, Car, Layers, Home, Battery } from 'lucide-react';
import { useTranslation } from '../../../i18n';
import { api } from '../../../api/client';
import { useBuildingConsumption } from '../hooks/useBuildingConsumption';
import { getBuildingMeters, getBuildingChargers, hasSolarMeter, getTotalApartments } from '../utils/buildingUtils';
import EnergyFlowHub from '../../shared/EnergyFlowHub';
import type { Building, Meter, Charger, BuildingConsumption, FloorConfig } from '../../../types';

interface EnergyFlowCardProps {
  building: Building;
  meters: Meter[];
  chargers: Charger[];
  consumptionData: BuildingConsumption[];
  onEdit: (building: Building) => void;
  onDelete: () => void;
  isMobile: boolean;
}

function formatPower(kw: number): string {
  if (Math.abs(kw) < 0.001) return '0 W';
  if (Math.abs(kw) < 1) return `${(kw * 1000).toFixed(0)} W`;
  return `${kw.toFixed(2)} kW`;
}

export default function EnergyFlowCard({
  building,
  meters,
  chargers,
  consumptionData,
  onEdit,
  onDelete,
  isMobile
}: EnergyFlowCardProps) {
  const { t } = useTranslation();
  const { getBuildingConsumption } = useBuildingConsumption(consumptionData);
  const consumption = getBuildingConsumption(building.id);

  const buildingMeters = getBuildingMeters(building.id, meters);
  const buildingChargers = getBuildingChargers(building.id, chargers);
  const hasSolar = hasSolarMeter(building.id, meters);
  const hasCharging = consumption.charging > 0;
  const hasData = consumption.actualHouseConsumption > 0 || consumption.solarProduction > 0 || Math.abs(consumption.gridPower) > 0 || (consumption.hasBattery && Math.abs(consumption.batteryNet) > 0);

  // Calculate solar coverage
  const solarCoverage = consumption.actualHouseConsumption > 0 && consumption.solarProduction > 0
    ? Math.min((consumption.solarProduction / consumption.actualHouseConsumption) * 100, 100)
    : 0;

  const handleDelete = async () => {
    if (confirm(t('buildings.deleteConfirm'))) {
      try {
        await api.deleteBuilding(building.id);
        onDelete();
      } catch {
        alert(t('buildings.deleteFailed'));
      }
    }
  };

  return (
    <div style={{
      padding: isMobile ? '16px' : '20px 24px',
      position: 'relative'
    }}>
      {/* Action buttons */}
      <div style={{
        position: 'absolute',
        top: isMobile ? '12px' : '16px',
        right: isMobile ? '12px' : '16px',
        display: 'flex',
        gap: '6px',
        zIndex: 10
      }}>
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(building); }}
          style={actionBtnStyle('#3b82f6')}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.15)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.08)'; }}
          title={t('common.edit')}
        >
          <Edit2 size={14} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); handleDelete(); }}
          style={actionBtnStyle('#ef4444')}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.15)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.08)'; }}
          title={t('common.delete')}
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* ─── Energy Flow - compact horizontal layout ─── */}
      {hasData ? (
        <div style={{ marginBottom: '16px' }}>
          {/* Shared energy-flow hub — same diagram as the dashboard. */}
          <EnergyFlowHub
            isMobile={isMobile}
            formatValue={formatPower}
            solar={consumption.solarProduction}
            hasSolar={hasSolar}
            consumption={consumption.actualHouseConsumption}
            gridMain={Math.abs(consumption.gridPower)}
            isImporting={consumption.gridPower >= 0}
            hasGrid={buildingMeters.some(m => m.meter_type === 'total_meter')}
            ev={consumption.charging}
            hasEv={hasCharging}
            gridImport={consumption.gridPower > 0 ? consumption.gridPower : 0}
            gridExport={consumption.gridPower < 0 ? -consumption.gridPower : 0}
            hasBattery={consumption.hasBattery}
            batteryCharge={consumption.batteryCharge}
            batteryDischarge={consumption.batteryDischarge}
          />

          {/* Solar coverage bar */}
          {hasSolar && solarCoverage > 0 && (
            <div style={{
              marginTop: '12px',
              padding: '10px 14px',
              backgroundColor: '#f9fafb',
              borderRadius: '10px'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '6px'
              }}>
                <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: '500' }}>
                  {t('buildings.energyFlow.solarCoverage')}
                </span>
                <span style={{
                  fontSize: '13px',
                  fontWeight: '700',
                  color: solarCoverage >= 50 ? '#059669' : solarCoverage >= 25 ? '#d97706' : '#6b7280'
                }}>
                  {solarCoverage.toFixed(0)}%
                </span>
              </div>
              <div style={{
                height: '6px',
                backgroundColor: '#e5e7eb',
                borderRadius: '3px',
                overflow: 'hidden'
              }}>
                <div style={{
                  height: '100%',
                  width: `${Math.min(solarCoverage, 100)}%`,
                  background: solarCoverage >= 50
                    ? 'linear-gradient(90deg, #10b981, #059669)'
                    : solarCoverage >= 25
                    ? 'linear-gradient(90deg, #f59e0b, #d97706)'
                    : 'linear-gradient(90deg, #9ca3af, #6b7280)',
                  borderRadius: '3px',
                  transition: 'width 0.6s ease'
                }} />
              </div>
            </div>
          )}
        </div>
      ) : (
        <div style={{
          textAlign: 'center',
          padding: '20px',
          color: '#9ca3af',
          fontSize: '13px'
        }}>
          <Zap size={24} color="#d1d5db" style={{ marginBottom: '8px' }} />
          <p style={{ margin: 0 }}>{t('buildings.noConsumptionData')}</p>
        </div>
      )}

      {/* ─── Compact stats bar ─── */}
      <div style={{
        display: 'flex',
        gap: '8px',
        flexWrap: 'wrap',
        paddingTop: '12px',
        borderTop: '1px solid #f3f4f6'
      }}>
        <StatChip icon={Zap} label={t('buildings.metersCount')} value={buildingMeters.length} color="#f59e0b" />
        {buildingChargers.length > 0 && (
          <StatChip icon={Car} label={t('buildings.chargersCount')} value={buildingChargers.length} color="#8b5cf6" />
        )}
        {building.has_apartments && (
          <StatChip icon={Building2} label={t('buildings.apartmentsCount')} value={getTotalApartments(building)} color="#3b82f6" />
        )}
        {hasSolar && (
          <StatChip icon={Sun} label="Solar" value={buildingMeters.filter(m => m.meter_type === 'solar_meter').length} color="#f59e0b" />
        )}
        {buildingMeters.some(m => m.meter_type === 'battery_meter') && (
          <StatChip icon={Battery} label={t('buildings.energyFlow.battery')} value={buildingMeters.filter(m => m.meter_type === 'battery_meter').length} color="#14b8a6" />
        )}
      </div>

      {/* ─── Floor map (apartment buildings only) ─── */}
      {building.has_apartments && building.floors_config && building.floors_config.length > 0 && (
        <FloorMap floors={building.floors_config} isMobile={isMobile} />
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────

function StatChip({ icon: Icon, label, value, color }: {
  icon: any;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      padding: '6px 12px',
      backgroundColor: '#f9fafb',
      borderRadius: '8px',
      fontSize: '12px'
    }}>
      <Icon size={13} color={color} />
      <span style={{ color: '#6b7280', fontWeight: '500' }}>{label}</span>
      <span style={{ fontWeight: '700', color: '#1f2937' }}>{value}</span>
    </div>
  );
}

// ─── Floor map ─────────────────────────────────────────────────────

function FloorMap({ floors, isMobile }: { floors: FloorConfig[]; isMobile: boolean }) {
  // Sort: attic first, then normal (high to low), then underground
  const sorted = [...floors].sort((a, b) => {
    const order = { attic: 0, normal: 1, underground: 2 };
    const aType = order[a.floor_type || 'normal'] ?? 1;
    const bType = order[b.floor_type || 'normal'] ?? 1;
    if (aType !== bType) return aType - bType;
    return b.floor_number - a.floor_number;
  });

  return (
    <div style={{
      marginTop: '12px',
      borderTop: '1px solid #f3f4f6',
      paddingTop: '12px'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        marginBottom: '8px'
      }}>
        <Layers size={13} color="#667eea" />
        <span style={{ fontSize: '12px', fontWeight: '600', color: '#374151' }}>
          Apartments
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {sorted.map((floor, idx) => {
          const isUnderground = floor.floor_type === 'underground';
          const isAttic = floor.floor_type === 'attic';

          return (
            <div key={idx} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: isMobile ? '6px 8px' : '6px 10px',
              backgroundColor: isAttic ? '#fffbeb' : isUnderground ? '#f3f4f6' : '#f8fafc',
              borderRadius: '6px',
              borderLeft: `3px solid ${isAttic ? '#f59e0b' : isUnderground ? '#9ca3af' : '#667eea'}`
            }}>
              {/* Floor label */}
              <span style={{
                fontSize: '11px',
                fontWeight: '600',
                color: isAttic ? '#92400e' : isUnderground ? '#6b7280' : '#374151',
                minWidth: isMobile ? '50px' : '60px',
                flexShrink: 0,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {floor.floor_name}
              </span>

              {/* Apartment chips */}
              <div style={{
                display: 'flex',
                gap: '4px',
                flexWrap: 'wrap',
                flex: 1
              }}>
                {floor.apartments.length > 0 ? (
                  floor.apartments.map((apt, i) => (
                    <span key={i} style={{
                      fontSize: '10px',
                      fontWeight: '600',
                      padding: '2px 6px',
                      backgroundColor: 'white',
                      borderRadius: '4px',
                      color: '#374151',
                      border: '1px solid #e5e7eb',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3px'
                    }}>
                      <Home size={8} color="#9ca3af" />
                      {apt}
                    </span>
                  ))
                ) : (
                  <span style={{ fontSize: '10px', color: '#9ca3af', fontStyle: 'italic' }}>—</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Shared styles ─────────────────────────────────────────────────

function actionBtnStyle(color: string): React.CSSProperties {
  return {
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: `${color}14`,
    color,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s',
  };
}
