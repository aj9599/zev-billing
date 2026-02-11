import { X, Calendar, Lightbulb, AlertTriangle, CheckCircle } from 'lucide-react';
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

  const sections = [
    {
      icon: <Calendar size={18} color="#3b82f6" />,
      iconBg: 'rgba(59, 130, 246, 0.1)',
      title: t('autoBilling.instructions.whatIsAutoBilling'),
      content: <p style={{ margin: 0 }}>{t('autoBilling.instructions.autoBillingDescription')}</p>
    },
    {
      icon: <Lightbulb size={18} color="#667eea" />,
      iconBg: '#667eea15',
      title: t('autoBilling.instructions.howItWorks'),
      content: (
        <ul style={{ margin: 0, paddingLeft: '16px', lineHeight: '1.8' }}>
          <li>{t('autoBilling.instructions.work1')}</li>
          <li>{t('autoBilling.instructions.work2')}</li>
          <li>{t('autoBilling.instructions.work3')}</li>
          <li>{t('autoBilling.instructions.work4')}</li>
        </ul>
      )
    },
    {
      icon: <Calendar size={18} color="#f59e0b" />,
      iconBg: 'rgba(245, 158, 11, 0.1)',
      title: t('autoBilling.instructions.frequencies'),
      content: (
        <ul style={{ margin: 0, paddingLeft: '16px', lineHeight: '1.8' }}>
          <li><strong>{t('autoBilling.frequency.monthly')}:</strong> {t('autoBilling.instructions.freq1')}</li>
          <li><strong>{t('autoBilling.frequency.quarterly')}:</strong> {t('autoBilling.instructions.freq2')}</li>
          <li><strong>{t('autoBilling.frequency.half_yearly')}:</strong> {t('autoBilling.instructions.freq3')}</li>
          <li><strong>{t('autoBilling.frequency.yearly')}:</strong> {t('autoBilling.instructions.freq4')}</li>
        </ul>
      )
    },
    {
      icon: <CheckCircle size={18} color="#10b981" />,
      iconBg: 'rgba(16, 185, 129, 0.1)',
      title: t('autoBilling.instructions.howToUse'),
      content: (
        <ul style={{ margin: 0, paddingLeft: '16px', lineHeight: '1.8' }}>
          <li>{t('autoBilling.instructions.step1')}</li>
          <li>{t('autoBilling.instructions.step2')}</li>
          <li>{t('autoBilling.instructions.step3')}</li>
          <li>{t('autoBilling.instructions.step4')}</li>
          <li>{t('autoBilling.instructions.step5')}</li>
        </ul>
      )
    },
    {
      icon: <AlertTriangle size={18} color="#f59e0b" />,
      iconBg: 'rgba(245, 158, 11, 0.1)',
      title: t('autoBilling.instructions.important'),
      content: (
        <ul style={{ margin: 0, paddingLeft: '16px', lineHeight: '1.8' }}>
          <li>{t('autoBilling.instructions.important1')}</li>
          <li>{t('autoBilling.instructions.important2')}</li>
          <li>{t('autoBilling.instructions.important3')}</li>
          <li>{t('autoBilling.instructions.important4')}</li>
        </ul>
      )
    },
    {
      icon: <Lightbulb size={18} color="#667eea" />,
      iconBg: '#667eea15',
      title: t('autoBilling.instructions.tips'),
      content: (
        <ul style={{ margin: 0, paddingLeft: '16px', lineHeight: '1.8' }}>
          <li>{t('autoBilling.instructions.tip1')}</li>
          <li>{t('autoBilling.instructions.tip2')}</li>
          <li>{t('autoBilling.instructions.tip3')}</li>
          <li>{t('autoBilling.instructions.tip4')}</li>
        </ul>
      )
    }
  ];

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.15)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2000,
      padding: '20px',
      animation: 'abi-fadeIn 0.2s ease-out'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '20px',
        maxWidth: '700px',
        maxHeight: '90vh',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
        animation: 'abi-slideUp 0.3s ease-out',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #f3f4f6',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '10px',
              backgroundColor: '#667eea15',
              color: '#667eea',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Calendar size={18} />
            </div>
            <h2 style={{ fontSize: '18px', fontWeight: '700', margin: 0, color: '#1f2937' }}>
              {t('autoBilling.instructions.title')}
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              width: '32px', height: '32px', borderRadius: '8px',
              border: 'none', backgroundColor: '#f3f4f6', color: '#6b7280',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#e5e7eb'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#f3f4f6'; }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{
          padding: '24px',
          overflowY: 'auto',
          flex: 1,
          backgroundColor: '#f9fafb'
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {sections.map((section, index) => (
              <div key={index} style={{
                backgroundColor: 'white',
                borderRadius: '12px',
                border: '1px solid #e5e7eb',
                padding: '16px',
                animation: `abi-fadeSlideIn 0.3s ease-out ${index * 0.05}s both`
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '8px',
                    backgroundColor: section.iconBg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                  }}>
                    {section.icon}
                  </div>
                  <h3 style={{ fontSize: '15px', fontWeight: '700', margin: 0, color: '#1f2937' }}>
                    {section.title}
                  </h3>
                </div>
                <div style={{ fontSize: '13px', color: '#4b5563', lineHeight: '1.6', paddingLeft: '42px' }}>
                  {section.content}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid #f3f4f6',
          flexShrink: 0,
          backgroundColor: 'white'
        }}>
          <button
            onClick={onClose}
            style={{
              width: '100%',
              padding: '10px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: '0 2px 8px rgba(102, 126, 234, 0.35)'
            }}
          >
            {t('common.close')}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes abi-fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes abi-slideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes abi-fadeSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
