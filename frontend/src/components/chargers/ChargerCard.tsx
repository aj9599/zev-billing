import { useState } from 'react';
import { Edit2, Trash2, Wifi, WifiOff, Battery, TrendingUp, Info } from 'lucide-react';
import type { Charger } from '../../types';
import type { LiveChargerData, LoxoneConnectionStatus, ZaptecConnectionStatus } from './hooks/useChargerStatus';
import { getPreset } from '../chargerPresets';
import { getStateDisplay } from './utils/chargerUtils';
import ChargerDetailModal from './ChargerDetailModal';

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
    const [showDetail, setShowDetail] = useState(false);
    const chargerPreset = getPreset(charger.preset);

    // Determine state
    const stateValue = charger.connection_type === 'zaptec_api'
        ? (zaptecStatus?.state_description ?
            (zaptecStatus.state_description === 'Unknown' ? '0' :
                zaptecStatus.state_description === 'Disconnected' ? '1' :
                    zaptecStatus.state_description === 'Waiting for Authorization' ? '2' :
                        zaptecStatus.state_description === 'Charging' ? '3' :
                            zaptecStatus.state_description === 'Finished Charging' ? '5' : '0')
            : liveData?.state ?? '0')
        : liveData?.state ?? '0';

    const stateDescription = charger.connection_type === 'loxone_api' ? liveData?.state_description : undefined;

    const isCharging = charger.connection_type === 'zaptec_api'
        ? stateValue === '3'
        : charger.connection_type === 'loxone_api'
            ? (stateDescription === 'Charging' || stateValue === '3')
            : stateValue === '67';

    const isCompleted = charger.connection_type === 'zaptec_api'
        ? stateValue === '5'
        : charger.connection_type === 'loxone_api'
            ? (stateValue === '5' || stateDescription === 'Complete')
            : false;

    const isAwaitingStart = charger.connection_type === 'zaptec_api'
        ? stateValue === '2'
        : charger.connection_type === 'loxone_api'
            ? false
            : stateValue === '66';

    const isDisconnected = charger.connection_type === 'zaptec_api'
        ? stateValue === '1'
        : charger.connection_type === 'loxone_api'
            ? (stateDescription === 'Disconnected' || stateValue === '1')
            : stateValue === '50';

    const totalEnergy = charger.connection_type === 'zaptec_api'
        ? (zaptecStatus?.last_reading ?? liveData?.total_energy ?? 0)
        : charger.connection_type === 'loxone_api'
            ? (loxoneStatus?.last_reading ?? liveData?.total_energy ?? 0)
            : (liveData?.total_energy ?? 0);

    const sessionEnergy = charger.connection_type === 'zaptec_api'
        ? (isAwaitingStart ? 0 : (zaptecStatus?.session_energy ?? zaptecStatus?.live_session?.energy ?? liveData?.session_energy ?? 0))
        : (liveData?.session_energy ?? 0);

    const currentPowerKW = charger.connection_type === 'zaptec_api'
        ? (zaptecStatus?.current_power_kw ?? liveData?.current_power_kw ?? 0)
        : (liveData?.current_power_kw ?? 0);

    const isOnline = charger.connection_type === 'zaptec_api'
        ? (zaptecStatus?.is_online ?? liveData?.is_online ?? true)
        : (liveData?.is_online ?? true);

    const stateDisplay = getStateDisplay(charger, stateValue, t);

    // Power gauge
    const powerPercentage = currentPowerKW ? Math.min((currentPowerKW / 22) * 100, 100) : 0;
    const circleSize = 88;
    const strokeWidth = 8;
    const radius = (circleSize - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (powerPercentage / 100) * circumference;

    // Colors by state
    const accentColor = isCharging ? '#22c55e' : isCompleted ? '#3b82f6' : isAwaitingStart ? '#fbbf24' : '#9ca3af';
    const accentBg = isCharging ? '#d1fae5' : isCompleted ? '#dbeafe' : isAwaitingStart ? '#fef3c7' : '#f3f4f6';
    const accentText = isCharging ? '#059669' : isCompleted ? '#2563eb' : isAwaitingStart ? '#d97706' : '#6b7280';

    // Status text
    const statusText = isCharging ? t('chargers.status.chargingInProgress')
        : isCompleted ? t('chargers.status.chargingFinished')
            : isAwaitingStart ? t('chargers.status.waitingForAuth')
                : isDisconnected ? t('chargers.status.noCarConnected')
                    : t('chargers.status.ready');

    // Last session energy for display
    const lastSessionEnergy = liveData?.last_session_energy;
    const displaySessionEnergy = sessionEnergy > 0 ? sessionEnergy : (lastSessionEnergy ?? 0);

    return (
        <>
            <div
                className="charger-card"
                style={{
                    backgroundColor: 'white',
                    borderRadius: '20px',
                    padding: '20px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                    border: isCharging ? `2px solid ${accentColor}` : '1px solid #e5e7eb',
                    position: 'relative',
                    transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.1)';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)';
                    e.currentTarget.style.transform = 'translateY(0)';
                }}
            >
                {isCharging && (
                    <style dangerouslySetInnerHTML={{ __html: `
                        @keyframes chargingPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
                        @keyframes ringPulse { 0% { transform: scale(0.9); opacity: 0.3; } 70% { transform: scale(1.2); opacity: 0; } 100% { opacity: 0; } }
                    `}} />
                )}

                {/* Top Row: Name + Badge + Actions */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div style={{ flex: 1, minWidth: 0, paddingRight: '8px' }}>
                        <h3 style={{
                            fontSize: '17px', fontWeight: '600', color: '#1f2937',
                            margin: '0 0 2px 0', lineHeight: '1.3',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                        }}>
                            {charger.name}
                        </h3>
                        <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>
                            {chargerPreset.label}
                        </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                        <span style={{
                            padding: '4px 10px', borderRadius: '8px',
                            fontSize: '11px', fontWeight: '700',
                            backgroundColor: accentBg, color: accentText,
                            textTransform: 'uppercase', letterSpacing: '0.3px',
                            border: `1.5px solid ${accentColor}`,
                            animation: isCharging ? 'chargingPulse 2s ease-in-out infinite' : 'none'
                        }}>
                            {stateDisplay}
                        </span>
                        <button onClick={onEdit} title={t('common.edit')} style={{
                            width: '28px', height: '28px', borderRadius: '8px', border: 'none',
                            backgroundColor: 'rgba(59,130,246,0.08)', color: '#3b82f6',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0
                        }}
                            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(59,130,246,0.15)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(59,130,246,0.08)'; }}
                        >
                            <Edit2 size={13} />
                        </button>
                        <button onClick={onDelete} title={t('common.delete')} style={{
                            width: '28px', height: '28px', borderRadius: '8px', border: 'none',
                            backgroundColor: 'rgba(239,68,68,0.08)', color: '#ef4444',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0
                        }}
                            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.15)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.08)'; }}
                        >
                            <Trash2 size={13} />
                        </button>
                    </div>
                </div>

                {/* Status text */}
                <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 14px 0' }}>
                    {statusText}
                </p>

                {/* Main content: Gauge + Energy */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '16px',
                    padding: '16px', backgroundColor: '#f9fafb',
                    borderRadius: '14px', border: '1px solid #f0f0f0'
                }}>
                    {/* Compact Power Gauge */}
                    <div style={{
                        position: 'relative', width: circleSize, height: circleSize,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                    }}>
                        {isCharging && (
                            <div style={{
                                position: 'absolute', inset: -6, borderRadius: '999px',
                                border: `1px solid ${accentColor}`,
                                animation: 'ringPulse 1.6s ease-out infinite'
                            }} />
                        )}
                        <svg width={circleSize} height={circleSize} style={{ transform: 'rotate(-90deg)' }}>
                            <circle cx={circleSize/2} cy={circleSize/2} r={radius}
                                stroke="rgba(209,213,219,0.4)" strokeWidth={strokeWidth} fill="transparent" />
                            <circle cx={circleSize/2} cy={circleSize/2} r={radius}
                                stroke={accentColor} strokeWidth={strokeWidth} fill="transparent"
                                strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
                                strokeLinecap="round"
                                style={{
                                    transition: 'stroke-dashoffset 0.5s ease, stroke 0.3s ease',
                                    filter: isCharging ? `drop-shadow(0 0 8px ${accentColor})` : 'none'
                                }} />
                        </svg>
                        <div style={{
                            position: 'absolute', display: 'flex', flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center'
                        }}>
                            <span style={{ fontSize: '22px', fontWeight: '700', color: accentText }}>
                                {currentPowerKW.toFixed(1)}
                            </span>
                            <span style={{ fontSize: '11px', color: accentText, fontWeight: '600' }}>kW</span>
                        </div>
                    </div>

                    {/* Energy Info */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px', minWidth: 0 }}>
                        {totalEnergy > 0 && (
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '2px' }}>
                                    <Battery size={13} color="#0284c7" />
                                    <span style={{ fontSize: '11px', color: '#0369a1', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                                        {t('chargers.energy.total')}
                                    </span>
                                </div>
                                <span style={{ fontSize: '19px', fontWeight: '700', color: '#1f2937' }}>
                                    {totalEnergy.toFixed(3)} <span style={{ fontSize: '13px', fontWeight: '600', color: '#9ca3af' }}>kWh</span>
                                </span>
                            </div>
                        )}

                        {displaySessionEnergy > 0 && (
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '2px' }}>
                                    <TrendingUp size={13} color={isCharging ? '#16a34a' : '#64748b'} />
                                    <span style={{ fontSize: '11px', color: isCharging ? '#15803d' : '#64748b', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                                        {isCharging ? t('chargers.energy.currentSession') : t('chargers.energy.lastSession')}
                                    </span>
                                </div>
                                <span style={{ fontSize: '16px', fontWeight: '700', color: isCharging ? '#16a34a' : '#374151' }}>
                                    {displaySessionEnergy.toFixed(3)} <span style={{ fontSize: '12px', fontWeight: '600', color: '#9ca3af' }}>kWh</span>
                                </span>
                            </div>
                        )}

                        {isAwaitingStart && sessionEnergy === 0 && (
                            <div style={{
                                padding: '6px 10px', backgroundColor: 'rgba(251,191,36,0.1)',
                                borderRadius: '8px', border: '1px solid rgba(251,191,36,0.25)',
                                fontSize: '11px', fontWeight: '600', color: '#d97706'
                            }}>
                                {t('chargers.status.scanRFID')}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer: Connection + Details button */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #f3f4f6'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {isOnline ? <Wifi size={14} color="#22c55e" /> : <WifiOff size={14} color="#ef4444" />}
                        <span style={{ fontSize: '12px', fontWeight: '500', color: isOnline ? '#22c55e' : '#ef4444' }}>
                            {isOnline ? t('chargers.status.online') : t('chargers.status.offline')}
                        </span>
                        <span style={{ fontSize: '11px', color: '#d1d5db' }}>|</span>
                        <span style={{ fontSize: '11px', color: '#9ca3af' }}>
                            {charger.connection_type === 'loxone_api' ? 'Loxone' :
                                charger.connection_type === 'zaptec_api' ? 'Zaptec' :
                                    charger.connection_type === 'udp' ? 'UDP' : charger.connection_type}
                        </span>
                    </div>

                    <button
                        onClick={() => setShowDetail(true)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '5px',
                            padding: '5px 12px', borderRadius: '8px',
                            border: '1px solid #e5e7eb', backgroundColor: 'white',
                            fontSize: '12px', fontWeight: '500', color: '#6b7280',
                            cursor: 'pointer', transition: 'all 0.15s'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#f9fafb';
                            e.currentTarget.style.borderColor = '#d1d5db';
                            e.currentTarget.style.color = '#374151';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'white';
                            e.currentTarget.style.borderColor = '#e5e7eb';
                            e.currentTarget.style.color = '#6b7280';
                        }}
                    >
                        <Info size={13} />
                        {t('chargers.details') || 'Details'}
                    </button>
                </div>
            </div>

            {showDetail && (
                <ChargerDetailModal
                    charger={charger}
                    liveData={liveData}
                    loxoneStatus={loxoneStatus}
                    zaptecStatus={zaptecStatus}
                    onClose={() => setShowDetail(false)}
                    t={t}
                />
            )}
        </>
    );
}
