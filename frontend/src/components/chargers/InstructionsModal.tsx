import { X, Wifi, Radio, Settings, AlertCircle, Star } from 'lucide-react';

interface InstructionsModalProps {
  onClose: () => void;
  t: (key: string) => string;
}

export default function InstructionsModal({ onClose, t }: InstructionsModalProps) {
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
      <div className="modal-content instructions-modal" style={{
        backgroundColor: 'white', 
        borderRadius: '12px', 
        padding: '30px',
        maxWidth: '800px', 
        maxHeight: '90vh', 
        overflow: 'auto', 
        width: '100%'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold' }}>
            {t('chargers.instructions.title')}
          </h2>
          <button 
            onClick={onClose}
            style={{ border: 'none', background: 'none', cursor: 'pointer' }}
          >
            <X size={24} />
          </button>
        </div>

        <div style={{ lineHeight: '1.8', color: '#374151' }}>
          <h3 style={{ 
            fontSize: '18px', 
            fontWeight: '600', 
            marginTop: '20px', 
            marginBottom: '10px', 
            color: '#1f2937', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px' 
          }}>
            <Wifi size={20} color="#10b981" />
            {t('chargers.instructions.loxoneTitle')}
          </h3>
          <div style={{ 
            backgroundColor: '#d1fae5', 
            padding: '16px', 
            borderRadius: '8px', 
            marginBottom: '16px', 
            border: '2px solid #10b981' 
          }}>
            <p style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <Star size={16} fill="#fbbf24" color="#fbbf24" />
              <strong>{t('chargers.instructions.loxoneRecommended')}</strong>
            </p>

            <h4 style={{ fontSize: '15px', fontWeight: '600', marginTop: '16px', marginBottom: '8px' }}>
              {t('chargers.instructions.loxoneUuidTitle')}
            </h4>
            <p style={{ fontSize: '13px', marginBottom: '8px' }}>
              {t('chargers.instructions.loxoneChargerRequires')}
            </p>
            <ul style={{ marginLeft: '20px', marginBottom: '12px', fontSize: '13px' }}>
              <li><strong>{t('chargers.instructions.loxonePowerUuid')}</strong></li>
              <li><strong>{t('chargers.instructions.loxoneStateUuid')}</strong></li>
              <li><strong>{t('chargers.instructions.loxoneUserIdUuid')}</strong></li>
              <li><strong>{t('chargers.instructions.loxoneModeUuid')}</strong></li>
            </ul>

            <h4 style={{ fontSize: '15px', fontWeight: '600', marginTop: '16px', marginBottom: '8px' }}>
              {t('chargers.instructions.loxoneFindingUuid')}
            </h4>
            <ol style={{ marginLeft: '20px', marginBottom: '12px', fontSize: '13px' }}>
              <li>{t('chargers.instructions.loxoneUuidStep1')}</li>
              <li>{t('chargers.instructions.loxoneUuidStep2')}</li>
              <li>{t('chargers.instructions.loxoneUuidStep3')}</li>
              <li>{t('chargers.instructions.loxoneUuidStep4')}</li>
            </ol>

            <h4 style={{ fontSize: '15px', fontWeight: '600', marginTop: '16px', marginBottom: '8px' }}>
              {t('chargers.instructions.loxoneSetupTitle')}
            </h4>
            <ol style={{ marginLeft: '20px', marginTop: '10px', fontSize: '13px' }}>
              <li>{t('chargers.instructions.loxoneStep1')}</li>
              <li>{t('chargers.instructions.loxoneStep2')}</li>
              <li>{t('chargers.instructions.loxoneStep3')}</li>
              <li>{t('chargers.instructions.loxoneStep4')}</li>
              <li>{t('chargers.instructions.loxoneStep5')}</li>
            </ol>

            <div style={{ 
              backgroundColor: '#fff', 
              padding: '12px', 
              borderRadius: '6px', 
              marginTop: '10px', 
              fontFamily: 'monospace', 
              fontSize: '12px' 
            }}>
              <strong>{t('chargers.instructions.loxoneExample')}</strong><br />
              {t('chargers.instructions.loxoneExampleHost')}<br />
              {t('chargers.instructions.loxoneExampleUuids')}<br />
              {t('chargers.instructions.loxoneExampleCredentials')}<br /><br />
              <strong>{t('chargers.instructions.loxoneBenefits')}</strong><br />
              {t('chargers.instructions.loxoneBenefit1')}<br />
              {t('chargers.instructions.loxoneBenefit2')}<br />
              {t('chargers.instructions.loxoneBenefit3')}
            </div>
          </div>

          <h3 style={{ 
            fontSize: '18px', 
            fontWeight: '600', 
            marginTop: '20px', 
            marginBottom: '10px', 
            color: '#1f2937', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px' 
          }}>
            <Radio size={20} color="#f59e0b" />
            {t('chargers.instructions.udpTitle')}
          </h3>
          <div style={{ 
            backgroundColor: '#fef3c7', 
            padding: '16px', 
            borderRadius: '8px', 
            marginBottom: '16px', 
            border: '2px solid #f59e0b' 
          }}>
            <p style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={16} color="#f59e0b" />
              <strong>{t('chargers.instructions.udpDeprecated')}</strong>
            </p>
            <p style={{ marginTop: '10px', fontSize: '13px' }}>
              {t('chargers.instructions.udpDescription')}
            </p>
          </div>

          <h3 style={{ 
            fontSize: '18px', 
            fontWeight: '600', 
            marginTop: '20px', 
            marginBottom: '10px', 
            color: '#1f2937', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px' 
          }}>
            <Settings size={20} color="#6b7280" />
            {t('chargers.instructions.stateAndModeTitle')}
          </h3>
          <div style={{ 
            backgroundColor: '#f3f4f6', 
            padding: '16px', 
            borderRadius: '8px', 
            marginBottom: '16px' 
          }}>
            <p style={{ fontSize: '13px' }}>
              <strong>{t('chargers.instructions.stateModeDescription')}</strong>
            </p>
            <p style={{ marginTop: '10px', fontSize: '13px' }}>
              {t('chargers.instructions.stateModeInfo')}
            </p>
          </div>

          <h3 style={{ 
            fontSize: '18px', 
            fontWeight: '600', 
            marginTop: '20px', 
            marginBottom: '10px', 
            color: '#1f2937', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px' 
          }}>
            <AlertCircle size={20} color="#f59e0b" />
            {t('chargers.instructions.troubleshootingTitle')}
          </h3>
          <div style={{ 
            backgroundColor: '#fef3c7', 
            padding: '16px', 
            borderRadius: '8px', 
            border: '1px solid #f59e0b' 
          }}>
            <ul style={{ marginLeft: '20px', fontSize: '13px' }}>
              <li>
                <strong>Loxone WebSocket:</strong> {t('chargers.instructions.troubleshootingLoxoneWebSocket')}
              </li>
              <li>
                <strong>Loxone WebSocket:</strong> {t('chargers.instructions.troubleshootingLoxoneAuth')}
              </li>
              <li>
                <strong>Loxone WebSocket:</strong> {t('chargers.instructions.troubleshootingLoxoneUuids')}
              </li>
              <li>
                {t('chargers.instructions.troubleshootingService')} <code style={{ backgroundColor: '#fff', padding: '2px 6px', borderRadius: '4px' }}>sudo systemctl status zev-billing</code>
              </li>
              <li>
                {t('chargers.instructions.troubleshootingLogs')} <code style={{ backgroundColor: '#fff', padding: '2px 6px', borderRadius: '4px' }}>journalctl -u zev-billing -f</code>
              </li>
              <li>
                {t('chargers.instructions.troubleshootingNetwork')} <code style={{ backgroundColor: '#fff', padding: '2px 6px', borderRadius: '4px' }}>ping YOUR_LOXONE_IP</code>
              </li>
              <li>{t('chargers.instructions.troubleshootingMonitor')}</li>
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