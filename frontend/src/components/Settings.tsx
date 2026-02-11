import { useState } from 'react';
import { Lock, Key, Shield, CheckCircle, RefreshCw, Ban, Database, Activity, Settings as SettingsIcon, Lightbulb } from 'lucide-react';
import { api } from '../api/client';
import { useTranslation } from '../i18n';

export default function Settings() {
  const { t } = useTranslation();
  const [passwordForm, setPasswordForm] = useState({
    old_password: '',
    new_password: '',
    confirm_password: ''
  });
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (passwordForm.new_password !== passwordForm.confirm_password) {
      setMessage(t('settings.passwordMismatch'));
      setMessageType('error');
      return;
    }

    if (passwordForm.new_password.length < 6) {
      setMessage(t('settings.passwordTooShort'));
      setMessageType('error');
      return;
    }

    try {
      await api.changePassword(passwordForm.old_password, passwordForm.new_password);
      setMessage(t('settings.passwordChangeSuccess'));
      setMessageType('success');
      setPasswordForm({ old_password: '', new_password: '', confirm_password: '' });
    } catch (err) {
      setMessage(t('settings.passwordChangeFailed'));
      setMessageType('error');
    }
  };

  const securityTips = [
    { Icon: Lock, title: t('settings.useStrongPasswords'), desc: t('settings.useStrongPasswordsDesc'), color: '#667eea' },
    { Icon: RefreshCw, title: t('settings.changeRegularly'), desc: t('settings.changeRegularlyDesc'), color: '#10b981' },
    { Icon: Ban, title: t('settings.neverShare'), desc: t('settings.neverShareDesc'), color: '#ef4444' },
    { Icon: Database, title: t('settings.backupData'), desc: t('settings.backupDataDesc'), color: '#f59e0b' },
    { Icon: Activity, title: t('settings.monitorActivity'), desc: t('settings.monitorActivityDesc'), color: '#8b5cf6' }
  ];

  return (
    <div className="settings-container" style={{ maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div className="settings-header" style={{ marginBottom: '30px' }}>
        <h1 style={{
          fontSize: '36px',
          fontWeight: '800',
          marginBottom: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text'
        }}>
          <SettingsIcon size={36} style={{ color: '#667eea' }} />
          {t('settings.title')}
        </h1>
        <p style={{ color: '#6b7280', fontSize: '16px', margin: 0 }}>
          {t('settings.subtitle')}
        </p>
      </div>

      {/* Status Message */}
      {message && (
        <div style={{
          padding: '14px 18px',
          marginBottom: '24px',
          borderRadius: '12px',
          backgroundColor: messageType === 'success' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
          color: messageType === 'success' ? '#059669' : '#dc2626',
          border: `1px solid ${messageType === 'success' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontSize: '14px',
          fontWeight: '600',
          animation: 'st-slideDown 0.3s ease-out'
        }}>
          {messageType === 'success' ? <CheckCircle size={18} /> : <Shield size={18} />}
          {message}
        </div>
      )}

      <div className="settings-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))',
        gap: '20px'
      }}>
        {/* Password Change Card */}
        <div className="settings-card" style={{
          backgroundColor: 'white',
          borderRadius: '14px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          overflow: 'hidden',
          animation: 'st-fadeSlideIn 0.4s ease-out both'
        }}>
          {/* Card Header */}
          <div style={{
            padding: '20px 24px',
            borderBottom: '1px solid #f3f4f6',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(102, 126, 234, 0.3)',
              flexShrink: 0
            }}>
              <Lock size={20} color="white" />
            </div>
            <div>
              <h2 style={{
                fontSize: '18px',
                fontWeight: '700',
                margin: 0,
                marginBottom: '2px',
                color: '#1f2937'
              }}>
                {t('settings.changePassword')}
              </h2>
              <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0 }}>
                {t('settings.updateYourPassword')}
              </p>
            </div>
          </div>

          {/* Card Body */}
          <div style={{ padding: '24px' }}>
            <form onSubmit={handleChangePassword}>
              {/* Current Password */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginBottom: '8px',
                  fontWeight: '600',
                  color: '#374151',
                  fontSize: '13px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  <Key size={14} />
                  {t('settings.currentPassword')}
                </label>
                <input
                  type="password"
                  required
                  value={passwordForm.old_password}
                  onChange={(e) => setPasswordForm({ ...passwordForm, old_password: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                    transition: 'border-color 0.2s',
                    outline: 'none',
                    backgroundColor: 'white'
                  }}
                  placeholder={t('settings.enterCurrentPassword')}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#667eea';
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.1)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#e5e7eb';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
              </div>

              {/* New Password */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginBottom: '8px',
                  fontWeight: '600',
                  color: '#374151',
                  fontSize: '13px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  <Shield size={14} />
                  {t('settings.newPassword')}
                </label>
                <input
                  type="password"
                  required
                  value={passwordForm.new_password}
                  onChange={(e) => setPasswordForm({ ...passwordForm, new_password: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                    transition: 'border-color 0.2s',
                    outline: 'none',
                    backgroundColor: 'white'
                  }}
                  placeholder={t('settings.enterNewPassword')}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#667eea';
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.1)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#e5e7eb';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
                <p style={{
                  fontSize: '11px',
                  color: '#9ca3af',
                  marginTop: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontStyle: 'italic'
                }}>
                  <Lightbulb size={11} />
                  {t('settings.passwordMinLength')}
                </p>
              </div>

              {/* Confirm Password */}
              <div style={{ marginBottom: '24px' }}>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginBottom: '8px',
                  fontWeight: '600',
                  color: '#374151',
                  fontSize: '13px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  <CheckCircle size={14} />
                  {t('settings.confirmPassword')}
                </label>
                <input
                  type="password"
                  required
                  value={passwordForm.confirm_password}
                  onChange={(e) => setPasswordForm({ ...passwordForm, confirm_password: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                    transition: 'border-color 0.2s',
                    outline: 'none',
                    backgroundColor: 'white'
                  }}
                  placeholder={t('settings.confirmNewPassword')}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#667eea';
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.1)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#e5e7eb';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
              </div>

              {/* Submit */}
              <button
                type="submit"
                className="st-btn-submit"
                style={{
                  width: '100%',
                  padding: '12px',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '14px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: '0 2px 8px rgba(102, 126, 234, 0.35)',
                  letterSpacing: '0.3px'
                }}
              >
                {t('settings.updatePassword')}
              </button>
            </form>
          </div>
        </div>

        {/* Security Tips Card */}
        <div className="settings-card" style={{
          backgroundColor: 'white',
          borderRadius: '14px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          overflow: 'hidden',
          animation: 'st-fadeSlideIn 0.4s ease-out 0.1s both'
        }}>
          {/* Card Header */}
          <div style={{
            padding: '20px 24px',
            borderBottom: '1px solid #f3f4f6',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(102, 126, 234, 0.3)',
              flexShrink: 0
            }}>
              <Shield size={20} color="white" />
            </div>
            <div>
              <h2 style={{
                fontSize: '18px',
                fontWeight: '700',
                margin: 0,
                marginBottom: '2px',
                color: '#1f2937'
              }}>
                {t('settings.securityTips')}
              </h2>
              <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0 }}>
                {t('settings.keepAccountSecure')}
              </p>
            </div>
          </div>

          {/* Card Body */}
          <div style={{ padding: '16px 24px 24px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {securityTips.map((tip, idx) => {
                const IconComponent = tip.Icon;
                return (
                  <div
                    key={idx}
                    className="st-tip-row"
                    style={{
                      padding: '14px 16px',
                      backgroundColor: '#f9fafb',
                      borderRadius: '10px',
                      border: '1px solid #f3f4f6',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                      transition: 'all 0.2s',
                      animation: `st-fadeSlideIn 0.3s ease-out ${0.15 + idx * 0.06}s both`
                    }}
                  >
                    <div style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '10px',
                      backgroundColor: tip.color + '15',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <IconComponent size={18} color={tip.color} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 style={{
                        fontSize: '14px',
                        fontWeight: '700',
                        marginBottom: '2px',
                        color: '#1f2937',
                        margin: 0
                      }}>
                        {tip.title}
                      </h3>
                      <p style={{ fontSize: '12px', color: '#6b7280', lineHeight: '1.5', margin: 0 }}>
                        {tip.desc}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes st-slideDown {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes st-fadeSlideIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .st-btn-submit:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.45) !important;
        }
        .st-tip-row:hover {
          background-color: #f3f4f6 !important;
          transform: translateX(4px);
        }

        @media (max-width: 768px) {
          .settings-container {
            padding: 0 !important;
          }
          .settings-header h1 {
            font-size: 24px !important;
          }
          .settings-header h1 svg {
            width: 24px !important;
            height: 24px !important;
          }
          .settings-grid {
            grid-template-columns: 1fr !important;
            gap: 16px !important;
          }
        }

        @media (max-width: 480px) {
          .settings-header h1 {
            font-size: 20px !important;
            gap: 8px !important;
          }
          .settings-header h1 svg {
            width: 20px !important;
            height: 20px !important;
          }
        }
      `}</style>
    </div>
  );
}
