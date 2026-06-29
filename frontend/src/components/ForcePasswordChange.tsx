import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { api } from '../api/client';
import { useTranslation } from '../i18n';

interface ForcePasswordChangeProps {
  onDone: () => void;
  onLogout: () => void;
}

// Shown full-screen after login when the account is still on the default
// password. The user cannot reach the app until they set a new one.
export default function ForcePasswordChange({ onDone, onLogout }: ForcePasswordChangeProps) {
  const { t } = useTranslation();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (next.length < 8) {
      setError(t('forceChange.tooShort'));
      return;
    }
    if (next !== confirm) {
      setError(t('forceChange.mismatch'));
      return;
    }
    if (next === current) {
      setError(t('forceChange.sameAsOld'));
      return;
    }
    setSaving(true);
    try {
      await api.changePassword(current, next);
      localStorage.removeItem('must_change_password');
      onDone();
    } catch (err: any) {
      setError(err?.message || t('forceChange.failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: '#f5f5f5',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', zIndex: 2000
    }}>
      <div style={{
        backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
        maxWidth: '440px', width: '100%', padding: '32px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <ShieldAlert size={24} color="#f59e0b" />
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#1f2937' }}>
            {t('forceChange.title')}
          </h2>
        </div>
        <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '20px' }}>
          {t('forceChange.subtitle')}
        </p>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <input
            type="password" value={current} onChange={e => setCurrent(e.target.value)}
            placeholder={t('forceChange.current')} autoComplete="current-password" style={inputStyle}
          />
          <input
            type="password" value={next} onChange={e => setNext(e.target.value)}
            placeholder={t('forceChange.new')} autoComplete="new-password" style={inputStyle}
          />
          <input
            type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
            placeholder={t('forceChange.confirm')} autoComplete="new-password" style={inputStyle}
          />

          {error && (
            <div role="alert" style={{ fontSize: '13px', color: '#b91c1c', backgroundColor: '#fee2e2', padding: '10px 12px', borderRadius: '6px' }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={saving} style={{
            marginTop: '4px', padding: '12px', borderRadius: '8px', border: 'none',
            backgroundColor: saving ? '#9ca3af' : '#667eea', color: 'white', fontSize: '15px',
            fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer'
          }}>
            {saving ? t('forceChange.saving') : t('forceChange.submit')}
          </button>
          <button type="button" onClick={onLogout} style={{
            padding: '8px', borderRadius: '8px', border: 'none', background: 'transparent',
            color: '#6b7280', fontSize: '13px', cursor: 'pointer'
          }}>
            {t('nav.logout')}
          </button>
        </form>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '12px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '15px', width: '100%'
};
