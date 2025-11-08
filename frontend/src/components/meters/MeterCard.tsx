import { Edit2, Trash2, RefreshCw, Building, Archive } from 'lucide-react';
import { useTranslation } from '../../i18n';
import type { Meter, User } from '../../types';
import { getMeterTypeLabel } from '../utils/meterUtils';
import MeterConnectionStatus from './MeterConnectionStatus';

interface MeterCardProps {
    meter: Meter;
    users: User[];
    loxoneStatus: any;
    mqttStatus: any;
    onEdit: (meter: Meter) => void;
    onReplace: (meter: Meter) => void;
    onDelete: (meter: Meter) => void;
}

export default function MeterCard({
    meter,
    users,
    loxoneStatus,
    mqttStatus,
    onEdit,
    onReplace,
    onDelete
}: MeterCardProps) {
    const { t } = useTranslation();

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
                backgroundColor: 'white',
                borderRadius: '16px',
                padding: '24px',
                boxShadow: '0 4px 6px rgba(0,0,0,0.07)',
                border: '1px solid #f0f0f0',
                position: 'relative',
                transition: 'all 0.2s ease',
                opacity: meter.is_archived ? 0.7 : 1
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
                        title={t('meters.replaceMeter') || 'Replace Meter'}
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
                            {t('meters.archived') || 'ARCHIVED'}
                            {meter.replaced_by_meter_id && (
                                <> - {t('meters.replacedBy') || 'Replaced by'} #{meter.replaced_by_meter_id}</>
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

            {/* Meter Details */}
            <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #f3f4f6' }}>
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
                        {meter.connection_type === 'loxone_api' ? 'Loxone WebSocket' :
                            meter.connection_type === 'mqtt' ? 'MQTT' :
                                meter.connection_type}
                    </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ fontSize: '13px', color: '#9ca3af', fontWeight: '500' }}>
                        {t('meters.lastReading')}
                    </span>
                    <span style={{ fontSize: '15px', fontWeight: '600', color: '#1f2937' }}>
                        {meter.last_reading ? `${meter.last_reading.toFixed(3)} kWh` : '-'}
                    </span>
                </div>
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
            />
        </div>
    );
}