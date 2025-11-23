import { Edit2, Trash2, Zap } from 'lucide-react';
import type { SharedMeterConfig } from '../../../../types';
import { useTranslation } from '../../../../i18n';

interface SharedMeterCardProps {
  config: SharedMeterConfig;
  onEdit: (config: SharedMeterConfig) => void;
  onDelete: (id: number) => void;
}

export default function SharedMeterCard({
  config,
  onEdit,
  onDelete
}: SharedMeterCardProps) {
  const { t } = useTranslation();

  const getSplitTypeLabel = (splitType: string) => {
    const labels: Record<string, string> = {
      'equal': t('sharedMeters.splitType.equal'),
      'custom': t('sharedMeters.splitType.custom')
    };
    return labels[splitType] || splitType;
  };

  return (
    <tr
      style={{
        borderBottom: '1px solid #e9ecef',
        transition: 'background-color 0.2s'
      }}
      onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f8f9fa'}
      onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'white'}
    >
      <td style={{ padding: '16px', fontSize: '15px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '36px',
            height: '36px',
            backgroundColor: '#fbbf24',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Zap size={18} color="white" />
          </div>
          <strong>{config.meter_name}</strong>
        </div>
      </td>
      <td style={{ padding: '16px', fontSize: '14px' }}>
        <span style={{
          display: 'inline-block',
          padding: '6px 14px',
          borderRadius: '20px',
          backgroundColor: '#667EEA',
          color: 'white',
          fontSize: '13px',
          fontWeight: '600'
        }}>
          {getSplitTypeLabel(config.split_type)}
        </span>
      </td>
      <td style={{
        padding: '16px',
        textAlign: 'right',
        fontSize: '15px',
        fontWeight: '600'
      }}>
        CHF {config.unit_price.toFixed(3)}/kWh
      </td>
      <td style={{ padding: '16px', textAlign: 'right' }}>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={() => onEdit(config)}
            style={{
              padding: '8px 14px',
              backgroundColor: '#10b981',
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
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = '#059669';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = '#10b981';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <Edit2 size={14} />
            {t('common.edit')}
          </button>
          <button
            onClick={() => onDelete(config.id)}
            style={{
              padding: '8px 14px',
              backgroundColor: '#ef4444',
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
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = '#dc2626';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = '#ef4444';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <Trash2 size={14} />
            {t('common.delete')}
          </button>
        </div>
      </td>
    </tr>
  );
}