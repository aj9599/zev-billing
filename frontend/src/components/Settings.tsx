import { useState } from 'react';
import { Lock, Key, Shield, CheckCircle, RefreshCw, Ban, Database, Activity, Settings as SettingsIcon } from 'lucide-react';
import { api } from '../api/client';

export default function Settings() {
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
      setMessage('New passwords do not match');
      setMessageType('error');
      return;
    }

    if (passwordForm.new_password.length < 6) {
      setMessage('Password must be at least 6 characters');
      setMessageType('error');
      return;
    }

    try {
      await api.changePassword(passwordForm.old_password, passwordForm.new_password);
      setMessage('Password changed successfully!');
      setMessageType('success');
      setPasswordForm({ old_password: '', new_password: '', confirm_password: '' });
    } catch (err) {
      setMessage('Failed to change password. Check your old password.');
      setMessageType('error');
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '40px' }}>
        <h1 style={{ 
          fontSize: '36px', 
          fontWeight: '800', 
          marginBottom: '8px',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text'
        }}>
          <SettingsIcon size={36} style={{ color: '#667eea' }} />
          Settings
        </h1>
        <p style={{ color: '#6b7280', fontSize: '16px' }}>
          Manage your account settings and security preferences
        </p>
      </div>

      {message && (
        <div style={{
          padding: '18px 24px',
          marginBottom: '32px',
          borderRadius: '16px',
          backgroundColor: messageType === 'success' ? '#d4edda' : '#f8d7da',
          color: messageType === 'success' ? '#155724' : '#721c24',
          border: `2px solid ${messageType === 'success' ? '#c3e6cb' : '#f5c6cb'}`,
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontSize: '15px',
          fontWeight: '500',
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          animation: 'slideDown 0.4s ease-out'
        }}>
          {messageType === 'success' ? <CheckCircle size={22} /> : <Shield size={22} />}
          {message}
        </div>
      )}

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))', 
        gap: '30px' 
      }}>
        {/* Password Change Card */}
        <div style={{ 
          backgroundColor: 'white', 
          borderRadius: '20px', 
          padding: '40px',
          boxShadow: '0 8px 30px rgba(0,0,0,0.08)',
          border: '1px solid #f3f4f6',
          transition: 'all 0.3s ease'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = '0 12px 40px rgba(0,0,0,0.12)';
          e.currentTarget.style.transform = 'translateY(-4px)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = '0 8px 30px rgba(0,0,0,0.08)';
          e.currentTarget.style.transform = 'translateY(0)';
        }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '16px', 
            marginBottom: '32px',
            paddingBottom: '24px',
            borderBottom: '2px solid #f3f4f6'
          }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 20px rgba(102, 126, 234, 0.3)'
            }}>
              <Lock size={28} color="white" strokeWidth={2.5} />
            </div>
            <div>
              <h2 style={{ 
                fontSize: '24px', 
                fontWeight: '700', 
                marginBottom: '4px',
                color: '#1f2937'
              }}>
                Change Password
              </h2>
              <p style={{ fontSize: '14px', color: '#6b7280' }}>
                Update your password to keep your account secure
              </p>
            </div>
          </div>

          <form onSubmit={handleChangePassword}>
            <div style={{ marginBottom: '24px' }}>
              <label style={{ 
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '10px', 
                fontWeight: '600', 
                color: '#374151', 
                fontSize: '14px' 
              }}>
                <Key size={16} />
                Current Password
              </label>
              <input
                type="password"
                required
                value={passwordForm.old_password}
                onChange={(e) => setPasswordForm({ ...passwordForm, old_password: e.target.value })}
                style={{ 
                  width: '100%', 
                  padding: '14px 16px', 
                  border: '2px solid #e5e7eb', 
                  borderRadius: '12px',
                  fontSize: '15px',
                  transition: 'all 0.3s ease',
                  outline: 'none'
                }}
                placeholder="Enter your current password"
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#667eea';
                  e.currentTarget.style.boxShadow = '0 0 0 4px rgba(102, 126, 234, 0.1)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#e5e7eb';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ 
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '10px', 
                fontWeight: '600', 
                color: '#374151', 
                fontSize: '14px' 
              }}>
                <Shield size={16} />
                New Password
              </label>
              <input
                type="password"
                required
                value={passwordForm.new_password}
                onChange={(e) => setPasswordForm({ ...passwordForm, new_password: e.target.value })}
                style={{ 
                  width: '100%', 
                  padding: '14px 16px', 
                  border: '2px solid #e5e7eb', 
                  borderRadius: '12px',
                  fontSize: '15px',
                  transition: 'all 0.3s ease',
                  outline: 'none'
                }}
                placeholder="Enter your new password"
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#667eea';
                  e.currentTarget.style.boxShadow = '0 0 0 4px rgba(102, 126, 234, 0.1)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#e5e7eb';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
              <p style={{ 
                fontSize: '12px', 
                color: '#6b7280', 
                marginTop: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                💡 Must be at least 6 characters long
              </p>
            </div>

            <div style={{ marginBottom: '32px' }}>
              <label style={{ 
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '10px', 
                fontWeight: '600', 
                color: '#374151', 
                fontSize: '14px' 
              }}>
                <CheckCircle size={16} />
                Confirm New Password
              </label>
              <input
                type="password"
                required
                value={passwordForm.confirm_password}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirm_password: e.target.value })}
                style={{ 
                  width: '100%', 
                  padding: '14px 16px', 
                  border: '2px solid #e5e7eb', 
                  borderRadius: '12px',
                  fontSize: '15px',
                  transition: 'all 0.3s ease',
                  outline: 'none'
                }}
                placeholder="Confirm your new password"
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#667eea';
                  e.currentTarget.style.boxShadow = '0 0 0 4px rgba(102, 126, 234, 0.1)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#e5e7eb';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
            </div>

            <button
              type="submit"
              style={{
                width: '100%', 
                padding: '16px', 
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white',
                border: 'none', 
                borderRadius: '12px', 
                fontSize: '16px', 
                fontWeight: '700',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                boxShadow: '0 8px 20px rgba(102, 126, 234, 0.3)',
                letterSpacing: '0.5px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 12px 30px rgba(102, 126, 234, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 8px 20px rgba(102, 126, 234, 0.3)';
              }}
            >
              Update Password
            </button>
          </form>
        </div>

        {/* Security Tips Card */}
        <div style={{ 
          backgroundColor: 'white', 
          borderRadius: '20px', 
          padding: '40px',
          boxShadow: '0 8px 30px rgba(0,0,0,0.08)',
          border: '1px solid #f3f4f6',
        }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '16px', 
            marginBottom: '32px',
            paddingBottom: '24px',
            borderBottom: '2px solid #f3f4f6'
          }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 20px rgba(240, 147, 251, 0.3)'
            }}>
              <Shield size={28} color="white" strokeWidth={2.5} />
            </div>
            <div>
              <h2 style={{ 
                fontSize: '24px', 
                fontWeight: '700', 
                marginBottom: '4px',
                color: '#1f2937'
              }}>
                Security Tips
              </h2>
              <p style={{ fontSize: '14px', color: '#6b7280' }}>
                Keep your account secure
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {[
              { Icon: Lock, title: 'Use Strong Passwords', desc: 'Combine letters, numbers, and symbols', color: '#007bff' },
              { Icon: RefreshCw, title: 'Change Regularly', desc: 'Update your password every 3-6 months', color: '#28a745' },
              { Icon: Ban, title: 'Never Share', desc: 'Keep your credentials private and secure', color: '#dc3545' },
              { Icon: Database, title: 'Backup Important Data', desc: 'Use Admin Logs page to backup database', color: '#ffc107' },
              { Icon: Activity, title: 'Monitor Activity', desc: 'Check Admin Logs for suspicious activity', color: '#6f42c1' }
            ].map((tip, idx) => {
              const IconComponent = tip.Icon;
              return (
                <div key={idx} style={{
                  padding: '16px',
                  backgroundColor: '#f9fafb',
                  borderRadius: '12px',
                  border: '1px solid #e5e7eb',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  transition: 'all 0.3s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f3f4f6';
                  e.currentTarget.style.transform = 'translateX(8px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#f9fafb';
                  e.currentTarget.style.transform = 'translateX(0)';
                }}>
                  <div style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '10px',
                    backgroundColor: tip.color + '20',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <IconComponent size={24} color={tip.color} strokeWidth={2} />
                  </div>
                  <div>
                    <h3 style={{ 
                      fontSize: '15px', 
                      fontWeight: '600', 
                      marginBottom: '4px',
                      color: '#1f2937'
                    }}>
                      {tip.title}
                    </h3>
                    <p style={{ fontSize: '13px', color: '#6b7280', lineHeight: '1.5', margin: 0 }}>
                      {tip.desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}