import { useState } from 'react';
import { CheckCircle, X, ExternalLink, Upload, Tablet } from 'lucide-react';
import { useTranslation } from '../i18n';

interface SetupWizardProps {
  onComplete: (config: { device_id: string; firebase_config: string; project_id: string }) => void;
  onCancel: () => void;
  existingConfig?: {
    device_id: string;
    project_id: string;
    config_json: string;
  };
}

export default function SetupWizard({ onComplete, onCancel, existingConfig }: SetupWizardProps) {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(0);
  const [deviceId, setDeviceId] = useState(existingConfig?.device_id || '');
  const [firebaseConfig, setFirebaseConfig] = useState(existingConfig?.config_json || '');
  const [projectId, setProjectId] = useState(existingConfig?.project_id || '');

  const steps = [
    {
      titleKey: 'setupWizard.step1Title',
      descKey: 'setupWizard.step1Description',
      completed: currentStep > 0
    },
    {
      titleKey: 'setupWizard.step2Title',
      descKey: 'setupWizard.step2Description',
      completed: currentStep > 1
    },
    {
      titleKey: 'setupWizard.step3Title',
      descKey: 'setupWizard.step3Description',
      completed: currentStep > 2
    },
    {
      titleKey: 'setupWizard.step4Title',
      descKey: 'setupWizard.step4Description',
      completed: deviceId && firebaseConfig
    }
  ];

  const generateDeviceId = () => {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 7);
    return `rpi_${timestamp}_${random}`;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const config = JSON.parse(text);

      if (!config.project_id || !config.private_key || !config.client_email) {
        alert(t('setupWizard.invalidConfig'));
        return;
      }

      setFirebaseConfig(text);
      setProjectId(config.project_id);
      alert(t('setupWizard.configLoaded'));
    } catch (err) {
      console.error('Failed to parse Firebase config:', err);
      alert(t('setupWizard.configParseFailed'));
    }
  };

  const handleComplete = () => {
    if (!deviceId || !firebaseConfig) {
      alert(t('setupWizard.completeAllFields'));
      return;
    }

    onComplete({
      device_id: deviceId,
      firebase_config: firebaseConfig,
      project_id: projectId
    });
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 9999,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      backdropFilter: 'blur(4px)'
    }}>
      <div style={{
        maxWidth: '900px',
        width: '100%',
        backgroundColor: 'white',
        borderRadius: '12px',
        boxShadow: '0 25px 50px rgba(0,0,0,0.15)',
        overflow: 'hidden',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid #e5e7eb'
      }}>
        {/* Header */}
        <div style={{
          backgroundColor: '#f9fafb',
          borderBottom: '1px solid #e5e7eb',
          padding: '32px 40px',
          position: 'relative'
        }}>
          <button
            onClick={onCancel}
            style={{
              position: 'absolute',
              top: '24px',
              right: '24px',
              background: 'white',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              width: '32px',
              height: '32px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#f3f4f6';
              e.currentTarget.style.borderColor = '#9ca3af';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'white';
              e.currentTarget.style.borderColor = '#d1d5db';
            }}
          >
            <X size={18} color="#6b7280" />
          </button>
          
          <h1 style={{ fontSize: '28px', fontWeight: '600', margin: '0 0 8px 0', color: '#111827' }}>
            {t('setupWizard.title')}
          </h1>
          <p style={{ fontSize: '15px', margin: 0, color: '#6b7280' }}>
            {t('setupWizard.subtitle')}
          </p>
        </div>

        {/* Progress Steps */}
        <div style={{
          padding: '24px 40px',
          backgroundColor: 'white',
          borderBottom: '1px solid #e5e7eb'
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '16px'
          }}>
            {steps.map((step, index) => (
              <div
                key={index}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  cursor: 'pointer',
                  opacity: currentStep === index ? 1 : 0.6,
                  transition: 'opacity 0.2s'
                }}
                onClick={() => setCurrentStep(index)}
              >
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  backgroundColor: step.completed ? '#10b981' : currentStep === index ? '#3b82f6' : '#e5e7eb',
                  color: step.completed || currentStep === index ? 'white' : '#9ca3af',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '10px',
                  fontSize: '16px',
                  fontWeight: '600',
                  border: currentStep === index ? '2px solid #3b82f6' : 'none',
                  boxShadow: currentStep === index ? '0 0 0 3px rgba(59, 130, 246, 0.1)' : 'none'
                }}>
                  {step.completed ? <CheckCircle size={20} /> : index + 1}
                </div>
                <div style={{
                  fontSize: '11px',
                  fontWeight: '600',
                  textAlign: 'center',
                  color: currentStep === index ? '#111827' : '#6b7280',
                  lineHeight: '1.3'
                }}>
                  {t(step.titleKey)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{
          padding: '40px',
          overflowY: 'auto',
          flex: 1
        }}>
          {/* Step 1: Create Firebase Project */}
          {currentStep === 0 && (
            <div>
              <h2 style={{ fontSize: '22px', fontWeight: '600', marginBottom: '12px', color: '#111827' }}>
                {t('setupWizard.step1Heading')}
              </h2>
              <p style={{ fontSize: '15px', color: '#6b7280', marginBottom: '24px' }}>
                {t('setupWizard.step1Text')}
              </p>

              <div style={{
                backgroundColor: '#f9fafb',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '20px',
                marginBottom: '20px'
              }}>
                <div style={{ fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '12px' }}>
                  {t('setupWizard.instructions')}
                </div>
                <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '14px', color: '#4b5563', lineHeight: '1.8' }}>
                  <li>
                    {t('setupWizard.step1Inst1')}{' '}
                    <a
                      href="https://console.firebase.google.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#3b82f6', textDecoration: 'none', fontWeight: '500' }}
                    >
                      console.firebase.google.com <ExternalLink size={12} style={{ display: 'inline', marginLeft: '2px' }} />
                    </a>
                  </li>
                  <li>{t('setupWizard.step1Inst2')}</li>
                  <li>{t('setupWizard.step1Inst3')}</li>
                  <li>{t('setupWizard.step1Inst4')}</li>
                  <li>{t('setupWizard.step1Inst5')}</li>
                </ol>
              </div>

              <div style={{
                backgroundColor: '#fef3c7',
                border: '1px solid #fbbf24',
                borderRadius: '8px',
                padding: '16px',
                fontSize: '14px',
                color: '#92400e'
              }}>
                <strong style={{ display: 'block', marginBottom: '4px' }}>💡 {t('setupWizard.tip')}</strong>
                {t('setupWizard.step1Tip')}
              </div>
            </div>
          )}

          {/* Step 2: Enable Services */}
          {currentStep === 1 && (
            <div>
              <h2 style={{ fontSize: '22px', fontWeight: '600', marginBottom: '12px', color: '#111827' }}>
                {t('setupWizard.step2Heading')}
              </h2>
              <p style={{ fontSize: '15px', color: '#6b7280', marginBottom: '24px' }}>
                {t('setupWizard.step2Text')}
              </p>

              <div style={{
                backgroundColor: '#f9fafb',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '20px',
                marginBottom: '16px'
              }}>
                <div style={{ fontSize: '15px', fontWeight: '600', color: '#111827', marginBottom: '12px' }}>
                  {t('setupWizard.step2AuthHeading')}
                </div>
                <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '14px', color: '#4b5563', lineHeight: '1.8' }}>
                  <li>{t('setupWizard.step2AuthInst1')}</li>
                  <li>{t('setupWizard.step2AuthInst2')}</li>
                  <li>{t('setupWizard.step2AuthInst3')}</li>
                  <li>{t('setupWizard.step2AuthInst4')}</li>
                </ol>
              </div>

              <div style={{
                backgroundColor: '#f9fafb',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '20px',
                marginBottom: '20px'
              }}>
                <div style={{ fontSize: '15px', fontWeight: '600', color: '#111827', marginBottom: '12px' }}>
                  {t('setupWizard.step2DbHeading')}
                </div>
                <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '14px', color: '#4b5563', lineHeight: '1.8' }}>
                  <li>{t('setupWizard.step2DbInst1')}</li>
                  <li>{t('setupWizard.step2DbInst2')}</li>
                  <li>{t('setupWizard.step2DbInst3')}</li>
                  <li>{t('setupWizard.step2DbInst4')}</li>
                  <li>{t('setupWizard.step2DbInst5')}</li>
                </ol>
              </div>

              <div style={{
                backgroundColor: '#dbeafe',
                border: '1px solid #3b82f6',
                borderRadius: '8px',
                padding: '16px',
                fontSize: '14px',
                color: '#1e40af'
              }}>
                <strong style={{ display: 'block', marginBottom: '4px' }}>📌 {t('setupWizard.important')}</strong>
                {t('setupWizard.step2Important')}
              </div>
            </div>
          )}

          {/* Step 3: Download Service Account Key */}
          {currentStep === 2 && (
            <div>
              <h2 style={{ fontSize: '22px', fontWeight: '600', marginBottom: '12px', color: '#111827' }}>
                {t('setupWizard.step3Heading')}
              </h2>
              <p style={{ fontSize: '15px', color: '#6b7280', marginBottom: '24px' }}>
                {t('setupWizard.step3Text')}
              </p>

              <div style={{
                backgroundColor: '#f9fafb',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '20px',
                marginBottom: '20px'
              }}>
                <div style={{ fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '12px' }}>
                  {t('setupWizard.instructions')}
                </div>
                <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '14px', color: '#4b5563', lineHeight: '1.8' }}>
                  <li>{t('setupWizard.step3Inst1')}</li>
                  <li>{t('setupWizard.step3Inst2')}</li>
                  <li>{t('setupWizard.step3Inst3')}</li>
                  <li>{t('setupWizard.step3Inst4')}</li>
                  <li>{t('setupWizard.step3Inst5')}</li>
                </ol>
              </div>

              <div style={{
                backgroundColor: '#fee2e2',
                border: '1px solid #ef4444',
                borderRadius: '8px',
                padding: '16px',
                fontSize: '14px',
                color: '#991b1b'
              }}>
                <strong style={{ display: 'block', marginBottom: '4px' }}>🔒 {t('setupWizard.securityWarning')}</strong>
                {t('setupWizard.step3SecurityWarning')}
              </div>
            </div>
          )}

          {/* Step 4: Configure Device */}
          {currentStep === 3 && (
            <div>
              <h2 style={{ fontSize: '22px', fontWeight: '600', marginBottom: '12px', color: '#111827' }}>
                {t('setupWizard.step4Heading')}
              </h2>
              <p style={{ fontSize: '15px', color: '#6b7280', marginBottom: '24px' }}>
                {t('setupWizard.step4Text')}
              </p>

              {/* Device ID Input */}
              <div style={{ marginBottom: '24px' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#374151'
                }}>
                  {t('setupWizard.deviceIdLabel')} *
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    required
                    value={deviceId}
                    onChange={(e) => setDeviceId(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontFamily: 'inherit',
                      outline: 'none',
                      transition: 'border-color 0.2s'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                    onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
                    placeholder={t('setupWizard.deviceIdPlaceholder')}
                  />
                  <button
                    type="button"
                    onClick={() => setDeviceId(generateDeviceId())}
                    style={{
                      padding: '10px 18px',
                      backgroundColor: '#3b82f6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    <Tablet size={16} />
                    {t('setupWizard.generate')}
                  </button>
                </div>
                <p style={{ fontSize: '12px', color: '#6b7280', margin: '6px 0 0 0' }}>
                  {t('setupWizard.deviceIdHelp')}
                </p>
              </div>

              {/* Firebase Config Upload */}
              <div style={{ marginBottom: '24px' }}>
                <label style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  cursor: 'pointer'
                }}>
                  <span style={{ fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                    {t('setupWizard.serviceAccountLabel')} *
                  </span>
                  <div style={{
                    padding: '32px',
                    border: firebaseConfig ? '2px solid #10b981' : '2px dashed #d1d5db',
                    borderRadius: '8px',
                    backgroundColor: firebaseConfig ? '#ecfdf5' : 'white',
                    textAlign: 'center',
                    transition: 'all 0.2s ease',
                    cursor: 'pointer'
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.currentTarget.style.borderColor = '#3b82f6';
                    e.currentTarget.style.backgroundColor = '#eff6ff';
                  }}
                  onDragLeave={(e) => {
                    e.currentTarget.style.borderColor = firebaseConfig ? '#10b981' : '#d1d5db';
                    e.currentTarget.style.backgroundColor = firebaseConfig ? '#ecfdf5' : 'white';
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.style.borderColor = firebaseConfig ? '#10b981' : '#d1d5db';
                    e.currentTarget.style.backgroundColor = firebaseConfig ? '#ecfdf5' : 'white';
                    const file = e.dataTransfer.files[0];
                    if (file) {
                      const input = document.getElementById('firebase-config-input') as HTMLInputElement;
                      const dataTransfer = new DataTransfer();
                      dataTransfer.items.add(file);
                      input.files = dataTransfer.files;
                      handleFileUpload({ target: input } as any);
                    }
                  }}
                  >
                    <Upload size={32} color={firebaseConfig ? '#10b981' : '#9ca3af'} style={{ marginBottom: '8px' }} />
                    <p style={{ color: firebaseConfig ? '#059669' : '#6b7280', fontSize: '14px', margin: 0, fontWeight: '500' }}>
                      {firebaseConfig ? t('setupWizard.configLoaded') : t('setupWizard.uploadPrompt')}
                    </p>
                    <p style={{ color: '#9ca3af', fontSize: '12px', margin: '4px 0 0 0' }}>
                      {t('setupWizard.jsonFileHint')}
                    </p>
                  </div>
                  <input
                    id="firebase-config-input"
                    type="file"
                    accept=".json"
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>

              {/* Ready to Complete */}
              {deviceId && firebaseConfig && (
                <div style={{
                  backgroundColor: '#ecfdf5',
                  border: '1px solid #10b981',
                  borderRadius: '8px',
                  padding: '16px',
                  fontSize: '14px',
                  color: '#065f46'
                }}>
                  <strong style={{ display: 'block', marginBottom: '4px' }}>✓ {t('setupWizard.readyToComplete')}</strong>
                  {t('setupWizard.readyToCompleteText')}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          backgroundColor: '#f9fafb',
          borderTop: '1px solid #e5e7eb',
          padding: '20px 40px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ fontSize: '13px', color: '#6b7280' }}>
            {t('setupWizard.helpText')}
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            {currentStep > 0 && (
              <button
                onClick={() => setCurrentStep(currentStep - 1)}
                style={{
                  padding: '10px 20px',
                  backgroundColor: 'white',
                  color: '#374151',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
              >
                {t('setupWizard.previous')}
              </button>
            )}

            {currentStep < 3 ? (
              <button
                onClick={() => setCurrentStep(currentStep + 1)}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#3b82f6'}
              >
                {t('setupWizard.next')}
              </button>
            ) : (
              <button
                onClick={handleComplete}
                disabled={!deviceId || !firebaseConfig}
                style={{
                  padding: '10px 20px',
                  backgroundColor: deviceId && firebaseConfig ? '#10b981' : '#d1d5db',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: deviceId && firebaseConfig ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => {
                  if (deviceId && firebaseConfig) {
                    e.currentTarget.style.backgroundColor = '#059669';
                  }
                }}
                onMouseLeave={(e) => {
                  if (deviceId && firebaseConfig) {
                    e.currentTarget.style.backgroundColor = '#10b981';
                  }
                }}
              >
                <CheckCircle size={16} />
                {t('setupWizard.completeSetup')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}