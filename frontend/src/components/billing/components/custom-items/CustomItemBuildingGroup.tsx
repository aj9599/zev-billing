import { useState } from 'react';
import { Building as BuildingIcon, ChevronDown, ChevronRight, Plus } from 'lucide-react';
import type { Building, CustomLineItem } from '../../../../types';
import { useTranslation } from '../../../../i18n';
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
    <div style={{ marginBottom: '20px', animation: 'ci-fadeSlideIn 0.4s ease-out both' }}>
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
              {items.length} {items.length === 1 ? t('customItems.item') : t('customItems.items')}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAdd();
            }}
            className="ci-btn-add"
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
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          display: 'grid',
          gap: '10px'
        }}>
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

      <style>{`
        @keyframes ci-fadeSlideIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .ci-btn-add:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 10px rgba(102, 126, 234, 0.4) !important;
        }
      `}</style>
    </div>
  );
}
