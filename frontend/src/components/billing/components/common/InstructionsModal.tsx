import { X, FileText, AlertTriangle, Lightbulb, CheckCircle } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from '../../../../i18n';

interface InstructionsModalProps {
  onClose: () => void;
}

export default function InstructionsModal({ onClose }: InstructionsModalProps) {
  const { t } = useTranslation();
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  useEffect(() => {
    if (modalRef.current) modalRef.current.focus();
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="instructions-modal-title"
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.15)',
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
          borderRadius: '20px',
          maxWidth: '700px',
          maxHeight: '90vh',
          width: '100%',
          outline: 'none',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
          animation: 'bl-slideUp 0.3s ease-out'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '24px 28px 18px',
          borderBottom: '1px solid #f3f4f6',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '40px', height: '40px', borderRadius: '12px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <FileText size={20} color="white" />
            </div>
            <h2 id="instructions-modal-title" style={{ fontSize: '20px', fontWeight: '700', margin: 0, color: '#1f2937' }}>
              {t('billing.instructions.title')}
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              width: '36px', height: '36px', borderRadius: '10px', border: 'none',
              backgroundColor: '#f3f4f6', color: '#6b7280',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', transition: 'all 0.15s'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#e5e7eb'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#f3f4f6'; }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{
          padding: '20px 28px',
          overflowY: 'auto',
          flex: 1,
          lineHeight: '1.7',
          color: '#374151',
          backgroundColor: '#f9fafb'
        }}>
          {/* What is Billing */}
          <div style={{
            backgroundColor: 'white',
            padding: '18px',
            borderRadius: '12px',
            marginBottom: '14px',
            border: '1px solid #667eea20'
          }}>
            <h3 style={{
              fontSize: '15px', fontWeight: '600', marginBottom: '8px', color: '#1f2937',
              display: 'flex', alignItems: 'center', gap: '8px'
            }}>
              <FileText size={16} color="#667eea" />
              {t('billing.instructions.whatIsBilling')}
            </h3>
            <p style={{ fontSize: '14px', margin: 0 }}>{t('billing.instructions.billingDescription')}</p>
          </div>

          {/* How Billing Works */}
          <div style={{ backgroundColor: 'white', padding: '18px', borderRadius: '12px', marginBottom: '14px', border: '1px solid #e5e7eb' }}>
            <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '10px', color: '#1f2937' }}>
              {t('billing.instructions.howBillingWorks')}
            </h3>
            <ul style={{ marginLeft: '16px', fontSize: '14px', paddingLeft: '4px' }}>
              <li style={{ marginBottom: '4px' }}>{t('billing.instructions.work1')}</li>
              <li style={{ marginBottom: '4px' }}>{t('billing.instructions.work2')}</li>
              <li style={{ marginBottom: '4px' }}>{t('billing.instructions.work3')}</li>
              <li>{t('billing.instructions.work4')}</li>
            </ul>
          </div>

          {/* How to Use */}
          <div style={{ backgroundColor: 'white', padding: '18px', borderRadius: '12px', marginBottom: '14px', border: '1px solid #e5e7eb' }}>
            <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '10px', color: '#1f2937' }}>
              {t('billing.instructions.howToUse')}
            </h3>
            <ul style={{ marginLeft: '16px', fontSize: '14px', paddingLeft: '4px' }}>
              <li style={{ marginBottom: '4px' }}>{t('billing.instructions.step1')}</li>
              <li style={{ marginBottom: '4px' }}>{t('billing.instructions.step2')}</li>
              <li style={{ marginBottom: '4px' }}>{t('billing.instructions.step3')}</li>
              <li style={{ marginBottom: '4px' }}>{t('billing.instructions.step4')}</li>
              <li style={{ marginBottom: '4px' }}>{t('billing.instructions.step5')}</li>
              <li>{t('billing.instructions.step6')}</li>
            </ul>
          </div>

          {/* Important */}
          <div style={{
            backgroundColor: 'white', padding: '18px', borderRadius: '12px', marginBottom: '14px',
            border: '1px solid #f59e0b30'
          }}>
            <h3 style={{
              fontSize: '15px', fontWeight: '600', marginBottom: '10px', color: '#92400e',
              display: 'flex', alignItems: 'center', gap: '8px'
            }}>
              <AlertTriangle size={16} color="#f59e0b" />
              {t('billing.instructions.important')}
            </h3>
            <ul style={{ marginLeft: '16px', fontSize: '14px', paddingLeft: '4px' }}>
              <li style={{ marginBottom: '4px' }}>{t('billing.instructions.important1')}</li>
              <li style={{ marginBottom: '4px' }}>{t('billing.instructions.important2')}</li>
              <li style={{ marginBottom: '4px' }}>{t('billing.instructions.important3')}</li>
              <li style={{ marginBottom: '4px' }}>{t('billing.instructions.important4')}</li>
              <li style={{ marginBottom: '4px', fontWeight: '600' }}>{t('billing.instructions.important5')}</li>
              <li style={{ fontWeight: '600' }}>{t('billing.instructions.important6')}</li>
            </ul>
          </div>

          {/* Invoice Contents */}
          <div style={{
            backgroundColor: 'white', padding: '18px', borderRadius: '12px', marginBottom: '14px',
            border: '1px solid #10b98130'
          }}>
            <h3 style={{
              fontSize: '15px', fontWeight: '600', marginBottom: '10px', color: '#065f46',
              display: 'flex', alignItems: 'center', gap: '8px'
            }}>
              <CheckCircle size={16} color="#10b981" />
              {t('billing.instructions.invoiceContents')}
            </h3>
            <ul style={{ marginLeft: '16px', fontSize: '14px', paddingLeft: '4px' }}>
              <li style={{ marginBottom: '4px' }}>{t('billing.instructions.invoice1')}</li>
              <li style={{ marginBottom: '4px' }}>{t('billing.instructions.invoice2')}</li>
              <li style={{ marginBottom: '4px' }}>{t('billing.instructions.invoice3')}</li>
              <li style={{ marginBottom: '4px' }}>{t('billing.instructions.invoice4')}</li>
              <li>{t('billing.instructions.invoice5')}</li>
            </ul>
          </div>

          {/* Tips */}
          <div style={{
            backgroundColor: 'white', padding: '18px', borderRadius: '12px',
            border: '1px solid #667eea20'
          }}>
            <h3 style={{
              fontSize: '15px', fontWeight: '600', marginBottom: '10px', color: '#1f2937',
              display: 'flex', alignItems: 'center', gap: '8px'
            }}>
              <Lightbulb size={16} color="#667eea" />
              {t('billing.instructions.tips')}
            </h3>
            <ul style={{ marginLeft: '16px', fontSize: '14px', paddingLeft: '4px' }}>
              <li style={{ marginBottom: '4px' }}>{t('billing.instructions.tip1')}</li>
              <li style={{ marginBottom: '4px' }}>{t('billing.instructions.tip2')}</li>
              <li style={{ marginBottom: '4px' }}>{t('billing.instructions.tip3')}</li>
              <li style={{ marginBottom: '4px' }}>{t('billing.instructions.tip4')}</li>
              <li>{t('billing.instructions.tip5')}</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 28px 20px',
          borderTop: '1px solid #f3f4f6',
          flexShrink: 0
        }}>
          <button
            onClick={onClose}
            style={{
              width: '100%',
              padding: '12px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.15s',
              boxShadow: '0 2px 8px rgba(102, 126, 234, 0.35)'
            }}
          >
            {t('common.close')}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes bl-slideUp {
          from { opacity: 0; transform: translateY(12px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
