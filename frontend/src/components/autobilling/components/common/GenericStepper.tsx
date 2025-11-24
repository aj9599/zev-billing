import { Check } from 'lucide-react';

interface GenericStepperProps {
  currentStep: number;
  steps: string[];
}

export default function GenericStepper({ currentStep, steps }: GenericStepperProps) {
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
                zIndex: 1
              }}>
                {currentStep > stepNumber ? <Check size={20} /> : stepNumber}
              </div>

              {/* Step Label */}
              <div style={{
                marginTop: '8px',
                fontSize: '11px',
                textAlign: 'center',
                fontWeight: currentStep === stepNumber ? '600' : 'normal',
                color: currentStep === stepNumber ? '#667EEA' : '#6c757d',
                lineHeight: '1.3'
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