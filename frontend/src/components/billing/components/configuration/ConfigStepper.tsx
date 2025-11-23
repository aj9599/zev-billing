import { Check } from 'lucide-react';
import { useTranslation } from '../../../../i18n';

interface ConfigStepperProps {
  currentStep: number;
  totalSteps: number;
}

export default function ConfigStepper({ currentStep, totalSteps }: ConfigStepperProps) {
  const { t } = useTranslation();

  const steps = [
    t('billConfig.steps.selection'),
    t('billConfig.steps.dates'),
    t('billConfig.steps.meters'),
    t('billConfig.steps.items'),
    t('billConfig.steps.review')
  ];

  return (
    <div style={{
      padding: '20px 30px',
      borderBottom: '1px solid #dee2e6',
      backgroundColor: '#f8f9fa'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative' }}>
        {Array.from({ length: totalSteps }, (_, i) => i + 1).map(step => (
          <div
            key={step}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              position: 'relative'
            }}
          >
            {/* Connection Line */}
            {step < totalSteps && (
              <div style={{
                position: 'absolute',
                top: '20px',
                left: '50%',
                right: '-50%',
                height: '2px',
                backgroundColor: currentStep > step ? '#28a745' : '#dee2e6',
                zIndex: 0
              }} />
            )}

            {/* Step Circle */}
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              backgroundColor: currentStep >= step 
                ? (currentStep > step ? '#28a745' : '#667EEA')
                : '#dee2e6',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              position: 'relative',
              zIndex: 1
            }}>
              {currentStep > step ? <Check size={20} /> : step}
            </div>

            {/* Step Label */}
            <div style={{
              marginTop: '8px',
              fontSize: '11px',
              textAlign: 'center',
              fontWeight: currentStep === step ? '600' : 'normal',
              color: currentStep === step ? '#667EEA' : '#6c757d',
              lineHeight: '1.3'
            }}>
              {steps[step - 1]}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}