import { Edit2, Trash2, Wifi, WifiOff, Activity, Battery, TrendingUp, Power, Gauge, Clock, User } from 'lucide-react';
import type { Charger } from '../../types';
import type { LiveChargerData, LoxoneConnectionStatus, ZaptecConnectionStatus } from './hooks/useChargerStatus';
import { getPreset } from '../chargerPresets';
import { getStateDisplay, getModeDisplay } from './utils/chargerUtils';
import ChargerConnectionStatus from './ChargerConnectionStatus';

interface ChargerCardProps {
  charger: Charger;
  liveData?: LiveChargerData;
  loxoneStatus?: LoxoneConnectionStatus[number];
  zaptecStatus?: ZaptecConnectionStatus[number];
  onEdit: () => void;
  onDelete: () => void;
  t: (key: string) => string;
}

export default function ChargerCard({
  charger,
  liveData,
  loxoneStatus,
  zaptecStatus,
  onEdit,
  onDelete,
  t
}: ChargerCardProps) {
  const chargerPreset = getPreset(charger.preset);
  const isCharging = liveData?.state === '67';
  const hasLiveSession = liveData?.live_session?.is_active;

  return (
    <div
      style={{
        backgroundColor: 'white',
        borderRadius: '16px',
        padding: '24px',
        boxShadow: '0 4px 6px rgba(0,0,0,0.07)',
        border: '1px solid #f0f0f0',
        position: 'relative',
        transition: 'all 0.2s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 8px 12px rgba(0,0,0,0.12)';
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.07)';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      {/* Action Buttons */}
      <div style={{
        position: 'absolute',
        top: '16px',
        right: '16px',
        display: 'flex',
        gap: '8px'
      }}>
        <button
          onClick={onEdit}
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            border: 'none',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            color: '#3b82f6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.2)';
            e.currentTarget.style.transform = 'scale(1.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
          title={t('common.edit')}
        >
          <Edit2 size={16} />
        </button>

        <button
          onClick={onDelete}
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            border: 'none',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            color: '#ef4444',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.2)';
            e.currentTarget.style.transform = 'scale(1.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
          title={t('common.delete')}
        >
          <Trash2 size={16} />
        </button>
      </div>

      {/* Charger Info */}
      <div style={{ paddingRight: '100px' }}>
        <h3 style={{
          fontSize: '20px',
          fontWeight: '600',
          marginBottom: '6px',
          color: '#1f2937',
          lineHeight: '1.3'
        }}>
          {charger.name}
        </h3>
        <p style={{
          fontSize: '14px',
          color: '#6b7280',
          margin: 0
        }}>
          {chargerPreset.label}
        </p>

        {/* Status Badges */}
        <div style={{
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap',
          marginTop: '12px'
        }}>
          {/* Online/Offline Badge */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 12px',
            backgroundColor: (liveData?.is_online ?? true) ? '#dcfce7' : '#fee2e2',
            border: `1px solid ${(liveData?.is_online ?? true) ? '#22c55e' : '#ef4444'}`,
            borderRadius: '12px'
          }}>
            {(liveData?.is_online ?? true) ? (
              <>
                <Wifi size={14} color="#22c55e" />
                <span style={{ fontSize: '12px', fontWeight: '600', color: '#22c55e' }}>
                  Online
                </span>
              </>
            ) : (
              <>
                <WifiOff size={14} color="#ef4444" />
                <span style={{ fontSize: '12px', fontWeight: '600', color: '#ef4444' }}>
                  Offline
                </span>
              </>
            )}
          </div>

          {/* Charging Badge */}
          {isCharging && (
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
              backgroundColor: '#d1fae5',
              border: '1px solid #10b981',
              borderRadius: '12px',
              animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
            }}>
              <Activity size={14} color="#10b981" />
              <span style={{ fontSize: '12px', fontWeight: '700', color: '#10b981' }}>
                CHARGING
              </span>
            </div>
          )}

          {/* State Badge */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '4px 12px',
            backgroundColor: '#f3f4f6',
            border: '1px solid #d1d5db',
            borderRadius: '12px'
          }}>
            <span style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280' }}>
              {getStateDisplay(charger, liveData?.state, t)}
            </span>
          </div>
        </div>
      </div>

      {/* Charger Details */}
      <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #f3f4f6' }}>
        {/* Connection Type */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <span style={{ fontSize: '13px', color: '#9ca3af', fontWeight: '500' }}>
            {t('chargers.connection') || 'Connection'}
          </span>
          <span style={{
            fontSize: '13px',
            fontWeight: '600',
            color: '#667eea',
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}>
            {charger.connection_type === 'loxone_api' ? 'Loxone API' :
              charger.connection_type === 'zaptec_api' ? 'Zaptec API' :
                charger.connection_type === 'udp' ? 'UDP' :
                  charger.connection_type}
          </span>
        </div>

        {/* Energy Readings Grid - Total & Session Energy */}
        {(liveData?.total_energy !== undefined || liveData?.session_energy !== undefined) && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: liveData?.total_energy !== undefined && liveData?.session_energy !== undefined ? '1fr 1fr' : '1fr',
            gap: '12px',
            marginBottom: '12px'
          }}>
            {/* Total Energy */}
            {liveData?.total_energy !== undefined && (
              <div style={{
                padding: '10px',
                backgroundColor: '#f0f9ff',
                borderRadius: '8px',
                border: '1px solid #e0f2fe'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginBottom: '4px'
                }}>
                  <Battery size={14} style={{ color: '#0284c7' }} />
                  <span style={{ fontSize: '11px', color: '#0369a1', fontWeight: '600' }}>
                    Total Energy
                  </span>
                </div>
                <div style={{ fontSize: '15px', fontWeight: '600', color: '#1f2937' }}>
                  {liveData.total_energy.toFixed(1)} kWh
                </div>
              </div>
            )}

            {/* Session Energy */}
            {liveData?.session_energy !== undefined && liveData.session_energy > 0 && (
              <div style={{
                padding: '10px',
                backgroundColor: '#f0fdf4',
                borderRadius: '8px',
                border: '1px solid #dcfce7'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginBottom: '4px'
                }}>
                  <TrendingUp size={14} style={{ color: '#16a34a' }} />
                  <span style={{ fontSize: '11px', color: '#15803d', fontWeight: '600' }}>
                    Session Energy
                  </span>
                </div>
                <div style={{ fontSize: '15px', fontWeight: '600', color: '#1f2937' }}>
                  {liveData.session_energy.toFixed(1)} kWh
                </div>
              </div>
            )}
          </div>
        )}

        {/* Current Power */}
        {liveData?.current_power_kw !== undefined && liveData.current_power_kw > 0 && (
          <div style={{
            padding: '12px',
            backgroundColor: '#fef3c7',
            borderRadius: '8px',
            border: '1px solid #fbbf24',
            marginBottom: '12px'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <Power size={16} style={{ color: '#f59e0b' }} />
                <span style={{ fontSize: '12px', color: '#92400e', fontWeight: '600' }}>
                  Current Power
                </span>
              </div>
              <div style={{ fontSize: '18px', fontWeight: '700', color: '#92400e' }}>
                {liveData.current_power_kw.toFixed(2)} kW
              </div>
            </div>
          </div>
        )}

        {/* Voltage & Current Grid */}
        {(liveData?.voltage || liveData?.current) && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '12px',
            marginBottom: '12px'
          }}>
            {liveData.voltage && (
              <div style={{
                padding: '10px',
                backgroundColor: '#f3f4f6',
                borderRadius: '8px',
                border: '1px solid #d1d5db'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginBottom: '4px'
                }}>
                  <Gauge size={14} color="#6b7280" />
                  <span style={{ fontSize: '11px', color: '#6b7280', fontWeight: '600' }}>
                    Voltage
                  </span>
                </div>
                <div style={{ fontSize: '15px', fontWeight: '600', color: '#1f2937' }}>
                  {liveData.voltage.toFixed(0)} V
                </div>
              </div>
            )}
            {liveData.current && (
              <div style={{
                padding: '10px',
                backgroundColor: '#f3f4f6',
                borderRadius: '8px',
                border: '1px solid #d1d5db'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginBottom: '4px'
                }}>
                  <Activity size={14} color="#6b7280" />
                  <span style={{ fontSize: '11px', color: '#6b7280', fontWeight: '600' }}>
                    Current
                  </span>
                </div>
                <div style={{ fontSize: '15px', fontWeight: '600', color: '#1f2937' }}>
                  {liveData.current.toFixed(1)} A
                </div>
              </div>
            )}
          </div>
        )}

        {/* Live Session Info */}
        {hasLiveSession && liveData.live_session && (
          <div style={{
            padding: '12px',
            backgroundColor: '#ede9fe',
            borderRadius: '8px',
            border: '1px solid #a78bfa',
            marginBottom: '12px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginBottom: '8px'
            }}>
              <Activity size={14} style={{ color: '#7c3aed' }} />
              <span style={{ fontSize: '12px', color: '#5b21b6', fontWeight: '700' }}>
                Active Charging Session
              </span>
            </div>
            {liveData.live_session.user_name && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '4px'
              }}>
                <User size={12} style={{ color: '#7c3aed' }} />
                <span style={{ fontSize: '12px', color: '#6b21a8', fontWeight: '500' }}>
                  {liveData.live_session.user_name}
                </span>
              </div>
            )}
            {liveData.live_session.duration && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <Clock size={12} style={{ color: '#7c3aed' }} />
                <span style={{ fontSize: '12px', color: '#6b21a8', fontWeight: '500' }}>
                  {liveData.live_session.duration}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Charging Mode */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '12px'
        }}>
          <span style={{ fontSize: '13px', color: '#9ca3af', fontWeight: '500' }}>
            Charging Mode
          </span>
          <span style={{
            padding: '4px 12px',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: '600',
            backgroundColor: liveData?.mode === '2' ? 'rgba(251, 191, 36, 0.1)' : 'rgba(156, 163, 175, 0.1)',
            color: liveData?.mode === '2' ? '#f59e0b' : '#6b7280'
          }}>
            {getModeDisplay(charger, liveData?.mode, t)}
          </span>
        </div>

        {/* Active Status */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', color: '#9ca3af', fontWeight: '500' }}>
            {t('common.status')}
          </span>
          <span style={{
            padding: '4px 12px',
            borderRadius: '20px',
            fontSize: '12px',
            fontWeight: '600',
            backgroundColor: charger.is_active ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            color: charger.is_active ? '#22c55e' : '#ef4444'
          }}>
            {charger.is_active ? t('common.active') : t('common.inactive')}
          </span>
        </div>
      </div>

      {/* Connection Status */}
      <ChargerConnectionStatus
        charger={charger}
        liveData={liveData}
        loxoneStatus={loxoneStatus}
        zaptecStatus={zaptecStatus}
        t={t}
      />
    </div>
  );
}