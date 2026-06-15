import { useEffect, useState } from 'react';
import { Database, Download, RefreshCw, Clock, CheckCircle, AlertTriangle, HardDrive } from 'lucide-react';
import { api } from '../api/client';

interface BackupFile {
  name: string;
  size: number;
  modified: string;
  auto: boolean;
}

interface BackupStatus {
  hour: number;
  retention: number;
  last_run: string | null;
  last_name: string;
  last_error: string;
  next_run: string;
  directory: string;
}

const fmtBytes = (n: number) => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

const fmtWhen = (s: string | null) => {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
};

export default function BackupsCard({ t }: { t: (key: string) => string }) {
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const [list, st] = await Promise.all([api.listBackups(), api.getBackupStatus()]);
      setBackups(list ?? []);
      setStatus(st);
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  };

  useEffect(() => { load(); }, []);

  const backupNow = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.runBackupNow();
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const download = async (name: string) => {
    try {
      await api.downloadBackupFile(name);
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  };

  return (
    <div className="settings-card" style={{
      backgroundColor: 'white', borderRadius: '14px', border: '1px solid #e5e7eb',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden', animation: 'st-fadeSlideIn 0.4s ease-out both'
    }}>
      {/* Header */}
      <div style={{ padding: '20px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{
          width: '40px', height: '40px', borderRadius: '10px', background: '#f59e0b',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(245, 158, 11, 0.3)', flexShrink: 0
        }}>
          <Database size={20} color="white" />
        </div>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: '18px', fontWeight: '700', margin: 0, marginBottom: '2px', color: '#1f2937' }}>
            {t('settings.backups')}
          </h2>
          <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0 }}>
            {t('settings.backupsDesc')}
          </p>
        </div>
        <button
          onClick={backupNow}
          disabled={busy}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, border: 'none',
            background: busy ? '#9ca3af' : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
            color: 'white', fontSize: 13, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer', flexShrink: 0
          }}
        >
          <RefreshCw size={14} />
          {busy ? t('settings.backupRunning') : t('settings.backupNow')}
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: '20px 24px' }}>
        {/* Status row */}
        {status && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, marginBottom: 18, fontSize: 13, color: '#374151' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Clock size={14} color="#f59e0b" />
              {t('settings.backupNextRun')}: <strong>{fmtWhen(status.next_run)}</strong>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <CheckCircle size={14} color="#10b981" />
              {t('settings.backupLastRun')}: <strong>{fmtWhen(status.last_run)}</strong>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#6b7280' }}>
              {t('settings.backupKeep').replace('{n}', String(status.retention))}
            </span>
          </div>
        )}

        {status?.last_error && (
          <div style={{
            display: 'flex', gap: 8, padding: '10px 12px', marginBottom: 14, borderRadius: 9,
            backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 12.5
          }}>
            <AlertTriangle size={15} style={{ flexShrink: 0 }} /> {status.last_error}
          </div>
        )}

        {error && (
          <div style={{
            display: 'flex', gap: 8, padding: '10px 12px', marginBottom: 14, borderRadius: 9,
            backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 12.5
          }}>
            <AlertTriangle size={15} style={{ flexShrink: 0 }} /> {error}
          </div>
        )}

        {/* List */}
        {backups.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#9ca3af', padding: '20px 0', fontSize: 13 }}>
            {t('settings.backupNone')}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
            {backups.map((b) => (
              <div key={b.name} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                borderRadius: 10, border: '1px solid #f0f0f0', backgroundColor: '#fafafa'
              }}>
                <HardDrive size={16} color={b.auto ? '#f59e0b' : '#9ca3af'} style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {b.name}
                  </div>
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>
                    {fmtWhen(b.modified)} · {fmtBytes(b.size)}
                  </div>
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px',
                  padding: '2px 7px', borderRadius: 6, flexShrink: 0,
                  backgroundColor: b.auto ? 'rgba(245,158,11,0.12)' : 'rgba(156,163,175,0.15)',
                  color: b.auto ? '#b45309' : '#6b7280'
                }}>
                  {b.auto ? t('settings.backupAuto') : t('settings.backupManual')}
                </span>
                <button
                  onClick={() => download(b.name)}
                  title={t('common.download') || 'Download'}
                  style={{
                    width: 30, height: 30, borderRadius: 8, border: '1px solid #e5e7eb', backgroundColor: 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, color: '#6b7280'
                  }}
                >
                  <Download size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
