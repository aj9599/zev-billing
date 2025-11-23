import { useState } from 'react';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import type { Building, CustomLineItem } from '../../../types';
import { useTranslation } from '../../../i18n';
import CustomItemCard from './CustomItemCard';

interface CustomItemBuildingGroupProps {
  building: Building;
  items: CustomLineItem[];
  onEdit: (item: CustomLineItem) => void;
  onDelete: (id: number) => void;
  onAdd: () => void;
}

export default function CustomItemBuildingGroup({
  building,
  items,
  onEdit,
  onDelete,
  onAdd
}: CustomItemBuildingGroupProps) {
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
          border: '2px solid #e9ecef',
          transition: 'all 0.2s'
        }}
      >
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: '600', margin: 0 }}>
            {building.name}
          </h2>
          <p style={{ fontSize: '14px', color: '#666', margin: '4px 0 0 0' }}>
            {items.length} {items.length === 1 ? t('customItems.item') : t('customItems.items')}
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

      {/* Building Items */}
      {isExpanded && (
        <div style={{ display: 'grid', gap: '12px', paddingLeft: '20px' }}>
          {items.map(item => (
            <CustomItemCard
              key={item.id}
              item={item}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}