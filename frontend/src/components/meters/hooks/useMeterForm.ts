import { useState } from 'react';
import { api } from '../../../api/client';
import type { Meter } from '../../../types';
import { generateUniqueDataKey, generateUniqueMqttTopic } from '../utils/meterUtils';
import { useTranslation } from '../../../i18n';

interface ConnectionConfig {
    endpoint?: string;
    power_field?: string;
    ip_address?: string;
    port?: number;
    register_address?: number;
    register_count?: number;
    unit_id?: number;
    function_code?: number;
    data_type?: string;
    has_export_register?: boolean;
    export_register_address?: number;
    listen_port?: number;
    data_key?: string;
    loxone_host?: string;
    loxone_mac_address?: string;
    loxone_connection_mode?: 'local' | 'remote';
    loxone_username?: string;
    loxone_password?: string;
    loxone_device_id?: string;
    loxone_mode?: 'meter_block' | 'energy_meter_block' | 'virtual_output_dual' | 'virtual_output_single';
    loxone_export_device_id?: string;
    mqtt_topic?: string;
    mqtt_broker?: string;
    mqtt_port?: number;
    mqtt_username?: string;
    mqtt_password?: string;
    mqtt_qos?: number;
}

export function useMeterForm(loadData: () => void, fetchConnectionStatus: () => void, meters: any[] = []) {
    const { t } = useTranslation();
    const [showModal, setShowModal] = useState(false);
    const [editingMeter, setEditingMeter] = useState<Meter | null>(null);
    const [formData, setFormData] = useState<Partial<Meter>>({
        name: '',
        meter_type: 'total_meter',
        building_id: 0,
        user_id: undefined,
        apartment_unit: '',
        connection_type: 'loxone_api',
        connection_config: '{}',
        device_type: 'generic', // Default device type
        notes: '',
        is_active: true
    });
    const [connectionConfig, setConnectionConfig] = useState<ConnectionConfig>({
        endpoint: '',
        power_field: 'power_kwh',
        ip_address: '',
        port: 502,
        register_address: 0,
        register_count: 2,
        unit_id: 1,
        function_code: 3,
        data_type: 'float32',
        has_export_register: false,
        export_register_address: 0,
        listen_port: 8888,
        data_key: 'power_kwh',
        loxone_host: '',
        loxone_mac_address: '', // NEW
        loxone_connection_mode: 'local', // NEW: Default to local
        loxone_username: '',
        loxone_password: '',
        loxone_device_id: '',
        loxone_mode: 'meter_block', // Will be updated based on meter type
        loxone_export_device_id: '',
        mqtt_topic: '',
        mqtt_broker: 'localhost',
        mqtt_port: 1883,
        mqtt_username: '',
        mqtt_password: '',
        mqtt_qos: 1
    });

    const resetForm = () => {
        setFormData({
            name: '',
            meter_type: 'total_meter',
            building_id: 0,
            user_id: undefined,
            apartment_unit: '',
            connection_type: 'loxone_api',
            connection_config: '{}',
            device_type: 'generic',
            notes: '',
            is_active: true
        });
        setConnectionConfig({
            endpoint: '',
            power_field: 'power_kwh',
            ip_address: '',
            port: 502,
            register_address: 0,
            register_count: 2,
            unit_id: 1,
            function_code: 3,
            data_type: 'float32',
            has_export_register: false,
            export_register_address: 0,
            listen_port: 8888,
            data_key: 'power_kwh',
            loxone_host: '',
            loxone_mac_address: '',
            loxone_connection_mode: 'local',
            loxone_username: '',
            loxone_password: '',
            loxone_device_id: '',
            loxone_mode: 'meter_block', // Default for total_meter
            loxone_export_device_id: '',
            mqtt_topic: '',
            mqtt_broker: 'localhost',
            mqtt_port: 1883,
            mqtt_username: '',
            mqtt_password: '',
            mqtt_qos: 1
        });
    };

    const handleAddMeter = () => {
        resetForm();
        // Generate unique UUID for UDP connection
        const uniqueUUID = generateUniqueDataKey(meters);
        setConnectionConfig(prev => ({
            ...prev,
            data_key: uniqueUUID,
            power_field: uniqueUUID
        }));
        setShowModal(true);
    };

    const handleEdit = (meter: Meter) => {
        setEditingMeter(meter);
        
        // Set form data with device_type
        setFormData({
            ...meter,
            device_type: meter.device_type || 'generic'
        });

        try {
            const config = JSON.parse(meter.connection_config);
            setConnectionConfig({
                endpoint: config.endpoint || '',
                power_field: config.power_field || 'power_kwh',
                ip_address: config.ip_address || '',
                port: config.port || 502,
                register_address: config.register_address || 0,
                register_count: config.register_count || 2,
                unit_id: config.unit_id || 1,
                function_code: config.function_code || 3,
                data_type: config.data_type || 'float32',
                has_export_register: config.has_export_register || false,
                export_register_address: config.export_register_address || 0,
                listen_port: config.listen_port || 8888,
                data_key: config.data_key || 'power_kwh',
                loxone_host: config.loxone_host || '',
                loxone_mac_address: config.loxone_mac_address || '',
                loxone_connection_mode: config.loxone_connection_mode || 'local',
                loxone_username: config.loxone_username || '',
                loxone_password: config.loxone_password || '',
                loxone_device_id: config.loxone_device_id || '',
                loxone_mode: config.loxone_mode || 'meter_block',
                loxone_export_device_id: config.loxone_export_device_id || '',
                mqtt_topic: config.mqtt_topic || '',
                mqtt_broker: config.mqtt_broker || 'localhost',
                mqtt_port: config.mqtt_port || 1883,
                mqtt_username: config.mqtt_username || '',
                mqtt_password: config.mqtt_password || '',
                mqtt_qos: config.mqtt_qos || 1
            });
        } catch (e) {
            console.error('Failed to parse config:', e);
        }

        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        let config: ConnectionConfig = {};

        if (formData.connection_type === 'loxone_api') {
            config = {
                loxone_host: connectionConfig.loxone_host,
                loxone_mac_address: connectionConfig.loxone_mac_address,
                loxone_connection_mode: connectionConfig.loxone_connection_mode,
                loxone_username: connectionConfig.loxone_username,
                loxone_password: connectionConfig.loxone_password,
                loxone_device_id: connectionConfig.loxone_device_id,
                loxone_mode: connectionConfig.loxone_mode,
                loxone_export_device_id: connectionConfig.loxone_export_device_id
            };
        } else if (formData.connection_type === 'modbus_tcp') {
            config = {
                ip_address: connectionConfig.ip_address,
                port: connectionConfig.port,
                unit_id: connectionConfig.unit_id,
                function_code: connectionConfig.function_code,
                data_type: connectionConfig.data_type,
                register_address: connectionConfig.register_address,
                register_count: connectionConfig.register_count,
                has_export_register: connectionConfig.has_export_register,
                export_register_address: connectionConfig.export_register_address
            };
        } else if (formData.connection_type === 'udp') {
            config = {
                listen_port: connectionConfig.listen_port,
                data_key: connectionConfig.data_key
            };
        } else if (formData.connection_type === 'mqtt') {
            config = {
                mqtt_topic: connectionConfig.mqtt_topic,
                mqtt_broker: connectionConfig.mqtt_broker,
                mqtt_port: connectionConfig.mqtt_port,
                mqtt_username: connectionConfig.mqtt_username,
                mqtt_password: connectionConfig.mqtt_password,
                mqtt_qos: connectionConfig.mqtt_qos
            };
        }

        // Ensure device_type is set, with default fallback
        const deviceType = formData.device_type || 'generic';

        const dataToSend = {
            ...formData,
            connection_config: JSON.stringify(config),
            device_type: deviceType
        };

        console.log('Submitting meter data:', dataToSend);

        try {
            if (editingMeter) {
                await api.updateMeter(editingMeter.id, dataToSend);
            } else {
                await api.createMeter(dataToSend);
            }
            setShowModal(false);
            setEditingMeter(null);
            resetForm();
            loadData();
            setTimeout(fetchConnectionStatus, 2000);
        } catch (err) {
            console.error('Failed to save meter:', err);
            alert(t('meters.saveFailed'));
        }
    };

    const handleCancel = () => {
        setShowModal(false);
        setEditingMeter(null);
        resetForm();
    };

    const handleConnectionTypeChange = (connectionType: string, meterName: string, buildingName?: string, apartmentUnit?: string) => {
        // Auto-generate MQTT topic when switching to MQTT
        if (connectionType === 'mqtt' && meterName) {
            const topic = generateUniqueMqttTopic(meters, meterName, buildingName, apartmentUnit);
            setConnectionConfig(prev => ({
                ...prev,
                mqtt_topic: topic
            }));
        }
    };

    const handleNameChange = (
        name: string, 
        currentConnectionType: string,
        buildingName?: string,
        apartmentUnit?: string
    ) => {
        setFormData(prev => ({ ...prev, name }));
        // Auto-generate MQTT topic when name changes for MQTT connections
        if (!editingMeter && currentConnectionType === 'mqtt' && name) {
            const topic = generateUniqueMqttTopic(meters, name, buildingName, apartmentUnit);
            setConnectionConfig(prev => ({
                ...prev,
                mqtt_topic: topic
            }));
        }
    };

    return {
        showModal,
        editingMeter,
        formData,
        connectionConfig,
        handleAddMeter,
        handleEdit,
        handleSubmit,
        handleCancel,
        handleConnectionTypeChange,
        handleNameChange,
        setFormData,
        setConnectionConfig
    };
}