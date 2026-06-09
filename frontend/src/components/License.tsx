import { useState, useEffect } from 'react';
import { KeyRound, Check, AlertTriangle, Sparkles, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import type { LicenseStatus } from '../types';
import { useTranslation } from '../i18n';

const focusHandler = (e: React.FocusEvent<HTMLTextAreaElement>) => {
  e.target.style.borderColor = '#667eea';
  e.target.style.boxShadow = '0 0 0 3px rgba(102,126,234,0.1)';
};
const blurHandler = (e: React.FocusEvent<HTMLTextAreaElement>) => {
  e.target.style.borderColor = '#e5e7eb';
  e.target.style.boxShadow = 'none';
};

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

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    try {
      setStatus(await api.getLicense());
    } catch (e) {
      console.error('Failed to load license status', e);
    } finally {
      setLoading(false);
    }
  };

  const parseError = (e: unknown): string => {
    const msg = e instanceof Error ? e.message : String(e);
    try {
      const obj = JSON.parse(msg);
      return obj.message || obj.error || msg;
    } catch {
      return msg;
    }
  };

  const activate = async () => {
    setError('');
    setSuccess('');
    if (!keyInput.trim()) return;
    setBusy(true);
    try {
      const s = await api.activateLicense(keyInput.trim());
      setStatus(s);
      if (s.tier === 'pro') {
        setSuccess(t('license.activated'));
        setKeyInput('');
      } else {
        setError(s.message || t('license.invalidKey'));
      }
    } catch (e) {
      setError(parseError(e));
    } finally {
      setBusy(false);
    }
  };

  const deactivate = async () => {
    setError('');
    setSuccess('');
    setBusy(true);
    try {
      setStatus(await api.deactivateLicense());
    } catch (e) {
      setError(parseError(e));
    } finally {
      setBusy(false);
    }
  };

  if (loading || !status) {
    return <div style={{ padding: 24, color: '#6b7280' }}>{t('common.loading')}</div>;
  }

  const tierColor =
    status.tier === 'pro' ? '#10b981' : status.tier === 'trial' ? '#667eea' : '#9ca3af';
  const tierLabel =
    status.tier === 'pro' ? t('license.tierPro') : status.tier === 'trial' ? t('license.tierTrial') : t('license.tierFree');

  const fmtLimit = (n: number) => (n < 0 ? '∞' : String(n));

  return (
    <div style={{ padding: 24, maxWidth: 760, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <KeyRound size={24} color="#667eea" />
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: '#1f2937' }}>{t('license.title')}</h1>
      </div>
      <p style={{ color: '#6b7280', marginTop: 0, marginBottom: 24 }}>{t('license.subtitle')}</p>

      {/* Status card */}
      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 14, color: '#6b7280' }}>{t('license.currentPlan')}</span>
            <span style={{
              background: tierColor, color: 'white', padding: '4px 12px', borderRadius: 999,
              fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
            }}>{tierLabel}</span>
          </div>
          {status.tier === 'trial' && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#667eea', fontWeight: 600 }}>
              <Sparkles size={16} /> {t('license.trialDaysLeft').replace('{days}', String(status.trial_days_left))}
            </span>
          )}
          {status.tier === 'pro' && status.expires && (
            <span style={{ color: '#6b7280', fontSize: 13 }}>
              {t('license.validUntil')}: {status.expires.slice(0, 10)}
            </span>
          )}
        </div>

        {status.tier === 'pro' && status.licensee && (
          <div style={{ marginTop: 12, fontSize: 14, color: '#374151' }}>
            {t('license.licensedTo')}: <strong>{status.licensee}</strong>
          </div>
        )}

        {status.message && (
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, color: '#b45309', fontSize: 13 }}>
            <AlertTriangle size={16} /> {status.message}
          </div>
        )}

        {/* Device binding (online activation) */}
        {status.online && (
          <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 12, color: '#6b7280' }}>
            <span>{t('license.activationMode')}: <strong style={{ color: '#374151' }}>{t('license.online')}</strong></span>
            {status.device_id && (
              <span>{t('license.deviceId')}: <code style={{ color: '#374151' }}>{status.device_id.slice(0, 12)}</code></span>
            )}
            {status.last_validated && (
              <span>{t('license.lastChecked')}: {status.last_validated.slice(0, 10)}</span>
            )}
          </div>
        )}

        {/* Usage vs limits */}
        <div style={{ marginTop: 18, borderTop: '1px solid #f3f4f6', paddingTop: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#6b7280', marginBottom: 10 }}>{t('license.usage')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
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

      {/* Activation */}
      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20 }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#1f2937', marginBottom: 6 }}>
          {status.tier === 'pro' ? t('license.manageKey') : t('license.activateTitle')}
        </div>
        <p style={{ color: '#6b7280', fontSize: 13, marginTop: 0 }}>{t('license.activateHint')}</p>

        <textarea
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          onFocus={focusHandler}
          onBlur={blurHandler}
          placeholder="ZEV-..."
          rows={3}
          style={{
            width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8,
            fontFamily: 'monospace', fontSize: 13, resize: 'vertical', boxSizing: 'border-box',
          }}
        />

        {error && (
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, color: '#dc2626', fontSize: 13 }}>
            <AlertTriangle size={16} /> {error}
          </div>
        )}
        {success && (
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, color: '#10b981', fontSize: 13 }}>
            <Check size={16} /> {success}
          </div>
        )}

        <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={activate}
            disabled={busy || !keyInput.trim()}
            style={{
              background: '#667eea', color: 'white', border: 'none', borderRadius: 8,
              padding: '10px 18px', fontWeight: 600, fontSize: 14,
              cursor: busy || !keyInput.trim() ? 'not-allowed' : 'pointer',
              opacity: busy || !keyInput.trim() ? 0.6 : 1,
              display: 'inline-flex', alignItems: 'center', gap: 8,
            }}
          >
            <KeyRound size={16} /> {t('license.activateButton')}
          </button>
          {status.tier === 'pro' && (
            <button
              onClick={deactivate}
              disabled={busy}
              style={{
                background: 'white', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 8,
                padding: '10px 18px', fontWeight: 600, fontSize: 14, cursor: busy ? 'not-allowed' : 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 8,
              }}
            >
              <Trash2 size={16} /> {t('license.removeButton')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
