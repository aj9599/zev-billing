import { useTranslation } from '../../i18n';
import type { AdminLog } from '../../types';
import { LogIcon } from './LogIcon';
import { getLogColor } from './utils/adminLogsUtils';

interface LogsTableProps {
  logs: AdminLog[];
  loading: boolean;
}

export const LogsTable = ({ logs, loading }: LogsTableProps) => {
  const { t } = useTranslation();

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
        color: '#1f2937'
      }}>
        {t('logs.activityLog')}
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
            {logs.map(log => (
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
                <td style={{ padding: '16px', fontWeight: '600', fontSize: '14px' }}>{log.action}</td>
                <td style={{ padding: '16px', fontSize: '14px', color: '#6b7280', maxWidth: '400px', wordBreak: 'break-word' }}>
                  {log.details || '-'}
                </td>
                <td style={{ padding: '16px', fontSize: '13px', fontFamily: 'monospace', color: '#6b7280' }}>
                  {log.ip_address || '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {logs.length === 0 && !loading && (
        <div style={{ padding: '60px', textAlign: 'center', color: '#9ca3af' }}>
          {t('logs.noLogs')}
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