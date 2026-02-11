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
      className="ab-header"
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
        <p style={{ color: '#6b7280', fontSize: '16px', margin: 0 }}>
          {t('autoBilling.subtitle')}
        </p>
      </div>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <button
          onClick={onShowInstructions}
          className="ab-btn-instructions"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            backgroundColor: 'white',
            color: '#667eea',
            border: '1px solid #e5e7eb',
            borderRadius: '10px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          <HelpCircle size={18} />
          {t('autoBilling.setupInstructions')}
        </button>
        <button
          onClick={onAddConfig}
          className="ab-btn-create"
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
          {t('autoBilling.addConfig')}
        </button>
      </div>

      <style>{`
        .ab-btn-instructions:hover {
          border-color: #667eea;
          background-color: #667eea08 !important;
        }
        .ab-btn-create:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.45) !important;
        }
      `}</style>
    </div>
  );
}
