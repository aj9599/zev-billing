import { useState } from 'react';
import { Zap, Lock, User } from 'lucide-react';
import { api } from '../api/client';

interface LoginProps {
  onLogin: () => void;
}

export default function Login({ onLogin }: LoginProps) {
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
      setError('Invalid credentials');
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
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Animated background circles */}
      <div style={{
        position: 'absolute',
        width: '500px',
        height: '500px',
        borderRadius: '50%',
        background: 'rgba(255,255,255,0.1)',
        top: '-250px',
        left: '-250px',
        animation: 'float 6s ease-in-out infinite'
      }} />
      <div style={{
        position: 'absolute',
        width: '400px',
        height: '400px',
        borderRadius: '50%',
        background: 'rgba(255,255,255,0.1)',
        bottom: '-200px',
        right: '-200px',
        animation: 'float 8s ease-in-out infinite reverse'
      }} />

      <div style={{
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(10px)',
        padding: '50px 45px',
        borderRadius: '24px',
        boxShadow: '0 25px 50px rgba(0,0,0,0.3)',
        width: '100%',
        maxWidth: '440px',
        position: 'relative',
        zIndex: 1,
        animation: 'slideUp 0.6s ease-out'
      }}>
        {/* Logo and Title */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '90px',
            height: '90px',
            borderRadius: '24px',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            marginBottom: '24px',
            boxShadow: '0 15px 35px rgba(102, 126, 234, 0.4)',
            animation: 'pulse 2s ease-in-out infinite'
          }}>
            <Zap size={45} color="white" strokeWidth={2.5} />
          </div>
          <h1 style={{
            fontSize: '32px',
            fontWeight: '800',
            marginBottom: '8px',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            letterSpacing: '-0.5px'
          }}>
            ZEV Billing
          </h1>
          <p style={{
            color: '#6b7280',
            fontSize: '16px',
            fontWeight: '500'
          }}>
            Swiss Energy Management
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Username Field */}
          <div style={{ marginBottom: '24px', position: 'relative' }}>
            <label style={{
              display: 'block',
              marginBottom: '10px',
              fontWeight: '600',
              color: '#374151',
              fontSize: '14px',
              letterSpacing: '0.3px'
            }}>
              Username
            </label>
            <div style={{ position: 'relative' }}>
              <div style={{
                position: 'absolute',
                left: '16px',
                top: '50%',
                transform: 'translateY(-50%)',
                pointerEvents: 'none'
              }}>
                <User size={20} color="#9ca3af" />
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '14px 16px 14px 48px',
                  border: '2px solid #e5e7eb',
                  borderRadius: '12px',
                  fontSize: '15px',
                  backgroundColor: 'white',
                  transition: 'all 0.3s ease',
                  outline: 'none'
                }}
                placeholder="Enter your username"
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
          </div>

          {/* Password Field */}
          <div style={{ marginBottom: '28px', position: 'relative' }}>
            <label style={{
              display: 'block',
              marginBottom: '10px',
              fontWeight: '600',
              color: '#374151',
              fontSize: '14px',
              letterSpacing: '0.3px'
            }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <div style={{
                position: 'absolute',
                left: '16px',
                top: '50%',
                transform: 'translateY(-50%)',
                pointerEvents: 'none'
              }}>
                <Lock size={20} color="#9ca3af" />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '14px 16px 14px 48px',
                  border: '2px solid #e5e7eb',
                  borderRadius: '12px',
                  fontSize: '15px',
                  backgroundColor: 'white',
                  transition: 'all 0.3s ease',
                  outline: 'none'
                }}
                placeholder="Enter your password"
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
          </div>

          {error && (
            <div style={{
              padding: '14px 16px',
              backgroundColor: '#fef2f2',
              color: '#dc2626',
              borderRadius: '12px',
              marginBottom: '24px',
              fontSize: '14px',
              fontWeight: '500',
              border: '2px solid #fee2e2',
              animation: 'shake 0.5s ease-in-out'
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
              background: loading ? '#9ca3af' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              fontSize: '16px',
              fontWeight: '700',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.3s ease',
              boxShadow: loading ? 'none' : '0 10px 25px rgba(102, 126, 234, 0.4)',
              transform: loading ? 'scale(1)' : 'scale(1)',
              letterSpacing: '0.5px'
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 15px 35px rgba(102, 126, 234, 0.5)';
              }
            }}
            onMouseLeave={(e) => {
              if (!loading) {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 10px 25px rgba(102, 126, 234, 0.4)';
              }
            }}
          >
            {loading ? (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                <span style={{ animation: 'spin 1s linear infinite' }}>⚡</span>
                Signing in...
              </span>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        <div style={{
          marginTop: '32px',
          textAlign: 'center',
          fontSize: '13px',
          color: '#9ca3af',
          fontWeight: '500'
        }}>
          <p>Powered by AJ • Swiss Energy Solutions</p>
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes float {
          0%, 100% {
            transform: translateY(0) rotate(0deg);
          }
          50% {
            transform: translateY(-20px) rotate(10deg);
          }
        }

        @keyframes pulse {
          0%, 100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.05);
          }
        }

        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-10px); }
          75% { transform: translateX(10px); }
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}