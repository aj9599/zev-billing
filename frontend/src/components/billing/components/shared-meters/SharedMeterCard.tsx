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
      className="sm-table-row"
      style={{
        borderBottom: '1px solid #f3f4f6',
        transition: 'background-color 0.2s'
      }}
    >
      <td style={{ padding: '12px', fontSize: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            backgroundColor: 'rgba(251, 191, 36, 0.1)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Zap size={15} color="#f59e0b" />
          </div>
          <span style={{ fontWeight: '600', color: '#1f2937' }}>{config.meter_name}</span>
        </div>
      </td>
      <td style={{ padding: '12px', fontSize: '13px' }}>
        <span style={{
          display: 'inline-block',
          padding: '4px 10px',
          borderRadius: '12px',
          backgroundColor: '#667eea15',
          color: '#667eea',
          fontSize: '12px',
          fontWeight: '600'
        }}>
          {getSplitTypeLabel(config.split_type)}
        </span>
      </td>
      <td style={{
        padding: '12px',
        textAlign: 'right',
        fontSize: '14px',
        fontWeight: '600',
        color: '#1f2937'
      }}>
        CHF {config.unit_price.toFixed(3)}/kWh
      </td>
      <td style={{ padding: '12px', textAlign: 'right' }}>
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
          <button
            onClick={() => onEdit(config)}
            title={t('common.edit')}
            className="sm-btn-edit"
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
            onClick={() => onDelete(config.id)}
            title={t('common.delete')}
            className="sm-btn-delete"
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
      </td>

      <style>{`
        .sm-table-row:hover {
          background-color: #f9fafb;
        }
        .sm-btn-edit:hover {
          background-color: rgba(102, 126, 234, 0.2) !important;
          transform: translateY(-1px);
        }
        .sm-btn-delete:hover {
          background-color: rgba(239, 68, 68, 0.2) !important;
          transform: translateY(-1px);
        }
      `}</style>
    </tr>
  );
}
