import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, UserCheck, Search, RotateCcw, AlertTriangle, CheckCircle } from 'lucide-react';
import { api } from '../../api/client';
import type { Charger, User } from '../../types';

// Assign charges recorded without a card (empty user) to a user's card for a
// date range — e.g. the weeks before the Loxone release was set up. Preview
// first, confirm, and every assignment can be undone.

interface Props {
  charger: Charger;
  onClose: () => void;
  t: (key: string) => string;
}

type Preview = { from: string; to: string; rows: number; sessions: number; kwh: number; first?: string; last?: string };
type Batch = {
  id: number; token: string; from: string; to: string; rows: number; kwh: number; sessions: number;
  created_at: string; undone_at: string;
};

const cards = (u: User): string[] => (u.charger_ids || '').split(',').map((s) => s.trim()).filter(Boolean);

const fmtDay = (s: string) => {
  const [y, m, d] = (s || '').split('-');
  return y && m && d ? `${d}.${m}.${y}` : s;
};

export default function ZaptecAssignModal({ charger, onClose, t }: Props) {
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const [from, setFrom] = useState(iso(firstOfMonth));
  const [to, setTo] = useState(iso(now));
  const [token, setToken] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const loadBatches = useCallback(async () => {
    try {
      setBatches((await api.getAssignBatches(charger.id)) ?? []);
    } catch { /* list stays empty */ }
  }, [charger.id]);

  useEffect(() => {
    (async () => {
      try {
        const all = await api.getUsers(charger.building_id);
        setUsers((all ?? []).filter((u) => cards(u).length > 0));
      } catch { /* dropdown stays empty */ }
    })();
    loadBatches();
  }, [charger.building_id, loadBatches]);

  // One option per card, labelled with its user (a user may own several cards).
  const options = useMemo(() => {
    const out: { token: string; label: string }[] = [];
    for (const u of users) {
      for (const c of cards(u)) {
        out.push({ token: c, label: `${u.first_name} ${u.last_name} – ${c}` });
      }
    }
    return out;
  }, [users]);

  const labelFor = (tok: string) => options.find((o) => o.token === tok)?.label ?? tok;

  // Any change of range/card invalidates the preview.
  useEffect(() => { setPreview(null); setConfirming(false); }, [from, to, token]);

  const doPreview = async () => {
    setBusy(true); setError(null); setDone(null);
    try {
      setPreview(await api.previewUnassignedCharges(charger.id, from, to));
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const doAssign = async () => {
    setBusy(true); setError(null);
    try {
      const r = await api.assignUnassignedCharges(charger.id, from, to, token);
      setDone(t('chargers.assign.done')
        .replace('{sessions}', String(r.sessions))
        .replace('{kwh}', r.kwh.toFixed(2))
        .replace('{user}', labelFor(token)));
      setPreview(null); setConfirming(false);
      loadBatches();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const doUndo = async (b: Batch) => {
    if (!window.confirm(t('chargers.assign.undoConfirm').replace('{user}', labelFor(b.token))
      .replace('{from}', fmtDay(b.from)).replace('{to}', fmtDay(b.to)))) return;
    setBusy(true); setError(null); setDone(null);
    try {
      const r = await api.undoAssignBatch(charger.id, b.id);
      setDone(t('chargers.assign.undone').replace('{rows}', String(r.rows)));
      loadBatches();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const content = (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 2000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
    }} onClick={onClose}>
      <div style={{
        backgroundColor: 'white', borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '90vh',
        overflowY: 'auto', boxShadow: '0 20px 50px rgba(0,0,0,0.25)'
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 20px', borderBottom: '1px solid #f3f4f6' }}>
          <UserCheck size={20} color="#7c3aed" />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#111827' }}>{t('chargers.assign.title')}</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>{charger.name}</div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#6b7280' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: 20, display: 'grid', gap: 14 }}>
          <p style={{ margin: 0, fontSize: 13, color: '#4b5563' }}>{t('chargers.assign.intro')}</p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label style={labelStyle}>
              {t('chargers.assign.from')}
              <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              {t('chargers.assign.to')}
              <input type="date" value={to} min={from} max={iso(now)} onChange={(e) => setTo(e.target.value)} style={inputStyle} />
            </label>
          </div>

          <label style={labelStyle}>
            {t('chargers.assign.user')}
            <select value={token} onChange={(e) => setToken(e.target.value)} style={inputStyle}>
              <option value="">{t('chargers.assign.chooseUser')}</option>
              {options.map((o) => <option key={o.token} value={o.token}>{o.label}</option>)}
            </select>
          </label>
          {options.length === 0 && (
            <div style={{ fontSize: 12, color: '#b45309', marginTop: -6 }}>{t('chargers.assign.noCards')}</div>
          )}

          <button onClick={doPreview} disabled={busy || !from || !to} style={btn('#eef2ff', '#4338ca')}>
            <Search size={15} /> {t('chargers.assign.preview')}
          </button>

          {preview && (
            <div style={{ padding: 14, borderRadius: 10, backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', fontSize: 13 }}>
              {preview.rows === 0 ? (
                <span style={{ color: '#6b7280' }}>{t('chargers.assign.nothing')}</span>
              ) : (
                <>
                  <div style={{ fontWeight: 700, color: '#111827', marginBottom: 4 }}>
                    {t('chargers.assign.found')
                      .replace('{sessions}', String(preview.sessions))
                      .replace('{kwh}', preview.kwh.toFixed(2))}
                  </div>
                  {preview.first && (
                    <div style={{ color: '#6b7280' }}>
                      {t('chargers.assign.span').replace('{first}', preview.first).replace('{last}', preview.last || '')}
                    </div>
                  )}
                  <div style={{ color: '#9ca3af', fontSize: 12, marginTop: 4 }}>
                    {t('chargers.assign.rowsHint').replace('{rows}', String(preview.rows))}
                  </div>
                  {!confirming ? (
                    <button onClick={() => setConfirming(true)} disabled={busy || !token}
                      style={{ ...btn('#7c3aed', 'white'), marginTop: 12, width: '100%' }}>
                      <UserCheck size={15} /> {token ? t('chargers.assign.assignTo').replace('{user}', labelFor(token)) : t('chargers.assign.chooseUser')}
                    </button>
                  ) : (
                    <div style={{ marginTop: 12, padding: 12, borderRadius: 10, backgroundColor: '#fef3c7', border: '1px solid #fde68a' }}>
                      <div style={{ display: 'flex', gap: 8, color: '#92400e', fontSize: 13 }}>
                        <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                        <span>{t('chargers.assign.confirm')
                          .replace('{sessions}', String(preview.sessions))
                          .replace('{kwh}', preview.kwh.toFixed(2))
                          .replace('{from}', fmtDay(from)).replace('{to}', fmtDay(to))
                          .replace('{user}', labelFor(token))}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        <button onClick={() => setConfirming(false)} disabled={busy} style={{ ...btn('white', '#374151'), flex: 1, border: '1px solid #d1d5db' }}>
                          {t('common.cancel')}
                        </button>
                        <button onClick={doAssign} disabled={busy} style={{ ...btn('#7c3aed', 'white'), flex: 1 }}>
                          {t('chargers.assign.confirmButton')}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {error && <div style={{ color: '#b91c1c', fontSize: 13 }}>{error}</div>}
          {done && (
            <div style={{ display: 'flex', gap: 8, color: '#047857', fontSize: 13 }}>
              <CheckCircle size={16} style={{ flexShrink: 0 }} /> {done}
            </div>
          )}

          {batches.length > 0 && (
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#374151', margin: '6px 0 8px' }}>{t('chargers.assign.history')}</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {batches.map((b) => (
                  <div key={b.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10,
                    border: '1px solid #e5e7eb', opacity: b.undone_at ? 0.55 : 1, fontSize: 12
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: '#111827' }}>
                        {fmtDay(b.from)} – {fmtDay(b.to)} → {labelFor(b.token)}
                      </div>
                      <div style={{ color: '#6b7280' }}>
                        {b.sessions} {t('chargers.assign.charges')} · {b.kwh.toFixed(2)} kWh · {b.created_at.slice(0, 16)}
                        {b.undone_at && ` · ${t('chargers.assign.undoneLabel')}`}
                      </div>
                    </div>
                    {!b.undone_at && (
                      <button onClick={() => doUndo(b)} disabled={busy} title={t('chargers.assign.undo')}
                        style={{ ...btn('#fef2f2', '#b91c1c'), padding: '6px 10px' }}>
                        <RotateCcw size={14} /> {t('chargers.assign.undo')}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

const labelStyle: React.CSSProperties = {
  display: 'grid', gap: 4, fontSize: 12, fontWeight: 600, color: '#374151'
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb',
  borderRadius: 8, fontSize: 13, color: '#1f2937', backgroundColor: 'white', outline: 'none'
};

const btn = (bg: string, fg: string): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '9px 14px', borderRadius: 10, border: 'none', backgroundColor: bg, color: fg,
  fontWeight: 600, fontSize: 13, cursor: 'pointer'
});
