import { Wifi, WifiOff, Zap, User, Clock, Activity } from 'lucide-react';
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
  liveData,
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
    if (zaptecStatus || liveData) {
      const isConnected = zaptecStatus?.is_connected || false;
      const isOnline = liveData?.is_online || zaptecStatus?.is_online || false;

      return (
        <div style={{
          backgroundColor: isConnected ? 'rgba(34, 197, 94, 0.05)' : 'rgba(239, 68, 68, 0.05)',
          borderRadius: '12px',
          marginTop: '16px',
          overflow: 'hidden',
          border: `2px solid ${isConnected ? '#22c55e' : '#ef4444'}`
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px',
            backgroundColor: isConnected ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
          }}>
            {isConnected ? (
              <>
                <Wifi size={16} style={{ color: '#22c55e' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: '#22c55e' }}>
                    Zaptec Connected {isOnline && '• Online'}
                  </div>
                  <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
                    {zaptecStatus?.last_update && `Last update: ${new Date(zaptecStatus.last_update).toLocaleTimeString(undefined, { hour12: false })}`}
                  </div>
                </div>
              </>
            ) : (
              <>
                <WifiOff size={16} style={{ color: '#ef4444' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: '#ef4444' }}>
                    Zaptec Disconnected
                  </div>
                </div>
              </>
            )}
          </div>

          {liveData && isConnected && (
            <div style={{ padding: '12px', display: 'grid', gap: '8px' }}>
              {/* Current Power */}
              {liveData.current_power_kw !== undefined && liveData.current_power_kw > 0 && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  backgroundColor: 'rgba(34, 197, 94, 0.1)',
                  borderRadius: '8px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Zap size={16} style={{ color: '#22c55e' }} />
                    <span style={{ fontSize: '12px', fontWeight: '600', color: '#1f2937' }}>
                      Current Power
                    </span>
                  </div>
                  <span style={{ fontSize: '14px', fontWeight: '700', color: '#22c55e' }}>
                    {liveData.current_power_kw.toFixed(2)} kW
                  </span>
                </div>
              )}

              {/* Voltage & Current */}
              {(liveData.voltage || liveData.current) && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {liveData.voltage && (
                    <div style={{
                      padding: '8px 12px',
                      backgroundColor: 'rgba(107, 114, 128, 0.1)',
                      borderRadius: '8px'
                    }}>
                      <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>
                        Voltage
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: '#1f2937' }}>
                        {liveData.voltage.toFixed(0)} V
                      </div>
                    </div>
                  )}
                  {liveData.current && (
                    <div style={{
                      padding: '8px 12px',
                      backgroundColor: 'rgba(107, 114, 128, 0.1)',
                      borderRadius: '8px'
                    }}>
                      <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>
                        Current
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: '#1f2937' }}>
                        {liveData.current.toFixed(1)} A
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Live Session */}
              {liveData.live_session && (
                <div style={{
                  padding: '12px',
                  background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(34, 197, 94, 0.1))',
                  borderRadius: '8px',
                  border: '2px solid #f59e0b'
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '12px'
                  }}>
                    <Activity size={16} style={{ color: '#f59e0b' }} />
                    <span style={{ fontSize: '13px', fontWeight: '700', color: '#1f2937' }}>
                      🔴 LIVE CHARGING SESSION
                    </span>
                  </div>

                  <div style={{ display: 'grid', gap: '8px' }}>
                    {liveData.live_session.user_name && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <User size={14} style={{ color: '#6b7280' }} />
                        <span style={{ fontSize: '12px', color: '#1f2937' }}>
                          {liveData.live_session.user_name}
                        </span>
                      </div>
                    )}

                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '8px'
                    }}>
                      <div>
                        <div style={{ fontSize: '11px', color: '#6b7280' }}>
                          Session Energy
                        </div>
                        <div style={{ fontSize: '16px', fontWeight: '700', color: '#22c55e' }}>
                          {liveData.live_session.energy.toFixed(3)} kWh
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', color: '#6b7280' }}>
                          Duration
                        </div>
                        <div style={{ fontSize: '14px', fontWeight: '600', color: '#1f2937' }}>
                          {liveData.live_session.duration}
                        </div>
                      </div>
                    </div>

                    {liveData.live_session.power_kw > 0 && (
                      <div style={{
                        padding: '8px',
                        backgroundColor: 'rgba(34, 197, 94, 0.15)',
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}>
                        <span style={{ fontSize: '12px', fontWeight: '600', color: '#1f2937' }}>
                          Charging at
                        </span>
                        <span style={{ fontSize: '16px', fontWeight: '700', color: '#22c55e' }}>
                          {liveData.live_session.power_kw.toFixed(2)} kW
                        </span>
                      </div>
                    )}

                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '11px',
                      color: '#6b7280',
                      marginTop: '4px'
                    }}>
                      <Clock size={12} />
                      Started: {new Date(liveData.live_session.start_time).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              )}
            </div>
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
          Zaptec Connecting...
        </div>
      </div>
    );
  }

  return null;
}