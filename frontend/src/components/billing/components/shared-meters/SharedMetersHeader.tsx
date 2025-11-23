import { Plus, Zap } from 'lucide-react';
import { useTranslation } from '../../../i18n';

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
          color: '#1f2937',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <Zap size={28} style={{ color: '#fbbf24' }} />
          {t('sharedMeters.title')}
        </h2>
        <p style={{
          fontSize: '14px',
          color: '#6b7280',
          margin: 0
        }}>
          {configCount} {configCount === 1 ? t('sharedMeters.config') : t('sharedMeters.configs')} {t('sharedMeters.configured')}
        </p>
      </div>

      <button
        onClick={onAddNew}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '12px 20px',
          backgroundColor: '#667EEA',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          fontSize: '15px',
          fontWeight: '600',
          cursor: 'pointer',
          transition: 'all 0.2s',
          boxShadow: '0 2px 4px rgba(102, 126, 234, 0.3)'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#5568d3';
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 4px 8px rgba(102, 126, 234, 0.4)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = '#667EEA';
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = '0 2px 4px rgba(102, 126, 234, 0.3)';
        }}
      >
        <Plus size={20} />
        <span>{t('sharedMeters.addNew')}</span>
      </button>
    </div>
  );
}