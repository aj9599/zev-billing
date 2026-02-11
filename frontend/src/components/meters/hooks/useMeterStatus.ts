import { useState } from 'react';
import { api } from '../../../api/client';

interface ConnectionStatus {
    [meterId: number]: {
        meter_name: string;
        is_connected: boolean;
        last_reading: number;
        last_reading_export?: number;
        last_update: string;
        last_error?: string;
        host?: string;
        device_id?: string;
        topic?: string;
        ip_address?: string;
    };
}

export function useMeterStatus() {
    const [loxoneStatus, setLoxoneStatus] = useState<ConnectionStatus>({});
    const [mqttStatus, setMqttStatus] = useState<ConnectionStatus>({});
    const [mqttBrokerConnected, setMqttBrokerConnected] = useState<boolean>(false);
    const [smartmeStatus, setSmartmeStatus] = useState<ConnectionStatus>({});
    const [udpStatus, setUdpStatus] = useState<ConnectionStatus>({});
    const [modbusStatus, setModbusStatus] = useState<ConnectionStatus>({});

    const parseStringKeyedStatus = (data: Record<string, any>): ConnectionStatus => {
        const result: ConnectionStatus = {};
        for (const [key, value] of Object.entries(data)) {
            const numKey = parseInt(key, 10);
            if (!isNaN(numKey)) {
                result[numKey] = value;
            }
        }
        return result;
    };

    const fetchConnectionStatus = async () => {
        try {
            const debugData = await api.getDebugStatus();
            if (debugData.loxone_connections) {
                setLoxoneStatus(debugData.loxone_connections);
            }
            if (debugData.mqtt_connections) {
                setMqttStatus(debugData.mqtt_connections);
            }
            if (typeof debugData.mqtt_broker_connected === 'boolean') {
                setMqttBrokerConnected(debugData.mqtt_broker_connected);
            }
            if (debugData.smartme_connections) {
                setSmartmeStatus(parseStringKeyedStatus(debugData.smartme_connections));
            }
            if (debugData.udp_connections) {
                setUdpStatus(parseStringKeyedStatus(debugData.udp_connections));
            }
            if (debugData.modbus_connections) {
                setModbusStatus(parseStringKeyedStatus(debugData.modbus_connections));
            }
        } catch (error) {
            console.error('Failed to fetch connection status:', error);
        }
    };

    return {
        loxoneStatus,
        mqttStatus,
        mqttBrokerConnected,
        smartmeStatus,
        udpStatus,
        modbusStatus,
        fetchConnectionStatus
    };
}
