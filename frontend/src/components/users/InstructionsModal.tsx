import { X, UsersIcon, User, Home } from 'lucide-react';

interface InstructionsModalProps {
  onClose: () => void;
  t: (key: string) => string;
}

export default function InstructionsModal({ onClose, t }: InstructionsModalProps) {
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', zIndex: 2000, padding: '20px'
    }}>
      <div style={{
        backgroundColor: 'white', borderRadius: '12px', padding: '30px',
        maxWidth: '700px', maxHeight: '90vh', overflow: 'auto', width: '100%'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold' }}>{t('users.instructions.title')}</h2>
          <button onClick={onClose}
            style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        <div style={{ lineHeight: '1.8', color: '#374151' }}>
          <div style={{ backgroundColor: '#f0fdf4', padding: '16px', borderRadius: '8px', marginBottom: '16px', border: '2px solid #22c55e' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '10px', color: '#1f2937', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <UsersIcon size={20} color="#22c55e" />
              {t('users.instructions.whatIsRegularUser')}
            </h3>
            <p>{t('users.instructions.regularUserDescription')}</p>
          </div>

          <div style={{ backgroundColor: '#f0f9ff', padding: '16px', borderRadius: '8px', marginBottom: '16px', border: '2px solid #3b82f6' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '10px', color: '#1f2937', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <User size={20} color="#3b82f6" />
              {t('users.instructions.whatIsAdminUser')}
            </h3>
            <p>{t('users.instructions.adminUserDescription')}</p>
          </div>

          <div style={{ backgroundColor: '#fef3c7', padding: '16px', borderRadius: '8px', marginBottom: '16px', border: '2px solid #f59e0b' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '10px', color: '#1f2937', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Home size={20} color="#f59e0b" />
              {t('users.instructions.apartmentsAndStatus')}
            </h3>
            <p>{t('users.instructions.apartmentsAndStatusDescription')}</p>
          </div>

          <h3 style={{ fontSize: '18px', fontWeight: '600', marginTop: '20px', marginBottom: '10px', color: '#1f2937' }}>
            {t('users.instructions.howToUse')}
          </h3>
          <ul style={{ marginLeft: '20px' }}>
            <li>{t('users.instructions.step1')}</li>
            <li>{t('users.instructions.step2')}</li>
            <li>{t('users.instructions.step3')}</li>
            <li>{t('users.instructions.step4')}</li>
            <li>{t('users.instructions.step5')}</li>
            <li>{t('users.instructions.step6')}</li>
            <li>{t('users.instructions.step7')}</li>
          </ul>

          <div style={{ backgroundColor: '#fef3c7', padding: '16px', borderRadius: '8px', marginTop: '16px', border: '1px solid #f59e0b' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px', color: '#1f2937' }}>
              {t('users.instructions.rfidTitle')}
            </h3>
            <ul style={{ marginLeft: '20px', fontSize: '14px' }}>
              <li>{t('users.instructions.rfidPoint1')}</li>
              <li>{t('users.instructions.rfidPoint2')}</li>
              <li>{t('users.instructions.rfidPoint3')}</li>
              <li>{t('users.instructions.rfidPoint4')}</li>
            </ul>
          </div>

          <div style={{ backgroundColor: '#ede9fe', padding: '16px', borderRadius: '8px', marginTop: '16px', border: '1px solid #a78bfa' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px', color: '#1f2937' }}>
              {t('users.instructions.tips')}
            </h3>
            <ul style={{ marginLeft: '20px', fontSize: '14px' }}>
              <li>{t('users.instructions.tip1')}</li>
              <li>{t('users.instructions.tip2')}</li>
              <li>{t('users.instructions.tip3')}</li>
              <li>{t('users.instructions.tip4')}</li>
            </ul>
          </div>
        </div>

        <button onClick={onClose} style={{
          width: '100%', marginTop: '24px', padding: '12px',
          backgroundColor: '#007bff', color: 'white', border: 'none',
          borderRadius: '6px', fontSize: '14px', fontWeight: '500', cursor: 'pointer'
        }}>
          {t('common.close')}
        </button>
      </div>
    </div>
  );
}