import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, History, Sun, Zap, Battery, Clock, AlertTriangle, RefreshCw, Calendar, CheckCircle, User as UserIcon } from 'lucide-react';
import { api } from '../../api/client';
import type { Charger, User } from '../../types';

// First RFID token from a user's comma-separated card list (charger_ids holds
// the RFID cards for RFID-attributed chargers like E3/DC).
const firstRfid = (u: User): string => (u.charger_ids || '').split(',').map((s) => s.trim()).filter(Boolean)[0] || '';

interface E3dcHistoryModalProps {
  charger: Charger;
  onClose: () => void;
  t: (key: string) => string;
}

interface E3dcSession {
  id: number;
  session_key: string;
  start_time: string;
  end_time: string;
  total_kwh: number;
  solar_kwh: number;
  grid_kwh: number;
  rfid: string;
  source: string;
}

const isValidDate = (s: string) => {
  if (!s) return false;
  const d = new Date(s);
  return !isNaN(d.getTime()) && d.getFullYear() > 1971;
};

const fmtDate = (s: string) =>
  isValidDate(s) ? new Date(s).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const fmtTime = (s: string) =>
  isValidDate(s) ? new Date(s).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }) : '—';

const fmtDuration = (a: string, b: string) => {
  if (!isValidDate(a) || !isValidDate(b)) return '';
  const ms = new Date(b).getTime() - new Date(a).getTime();
  if (ms <= 0) return '';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

export default function E3dcHistoryModal({ charger, onClose, t }: E3dcHistoryModalProps) {
  const [sessions, setSessions] = useState<E3dcSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Rescan (rebuild reconstructed history) panel state.
  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [showRescan, setShowRescan] = useState(false);
  const [rFrom, setRFrom] = useState(thirtyDaysAgo);
  const [rTo, setRTo] = useState(today);
  const [rescanning, setRescanning] = useState(false);
  const [rescanResult, setRescanResult] = useState<{ deleted: number; inserted: number } | null>(null);
  const [rescanError, setRescanError] = useState<string | null>(null);

  // Users (for the assignment dropdown) + per-session save state.
  const [users, setUsers] = useState<User[]>([]);
  const [savingId, setSavingId] = useState<number | null>(null);
  // Pending reassignment awaiting confirmation (only when overwriting/clearing).
  const [pendingAssign, setPendingAssign] = useState<{ session: E3dcSession; userId: string } | null>(null);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getE3dcSessionHistory(charger.id);
      setSessions(data ?? []);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [charger.id]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  useEffect(() => {
    (async () => {
      try {
        const all = await api.getUsers(charger.building_id);
        setUsers((all ?? []).filter((u) => firstRfid(u)));
      } catch { /* dropdown just stays empty */ }
    })();
  }, [charger.building_id]);

  // Map an RFID token to the owning user, so a session shows who it belongs to.
  const userByRfid = useMemo(() => {
    const m = new Map<string, User>();
    for (const u of users) {
      for (const tok of (u.charger_ids || '').split(',').map((s) => s.trim()).filter(Boolean)) {
        if (!m.has(tok)) m.set(tok, u);
      }
    }
    return m;
  }, [users]);

  // Human label for an RFID token: the owning tenant's name, else the raw token,
  // else "Unassigned".
  const labelFor = (rfid: string): string => {
    if (!rfid) return t('chargers.history.unassigned');
    const u = userByRfid.get(rfid);
    return u ? `${u.first_name} ${u.last_name}` : rfid;
  };

  // Dropdown change: confirm first only when overwriting a different existing
  // assignment (or clearing one); a fresh assignment saves immediately.
  const requestAssign = (session: E3dcSession, userId: string) => {
    const newRfid = userId ? firstRfid(users.find((u) => String(u.id) === userId)!) : '';
    if (newRfid === session.rfid) return; // no change
    if (session.rfid) {
      setPendingAssign({ session, userId }); // overwriting/clearing → confirm
      return;
    }
    assignUser(session, userId);
  };

  const assignUser = async (session: E3dcSession, userId: string) => {
    const rfid = userId ? firstRfid(users.find((u) => String(u.id) === userId)!) : '';
    setSavingId(session.id);
    try {
      await api.assignE3dcSession(charger.id, session.id, rfid);
      // Reflect locally without a full reload.
      setSessions((prev) => prev.map((s) => (s.id === session.id ? { ...s, rfid } : s)));
    } catch (e: any) {
      alert(t('chargers.history.assignFailed') + ': ' + (e?.message || String(e)));
    } finally {
      setSavingId(null);
    }
  };

  const handleRescan = async () => {
    if (!rFrom || !rTo) return;
    setRescanning(true);
    setRescanError(null);
    setRescanResult(null);
    try {
      const res = await api.rescanE3dcBackfill(charger.id, rFrom, rTo);
      setRescanResult({ deleted: res.deleted, inserted: res.inserted });
      await loadSessions(); // refresh the list with the rebuilt rows
    } catch (e: any) {
      setRescanError(e?.message || String(e));
    } finally {
      setRescanning(false);
    }
  };

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose]);

  const totals = sessions.reduce(
    (acc, s) => ({ total: acc.total + s.total_kwh, solar: acc.solar + s.solar_kwh, grid: acc.grid + s.grid_kwh }),
    { total: 0, solar: 0, grid: 0 }
  );

  const content = (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 2000, padding: 16, backdropFilter: 'blur(4px)'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: '#f9fafb', borderRadius: 16, width: '100%', maxWidth: 600,
          maxHeight: '90vh', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
          display: 'flex', flexDirection: 'column'
        }}
      >
        {/* Header */}
        <div style={{
          padding: '18px 22px', backgroundColor: 'white', borderBottom: '1px solid #f0f0f0',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <History size={18} color="white" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1f2937' }}>
                {t('chargers.chargingHistory')}
              </h2>
              <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>{charger.name}</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => { setShowRescan((v) => !v); setRescanResult(null); setRescanError(null); }}
              title={t('chargers.history.rebuild')}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8,
                border: '1px solid #fde68a', backgroundColor: showRescan ? '#fef3c7' : '#fffbeb',
                color: '#b45309', fontSize: 12, fontWeight: 600, cursor: 'pointer'
              }}
            >
              <RefreshCw size={14} />
              {t('chargers.history.rebuild')}
            </button>
            <button onClick={onClose} style={{
              width: 30, height: 30, borderRadius: 8, border: 'none',
              backgroundColor: '#f3f4f6', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <X size={16} color="#6b7280" />
            </button>
          </div>
        </div>

        {/* Rescan / rebuild panel */}
        {showRescan && (
          <div style={{ padding: '16px 22px', backgroundColor: '#fffbeb', borderBottom: '1px solid #fde68a' }}>
            <div style={{
              display: 'flex', gap: 10, padding: '12px 14px', marginBottom: 14,
              backgroundColor: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 10,
              fontSize: 12.5, color: '#92400e', alignItems: 'flex-start', lineHeight: 1.5
            }}>
              <AlertTriangle size={16} style={{ marginTop: 1, flexShrink: 0 }} />
              <span>{t('chargers.history.rebuildWarning')}</span>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontWeight: 600, fontSize: 13, color: '#374151' }}>
              <Calendar size={14} color="#d97706" />
              {t('export.dateRange') || 'Date range'}
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, alignItems: 'end' }}>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#6b7280', fontWeight: 500 }}>{t('export.startDate')}</label>
                <input type="date" value={rFrom} max={rTo} disabled={rescanning}
                  onChange={(e) => setRFrom(e.target.value)} style={dateInputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#6b7280', fontWeight: 500 }}>{t('export.endDate')}</label>
                <input type="date" value={rTo} min={rFrom} disabled={rescanning}
                  onChange={(e) => setRTo(e.target.value)} style={dateInputStyle} />
              </div>
              <button
                onClick={handleRescan}
                disabled={rescanning || !rFrom || !rTo}
                style={{
                  padding: '9px 16px', borderRadius: 8, border: 'none',
                  background: rescanning ? '#9ca3af' : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                  color: 'white', fontSize: 13, fontWeight: 600,
                  cursor: rescanning ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap'
                }}
              >
                <RefreshCw size={14} />
                {rescanning ? t('chargers.history.rebuilding') : t('chargers.history.rebuildConfirm')}
              </button>
            </div>

            {rescanResult && (
              <div style={{
                marginTop: 12, padding: '10px 14px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0',
                borderRadius: 10, color: '#166534', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8
              }}>
                <CheckCircle size={15} />
                {t('chargers.history.rebuildDone')
                  .replace('{inserted}', String(rescanResult.inserted))
                  .replace('{deleted}', String(rescanResult.deleted))}
              </div>
            )}
            {rescanError && (
              <div style={{
                marginTop: 12, padding: '10px 14px', backgroundColor: '#fef2f2', border: '1px solid #fecaca',
                borderRadius: 10, color: '#b91c1c', fontSize: 13, display: 'flex', alignItems: 'flex-start', gap: 8
              }}>
                <AlertTriangle size={15} style={{ marginTop: 1, flexShrink: 0 }} />
                <span style={{ wordBreak: 'break-word' }}>{rescanError}</span>
              </div>
            )}
          </div>
        )}

        {/* Summary */}
        {sessions.length > 0 && (
          <div style={{
            display: 'flex', gap: 18, padding: '12px 22px', backgroundColor: 'white',
            borderBottom: '1px solid #f0f0f0', fontSize: 13, color: '#374151', flexWrap: 'wrap'
          }}>
            <span><strong>{sessions.length}</strong> {t('chargers.history.sessions')}</span>
            <span style={{ color: '#1f2937' }}><Battery size={12} style={{ verticalAlign: -1 }} /> {totals.total.toFixed(1)} kWh</span>
            <span style={{ color: '#b45309' }}><Sun size={12} style={{ verticalAlign: -1 }} /> {totals.solar.toFixed(1)} kWh</span>
            <span style={{ color: '#475569' }}><Zap size={12} style={{ verticalAlign: -1 }} /> {totals.grid.toFixed(1)} kWh</span>
          </div>
        )}

        {/* Body */}
        <div style={{ padding: '16px 22px', overflowY: 'auto', flex: 1 }}>
          {loading && (
            <div style={{ textAlign: 'center', color: '#6b7280', padding: '40px 0', fontSize: 14 }}>
              {t('common.loading') || 'Loading…'}
            </div>
          )}

          {error && (
            <div style={{
              padding: '14px 16px', backgroundColor: '#fef2f2', border: '1px solid #fecaca',
              borderRadius: 10, color: '#b91c1c', display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13
            }}>
              <AlertTriangle size={16} style={{ marginTop: 2, flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{t('chargers.history.loadFailed')}</div>
                <div style={{ wordBreak: 'break-word' }}>{error}</div>
              </div>
            </div>
          )}

          {!loading && !error && sessions.length === 0 && (
            <div style={{ textAlign: 'center', color: '#9ca3af', padding: '40px 0', fontSize: 14 }}>
              {t('chargers.history.empty')}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sessions.map((s) => {
              const dur = fmtDuration(s.start_time, s.end_time);
              return (
                <div key={s.id} style={{
                  padding: 14, backgroundColor: 'white', borderRadius: 12, border: '1px solid #e5e7eb'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#1f2937' }}>{fmtDate(s.start_time)}</div>
                      <div style={{ fontSize: 12, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <Clock size={11} />
                        {fmtTime(s.start_time)} – {fmtTime(s.end_time)}{dur ? ` · ${dur}` : ''}
                      </div>
                    </div>
                    {s.source === 'backfill' && (
                      <span style={{
                        padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                        backgroundColor: '#f3f4f6', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.3px', flexShrink: 0
                      }} title={t('chargers.history.backfillHint')}>
                        {t('chargers.history.reconstructed')}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{
                      display: 'flex', alignItems: 'center', gap: 4, padding: '4px 9px', borderRadius: 7,
                      backgroundColor: '#f0f9ff', color: '#0369a1', fontSize: 12, fontWeight: 700
                    }}>
                      <Battery size={12} color="#0284c7" /> {s.total_kwh.toFixed(3)} kWh
                    </span>
                    {(s.solar_kwh > 0 || s.grid_kwh > 0) && (
                      <>
                        <span style={{
                          display: 'flex', alignItems: 'center', gap: 4, padding: '4px 9px', borderRadius: 7,
                          backgroundColor: 'rgba(245,158,11,0.12)', color: '#b45309', fontSize: 12, fontWeight: 700
                        }}>
                          <Sun size={12} color="#f59e0b" /> {t('chargers.session.solar')} {s.solar_kwh.toFixed(2)}
                        </span>
                        <span style={{
                          display: 'flex', alignItems: 'center', gap: 4, padding: '4px 9px', borderRadius: 7,
                          backgroundColor: 'rgba(100,116,139,0.12)', color: '#475569', fontSize: 12, fontWeight: 700
                        }}>
                          <Zap size={12} color="#64748b" /> {t('chargers.session.grid')} {s.grid_kwh.toFixed(2)}
                        </span>
                      </>
                    )}
                    {/* User assignment — pick the tenant; sets the RFID on this
                        session and the underlying 15-min rows so billing follows. */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <UserIcon size={12} color="#7c3aed" />
                      <select
                        value={userByRfid.get(s.rfid)?.id ?? ''}
                        disabled={savingId === s.id}
                        onChange={(e) => requestAssign(s, e.target.value)}
                        style={{
                          fontSize: 12, fontWeight: 600, color: '#5b21b6',
                          border: '1px solid #e9d5ff', borderRadius: 7, padding: '3px 6px',
                          backgroundColor: 'white', cursor: savingId === s.id ? 'wait' : 'pointer', maxWidth: 200
                        }}
                      >
                        <option value="">{t('chargers.history.unassigned')}</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>
                        ))}
                      </select>
                      {s.rfid && !userByRfid.has(s.rfid) && (
                        <span style={{ fontSize: 11, color: '#9ca3af', fontFamily: 'monospace' }} title={s.rfid}>
                          {s.rfid}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {pendingAssign && (() => {
        const s = pendingAssign.session;
        const newUser = pendingAssign.userId ? users.find((u) => String(u.id) === pendingAssign.userId) : null;
        const currentLabel = labelFor(s.rfid);
        const newLabel = newUser ? `${newUser.first_name} ${newUser.last_name}` : t('chargers.history.unassigned');
        return (
          <div
            onClick={(e) => { e.stopPropagation(); setPendingAssign(null); }}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2100, padding: 16
            }}
          >
            <div onClick={(e) => e.stopPropagation()} style={{
              backgroundColor: 'white', borderRadius: 14, padding: 22, maxWidth: 400, width: '100%',
              boxShadow: '0 20px 60px rgba(0,0,0,0.25)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <AlertTriangle size={17} color="#d97706" />
                </div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1f2937' }}>{t('chargers.history.reassignTitle')}</h3>
              </div>
              <p style={{ margin: '0 0 18px 0', fontSize: 13.5, color: '#4b5563', lineHeight: 1.55 }}>
                {t('chargers.history.reassignBody').replace('{current}', currentLabel).replace('{new}', newLabel)}
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => { const p = pendingAssign; setPendingAssign(null); assignUser(p.session, p.userId); }}
                  style={{
                    flex: 1, padding: '10px 16px', borderRadius: 9, border: 'none',
                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    color: 'white', fontSize: 13.5, fontWeight: 600, cursor: 'pointer'
                  }}
                >
                  {t('chargers.history.reassignConfirm')}
                </button>
                <button
                  onClick={() => setPendingAssign(null)}
                  style={{
                    padding: '10px 16px', borderRadius: 9, backgroundColor: 'white', color: '#6b7280',
                    border: '1px solid #e5e7eb', fontSize: 13.5, fontWeight: 600, cursor: 'pointer'
                  }}
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );

  return createPortal(content, document.body);
}

const dateInputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb',
  borderRadius: 8, fontSize: 13, color: '#1f2937', backgroundColor: 'white', outline: 'none'
};
