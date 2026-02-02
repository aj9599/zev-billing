import { X, Battery, TrendingUp, TrendingDown, Gauge, Activity, Calendar, BarChart3, Clock, User, Zap, Wifi, WifiOff } from 'lucide-react';
import type { Charger } from '../../types';
import type { LiveChargerData, LoxoneConnectionStatus, ZaptecConnectionStatus } from './hooks/useChargerStatus';
import { getStateDisplay, getModeDisplay } from './utils/chargerUtils';

interface ChargerDetailModalProps {
    charger: Charger;
    liveData?: LiveChargerData;
    loxoneStatus?: LoxoneConnectionStatus[number];
    zaptecStatus?: ZaptecConnectionStatus[number];
    onClose: () => void;
    t: (key: string) => string;
}

const formatEnergyComparison = (current: number, previous: number): { percentage: number; isIncrease: boolean } => {
    if (previous === 0) return { percentage: 0, isIncrease: true };
    const percentage = ((current - previous) / previous) * 100;
    return { percentage: Math.abs(percentage), isIncrease: percentage >= 0 };
};

export default function ChargerDetailModal({
    charger,
    liveData,
    loxoneStatus,
    zaptecStatus,
    onClose,
    t
}: ChargerDetailModalProps) {
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

    const totalEnergy = charger.connection_type === 'zaptec_api'
        ? (zaptecStatus?.last_reading ?? liveData?.total_energy ?? 0)
        : charger.connection_type === 'loxone_api'
            ? (loxoneStatus?.last_reading ?? liveData?.total_energy ?? 0)
            : (liveData?.total_energy ?? 0);

    const sessionEnergy = charger.connection_type === 'zaptec_api'
        ? (zaptecStatus?.session_energy ?? zaptecStatus?.live_session?.energy ?? liveData?.session_energy ?? 0)
        : (liveData?.session_energy ?? 0);

    const currentPowerKW = charger.connection_type === 'zaptec_api'
        ? (zaptecStatus?.current_power_kw ?? liveData?.current_power_kw ?? 0)
        : (liveData?.current_power_kw ?? 0);

    const liveSession = charger.connection_type === 'zaptec_api'
        ? (zaptecStatus?.live_session ?? liveData?.live_session)
        : liveData?.live_session;

    const modeValue = liveData?.mode ?? '1';
    const modeDisplay = getModeDisplay(charger, modeValue, t);
    const stateDisplay = getStateDisplay(charger, stateValue, t);

    const hasEnhancedStats = charger.connection_type === 'loxone_api' && (
        liveData?.weekly_energy !== undefined ||
        liveData?.monthly_energy !== undefined ||
        liveData?.yearly_energy !== undefined
    );

    const monthComparison = liveData?.monthly_energy !== undefined && liveData?.last_month_energy
        ? formatEnergyComparison(liveData.monthly_energy, liveData.last_month_energy)
        : null;

    const yearComparison = liveData?.yearly_energy && liveData?.last_year_energy
        ? formatEnergyComparison(liveData.yearly_energy, liveData.last_year_energy)
        : null;

    const calculateDuration = (startTimeStr: string): string => {
        if (!startTimeStr || startTimeStr === '0001-01-01T00:00:00' || startTimeStr === '0001-01-01T00:00:00Z') return '';
        try {
            const timestamp = startTimeStr.endsWith('Z') ? startTimeStr : startTimeStr + 'Z';
            const startTime = new Date(timestamp);
            if (isNaN(startTime.getTime())) return '';
            const diffMs = Date.now() - startTime.getTime();
            if (diffMs < 0) return '';
            const hours = Math.floor(diffMs / (1000 * 60 * 60));
            const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
            if (hours > 0) return `${hours}h ${minutes}m`;
            if (minutes > 0) return `${minutes}m`;
            return `${Math.floor(diffMs / 1000)}s`;
        } catch { return ''; }
    };

    const sessionDuration = liveSession?.start_time
        ? calculateDuration(liveSession.start_time)
        : liveSession?.duration || '';

    const connectionLabel = charger.connection_type === 'loxone_api' ? 'Loxone API' :
        charger.connection_type === 'zaptec_api' ? 'Zaptec API' :
            charger.connection_type === 'udp' ? 'UDP' : charger.connection_type;

    const isConnected = charger.connection_type === 'loxone_api'
        ? loxoneStatus?.is_connected
        : charger.connection_type === 'zaptec_api'
            ? zaptecStatus?.is_connected
            : undefined;

    const lastUpdate = charger.connection_type === 'loxone_api'
        ? loxoneStatus?.last_update
        : charger.connection_type === 'zaptec_api'
            ? zaptecStatus?.last_update
            : liveData?.last_update;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
        }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div style={{
                backgroundColor: 'white',
                borderRadius: '24px',
                padding: '28px',
                maxWidth: '520px',
                width: '100%',
                maxHeight: '85vh',
                overflowY: 'auto',
                position: 'relative',
                boxShadow: '0 20px 60px rgba(0,0,0,0.2)'
            }}>
                {/* Close Button */}
                <button onClick={onClose} style={{
                    position: 'absolute', top: '16px', right: '16px',
                    width: '32px', height: '32px', borderRadius: '50%',
                    border: 'none', backgroundColor: '#f3f4f6',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', color: '#6b7280'
                }}>
                    <X size={18} />
                </button>

                {/* Header */}
                <h2 style={{ fontSize: '22px', fontWeight: '700', color: '#1f2937', margin: '0 0 4px 0' }}>
                    {charger.name}
                </h2>
                <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 20px 0' }}>
                    {connectionLabel}
                </p>

                {/* Status Row */}
                <div style={{
                    display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap'
                }}>
                    <span style={{
                        padding: '5px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '600',
                        backgroundColor: isCharging ? '#d1fae5' : stateValue === '5' ? '#dbeafe' : stateValue === '2' ? '#fef3c7' : '#f3f4f6',
                        color: isCharging ? '#059669' : stateValue === '5' ? '#2563eb' : stateValue === '2' ? '#d97706' : '#6b7280'
                    }}>
                        {stateDisplay}
                    </span>
                    <span style={{
                        padding: '5px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '600',
                        backgroundColor: 'rgba(139,92,246,0.1)', color: '#7c3aed'
                    }}>
                        {modeDisplay}
                    </span>
                    <span style={{
                        padding: '5px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '600',
                        backgroundColor: charger.is_active ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                        color: charger.is_active ? '#22c55e' : '#ef4444'
                    }}>
                        {charger.is_active ? t('common.active') : t('common.inactive')}
                    </span>
                </div>

                {/* Energy Overview */}
                <div style={{
                    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px'
                }}>
                    <div style={{
                        padding: '14px', backgroundColor: '#f0f9ff', borderRadius: '14px', border: '1px solid #bae6fd'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                            <Battery size={14} color="#0284c7" />
                            <span style={{ fontSize: '11px', fontWeight: '700', color: '#0369a1', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                {t('chargers.energy.total')}
                            </span>
                        </div>
                        <div style={{ fontSize: '22px', fontWeight: '700', color: '#1f2937' }}>
                            {totalEnergy.toFixed(3)}
                            <span style={{ fontSize: '13px', fontWeight: '600', color: '#6b7280', marginLeft: '4px' }}>kWh</span>
                        </div>
                    </div>
                    <div style={{
                        padding: '14px', backgroundColor: isCharging ? '#f0fdf4' : '#f8fafc',
                        borderRadius: '14px', border: `1px solid ${isCharging ? '#86efac' : '#e2e8f0'}`
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                            <TrendingUp size={14} color={isCharging ? '#16a34a' : '#64748b'} />
                            <span style={{ fontSize: '11px', fontWeight: '700', color: isCharging ? '#15803d' : '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                {isCharging ? t('chargers.energy.currentSession') : t('chargers.energy.lastSession')}
                            </span>
                        </div>
                        <div style={{ fontSize: '22px', fontWeight: '700', color: isCharging ? '#16a34a' : '#1f2937' }}>
                            {sessionEnergy.toFixed(3)}
                            <span style={{ fontSize: '13px', fontWeight: '600', color: '#6b7280', marginLeft: '4px' }}>kWh</span>
                        </div>
                    </div>
                    {currentPowerKW > 0 && (
                        <div style={{
                            padding: '14px', backgroundColor: '#f0fdf4', borderRadius: '14px', border: '1px solid #86efac'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                                <Zap size={14} color="#16a34a" />
                                <span style={{ fontSize: '11px', fontWeight: '700', color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    {t('chargers.energy.currentPower')}
                                </span>
                            </div>
                            <div style={{ fontSize: '22px', fontWeight: '700', color: '#16a34a' }}>
                                {currentPowerKW.toFixed(1)}
                                <span style={{ fontSize: '13px', fontWeight: '600', color: '#6b7280', marginLeft: '4px' }}>kW</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Active Session Info */}
                {liveSession && sessionEnergy > 0 && (
                    <div style={{
                        padding: '14px', backgroundColor: '#faf5ff', borderRadius: '14px',
                        border: '1px solid #e9d5ff', marginBottom: '20px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                            <Activity size={14} color="#7c3aed" />
                            <span style={{ fontSize: '12px', fontWeight: '700', color: '#5b21b6', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                {isCharging ? t('chargers.session.activeSession') : t('chargers.session.lastSession')}
                            </span>
                        </div>
                        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                            {liveSession.user_name && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <User size={12} color="#7c3aed" />
                                    <span style={{ fontSize: '12px', color: '#6b21a8', fontWeight: '500' }}>{liveSession.user_name}</span>
                                </div>
                            )}
                            {sessionDuration && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Clock size={12} color="#7c3aed" />
                                    <span style={{ fontSize: '12px', color: '#6b21a8', fontWeight: '500' }}>{sessionDuration}</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Voltage & Current */}
                {(liveData?.voltage || liveData?.current) && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                        {liveData?.voltage && (
                            <div style={{ padding: '12px', backgroundColor: '#f9fafb', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                                    <Gauge size={12} color="#6b7280" />
                                    <span style={{ fontSize: '11px', color: '#6b7280', fontWeight: '600' }}>{t('chargers.electrical.voltage')}</span>
                                </div>
                                <div style={{ fontSize: '16px', fontWeight: '600', color: '#1f2937' }}>{liveData.voltage.toFixed(0)} V</div>
                            </div>
                        )}
                        {liveData?.current && (
                            <div style={{ padding: '12px', backgroundColor: '#f9fafb', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                                    <Activity size={12} color="#6b7280" />
                                    <span style={{ fontSize: '11px', color: '#6b7280', fontWeight: '600' }}>{t('chargers.electrical.current')}</span>
                                </div>
                                <div style={{ fontSize: '16px', fontWeight: '600', color: '#1f2937' }}>{liveData.current.toFixed(3)} A</div>
                            </div>
                        )}
                    </div>
                )}

                {/* Energy Statistics */}
                {hasEnhancedStats && (
                    <div style={{
                        padding: '16px', background: 'linear-gradient(135deg, rgba(139,92,246,0.05) 0%, rgba(59,130,246,0.05) 100%)',
                        borderRadius: '16px', border: '1px solid rgba(139,92,246,0.15)', marginBottom: '20px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                            <BarChart3 size={16} color="#8b5cf6" />
                            <span style={{ fontSize: '13px', fontWeight: '700', color: '#6d28d9', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                {t('chargers.stats.energyStatistics')}
                            </span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                            {liveData?.weekly_energy !== undefined && (
                                <div style={{ padding: '10px', backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: '10px', border: '1px solid rgba(229,231,235,0.6)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                                        <Calendar size={12} color="#3b82f6" />
                                        <span style={{ fontSize: '10px', fontWeight: '700', color: '#1e40af', textTransform: 'uppercase' }}>
                                            {t('chargers.stats.thisWeek')}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '17px', fontWeight: '700', color: '#1f2937' }}>
                                        {liveData.weekly_energy.toFixed(1)} <span style={{ fontSize: '11px', color: '#6b7280' }}>kWh</span>
                                    </div>
                                </div>
                            )}
                            {liveData?.monthly_energy !== undefined && (
                                <div style={{ padding: '10px', backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: '10px', border: '1px solid rgba(229,231,235,0.6)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                                        <Calendar size={12} color="#10b981" />
                                        <span style={{ fontSize: '10px', fontWeight: '700', color: '#047857', textTransform: 'uppercase' }}>
                                            {t('chargers.stats.thisMonth')}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '17px', fontWeight: '700', color: '#1f2937' }}>
                                        {liveData.monthly_energy.toFixed(1)} <span style={{ fontSize: '11px', color: '#6b7280' }}>kWh</span>
                                    </div>
                                    {monthComparison && monthComparison.percentage > 0 && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px', color: monthComparison.isIncrease ? '#059669' : '#dc2626', fontWeight: '600', marginTop: '2px' }}>
                                            {monthComparison.isIncrease ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                                            {monthComparison.percentage.toFixed(0)}%
                                        </div>
                                    )}
                                </div>
                            )}
                            {liveData?.yearly_energy !== undefined && (
                                <div style={{ padding: '10px', backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: '10px', border: '1px solid rgba(229,231,235,0.6)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                                        <Calendar size={12} color="#f59e0b" />
                                        <span style={{ fontSize: '10px', fontWeight: '700', color: '#d97706', textTransform: 'uppercase' }}>
                                            {t('chargers.stats.thisYear')}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '17px', fontWeight: '700', color: '#1f2937' }}>
                                        {liveData.yearly_energy.toFixed(1)} <span style={{ fontSize: '11px', color: '#6b7280' }}>kWh</span>
                                    </div>
                                    {yearComparison && yearComparison.percentage > 0 && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px', color: yearComparison.isIncrease ? '#059669' : '#dc2626', fontWeight: '600', marginTop: '2px' }}>
                                            {yearComparison.isIncrease ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                                            {yearComparison.percentage.toFixed(0)}%
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Connection Details */}
                <div style={{
                    padding: '14px', backgroundColor: '#f9fafb', borderRadius: '14px', border: '1px solid #e5e7eb'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                        <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: '500' }}>{t('chargers.connection')}</span>
                        <span style={{ fontSize: '12px', fontWeight: '600', color: '#667eea', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            {connectionLabel}
                        </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                        <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: '500' }}>{t('chargers.chargingMode')}</span>
                        <span style={{ padding: '3px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', backgroundColor: 'rgba(156,163,175,0.1)', color: '#6b7280' }}>
                            {modeDisplay}
                        </span>
                    </div>
                    {isConnected !== undefined && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '8px 12px', borderRadius: '8px', marginTop: '8px',
                            backgroundColor: isConnected ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)'
                        }}>
                            {isConnected ? <Wifi size={14} color="#22c55e" /> : <WifiOff size={14} color="#ef4444" />}
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '12px', fontWeight: '600', color: isConnected ? '#22c55e' : '#ef4444' }}>
                                    {isConnected
                                        ? (charger.connection_type === 'loxone_api' ? t('chargers.loxoneConnected') : t('chargers.zaptecConnected'))
                                        : (charger.connection_type === 'loxone_api' ? t('chargers.loxoneDisconnected') : t('chargers.zaptecDisconnected'))}
                                </div>
                                {lastUpdate && (
                                    <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '1px' }}>
                                        {t('chargers.lastUpdate')}: {new Date(lastUpdate).toLocaleTimeString(undefined, { hour12: false })}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
