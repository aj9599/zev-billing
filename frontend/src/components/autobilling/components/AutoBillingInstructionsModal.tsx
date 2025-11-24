import { X, Calendar } from 'lucide-react';
import { useTranslation } from '../../../i18n';

interface AutoBillingInstructionsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AutoBillingInstructionsModal({
  isOpen,
  onClose
}: AutoBillingInstructionsModalProps) {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <div style={{
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
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '30px',
        maxWidth: '700px',
        maxHeight: '90vh',
        overflow: 'auto',
        width: '100%'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold' }}>{t('autoBilling.instructions.title')}</h2>
          <button 
            onClick={onClose}
            style={{ border: 'none', background: 'none', cursor: 'pointer' }}
          >
            <X size={24} />
          </button>
        </div>

        <div style={{ lineHeight: '1.8', color: '#374151' }}>
          {/* What is Auto Billing */}
          <div style={{ 
            backgroundColor: 'rgba(219, 234, 254, 0.5)', 
            padding: '16px', 
            borderRadius: '8px', 
            marginBottom: '16px', 
            border: '2px solid rgba(59, 130, 246, 0.3)' 
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
              <Calendar size={20} color="#3b82f6" />
              {t('autoBilling.instructions.whatIsAutoBilling')}
            </h3>
            <p>{t('autoBilling.instructions.autoBillingDescription')}</p>
          </div>

          {/* How It Works */}
          <h3 style={{ fontSize: '18px', fontWeight: '600', marginTop: '20px', marginBottom: '10px', color: '#1f2937' }}>
            {t('autoBilling.instructions.howItWorks')}
          </h3>
          <ul style={{ marginLeft: '20px' }}>
            <li>{t('autoBilling.instructions.work1')}</li>
            <li>{t('autoBilling.instructions.work2')}</li>
            <li>{t('autoBilling.instructions.work3')}</li>
            <li>{t('autoBilling.instructions.work4')}</li>
          </ul>

          {/* Frequencies */}
          <h3 style={{ fontSize: '18px', fontWeight: '600', marginTop: '20px', marginBottom: '10px', color: '#1f2937' }}>
            {t('autoBilling.instructions.frequencies')}
          </h3>
          <ul style={{ marginLeft: '20px' }}>
            <li><strong>{t('autoBilling.frequency.monthly')}:</strong> {t('autoBilling.instructions.freq1')}</li>
            <li><strong>{t('autoBilling.frequency.quarterly')}:</strong> {t('autoBilling.instructions.freq2')}</li>
            <li><strong>{t('autoBilling.frequency.half_yearly')}:</strong> {t('autoBilling.instructions.freq3')}</li>
            <li><strong>{t('autoBilling.frequency.yearly')}:</strong> {t('autoBilling.instructions.freq4')}</li>
          </ul>

          {/* How to Use */}
          <h3 style={{ fontSize: '18px', fontWeight: '600', marginTop: '20px', marginBottom: '10px', color: '#1f2937' }}>
            {t('autoBilling.instructions.howToUse')}
          </h3>
          <ul style={{ marginLeft: '20px' }}>
            <li>{t('autoBilling.instructions.step1')}</li>
            <li>{t('autoBilling.instructions.step2')}</li>
            <li>{t('autoBilling.instructions.step3')}</li>
            <li>{t('autoBilling.instructions.step4')}</li>
            <li>{t('autoBilling.instructions.step5')}</li>
          </ul>

          {/* Important Notes */}
          <div style={{ 
            backgroundColor: 'rgba(254, 243, 199, 0.5)', 
            padding: '16px', 
            borderRadius: '8px', 
            marginTop: '16px', 
            border: '1px solid rgba(245, 158, 11, 0.3)' 
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px', color: '#1f2937' }}>
              {t('autoBilling.instructions.important')}
            </h3>
            <ul style={{ marginLeft: '20px', fontSize: '14px' }}>
              <li>{t('autoBilling.instructions.important1')}</li>
              <li>{t('autoBilling.instructions.important2')}</li>
              <li>{t('autoBilling.instructions.important3')}</li>
              <li>{t('autoBilling.instructions.important4')}</li>
            </ul>
          </div>

          {/* Tips */}
          <div style={{ 
            backgroundColor: 'rgba(240, 253, 244, 0.5)', 
            padding: '16px', 
            borderRadius: '8px', 
            marginTop: '16px', 
            border: '1px solid rgba(16, 185, 129, 0.3)' 
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px', color: '#1f2937' }}>
              {t('autoBilling.instructions.tips')}
            </h3>
            <ul style={{ marginLeft: '20px', fontSize: '14px' }}>
              <li>{t('autoBilling.instructions.tip1')}</li>
              <li>{t('autoBilling.instructions.tip2')}</li>
              <li>{t('autoBilling.instructions.tip3')}</li>
              <li>{t('autoBilling.instructions.tip4')}</li>
            </ul>
          </div>
        </div>

        <button 
          onClick={onClose} 
          style={{
            width: '100%',
            marginTop: '24px',
            padding: '12px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer'
          }}
        >
          {t('common.close')}
        </button>
      </div>
    </div>
  );
}