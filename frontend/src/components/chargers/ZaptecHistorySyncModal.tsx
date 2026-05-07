import { useState } from 'react';
import { X, History, Calendar, CheckCircle, AlertTriangle, Download, Info } from 'lucide-react';
import { api } from '../../api/client';
import type { Charger } from '../../types';

interface ZaptecHistorySyncModalProps {
  charger: Charger;
  onClose: () => void;
  onDone: () => void;
  t: (key: string) => string;
}

interface SyncResult {
  fetched: number;
  ocmf_parsed: number;
  fallback: number;
  skipped: number;
  errors: number;
  error?: string;
}

export default function ZaptecHistorySyncModal({ charger, onClose, onDone, t }: ZaptecHistorySyncModalProps) {
  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [from, setFrom] = useState(thirtyDaysAgo);
  const [to, setTo] = useState(today);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  const handleSync = async () => {
    if (!from || !to) return;
    setRunning(true);
    setErrorText(null);
    setResult(null);
    try {
      const res = await api.syncZaptecHistory(charger.id, from, to);
      setResult(res);
      if (res.error) {
        setErrorText(res.error);
      } else {
        // Tell the parent so it can refresh charger lists / live data.
        onDone();
      }
    } catch (err: any) {
      setErrorText(err?.message || String(err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 2000, padding: 16, backdropFilter: 'blur(4px)'
    }}>
      <div style={{
        backgroundColor: '#f9fafb', borderRadius: 16, width: '100%', maxWidth: 540,
        maxHeight: '90vh', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
        display: 'flex', flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 22px', backgroundColor: 'white',
          borderBottom: '1px solid #f0f0f0',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <History size={18} color="white" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1f2937' }}>
                {t('chargers.syncZaptecHistory')}
              </h2>
              <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>
                {charger.name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 30, height: 30, borderRadius: 8, border: 'none',
              backgroundColor: '#f3f4f6', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          >
            <X size={16} color="#6b7280" />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 22px', overflowY: 'auto', flex: 1 }}>
          {/* Info banner */}
          <div style={{
            display: 'flex', gap: 10, padding: '12px 14px',
            backgroundColor: '#fef3ff', border: '1px solid #f0abfc',
            borderRadius: 10, marginBottom: 18, fontSize: 13, color: '#86198f',
            alignItems: 'flex-start'
          }}>
            <Info size={16} style={{ marginTop: 2, flexShrink: 0 }} />
            <span>
              {t('chargers.syncZaptecHistoryDescription')}
            </span>
          </div>

          {/* Date range */}
          <div style={{
            padding: 16, backgroundColor: 'white', borderRadius: 10,
            border: '1px solid #e5e7eb'
          }}>
            <label style={{
              display: 'flex', alignItems: 'center', gap: 6,
              marginBottom: 10, fontWeight: 600, fontSize: 13, color: '#374151'
            }}>
              <Calendar size={14} color="#a855f7" />
              {t('export.dateRange') || 'Date range'}
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{
                  display: 'block', marginBottom: 4, fontSize: 12, color: '#6b7280',
                  fontWeight: 500
                }}>
                  {t('export.startDate')}
                </label>
                <input
                  type="date" value={from} max={to}
                  onChange={(e) => setFrom(e.target.value)}
                  disabled={running}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{
                  display: 'block', marginBottom: 4, fontSize: 12, color: '#6b7280',
                  fontWeight: 500
                }}>
                  {t('export.endDate')}
                </label>
                <input
                  type="date" value={to} min={from}
                  onChange={(e) => setTo(e.target.value)}
                  disabled={running}
                  style={inputStyle}
                />
              </div>
            </div>
          </div>

          {/* Result */}
          {result && !result.error && (
            <div style={{
              marginTop: 18, padding: '14px 16px',
              backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0',
              borderRadius: 10, color: '#166534'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontWeight: 600 }}>
                <CheckCircle size={16} />
                {t('chargers.syncCompleted')}
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.7 }}>
                <div>{t('chargers.syncFetched')}: <strong>{result.fetched}</strong></div>
                <div>{t('chargers.syncOcmf')}: <strong>{result.ocmf_parsed}</strong></div>
                {result.fallback > 0 && (
                  <div>{t('chargers.syncFallback')}: <strong>{result.fallback}</strong></div>
                )}
                {result.skipped > 0 && (
                  <div>{t('chargers.syncSkipped')}: <strong>{result.skipped}</strong></div>
                )}
                {result.errors > 0 && (
                  <div style={{ color: '#b91c1c' }}>
                    {t('chargers.syncErrors')}: <strong>{result.errors}</strong>
                  </div>
                )}
              </div>
            </div>
          )}

          {errorText && (
            <div style={{
              marginTop: 18, padding: '14px 16px',
              backgroundColor: '#fef2f2', border: '1px solid #fecaca',
              borderRadius: 10, color: '#b91c1c',
              display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13
            }}>
              <AlertTriangle size={16} style={{ marginTop: 2, flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{t('chargers.syncFailed')}</div>
                <div style={{ wordBreak: 'break-word' }}>{errorText}</div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 22px', backgroundColor: 'white',
          borderTop: '1px solid #f0f0f0', display: 'flex', gap: 10
        }}>
          <button
            onClick={handleSync}
            disabled={running || !from || !to}
            style={{
              flex: 1, padding: '11px 20px', borderRadius: 10, border: 'none',
              background: running
                ? '#9ca3af'
                : 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
              color: 'white', fontSize: 14, fontWeight: 600,
              cursor: running ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: running ? 'none' : '0 2px 8px rgba(168,85,247,0.35)'
            }}
          >
            <Download size={16} />
            {running ? t('chargers.syncRunning') : t('chargers.syncStart')}
          </button>
          <button
            onClick={onClose}
            disabled={running}
            style={{
              padding: '11px 20px', borderRadius: 10,
              backgroundColor: 'white', color: '#6b7280',
              border: '1px solid #e5e7eb',
              fontSize: 14, fontWeight: 600,
              cursor: running ? 'not-allowed' : 'pointer'
            }}
          >
            {result && !errorText ? t('common.close') : t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 11px', border: '1px solid #e5e7eb',
  borderRadius: 8, fontSize: 14, color: '#1f2937', backgroundColor: 'white',
  outline: 'none'
};
