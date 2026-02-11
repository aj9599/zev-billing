import { Wifi, WifiOff, Rss, AlertCircle, Cloud, Radio, Cable } from 'lucide-react';
import { useTranslation } from '../../i18n';
import type { Meter } from '../../types';

interface MeterConnectionStatusProps {
    meter: Meter;
    loxoneStatus: any;
    mqttStatus: any;
    mqttBrokerConnected?: boolean;
    smartmeStatus: any;
    udpStatus: any;
    modbusStatus: any;
}

const formatTime = (dateStr: string) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleTimeString('de-CH', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
};

function ConnectionBadge({ icon: Icon, color, bgColor, label, detail, detail2 }: {
    icon: any;
    color: string;
    bgColor: string;
    label: string;
    detail?: string;
    detail2?: string;
}) {
    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            backgroundColor: bgColor,
            borderRadius: '8px',
            marginTop: '12px'
        }}>
            <Icon size={16} style={{ color }} />
            <div style={{ flex: 1 }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color }}>
                    {label}
                </div>
                {detail && (
                    <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
                        {detail}
                    </div>
                )}
                {detail2 && (
                    <div style={{ fontSize: '11px', color: '#6b7280' }}>
                        {detail2}
                    </div>
                )}
            </div>
        </div>
    );
}

export default function MeterConnectionStatus({
    meter,
    loxoneStatus,
    mqttStatus,
    mqttBrokerConnected,
    smartmeStatus,
    udpStatus,
    modbusStatus
}: MeterConnectionStatusProps) {
    const { t } = useTranslation();

    if (meter.connection_type === 'loxone_api') {
        const status = loxoneStatus[meter.id];
        if (status) {
            if (status.is_connected) {
                return <ConnectionBadge
                    icon={Wifi} color="#22c55e" bgColor="rgba(34, 197, 94, 0.1)"
                    label={t('meters.loxoneConnected')}
                    detail={`${t('meters.lastUpdate')}: ${formatTime(status.last_update)}`}
                />;
            }
            return <ConnectionBadge
                icon={WifiOff} color="#ef4444" bgColor="rgba(239, 68, 68, 0.1)"
                label={t('meters.loxoneDisconnected')}
                detail={status.last_error}
            />;
        }
        return <ConnectionBadge
            icon={Wifi} color="#9ca3af" bgColor="rgba(156, 163, 175, 0.1)"
            label={t('meters.loxoneConnecting')}
        />;
    }

    if (meter.connection_type === 'mqtt') {
        if (mqttBrokerConnected === false) {
            return <ConnectionBadge
                icon={WifiOff} color="#ef4444" bgColor="rgba(239, 68, 68, 0.1)"
                label="MQTT Broker Disconnected"
                detail="Cannot reach MQTT broker"
            />;
        }
        const status = mqttStatus[meter.id];
        if (status) {
            if (status.is_connected) {
                return <ConnectionBadge
                    icon={Rss} color="#22c55e" bgColor="rgba(34, 197, 94, 0.1)"
                    label="MQTT Connected"
                    detail={`Topic: ${status.topic}`}
                    detail2={`${t('meters.lastUpdate')}: ${formatTime(status.last_update)}`}
                />;
            }
            return <ConnectionBadge
                icon={AlertCircle} color="#f59e0b" bgColor="rgba(251, 191, 36, 0.1)"
                label="MQTT Waiting for Data"
                detail={`Topic: ${status.topic}`}
                detail2={status.last_error}
            />;
        }
        return <ConnectionBadge
            icon={Rss} color="#f59e0b" bgColor="rgba(251, 191, 36, 0.1)"
            label="MQTT Connecting..."
        />;
    }

    if (meter.connection_type === 'smartme') {
        const status = smartmeStatus[meter.id];
        if (status) {
            if (status.is_connected) {
                return <ConnectionBadge
                    icon={Cloud} color="#22c55e" bgColor="rgba(34, 197, 94, 0.1)"
                    label={t('meters.smartmeConnected')}
                    detail={`${t('meters.lastUpdate')}: ${formatTime(status.last_update)}`}
                />;
            }
            return <ConnectionBadge
                icon={Cloud} color="#ef4444" bgColor="rgba(239, 68, 68, 0.1)"
                label={t('meters.smartmeDisconnected')}
                detail={status.last_error}
            />;
        }
        return <ConnectionBadge
            icon={Cloud} color="#9ca3af" bgColor="rgba(156, 163, 175, 0.1)"
            label={t('meters.smartmeWaiting')}
        />;
    }

    if (meter.connection_type === 'udp') {
        const status = udpStatus[meter.id];
        if (status) {
            if (status.is_connected) {
                return <ConnectionBadge
                    icon={Radio} color="#22c55e" bgColor="rgba(34, 197, 94, 0.1)"
                    label={t('meters.udpConnected')}
                    detail={`${t('meters.lastUpdate')}: ${formatTime(status.last_update)}`}
                />;
            }
            return <ConnectionBadge
                icon={Radio} color="#f59e0b" bgColor="rgba(251, 191, 36, 0.1)"
                label={t('meters.udpWaiting')}
            />;
        }
        return <ConnectionBadge
            icon={Radio} color="#9ca3af" bgColor="rgba(156, 163, 175, 0.1)"
            label={t('meters.udpWaiting')}
        />;
    }

    if (meter.connection_type === 'modbus_tcp') {
        const status = modbusStatus[meter.id];
        if (status) {
            if (status.is_connected) {
                return <ConnectionBadge
                    icon={Cable} color="#22c55e" bgColor="rgba(34, 197, 94, 0.1)"
                    label={t('meters.modbusConnected')}
                    detail={status.ip_address ? `${status.ip_address}` : undefined}
                    detail2={`${t('meters.lastUpdate')}: ${formatTime(status.last_update)}`}
                />;
            }
            return <ConnectionBadge
                icon={Cable} color="#ef4444" bgColor="rgba(239, 68, 68, 0.1)"
                label={t('meters.modbusDisconnected')}
                detail={status.last_error}
            />;
        }
        return <ConnectionBadge
            icon={Cable} color="#9ca3af" bgColor="rgba(156, 163, 175, 0.1)"
            label={t('meters.modbusConnecting')}
        />;
    }

    return null;
}
