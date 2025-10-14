import { X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from '../i18n';

interface ExportItem {
  id: number;
  name: string;
}

interface ExportModalProps {
  type: 'meters' | 'chargers';
  items: ExportItem[];
  onClose: () => void;
  onExport: (startDate: string, endDate: string, itemId?: number) => Promise<void>;
}

export default function ExportModal({ type, items, onClose, onExport }: ExportModalProps) {
  const { t } = useTranslation();
  const [dateRange, setDateRange] = useState({
    start_date: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0]
  });
  const [selectedItemId, setSelectedItemId] = useState<number | undefined>(undefined);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await onExport(dateRange.start_date, dateRange.end_date, selectedItemId);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', 
      justifyContent: 'center', zIndex: 2000, padding: '20px'
    }}>
      <div className="modal-content" style={{
        backgroundColor: 'white', borderRadius: '12px', padding: '30px',
        maxWidth: '500px', width: '100%'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold' }}>
            {t('export.title')} {type === 'meters' ? t('meters.title') : t('chargers.title')}
          </h2>
          <button onClick={onClose} 
            style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
            {type === 'meters' ? t('meters.title') : t('chargers.title')}
          </label>
          <select
            value={selectedItemId || ''}
            onChange={(e) => setSelectedItemId(e.target.value ? parseInt(e.target.value) : undefined)}
            style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}
          >
            <option value="">{t('common.all')} {type === 'meters' ? t('meters.metersCount') : t('chargers.chargersCount')}</option>
            {items.map(item => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
          <p style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
            {selectedItemId 
              ? `Export data for: ${items.find(i => i.id === selectedItemId)?.name}`
              : `Export data for all ${type}`
            }
          </p>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
            {t('export.startDate')} *
          </label>
          <input 
            type="date" 
            required 
            value={dateRange.start_date}
            onChange={(e) => setDateRange({ ...dateRange, start_date: e.target.value })}
            style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} 
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
            {t('export.endDate')} *
          </label>
          <input 
            type="date" 
            required 
            value={dateRange.end_date}
            onChange={(e) => setDateRange({ ...dateRange, end_date: e.target.value })}
            style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} 
          />
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button 
            onClick={handleExport} 
            disabled={isExporting}
            style={{
              flex: 1, padding: '12px', backgroundColor: '#28a745', color: 'white',
              border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '500', 
              cursor: isExporting ? 'not-allowed' : 'pointer',
              opacity: isExporting ? 0.6 : 1
            }}
          >
            {isExporting ? t('export.exporting') : t('export.exportData')}
          </button>
          <button onClick={onClose} style={{
            flex: 1, padding: '12px', backgroundColor: '#6c757d', color: 'white',
            border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '500', cursor: 'pointer'
          }}>
            {t('common.cancel')}
          </button>
        </div>

        <style>{`
          @media (max-width: 768px) {
            .modal-content {
              padding: 20px !important;
            }
            .modal-content h2 {
              font-size: 20px !important;
            }
          }
        `}</style>
      </div>
    </div>
  );
}