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

  const catColor = getCategoryColor(item.category);

  return (
    <div
      className="ci-card"
      style={{
        padding: '14px 16px',
        border: '1px solid #e5e7eb',
        borderRadius: '10px',
        backgroundColor: item.is_active ? 'white' : '#fafafa',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderLeft: `3px solid ${catColor}`,
        transition: 'all 0.2s',
        cursor: 'default',
        gap: '12px'
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '6px',
          flexWrap: 'wrap'
        }}>
          <h5 style={{
            fontSize: '14px',
            fontWeight: '700',
            margin: 0,
            color: '#1f2937'
          }}>
            {item.description}
          </h5>
          {!item.is_active && (
            <span style={{
              fontSize: '10px',
              padding: '2px 8px',
              backgroundColor: '#fef3c7',
              color: '#92400e',
              borderRadius: '10px',
              fontWeight: '600'
            }}>
              {t('customItems.inactiveLabel')}
            </span>
          )}
        </div>
        <div style={{
          display: 'flex',
          gap: '12px',
          fontSize: '12px',
          color: '#6b7280',
          flexWrap: 'wrap',
          alignItems: 'center'
        }}>
          <span style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            fontWeight: '600'
          }}>
            <span style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              backgroundColor: catColor
            }} />
            {getCategoryLabel(item.category)}
          </span>
          <span style={{ color: '#d1d5db' }}>|</span>
          <span>{getFrequencyLabel(item.frequency)}</span>
          <span style={{ color: '#d1d5db' }}>|</span>
          <span style={{ fontWeight: '700', color: '#1f2937', fontSize: '13px' }}>
            CHF {item.amount.toFixed(2)}
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
        <button
          onClick={() => onEdit(item)}
          title={t('common.edit')}
          className="ci-btn-edit"
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s',
            backgroundColor: 'rgba(102, 126, 234, 0.1)',
            color: '#667eea'
          }}
        >
          <Edit2 size={14} />
        </button>
        <button
          onClick={() => onDelete(item.id)}
          title={t('common.delete')}
          className="ci-btn-delete"
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            color: '#ef4444'
          }}
        >
          <Trash2 size={14} />
        </button>
      </div>

      <style>{`
        .ci-card:hover {
          box-shadow: 0 2px 8px rgba(0,0,0,0.06);
        }
        .ci-btn-edit:hover {
          background-color: rgba(102, 126, 234, 0.2) !important;
          transform: translateY(-1px);
        }
        .ci-btn-delete:hover {
          background-color: rgba(239, 68, 68, 0.2) !important;
          transform: translateY(-1px);
        }
      `}</style>
    </div>
  );
}
