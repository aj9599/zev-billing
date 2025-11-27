import { useEffect, useState } from 'react';
import { FileText, Download } from 'lucide-react';
import { api } from '../api/client';
import { useTranslation } from '../i18n';
import type { AdminLog } from '../types';
import { LogsTable } from './admin-logs/LogsTable';
import { LogsTableMobile } from './admin-logs/LogsTableMobile';

export default function Logs() {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [showAllLogs, setShowAllLogs] = useState(false);
  const [logLimit, setLogLimit] = useState(200);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    loadLogs();
    const interval = setInterval(loadLogs, 10000);
    return () => clearInterval(interval);
  }, [logLimit]);

  const loadLogs = async () => {
    try {
      const data = await api.getLogs(logLimit);
      setLogs(data);
    } catch (err) {
      console.error('Failed to load logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      const response = await fetch('/api/export/data', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `zev-billing-export-${new Date().toISOString().split('T')[0]}.xlsx`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (err) {
      console.error('Export failed:', err);
      alert(t('logs.exportFailed'));
    }
  };

  const handleToggleAllLogs = () => {
    if (showAllLogs) {
      setLogLimit(200);
      setShowAllLogs(false);
    } else {
      setLogLimit(10000);
      setShowAllLogs(true);
    }
  };

  return (
    <div className="logs-page-container" style={{ 
      maxWidth: '100%', 
      width: '100%',
      padding: isMobile ? '0' : '0',
      boxSizing: 'border-box'
    }}>
      <div className="logs-header-section" style={{ marginBottom: isMobile ? '20px' : '30px' }}>
        <div className="logs-header-title" style={{ marginBottom: isMobile ? '16px' : '20px' }}>
          <h1 className="logs-title" style={{ 
            fontSize: isMobile ? '24px' : '36px', 
            fontWeight: '800', 
            marginBottom: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: isMobile ? '8px' : '12px',
            color: '#667eea'
          }}>
            <FileText size={isMobile ? 24 : 36} />
            {t('logs.activityLogs')}
          </h1>
          <p className="logs-subtitle" style={{ 
            color: '#6b7280', 
            fontSize: isMobile ? '13px' : '16px',
            margin: 0
          }}>
            {t('logs.logsSubtitle')}
          </p>
        </div>
      </div>

      <div style={{ 
        marginBottom: isMobile ? '16px' : '20px', 
        display: 'flex', 
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '12px',
        flexWrap: 'wrap'
      }}>
        <button
          onClick={handleToggleAllLogs}
          style={{
            padding: isMobile ? '10px 16px' : '12px 20px',
            backgroundColor: showAllLogs ? '#ef4444' : '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: isMobile ? '8px' : '10px',
            fontSize: isMobile ? '13px' : '14px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
          }}
          onMouseEnter={(e) => {
            if (!isMobile) {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
            }
          }}
          onMouseLeave={(e) => {
            if (!isMobile) {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
            }
          }}
        >
          {showAllLogs ? t('logs.showLess') : t('logs.showAll24h')}
        </button>

        <button
          onClick={handleExport}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: isMobile ? '10px 16px' : '12px 20px',
            backgroundColor: '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: isMobile ? '8px' : '10px',
            fontSize: isMobile ? '13px' : '14px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: '0 2px 8px rgba(16, 185, 129, 0.2)'
          }}
          onMouseEnter={(e) => {
            if (!isMobile) {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.3)';
            }
          }}
          onMouseLeave={(e) => {
            if (!isMobile) {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(16, 185, 129, 0.2)';
            }
          }}
        >
          <Download size={isMobile ? 16 : 18} />
          {t('logs.exportData')}
        </button>
      </div>

      {isMobile ? (
        <LogsTableMobile logs={logs} loading={loading} />
      ) : (
        <LogsTable logs={logs} loading={loading} />
      )}

      <style>{`
        @media (max-width: 768px) {
          .logs-page-container {
            padding: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}