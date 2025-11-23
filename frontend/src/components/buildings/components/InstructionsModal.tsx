import { X, Home, Folder, Building, Sun } from 'lucide-react';
import { useTranslation } from '../../../i18n';

interface InstructionsModalProps {
  onClose: () => void;
  isMobile: boolean;
}

export default function InstructionsModal({ onClose, isMobile }: InstructionsModalProps) {
  const { t } = useTranslation();

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
        padding: isMobile ? '20px' : '30px',
        maxWidth: '700px',
        maxHeight: '90vh',
        overflow: 'auto',
        width: '100%'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px'
        }}>
          <h2 style={{
            fontSize: isMobile ? '20px' : '24px',
            fontWeight: 'bold'
          }}>
            {t('buildings.instructions.title')}
          </h2>
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: 'none',
              cursor: 'pointer'
            }}
          >
            <X size={24} />
          </button>
        </div>

        <div style={{
          lineHeight: '1.8',
          color: '#374151',
          fontSize: isMobile ? '14px' : '16px'
        }}>
          <div style={{
            backgroundColor: '#dbeafe',
            padding: '16px',
            borderRadius: '8px',
            marginBottom: '16px',
            border: '2px solid #3b82f6'
          }}>
            <h3 style={{
              fontSize: isMobile ? '16px' : '18px',
              fontWeight: '600',
              marginBottom: '10px',
              color: '#1f2937',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <Home size={20} color="#3b82f6" />
              {t('buildings.instructions.whatIsBuilding')}
            </h3>
            <p style={{ fontSize: isMobile ? '13px' : '15px' }}>
              {t('buildings.instructions.buildingDescription')}
            </p>
          </div>

          <div style={{
            backgroundColor: '#f3e5f5',
            padding: '16px',
            borderRadius: '8px',
            marginBottom: '16px',
            border: '2px solid #7b1fa2'
          }}>
            <h3 style={{
              fontSize: isMobile ? '16px' : '18px',
              fontWeight: '600',
              marginBottom: '10px',
              color: '#1f2937',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <Folder size={20} color="#7b1fa2" />
              {t('buildings.instructions.whatIsComplex')}
            </h3>
            <p style={{ fontSize: isMobile ? '13px' : '15px' }}>
              {t('buildings.instructions.complexDescription')}
            </p>
          </div>

          <div style={{
            backgroundColor: '#fef3c7',
            padding: '16px',
            borderRadius: '8px',
            marginBottom: '16px',
            border: '2px solid #f59e0b'
          }}>
            <h3 style={{
              fontSize: isMobile ? '16px' : '18px',
              fontWeight: '600',
              marginBottom: '10px',
              color: '#1f2937',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <Building size={20} color="#f59e0b" />
              {t('buildings.instructions.apartmentTitle')}
            </h3>
            <p style={{ fontSize: isMobile ? '13px' : '15px' }}>
              {t('buildings.instructions.apartmentDescription')}
            </p>
          </div>

          <div style={{
            backgroundColor: '#ecfdf5',
            padding: '16px',
            borderRadius: '8px',
            marginBottom: '16px',
            border: '2px solid #22c55e'
          }}>
            <h3 style={{
              fontSize: isMobile ? '16px' : '18px',
              fontWeight: '600',
              marginBottom: '10px',
              color: '#1f2937',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <Sun size={20} color="#22c55e" />
              {t('buildings.instructions.energyFlowTitle')}
            </h3>
            <p style={{ fontSize: isMobile ? '13px' : '15px' }}>
              {t('buildings.instructions.energyFlowDescription')}
            </p>
          </div>

          <h3 style={{
            fontSize: isMobile ? '16px' : '18px',
            fontWeight: '600',
            marginTop: '20px',
            marginBottom: '10px',
            color: '#1f2937'
          }}>
            {t('buildings.instructions.howToUse')}
          </h3>
          <ul style={{
            marginLeft: '20px',
            fontSize: isMobile ? '13px' : '14px'
          }}>
            <li>{t('buildings.instructions.step1')}</li>
            <li>{t('buildings.instructions.step2')}</li>
            <li>{t('buildings.instructions.step3')}</li>
            <li>{t('buildings.instructions.step4')}</li>
            <li>{t('buildings.instructions.step5')}</li>
            <li>{t('buildings.instructions.step6')}</li>
          </ul>

          <div style={{
            backgroundColor: '#fef3c7',
            padding: '16px',
            borderRadius: '8px',
            marginTop: '16px',
            border: '1px solid #f59e0b'
          }}>
            <h3 style={{
              fontSize: isMobile ? '14px' : '16px',
              fontWeight: '600',
              marginBottom: '8px',
              color: '#1f2937'
            }}>
              {t('buildings.instructions.tips')}
            </h3>
            <ul style={{
              marginLeft: '20px',
              fontSize: isMobile ? '12px' : '14px'
            }}>
              <li>{t('buildings.instructions.tip1')}</li>
              <li>{t('buildings.instructions.tip2')}</li>
              <li>{t('buildings.instructions.tip3')}</li>
              <li>{t('buildings.instructions.tip4')}</li>
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