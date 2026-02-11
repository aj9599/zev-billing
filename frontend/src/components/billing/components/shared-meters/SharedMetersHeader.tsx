import { Plus, Zap } from 'lucide-react';
import { useTranslation } from '../../../../i18n';

interface SharedMetersHeaderProps {
  onAddNew: () => void;
  configCount: number;
}

export default function SharedMetersHeader({ onAddNew, configCount }: SharedMetersHeaderProps) {
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
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{
          width: '36px', height: '36px', borderRadius: '10px',
          backgroundColor: 'rgba(251, 191, 36, 0.1)',
          color: '#f59e0b',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
        }}>
          <Zap size={18} />
        </div>
        <div>
          <h2 style={{
            fontSize: '20px',
            fontWeight: '700',
            margin: 0,
            marginBottom: '2px',
            color: '#1f2937'
          }}>
            {t('sharedMeters.title')}
          </h2>
          <p style={{
            fontSize: '13px',
            color: '#9ca3af',
            margin: 0
          }}>
            {configCount} {configCount === 1 ? t('sharedMeters.config') : t('sharedMeters.configs')} {t('sharedMeters.configured')}
          </p>
        </div>
      </div>

      <button
        className="sm-btn-create"
        onClick={onAddNew}
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
        <span>{t('sharedMeters.addNew')}</span>
      </button>

      <style>{`
        .sm-btn-create:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.45) !important;
        }
      `}</style>
    </div>
  );
}
