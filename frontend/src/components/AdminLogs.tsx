import { useState, useEffect } from 'react';
import { Activity, RefreshCw, AlertCircle, CheckCircle, Info } from 'lucide-react';
import { api } from '../api/client';
import type { AdminLog } from '../types';

export default function AdminLogs() {
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);

  useEffect(() => {
    loadLogs();
    loadDebugInfo();
  }, []);

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(() => {
        loadLogs();
        loadDebugInfo();
      }, 30000); // Refresh every 30 seconds
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const data = await api.getLogs(200);
      setLogs(data);
    } catch (err) {
      console.error('Failed to load logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadDebugInfo = async () => {
    try {
      const response = await fetch('/api/debug/status', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json();
      setDebugInfo(data);
    } catch (err) {
      console.error('Failed to load debug info:', err);
    }
  };

  const getLogIcon = (action: string) => {
    if (action.toLowerCase().includes('error') || action.toLowerCase().includes('failed')) {
      return <AlertCircle size={16} color="#dc3545" />;
    } else if (action.toLowerCase().includes('success') || action.toLowerCase().includes('collected')) {
      return <CheckCircle size={16} color="#28a745" />;
    }
    return <Info size={16} color="#007bff" />;
  };

  const getLogColor = (action: string) => {
    if (action.toLowerCase().includes('error') || action.toLowerCase().includes('failed')) {
      return '#fef2f2';
    } else if (action.toLowerCase().includes('success') || action.toLowerCase().includes('collected')) {
      return '#f0fdf4';
    }
    return '#fff';
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Activity size={32} />
          System Logs & Debugging
        </h1>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
            <input 
              type="checkbox" 
              checked={autoRefresh} 
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh (30s)
          </label>
          <button
            onClick={() => { loadLogs(); loadDebugInfo(); }}
            disabled={loading}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
              backgroundColor: '#007bff', color: 'white', border: 'none',
              borderRadius: '6px', fontSize: '14px', opacity: loading ? 0.7 : 1
            }}
          >
            <RefreshCw size={18} />
            Refresh Now
          </button>
        </div>
      </div>

      {/* Debug Information Cards */}
      {debugInfo && (
        <div style={{ marginBottom: '30px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '16px' }}>
            Real-Time System Status
          </h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '20px'
          }}>
            <div style={{
              backgroundColor: 'white', padding: '24px', borderRadius: '12px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)', border: '2px solid #28a745'
            }}>
              <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>Data Collector Status</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#28a745' }}>
                ● Running
              </div>
              <div style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>
                Collection Interval: 15 minutes
              </div>
            </div>

            <div style={{
              backgroundColor: 'white', padding: '24px', borderRadius: '12px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}>
              <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>Active Meters</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
                {debugInfo.active_meters || 0} / {debugInfo.total_meters || 0}
              </div>
              <div style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>
                Collecting data
              </div>
            </div>

            <div style={{
              backgroundColor: 'white', padding: '24px', borderRadius: '12px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}>
              <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>Active Chargers</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
                {debugInfo.active_chargers || 0} / {debugInfo.total_chargers || 0}
              </div>
              <div style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>
                Monitoring sessions
              </div>
            </div>

            <div style={{
              backgroundColor: 'white', padding: '24px', borderRadius: '12px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}>
              <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>Last Collection</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
                {debugInfo.last_collection ? new Date(debugInfo.last_collection).toLocaleTimeString('de-CH') : 'Never'}
              </div>
              <div style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>
                Next in ~{debugInfo.next_collection_minutes || 15} min
              </div>
            </div>

            {debugInfo.udp_listeners && debugInfo.udp_listeners.length > 0 && (
              <div style={{
                backgroundColor: 'white', padding: '24px', borderRadius: '12px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)', border: '2px solid #007bff'
              }}>
                <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>UDP Listeners</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#007bff' }}>
                  {debugInfo.udp_listeners.length} Active
                </div>
                <div style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>
                  Ports: {debugInfo.udp_listeners.join(', ')}
                </div>
              </div>
            )}

            <div style={{
              backgroundColor: 'white', padding: '24px', borderRadius: '12px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}>
              <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>Recent Errors</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: debugInfo.recent_errors > 0 ? '#dc3545' : '#28a745' }}>
                {debugInfo.recent_errors || 0}
              </div>
              <div style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>
                Last 24 hours
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Connection Test Guide */}
      <div style={{
        backgroundColor: '#e3f2fd', padding: '20px', borderRadius: '12px',
        marginBottom: '30px', border: '1px solid #2196f3'
      }}>
        <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px', color: '#1565c0' }}>
          🔍 Debugging Tips
        </h3>
        <div style={{ fontSize: '14px', color: '#1565c0', lineHeight: '1.6' }}>
          <p><strong>What to look for in the logs:</strong></p>
          <ul style={{ marginLeft: '20px', marginTop: '8px' }}>
            <li><strong>Data collection attempts:</strong> Look for "Starting data collection cycle" every 15 minutes</li>
            <li><strong>HTTP errors:</strong> "HTTP request failed" indicates network or endpoint issues</li>
            <li><strong>UDP reception:</strong> "UDP data received" confirms packets are arriving</li>
            <li><strong>Successful readings:</strong> "Collected meter data" with kWh values</li>
            <li><strong>Connection errors:</strong> Timeout or connection refused messages</li>
          </ul>
          <p style={{ marginTop: '12px' }}><strong>Common issues:</strong></p>
          <ul style={{ marginLeft: '20px', marginTop: '8px' }}>
            <li>No logs appearing → Service may not be running (check with <code style={{ backgroundColor: '#bbdefb', padding: '2px 6px', borderRadius: '4px' }}>sudo systemctl status zev-billing</code>)</li>
            <li>HTTP timeout → Check if the IP address is correct and reachable</li>
            <li>UDP not receiving → Verify firewall allows port 8888/UDP</li>
            <li>Wrong data format → Check the JSON structure matches expectations</li>
          </ul>
        </div>
      </div>

      {/* Logs Table */}
      <div style={{
        backgroundColor: 'white', borderRadius: '12px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)', overflow: 'hidden'
      }}>
        <div style={{
          padding: '20px', borderBottom: '1px solid #eee',
          backgroundColor: '#f9f9f9', fontWeight: '600'
        }}>
          Activity Log (Most Recent 200 Entries)
        </div>
        
        <div style={{ maxHeight: '600px', overflow: 'auto' }}>
          <table style={{ width: '100%' }}>
            <thead style={{ position: 'sticky', top: 0, backgroundColor: '#f9f9f9' }}>
              <tr style={{ borderBottom: '1px solid #eee' }}>
                <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600', width: '40px' }}></th>
                <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>Timestamp</th>
                <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>Action</th>
                <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>Details</th>
                <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>IP Address</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id} style={{
                  borderBottom: '1px solid #eee',
                  backgroundColor: getLogColor(log.action)
                }}>
                  <td style={{ padding: '16px', textAlign: 'center' }}>
                    {getLogIcon(log.action)}
                  </td>
                  <td style={{ padding: '16px', fontSize: '13px', color: '#666', whiteSpace: 'nowrap' }}>
                    {new Date(log.created_at).toLocaleString('de-CH')}
                  </td>
                  <td style={{ padding: '16px', fontWeight: '500' }}>{log.action}</td>
                  <td style={{ padding: '16px', fontSize: '14px', color: '#666', maxWidth: '400px', wordBreak: 'break-word' }}>
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
            No logs available yet. System activity will appear here.
          </div>
        )}

        {loading && (
          <div style={{ padding: '60px', textAlign: 'center', color: '#999' }}>
            Loading logs...
          </div>
        )}
      </div>

      {/* Help Information */}
      <div style={{
        marginTop: '30px', padding: '20px', backgroundColor: '#fff3cd',
        border: '1px solid #ffc107', borderRadius: '8px'
      }}>
        <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px', color: '#856404' }}>
          📊 System Information
        </h3>
        <p style={{ fontSize: '14px', color: '#856404', lineHeight: '1.6' }}>
          The ZEV billing system collects data from all active meters and chargers every 15 minutes according to the Swiss ZEV standard.
          All data is stored with timestamps for accurate billing calculations. Monitor this page to ensure all devices are reporting correctly.
        </p>
        <p style={{ fontSize: '14px', color: '#856404', lineHeight: '1.6', marginTop: '10px' }}>
          <strong>Need more help?</strong> Check the full system logs on the Raspberry Pi with: <code style={{ backgroundColor: '#fff', padding: '2px 6px', borderRadius: '4px' }}>journalctl -u zev-billing -f</code>
        </p>
      </div>
    </div>
  );
}