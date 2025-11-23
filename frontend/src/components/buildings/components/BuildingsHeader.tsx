import { Building, Plus, HelpCircle } from 'lucide-react';
import { useTranslation } from '../../../i18n';

interface BuildingsHeaderProps {
  isMobile: boolean;
  onAddBuilding: () => void;
  onShowInstructions: () => void;
}

export default function BuildingsHeader({
  isMobile,
  onAddBuilding,
  onShowInstructions
}: BuildingsHeaderProps) {
  const { t } = useTranslation();

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: isMobile ? '20px' : '30px',
      gap: '15px',
      flexWrap: 'wrap'
    }}>
      <div>
        <h1 style={{
          fontSize: isMobile ? '24px' : '36px',
          fontWeight: '800',
          marginBottom: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: isMobile ? '8px' : '12px',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text'
        }}>
          <Building size={isMobile ? 28 : 36} style={{ color: '#667eea' }} />
          {t('buildings.title')}
        </h1>
        <p style={{ color: '#6b7280', fontSize: isMobile ? '14px' : '16px' }}>
          {t('buildings.subtitle')}
        </p>
      </div>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <button
          onClick={onShowInstructions}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: isMobile ? '10px 16px' : '10px 20px',
            backgroundColor: '#17a2b8',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            cursor: 'pointer'
          }}
        >
          <HelpCircle size={18} />
          {!isMobile && t('buildings.setupInstructions')}
        </button>
        <button
          onClick={onAddBuilding}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: isMobile ? '10px 16px' : '10px 20px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            cursor: 'pointer'
          }}
        >
          <Plus size={18} />
          {isMobile ? t('common.add') : t('buildings.addBuilding')}
        </button>
      </div>
    </div>
  );
}