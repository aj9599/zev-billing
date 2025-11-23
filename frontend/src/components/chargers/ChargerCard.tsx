import { Edit2, Trash2, Wifi, WifiOff, Activity, Battery, TrendingUp, Gauge, Clock, User } from 'lucide-react';
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
    
    // Determine state value - prioritize zaptecStatus for Zaptec chargers
    const stateValue = charger.connection_type === 'zaptec_api'
        ? (zaptecStatus?.state_description ? 
            // Map state description to state number
            (zaptecStatus.state_description === 'Unknown' ? '0' :
             zaptecStatus.state_description === 'Disconnected' ? '1' :
             zaptecStatus.state_description === 'Waiting for Authorization' ? '2' :
             zaptecStatus.state_description === 'Charging' ? '3' :
             zaptecStatus.state_description === 'Finished Charging' ? '5' : '0')
            : liveData?.state ?? '0')
        : liveData?.state ?? '0';

    const isCharging = charger.connection_type === 'zaptec_api'
        ? stateValue === '3'  // Zaptec: state 3 = Charging
        : stateValue === '67'; // Weidmüller: state 67 = Charging

    const hasLiveSession = liveData?.live_session?.is_active || zaptecStatus?.live_session?.is_active;

    // For Zaptec chargers, prefer zaptecStatus data over liveData
    const totalEnergy = charger.connection_type === 'zaptec_api'
        ? (zaptecStatus?.last_reading ?? liveData?.total_energy ?? 0)
        : (liveData?.total_energy ?? 0);

    // FIXED: Session energy logic based on state
    // For Unknown (0) or Disconnected (1): ALWAYS show last session energy
    // For Waiting for Authorization (2): show 0 (no session yet)
    // For Charging (3): show current live session energy
    // For Completed (5): show completed session energy
    const isUnknownOrDisconnected = stateValue === '0' || stateValue === '1';
    const isAwaitingStart = charger.connection_type === 'zaptec_api'
        ? stateValue === '2'
        : stateValue === '66';
    
    // CRITICAL FIX: Always get session energy from zaptecStatus for Zaptec chargers
    const sessionEnergy = charger.connection_type === 'zaptec_api'
        ? (isAwaitingStart 
            ? 0 // No session yet when waiting for auth
            : (zaptecStatus?.session_energy ?? zaptecStatus?.live_session?.energy ?? liveData?.session_energy ?? 0))
        : (liveData?.session_energy ?? 0);

    const currentPowerKW = charger.connection_type === 'zaptec_api'
        ? (zaptecStatus?.current_power_kw ?? liveData?.current_power_kw ?? 0)
        : (liveData?.current_power_kw ?? 0);

    const isOnline = charger.connection_type === 'zaptec_api'
        ? (zaptecStatus?.is_online ?? liveData?.is_online ?? true)
        : (liveData?.is_online ?? true);

    const liveSession = charger.connection_type === 'zaptec_api'
        ? (zaptecStatus?.live_session ?? liveData?.live_session)
        : liveData?.live_session;

    console.log('[ChargerCard] Charging state:', {
        name: charger.name,
        state: stateValue,
        isCharging,
        isUnknownOrDisconnected,
        isAwaitingStart,
        power: currentPowerKW,
        sessionEnergy,
        hasLiveSession,
        zaptecStatus: zaptecStatus,
        liveData: liveData
    });

    // Determine charger state for styling - use native Zaptec states
    const stateDisplay = getStateDisplay(charger, stateValue, t);

    // Zaptec states: 0=Unknown, 1=Disconnected, 2=Awaiting Start, 3=Charging, 5=Completed
    const isCompleted = charger.connection_type === 'zaptec_api'
        ? stateValue === '5'  // Zaptec: state 5 = Completed
        : false;
    const isDisconnected = charger.connection_type === 'zaptec_api'
        ? stateValue === '1'  // Zaptec: state 1 = Disconnected
        : stateValue === '50'; // Weidmüller: state 50 = Idle

    // Calculate session duration properly - FIXED
    const calculateDuration = (startTimeStr: string): string => {
        if (!startTimeStr || startTimeStr === '0001-01-01T00:00:00' || startTimeStr === '0001-01-01T00:00:00Z') {
            return '';
        }
    
        try {
            // Add 'Z' if no timezone indicator to force UTC interpretation
            const timestamp = startTimeStr.endsWith('Z') ? startTimeStr : startTimeStr + 'Z';
            const startTime = new Date(timestamp);
            
            if (isNaN(startTime.getTime())) {
                return '';
            }
    
            const diffMs = Date.now() - startTime.getTime();
            
            if (diffMs < 0) return ''; // Safety check
    
            const hours = Math.floor(diffMs / (1000 * 60 * 60));
            const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
            if (hours > 0) return `${hours}h ${minutes}m`;
            if (minutes > 0) return `${minutes}m`;
            
            const seconds = Math.floor(diffMs / 1000);
            return `${seconds}s`;
        } catch {
            return '';
        }
    };

    // Get duration from live session - FIXED: Show for active OR completed sessions
    const sessionDuration = liveSession?.start_time
        ? calculateDuration(liveSession.start_time)
        : liveSession?.duration || '';

    // Calculate power percentage for gauge (max 22kW)
    const powerPercentage = currentPowerKW ? Math.min((currentPowerKW / 22) * 100, 100) : 0;
    const circleSize = 120;
    const strokeWidth = 10;
    const radius = (circleSize - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (powerPercentage / 100) * circumference;

    // Get the actual mode value for display - FIXED
    const modeValue = liveData?.mode ?? '1';
    const modeDisplay = getModeDisplay(charger, modeValue, t);

    return (
        <div
            style={{
                backgroundColor: 'white',
                backgroundImage: isCompleted
                    ? 'radial-gradient(circle at top left, rgba(56,189,248,0.08), transparent 55%), transparent'
                    : 'none',
                borderRadius: '24px',
                padding: '24px',
                boxShadow: '0 4px 6px rgba(0,0,0,0.07)',
                border: '1px solid #f0f0f0',
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
            <style dangerouslySetInnerHTML={{
                __html: `
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
        @keyframes gaugePulse {
          0%, 100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.01);
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

            {/* Header with Charger Info and Badge */}
            <div style={{
                paddingRight: '100px',
                position: 'relative',
                zIndex: 1,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '16px'
            }}>
                <div>
                    <h3 style={{
                        fontSize: '20px',
                        fontWeight: '600',
                        marginBottom: '4px',
                        color: '#1f2937',
                        lineHeight: '1.3'
                    }}>
                        {charger.name}
                    </h3>
                    <p style={{
                        fontSize: '13px',
                        color: '#6b7280',
                        margin: 0
                    }}>
                        {chargerPreset.label}
                    </p>
                </div>

                {/* Main State Badge */}
                <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '6px 14px',
                    backgroundColor: isCharging ? '#d1fae5' : isCompleted ? '#dbeafe' : isAwaitingStart ? '#fef3c7' : '#f3f4f6',
                    border: `2px solid ${isCharging ? '#10b981' : isCompleted ? '#3b82f6' : isAwaitingStart ? '#fbbf24' : '#d1d5db'}`,
                    borderRadius: '12px',
                    animation: isCharging ? 'chargingPulse 2s ease-in-out infinite' : 'none'
                }}>
                    <span style={{
                        fontSize: '12px',
                        fontWeight: '700',
                        color: isCharging ? '#22c55e' : isCompleted ? '#3b82f6' : isAwaitingStart ? '#f59e0b' : '#6b7280',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                    }}>
                        {stateDisplay}
                    </span>
                </div>
            </div>

            {/* Status description */}
            <div style={{ marginBottom: '20px', position: 'relative', zIndex: 1 }}>
                <p style={{
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#1f2937',
                    margin: '0 0 4px 0'
                }}>
                    {isCharging ? t('chargers.status.chargingInProgress') || 'Charging in progress' :
                        isCompleted ? t('chargers.status.chargingFinished') || 'Charging finished' :
                            isAwaitingStart ? t('chargers.status.waitingForAuth') || 'Waiting for authentication' :
                                isDisconnected ? t('chargers.status.noCarConnected') || 'No car connected' :
                                    t('chargers.status.ready') || 'Ready to charge'}
                </p>
                <p style={{
                    fontSize: '12px',
                    color: '#9ca3af',
                    margin: 0
                }}>
                    {isCharging ? t('chargers.status.chargingDesc') || 'Vehicle is charging with optimized power flow' :
                        isCompleted ? t('chargers.status.finishedDesc') || 'Charging session completed. You can unplug.' :
                            isAwaitingStart ? t('chargers.status.waitingDesc') || 'Waiting for authorization to start charging' :
                                isDisconnected ? t('chargers.status.disconnectedDesc') || 'Plug in a vehicle to start charging' :
                                    t('chargers.status.readyDesc') || 'Connect vehicle to start charging'}
                </p>
            </div>

            {/* Main Gauge Display - Always visible */}
            <div style={{
                marginTop: '8px',
                padding: '24px',
                background: isCompleted
                    ? 'radial-gradient(circle at top left, rgba(56,189,248,0.12), transparent 55%), rgba(240,249,255,0.98)'
                    : isAwaitingStart
                        ? 'radial-gradient(circle at top left, rgba(251,191,36,0.12), transparent 55%), rgba(254,252,232,0.98)'
                        : 'rgba(249,250,251,0.8)',
                borderRadius: '20px',
                border: isCompleted
                    ? '2px solid rgba(59,130,246,0.3)'
                    : isAwaitingStart
                        ? '2px solid rgba(251,191,36,0.3)'
                        : '2px solid rgba(229,231,235,0.8)',
                position: 'relative',
                overflow: 'hidden',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                transition: 'all 0.3s ease'
            }}>


                {/* Main content with gauge and data */}
                <div style={{
                    position: 'relative',
                    zIndex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '24px'
                }}>
                    {/* Circular Power Gauge - FIXED COLORS */}
                    <div style={{
                        position: 'relative',
                        width: circleSize,
                        height: circleSize,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        animation: isCharging ? 'gaugePulse 2s ease-in-out infinite' : 'none'
                    }}>
                        {/* Pulsing ring when charging */}
                        {isCharging && (
                            <div style={{
                                position: 'absolute',
                                inset: -10,
                                borderRadius: '999px',
                                border: '1px solid #22c55e',
                                animation: 'ringPulse 1.6s ease-out infinite'
                            }} />
                        )}

                        {/* SVG Gauge */}
                        <svg width={circleSize} height={circleSize} style={{ transform: 'rotate(-90deg)' }}>
                            {/* Background circle */}
                            <circle
                                cx={circleSize / 2}
                                cy={circleSize / 2}
                                r={radius}
                                stroke="rgba(209,213,219,0.4)"
                                strokeWidth={strokeWidth}
                                fill="transparent"
                            />
                            {/* Progress circle - Green when charging - FIXED */}
                            <circle
                                cx={circleSize / 2}
                                cy={circleSize / 2}
                                r={radius}
                                stroke={isCharging ? '#22c55e' : isCompleted ? '#3b82f6' : isAwaitingStart ? '#fbbf24' : '#9ca3af'}
                                strokeWidth={strokeWidth}
                                fill="transparent"
                                strokeDasharray={circumference}
                                strokeDashoffset={strokeDashoffset}
                                strokeLinecap="round"
                                style={{
                                    transition: 'stroke-dashoffset 0.5s ease, stroke 0.3s ease',
                                    filter: isCharging
                                        ? 'drop-shadow(0 0 12px rgba(34,197,94,0.8))'
                                        : isCompleted
                                            ? 'drop-shadow(0 0 6px rgba(59,130,246,0.4))'
                                            : isAwaitingStart
                                                ? 'drop-shadow(0 0 6px rgba(251,191,36,0.4))'
                                                : 'none'
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
                            animation: isCharging ? 'floatPulse 2s ease-in-out infinite' : 'none'
                        }}>
                            <span style={{
                                fontSize: '28px',
                                fontWeight: '700',
                                color: isCharging ? '#059669' : isCompleted ? '#2563eb' : isAwaitingStart ? '#d97706' : '#6b7280'
                            }}>
                                {currentPowerKW.toFixed(1)}
                            </span>
                            <span style={{
                                fontSize: '13px',
                                color: isCharging ? '#059669' : isCompleted ? '#2563eb' : isAwaitingStart ? '#d97706' : '#9ca3af',
                                fontWeight: '600'
                            }}>
                                kW
                            </span>
                            {isCharging && (
                                <div style={{
                                    marginTop: '4px',
                                    padding: '2px 8px',
                                    backgroundColor: 'rgba(34,197,94,0.25)',
                                    borderRadius: '8px',
                                    fontSize: '10px',
                                    fontWeight: '700',
                                    color: '#22c55e',
                                    animation: 'chargingPulse 2s ease-in-out infinite'
                                }}>
                                    âš¡ {t('chargers.state.charging')}
                                </div>
                            )}
                            {isCompleted && (
                                <div style={{
                                    marginTop: '4px',
                                    padding: '2px 8px',
                                    backgroundColor: 'rgba(59,130,246,0.15)',
                                    borderRadius: '8px',
                                    fontSize: '10px',
                                    fontWeight: '600',
                                    color: '#2563eb'
                                }}>
                                    âœ“ {t('chargers.state.completed')}
                                </div>
                            )}
                            {isAwaitingStart && (
                                <div style={{
                                    marginTop: '4px',
                                    padding: '2px 8px',
                                    backgroundColor: 'rgba(251,191,36,0.15)',
                                    borderRadius: '8px',
                                    fontSize: '10px',
                                    fontWeight: '600',
                                    color: '#d97706'
                                }}>
                                    ðŸ”’ {t('chargers.state.awaitingStart')}
                                </div>
                            )}
                            {isDisconnected && (
                                <div style={{
                                    marginTop: '4px',
                                    padding: '2px 8px',
                                    backgroundColor: 'rgba(156,163,175,0.15)',
                                    borderRadius: '8px',
                                    fontSize: '10px',
                                    fontWeight: '600',
                                    color: '#6b7280'
                                }}>
                                    {t('chargers.state.disconnected')}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Energy Data */}
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '16px',
                        flex: 1
                    }}>
                        {/* Total Energy */}
                        {totalEnergy > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}>
                                    <Battery size={16} style={{ color: '#0284c7' }} />
                                    <span style={{
                                        fontSize: '12px',
                                        color: '#0369a1',
                                        fontWeight: '600',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px'
                                    }}>
                                        {t('chargers.energy.total') || 'Total Energy'}
                                    </span>
                                </div>
                                <span style={{
                                    fontSize: '24px',
                                    fontWeight: '700',
                                    color: '#1f2937',
                                    marginLeft: '22px'
                                }}>
                                    {totalEnergy.toFixed(3)} <span style={{ fontSize: '16px', fontWeight: '600', color: '#6b7280' }}>kWh</span>
                                </span>
                            </div>
                        )}

                        {/* Session Energy - CRITICAL FIX: Always show if > 0, regardless of state */}
                        {sessionEnergy > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}>
                                    <TrendingUp size={16} style={{ color: isCharging ? '#16a34a' : '#0284c7' }} />
                                    <span style={{
                                        fontSize: '12px',
                                        color: isCharging ? '#15803d' : '#0369a1',
                                        fontWeight: '600',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px'
                                    }}>
                                        {isCharging
                                            ? (t('chargers.energy.currentSession') || 'Current Session')
                                            : (t('chargers.energy.lastSession') || 'Last Session')}
                                    </span>
                                </div>
                                <span style={{
                                    fontSize: '20px',
                                    fontWeight: '700',
                                    color: isCharging ? '#16a34a' : '#1f2937',
                                    marginLeft: '22px'
                                }}>
                                    {sessionEnergy.toFixed(3)} <span style={{ fontSize: '14px', fontWeight: '600', color: '#6b7280' }}>kWh</span>
                                </span>
                            </div>
                        )}

                        {/* Waiting for Auth Banner - FIXED */}
                        {isAwaitingStart && sessionEnergy === 0 && (
                            <div style={{
                                padding: '12px',
                                backgroundColor: 'rgba(251,191,36,0.1)',
                                borderRadius: '8px',
                                border: '1px solid rgba(251,191,36,0.3)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}>
                                <span style={{ fontSize: '16px' }}>ðŸ”’</span>
                                <div style={{ flex: 1 }}>
                                    <div style={{
                                        fontSize: '11px',
                                        fontWeight: '700',
                                        color: '#d97706',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px',
                                        marginBottom: '2px'
                                    }}>
                                        {t('chargers.state.awaitingStart') || 'Awaiting Start'}
                                    </div>
                                    <div style={{
                                        fontSize: '10px',
                                        color: '#92400e'
                                    }}>
                                        {t('chargers.status.scanRFID') || 'Please scan your RFID card on the charger'}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Status indicator with icon */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            marginTop: '8px',
                            paddingTop: '12px',
                            borderTop: '1px solid rgba(229,231,235,0.6)'
                        }}>
                            {isOnline ? (
                                <>
                                    <Wifi size={16} color="#22c55e" />
                                    <span style={{ fontSize: '12px', fontWeight: '600', color: '#22c55e' }}>
                                        {t('chargers.status.connected') || 'Connected'} â€¢ {t('chargers.status.online')}
                                    </span>
                                </>
                            ) : (
                                <>
                                    <WifiOff size={16} color="#ef4444" />
                                    <span style={{ fontSize: '12px', fontWeight: '600', color: '#ef4444' }}>
                                        {t('chargers.status.offline')}
                                    </span>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Additional Details Section */}
            <div style={{
                marginTop: '16px',
                paddingTop: '16px',
                borderTop: '1px solid #f3f4f6',
                position: 'relative',
                zIndex: 1
            }}>
                {/* Connection Type */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <span style={{ fontSize: '12px', color: '#9ca3af', fontWeight: '500' }}>
                        {t('chargers.connection') || 'Connection'}
                    </span>
                    <span style={{
                        fontSize: '12px',
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

                {/* Voltage & Current Grid - Compact */}
                {(liveData?.voltage || liveData?.current) && (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '10px',
                        marginBottom: '10px'
                    }}>
                        {liveData.voltage && (
                            <div style={{
                                padding: '8px',
                                backgroundColor: '#f9fafb',
                                borderRadius: '8px',
                                border: '1px solid #e5e7eb'
                            }}>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    marginBottom: '2px'
                                }}>
                                    <Gauge size={12} color="#6b7280" />
                                    <span style={{ fontSize: '10px', color: '#6b7280', fontWeight: '600' }}>
                                        {t('chargers.electrical.voltage')}
                                    </span>
                                </div>
                                <div style={{ fontSize: '14px', fontWeight: '600', color: '#1f2937' }}>
                                    {liveData.voltage.toFixed(0)} V
                                </div>
                            </div>
                        )}
                        {liveData.current && (
                            <div style={{
                                padding: '8px',
                                backgroundColor: '#f9fafb',
                                borderRadius: '8px',
                                border: '1px solid #e5e7eb'
                            }}>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    marginBottom: '2px'
                                }}>
                                    <Activity size={12} color="#6b7280" />
                                    <span style={{ fontSize: '10px', color: '#6b7280', fontWeight: '600' }}>
                                        {t('chargers.electrical.current')}
                                    </span>
                                </div>
                                <div style={{ fontSize: '14px', fontWeight: '600', color: '#1f2937' }}>
                                    {liveData.current.toFixed(3)} A
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Live Session Info - CRITICAL FIX: Show for ALL states if liveSession exists */}
                {liveSession && sessionEnergy > 0 && (
                    <div style={{
                        padding: '10px',
                        backgroundColor: '#faf5ff',
                        borderRadius: '8px',
                        border: '1px solid #e9d5ff',
                        marginBottom: '10px'
                    }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: '6px'
                        }}>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}>
                                <Activity size={12} style={{ color: '#7c3aed' }} />
                                <span style={{ fontSize: '11px', color: '#5b21b6', fontWeight: '700' }}>
                                    {isCharging 
                                        ? (t('chargers.session.activeSession') || 'Active Session')
                                        : (t('chargers.session.lastSession') || 'Last Session')}
                                </span>
                            </div>
                        </div>
                        {liveSession.user_name && (
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                marginBottom: '3px'
                            }}>
                                <User size={11} style={{ color: '#7c3aed' }} />
                                <span style={{ fontSize: '11px', color: '#6b21a8', fontWeight: '500' }}>
                                    {liveSession.user_name}
                                </span>
                            </div>
                        )}
                        {sessionDuration && (
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}>
                                <Clock size={11} style={{ color: '#7c3aed' }} />
                                <span style={{ fontSize: '11px', color: '#6b21a8', fontWeight: '500' }}>
                                    {sessionDuration}
                                </span>
                            </div>
                        )}
                    </div>
                )}

                {/* Charging Mode & Active Status - Inline - FIXED MODE DISPLAY */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px'
                }}>
                    {/* Charging Mode */}
                    <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '12px', color: '#9ca3af', fontWeight: '500' }}>
                                {t('chargers.chargingMode')}
                            </span>
                            <span style={{
                                padding: '3px 10px',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: '600',
                                backgroundColor: modeValue === '2' ? 'rgba(251, 191, 36, 0.1)' : 'rgba(156, 163, 175, 0.1)',
                                color: modeValue === '2' ? '#f59e0b' : '#6b7280'
                            }}>
                                {modeDisplay}
                            </span>
                        </div>
                    </div>

                    {/* Active Status */}
                    <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '12px', color: '#9ca3af', fontWeight: '500' }}>
                                {t('common.status')}
                            </span>
                            <span style={{
                                padding: '3px 10px',
                                borderRadius: '12px',
                                fontSize: '11px',
                                fontWeight: '600',
                                backgroundColor: charger.is_active ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                color: charger.is_active ? '#22c55e' : '#ef4444'
                            }}>
                                {charger.is_active ? t('common.active') : t('common.inactive')}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Connection Status */}
            <ChargerConnectionStatus
                charger={charger}
                loxoneStatus={loxoneStatus}
                zaptecStatus={zaptecStatus}
                t={t}
            />
        </div>
    );
}