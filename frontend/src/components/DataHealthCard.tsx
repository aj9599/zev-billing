import { useEffect, useState } from 'react';
import { Activity, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { api } from '../api/client';
import type { DataHealth } from '../types';
import { useTranslation } from '../i18n';

// DataHealthCard surfaces meter data-quality at a glance: how fresh each meter's
// reading is and how many implausible consumption spikes were logged recently.
// It self-fetches so the Dashboard only needs to drop <DataHealthCard /> in.
export default function DataHealthCard() {
  const { t } = useTranslation();
  const [data, setData] = useState<DataHealth | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.getDataHealth().then(d => { if (!cancelled) setData(d); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!data) return null;

  const issues = data.stale_count + data.missing_count + data.anomaly_meter_count;
  const healthy = issues === 0;
  const problemMeters = data.meters.filter(m => m.status !== 'fresh' || m.anomaly_count > 0);

  const fmtAge = (mins: number) => {
    if (mins < 0) return t('dashboard.dataHealth.noReadings');
    if (mins < 60) return `${mins}m`;
    if (mins < 1440) return `${Math.floor(mins / 60)}h`;
    return `${Math.floor(mins / 1440)}d`;
  };

  const statusColor = (status: string) =>
    status === 'fresh' ? '#22c55e' : status === 'stale' ? '#f59e0b' : '#ef4444';

  return (
    <div className="fade-in" style={{
      backgroundColor: 'white',
      borderRadius: '12px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
      padding: '20px',
      animationDelay: '0.3s'
    }}>
      <div
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: (expanded && problemMeters.length > 0) ? '16px' : '0',
          cursor: problemMeters.length > 0 ? 'pointer' : 'default'
        }}
        onClick={() => problemMeters.length > 0 && setExpanded(!expanded)}
      >
        <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#374151', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Activity size={18} color={healthy ? '#22c55e' : '#f59e0b'} />
          {t('dashboard.dataHealth.title')}
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {data.total_anomalies > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', color: '#ef4444', fontWeight: 600 }}>
              <AlertTriangle size={14} />
              {data.total_anomalies}
            </span>
          )}
          {data.stale_count > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', color: '#f59e0b', fontWeight: 600 }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#f59e0b', display: 'inline-block' }} />
              {data.stale_count}
            </span>
          )}
          {data.missing_count > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', color: '#ef4444', fontWeight: 600 }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444', display: 'inline-block' }} />
              {data.missing_count}
            </span>
          )}
          {problemMeters.length > 0 && (
            expanded ? <ChevronDown size={16} color="#6b7280" /> : <ChevronRight size={16} color="#6b7280" />
          )}
        </div>
      </div>

      {healthy && (
        <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>
          {t('dashboard.dataHealth.allHealthy')
            .replace('{count}', String(data.total_meters))
            .replace('{days}', String(data.window_days))}
        </p>
      )}

      {expanded && problemMeters.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {problemMeters.map(m => (
            <div key={m.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
              padding: '8px 10px', borderRadius: '8px', backgroundColor: '#f8f9fa'
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: 600, color: '#374151' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: statusColor(m.status), display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
                </div>
                {m.building_name && (
                  <div style={{ fontSize: '12px', color: '#9ca3af', paddingLeft: '14px' }}>{m.building_name}</div>
                )}
                {m.anomaly_count > 0 && (
                  <div style={{ fontSize: '12px', color: '#ef4444', paddingLeft: '14px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <AlertTriangle size={11} />
                    {t('dashboard.dataHealth.anomalies')
                      .replace('{count}', String(m.anomaly_count))
                      .replace('{value}', m.last_anomaly_value ? m.last_anomaly_value.toFixed(0) : '?')}
                  </div>
                )}
              </div>
              <span style={{ fontSize: '12px', color: statusColor(m.status), fontWeight: 600, whiteSpace: 'nowrap', marginLeft: '10px' }}>
                {fmtAge(m.age_minutes)}
              </span>
            </div>
          ))}
          <p style={{ fontSize: '11px', color: '#9ca3af', margin: '4px 2px 0' }}>
            {t('dashboard.dataHealth.windowNote')
              .replace('{days}', String(data.window_days))
              .replace('{threshold}', String(data.spike_threshold))}
          </p>
        </div>
      )}
    </div>
  );
}
