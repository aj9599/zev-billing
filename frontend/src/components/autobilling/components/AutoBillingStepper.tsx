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
      borderBottom: '1px solid #dee2e6',
      backgroundColor: '#f8f9fa'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative' }}>
        {steps.map((label, index) => {
          const stepNumber = index + 1;
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
                  top: '20px',
                  left: '50%',
                  right: '-50%',
                  height: '2px',
                  backgroundColor: currentStep > stepNumber ? '#28a745' : '#dee2e6',
                  zIndex: 0
                }} />
              )}

              {/* Step Circle */}
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                backgroundColor: currentStep >= stepNumber
                  ? (currentStep > stepNumber ? '#28a745' : '#667EEA')
                  : '#dee2e6',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold',
                position: 'relative',
                zIndex: 1,
                fontSize: '14px'
              }}>
                {currentStep > stepNumber ? <Check size={18} /> : stepNumber}
              </div>

              {/* Step Label */}
              <div style={{
                marginTop: '8px',
                fontSize: '10px',
                textAlign: 'center',
                fontWeight: currentStep === stepNumber ? '600' : 'normal',
                color: currentStep === stepNumber ? '#667EEA' : '#6c757d',
                lineHeight: '1.3',
                maxWidth: '80px'
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