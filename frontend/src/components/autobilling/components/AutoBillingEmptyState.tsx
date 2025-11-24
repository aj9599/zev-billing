import { Calendar } from 'lucide-react';
import { useTranslation } from '../../../i18n';

export default function AutoBillingEmptyState() {
  const { t } = useTranslation();

  return (
    <div style={{
      backgroundColor: 'white',
      borderRadius: '12px',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      padding: '60px 20px',
      textAlign: 'center',
      color: '#999'
    }}>
      <Calendar size={64} style={{ margin: '0 auto 20px', opacity: 0.3 }} />
      <p style={{ fontSize: '16px', marginBottom: '8px' }}>
        {t('autoBilling.noConfigs')}
      </p>
      <p style={{ fontSize: '14px', color: '#6b7280' }}>
        {t('autoBilling.noConfigsDescription')}
      </p>
    </div>
  );
}