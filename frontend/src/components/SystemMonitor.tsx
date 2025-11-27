import { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import { useTranslation } from '../i18n';
import { SystemHealthCards } from './admin-logs/SystemHealthCards';
import { SystemHealthCharts } from './admin-logs/SystemHealthCharts';
import { DebugInfoCards } from './admin-logs/DebugInfoCards';
import { StatisticsCards } from './admin-logs/StatisticsCards';
import { useSystemHealth } from './admin-logs/hooks/useSystemHealth';

export default function SystemMonitor() {
  const { t } = useTranslation();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [isLive, setIsLive] = useState(true);
  const { systemHealth, debugInfo, healthHistory, loadDebugInfo } = useSystemHealth();

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    loadDebugInfo();
    const interval = setInterval(() => {
      loadDebugInfo();
      setIsLive(true);
    }, 5000);

    const liveTimeout = setTimeout(() => {
      setIsLive(false);
    }, 10000);

    return () => {
      clearInterval(interval);
      clearTimeout(liveTimeout);
    };
  }, [loadDebugInfo]);

  return (
    <div className="system-monitor-container" style={{ 
      maxWidth: '100%', 
      width: '100%',
      padding: isMobile ? '0' : '0',
      boxSizing: 'border-box'
    }}>
      <div className="system-monitor-header" style={{ marginBottom: isMobile ? '20px' : '30px' }}>
        <div className="logs-header-title">
          <h1 className="logs-title" style={{ 
            fontSize: isMobile ? '24px' : '36px', 
            fontWeight: '800', 
            marginBottom: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: isMobile ? '8px' : '12px',
            color: '#667eea'
          }}>
            <Activity size={isMobile ? 24 : 36} />
            {t('logs.systemMonitor')}
          </h1>
          <p className="logs-subtitle" style={{ 
            color: '#6b7280', 
            fontSize: isMobile ? '13px' : '16px',
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '8px',
            margin: 0
          }}>
            <span>{t('logs.monitoringSubtitle')}</span>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: isMobile ? '3px 10px' : '4px 12px',
              backgroundColor: isLive ? '#d1fae5' : '#fee2e2',
              color: isLive ? '#065f46' : '#991b1b',
              borderRadius: isMobile ? '10px' : '12px',
              fontSize: isMobile ? '11px' : '12px',
              fontWeight: '600'
            }}>
              <span style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: isLive ? '#10b981' : '#dc3545',
                animation: isLive ? 'pulse 2s infinite' : 'none'
              }}></span>
              {isLive ? 'LIVE' : 'OFFLINE'}
            </span>
          </p>
        </div>
      </div>

      <StatisticsCards />
      <SystemHealthCards systemHealth={systemHealth} />
      <DebugInfoCards debugInfo={debugInfo} />
      <SystemHealthCharts healthHistory={healthHistory} />

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        @media (max-width: 768px) {
          .system-monitor-container {
            padding: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}