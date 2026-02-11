import { Calendar } from 'lucide-react';
import { useTranslation } from '../../../i18n';

export default function AutoBillingEmptyState() {
  const { t } = useTranslation();

  return (
    <div style={{
      backgroundColor: 'white',
      borderRadius: '14px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      border: '1px solid #e5e7eb',
      padding: '60px 20px',
      textAlign: 'center'
    }}>
      <div style={{
        width: '64px', height: '64px', borderRadius: '16px',
        background: 'linear-gradient(135deg, #667eea15, #764ba215)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 20px'
      }}>
        <Calendar size={32} style={{ color: '#667eea' }} />
      </div>
      <p style={{ fontSize: '16px', marginBottom: '8px', fontWeight: '600', color: '#374151' }}>
        {t('autoBilling.noConfigs')}
      </p>
      <p style={{ fontSize: '14px', color: '#9ca3af', margin: 0 }}>
        {t('autoBilling.noConfigsDescription')}
      </p>
    </div>
  );
}
