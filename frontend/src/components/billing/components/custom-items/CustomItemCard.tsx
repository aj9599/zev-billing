import { Edit2, Trash2 } from 'lucide-react';
import type { CustomLineItem } from '../../../../types';
import { useTranslation } from '../../../../i18n';
import { getCategoryColor } from '../../utils/billingUtils';

interface CustomItemCardProps {
  item: CustomLineItem;
  onEdit: (item: CustomLineItem) => void;
  onDelete: (id: number) => void;
}

export default function CustomItemCard({
  item,
  onEdit,
  onDelete
}: CustomItemCardProps) {
  const { t } = useTranslation();

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      meter_rent: t('customItems.category.meterRent'),
      maintenance: t('customItems.category.maintenance'),
      service: t('customItems.category.service'),
      other: t('customItems.category.other')
    };
    return labels[category] || category;
  };

  const getFrequencyLabel = (frequency: string) => {
    const labels: Record<string, string> = {
      once: t('customItems.frequency.once'),
      monthly: t('customItems.frequency.monthly'),
      quarterly: t('customItems.frequency.quarterly'),
      yearly: t('customItems.frequency.yearly')
    };
    return labels[frequency] || frequency;
  };

  return (
    <div
      style={{
        padding: '18px',
        border: '2px solid #e5e7eb',
        borderRadius: '12px',
        backgroundColor: item.is_active ? 'white' : '#f9fafb',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderLeft: `4px solid ${getCategoryColor(item.category)}`,
        transition: 'all 0.2s',
        cursor: 'default'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = 'none';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          marginBottom: '8px'
        }}>
          <h5 style={{
            fontSize: '16px',
            fontWeight: '700',
            margin: 0,
            color: '#111827'
          }}>
            {item.description}
          </h5>
          {!item.is_active && (
            <span style={{
              fontSize: '12px',
              padding: '3px 10px',
              backgroundColor: '#fef3c7',
              color: '#92400e',
              borderRadius: '12px',
              fontWeight: '600'
            }}>
              {t('customItems.inactiveLabel')}
            </span>
          )}
        </div>
        <div style={{
          display: 'flex',
          gap: '20px',
          fontSize: '14px',
          color: '#6b7280',
          flexWrap: 'wrap'
        }}>
          <span style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontWeight: '600'
          }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: getCategoryColor(item.category)
            }} />
            {getCategoryLabel(item.category)}
          </span>
          <span>{getFrequencyLabel(item.frequency)}</span>
          <span style={{ fontWeight: '700', color: '#111827' }}>
            CHF {item.amount.toFixed(2)}
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
        <button
          onClick={() => onEdit(item)}
          style={{
            padding: '10px 14px',
            backgroundColor: '#667EEA',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '13px',
            fontWeight: '600',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#0056b3';
            e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#667EEA';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          <Edit2 size={14} />
          {t('common.edit')}
        </button>
        <button
          onClick={() => onDelete(item.id)}
          style={{
            padding: '10px 14px',
            backgroundColor: '#ef4444',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '13px',
            fontWeight: '600',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#dc2626';
            e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#ef4444';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          <Trash2 size={14} />
          {t('common.delete')}
        </button>
      </div>
    </div>
  );
}