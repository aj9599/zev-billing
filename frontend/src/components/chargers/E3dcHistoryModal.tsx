import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, History, Sun, Zap, Battery, CreditCard, Clock, AlertTriangle } from 'lucide-react';
import { api } from '../../api/client';
import type { Charger } from '../../types';

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

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await api.getE3dcSessionHistory(charger.id);
        if (active) setSessions(data ?? []);
      } catch (e: any) {
        if (active) setError(e?.message || String(e));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [charger.id]);

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
          <button onClick={onClose} style={{
            width: 30, height: 30, borderRadius: 8, border: 'none',
            backgroundColor: '#f3f4f6', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <X size={16} color="#6b7280" />
          </button>
        </div>

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
                    {s.rfid && (
                      <span style={{
                        display: 'flex', alignItems: 'center', gap: 4, padding: '4px 9px', borderRadius: 7,
                        backgroundColor: 'rgba(124,58,237,0.1)', color: '#5b21b6', fontSize: 12, fontWeight: 700,
                        fontFamily: 'monospace'
                      }} title={s.rfid}>
                        <CreditCard size={12} color="#7c3aed" /> {s.rfid}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
