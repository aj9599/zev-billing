import { Trash2 } from 'lucide-react';
import { useTranslation } from '../../i18n';
import DeleteCaptcha from '../../components/DeleteCaptcha';
import { useState, useEffect } from 'react';

interface FactoryResetModalProps {
  show: boolean;
  factoryResetting: boolean;
  factoryCaptchaValid: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onValidationChange: (valid: boolean) => void;
}

export const FactoryResetModal = ({
  show,
  factoryResetting,
  factoryCaptchaValid,
  onClose,
  onConfirm,
  onValidationChange
}: FactoryResetModalProps) => {
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
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
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
        padding: isMobile ? '24px' : '32px',
        maxWidth: isMobile ? '100%' : '600px',
        width: '100%',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4)'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: isMobile ? '10px' : '12px',
          marginBottom: isMobile ? '20px' : '24px'
        }}>
          <div style={{
            padding: isMobile ? '10px' : '12px',
            borderRadius: isMobile ? '10px' : '12px',
            backgroundColor: '#dc2626',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Trash2 size={isMobile ? 24 : 28} color="white" />
          </div>
          <h2 style={{
            fontSize: isMobile ? '20px' : '24px',
            fontWeight: '700',
            margin: 0,
            color: '#1f2937'
          }}>
            {t('logs.factoryResetTitle')}
          </h2>
        </div>

        <div style={{
          padding: isMobile ? '14px' : '16px',
          backgroundColor: '#fee2e2',
          border: '2px solid #dc2626',
          borderRadius: isMobile ? '10px' : '12px',
          marginBottom: isMobile ? '20px' : '24px'
        }}>
          <p style={{
            fontSize: isMobile ? '13px' : '14px',
            color: '#991b1b',
            marginBottom: '12px',
            fontWeight: '600'
          }}>
            ⚠️ {t('logs.factoryResetWarning')}
          </p>
          <ul style={{
            fontSize: isMobile ? '12px' : '13px',
            color: '#7f1d1d',
            marginLeft: isMobile ? '16px' : '20px',
            marginBottom: 0,
            paddingLeft: '4px'
          }}>
            <li style={{ marginBottom: '4px' }}>{t('logs.factoryResetWarning1')}</li>
            <li style={{ marginBottom: '4px' }}>{t('logs.factoryResetWarning2')}</li>
            <li style={{ marginBottom: '4px' }}>{t('logs.factoryResetWarning3')}</li>
            <li>{t('logs.factoryResetWarning4')}</li>
          </ul>
        </div>

        <div style={{
          padding: isMobile ? '14px' : '16px',
          backgroundColor: '#dbeafe',
          border: '2px solid #3b82f6',
          borderRadius: isMobile ? '10px' : '12px',
          marginBottom: isMobile ? '20px' : '24px'
        }}>
          <p style={{
            fontSize: isMobile ? '12px' : '13px',
            color: '#1e40af',
            marginBottom: 0,
            fontWeight: '500'
          }}>
            ℹ️ {t('logs.factoryResetInfo')}
          </p>
        </div>

        <DeleteCaptcha onValidationChange={onValidationChange} />

        <div style={{
          display: 'flex',
          gap: isMobile ? '8px' : '12px',
          justifyContent: 'flex-end',
          marginTop: isMobile ? '20px' : '24px',
          flexDirection: isMobile ? 'column' : 'row'
        }}>
          <button
            onClick={onClose}
            disabled={factoryResetting}
            style={{
              padding: isMobile ? '12px 20px' : '12px 24px',
              backgroundColor: '#f3f4f6',
              color: '#4b5563',
              border: 'none',
              borderRadius: isMobile ? '8px' : '10px',
              fontSize: isMobile ? '13px' : '14px',
              fontWeight: '600',
              cursor: factoryResetting ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
              order: isMobile ? 2 : 1
            }}
          >
            {t('logs.cancel')}
          </button>
          <button
            onClick={onConfirm}
            disabled={factoryResetting || !factoryCaptchaValid}
            style={{
              padding: isMobile ? '12px 20px' : '12px 24px',
              backgroundColor: (factoryResetting || !factoryCaptchaValid) ? '#9ca3af' : '#dc2626',
              color: 'white',
              border: 'none',
              borderRadius: isMobile ? '8px' : '10px',
              fontSize: isMobile ? '13px' : '14px',
              fontWeight: '600',
              cursor: (factoryResetting || !factoryCaptchaValid) ? 'not-allowed' : 'pointer',
              boxShadow: (factoryResetting || !factoryCaptchaValid) ? 'none' : '0 4px 12px rgba(220, 38, 38, 0.3)',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              order: isMobile ? 1 : 2
            }}
          >
            <Trash2 size={16} />
            {factoryResetting ? t('logs.factoryResetting') : t('logs.factoryResetConfirm')}
          </button>
        </div>
      </div>
    </div>
  );
};