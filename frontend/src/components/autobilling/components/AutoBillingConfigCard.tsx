import { Clock, Building, Users, Edit2, Trash2, PlayCircle, PauseCircle } from 'lucide-react';
import { useTranslation } from '../../../i18n';
import type { Building as BuildingType } from '../../../types';
import type { AutoBillingConfig, ApartmentSelection } from '../hooks/useAutoBillingConfig';

interface AutoBillingConfigCardProps {
  config: AutoBillingConfig;
  buildings: BuildingType[];
  onEdit: (config: AutoBillingConfig) => void;
  onDelete: (id: number) => void;
  onToggleActive: (config: AutoBillingConfig) => void;
}

export default function AutoBillingConfigCard({
  config,
  buildings,
  onEdit,
  onDelete,
  onToggleActive
}: AutoBillingConfigCardProps) {
  const { t } = useTranslation();

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

  const handleDelete = () => {
    if (confirm(t('autoBilling.deleteConfirm'))) {
      onDelete(config.id);
    }
  };

  return (
    <div style={{
      backgroundColor: 'white',
      borderRadius: '12px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      padding: '24px',
      border: config.is_active ? '2px solid rgba(40, 167, 69, 0.3)' : '2px solid rgba(221, 221, 221, 0.5)',
      transition: 'all 0.3s'
    }}>
      {/* Header */}
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
              {t('autoBilling.vzevMode')}
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
          onClick={() => onToggleActive(config)}
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

      {/* Details */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'flex-start', 
          gap: '8px', 
          marginBottom: '10px', 
          padding: '10px', 
          backgroundColor: 'rgba(249, 250, 251, 0.8)', 
          borderRadius: '6px' 
        }}>
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
        <div style={{ 
          display: 'flex', 
          alignItems: 'flex-start', 
          gap: '8px', 
          padding: '10px', 
          backgroundColor: 'rgba(249, 250, 251, 0.8)', 
          borderRadius: '6px' 
        }}>
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

      {/* Run Info */}
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

      {/* Actions */}
      <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid rgba(243, 244, 246, 0.8)', paddingTop: '12px' }}>
        <button
          onClick={() => onEdit(config)}
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
          onClick={handleDelete}
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
  );
}