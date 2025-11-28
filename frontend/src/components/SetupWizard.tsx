import { useState } from 'react';
import { CheckCircle, Upload, ExternalLink, Tablet, X } from 'lucide-react';
import { useTranslation } from '../i18n';

interface SetupWizardProps {
  onComplete: (config: { project_id: string; config_json: string; device_id: string }) => void;
  onCancel: () => void;
  existingConfig?: { project_id: string; config_json: string; device_id: string };
}

interface SetupStep {
  titleKey: string;
  descriptionKey: string;
  completed: boolean;
}

export default function SetupWizard({ onComplete, onCancel, existingConfig }: SetupWizardProps) {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(0);
  const [deviceId, setDeviceId] = useState(existingConfig?.device_id || '');
  const [firebaseConfig, setFirebaseConfig] = useState(existingConfig?.config_json || '');
  const [projectId, setProjectId] = useState(existingConfig?.project_id || '');

  const steps: SetupStep[] = [
    {
      titleKey: 'setupWizard.step1Title',
      descriptionKey: 'setupWizard.step1Description',
      completed: false
    },
    {
      titleKey: 'setupWizard.step2Title',
      descriptionKey: 'setupWizard.step2Description',
      completed: false
    },
    {
      titleKey: 'setupWizard.step3Title',
      descriptionKey: 'setupWizard.step3Description',
      completed: false
    },
    {
      titleKey: 'setupWizard.step4Title',
      descriptionKey: 'setupWizard.step4Description',
      completed: firebaseConfig !== '' && deviceId !== ''
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
    } catch (err) {
      alert(t('setupWizard.configParseFailed'));
    }
  };

  const handleComplete = () => {
    if (!firebaseConfig || !deviceId) {
      alert(t('setupWizard.completeAllFields'));
      return;
    }
    
    onComplete({
      project_id: projectId,
      config_json: firebaseConfig,
      device_id: deviceId
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
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      overflowY: 'auto'
    }}>
      <div style={{
        maxWidth: '900px',
        width: '100%',
        backgroundColor: 'white',
        borderRadius: '16px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        overflow: 'hidden',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          padding: '40px',
          color: 'white',
          textAlign: 'center',
          position: 'relative'
        }}>
          <button
            onClick={onCancel}
            style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              borderRadius: '50%',
              width: '36px',
              height: '36px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
          >
            <X size={20} color="white" />
          </button>
          
          <h1 style={{ fontSize: '32px', fontWeight: '700', margin: '0 0 12px 0' }}>
            {t('setupWizard.title')}
          </h1>
          <p style={{ fontSize: '16px', opacity: 0.9, margin: 0 }}>
            {t('setupWizard.subtitle')}
          </p>
        </div>

        {/* Progress Steps */}
        <div style={{
          padding: '30px 40px',
          borderBottom: '1px solid #e5e7eb'
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '20px'
          }}>
            {steps.map((step, index) => (
              <div
                key={index}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  cursor: 'pointer',
                  opacity: currentStep === index ? 1 : 0.5,
                  transition: 'opacity 0.3s'
                }}
                onClick={() => setCurrentStep(index)}
              >
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  backgroundColor: step.completed ? '#10b981' : currentStep === index ? '#667eea' : '#e5e7eb',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '12px',
                  fontSize: '20px',
                  fontWeight: '600'
                }}>
                  {step.completed ? <CheckCircle size={24} /> : index + 1}
                </div>
                <div style={{
                  fontSize: '12px',
                  fontWeight: '600',
                  textAlign: 'center',
                  color: currentStep === index ? '#667eea' : '#6b7280'
                }}>
                  {t(step.titleKey)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Step Content - Scrollable */}
        <div style={{ 
          padding: '40px',
          overflowY: 'auto',
          flex: 1
        }}>
          {/* Step 0: Create Firebase Project */}
          {currentStep === 0 && (
            <div>
              <h2 style={{ fontSize: '24px', fontWeight: '600', marginBottom: '16px', color: '#111827' }}>
                {t('setupWizard.step1Heading')}
              </h2>
              <p style={{ color: '#6b7280', marginBottom: '24px', lineHeight: '1.6' }}>
                {t('setupWizard.step1Text')}
              </p>

              <div style={{
                backgroundColor: '#f9fafb',
                border: '2px solid #e5e7eb',
                borderRadius: '12px',
                padding: '24px',
                marginBottom: '24px'
              }}>
                <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px', color: '#374151' }}>
                  {t('setupWizard.instructions')}
                </h3>
                <ol style={{ color: '#6b7280', paddingLeft: '20px', lineHeight: '2' }}>
                  <li>{t('setupWizard.step1Inst1')} <a href="https://console.firebase.google.com" target="_blank" rel="noopener noreferrer" style={{ color: '#667eea', textDecoration: 'none', fontWeight: '600' }}>Firebase Console <ExternalLink size={14} style={{ display: 'inline', marginLeft: '4px' }} /></a></li>
                  <li>{t('setupWizard.step1Inst2')}</li>
                  <li>{t('setupWizard.step1Inst3')}</li>
                  <li>{t('setupWizard.step1Inst4')}</li>
                  <li>{t('setupWizard.step1Inst5')}</li>
                </ol>
              </div>

              <div style={{
                backgroundColor: '#fef3c7',
                border: '2px solid #fbbf24',
                borderRadius: '12px',
                padding: '20px'
              }}>
                <p style={{ margin: 0, color: '#92400e', fontSize: '14px', lineHeight: '1.6' }}>
                  💡 <strong>{t('setupWizard.tip')}</strong> {t('setupWizard.step1Tip')}
                </p>
              </div>
            </div>
          )}

          {/* Step 1: Enable Services */}
          {currentStep === 1 && (
            <div>
              <h2 style={{ fontSize: '24px', fontWeight: '600', marginBottom: '16px', color: '#111827' }}>
                {t('setupWizard.step2Heading')}
              </h2>
              <p style={{ color: '#6b7280', marginBottom: '24px', lineHeight: '1.6' }}>
                {t('setupWizard.step2Text')}
              </p>

              <div style={{
                backgroundColor: '#f9fafb',
                border: '2px solid #e5e7eb',
                borderRadius: '12px',
                padding: '24px',
                marginBottom: '20px'
              }}>
                <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px', color: '#374151' }}>
                  {t('setupWizard.step2AuthHeading')}
                </h3>
                <ol style={{ color: '#6b7280', paddingLeft: '20px', lineHeight: '2', marginBottom: 0 }}>
                  <li>{t('setupWizard.step2AuthInst1')}</li>
                  <li>{t('setupWizard.step2AuthInst2')}</li>
                  <li>{t('setupWizard.step2AuthInst3')}</li>
                  <li>{t('setupWizard.step2AuthInst4')}</li>
                </ol>
              </div>

              <div style={{
                backgroundColor: '#f9fafb',
                border: '2px solid #e5e7eb',
                borderRadius: '12px',
                padding: '24px',
                marginBottom: '24px'
              }}>
                <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px', color: '#374151' }}>
                  {t('setupWizard.step2DbHeading')}
                </h3>
                <ol style={{ color: '#6b7280', paddingLeft: '20px', lineHeight: '2', marginBottom: 0 }}>
                  <li>{t('setupWizard.step2DbInst1')}</li>
                  <li>{t('setupWizard.step2DbInst2')}</li>
                  <li>{t('setupWizard.step2DbInst3')}</li>
                  <li>{t('setupWizard.step2DbInst4')}</li>
                  <li>{t('setupWizard.step2DbInst5')}</li>
                </ol>
              </div>

              <div style={{
                backgroundColor: '#dbeafe',
                border: '2px solid #3b82f6',
                borderRadius: '12px',
                padding: '20px'
              }}>
                <p style={{ margin: 0, color: '#1e40af', fontSize: '14px', lineHeight: '1.6' }}>
                  📌 <strong>{t('setupWizard.important')}</strong> {t('setupWizard.step2Important')}
                </p>
              </div>
            </div>
          )}

          {/* Step 2: Generate Service Account */}
          {currentStep === 2 && (
            <div>
              <h2 style={{ fontSize: '24px', fontWeight: '600', marginBottom: '16px', color: '#111827' }}>
                {t('setupWizard.step3Heading')}
              </h2>
              <p style={{ color: '#6b7280', marginBottom: '24px', lineHeight: '1.6' }}>
                {t('setupWizard.step3Text')}
              </p>

              <div style={{
                backgroundColor: '#f9fafb',
                border: '2px solid #e5e7eb',
                borderRadius: '12px',
                padding: '24px',
                marginBottom: '24px'
              }}>
                <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px', color: '#374151' }}>
                  {t('setupWizard.instructions')}
                </h3>
                <ol style={{ color: '#6b7280', paddingLeft: '20px', lineHeight: '2' }}>
                  <li>{t('setupWizard.step3Inst1')}</li>
                  <li>{t('setupWizard.step3Inst2')}</li>
                  <li>{t('setupWizard.step3Inst3')}</li>
                  <li>{t('setupWizard.step3Inst4')}</li>
                  <li>{t('setupWizard.step3Inst5')}</li>
                </ol>
              </div>

              <div style={{
                backgroundColor: '#fef2f2',
                border: '2px solid #ef4444',
                borderRadius: '12px',
                padding: '20px'
              }}>
                <p style={{ margin: 0, color: '#991b1b', fontSize: '14px', lineHeight: '1.6' }}>
                  🔒 <strong>{t('setupWizard.securityWarning')}</strong> {t('setupWizard.step3SecurityWarning')}
                </p>
              </div>
            </div>
          )}

          {/* Step 3: Configure Device */}
          {currentStep === 3 && (
            <div>
              <h2 style={{ fontSize: '24px', fontWeight: '600', marginBottom: '16px', color: '#111827' }}>
                {t('setupWizard.step4Heading')}
              </h2>
              <p style={{ color: '#6b7280', marginBottom: '24px', lineHeight: '1.6' }}>
                {t('setupWizard.step4Text')}
              </p>

              {/* Device ID */}
              <div style={{ marginBottom: '24px' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#374151'
                }}>
                  {t('setupWizard.deviceIdLabel')}
                </label>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <input
                    type="text"
                    value={deviceId}
                    onChange={(e) => setDeviceId(e.target.value)}
                    placeholder={t('setupWizard.deviceIdPlaceholder')}
                    style={{
                      flex: 1,
                      padding: '12px',
                      border: '2px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontFamily: 'inherit',
                      outline: 'none'
                    }}
                  />
                  <button
                    onClick={() => setDeviceId(generateDeviceId())}
                    style={{
                      padding: '12px 20px',
                      backgroundColor: '#667eea',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <Tablet size={16} />
                    {t('setupWizard.generate')}
                  </button>
                </div>
                <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '8px' }}>
                  {t('setupWizard.deviceIdHelp')}
                </p>
              </div>

              {/* Firebase Config Upload */}
              <div style={{ marginBottom: '24px' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#374151'
                }}>
                  {t('setupWizard.serviceAccountLabel')}
                </label>
                <label style={{
                  display: 'block',
                  padding: '40px',
                  border: '2px dashed #d1d5db',
                  borderRadius: '12px',
                  backgroundColor: firebaseConfig ? '#f0fdf4' : '#f9fafb',
                  borderColor: firebaseConfig ? '#10b981' : '#d1d5db',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}>
                  <Upload size={32} color={firebaseConfig ? '#10b981' : '#9ca3af'} style={{ marginBottom: '12px' }} />
                  <p style={{ 
                    color: firebaseConfig ? '#047857' : '#6b7280', 
                    fontSize: '14px', 
                    margin: '0 0 4px 0',
                    fontWeight: firebaseConfig ? '600' : '400'
                  }}>
                    {firebaseConfig ? t('setupWizard.configLoaded') : t('setupWizard.uploadPrompt')}
                  </p>
                  <p style={{ color: '#9ca3af', fontSize: '12px', margin: 0 }}>
                    {t('setupWizard.jsonFileHint')}
                  </p>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>

              {firebaseConfig && deviceId && (
                <div style={{
                  backgroundColor: '#d1fae5',
                  border: '2px solid #10b981',
                  borderRadius: '12px',
                  padding: '20px'
                }}>
                  <p style={{ margin: 0, color: '#065f46', fontSize: '14px', lineHeight: '1.6' }}>
                    ✓ <strong>{t('setupWizard.readyToComplete')}</strong> {t('setupWizard.readyToCompleteText')}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Navigation Buttons */}
          <div style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'space-between',
            marginTop: '32px',
            paddingTop: '24px',
            borderTop: '1px solid #e5e7eb'
          }}>
            <button
              onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
              disabled={currentStep === 0}
              style={{
                padding: '12px 24px',
                backgroundColor: currentStep === 0 ? '#f3f4f6' : 'white',
                color: currentStep === 0 ? '#9ca3af' : '#374151',
                border: '2px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: currentStep === 0 ? 'not-allowed' : 'pointer'
              }}
            >
              ← {t('setupWizard.previous')}
            </button>

            <div style={{ display: 'flex', gap: '12px' }}>
              {currentStep < 3 && (
                <button
                  onClick={() => setCurrentStep(Math.min(3, currentStep + 1))}
                  style={{
                    padding: '12px 24px',
                    backgroundColor: '#667eea',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  {t('setupWizard.next')} →
                </button>
              )}

              {currentStep === 3 && (
                <button
                  onClick={handleComplete}
                  disabled={!firebaseConfig || !deviceId}
                  style={{
                    padding: '12px 32px',
                    backgroundColor: (!firebaseConfig || !deviceId) ? '#9ca3af' : '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: (!firebaseConfig || !deviceId) ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <CheckCircle size={16} />
                  {t('setupWizard.completeSetup')}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Help Section */}
        <div style={{
          backgroundColor: '#f9fafb',
          padding: '20px 40px',
          borderTop: '1px solid #e5e7eb',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{ fontSize: '24px' }}>💬</div>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, color: '#6b7280', fontSize: '13px' }}>
              {t('setupWizard.helpText')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}