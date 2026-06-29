import { useState } from 'react';
import { Plus, FileSpreadsheet } from 'lucide-react';
import { useTranslation } from '../../../../i18n';
import { notify } from '../../../../utils/toast';

interface BillsHeaderProps {
  onCreateBill: () => void;
}

export default function BillsHeader({ onCreateBill }: BillsHeaderProps) {
  const { t } = useTranslation();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [downloading, setDownloading] = useState('');

  const years = [currentYear, currentYear - 1, currentYear - 2, currentYear - 3];

  // Reports live behind auth, so download via an authenticated fetch → blob
  // rather than a plain link.
  const downloadReport = async (type: 'building-summary' | 'vat-summary') => {
    setDownloading(type);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/export/data?type=${type}&start_date=${year}-01-01&end_date=${year}-12-31`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        notify.error(t('billing.reportFailed'));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type}-${year}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      notify.error(t('billing.reportFailed'));
    } finally {
      setDownloading('');
    }
  };

  const reportBtn = (type: 'building-summary' | 'vat-summary', label: string) => (
    <button
      onClick={() => downloadReport(type)}
      disabled={downloading !== ''}
      style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        padding: '8px 12px', background: 'white', color: '#374151',
        border: '1px solid #e5e7eb', borderRadius: '10px',
        fontSize: '13px', fontWeight: 600,
        cursor: downloading !== '' ? 'not-allowed' : 'pointer',
      }}
    >
      <FileSpreadsheet size={15} />
      <span>{label}</span>
    </button>
  );

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '20px',
      gap: '16px',
      flexWrap: 'wrap'
    }}>
      <div>
        <h2 style={{ fontSize: '20px', fontWeight: '700', margin: 0, marginBottom: '4px', color: '#1f2937' }}>
          {t('billing.invoices')}
        </h2>
        <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0 }}>
          {t('billing.subtitle')}
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          title={t('billing.reportYear')}
          style={{ padding: '8px 10px', borderRadius: '10px', border: '1px solid #e5e7eb', fontSize: '13px', backgroundColor: 'white', cursor: 'pointer' }}
        >
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        {reportBtn('building-summary', t('billing.buildingReport'))}
        {reportBtn('vat-summary', t('billing.vatReport'))}

        <button
          className="bl-btn-create"
          onClick={onCreateBill}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '10px 18px', background: '#667eea', color: 'white',
            border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '600',
            cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 2px 8px rgba(102, 126, 234, 0.35)'
          }}
        >
          <Plus size={18} />
          <span>{t('billing.createBill')}</span>
        </button>
      </div>
    </div>
  );
}
