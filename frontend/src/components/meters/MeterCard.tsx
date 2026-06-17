import { Edit2, Trash2, RefreshCw, Building, Archive, TrendingUp, TrendingDown, Sun, Calculator, ShieldCheck, ShieldAlert } from 'lucide-react';
import { useTranslation } from '../../i18n';
import type { Meter, User } from '../../types';
import { getMeterTypeLabel } from './utils/meterUtils';
import MeterConnectionStatus from './MeterConnectionStatus';

interface MeterCardProps {
    meter: Meter;
    users: User[];
    loxoneStatus: any;
    mqttStatus: any;
    mqttBrokerConnected?: boolean;
    smartmeStatus: any;
    udpStatus: any;
    modbusStatus: any;
    e3dcStatus?: any;
    onEdit: (meter: Meter) => void;
    onReplace: (meter: Meter) => void;
    onDelete: (meter: Meter) => void;
    onTariffBreakdown: (meter: Meter) => void;
}

export default function MeterCard({
    meter,
    users,
    loxoneStatus,
    mqttStatus,
    mqttBrokerConnected,
    smartmeStatus,
    udpStatus,
    modbusStatus,
    e3dcStatus,
    onEdit,
    onReplace,
    onDelete,
    onTariffBreakdown
}: MeterCardProps) {
    const { t } = useTranslation();

    // Meters are colour-coded by billing role:
    //   • virtual (computed)      → pink/red  (never a physical billing meter)
    //   • physical, MID-certified → green     (valid for billing)
    //   • physical, not certified → yellow    (monitoring only, e.g. a solar inverter)
    const isVirtual = meter.connection_type === 'virtual';
    const isNonMid = !isVirtual && meter.is_mid_certified === false;
    const isMid = !isVirtual && !isNonMid;

    // Data freshness — independent of the "Active" config flag and the billing
    // colour. A meter can be Active yet not actually reading (e.g. a Modbus
    // read timing out), so we surface whether real data is arriving. A
    // never-set timestamp parses to year 1 (renders as a nonsense local time),
    // so anything before 2000 counts as "never reported".
    const lastTs = meter.last_reading_time;
    const hasReading = !!lastTs && new Date(lastTs).getFullYear() > 2000;
    const ageMinutes = hasReading ? (Date.now() - new Date(lastTs as string).getTime()) / 60000 : Infinity;
    // Meters poll every 15 min; flag as stale after ~2.5 missed cycles.
    const isStale = ageMinutes > 40;
    const timeAgo = (iso: string) => {
        const sec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
        if (sec < 60) return `${sec}s`;
        const min = Math.floor(sec / 60);
        if (min < 60) return `${min}m`;
        const hr = Math.floor(min / 60);
        if (hr < 24) return `${hr}h`;
        return `${Math.floor(hr / 24)}d`;
    };

    // Find linked user
    const linkedUser = meter.apartment_unit
        ? users.find(u =>
            u.building_id === meter.building_id &&
            u.apartment_unit === meter.apartment_unit &&
            u.is_active
        )
        : meter.user_id
            ? users.find(u => u.id === meter.user_id)
            : null;

    return (
        <div
            style={{
                background: isVirtual
                    ? 'linear-gradient(135deg, #fdf2f8 0%, #ffffff 55%)'
                    : isNonMid
                        ? 'linear-gradient(135deg, #fffbeb 0%, #ffffff 55%)'
                        : 'white',
                borderRadius: '16px',
                padding: '24px',
                boxShadow: '0 4px 6px rgba(0,0,0,0.07)',
                border: isVirtual
                    ? '1px dashed #f472b6'
                    : isNonMid
                        ? '1px solid #fcd34d'
                        : '1px solid #f0f0f0',
                // Green accent strip down the left edge marks billing-valid meters.
                borderLeft: isMid ? '4px solid #22c55e' : undefined,
                position: 'relative',
                transition: 'all 0.2s ease',
                opacity: meter.is_archived ? 0.7 : 1,
                // Fill the grid cell so every card in the grid is the same height.
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                boxSizing: 'border-box'
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
                    onClick={() => onEdit(meter)}
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

                {meter.meter_type === 'apartment_meter' && (
                    <button
                        onClick={() => onTariffBreakdown(meter)}
                        style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            border: 'none',
                            backgroundColor: 'rgba(16, 185, 129, 0.1)',
                            color: '#10b981',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'rgba(16, 185, 129, 0.2)';
                            e.currentTarget.style.transform = 'scale(1.1)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'rgba(16, 185, 129, 0.1)';
                            e.currentTarget.style.transform = 'scale(1)';
                        }}
                        title={t('tariff.title') || 'Tariff Breakdown'}
                    >
                        <Sun size={16} />
                    </button>
                )}

                {!meter.is_archived && (
                    <button
                        onClick={() => onReplace(meter)}
                        style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            border: 'none',
                            backgroundColor: 'rgba(102, 126, 234, 0.1)',
                            color: '#667eea',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'rgba(102, 126, 234, 0.2)';
                            e.currentTarget.style.transform = 'scale(1.1)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'rgba(102, 126, 234, 0.1)';
                            e.currentTarget.style.transform = 'scale(1)';
                        }}
                        title={t('meters.replaceMeter')}
                    >
                        <RefreshCw size={16} />
                    </button>
                )}

                <button
                    onClick={() => onDelete(meter)}
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

            {/* Meter Info */}
            <div style={{ paddingRight: '100px' }}>
                <h3 style={{
                    fontSize: '20px',
                    fontWeight: '600',
                    marginBottom: '6px',
                    color: '#1f2937',
                    lineHeight: '1.3'
                }}>
                    {meter.name}
                </h3>
                <p style={{
                    fontSize: '14px',
                    color: '#6b7280',
                    margin: 0
                }}>
                    {getMeterTypeLabel(meter.meter_type, t)}
                </p>

                {/* Virtual (computed) Badge */}
                {isVirtual && (
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 12px',
                        backgroundColor: '#fce7f3',
                        border: '1px solid #f472b6',
                        borderRadius: '12px',
                        marginTop: '8px'
                    }}>
                        <Calculator size={14} color="#db2777" />
                        <span style={{ fontSize: '12px', fontWeight: '600', color: '#db2777' }}>
                            {t('meters.virtualBadge')}
                        </span>
                    </div>
                )}

                {/* MID-certified Badge (green) — billing-valid physical meter */}
                {isMid && (
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 12px',
                        backgroundColor: '#dcfce7',
                        border: '1px solid #86efac',
                        borderRadius: '12px',
                        marginTop: '8px'
                    }}>
                        <ShieldCheck size={14} color="#16a34a" />
                        <span style={{ fontSize: '12px', fontWeight: '600', color: '#16a34a' }}>
                            {t('meters.midBadge')}
                        </span>
                    </div>
                )}

                {/* Not MID-certified Badge (yellow) — monitoring only, not for billing */}
                {isNonMid && (
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 12px',
                        backgroundColor: '#fef3c7',
                        border: '1px solid #fcd34d',
                        borderRadius: '12px',
                        marginTop: '8px'
                    }}>
                        <ShieldAlert size={14} color="#d97706" />
                        <span style={{ fontSize: '12px', fontWeight: '600', color: '#d97706' }}>
                            {t('meters.nonMidBadge')}
                        </span>
                    </div>
                )}

                {/* Archived Badge */}
                {meter.is_archived && (
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 12px',
                        backgroundColor: '#fef3c7',
                        border: '1px solid #f59e0b',
                        borderRadius: '12px',
                        marginTop: '8px'
                    }}>
                        <Archive size={14} color="#f59e0b" />
                        <span style={{ fontSize: '12px', fontWeight: '600', color: '#f59e0b' }}>
                            {t('meters.archived')}
                            {meter.replaced_by_meter_id && (
                                <> - {t('meters.replacedBy')} #{meter.replaced_by_meter_id}</>
                            )}
                        </span>
                    </div>
                )}

                {meter.apartment_unit && (
                    <p style={{
                        fontSize: '13px',
                        color: '#667eea',
                        margin: '4px 0 0 0',
                        fontWeight: '500',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}>
                        <Building size={14} />
                        {meter.apartment_unit}
                    </p>
                )}

                {linkedUser && (
                    <p style={{
                        fontSize: '12px',
                        color: '#10b981',
                        margin: '4px 0 0 0',
                        fontWeight: '500',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}>
                        <div style={{
                            width: '14px',
                            height: '14px',
                            borderRadius: '50%',
                            backgroundColor: '#10b981',
                            color: 'white',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '8px',
                            fontWeight: '600'
                        }}>
                            {linkedUser.first_name.charAt(0)}
                        </div>
                        {linkedUser.first_name} {linkedUser.last_name}
                    </p>
                )}
            </div>

            {/* Meter Details (pinned to the bottom so equal-height cards align) */}
            <div style={{ marginTop: 'auto', paddingTop: '20px', borderTop: '1px solid #f3f4f6' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ fontSize: '13px', color: '#9ca3af', fontWeight: '500' }}>
                        {t('meters.connection')}
                    </span>
                    <span style={{
                        fontSize: '13px',
                        fontWeight: '600',
                        color: '#667eea',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                    }}>
                        {meter.connection_type === 'loxone_api' ? t('meters.loxoneWebSocket') :
                            meter.connection_type === 'mqtt' ? 'MQTT' :
                                meter.connection_type === 'virtual' ? t('meters.virtualBadge') :
                                    meter.connection_type}
                    </span>
                </div>
                
                {/* Energy Readings */}
                {meter.meter_type === 'total_meter' ? (
                    /* Grid meters move energy both ways — show import + export. */
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '12px',
                        marginBottom: '12px'
                    }}>
                        {/* Import Energy */}
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
                                <TrendingUp size={14} style={{ color: '#0284c7' }} />
                                <span style={{ fontSize: '11px', color: '#0369a1', fontWeight: '600' }}>
                                    {t('meters.import')}
                                </span>
                            </div>
                            <div style={{ fontSize: '15px', fontWeight: '600', color: '#1f2937' }}>
                                {meter.last_reading ? `${meter.last_reading.toFixed(3)} kWh` : '-'}
                            </div>
                        </div>

                        {/* Export Energy */}
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
                                <TrendingDown size={14} style={{ color: '#16a34a' }} />
                                <span style={{ fontSize: '11px', color: '#15803d', fontWeight: '600' }}>
                                    {t('meters.export')}
                                </span>
                            </div>
                            <div style={{ fontSize: '15px', fontWeight: '600', color: '#1f2937' }}>
                                {meter.last_reading_export ? `${meter.last_reading_export.toFixed(3)} kWh` : '0.000 kWh'}
                            </div>
                        </div>
                    </div>
                ) : meter.meter_type === 'solar_meter' ? (
                    /* Solar meters/inverters only produce energy — show production
                       (stored in the export column); a solar source has no import. */
                    <div style={{
                        padding: '10px',
                        backgroundColor: '#f0fdf4',
                        borderRadius: '8px',
                        border: '1px solid #dcfce7',
                        marginBottom: '12px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                            <Sun size={14} style={{ color: '#16a34a' }} />
                            <span style={{ fontSize: '11px', color: '#15803d', fontWeight: '600' }}>
                                {t('meters.production')}
                            </span>
                        </div>
                        <div style={{ fontSize: '15px', fontWeight: '600', color: '#1f2937' }}>
                            {meter.last_reading_export ? `${meter.last_reading_export.toFixed(3)} kWh` : '0.000 kWh'}
                        </div>
                    </div>
                ) : (
                    /* Single reading display for other meter types */
                    <div style={{ marginBottom: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '13px', color: '#9ca3af', fontWeight: '500' }}>
                                {t('meters.lastReading')}
                            </span>
                            <span style={{ fontSize: '15px', fontWeight: '600', color: '#1f2937' }}>
                                {meter.last_reading ? `${meter.last_reading.toFixed(3)} kWh` : '-'}
                            </span>
                        </div>
                    </div>
                )}
                
                {/* Data freshness — shows whether readings are actually arriving,
                    regardless of the Active flag. Hidden for inactive meters
                    (intentionally not collected). */}
                {meter.is_active && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <span style={{ fontSize: '13px', color: '#9ca3af', fontWeight: '500' }}>
                            {t('meters.lastUpdate')}
                        </span>
                        {(() => {
                            const color = !hasReading ? '#ef4444' : isStale ? '#d97706' : '#22c55e';
                            const bg = !hasReading ? 'rgba(239,68,68,0.1)' : isStale ? 'rgba(217,119,6,0.12)' : 'rgba(34,197,94,0.1)';
                            const text = !hasReading
                                ? t('meters.noDataYet')
                                : `${timeAgo(lastTs as string)} ${t('dashboard.ago')}`;
                            return (
                                <span style={{
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    padding: '4px 12px', borderRadius: '20px',
                                    fontSize: '12px', fontWeight: 600, color, backgroundColor: bg
                                }}>
                                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: color, display: 'inline-block' }} />
                                    {text}
                                </span>
                            );
                        })()}
                    </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', color: '#9ca3af', fontWeight: '500' }}>
                        {t('common.status')}
                    </span>
                    <span style={{
                        padding: '4px 12px',
                        borderRadius: '20px',
                        fontSize: '12px',
                        fontWeight: '600',
                        backgroundColor: meter.is_active ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                        color: meter.is_active ? '#22c55e' : '#ef4444'
                    }}>
                        {meter.is_active ? t('common.active') : t('common.inactive')}
                    </span>
                </div>
            </div>

            {/* Connection Status */}
            <MeterConnectionStatus
                meter={meter}
                loxoneStatus={loxoneStatus}
                mqttStatus={mqttStatus}
                mqttBrokerConnected={mqttBrokerConnected}
                smartmeStatus={smartmeStatus}
                udpStatus={udpStatus}
                modbusStatus={modbusStatus}
                e3dcStatus={e3dcStatus}
            />
        </div>
    );
}