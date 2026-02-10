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
    <div style={{ marginBottom: '8px' }}>
      <div
        onClick={() => onToggleExpand(complex.id)}
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: isMobile ? '14px 16px' : '16px 24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          borderLeft: '4px solid #667eea',
          position: 'relative',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
        onMouseEnter={(e) => {
          if (!isMobile) {
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
          }
        }}
        onMouseLeave={(e) => {
          if (!isMobile) {
            e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08)';
          }
        }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: isMobile ? '8px' : '12px',
          flex: 1,
          minWidth: 0
        }}>
          {isExpanded ? (
            <ChevronDown size={18} color="#667eea" />
          ) : (
            <ChevronRight size={18} color="#667eea" />
          )}
          <Folder size={18} color="#667eea" style={{ flexShrink: 0 }} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <h3 style={{
              fontSize: isMobile ? '15px' : '16px',
              fontWeight: '600',
              margin: 0,
              color: '#667eea',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              {complex.name}
            </h3>
            <p style={{
              fontSize: '12px',
              color: '#9ca3af',
              margin: '2px 0 0 0'
            }}>
              {buildingsInComplex.length} {t('buildings.buildingsInComplex')}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(complex);
            }}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: 'rgba(59, 130, 246, 0.08)',
              color: '#3b82f6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.08)';
            }}
            title={t('common.edit')}
          >
            <Edit2 size={14} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDelete();
            }}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: 'rgba(239, 68, 68, 0.08)',
              color: '#ef4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.08)';
            }}
            title={t('common.delete')}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {isExpanded && (
        <div style={{ marginTop: '8px', marginLeft: isMobile ? '0' : '20px' }}>
          {buildingsInComplex.map(building => (
            <div
              key={building.id}
              style={{
                backgroundColor: 'white',
                borderRadius: '12px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                marginBottom: '8px',
                overflow: 'hidden'
              }}
            >
              <EnergyFlowCard
                building={building}
                buildings={buildings}
                meters={meters}
                chargers={chargers}
                consumptionData={consumptionData}
                onEdit={onEdit}
                onDelete={onDelete}
                isMobile={isMobile}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
