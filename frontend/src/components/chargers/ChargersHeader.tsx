import { Car, Download, HelpCircle, Plus } from 'lucide-react';

interface ChargersHeaderProps {
  onAddCharger: () => void;
  onShowInstructions: () => void;
  onShowExport: () => void;
  t: (key: string) => string;
}

export default function ChargersHeader({ 
  onAddCharger, 
  onShowInstructions, 
  onShowExport,
  t 
}: ChargersHeaderProps) {
  return (
    <div className="chargers-header" style={{ 
      display: 'flex', 
      justifyContent: 'space-between', 
      alignItems: 'center', 
      marginBottom: '30px', 
      gap: '15px', 
      flexWrap: 'wrap' 
    }}>
      <div>
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
          <Car size={36} style={{ color: '#667eea' }} />
          {t('chargers.title')}
        </h1>
        <p style={{ color: '#6b7280', fontSize: '16px' }}>
          {t('chargers.subtitle')}
        </p>
      </div>
      <div className="button-group-header" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <button
          onClick={onShowExport}
          style={{
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px', 
            padding: '10px 20px',
            backgroundColor: '#28a745', 
            color: 'white', 
            border: 'none', 
            borderRadius: '6px', 
            fontSize: '14px', 
            cursor: 'pointer'
          }}
        >
          <Download size={18} />
          {t('chargers.exportData')}
        </button>
        <button
          onClick={onShowInstructions}
          style={{
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px', 
            padding: '10px 20px',
            backgroundColor: '#17a2b8', 
            color: 'white', 
            border: 'none', 
            borderRadius: '6px', 
            fontSize: '14px', 
            cursor: 'pointer'
          }}
        >
          <HelpCircle size={18} />
          {t('chargers.setupInstructions')}
        </button>
        <button
          onClick={onAddCharger}
          style={{
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px', 
            padding: '10px 20px',
            backgroundColor: '#007bff', 
            color: 'white', 
            border: 'none', 
            borderRadius: '6px', 
            fontSize: '14px', 
            cursor: 'pointer'
          }}
        >
          <Plus size={18} />
          {t('chargers.addCharger')}
        </button>
      </div>
    </div>
  );
}