import { Check } from 'lucide-react';
import { useTranslation } from '../../../i18n';

interface AutoBillingStepperProps {
  currentStep: number;
}

export default function AutoBillingStepper({ currentStep }: AutoBillingStepperProps) {
  const { t } = useTranslation();

  const steps = [
    t('autoBilling.step.selection'),
    t('autoBilling.step.schedule'),
    t('autoBilling.step.sharedMeters'),
    t('autoBilling.step.customItems'),
    t('autoBilling.step.sender'),
    t('autoBilling.step.banking'),
    t('autoBilling.step.review')
  ];

  const totalSteps = steps.length;

  return (
    <div style={{
      padding: '20px 30px',
      borderBottom: '1px solid #f3f4f6',
      backgroundColor: '#f9fafb'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative' }}>
        {steps.map((label, index) => {
          const stepNumber = index + 1;
          const isCompleted = currentStep > stepNumber;
          const isCurrent = currentStep === stepNumber;

          return (
            <div
              key={stepNumber}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                position: 'relative'
              }}
            >
              {/* Connection Line */}
              {stepNumber < totalSteps && (
                <div style={{
                  position: 'absolute',
                  top: '18px',
                  left: '50%',
                  right: '-50%',
                  height: '2px',
                  backgroundColor: isCompleted ? '#667eea' : '#e5e7eb',
                  zIndex: 0,
                  transition: 'background-color 0.3s'
                }} />
              )}

              {/* Step Circle */}
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: isCompleted
                  ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                  : isCurrent
                    ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                    : '#e5e7eb',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: '700',
                position: 'relative',
                zIndex: 1,
                fontSize: '13px',
                boxShadow: isCurrent ? '0 0 0 4px rgba(102, 126, 234, 0.2)' : 'none',
                transition: 'all 0.3s'
              }}>
                {isCompleted ? <Check size={16} /> : stepNumber}
              </div>

              {/* Step Label */}
              <div style={{
                marginTop: '8px',
                fontSize: '10px',
                textAlign: 'center',
                fontWeight: isCurrent ? '700' : '500',
                color: isCurrent ? '#667eea' : isCompleted ? '#667eea' : '#9ca3af',
                lineHeight: '1.3',
                maxWidth: '80px',
                transition: 'all 0.3s'
              }}>
                {label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
