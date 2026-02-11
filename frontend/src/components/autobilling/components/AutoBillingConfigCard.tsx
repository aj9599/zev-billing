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
  index?: number;
}

export default function AutoBillingConfigCard({
  config,
  buildings,
  onEdit,
  onDelete,
  onToggleActive,
  index = 0
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
    <div
      className="ab-config-card"
      style={{
        backgroundColor: 'white',
        borderRadius: '14px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        padding: '0',
        border: '1px solid #e5e7eb',
        transition: 'all 0.3s',
        overflow: 'hidden',
        animation: `ab-fadeSlideIn 0.4s ease-out ${index * 0.08}s both`
      }}
    >
      {/* Active indicator bar */}
      <div style={{
        height: '3px',
        background: config.is_active
          ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
          : '#e5e7eb'
      }} />

      {/* Header */}
      <div style={{ padding: '20px 20px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <h3 style={{ fontSize: '17px', fontWeight: '700', margin: 0, color: '#1f2937' }}>
                {config.name}
              </h3>
              {config.is_vzev && (
                <span style={{
                  display: 'inline-block',
                  padding: '2px 8px',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  borderRadius: '10px',
                  fontSize: '10px',
                  fontWeight: '600'
                }}>
                  vZEV
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Clock size={14} color="#9ca3af" />
              <span style={{ fontSize: '13px', color: '#6b7280' }}>
                {getFrequencyLabel(config.frequency)} · {t('autoBilling.day')} {config.generation_day}
              </span>
            </div>
          </div>
          <button
            onClick={() => onToggleActive(config)}
            className="ab-btn-toggle"
            style={{
              padding: '6px 10px',
              backgroundColor: config.is_active ? 'rgba(16, 185, 129, 0.1)' : 'rgba(156, 163, 175, 0.1)',
              color: config.is_active ? '#059669' : '#9ca3af',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              transition: 'all 0.2s',
              fontSize: '12px',
              fontWeight: '600'
            }}
            title={config.is_active ? t('autoBilling.pause') : t('autoBilling.activate')}
          >
            {config.is_active ? <PauseCircle size={14} /> : <PlayCircle size={14} />}
            {config.is_active ? t('autoBilling.pause') : t('autoBilling.activate')}
          </button>
        </div>
      </div>

      {/* Details */}
      <div style={{ padding: '0 20px 16px' }}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          marginBottom: '12px'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 12px',
            backgroundColor: '#f9fafb',
            borderRadius: '8px'
          }}>
            <Building size={15} color="#667eea" style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '11px', fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                {config.building_ids.length} {config.building_ids.length === 1 ? t('autoBilling.building') : t('autoBilling.buildings')}
              </div>
              <div style={{ fontSize: '13px', color: '#374151', fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {getBuildingNames(config.building_ids) || t('autoBilling.noBuildings')}
              </div>
            </div>
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 12px',
            backgroundColor: '#f9fafb',
            borderRadius: '8px'
          }}>
            <Users size={15} color="#667eea" style={{ flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '11px', fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                {t('autoBilling.users')}
              </div>
              <div style={{ fontSize: '13px', color: '#374151', fontWeight: '500' }}>
                {getApartmentCount(config.apartments)}
              </div>
            </div>
          </div>
        </div>

        {/* Run Info */}
        <div style={{
          padding: '10px 12px',
          backgroundColor: '#667eea08',
          borderRadius: '8px',
          marginBottom: '14px',
          display: 'flex',
          justifyContent: 'space-between',
          gap: '12px'
        }}>
          <div>
            <div style={{ fontSize: '11px', color: '#9ca3af', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: '2px' }}>
              {t('autoBilling.lastRun')}
            </div>
            <div style={{ fontSize: '13px', fontWeight: '600', color: '#374151' }}>
              {formatDate(config.last_run)}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '11px', color: '#9ca3af', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: '2px' }}>
              {t('autoBilling.nextRun')}
            </div>
            <div style={{ fontSize: '13px', fontWeight: '700', color: '#059669' }}>
              {formatDate(config.next_run)}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => onEdit(config)}
            className="ab-btn-edit"
            style={{
              flex: 1,
              padding: '8px',
              backgroundColor: 'rgba(102, 126, 234, 0.1)',
              color: '#667eea',
              border: 'none',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 0.2s'
            }}
          >
            <Edit2 size={14} />
            {t('common.edit')}
          </button>
          <button
            onClick={handleDelete}
            className="ab-btn-delete"
            style={{
              flex: 1,
              padding: '8px',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              color: '#ef4444',
              border: 'none',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 0.2s'
            }}
          >
            <Trash2 size={14} />
            {t('common.delete')}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes ab-fadeSlideIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .ab-config-card:hover {
          box-shadow: 0 4px 12px rgba(0,0,0,0.08);
          transform: translateY(-1px);
        }
        .ab-btn-toggle:hover {
          opacity: 0.85;
        }
        .ab-btn-edit:hover {
          background-color: rgba(102, 126, 234, 0.18) !important;
        }
        .ab-btn-delete:hover {
          background-color: rgba(239, 68, 68, 0.18) !important;
        }
      `}</style>
    </div>
  );
}
