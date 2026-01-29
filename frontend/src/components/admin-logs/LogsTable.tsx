import { useTranslation } from '../../i18n';
import type { AdminLog } from '../../types';
import { LogIcon, categorizeAction, type LogCategory } from './LogIcon';
import { getLogColor } from './utils/adminLogsUtils';

interface LogsTableProps {
  logs: AdminLog[];
  loading: boolean;
  filter?: LogCategory | 'all';
}

const categoryLabels: Record<LogCategory, string> = {
  error: 'Error',
  success: 'Success',
  connection: 'Connection',
  disconnect: 'Disconnect',
  reconnect: 'Reconnect',
  auth: 'Auth',
  dns: 'DNS',
  billing: 'Billing',
  security: 'Security',
  collection: 'Collection',
  info: 'Info',
};

const categoryBadgeColors: Record<LogCategory, { bg: string; text: string }> = {
  error:      { bg: '#fef2f2', text: '#dc3545' },
  success:    { bg: '#f0fdf4', text: '#16a34a' },
  connection: { bg: '#ecfdf5', text: '#059669' },
  disconnect: { bg: '#fffbeb', text: '#d97706' },
  reconnect:  { bg: '#fff7ed', text: '#ea580c' },
  auth:       { bg: '#f5f3ff', text: '#7c3aed' },
  dns:        { bg: '#eef2ff', text: '#4f46e5' },
  billing:    { bg: '#f0f9ff', text: '#0284c7' },
  security:   { bg: '#fdf2f8', text: '#db2777' },
  collection: { bg: '#f0fdfa', text: '#0d9488' },
  info:       { bg: '#f3f4f6', text: '#6b7280' },
};

export const LogsTable = ({ logs, loading, filter = 'all' }: LogsTableProps) => {
  const { t } = useTranslation();

  const filteredLogs = filter === 'all'
    ? logs
    : logs.filter(log => categorizeAction(log.action) === filter);

  return (
    <div className="desktop-table" style={{
      backgroundColor: 'white',
      borderRadius: '16px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
      overflow: 'hidden',
      width: '100%'
    }}>
      <div style={{
        padding: '20px',
        borderBottom: '2px solid #f3f4f6',
        backgroundColor: '#f9fafb',
        fontWeight: '700',
        fontSize: '18px',
        color: '#1f2937',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <span>{t('logs.activityLog')}</span>
        <span style={{ fontSize: '13px', fontWeight: '400', color: '#9ca3af' }}>
          {filteredLogs.length} {filter !== 'all' ? `(${categoryLabels[filter]})` : ''} entries
        </span>
      </div>

      <div style={{ maxHeight: '600px', overflow: 'auto', width: '100%' }}>
        <table style={{ width: '100%' }}>
          <thead style={{ position: 'sticky', top: 0, backgroundColor: '#f9fafb', zIndex: 10 }}>
            <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
              <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600', width: '40px' }}></th>
              <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>{t('logs.timestamp')}</th>
              <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>{t('logs.action')}</th>
              <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>{t('logs.details')}</th>
              <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>{t('logs.ipAddress')}</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.map(log => {
              const category = categorizeAction(log.action);
              const badge = categoryBadgeColors[category];
              return (
                <tr key={log.id} style={{
                  borderBottom: '1px solid #f3f4f6',
                  backgroundColor: getLogColor(log.action),
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = getLogColor(log.action)}>
                  <td style={{ padding: '16px', textAlign: 'center' }}>
                    <LogIcon action={log.action} />
                  </td>
                  <td style={{ padding: '16px', fontSize: '13px', color: '#6b7280', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                    {new Date(log.created_at).toLocaleString('de-CH')}
                  </td>
                  <td style={{ padding: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: '600', fontSize: '14px' }}>{log.action}</span>
                      <span style={{
                        fontSize: '11px',
                        fontWeight: '500',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        backgroundColor: badge.bg,
                        color: badge.text,
                        whiteSpace: 'nowrap'
                      }}>
                        {categoryLabels[category]}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: '16px', fontSize: '14px', color: '#6b7280', maxWidth: '400px', wordBreak: 'break-word' }}>
                    {log.details || '-'}
                  </td>
                  <td style={{ padding: '16px', fontSize: '13px', fontFamily: 'monospace', color: '#6b7280' }}>
                    {log.ip_address || '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filteredLogs.length === 0 && !loading && (
        <div style={{ padding: '60px', textAlign: 'center', color: '#9ca3af' }}>
          {filter !== 'all' ? `No ${categoryLabels[filter]} logs found` : t('logs.noLogs')}
        </div>
      )}

      {loading && (
        <div style={{ padding: '60px', textAlign: 'center', color: '#9ca3af' }}>
          {t('logs.loadingLogs')}
        </div>
      )}
    </div>
  );
};
