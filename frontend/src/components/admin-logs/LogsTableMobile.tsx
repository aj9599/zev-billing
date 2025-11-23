import { useTranslation } from '../../i18n';
import type { AdminLog } from '../../types';
import { LogIcon } from './LogIcon';

interface LogsTableMobileProps {
  logs: AdminLog[];
  loading: boolean;
}

export const LogsTableMobile = ({ logs, loading }: LogsTableMobileProps) => {
  const { t } = useTranslation();

  return (
    <div className="mobile-cards">
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '16px',
        marginBottom: '16px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px', color: '#1f2937' }}>
          {t('logs.activityLog')}
        </h3>
      </div>

      {logs.map(log => (
        <div key={log.id} style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '16px',
          marginBottom: '12px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          borderLeft: `4px solid ${
            log.action.toLowerCase().includes('error') || log.action.toLowerCase().includes('failed') 
              ? '#dc3545' 
              : log.action.toLowerCase().includes('success') || log.action.toLowerCase().includes('collected')
              ? '#28a745'
              : '#007bff'
          }`
        }}>
          <div style={{ display: 'flex', alignItems: 'start', gap: '12px', marginBottom: '12px' }}>
            <div style={{ marginTop: '2px' }}>
              <LogIcon action={log.action} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '15px', fontWeight: '600', marginBottom: '4px', color: '#1f2937' }}>
                {log.action}
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
      ))}

      {logs.length === 0 && !loading && (
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