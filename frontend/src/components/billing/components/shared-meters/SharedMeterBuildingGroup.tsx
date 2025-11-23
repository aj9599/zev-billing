import { useState } from 'react';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import type { Building, SharedMeterConfig } from '../../../types';
import { useTranslation } from '../../../i18n';
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
    <div style={{ marginBottom: '24px' }}>
      {/* Building Header */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          backgroundColor: '#f8f9fa',
          padding: '16px 20px',
          borderRadius: '8px',
          marginBottom: '12px',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          border: '2px solid #e9ecef'
        }}
      >
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: '600', margin: 0 }}>
            {building.name}
          </h2>
          <p style={{ fontSize: '14px', color: '#666', margin: '4px 0 0 0' }}>
            {configs.length} {configs.length === 1 ? t('sharedMeters.config') : t('sharedMeters.configs')}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAdd();
            }}
            style={{
              padding: '8px 16px',
              backgroundColor: '#667EEA',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#5568d3'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#667EEA'}
          >
            <Plus size={16} />
            {t('common.add')}
          </button>
          {isExpanded ? (
            <ChevronDown size={24} color="#666" />
          ) : (
            <ChevronRight size={24} color="#666" />
          )}
        </div>
      </div>

      {/* Building Configs */}
      {isExpanded && (
        <div style={{ paddingLeft: '20px' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              backgroundColor: 'white',
              borderRadius: '12px',
              overflow: 'hidden',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}>
              <thead>
                <tr style={{
                  backgroundColor: '#f8f9fa',
                  color: '#1f2937',
                  borderBottom: '2px solid #e9ecef'
                }}>
                  <th style={{
                    padding: '16px',
                    textAlign: 'left',
                    fontWeight: '600',
                    fontSize: '14px'
                  }}>
                    {t('sharedMeters.meterName')}
                  </th>
                  <th style={{
                    padding: '16px',
                    textAlign: 'left',
                    fontWeight: '600',
                    fontSize: '14px'
                  }}>
                    {t('sharedMeters.splitType.label')}
                  </th>
                  <th style={{
                    padding: '16px',
                    textAlign: 'right',
                    fontWeight: '600',
                    fontSize: '14px'
                  }}>
                    {t('sharedMeters.unitPrice')}
                  </th>
                  <th style={{
                    padding: '16px',
                    textAlign: 'right',
                    fontWeight: '600',
                    fontSize: '14px'
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
    </div>
  );
}