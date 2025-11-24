import { Calendar, HelpCircle, Plus } from 'lucide-react';
import { useTranslation } from '../../../i18n';

interface AutoBillingHeaderProps {
  onShowInstructions: () => void;
  onAddConfig: () => void;
}

export default function AutoBillingHeader({
  onShowInstructions,
  onAddConfig
}: AutoBillingHeaderProps) {
  const { t } = useTranslation();

  return (
    <div 
      className="auto-billing-header" 
      style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '30px', 
        gap: '15px', 
        flexWrap: 'wrap' 
      }}
    >
      <div style={{ flex: 1 }}>
        <h1 style={{
          fontSize: '36px',
          fontWeight: '800',
          marginBottom: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text'
        }}>
          <Calendar size={36} style={{ color: '#667eea' }} />
          {t('autoBilling.title')}
        </h1>
        <p style={{ color: '#6b7280', fontSize: '16px' }}>
          {t('autoBilling.subtitle')}
        </p>
      </div>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <button
          onClick={onShowInstructions}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 20px',
            backgroundColor: 'rgba(23, 162, 184, 0.9)',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(23, 162, 184, 1)'}
          onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'rgba(23, 162, 184, 0.9)'}
        >
          <HelpCircle size={18} />
          {t('autoBilling.setupInstructions')}
        </button>
        <button
          onClick={onAddConfig}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 20px',
            backgroundColor: 'rgba(40, 167, 69, 0.9)',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(40, 167, 69, 1)'}
          onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'rgba(40, 167, 69, 0.9)'}
        >
          <Plus size={18} />
          {t('autoBilling.addConfig')}
        </button>
      </div>
    </div>
  );
}