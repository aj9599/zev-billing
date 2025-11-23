import { Plus } from 'lucide-react';
import { useTranslation } from '../../../i18n';

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
      marginBottom: '24px',
      gap: '16px',
      flexWrap: 'wrap'
    }}>
      <div>
        <h2 style={{
          fontSize: '24px',
          fontWeight: '700',
          margin: 0,
          marginBottom: '8px',
          color: '#1f2937'
        }}>
          {t('billing.invoices')}
        </h2>
        <p style={{
          fontSize: '14px',
          color: '#6b7280',
          margin: 0
        }}>
          {t('billing.subtitle')}
        </p>
      </div>

      <button
        onClick={onCreateBill}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '12px 20px',
          backgroundColor: '#28a745',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          fontSize: '15px',
          fontWeight: '600',
          cursor: 'pointer',
          transition: 'all 0.2s',
          boxShadow: '0 2px 4px rgba(40, 167, 69, 0.3)'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#218838';
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 4px 8px rgba(40, 167, 69, 0.4)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = '#28a745';
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = '0 2px 4px rgba(40, 167, 69, 0.3)';
        }}
      >
        <Plus size={20} />
        <span>{t('billing.createBill')}</span>
      </button>
    </div>
  );
}