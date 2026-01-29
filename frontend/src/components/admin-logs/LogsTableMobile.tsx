import { useTranslation } from '../../i18n';
import type { AdminLog } from '../../types';
import { LogIcon, categorizeAction, type LogCategory } from './LogIcon';
import { getLogBorderColor } from './utils/adminLogsUtils';

interface LogsTableMobileProps {
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

export const LogsTableMobile = ({ logs, loading, filter = 'all' }: LogsTableMobileProps) => {
  const { t } = useTranslation();

  const filteredLogs = filter === 'all'
    ? logs
    : logs.filter(log => categorizeAction(log.action) === filter);

  return (
    <div className="mobile-cards">
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '16px',
        marginBottom: '16px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '4px', color: '#1f2937' }}>
          {t('logs.activityLog')}
        </h3>
        <span style={{ fontSize: '12px', color: '#9ca3af' }}>
          {filteredLogs.length} entries
        </span>
      </div>

      {filteredLogs.map(log => {
        const category = categorizeAction(log.action);
        return (
          <div key={log.id} style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '12px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            borderLeft: `4px solid ${getLogBorderColor(log.action)}`
          }}>
            <div style={{ display: 'flex', alignItems: 'start', gap: '12px', marginBottom: '12px' }}>
              <div style={{ marginTop: '2px' }}>
                <LogIcon action={log.action} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '15px', fontWeight: '600', color: '#1f2937' }}>
                    {log.action}
                  </span>
                  <span style={{
                    fontSize: '10px',
                    fontWeight: '500',
                    padding: '1px 5px',
                    borderRadius: '3px',
                    backgroundColor: getLogBorderColor(log.action) + '18',
                    color: getLogBorderColor(log.action),
                  }}>
                    {categoryLabels[category]}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: '#6b7280', fontFamily: 'monospace', marginBottom: '8px' }}>
                  {new Date(log.created_at).toLocaleString('de-CH')}
                </div>
              </div>
            </div>

            {log.details && (
              <div style={{
                fontSize: '13px',
                color: '#4b5563',
                padding: '12px',
                backgroundColor: '#f9fafb',
                borderRadius: '6px',
                marginBottom: '8px',
                wordBreak: 'break-word'
              }}>
                {log.details}
              </div>
            )}

            {log.ip_address && (
              <div style={{ fontSize: '12px', color: '#9ca3af', fontFamily: 'monospace' }}>
                IP: {log.ip_address}
              </div>
            )}
          </div>
        );
      })}

      {filteredLogs.length === 0 && !loading && (
        <div style={{
          backgroundColor: 'white',
          padding: '40px 20px',
          textAlign: 'center',
          color: '#9ca3af',
          borderRadius: '12px'
        }}>
          {t('logs.noLogs')}
        </div>
      )}

      {loading && (
        <div style={{
          backgroundColor: 'white',
          padding: '40px 20px',
          textAlign: 'center',
          color: '#9ca3af',
          borderRadius: '12px'
        }}>
          {t('logs.loadingLogs')}
        </div>
      )}
    </div>
  );
};
