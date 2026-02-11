import { Plus } from 'lucide-react';
import { useTranslation } from '../../../../i18n';

interface BillsHeaderProps {
  onCreateBill: () => void;
}

export default function BillsHeader({ onCreateBill }: BillsHeaderProps) {
  const { t } = useTranslation();

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
        <h2 style={{
          fontSize: '20px',
          fontWeight: '700',
          margin: 0,
          marginBottom: '4px',
          color: '#1f2937'
        }}>
          {t('billing.invoices')}
        </h2>
        <p style={{
          fontSize: '13px',
          color: '#9ca3af',
          margin: 0
        }}>
          {t('billing.subtitle')}
        </p>
      </div>

      <button
        className="bl-btn-create"
        onClick={onCreateBill}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 18px',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          border: 'none',
          borderRadius: '10px',
          fontSize: '14px',
          fontWeight: '600',
          cursor: 'pointer',
          transition: 'all 0.2s',
          boxShadow: '0 2px 8px rgba(102, 126, 234, 0.35)'
        }}
      >
        <Plus size={18} />
        <span>{t('billing.createBill')}</span>
      </button>
    </div>
  );
}
