import { Wifi, WifiOff, Rss, AlertCircle, Cloud, Radio, Cable, BatteryCharging, Battery, Calculator } from 'lucide-react';
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
    e3dcStatus?: any;
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
    modbusStatus,
    e3dcStatus
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

    if (meter.connection_type === 'e3dc') {
        const status = e3dcStatus?.[meter.id];
        if (status) {
            const isBattery = status.value === 'battery' || status.value === 'bat';
            // Build a battery detail line (SoC + charge/discharge direction).
            let batteryDetail: string | undefined;
            let batteryIcon = Cable;
            if (isBattery && typeof status.soc === 'number') {
                const dir = status.battery_charging === true
                    ? t('meters.e3dcCharging')
                    : status.battery_charging === false
                        ? t('meters.e3dcDischarging')
                        : t('meters.e3dcIdle');
                batteryDetail = `${t('meters.e3dcSoc')}: ${Math.round(status.soc)}% · ${dir}`;
                batteryIcon = status.battery_charging === true ? BatteryCharging : Battery;
            }
            if (status.is_connected) {
                return <ConnectionBadge
                    icon={isBattery ? batteryIcon : Cable} color="#22c55e" bgColor="rgba(34, 197, 94, 0.1)"
                    label={t('meters.e3dcConnected')}
                    detail={batteryDetail || (status.ip_address ? `${status.ip_address}` : undefined)}
                    detail2={batteryDetail && status.ip_address ? `${status.ip_address}` : (status.last_update ? `${t('meters.lastUpdate')}: ${formatTime(status.last_update)}` : undefined)}
                />;
            }
            return <ConnectionBadge
                icon={Cable} color="#ef4444" bgColor="rgba(239, 68, 68, 0.1)"
                label={t('meters.e3dcDisconnected')}
                detail={status.ip_address}
            />;
        }
        return <ConnectionBadge
            icon={Cable} color="#9ca3af" bgColor="rgba(156, 163, 175, 0.1)"
            label={t('meters.e3dcConnecting')}
        />;
    }

    if (meter.connection_type === 'virtual') {
        // Computed meters have no connection — show a neutral "computed" badge
        // (positive, never offline) with the time of the last computed value.
        return <ConnectionBadge
            icon={Calculator} color="#db2777" bgColor="rgba(219, 39, 119, 0.1)"
            label={t('meters.virtualStatus')}
            detail={meter.last_reading_time ? `${t('meters.lastUpdate')}: ${formatTime(meter.last_reading_time)}` : undefined}
        />;
    }

    return null;
}
