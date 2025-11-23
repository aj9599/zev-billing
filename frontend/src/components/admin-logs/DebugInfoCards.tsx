import { useTranslation } from '../../i18n';
import type { DebugInfo } from './types';

interface DebugInfoCardsProps {
  debugInfo: DebugInfo | null;
}

export const DebugInfoCards = ({ debugInfo }: DebugInfoCardsProps) => {
  const { t } = useTranslation();

  if (!debugInfo) return null;

  return (
    <div style={{ marginBottom: '30px', width: '100%' }}>
      <h2 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '16px', color: '#1f2937' }}>
        {t('logs.realTimeStatus')}
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
          border: '2px solid #10b981',
          transition: 'all 0.3s ease'
        }}
        onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
        onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
          <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px', fontWeight: '500' }}>{t('logs.dataCollectorStatus')}</div>
          <div style={{ fontSize: '28px', fontWeight: '800', color: '#10b981', marginBottom: '8px' }}>
          ● {t('logs.running')}
          </div>
          <div style={{ fontSize: '12px', color: '#6b7280' }}>
            {t('logs.collectionInterval')}
          </div>
        </div>

        <div className="debug-card" style={{
          backgroundColor: 'white', 
          padding: '24px', 
          borderRadius: '16px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          border: '2px solid #667eea',
          transition: 'all 0.3s ease'
        }}
        onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
        onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
          <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px', fontWeight: '500' }}>{t('logs.activeMeters')}</div>
          <div style={{ fontSize: '28px', fontWeight: '800', color: '#667eea' }}>
            {debugInfo.active_meters || 0} / {debugInfo.total_meters || 0}
          </div>
          <div style={{ fontSize: '12px', color: '#6b7280' }}>
            {t('logs.collectingData')}
          </div>
        </div>

        <div className="debug-card" style={{
          backgroundColor: 'white', 
          padding: '24px', 
          borderRadius: '16px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          border: '2px solid #8b5cf6',
          transition: 'all 0.3s ease'
        }}
        onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
        onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
          <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px', fontWeight: '500' }}>{t('logs.activeChargers')}</div>
          <div style={{ fontSize: '28px', fontWeight: '800', color: '#8b5cf6' }}>
            {debugInfo.active_chargers || 0} / {debugInfo.total_chargers || 0}
          </div>
          <div style={{ fontSize: '12px', color: '#6b7280' }}>
            {t('logs.monitoringSessions')}
          </div>
        </div>

        <div className="debug-card" style={{
          backgroundColor: 'white', 
          padding: '24px', 
          borderRadius: '16px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          border: '2px solid #f59e0b',
          transition: 'all 0.3s ease'
        }}
        onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
        onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
          <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px', fontWeight: '500' }}>{t('logs.lastCollection')}</div>
          <div style={{ fontSize: '28px', fontWeight: '800', color: '#f59e0b' }}>
            {debugInfo.last_collection ? new Date(debugInfo.last_collection).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' }) : t('logs.never')}
          </div>
          <div style={{ fontSize: '12px', color: '#6b7280' }}>
            {t('logs.nextIn').replace('{minutes}', (debugInfo.next_collection_minutes || 15).toString())}
          </div>
        </div>

        {debugInfo.udp_listeners && debugInfo.udp_listeners.length > 0 && (
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
            <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px', fontWeight: '500' }}>{t('logs.udpListeners')}</div>
            <div style={{ fontSize: '28px', fontWeight: '800', color: '#3b82f6' }}>
              {debugInfo.udp_listeners.length} {t('logs.udpActive')}
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>
              {t('logs.ports')} {debugInfo.udp_listeners.join(', ')}
            </div>
          </div>
        )}

        <div className="debug-card" style={{
          backgroundColor: 'white', 
          padding: '24px', 
          borderRadius: '16px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          border: `2px solid ${debugInfo.recent_errors && debugInfo.recent_errors > 0 ? '#dc3545' : '#10b981'}`,
          transition: 'all 0.3s ease'
        }}
        onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
        onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
          <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px', fontWeight: '500' }}>{t('logs.recentErrors')}</div>
          <div style={{ fontSize: '28px', fontWeight: '800', color: debugInfo.recent_errors && debugInfo.recent_errors > 0 ? '#dc3545' : '#10b981' }}>
            {debugInfo.recent_errors || 0}
          </div>
          <div style={{ fontSize: '12px', color: '#6b7280' }}>
            {t('logs.last24Hours')}
          </div>
        </div>
      </div>
    </div>
  );
};