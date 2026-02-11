import { useState } from 'react';
import { Building as BuildingIcon, ChevronDown, ChevronRight, Plus } from 'lucide-react';
import type { Building, SharedMeterConfig } from '../../../../types';
import { useTranslation } from '../../../../i18n';
import SharedMeterCard from './SharedMeterCard';

interface SharedMeterBuildingGroupProps {
  building: Building;
  configs: SharedMeterConfig[];
  onEdit: (config: SharedMeterConfig) => void;
  onDelete: (id: number) => void;
  onAdd: () => void;
}

export default function SharedMeterBuildingGroup({
  building,
  configs,
  onEdit,
  onDelete,
  onAdd
}: SharedMeterBuildingGroupProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div style={{ marginBottom: '20px', animation: 'sm-fadeSlideIn 0.4s ease-out both' }}>
      {/* Building Header */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          backgroundColor: 'white',
          padding: '16px 20px',
          borderRadius: isExpanded ? '14px 14px 0 0' : '14px',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          border: '1px solid #e5e7eb',
          borderBottom: isExpanded ? '1px solid #f3f4f6' : '1px solid #e5e7eb',
          transition: 'all 0.2s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '36px', height: '36px', borderRadius: '10px',
            backgroundColor: '#667eea15',
            color: '#667eea',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
          }}>
            <BuildingIcon size={18} />
          </div>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: '700', margin: 0, color: '#1f2937' }}>
              {building.name}
            </h2>
            <p style={{ fontSize: '13px', color: '#9ca3af', margin: '2px 0 0 0' }}>
              {configs.length} {configs.length === 1 ? t('sharedMeters.config') : t('sharedMeters.configs')}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAdd();
            }}
            className="sm-btn-add"
            style={{
              padding: '7px 14px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              transition: 'all 0.2s',
              boxShadow: '0 2px 6px rgba(102, 126, 234, 0.3)'
            }}
          >
            <Plus size={14} />
            {t('common.add')}
          </button>
          <div style={{ color: '#9ca3af', transition: 'transform 0.2s' }}>
            {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
          </div>
        </div>
      </div>

      {/* Building Content */}
      {isExpanded && (
        <div style={{
          backgroundColor: 'white',
          borderRadius: '0 0 14px 14px',
          border: '1px solid #e5e7eb',
          borderTop: 'none',
          padding: '16px 20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse'
            }}>
              <thead>
                <tr>
                  <th style={{
                    padding: '10px 12px',
                    textAlign: 'left',
                    fontWeight: '600',
                    fontSize: '11px',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    borderBottom: '1px solid #f3f4f6'
                  }}>
                    {t('sharedMeters.meterName')}
                  </th>
                  <th style={{
                    padding: '10px 12px',
                    textAlign: 'left',
                    fontWeight: '600',
                    fontSize: '11px',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    borderBottom: '1px solid #f3f4f6'
                  }}>
                    {t('sharedMeters.splitType.label')}
                  </th>
                  <th style={{
                    padding: '10px 12px',
                    textAlign: 'right',
                    fontWeight: '600',
                    fontSize: '11px',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    borderBottom: '1px solid #f3f4f6'
                  }}>
                    {t('sharedMeters.unitPrice')}
                  </th>
                  <th style={{
                    padding: '10px 12px',
                    textAlign: 'right',
                    fontWeight: '600',
                    fontSize: '11px',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    borderBottom: '1px solid #f3f4f6'
                  }}>
                    {t('common.actions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {configs.map(config => (
                  <SharedMeterCard
                    key={config.id}
                    config={config}
                    onEdit={onEdit}
                    onDelete={onDelete}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <style>{`
        @keyframes sm-fadeSlideIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .sm-btn-add:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 10px rgba(102, 126, 234, 0.4) !important;
        }
      `}</style>
    </div>
  );
}
