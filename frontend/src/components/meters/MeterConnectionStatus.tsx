import { Wifi, WifiOff, Rss } from 'lucide-react';
import { useTranslation } from '../../i18n';
import type { Meter } from '../../types';

interface MeterConnectionStatusProps {
    meter: Meter;
    loxoneStatus: any;
    mqttStatus: any;
}

export default function MeterConnectionStatus({
    meter,
    loxoneStatus,
    mqttStatus
}: MeterConnectionStatusProps) {
    const { t } = useTranslation();

    if (meter.connection_type === 'loxone_api') {
        const status = loxoneStatus[meter.id];
        if (status) {
            return (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    backgroundColor: status.is_connected ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                    borderRadius: '8px',
                    marginTop: '12px'
                }}>
                    {status.is_connected ? (
                        <>
                            <Wifi size={16} style={{ color: '#22c55e' }} />
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '12px', fontWeight: '600', color: '#22c55e' }}>
                                    {t('meters.loxoneConnected')}
                                </div>
                                <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
                                    {t('meters.lastUpdate')}: {new Date(status.last_update).toLocaleTimeString('de-CH', {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        second: '2-digit',
                                        hour12: false
                                    })}
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            <WifiOff size={16} style={{ color: '#ef4444' }} />
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '12px', fontWeight: '600', color: '#ef4444' }}>
                                    {t('meters.loxoneDisconnected')}
                                </div>
                                {status.last_error && (
                                    <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
                                        {status.last_error}
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
                    {t('meters.loxoneConnecting')}
                </div>
            </div>
        );
    }

    if (meter.connection_type === 'mqtt') {
        const status = mqttStatus[meter.id];
        if (status) {
            return (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    backgroundColor: status.is_connected ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                    borderRadius: '8px',
                    marginTop: '12px'
                }}>
                    {status.is_connected ? (
                        <>
                            <Rss size={16} style={{ color: '#22c55e' }} />
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '12px', fontWeight: '600', color: '#22c55e' }}>
                                    MQTT Connected
                                </div>
                                <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
                                    Topic: {status.topic}
                                </div>
                                <div style={{ fontSize: '11px', color: '#6b7280' }}>
                                    Last update: {new Date(status.last_update).toLocaleTimeString('de-CH', {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        second: '2-digit',
                                        hour12: false
                                    })}
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            <WifiOff size={16} style={{ color: '#ef4444' }} />
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '12px', fontWeight: '600', color: '#ef4444' }}>
                                    MQTT Disconnected
                                </div>
                                {status.last_error && (
                                    <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
                                        {status.last_error}
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
                <Rss size={16} style={{ color: '#9ca3af' }} />
                <div style={{ fontSize: '12px', color: '#6b7280' }}>
                    MQTT Connecting...
                </div>
            </div>
        );
    }

    return null;
}