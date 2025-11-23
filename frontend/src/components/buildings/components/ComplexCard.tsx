import { Edit2, Trash2, ChevronDown, ChevronRight, Folder } from 'lucide-react';
import { useTranslation } from '../../../i18n';
import { api } from '../../../api/client';
import { getBuildingsInComplex } from '../utils/buildingUtils';
import EnergyFlowCard from './EnergyFlowCard';
import type { Building, Meter, Charger, BuildingConsumption } from '../../../types';

interface ComplexCardProps {
  complex: Building;
  buildings: Building[];
  meters: Meter[];
  chargers: Charger[];
  consumptionData: BuildingConsumption[];
  isExpanded: boolean;
  onToggleExpand: (complexId: number) => void;
  onEdit: (building: Building) => void;
  onDelete: () => void;
  isMobile: boolean;
}

export default function ComplexCard({
  complex,
  buildings,
  meters,
  chargers,
  consumptionData,
  isExpanded,
  onToggleExpand,
  onEdit,
  onDelete,
  isMobile
}: ComplexCardProps) {
  const { t } = useTranslation();
  const buildingsInComplex = getBuildingsInComplex(complex, buildings);

  const handleDelete = async () => {
    if (confirm(t('buildings.deleteConfirm'))) {
      try {
        await api.deleteBuilding(complex.id);
        onDelete();
      } catch (err) {
        alert(t('buildings.deleteFailed'));
      }
    }
  };

  return (
    <div style={{ marginBottom: '20px' }}>
      <div
        onClick={() => onToggleExpand(complex.id)}
        style={{
          backgroundColor: 'white',
          borderRadius: isMobile ? '12px' : '16px',
          padding: isMobile ? '16px' : '24px',
          boxShadow: '0 4px 6px rgba(0,0,0,0.07)',
          border: '2px solid #667eea',
          position: 'relative',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={(e) => {
          if (!isMobile) {
            e.currentTarget.style.boxShadow = '0 8px 12px rgba(0,0,0,0.12)';
            e.currentTarget.style.transform = 'translateY(-2px)';
          }
        }}
        onMouseLeave={(e) => {
          if (!isMobile) {
            e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.07)';
            e.currentTarget.style.transform = 'translateY(0)';
          }
        }}
      >
        <div style={{
          position: 'absolute',
          top: isMobile ? '12px' : '16px',
          right: isMobile ? '12px' : '16px',
          display: 'flex',
          gap: '8px'
        }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(complex);
            }}
            style={{
              width: isMobile ? '36px' : '32px',
              height: isMobile ? '36px' : '32px',
              borderRadius: '50%',
              border: 'none',
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              color: '#3b82f6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            title={t('common.edit')}
          >
            <Edit2 size={16} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDelete();
            }}
            style={{
              width: isMobile ? '36px' : '32px',
              height: isMobile ? '36px' : '32px',
              borderRadius: '50%',
              border: 'none',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              color: '#ef4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            title={t('common.delete')}
          >
            <Trash2 size={16} />
          </button>
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: isMobile ? '8px' : '12px',
          paddingRight: isMobile ? '80px' : '72px'
        }}>
          {isExpanded ? (
            <ChevronDown size={20} color="#667eea" />
          ) : (
            <ChevronRight size={20} color="#667eea" />
          )}
          <Folder size={20} color="#667eea" />
          <div style={{ flex: 1 }}>
            <h3 style={{
              fontSize: isMobile ? '18px' : '22px',
              fontWeight: '700',
              margin: 0,
              color: '#667eea',
              lineHeight: '1.3',
              wordBreak: 'break-word'
            }}>
              {complex.name}
            </h3>
            <p style={{
              fontSize: isMobile ? '12px' : '14px',
              color: '#6b7280',
              margin: '4px 0 0 0'
            }}>
              {buildingsInComplex.length} {t('buildings.buildingsInComplex')}
            </p>
          </div>
        </div>
      </div>

      {isExpanded && (
        <div style={{ marginTop: '16px' }}>
          {buildingsInComplex.map(building => (
            <EnergyFlowCard
              key={building.id}
              building={building}
              buildings={buildings}
              meters={meters}
              chargers={chargers}
              consumptionData={consumptionData}
              onEdit={onEdit}
              onDelete={onDelete}
              isMobile={isMobile}
            />
          ))}
        </div>
      )}
    </div>
  );
}