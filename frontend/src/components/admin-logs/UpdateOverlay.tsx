import { useTranslation } from '../../i18n';

interface UpdateOverlayProps {
  show: boolean;
  progress: number;
}

export const UpdateOverlay = ({ show, progress }: UpdateOverlayProps) => {
  const { t } = useTranslation();

  if (!show) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.85)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backdropFilter: 'blur(4px)'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '20px',
        padding: '48px',
        maxWidth: '500px',
        width: '90%',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4)',
        textAlign: 'center'
      }}>
        <div style={{
          width: '80px',
          height: '80px',
          margin: '0 auto 24px',
          border: '4px solid #e5e7eb',
          borderTop: '4px solid #667eea',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }}></div>
        
        <h2 style={{
          fontSize: '24px',
          fontWeight: '700',
          marginBottom: '12px',
          color: '#1f2937'
        }}>
          {t('logs.updatingSystem')}
        </h2>
        
        <p style={{
          fontSize: '14px',
          color: '#6b7280',
          marginBottom: '32px'
        }}>
          {t('logs.updateInProgress')}
        </p>
        
        <div style={{
          width: '100%',
          height: '12px',
          backgroundColor: '#e5e7eb',
          borderRadius: '6px',
          overflow: 'hidden',
          marginBottom: '16px'
        }}>
          <div style={{
            width: `${progress}%`,
            height: '100%',
            background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
            transition: 'width 0.2s ease',
            borderRadius: '6px'
          }}></div>
        </div>
        
        <p style={{
          fontSize: '16px',
          fontWeight: '600',
          color: '#667eea'
        }}>
          {progress}%
        </p>
        
        <p style={{
          fontSize: '12px',
          color: '#9ca3af',
          marginTop: '16px'
        }}>
          {t('logs.doNotCloseWindow')}
        </p>
      </div>
    </div>
  );
};