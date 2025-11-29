import { Wifi, WifiOff } from 'lucide-react';
import type { Charger } from '../../types';
import type { LiveChargerData, LoxoneConnectionStatus, ZaptecConnectionStatus } from './hooks/useChargerStatus';

interface ChargerConnectionStatusProps {
  charger: Charger;
  liveData?: LiveChargerData;
  loxoneStatus?: LoxoneConnectionStatus[number];
  zaptecStatus?: ZaptecConnectionStatus[number];
  t: (key: string) => string;
}

export default function ChargerConnectionStatus({
  charger,
  loxoneStatus,
  zaptecStatus,
  t
}: ChargerConnectionStatusProps) {
  if (charger.connection_type === 'loxone_api') {
    if (loxoneStatus) {
      return (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          backgroundColor: loxoneStatus.is_connected ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
          borderRadius: '8px',
          marginTop: '12px'
        }}>
          {loxoneStatus.is_connected ? (
            <>
              <Wifi size={16} style={{ color: '#22c55e' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#22c55e' }}>
                  {t('chargers.loxoneConnected')}
                </div>
                <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
                  {t('chargers.lastUpdate')}: {new Date(loxoneStatus.last_update).toLocaleTimeString(undefined, { hour12: false })}
                </div>
              </div>
            </>
          ) : (
            <>
              <WifiOff size={16} style={{ color: '#ef4444' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#ef4444' }}>
                  {t('chargers.loxoneDisconnected')}
                </div>
                {loxoneStatus.last_error && (
                  <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
                    {loxoneStatus.last_error}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      );
    }
    
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 12px',
        backgroundColor: 'rgba(156, 163, 175, 0.1)',
        borderRadius: '8px',
        marginTop: '12px'
      }}>
        <Wifi size={16} style={{ color: '#9ca3af' }} />
        <div style={{ fontSize: '12px', color: '#6b7280' }}>
          {t('chargers.loxoneConnecting')}
        </div>
      </div>
    );
  }

  if (charger.connection_type === 'zaptec_api') {
    if (zaptecStatus) {
      const isConnected = zaptecStatus?.is_connected || false;
      const isOnline = zaptecStatus?.is_online || false;

      return (
        <div style={{
          marginTop: '12px'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            backgroundColor: isConnected ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            borderRadius: '8px'
          }}>
            {isConnected ? (
              <>
                <Wifi size={16} style={{ color: '#22c55e' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: '#22c55e' }}>
                    {t('chargers.zaptecConnected')}
                  </div>
                  <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
                    {zaptecStatus?.last_update && `${t('chargers.lastUpdate')}: ${new Date(zaptecStatus.last_update).toLocaleTimeString(undefined, { hour12: false })}`}
                  </div>
                </div>
              </>
            ) : (
              <>
                <WifiOff size={16} style={{ color: '#ef4444' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: '#ef4444' }}>
                    {t('chargers.zaptecDisconnected')}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      );
    }

    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 12px',
        backgroundColor: 'rgba(156, 163, 175, 0.1)',
        borderRadius: '8px',
        marginTop: '12px'
      }}>
        <Wifi size={16} style={{ color: '#9ca3af' }} />
        <div style={{ fontSize: '12px', color: '#6b7280' }}>
          {t('chargers.zaptecConnecting')}
        </div>
      </div>
    );
  }

  return null;
}