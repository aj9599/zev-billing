import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, KeyRound, Copy, RefreshCw, Ban, Check, AlertTriangle } from 'lucide-react';
import { api } from '../../api/client';

interface Props {
  userId: number;
  userName: string;
  onClose: () => void;
  t: (key: string) => string;
}

export default function PortalLinkModal({ userId, userName, onClose, t }: Props) {
  const [token, setToken] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const link = token ? `${window.location.origin}/portal?code=${token}` : '';

  const load = async () => {
    try {
      const res = await api.getUserPortalToken(userId);
      setToken(res.token || '');
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [userId]);

  const generate = async () => {
    setBusy(true); setError(null);
    try {
      const res = await api.generateUserPortalToken(userId);
      setToken(res.token);
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setBusy(false); }
  };

  const revoke = async () => {
    if (!confirm(t('portal.admin.revokeConfirm'))) return;
    setBusy(true); setError(null);
    try {
      await api.revokeUserPortalToken(userId);
      setToken('');
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setBusy(false); }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked — user can select manually */ }
  };

  const content = (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 16, backdropFilter: 'blur(4px)' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #667eea, #764ba2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <KeyRound size={18} color="white" />
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#1f2937' }}>{t('portal.admin.title')}</h2>
            <p style={{ margin: 0, fontSize: 12.5, color: '#6b7280' }}>{userName}</p>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: '#f3f4f6', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={16} color="#6b7280" />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 22px' }}>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: '#4b5563', lineHeight: 1.55 }}>
            {t('portal.admin.desc')}
          </p>

          {error && (
            <div style={{ display: 'flex', gap: 8, padding: '10px 12px', marginBottom: 14, borderRadius: 9, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 12.5 }}>
              <AlertTriangle size={15} style={{ flexShrink: 0 }} /> {error}
            </div>
          )}

          {loading ? (
            <div style={{ textAlign: 'center', color: '#9ca3af', padding: '20px 0', fontSize: 13 }}>{t('common.loading')}</div>
          ) : token ? (
            <>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{t('portal.admin.linkLabel')}</label>
              <div style={{ display: 'flex', gap: 8, marginTop: 6, marginBottom: 16 }}>
                <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} style={{ flex: 1, padding: '9px 11px', border: '1px solid #e5e7eb', borderRadius: 9, fontSize: 12.5, color: '#374151', fontFamily: 'monospace', outline: 'none', minWidth: 0 }} />
                <button onClick={copy} title={t('portal.admin.copy')} style={{ padding: '0 12px', borderRadius: 9, border: 'none', background: copied ? '#16a34a' : 'linear-gradient(135deg, #667eea, #764ba2)', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {copied ? <Check size={15} /> : <Copy size={15} />}
                  {copied ? t('portal.admin.copied') : t('portal.admin.copy')}
                </button>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={generate} disabled={busy} style={{ flex: 1, padding: '9px', borderRadius: 9, border: '1px solid #e5e7eb', background: 'white', color: '#374151', fontSize: 13, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                  <RefreshCw size={14} /> {t('portal.admin.regenerate')}
                </button>
                <button onClick={revoke} disabled={busy} style={{ flex: 1, padding: '9px', borderRadius: 9, border: '1px solid #fecaca', background: 'white', color: '#dc2626', fontSize: 13, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                  <Ban size={14} /> {t('portal.admin.revoke')}
                </button>
              </div>
              <p style={{ margin: '14px 0 0', fontSize: 11.5, color: '#9ca3af', lineHeight: 1.5 }}>{t('portal.admin.regenHint')}</p>
            </>
          ) : (
            <button onClick={generate} disabled={busy} style={{ width: '100%', padding: '11px', borderRadius: 10, border: 'none', background: busy ? '#9ca3af' : 'linear-gradient(135deg, #667eea, #764ba2)', color: 'white', fontSize: 14, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <KeyRound size={16} /> {t('portal.admin.generate')}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
