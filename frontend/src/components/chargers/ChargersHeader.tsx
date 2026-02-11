import { Car, Download, HelpCircle, Plus } from 'lucide-react';

interface ChargersHeaderProps {
  onAddCharger: () => void;
  onShowInstructions: () => void;
  onShowExport: () => void;
  isMobile: boolean;
  t: (key: string) => string;
}

export default function ChargersHeader({
  onAddCharger,
  onShowInstructions,
  onShowExport,
  isMobile,
  t
}: ChargersHeaderProps) {
  return (
    <>
      <div className="chargers-header" style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: isMobile ? 'flex-start' : 'center',
        marginBottom: '24px',
        gap: '15px',
        flexWrap: 'wrap'
      }}>
        <div>
          <h1 style={{
            fontSize: isMobile ? '24px' : '32px',
            fontWeight: '800',
            marginBottom: '6px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
          }}>
            <Car size={isMobile ? 24 : 32} style={{ color: '#667eea' }} />
            {t('chargers.title')}
          </h1>
          <p style={{ color: '#9ca3af', fontSize: '14px', margin: 0 }}>
            {t('chargers.subtitle')}
          </p>
        </div>
        <div className="button-group-header" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={onShowExport}
            className="ch-btn-export"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: isMobile ? '8px 14px' : '10px 18px',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: '0 2px 6px rgba(16, 185, 129, 0.25)'
            }}
          >
            <Download size={16} />
            {!isMobile && (t('chargers.exportData') || 'Export')}
          </button>
          <button
            onClick={onShowInstructions}
            className="ch-btn-instructions"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: isMobile ? '8px 14px' : '10px 18px',
              backgroundColor: 'white',
              color: '#667eea',
              border: '1.5px solid #e5e7eb',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            <HelpCircle size={16} />
            {!isMobile && (t('chargers.setupInstructions') || 'Instructions')}
          </button>
          <button
            onClick={onAddCharger}
            className="ch-btn-add"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: isMobile ? '8px 14px' : '10px 18px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: '0 2px 8px rgba(102, 126, 234, 0.3)'
            }}
          >
            <Plus size={16} />
            {!isMobile && t('chargers.addCharger')}
          </button>
        </div>
      </div>
      <style>{`
        .ch-btn-export:hover {
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.35) !important;
          transform: translateY(-1px);
        }
        .ch-btn-instructions:hover {
          border-color: #667eea !important;
          background-color: #f5f3ff !important;
        }
        .ch-btn-add:hover {
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4) !important;
          transform: translateY(-1px);
        }
      `}</style>
    </>
  );
}
