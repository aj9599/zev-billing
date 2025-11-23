import { Trash2 } from 'lucide-react';
import { useTranslation } from '../../i18n';
import DeleteCaptcha from '../../components/DeleteCaptcha';

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
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '20px',
        padding: '32px',
        maxWidth: '600px',
        width: '100%',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4)'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '24px'
        }}>
          <div style={{
            padding: '12px',
            borderRadius: '12px',
            backgroundColor: '#dc2626',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Trash2 size={28} color="white" />
          </div>
          <h2 style={{
            fontSize: '24px',
            fontWeight: '700',
            margin: 0,
            color: '#1f2937'
          }}>
            {t('logs.factoryResetTitle')}
          </h2>
        </div>

        <div style={{
          padding: '16px',
          backgroundColor: '#fee2e2',
          border: '2px solid #dc2626',
          borderRadius: '12px',
          marginBottom: '24px'
        }}>
          <p style={{
            fontSize: '14px',
            color: '#991b1b',
            marginBottom: '12px',
            fontWeight: '600'
          }}>
            ⚠️ {t('logs.factoryResetWarning')}
          </p>
          <ul style={{
            fontSize: '13px',
            color: '#7f1d1d',
            marginLeft: '20px',
            marginBottom: 0
          }}>
            <li>{t('logs.factoryResetWarning1')}</li>
            <li>{t('logs.factoryResetWarning2')}</li>
            <li>{t('logs.factoryResetWarning3')}</li>
            <li>{t('logs.factoryResetWarning4')}</li>
          </ul>
        </div>

        <div style={{
          padding: '16px',
          backgroundColor: '#dbeafe',
          border: '2px solid #3b82f6',
          borderRadius: '12px',
          marginBottom: '24px'
        }}>
          <p style={{
            fontSize: '13px',
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
          gap: '12px',
          justifyContent: 'flex-end',
          marginTop: '24px'
        }}>
          <button
            onClick={onClose}
            disabled={factoryResetting}
            style={{
              padding: '12px 24px',
              backgroundColor: '#f3f4f6',
              color: '#4b5563',
              border: 'none',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: factoryResetting ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            {t('logs.cancel')}
          </button>
          <button
            onClick={onConfirm}
            disabled={factoryResetting || !factoryCaptchaValid}
            style={{
              padding: '12px 24px',
              backgroundColor: (factoryResetting || !factoryCaptchaValid) ? '#9ca3af' : '#dc2626',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: (factoryResetting || !factoryCaptchaValid) ? 'not-allowed' : 'pointer',
              boxShadow: (factoryResetting || !factoryCaptchaValid) ? 'none' : '0 4px 12px rgba(220, 38, 38, 0.3)',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
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