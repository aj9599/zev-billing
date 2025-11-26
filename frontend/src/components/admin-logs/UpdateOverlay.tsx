import { useTranslation } from '../../i18n';
import { useState, useEffect } from 'react';

interface UpdateOverlayProps {
  show: boolean;
  progress: number;
}

export const UpdateOverlay = ({ show, progress }: UpdateOverlayProps) => {
  const { t } = useTranslation();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
      backdropFilter: 'blur(4px)',
      padding: isMobile ? '16px' : '20px'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: isMobile ? '16px' : '20px',
        padding: isMobile ? '32px 24px' : '48px',
        maxWidth: isMobile ? '100%' : '500px',
        width: '100%',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4)',
        textAlign: 'center'
      }}>
        <div style={{
          width: isMobile ? '60px' : '80px',
          height: isMobile ? '60px' : '80px',
          margin: '0 auto 24px',
          border: '4px solid #e5e7eb',
          borderTop: '4px solid #667eea',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }}></div>
        
        <h2 style={{
          fontSize: isMobile ? '20px' : '24px',
          fontWeight: '700',
          marginBottom: '12px',
          color: '#1f2937'
        }}>
          {t('logs.updatingSystem')}
        </h2>
        
        <p style={{
          fontSize: isMobile ? '13px' : '14px',
          color: '#6b7280',
          marginBottom: isMobile ? '24px' : '32px'
        }}>
          {t('logs.updateInProgress')}
        </p>
        
        <div style={{
          width: '100%',
          height: isMobile ? '10px' : '12px',
          backgroundColor: '#e5e7eb',
          borderRadius: '6px',
          overflow: 'hidden',
          marginBottom: '16px'
        }}>
          <div style={{
            width: `${progress}%`,
            height: '100%',
            backgroundColor: '#667eea',
            transition: 'width 0.2s ease',
            borderRadius: '6px'
          }}></div>
        </div>
        
        <p style={{
          fontSize: isMobile ? '14px' : '16px',
          fontWeight: '600',
          color: '#667eea'
        }}>
          {progress}%
        </p>
        
        <p style={{
          fontSize: isMobile ? '11px' : '12px',
          color: '#9ca3af',
          marginTop: '16px'
        }}>
          {t('logs.doNotCloseWindow')}
        </p>
      </div>
    </div>
  );
};