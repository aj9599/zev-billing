import { Edit2, Trash2, Wifi, WifiOff, Activity, Battery, TrendingUp, Power, Gauge, Clock, User, Zap } from 'lucide-react';
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
  const isCharging = charger.connection_type === 'zaptec_api' 
    ? liveData?.state === '3'  // Zaptec: state 3 = Charging
    : liveData?.state === '67'; // Weidmüller: state 67 = Charging
  const hasLiveSession = liveData?.live_session?.is_active || zaptecStatus?.live_session?.is_active;
  
  // For Zaptec chargers, prefer zaptecStatus data over liveData
  const totalEnergy = charger.connection_type === 'zaptec_api' 
    ? (zaptecStatus?.last_reading ?? liveData?.total_energy)
    : liveData?.total_energy;
    
  const sessionEnergy = charger.connection_type === 'zaptec_api'
    ? (zaptecStatus?.session_energy ?? zaptecStatus?.live_session?.energy ?? liveData?.session_energy)
    : liveData?.session_energy;
    
  const currentPowerKW = charger.connection_type === 'zaptec_api'
    ? (zaptecStatus?.current_power_kw ?? liveData?.current_power_kw)
    : liveData?.current_power_kw;
    
  const isOnline = charger.connection_type === 'zaptec_api'
    ? (zaptecStatus?.is_online ?? liveData?.is_online ?? true)
    : (liveData?.is_online ?? true);
    
  const liveSession = charger.connection_type === 'zaptec_api'
    ? (zaptecStatus?.live_session ?? liveData?.live_session)
    : liveData?.live_session;

  // Determine charger state for styling
  const stateDisplay = getStateDisplay(charger, liveData?.state, t);
  const isCompleted = charger.connection_type === 'zaptec_api' 
    ? liveData?.state === '5'  // Zaptec: state 5 = Completed
    : false;
  const isDisconnected = charger.connection_type === 'zaptec_api'
    ? liveData?.state === '1'  // Zaptec: state 1 = Disconnected
    : liveData?.state === '50'; // Weidmüller: state 50 = Idle
  const isAwaitingStart = charger.connection_type === 'zaptec_api'
    ? liveData?.state === '2'  // Zaptec: state 2 = Awaiting Start
    : liveData?.state === '66'; // Weidmüller: state 66 = Waiting Auth

  // Calculate power percentage for gauge (max 22kW)
  const powerPercentage = currentPowerKW ? Math.min((currentPowerKW / 22) * 100, 100) : 0;
  const circleSize = 120;
  const strokeWidth = 10;
  const radius = (circleSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (powerPercentage / 100) * circumference;

  return (
    <div
      style={{
        backgroundColor: isCharging 
          ? 'radial-gradient(circle at top left, rgba(34,197,94,0.08), transparent 55%), radial-gradient(circle at bottom right, rgba(16,185,129,0.12), rgba(255,255,255,0.98))'
          : isCompleted
          ? 'radial-gradient(circle at top left, rgba(56,189,248,0.08), transparent 55%), rgba(255,255,255,0.98)'
          : 'white',
        backgroundImage: isCharging 
          ? 'radial-gradient(circle at top left, rgba(34,197,94,0.08), transparent 55%), radial-gradient(circle at bottom right, rgba(16,185,129,0.12), transparent)'
          : isCompleted
          ? 'radial-gradient(circle at top left, rgba(56,189,248,0.08), transparent 55%), transparent'
          : 'none',
        borderRadius: '24px',
        padding: '24px',
        boxShadow: isCharging 
          ? '0 0 30px rgba(34,197,94,0.2), 0 8px 16px rgba(0,0,0,0.1)'
          : '0 4px 6px rgba(0,0,0,0.07)',
        border: isCharging 
          ? '2px solid rgba(16,185,129,0.3)'
          : '1px solid #f0f0f0',
        position: 'relative',
        transition: 'all 0.3s ease',
      }}
      onMouseEnter={(e) => {
        if (!isCharging) {
          e.currentTarget.style.boxShadow = '0 8px 12px rgba(0,0,0,0.12)';
          e.currentTarget.style.transform = 'translateY(-2px)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isCharging) {
          e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.07)';
          e.currentTarget.style.transform = 'translateY(0)';
        }
      }}
    >
      {/* Global CSS Animations */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes flowRight {
          0% { left: -100%; }
          100% { left: 100%; }
        }
        @keyframes energyFlow {
          0% { transform: translateX(-120%); opacity: 0.6; }
          100% { transform: translateX(220%); opacity: 0; }
        }
        @keyframes softGlow {
          0%, 100% {
            box-shadow: 0 0 30px rgba(34, 197, 94, 0.25), 0 0 80px rgba(34, 197, 94, 0.15);
          }
          50% {
            box-shadow: 0 0 40px rgba(52, 211, 153, 0.45), 0 0 110px rgba(52, 211, 153, 0.25);
          }
        }
        @keyframes ringPulse {
          0% { transform: scale(0.9); opacity: 0.25; }
          70% { transform: scale(1.15); opacity: 0; }
          100% { opacity: 0; }
        }
        @keyframes floatPulse {
          0%, 100% { transform: translateY(0); opacity: 0.6; }
          50% { transform: translateY(-4px); opacity: 1; }
        }
        @keyframes chargingPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.85; transform: scale(1.02); }
        }
      `}} />

      {/* Animated glow effect for charging state */}
      {isCharging && (
        <div style={{
          position: 'absolute',
          inset: '-2px',
          borderRadius: '24px',
          background: 'linear-gradient(45deg, transparent, rgba(16,185,129,0.15), transparent)',
          animation: 'flowRight 3s linear infinite',
          pointerEvents: 'none',
          zIndex: 0
        }} />
      )}

      {/* Action Buttons */}
      <div style={{
        position: 'absolute',
        top: '16px',
        right: '16px',
        display: 'flex',
        gap: '8px',
        zIndex: 10
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
      <div style={{ paddingRight: '100px', position: 'relative', zIndex: 1 }}>
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
            backgroundColor: isOnline ? '#dcfce7' : '#fee2e2',
            border: `1px solid ${isOnline ? '#22c55e' : '#ef4444'}`,
            borderRadius: '12px'
          }}>
            {isOnline ? (
              <>
                <Wifi size={14} color="#22c55e" />
                <span style={{ fontSize: '12px', fontWeight: '600', color: '#22c55e' }}>
                  {t('chargers.status.online')}
                </span>
              </>
            ) : (
              <>
                <WifiOff size={14} color="#ef4444" />
                <span style={{ fontSize: '12px', fontWeight: '600', color: '#ef4444' }}>
                  {t('chargers.status.offline')}
                </span>
              </>
            )}
          </div>

          {/* Charging Badge with Animation */}
          {isCharging && (
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
              backgroundColor: '#d1fae5',
              border: '1px solid #10b981',
              borderRadius: '12px',
              animation: 'chargingPulse 2s ease-in-out infinite'
            }}>
              <Activity size={14} color="#10b981" />
              <span style={{ fontSize: '12px', fontWeight: '700', color: '#10b981' }}>
                {t('chargers.status.charging')}
              </span>
            </div>
          )}

          {/* State Badge */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '4px 12px',
            backgroundColor: isCompleted ? '#dbeafe' : isAwaitingStart ? '#fef3c7' : '#f3f4f6',
            border: `1px solid ${isCompleted ? '#3b82f6' : isAwaitingStart ? '#fbbf24' : '#d1d5db'}`,
            borderRadius: '12px'
          }}>
            <span style={{ 
              fontSize: '12px', 
              fontWeight: '600', 
              color: isCompleted ? '#3b82f6' : isAwaitingStart ? '#f59e0b' : '#6b7280' 
            }}>
              {stateDisplay}
            </span>
          </div>
        </div>
      </div>

      {/* Premium Charging Animation with Power Gauge */}
      {isCharging && currentPowerKW !== undefined && currentPowerKW > 0 && (
        <div style={{
          marginTop: '20px',
          padding: '20px',
          background: 'radial-gradient(circle at top left, rgba(34,197,94,0.15), transparent 55%), radial-gradient(circle at bottom right, rgba(16,185,129,0.2), rgba(240,253,244,0.98))',
          borderRadius: '16px',
          border: '2px solid rgba(16,185,129,0.3)',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: '0 0 30px rgba(34,197,94,0.15), inset 0 1px 0 rgba(255,255,255,0.5)'
        }}>
          {/* Animated glow effect */}
          <div style={{
            position: 'absolute',
            inset: '-2px',
            borderRadius: '16px',
            background: 'linear-gradient(45deg, transparent, rgba(16,185,129,0.1), transparent)',
            animation: 'flowRight 3s linear infinite',
            pointerEvents: 'none'
          }} />

          {/* Main content with gauge and flow */}
          <div style={{
            position: 'relative',
            zIndex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            {/* Power Gauge */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '24px'
            }}>
              {/* Circular Gauge */}
              <div style={{
                position: 'relative',
                width: circleSize,
                height: circleSize,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {/* Pulsing ring */}
                <div style={{
                  position: 'absolute',
                  inset: -10,
                  borderRadius: '999px',
                  border: '1px solid #22c55e',
                  animation: 'ringPulse 1.6s ease-out infinite'
                }} />

                {/* SVG Gauge */}
                <svg width={circleSize} height={circleSize} style={{ transform: 'rotate(-90deg)' }}>
                  {/* Background circle */}
                  <circle
                    cx={circleSize / 2}
                    cy={circleSize / 2}
                    r={radius}
                    stroke="rgba(148,163,184,0.3)"
                    strokeWidth={strokeWidth}
                    fill="transparent"
                  />
                  {/* Progress circle */}
                  <circle
                    cx={circleSize / 2}
                    cy={circleSize / 2}
                    r={radius}
                    stroke="#22c55e"
                    strokeWidth={strokeWidth}
                    fill="transparent"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    style={{
                      transition: 'stroke-dashoffset 0.4s ease',
                      filter: 'drop-shadow(0 0 8px rgba(34,197,94,0.6))'
                    }}
                  />
                </svg>

                {/* Center text */}
                <div style={{
                  position: 'absolute',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 2,
                  animation: 'floatPulse 2s ease-in-out infinite'
                }}>
                  <span style={{ fontSize: '24px', fontWeight: '700', color: '#059669' }}>
                    {currentPowerKW.toFixed(1)}
                  </span>
                  <span style={{ fontSize: '12px', color: '#059669', fontWeight: '600' }}>
                    kW
                  </span>
                </div>
              </div>

              {/* Energy Info */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {sessionEnergy !== undefined && sessionEnergy > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontSize: '11px', color: '#059669', fontWeight: '600' }}>
                      {t('chargers.energy.liveSession')}
                    </span>
                    <span style={{ fontSize: '18px', fontWeight: '700', color: '#16a34a' }}>
                      {sessionEnergy.toFixed(1)} kWh
                    </span>
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '11px', color: '#059669', fontWeight: '600' }}>
                    {t('chargers.energy.total')}
                  </span>
                  <span style={{ fontSize: '14px', fontWeight: '600', color: '#059669' }}>
                    {totalEnergy?.toFixed(1) ?? '0.0'} kWh
                  </span>
                </div>
              </div>
            </div>

            {/* Power Flow Bar */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '11px',
              color: '#059669',
              fontWeight: '600',
              marginBottom: '8px'
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '16px' }}>⚡</span>
                <span>Grid</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '16px' }}>🔌</span>
                <span>Charger</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '16px' }}>🚗</span>
                <span>Car</span>
              </span>
            </div>

            {/* Animated Energy Flow Track */}
            <div style={{
              position: 'relative',
              height: '12px',
              borderRadius: '999px',
              background: 'linear-gradient(90deg, rgba(15,23,42,0.15) 0%, rgba(15,23,42,0.1) 100%)',
              overflow: 'hidden',
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)'
            }}>
              {/* Gradient fill */}
              <div style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(90deg, rgba(34,197,94,0.9), rgba(250,204,21,0.85), rgba(16,185,129,0.9))',
                opacity: 0.9
              }} />

              {/* Moving energy particles */}
              {Array.from({ length: 6 }).map((_, idx) => (
                <div
                  key={idx}
                  style={{
                    position: 'absolute',
                    top: '2px',
                    left: '-30px',
                    width: '20px',
                    height: '8px',
                    borderRadius: '999px',
                    background: 'radial-gradient(circle at 30%, rgba(255,255,255,0.95), rgba(255,255,255,0.3) 70%)',
                    filter: 'blur(1px)',
                    animation: `energyFlow 1.3s linear infinite`,
                    animationDelay: `${idx * 0.2}s`,
                    boxShadow: '0 0 8px rgba(255,255,255,0.6)'
                  }}
                />
              ))}
            </div>

            {/* Status Text */}
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '8px',
              fontSize: '12px',
              color: '#059669',
              fontWeight: '600'
            }}>
              <Zap size={14} style={{ animation: 'floatPulse 1.5s ease-in-out infinite' }} />
              <span>Power flowing • {currentPowerKW.toFixed(2)} kW</span>
            </div>
          </div>
        </div>
      )}

      {/* Charger Details */}
      <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #f3f4f6', position: 'relative', zIndex: 1 }}>
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

        {/* Energy Readings - Only show if not actively charging (to avoid duplication) */}
        {!isCharging && totalEnergy !== undefined && (
          <div style={{
            padding: '12px',
            backgroundColor: '#f0f9ff',
            borderRadius: '8px',
            border: '1px solid #e0f2fe',
            marginBottom: '12px'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: sessionEnergy !== undefined && sessionEnergy > 0 ? '8px' : '0'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <Battery size={14} style={{ color: '#0284c7' }} />
                <span style={{ fontSize: '11px', color: '#0369a1', fontWeight: '600' }}>
                  {t('chargers.energy.total')}
                </span>
              </div>
              <div style={{ fontSize: '18px', fontWeight: '700', color: '#1f2937' }}>
                {totalEnergy.toFixed(1)} kWh
              </div>
            </div>
            
            {/* Show session energy inside the same box */}
            {sessionEnergy !== undefined && sessionEnergy > 0 && (
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingTop: '8px',
                borderTop: '1px solid #e0f2fe'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <TrendingUp size={12} style={{ color: '#16a34a' }} />
                  <span style={{ fontSize: '11px', color: '#15803d', fontWeight: '600' }}>
                    {hasLiveSession ? t('chargers.energy.liveSession') : t('chargers.energy.lastSession')}
                  </span>
                </div>
                <div style={{ fontSize: '15px', fontWeight: '600', color: '#16a34a' }}>
                  {sessionEnergy.toFixed(1)} kWh
                </div>
              </div>
            )}
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
                    {t('chargers.electrical.voltage')}
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
                    {t('chargers.electrical.current')}
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
        {hasLiveSession && liveSession && (
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
                {t('chargers.session.activeSession')}
              </span>
            </div>
            {liveSession.user_name && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '4px'
              }}>
                <User size={12} style={{ color: '#7c3aed' }} />
                <span style={{ fontSize: '12px', color: '#6b21a8', fontWeight: '500' }}>
                  {liveSession.user_name}
                </span>
              </div>
            )}
            {liveSession.duration && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <Clock size={12} style={{ color: '#7c3aed' }} />
                <span style={{ fontSize: '12px', color: '#6b21a8', fontWeight: '500' }}>
                  {liveSession.duration}
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
            {t('chargers.chargingMode')}
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