import { Cpu, Activity, HardDrive, Thermometer, Clock } from 'lucide-react';
import { useTranslation } from '../../i18n';
import type { SystemHealth } from './types';
import { formatBytes, getHealthColor, getTempColor } from './utils/adminLogsUtils';
import { useState, useEffect } from 'react';

interface SystemHealthCardsProps {
  systemHealth: SystemHealth | null;
}

export const SystemHealthCards = ({ systemHealth }: SystemHealthCardsProps) => {
  const { t } = useTranslation();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!systemHealth) return null;

  const cardStyle = {
    backgroundColor: 'white',
    padding: isMobile ? '16px' : '24px',
    borderRadius: isMobile ? '12px' : '16px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    transition: 'all 0.3s ease'
  };

  return (
    <div style={{ marginBottom: isMobile ? '20px' : '30px', width: '100%' }}>
      <h2 style={{ 
        fontSize: isMobile ? '18px' : '20px', 
        fontWeight: '700', 
        marginBottom: '12px', 
        color: '#1f2937',
        paddingLeft: '4px'
      }}>
        {t('logs.deviceHealth')}
      </h2>
      <div className="debug-grid" style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: isMobile ? '12px' : '20px',
        width: '100%'
      }}>
        <div className="debug-card" style={{
          ...cardStyle,
          border: `2px solid ${getHealthColor(systemHealth.cpu_usage)}`
        }}
        onMouseEnter={(e) => !isMobile && (e.currentTarget.style.transform = 'translateY(-4px)')}
        onMouseLeave={(e) => !isMobile && (e.currentTarget.style.transform = 'translateY(0)')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <Cpu size={isMobile ? 20 : 24} color={getHealthColor(systemHealth.cpu_usage)} />
            <div style={{ fontSize: isMobile ? '13px' : '14px', color: '#6b7280', fontWeight: '500' }}>
              {t('logs.cpuUsage')}
            </div>
          </div>
          <div style={{ fontSize: isMobile ? '24px' : '28px', fontWeight: '800', color: getHealthColor(systemHealth.cpu_usage) }}>
            {systemHealth.cpu_usage.toFixed(1)}%
          </div>
          <div style={{ fontSize: isMobile ? '11px' : '12px', color: '#6b7280', marginTop: '8px' }}>
            {systemHealth.cpu_usage < 50 ? t('logs.cpuLow') : systemHealth.cpu_usage < 80 ? t('logs.cpuModerate') : t('logs.cpuHigh')}
          </div>
          <div style={{ width: '100%', height: isMobile ? '6px' : '8px', backgroundColor: '#e5e7eb', borderRadius: '4px', marginTop: '12px', overflow: 'hidden' }}>
            <div style={{ width: `${systemHealth.cpu_usage}%`, height: '100%', backgroundColor: getHealthColor(systemHealth.cpu_usage), transition: 'width 0.3s ease' }}></div>
          </div>
        </div>

        <div className="debug-card" style={{
          ...cardStyle,
          border: `2px solid ${getHealthColor(systemHealth.memory_percent)}`
        }}
        onMouseEnter={(e) => !isMobile && (e.currentTarget.style.transform = 'translateY(-4px)')}
        onMouseLeave={(e) => !isMobile && (e.currentTarget.style.transform = 'translateY(0)')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <Activity size={isMobile ? 20 : 24} color={getHealthColor(systemHealth.memory_percent)} />
            <div style={{ fontSize: isMobile ? '13px' : '14px', color: '#6b7280', fontWeight: '500' }}>
              {t('logs.memoryUsage')}
            </div>
          </div>
          <div style={{ fontSize: isMobile ? '24px' : '28px', fontWeight: '800', color: getHealthColor(systemHealth.memory_percent) }}>
            {systemHealth.memory_percent.toFixed(1)}%
          </div>
          <div style={{ fontSize: isMobile ? '11px' : '12px', color: '#6b7280', marginTop: '8px' }}>
            {formatBytes(systemHealth.memory_used)} / {formatBytes(systemHealth.memory_total)}
          </div>
          <div style={{ width: '100%', height: isMobile ? '6px' : '8px', backgroundColor: '#e5e7eb', borderRadius: '4px', marginTop: '12px', overflow: 'hidden' }}>
            <div style={{ width: `${systemHealth.memory_percent}%`, height: '100%', backgroundColor: getHealthColor(systemHealth.memory_percent), transition: 'width 0.3s ease' }}></div>
          </div>
        </div>

        <div className="debug-card" style={{
          ...cardStyle,
          border: `2px solid ${getHealthColor(systemHealth.disk_percent)}`
        }}
        onMouseEnter={(e) => !isMobile && (e.currentTarget.style.transform = 'translateY(-4px)')}
        onMouseLeave={(e) => !isMobile && (e.currentTarget.style.transform = 'translateY(0)')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <HardDrive size={isMobile ? 20 : 24} color={getHealthColor(systemHealth.disk_percent)} />
            <div style={{ fontSize: isMobile ? '13px' : '14px', color: '#6b7280', fontWeight: '500' }}>
              {t('logs.diskUsage')}
            </div>
          </div>
          <div style={{ fontSize: isMobile ? '24px' : '28px', fontWeight: '800', color: getHealthColor(systemHealth.disk_percent) }}>
            {systemHealth.disk_percent.toFixed(1)}%
          </div>
          <div style={{ fontSize: isMobile ? '11px' : '12px', color: '#6b7280', marginTop: '8px' }}>
            {formatBytes(systemHealth.disk_used)} / {formatBytes(systemHealth.disk_total)}
          </div>
          <div style={{ width: '100%', height: isMobile ? '6px' : '8px', backgroundColor: '#e5e7eb', borderRadius: '4px', marginTop: '12px', overflow: 'hidden' }}>
            <div style={{ width: `${systemHealth.disk_percent}%`, height: '100%', backgroundColor: getHealthColor(systemHealth.disk_percent), transition: 'width 0.3s ease' }}></div>
          </div>
        </div>

        {systemHealth.temperature > 0 && (
          <div className="debug-card" style={{
            ...cardStyle,
            border: `2px solid ${getTempColor(systemHealth.temperature)}`
          }}
          onMouseEnter={(e) => !isMobile && (e.currentTarget.style.transform = 'translateY(-4px)')}
          onMouseLeave={(e) => !isMobile && (e.currentTarget.style.transform = 'translateY(0)')}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
              <Thermometer size={isMobile ? 20 : 24} color={getTempColor(systemHealth.temperature)} />
              <div style={{ fontSize: isMobile ? '13px' : '14px', color: '#6b7280', fontWeight: '500' }}>
                {t('logs.cpuTemperature')}
              </div>
            </div>
            <div style={{ fontSize: isMobile ? '24px' : '28px', fontWeight: '800', color: getTempColor(systemHealth.temperature) }}>
              {systemHealth.temperature.toFixed(1)}°C
            </div>
            <div style={{ fontSize: isMobile ? '11px' : '12px', color: '#6b7280', marginTop: '8px' }}>
              {systemHealth.temperature < 70 ? t('logs.tempNormal') : systemHealth.temperature < 80 ? t('logs.tempWarm') : t('logs.tempHot')}
            </div>
          </div>
        )}

        <div className="debug-card" style={{
          ...cardStyle,
          border: '2px solid #3b82f6'
        }}
        onMouseEnter={(e) => !isMobile && (e.currentTarget.style.transform = 'translateY(-4px)')}
        onMouseLeave={(e) => !isMobile && (e.currentTarget.style.transform = 'translateY(0)')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <Clock size={isMobile ? 20 : 24} color="#3b82f6" />
            <div style={{ fontSize: isMobile ? '13px' : '14px', color: '#6b7280', fontWeight: '500' }}>
              {t('logs.systemUptime')}
            </div>
          </div>
          <div style={{ fontSize: isMobile ? '20px' : '28px', fontWeight: '800', color: '#3b82f6' }}>
            {systemHealth.uptime}
          </div>
          <div style={{ fontSize: isMobile ? '11px' : '12px', color: '#6b7280', marginTop: '8px' }}>
            {t('logs.sinceLastRestart')}
          </div>
        </div>
      </div>
    </div>
  );
};