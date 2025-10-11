import { useState, useEffect } from 'react';
import { Activity, RefreshCw, AlertCircle, CheckCircle, Info, Power } from 'lucide-react';
import { api } from '../api/client';
import type { AdminLog } from '../types';

export default function AdminLogs() {
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [rebooting, setRebooting] = useState(false);

  useEffect(() => {
    loadLogs();
    loadDebugInfo();
  }, []);

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(() => {
        loadLogs();
        loadDebugInfo();
      }, 30000);
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

  const handleReboot = async () => {
    if (!confirm('Are you sure you want to reboot the system? This will restart the backend service.')) {
      return;
    }

    setRebooting(true);
    try {
      const response = await fetch('/api/system/reboot', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        alert('System is rebooting... The service will restart in a few seconds.');
        setTimeout(() => {
          window.location.reload();
        }, 5000);
      } else {
        alert('Failed to reboot system');
        setRebooting(false);
      }
    } catch (err) {
      alert('Failed to reboot system');
      setRebooting(false);
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
        <div>
          <h1 style={{ 
            fontSize: '36px', 
            fontWeight: '800', 
            marginBottom: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
          }}>
            <Activity size={36} style={{ color: '#667eea' }} />
            System Logs
          </h1>
          <p style={{ color: '#6b7280', fontSize: '16px' }}>
            Monitor system activity and debug information
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <label style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px', 
            fontSize: '14px',
            fontWeight: '500',
            color: '#374151'
          }}>
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
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px', 
              padding: '12px 20px',
              backgroundColor: '#007bff', 
              color: 'white', 
              border: 'none',
              borderRadius: '10px', 
              fontSize: '14px',
              fontWeight: '600',
              opacity: loading ? 0.7 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 12px rgba(0, 123, 255, 0.3)',
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 123, 255, 0.4)';
              }
            }}
            onMouseLeave={(e) => {
              if (!loading) {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 123, 255, 0.3)';
              }
            }}
          >
            <RefreshCw size={18} />
            Refresh
          </button>
          <button
            onClick={handleReboot}
            disabled={rebooting}
            style={{
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px', 
              padding: '12px 20px',
              background: rebooting ? '#9ca3af' : 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
              color: 'white', 
              border: 'none',
              borderRadius: '10px', 
              fontSize: '14px',
              fontWeight: '600',
              cursor: rebooting ? 'not-allowed' : 'pointer',
              boxShadow: rebooting ? 'none' : '0 4px 12px rgba(240, 147, 251, 0.3)',
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => {
              if (!rebooting) {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 16px rgba(240, 147, 251, 0.4)';
              }
            }}
            onMouseLeave={(e) => {
              if (!rebooting) {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(240, 147, 251, 0.3)';
              }
            }}
          >
            <Power size={18} />
            {rebooting ? 'Rebooting...' : 'Reboot System'}
          </button>
        </div>
      </div>

      {/* Debug Information Cards */}
      {debugInfo && (
        <div style={{ marginBottom: '30px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '16px', color: '#1f2937' }}>
            Real-Time System Status
          </h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '20px'
          }}>
            <div style={{
              backgroundColor: 'white', 
              padding: '24px', 
              borderRadius: '16px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)', 
              border: '2px solid #10b981',
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
              <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px', fontWeight: '500' }}>Data Collector Status</div>
              <div style={{ fontSize: '28px', fontWeight: '800', color: '#10b981', marginBottom: '8px' }}>
                ● Running
              </div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                Collection Interval: 15 minutes
              </div>
            </div>

            <div style={{
              backgroundColor: 'white', 
              padding: '24px', 
              borderRadius: '16px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
              <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px', fontWeight: '500' }}>Active Meters</div>
              <div style={{ fontSize: '28px', fontWeight: '800', color: '#667eea' }}>
                {debugInfo.active_meters || 0} / {debugInfo.total_meters || 0}
              </div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                Collecting data
              </div>
            </div>

            <div style={{
              backgroundColor: 'white', 
              padding: '24px', 
              borderRadius: '16px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
              <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px', fontWeight: '500' }}>Active Chargers</div>
              <div style={{ fontSize: '28px', fontWeight: '800', color: '#764ba2' }}>
                {debugInfo.active_chargers || 0} / {debugInfo.total_chargers || 0}
              </div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                Monitoring sessions
              </div>
            </div>

            <div style={{
              backgroundColor: 'white', 
              padding: '24px', 
              borderRadius: '16px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
              <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px', fontWeight: '500' }}>Last Collection</div>
              <div style={{ fontSize: '28px', fontWeight: '800', color: '#1f2937' }}>
                {debugInfo.last_collection ? new Date(debugInfo.last_collection).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' }) : 'Never'}
              </div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                Next in ~{debugInfo.next_collection_minutes || 15} min
              </div>
            </div>

            {debugInfo.udp_listeners && debugInfo.udp_listeners.length > 0 && (
              <div style={{
                backgroundColor: 'white', 
                padding: '24px', 
                borderRadius: '16px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)', 
                border: '2px solid #3b82f6',
                transition: 'all 0.3s ease'
              }}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
                <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px', fontWeight: '500' }}>UDP Listeners</div>
                <div style={{ fontSize: '28px', fontWeight: '800', color: '#3b82f6' }}>
                  {debugInfo.udp_listeners.length} Active
                </div>
                <div style={{ fontSize: '12px', color: '#6b7280' }}>
                  Ports: {debugInfo.udp_listeners.join(', ')}
                </div>
              </div>
            )}

            <div style={{
              backgroundColor: 'white', 
              padding: '24px', 
              borderRadius: '16px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
              <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px', fontWeight: '500' }}>Recent Errors</div>
              <div style={{ fontSize: '28px', fontWeight: '800', color: debugInfo.recent_errors > 0 ? '#dc3545' : '#10b981' }}>
                {debugInfo.recent_errors || 0}
              </div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                Last 24 hours
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Logs Table */}
      <div style={{
        backgroundColor: 'white', 
        borderRadius: '16px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.08)', 
        overflow: 'hidden'
      }}>
        <div style={{
          padding: '20px', 
          borderBottom: '2px solid #f3f4f6',
          backgroundColor: '#f9fafb', 
          fontWeight: '700',
          fontSize: '18px',
          color: '#1f2937'
        }}>
          Activity Log (Most Recent 200 Entries)
        </div>
        
        <div style={{ maxHeight: '600px', overflow: 'auto' }}>
          <table style={{ width: '100%' }}>
            <thead style={{ position: 'sticky', top: 0, backgroundColor: '#f9fafb', zIndex: 10 }}>
              <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
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
                  borderBottom: '1px solid #f3f4f6',
                  backgroundColor: getLogColor(log.action),
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = getLogColor(log.action)}>
                  <td style={{ padding: '16px', textAlign: 'center' }}>
                    {getLogIcon(log.action)}
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
            No logs available yet. System activity will appear here.
          </div>
        )}

        {loading && (
          <div style={{ padding: '60px', textAlign: 'center', color: '#9ca3af' }}>
            Loading logs...
          </div>
        )}
      </div>
    </div>
  );
}