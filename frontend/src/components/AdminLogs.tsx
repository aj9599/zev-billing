import { useState, useEffect } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import { api } from '../api/client';
import type { AdminLog } from '../types';

export default function AdminLogs() {
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const data = await api.getLogs(100);
      setLogs(data);
    } catch (err) {
      console.error('Failed to load logs:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Activity size={32} />
          System Logs & Health
        </h1>
        <button
          onClick={loadLogs}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
            backgroundColor: '#007bff', color: 'white', border: 'none',
            borderRadius: '6px', fontSize: '14px', opacity: loading ? 0.7 : 1
          }}
        >
          <RefreshCw size={18} />
          Refresh
        </button>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '20px',
        marginBottom: '30px'
      }}>
        <div style={{
          backgroundColor: 'white', padding: '24px', borderRadius: '12px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>System Status</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#28a745' }}>●  Running</div>
        </div>

        <div style={{
          backgroundColor: 'white', padding: '24px', borderRadius: '12px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>Data Collector</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#28a745' }}>●  Active</div>
        </div>

        <div style={{
          backgroundColor: 'white', padding: '24px', borderRadius: '12px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>Collection Interval</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold' }}>15 min</div>
        </div>

        <div style={{
          backgroundColor: 'white', padding: '24px', borderRadius: '12px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>Total Logs</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{logs.length}</div>
        </div>
      </div>

      <div style={{
        backgroundColor: 'white', borderRadius: '12px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)', overflow: 'hidden'
      }}>
        <div style={{
          padding: '20px', borderBottom: '1px solid #eee',
          backgroundColor: '#f9f9f9', fontWeight: '600'
        }}>
          Recent Activity Log
        </div>
        
        <div style={{ maxHeight: '600px', overflow: 'auto' }}>
          <table style={{ width: '100%' }}>
            <thead style={{ position: 'sticky', top: 0, backgroundColor: '#f9f9f9' }}>
              <tr style={{ borderBottom: '1px solid #eee' }}>
                <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>Timestamp</th>
                <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>Action</th>
                <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>Details</th>
                <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>IP Address</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '16px', fontSize: '13px', color: '#666', whiteSpace: 'nowrap' }}>
                    {new Date(log.created_at).toLocaleString('de-CH')}
                  </td>
                  <td style={{ padding: '16px', fontWeight: '500' }}>{log.action}</td>
                  <td style={{ padding: '16px', fontSize: '14px', color: '#666' }}>
                    {log.details || '-'}
                  </td>
                  <td style={{ padding: '16px', fontSize: '13px', fontFamily: 'monospace' }}>
                    {log.ip_address || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {logs.length === 0 && !loading && (
          <div style={{ padding: '60px', textAlign: 'center', color: '#999' }}>
            No logs available yet.
          </div>
        )}

        {loading && (
          <div style={{ padding: '60px', textAlign: 'center', color: '#999' }}>
            Loading logs...
          </div>
        )}
      </div>

      <div style={{
        marginTop: '30px', padding: '20px', backgroundColor: '#fff3cd',
        border: '1px solid #ffc107', borderRadius: '8px'
      }}>
        <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px', color: '#856404' }}>
          System Information
        </h3>
        <p style={{ fontSize: '14px', color: '#856404', lineHeight: '1.6' }}>
          The ZEV billing system collects data from all active meters and chargers every 15 minutes according to the Swiss ZEV standard.
          All data is stored with timestamps for accurate billing calculations. Monitor this page to ensure all devices are reporting correctly.
        </p>
      </div>
    </div>
  );
}