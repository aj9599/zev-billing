import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client';
import { useTranslation } from '../i18n';
import {
  FileText, Zap, Sun, LogOut, Download, KeyRound, AlertTriangle,
  Battery, Clock, LayoutDashboard, Activity, Building2,
} from 'lucide-react';

interface Me { name: string; email: string; apartment: string; building: string; }
interface Invoice {
  id: number; invoice_number: string; period_start: string; period_end: string;
  total_amount: number; currency: string; status: string; has_pdf: boolean;
}
interface ChargingSession {
  start_time: string; end_time: string; total_kwh: number; solar_kwh: number; grid_kwh: number;
}

type Tab = 'invoices' | 'charging' | 'consumption' | 'live';

const fmtDate = (s: string) => {
  const d = new Date(s);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
};
const fmtDateTime = (s: string) => {
  const d = new Date(s);
  if (isNaN(d.getTime()) || d.getFullYear() < 1972) return '—';
  return d.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
};

export default function TenantPortal() {
  const { t } = useTranslation();
  const [token, setToken] = useState<string | null>(localStorage.getItem('portal_token'));
  const [me, setMe] = useState<Me | null>(null);
  const [tab, setTab] = useState<Tab>('invoices');

  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [charging, setCharging] = useState<ChargingSession[]>([]);

  const logout = useCallback(() => {
    localStorage.removeItem('portal_token');
    setToken(null);
    setMe(null);
    setInvoices([]);
    setCharging([]);
  }, []);

  const doLogin = useCallback(async (c: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.portalLogin(c);
      localStorage.setItem('portal_token', res.token);
      setToken(res.token);
      window.history.replaceState({}, '', '/portal'); // drop ?code= from the URL
    } catch (e: any) {
      setError(t('portal.invalidCode'));
    } finally {
      setBusy(false);
    }
  }, [t]);

  // Auto-login from a ?code= link.
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get('code');
    if (c && !localStorage.getItem('portal_token')) doLogin(c);
  }, [doLogin]);

  // Load profile + data once authenticated.
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const [profile, inv, chg] = await Promise.all([api.portalMe(), api.portalInvoices(), api.portalCharging()]);
        setMe(profile);
        setInvoices(inv ?? []);
        setCharging(chg ?? []);
      } catch {
        logout(); // token invalid/expired
      }
    })();
  }, [token, logout]);

  // --- Login screen ---
  if (!token || !me) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f3f4f6', padding: 16 }}>
        <div style={{ background: 'white', borderRadius: 18, padding: 32, width: '100%', maxWidth: 400, boxShadow: '0 10px 40px rgba(0,0,0,0.12)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 20 }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(135deg, #667eea, #764ba2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <KeyRound size={26} color="white" />
            </div>
            <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: '#1f2937' }}>{t('portal.title')}</h1>
            <p style={{ fontSize: 13, color: '#6b7280', margin: '4px 0 0' }}>{t('portal.loginHint')}</p>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); if (code.trim()) doLogin(code.trim()); }}>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t('portal.codePlaceholder')}
              autoFocus
              style={{ width: '100%', padding: '11px 13px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'monospace' }}
            />
            {error && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 12, color: '#b91c1c', fontSize: 13 }}>
                <AlertTriangle size={15} /> {error}
              </div>
            )}
            <button
              type="submit"
              disabled={busy || !code.trim()}
              style={{ width: '100%', marginTop: 16, padding: '11px', borderRadius: 10, border: 'none', background: busy ? '#9ca3af' : 'linear-gradient(135deg, #667eea, #764ba2)', color: 'white', fontSize: 14, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer' }}
            >
              {busy ? t('portal.signingIn') : t('portal.signIn')}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; Icon: typeof FileText }[] = [
    { key: 'invoices', label: t('portal.tabInvoices'), Icon: FileText },
    { key: 'charging', label: t('portal.tabCharging'), Icon: Zap },
    { key: 'consumption', label: t('portal.tabConsumption'), Icon: LayoutDashboard },
    { key: 'live', label: t('portal.tabLive'), Icon: Activity },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6' }}>
      {/* Header */}
      <div style={{ background: 'white', borderBottom: '1px solid #e5e7eb', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: '#1f2937' }}>{me.name}</h1>
          <p style={{ fontSize: 12.5, color: '#6b7280', margin: '2px 0 0', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Building2 size={13} /> {[me.building, me.apartment].filter(Boolean).join(' · ') || t('portal.title')}
          </p>
        </div>
        <button onClick={logout} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, border: '1px solid #e5e7eb', background: 'white', color: '#6b7280', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          <LogOut size={15} /> {t('portal.logout')}
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '12px 20px 0', overflowX: 'auto' }}>
        {tabs.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '9px 15px', borderRadius: '10px 10px 0 0', border: 'none',
              background: tab === key ? 'white' : 'transparent', color: tab === key ? '#4338ca' : '#6b7280',
              fontSize: 13.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
              boxShadow: tab === key ? '0 -1px 4px rgba(0,0,0,0.04)' : 'none',
            }}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: 20, maxWidth: 820, margin: '0 auto' }}>
        {tab === 'invoices' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {invoices.length === 0 && <Empty text={t('portal.noInvoices')} />}
            {invoices.map((inv) => (
              <div key={inv.id} style={cardStyle}>
                <FileText size={18} color="#667eea" style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#1f2937' }}>{inv.invoice_number}</div>
                  <div style={{ fontSize: 12, color: '#9ca3af' }}>{fmtDate(inv.period_start)} – {fmtDate(inv.period_end)}</div>
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#1f2937', whiteSpace: 'nowrap' }}>
                  {inv.total_amount.toFixed(2)} {inv.currency}
                </div>
                {inv.has_pdf && (
                  <button
                    onClick={() => api.portalDownloadInvoice(inv.id, inv.invoice_number).catch(() => setError(t('portal.downloadFailed')))}
                    title={t('common.download')}
                    style={iconBtnStyle}
                  >
                    <Download size={15} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === 'charging' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {charging.length === 0 && <Empty text={t('portal.noCharging')} />}
            {charging.map((s, i) => (
              <div key={i} style={{ ...cardStyle, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <Zap size={18} color="#16a34a" style={{ flexShrink: 0, marginTop: 2 }} />
                <div style={{ flex: 1, minWidth: 140 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1f2937', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Clock size={12} color="#9ca3af" /> {fmtDateTime(s.start_time)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                  <Chip icon={<Battery size={12} color="#0284c7" />} bg="#f0f9ff" color="#0369a1" text={`${s.total_kwh.toFixed(2)} kWh`} />
                  <Chip icon={<Sun size={12} color="#f59e0b" />} bg="rgba(245,158,11,0.12)" color="#b45309" text={`${s.solar_kwh.toFixed(2)}`} />
                  <Chip icon={<Zap size={12} color="#64748b" />} bg="rgba(100,116,139,0.12)" color="#475569" text={`${s.grid_kwh.toFixed(2)}`} />
                </div>
              </div>
            ))}
          </div>
        )}

        {(tab === 'consumption' || tab === 'live') && (
          <div style={{ ...cardStyle, justifyContent: 'center', color: '#9ca3af', padding: '40px 20px' }}>
            {t('portal.comingSoon')}
          </div>
        )}
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, padding: 14,
  background: 'white', borderRadius: 12, border: '1px solid #e5e7eb',
};
const iconBtnStyle: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 8, border: '1px solid #e5e7eb', background: 'white',
  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#667eea', flexShrink: 0,
};

function Empty({ text }: { text: string }) {
  return <div style={{ textAlign: 'center', color: '#9ca3af', padding: '40px 0', fontSize: 14 }}>{text}</div>;
}

function Chip({ icon, bg, color, text }: { icon: React.ReactNode; bg: string; color: string; text: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 9px', borderRadius: 7, background: bg, color, fontSize: 12, fontWeight: 700 }}>
      {icon} {text}
    </span>
  );
}
