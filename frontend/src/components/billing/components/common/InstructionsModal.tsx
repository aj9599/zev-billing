import { X, FileText } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from '../../../../i18n';

interface InstructionsModalProps {
  onClose: () => void;
}

/**
 * Instructions Modal Component
 * Displays billing module setup instructions
 * Features:
 * - ESC key to close
 * - Focus trap
 * - Accessible ARIA labels
 */
export default function InstructionsModal({ onClose }: InstructionsModalProps) {
  const { t } = useTranslation();
  const modalRef = useRef<HTMLDivElement>(null);

  // ESC key handler
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Focus modal on mount
  useEffect(() => {
    if (modalRef.current) {
      modalRef.current.focus();
    }
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="instructions-modal-title"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        padding: '20px'
      }}
      onClick={onClose}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '30px',
          maxWidth: '700px',
          maxHeight: '90vh',
          overflow: 'auto',
          width: '100%',
          outline: 'none'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px'
        }}>
          <h2 id="instructions-modal-title" style={{ fontSize: '24px', fontWeight: 'bold' }}>
            {t('billing.instructions.title')}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close instructions (ESC)"
            title="Close (ESC)"
            style={{
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              padding: '8px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <X size={24} aria-hidden="true" />
          </button>
        </div>

        <div style={{ lineHeight: '1.8', color: '#374151' }}>
          <div style={{
            backgroundColor: '#dbeafe',
            padding: '16px',
            borderRadius: '8px',
            marginBottom: '16px',
            border: '2px solid #3b82f6'
          }}>
            <h3 style={{
              fontSize: '18px',
              fontWeight: '600',
              marginBottom: '10px',
              color: '#1f2937',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <FileText size={20} color="#3b82f6" aria-hidden="true" />
              {t('billing.instructions.whatIsBilling')}
            </h3>
            <p>{t('billing.instructions.billingDescription')}</p>
          </div>

          <section aria-labelledby="how-billing-works">
            <h3 id="how-billing-works" style={{
              fontSize: '18px',
              fontWeight: '600',
              marginTop: '20px',
              marginBottom: '10px',
              color: '#1f2937'
            }}>
              {t('billing.instructions.howBillingWorks')}
            </h3>
            <ul style={{ marginLeft: '20px' }}>
              <li>{t('billing.instructions.work1')}</li>
              <li>{t('billing.instructions.work2')}</li>
              <li>{t('billing.instructions.work3')}</li>
              <li>{t('billing.instructions.work4')}</li>
            </ul>
          </section>

          <section aria-labelledby="how-to-use">
            <h3 id="how-to-use" style={{
              fontSize: '18px',
              fontWeight: '600',
              marginTop: '20px',
              marginBottom: '10px',
              color: '#1f2937'
            }}>
              {t('billing.instructions.howToUse')}
            </h3>
            <ul style={{ marginLeft: '20px' }}>
              <li>{t('billing.instructions.step1')}</li>
              <li>{t('billing.instructions.step2')}</li>
              <li>{t('billing.instructions.step3')}</li>
              <li>{t('billing.instructions.step4')}</li>
              <li>{t('billing.instructions.step5')}</li>
              <li>{t('billing.instructions.step6')}</li>
            </ul>
          </section>

          <div
            role="note"
            aria-label="Important information"
            style={{
              backgroundColor: '#fef3c7',
              padding: '16px',
              borderRadius: '8px',
              marginTop: '16px',
              border: '1px solid #f59e0b'
            }}
          >
            <h3 style={{
              fontSize: '16px',
              fontWeight: '600',
              marginBottom: '8px',
              color: '#1f2937'
            }}>
              {t('billing.instructions.important')}
            </h3>
            <ul style={{ marginLeft: '20px', fontSize: '14px' }}>
              <li>{t('billing.instructions.important1')}</li>
              <li>{t('billing.instructions.important2')}</li>
              <li>{t('billing.instructions.important3')}</li>
              <li>{t('billing.instructions.important4')}</li>
              <li><strong>{t('billing.instructions.important5')}</strong></li>
              <li><strong>{t('billing.instructions.important6')}</strong></li>
            </ul>
          </div>

          <div style={{
            backgroundColor: '#f0fdf4',
            padding: '16px',
            borderRadius: '8px',
            marginTop: '16px',
            border: '1px solid #10b981'
          }}>
            <h3 style={{
              fontSize: '16px',
              fontWeight: '600',
              marginBottom: '8px',
              color: '#1f2937'
            }}>
              {t('billing.instructions.invoiceContents')}
            </h3>
            <ul style={{ marginLeft: '20px', fontSize: '14px' }}>
              <li>{t('billing.instructions.invoice1')}</li>
              <li>{t('billing.instructions.invoice2')}</li>
              <li>{t('billing.instructions.invoice3')}</li>
              <li>{t('billing.instructions.invoice4')}</li>
              <li>{t('billing.instructions.invoice5')}</li>
            </ul>
          </div>

          <div style={{
            backgroundColor: '#fef3c7',
            padding: '16px',
            borderRadius: '8px',
            marginTop: '16px',
            border: '1px solid #f59e0b'
          }}>
            <h3 style={{
              fontSize: '16px',
              fontWeight: '600',
              marginBottom: '8px',
              color: '#1f2937'
            }}>
              {t('billing.instructions.tips')}
            </h3>
            <ul style={{ marginLeft: '20px', fontSize: '14px' }}>
              <li>{t('billing.instructions.tip1')}</li>
              <li>{t('billing.instructions.tip2')}</li>
              <li>{t('billing.instructions.tip3')}</li>
              <li>{t('billing.instructions.tip4')}</li>
              <li>{t('billing.instructions.tip5')}</li>
            </ul>
          </div>
        </div>

        <button
          onClick={onClose}
          aria-label="Close instructions"
          style={{
            width: '100%',
            marginTop: '24px',
            padding: '12px',
            backgroundColor: '#667EEA',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer',
            transition: 'background-color 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#5568d3'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#667EEA'}
        >
          {t('common.close')}
        </button>
      </div>
    </div>
  );
}