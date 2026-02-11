import { AlertTriangle, X } from 'lucide-react';
import { useTranslation } from '../../i18n';

interface UpdateOverlayProps {
  show: boolean;
  progress: number;
  message?: string;
  error?: string;
  onDismissError?: () => void;
}

export const UpdateOverlay = ({ show, progress, message, error, onDismissError }: UpdateOverlayProps) => {
  const { t } = useTranslation();

  if (!show) return null;

  const hasError = !!error;

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
        textAlign: 'center',
        position: 'relative'
      }}>
        {hasError ? (
          <>
            {onDismissError && (
              <button
                onClick={onDismissError}
                style={{
                  position: 'absolute',
                  top: '16px',
                  right: '16px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  color: '#9ca3af'
                }}
              >
                <X size={20} />
              </button>
            )}
            <div style={{
              width: '80px',
              height: '80px',
              margin: '0 auto 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              borderRadius: '50%'
            }}>
              <AlertTriangle size={40} style={{ color: '#ef4444' }} />
            </div>

            <h2 style={{
              fontSize: '24px',
              fontWeight: '700',
              marginBottom: '12px',
              color: '#ef4444'
            }}>
              {t('logs.updateFailed')}
            </h2>

            <div style={{
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '24px',
              textAlign: 'left'
            }}>
              <pre style={{
                fontSize: '12px',
                color: '#991b1b',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                margin: 0,
                fontFamily: 'monospace',
                maxHeight: '200px',
                overflow: 'auto'
              }}>
                {error}
              </pre>
            </div>

            {onDismissError && (
              <button
                onClick={onDismissError}
                style={{
                  padding: '10px 24px',
                  backgroundColor: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                {t('common.close') || 'Close'}
              </button>
            )}
          </>
        ) : (
          <>
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
              marginBottom: '32px',
              minHeight: '20px'
            }}>
              {message || t('logs.updateInProgress')}
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
                backgroundColor: '#667eea',
                transition: 'width 0.3s ease',
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
          </>
        )}
      </div>
    </div>
  );
};
