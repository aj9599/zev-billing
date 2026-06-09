import { useState, useEffect } from 'react';
import { KeyRound, Check, AlertTriangle, Sparkles, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import type { LicenseStatus } from '../types';
import { useTranslation } from '../i18n';

const ENTITIES: Array<{ key: keyof LicenseStatus['usage']; labelKey: string }> = [
  { key: 'buildings', labelKey: 'license.buildings' },
  { key: 'users', labelKey: 'license.users' },
  { key: 'meters', labelKey: 'license.meters' },
  { key: 'chargers', labelKey: 'license.chargers' },
  { key: 'devices', labelKey: 'license.devices' },
];

export default function License() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    try { setStatus(await api.getLicense()); }
    catch (e) { console.error('Failed to load license status', e); }
    finally { setLoading(false); }
  };

  const parseError = (e: unknown): string => {
    const msg = e instanceof Error ? e.message : String(e);
    try { const o = JSON.parse(msg); return o.message || o.error || msg; } catch { return msg; }
  };

  const activate = async () => {
    setError(''); setSuccess('');
    if (!keyInput.trim()) return;
    setBusy(true);
    try {
      const s = await api.activateLicense(keyInput.trim());
      setStatus(s);
      window.dispatchEvent(new Event('license-changed'));
      if (s.tier === 'pro') { setSuccess(t('license.activated')); setKeyInput(''); }
      else { setError(statusMessage(s) || t('license.invalidKey')); }
    } catch (e) { setError(parseError(e)); }
    finally { setBusy(false); }
  };

  const deactivate = async () => {
    setError(''); setSuccess('');
    setBusy(true);
    try {
      setStatus(await api.deactivateLicense());
      window.dispatchEvent(new Event('license-changed'));
    }
    catch (e) { setError(parseError(e)); }
    finally { setBusy(false); }
  };

  // Translate a status message via its code, falling back to the English text.
  const statusMessage = (s: LicenseStatus): string => {
    if (s.message_code) {
      const key = 'license.msg.' + s.message_code;
      const tr = t(key);
      if (tr !== key) return tr;
    }
    return s.message || '';
  };

  const labelStyle: React.CSSProperties = { fontSize: 12, color: '#6b7280', marginBottom: 4, display: 'block' };

  if (loading || !status) {
    return <div style={{ padding: 24, color: '#6b7280' }}>{t('common.loading')}</div>;
  }

  const tierColor = status.tier === 'pro' ? '#10b981' : status.tier === 'trial' ? '#667eea' : '#9ca3af';
  const tierLabel = status.tier === 'pro' ? t('license.tierPro') : status.tier === 'trial' ? t('license.tierTrial') : t('license.tierFree');
  const fmtLimit = (n: number) => (n < 0 ? '∞' : String(n));
  const msg = statusMessage(status);

  const cardStyle: React.CSSProperties = {
    backgroundColor: 'white', borderRadius: 14, border: '1px solid #e5e7eb',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden',
  };

  return (
    <div style={{ width: '100%', maxWidth: '100%' }}>
      {/* Header */}
      <div className="app-fade-in" style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 12, color: '#667eea' }}>
          <KeyRound size={32} style={{ color: '#667eea' }} />
          {t('license.title')}
        </h1>
        <p style={{ color: '#6b7280', fontSize: 15, margin: 0 }}>{t('license.subtitle')}</p>
      </div>

      {/* Plan / status card */}
      <div className="app-fade-in" style={{ ...cardStyle, marginBottom: 20, animationDelay: '0.05s' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: tierColor, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 2px 8px ${tierColor}55`, flexShrink: 0 }}>
            <KeyRound size={20} color="white" />
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, marginBottom: 2, color: '#1f2937', display: 'flex', alignItems: 'center', gap: 10 }}>
              {t('license.currentPlan')}
              <span style={{ background: tierColor, color: 'white', padding: '3px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{tierLabel}</span>
            </h2>
            <p style={{ fontSize: 13, color: '#9ca3af', margin: 0 }}>
              {status.tier === 'trial' && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#667eea', fontWeight: 600 }}>
                  <Sparkles size={14} /> {t('license.trialDaysLeft').replace('{days}', String(status.trial_days_left))}
                </span>
              )}
              {status.tier === 'pro' && status.licensee && <>{t('license.licensedTo')}: <strong style={{ color: '#374151' }}>{status.licensee}</strong></>}
              {status.tier === 'free' && t('license.subtitle')}
            </p>
          </div>
          {/* Remove license — moved up, next to the plan */}
          {status.key_masked && (
            <button onClick={deactivate} disabled={busy} style={{ background: 'white', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 14px', fontWeight: 600, fontSize: 13, cursor: busy ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <Trash2 size={15} /> {t('license.removeButton')}
            </button>
          )}
        </div>

        <div style={{ padding: 24 }}>
          {/* Active key details */}
          {status.key_masked && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, fontSize: 13, color: '#374151', marginBottom: 18 }}>
              <div><span style={labelStyle}>{t('license.activeKey')}</span><code style={{ background: '#f3f4f6', padding: '3px 8px', borderRadius: 5 }}>{status.key_masked}</code></div>
              {status.key_type && <div><span style={labelStyle}>{t('license.keyType')}</span><strong>{status.key_type === 'lifetime' ? t('license.lifetime') : t('license.limited')}</strong></div>}
              {status.key_type === 'limited' && status.expires && <div><span style={labelStyle}>{t('license.validUntil')}</span>{status.expires.slice(0, 10)}</div>}
              {status.online && status.device_id && <div><span style={labelStyle}>{t('license.deviceId')}</span><code style={{ background: '#f3f4f6', padding: '3px 8px', borderRadius: 5 }}>{status.device_id.slice(0, 12)}</code></div>}
              {status.online && <div><span style={labelStyle}>{t('license.activationMode')}</span>{t('license.online')}</div>}
            </div>
          )}

          {msg && (
            <div style={{ marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8, color: '#b45309', fontSize: 13, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px' }}>
              <AlertTriangle size={16} /> {msg}
            </div>
          )}

          {/* Usage vs limits */}
          <div style={{ fontSize: 13, fontWeight: 600, color: '#6b7280', marginBottom: 10 }}>{t('license.usage')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
            {ENTITIES.map(({ key, labelKey }) => {
              const used = status.usage[key];
              const limit = status.limits[key];
              const atLimit = limit >= 0 && used >= limit;
              return (
                <div key={key} style={{ background: '#f9fafb', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>{t(labelKey)}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: atLimit ? '#dc2626' : '#1f2937' }}>
                    {used} <span style={{ fontSize: 13, fontWeight: 400, color: '#9ca3af' }}>/ {fmtLimit(limit)}</span>
                  </div>
                </div>
              );
            })}
            <div style={{ background: '#f9fafb', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ fontSize: 12, color: '#6b7280' }}>{t('license.billing')}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: status.limits.billing ? '#10b981' : '#dc2626' }}>
                {status.limits.billing ? t('license.included') : t('license.notIncluded')}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Activation card */}
      <div className="app-fade-in" style={{ ...cardStyle, animationDelay: '0.1s' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #f3f4f6' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, marginBottom: 2, color: '#1f2937' }}>
            {status.tier === 'pro' ? t('license.manageKey') : t('license.activateTitle')}
          </h2>
          <p style={{ fontSize: 13, color: '#9ca3af', margin: 0 }}>{t('license.activateHint')}</p>
        </div>
        <div style={{ padding: 24 }}>
          <label style={labelStyle}>{t('license.manageKey')}</label>
          <textarea
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="ZEV-..."
            rows={3}
            style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontFamily: 'monospace', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }}
          />

          {error && (
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, color: '#dc2626', fontSize: 13 }}>
              <AlertTriangle size={16} /> {error}
            </div>
          )}
          {success && (
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, color: '#10b981', fontSize: 13 }}>
              <Check size={16} /> {success}
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <button onClick={activate} disabled={busy || !keyInput.trim()} style={{ background: '#667eea', color: 'white', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 600, fontSize: 14, cursor: busy || !keyInput.trim() ? 'not-allowed' : 'pointer', opacity: busy || !keyInput.trim() ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <KeyRound size={16} /> {t('license.activateButton')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
