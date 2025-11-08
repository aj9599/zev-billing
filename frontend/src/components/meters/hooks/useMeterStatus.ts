import { useState } from 'react';
import { api } from '../../../api/client';

interface LoxoneConnectionStatus {
    [meterId: number]: {
        meter_name: string;
        host: string;
        device_id: string;
        is_connected: boolean;
        last_reading: number;
        last_update: string;
        last_error?: string;
    };
}

interface MQTTConnectionStatus {
    [meterId: number]: {
        meter_name: string;
        topic: string;
        is_connected: boolean;
        last_reading: number;
        last_update: string;
        last_error?: string;
    };
}

export function useMeterStatus() {
    const [loxoneStatus, setLoxoneStatus] = useState<LoxoneConnectionStatus>({});
    const [mqttStatus, setMqttStatus] = useState<MQTTConnectionStatus>({});

    const fetchConnectionStatus = async () => {
        try {
            const debugData = await api.getDebugStatus();
            if (debugData.loxone_connections) {
                setLoxoneStatus(debugData.loxone_connections);
            }
            if (debugData.mqtt_connections) {
                setMqttStatus(debugData.mqtt_connections);
            }
        } catch (error) {
            console.error('Failed to fetch connection status:', error);
        }
    };

    return {
        loxoneStatus,
        mqttStatus,
        fetchConnectionStatus
    };
}