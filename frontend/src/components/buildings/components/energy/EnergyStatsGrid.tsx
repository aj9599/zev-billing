import { Zap, Activity, Home } from 'lucide-react';
import { useTranslation } from '../../../../i18n';
import { getTotalApartments } from '../../utils/buildingUtils';
import type { Building, Charger } from '../../../../types';

interface EnergyStatsGridProps {
  building: Building;
  metersCount: number;
  chargersCount: number;
  charging: number;
  activeCharger: Charger | null;
  isMobile: boolean;
}

export default function EnergyStatsGrid({
  building,
  metersCount,
  chargersCount,
  charging,
  activeCharger,
  isMobile
}: EnergyStatsGridProps) {
  const { t } = useTranslation();

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: isMobile
        ? 'repeat(2, 1fr)'
        : (building.has_apartments
          ? (charging > 0 ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)')
          : (charging > 0 ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)')),
      gap: isMobile ? '12px' : '16px',
      paddingTop: isMobile ? '16px' : '24px',
      borderTop: '2px solid #f3f4f6'
    }}>
      <div style={{
        textAlign: 'center',
        padding: isMobile ? '12px' : '16px',
        backgroundColor: '#f9fafb',
        borderRadius: '12px'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          marginBottom: '8px'
        }}>
          <Zap size={16} color="#f59e0b" />
          <span style={{
            fontSize: isMobile ? '11px' : '13px',
            color: '#6b7280',
            fontWeight: '600'
          }}>
            {t('buildings.metersCount')}
          </span>
        </div>
        <span style={{
          fontSize: isMobile ? '20px' : '24px',
          fontWeight: '800',
          color: '#1f2937'
        }}>
          {metersCount}
        </span>
      </div>

      <div style={{
        textAlign: 'center',
        padding: isMobile ? '12px' : '16px',
        backgroundColor: '#f9fafb',
        borderRadius: '12px'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          marginBottom: '8px'
        }}>
          <Activity size={16} color="#3b82f6" />
          <span style={{
            fontSize: isMobile ? '11px' : '13px',
            color: '#6b7280',
            fontWeight: '600'
          }}>
            {t('buildings.chargersCount')}
          </span>
        </div>
        <span style={{
          fontSize: isMobile ? '20px' : '24px',
          fontWeight: '800',
          color: '#1f2937'
        }}>
          {chargersCount}
        </span>
      </div>

      {building.has_apartments && (
        <div style={{
          textAlign: 'center',
          padding: isMobile ? '12px' : '16px',
          backgroundColor: '#dbeafe',
          borderRadius: '12px'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            marginBottom: '8px'
          }}>
            <Home size={16} color="#1e40af" />
            <span style={{
              fontSize: isMobile ? '11px' : '13px',
              color: '#1e40af',
              fontWeight: '600'
            }}>
              {t('buildings.apartmentsCount')}
            </span>
          </div>
          <span style={{
            fontSize: isMobile ? '20px' : '24px',
            fontWeight: '800',
            color: '#1e40af'
          }}>
            {getTotalApartments(building)}
          </span>
        </div>
      )}

      {charging > 0 && (
        <div style={{
          textAlign: 'center',
          padding: isMobile ? '12px' : '16px',
          backgroundColor: '#f0fdf4',
          borderRadius: '12px'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            marginBottom: '8px'
          }}>
            <Zap size={16} color="#22c55e" />
            <span style={{
              fontSize: isMobile ? '11px' : '13px',
              color: '#22c55e',
              fontWeight: '600'
            }}>
              {t('buildings.charging')}
            </span>
          </div>
          <span style={{
            fontSize: isMobile ? '20px' : '24px',
            fontWeight: '800',
            color: '#22c55e'
          }}>
            {charging.toFixed(2)} kW
          </span>
          {activeCharger && (
            <div style={{ marginTop: '8px' }}>
              <span style={{
                fontSize: '11px',
                color: '#6b7280',
                display: 'block'
              }}>
                {activeCharger.name}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}