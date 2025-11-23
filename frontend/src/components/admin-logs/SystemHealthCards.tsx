import { Cpu, Activity, HardDrive, Thermometer, Clock } from 'lucide-react';
import { useTranslation } from '../../i18n';
import type { SystemHealth } from './types';
import { formatBytes, getHealthColor, getTempColor } from './utils/adminLogsUtils';

interface SystemHealthCardsProps {
  systemHealth: SystemHealth | null;
}

export const SystemHealthCards = ({ systemHealth }: SystemHealthCardsProps) => {
  const { t } = useTranslation();

  if (!systemHealth) return null;

  return (
    <div style={{ marginBottom: '30px', width: '100%' }}>
      <h2 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '16px', color: '#1f2937' }}>
        {t('logs.deviceHealth')}
      </h2>
      <div className="debug-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '20px',
        width: '100%'
      }}>
        <div className="debug-card" style={{
          backgroundColor: 'white', 
          padding: '24px', 
          borderRadius: '16px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)', 
          border: `2px solid ${getHealthColor(systemHealth.cpu_usage)}`,
          transition: 'all 0.3s ease'
        }}
        onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
        onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <Cpu size={24} color={getHealthColor(systemHealth.cpu_usage)} />
            <div style={{ fontSize: '14px', color: '#6b7280', fontWeight: '500' }}>{t('logs.cpuUsage')}</div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: '800', color: getHealthColor(systemHealth.cpu_usage) }}>
            {systemHealth.cpu_usage.toFixed(1)}%
          </div>
          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '8px' }}>
            {systemHealth.cpu_usage < 50 ? t('logs.cpuLow') : systemHealth.cpu_usage < 80 ? t('logs.cpuModerate') : t('logs.cpuHigh')}
          </div>
          <div style={{ width: '100%', height: '8px', backgroundColor: '#e5e7eb', borderRadius: '4px', marginTop: '12px', overflow: 'hidden' }}>
            <div style={{ width: `${systemHealth.cpu_usage}%`, height: '100%', backgroundColor: getHealthColor(systemHealth.cpu_usage), transition: 'width 0.3s ease' }}></div>
          </div>
        </div>

        <div className="debug-card" style={{
          backgroundColor: 'white', 
          padding: '24px', 
          borderRadius: '16px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)', 
          border: `2px solid ${getHealthColor(systemHealth.memory_percent)}`,
          transition: 'all 0.3s ease'
        }}
        onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
        onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <Activity size={24} color={getHealthColor(systemHealth.memory_percent)} />
            <div style={{ fontSize: '14px', color: '#6b7280', fontWeight: '500' }}>{t('logs.memoryUsage')}</div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: '800', color: getHealthColor(systemHealth.memory_percent) }}>
            {systemHealth.memory_percent.toFixed(1)}%
          </div>
          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '8px' }}>
            {formatBytes(systemHealth.memory_used)} / {formatBytes(systemHealth.memory_total)}
          </div>
          <div style={{ width: '100%', height: '8px', backgroundColor: '#e5e7eb', borderRadius: '4px', marginTop: '12px', overflow: 'hidden' }}>
            <div style={{ width: `${systemHealth.memory_percent}%`, height: '100%', backgroundColor: getHealthColor(systemHealth.memory_percent), transition: 'width 0.3s ease' }}></div>
          </div>
        </div>

        <div className="debug-card" style={{
          backgroundColor: 'white', 
          padding: '24px', 
          borderRadius: '16px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)', 
          border: `2px solid ${getHealthColor(systemHealth.disk_percent)}`,
          transition: 'all 0.3s ease'
        }}
        onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
        onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <HardDrive size={24} color={getHealthColor(systemHealth.disk_percent)} />
            <div style={{ fontSize: '14px', color: '#6b7280', fontWeight: '500' }}>{t('logs.diskUsage')}</div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: '800', color: getHealthColor(systemHealth.disk_percent) }}>
            {systemHealth.disk_percent.toFixed(1)}%
          </div>
          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '8px' }}>
            {formatBytes(systemHealth.disk_used)} / {formatBytes(systemHealth.disk_total)}
          </div>
          <div style={{ width: '100%', height: '8px', backgroundColor: '#e5e7eb', borderRadius: '4px', marginTop: '12px', overflow: 'hidden' }}>
            <div style={{ width: `${systemHealth.disk_percent}%`, height: '100%', backgroundColor: getHealthColor(systemHealth.disk_percent), transition: 'width 0.3s ease' }}></div>
          </div>
        </div>

        {systemHealth.temperature > 0 && (
          <div className="debug-card" style={{
            backgroundColor: 'white', 
            padding: '24px', 
            borderRadius: '16px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)', 
            border: `2px solid ${getTempColor(systemHealth.temperature)}`,
            transition: 'all 0.3s ease'
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
              <Thermometer size={24} color={getTempColor(systemHealth.temperature)} />
              <div style={{ fontSize: '14px', color: '#6b7280', fontWeight: '500' }}>{t('logs.cpuTemperature')}</div>
            </div>
            <div style={{ fontSize: '28px', fontWeight: '800', color: getTempColor(systemHealth.temperature) }}>
              {systemHealth.temperature.toFixed(1)}°C
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '8px' }}>
              {systemHealth.temperature < 70 ? t('logs.tempNormal') : systemHealth.temperature < 80 ? t('logs.tempWarm') : t('logs.tempHot')}
            </div>
          </div>
        )}

        <div className="debug-card" style={{
          backgroundColor: 'white', 
          padding: '24px', 
          borderRadius: '16px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)', 
          border: '2px solid #3b82f6',
          transition: 'all 0.3s ease'
        }}
        onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
        onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <Clock size={24} color="#3b82f6" />
            <div style={{ fontSize: '14px', color: '#6b7280', fontWeight: '500' }}>{t('logs.systemUptime')}</div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: '800', color: '#3b82f6' }}>
            {systemHealth.uptime}
          </div>
          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '8px' }}>
            {t('logs.sinceLastRestart')}
          </div>
        </div>
      </div>
    </div>
  );
};