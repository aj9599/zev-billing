import { useState } from 'react';
import { Lock, User } from 'lucide-react';
import { api } from '../api/client';
import { useTranslation } from '../i18n';
import Logo from './Logo';

interface LoginProps {
  onLogin: () => void;
}

export default function Login({ onLogin }: LoginProps) {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await api.login(username, password);
      onLogin();
    } catch (err) {
      setError(t('login.invalidCredentials'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#1a1a1a',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      padding: '20px',
      boxSizing: 'border-box'
    }}>
      <div style={{
        backgroundColor: '#2a2a2a',
        padding: '50px 45px',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '440px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        boxSizing: 'border-box'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100px',
            height: '100px',
            borderRadius: '16px',
            marginBottom: '24px',
            padding: '10px'
          }}>
            <Logo size={100} />
          </div>
          <h1 style={{
            fontSize: '32px',
            fontWeight: '800',
            marginBottom: '8px',
            color: '#ffffff'
          }}>
            {t('login.title')}
          </h1>
          <p style={{
            color: '#999',
            fontSize: '16px',
            fontWeight: '500'
          }}>
            {t('login.subtitle')}
          </p>
        </div>

        <form onSubmit={handleSubmit} autoComplete="on">
          <div style={{ marginBottom: '24px', position: 'relative' }}>
            <label 
              htmlFor="username"
              style={{
                display: 'block',
                marginBottom: '10px',
                fontWeight: '600',
                color: '#ccc',
                fontSize: '14px'
              }}
            >
              {t('login.username')}
            </label>
            <div style={{ position: 'relative' }}>
              <div style={{
                position: 'absolute',
                left: '16px',
                top: '50%',
                transform: 'translateY(-50%)',
                pointerEvents: 'none',
                zIndex: 1
              }}>
                <User size={20} color="#666" />
              </div>
              <input
                id="username"
                name="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck="false"
                style={{
                  width: '100%',
                  padding: '14px 16px 14px 48px',
                  border: '2px solid #444',
                  borderRadius: '12px',
                  fontSize: '16px',
                  backgroundColor: '#1a1a1a',
                  color: '#fff',
                  transition: 'all 0.3s ease',
                  outline: 'none',
                  boxSizing: 'border-box',
                  WebkitAppearance: 'none',
                  appearance: 'none'
                }}
                placeholder={t('login.enterUsername')}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#667eea';
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.1)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#444';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
            </div>
          </div>

          <div style={{ marginBottom: '28px', position: 'relative' }}>
            <label 
              htmlFor="password"
              style={{
                display: 'block',
                marginBottom: '10px',
                fontWeight: '600',
                color: '#ccc',
                fontSize: '14px'
              }}
            >
              {t('login.password')}
            </label>
            <div style={{ position: 'relative' }}>
              <div style={{
                position: 'absolute',
                left: '16px',
                top: '50%',
                transform: 'translateY(-50%)',
                pointerEvents: 'none',
                zIndex: 1
              }}>
                <Lock size={20} color="#666" />
              </div>
              <input
                id="password"
                name="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                style={{
                  width: '100%',
                  padding: '14px 16px 14px 48px',
                  border: '2px solid #444',
                  borderRadius: '12px',
                  fontSize: '16px',
                  backgroundColor: '#1a1a1a',
                  color: '#fff',
                  transition: 'all 0.3s ease',
                  outline: 'none',
                  boxSizing: 'border-box',
                  WebkitAppearance: 'none',
                  appearance: 'none'
                }}
                placeholder={t('login.enterPassword')}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#667eea';
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.1)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#444';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
            </div>
          </div>

          {error && (
            <div style={{
              padding: '14px 16px',
              backgroundColor: '#3a1f1f',
              color: '#f87171',
              borderRadius: '12px',
              marginBottom: '24px',
              fontSize: '14px',
              fontWeight: '500',
              border: '1px solid #4a2525'
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '16px',
              backgroundColor: loading ? '#555' : '#667eea',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              fontSize: '16px',
              fontWeight: '700',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.3s ease',
              boxShadow: loading ? 'none' : '0 6px 20px rgba(102, 126, 234, 0.4)',
              boxSizing: 'border-box',
              WebkitAppearance: 'none',
              appearance: 'none'
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(102, 126, 234, 0.5)';
                e.currentTarget.style.backgroundColor = '#7c92ff';
              }
            }}
            onMouseLeave={(e) => {
              if (!loading) {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(102, 126, 234, 0.4)';
                e.currentTarget.style.backgroundColor = '#667eea';
              }
            }}
          >
            {loading ? t('login.signingIn') : t('login.signIn')}
          </button>
        </form>

        <div style={{
          marginTop: '32px',
          textAlign: 'center',
          fontSize: '13px',
          color: '#666',
          fontWeight: '500'
        }}>
          <p>{t('login.poweredBy')}</p>
        </div>
      </div>

      <style>{`
        @media (max-width: 480px) {
          .login-container {
            padding: 30px 25px !important;
          }
          
          h1 {
            font-size: 28px !important;
          }
          
          input, button {
            font-size: 16px !important;
          }
        }

        /* Improve mobile Safari input handling */
        input {
          -webkit-text-size-adjust: 100%;
        }

        /* Prevent zoom on iOS */
        @media screen and (max-width: 768px) {
          input[type="text"],
          input[type="password"] {
            font-size: 16px !important;
          }
        }
      `}</style>
    </div>
  );
}