import { notify } from '../../../utils/toast';
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
    scale?: number; // multiplier for raw Modbus values (Kostal: 0.001 Wh→kWh)
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
    loxone_mode?: 'meter_block' | 'energy_meter_block' | 'virtual_output_dual' | 'virtual_output_single' | 'battery_block';
    loxone_export_device_id?: string;
    mqtt_topic?: string;
    mqtt_broker?: string;
    mqtt_port?: number;
    mqtt_username?: string;
    mqtt_password?: string;
    mqtt_qos?: number;
    // Smart-me configuration
    auth_type?: 'basic' | 'apikey' | 'oauth';
    username?: string;
    password?: string;
    api_key?: string;
    client_id?: string;
    client_secret?: string;
    device_id?: string;
    serial?: string; // Smart-me serial number (backup identifier when UUID unknown)
    // Virtual (computed) meter: combine other meters with +/- and a chosen channel
    virtual_sources?: { meter_id: number; op: '+' | '-'; field?: 'import' | 'export' }[];
    // Virtual meter evaluation mode: 'power' integrates net flow and auto-splits
    // import/export by sign (no channel picker); 'energy' is the legacy channel
    // composition. New meters default to 'power'.
    virtual_mode?: 'power' | 'energy';
    // E3/DC EMS metering (Modbus read-only, or RSCP)
    e3dc_protocol?: 'modbus' | 'rscp';
    e3dc_host?: string;
    e3dc_port?: number;
    e3dc_unit_id?: number;
    e3dc_user?: string;
    e3dc_password?: string;
    e3dc_rscp_key?: string;
    e3dc_value?: string; // grid | pv | battery | home | wallbox
    e3dc_external_power?: boolean;
}

export function useMeterForm(loadData: () => void, fetchConnectionStatus: () => void, meters: any[] = []) {
    const { t } = useTranslation();
    const [showModal, setShowModal] = useState(false);
    const [editingMeter, setEditingMeter] = useState<Meter | null>(null);
    const [isTestingConnection, setIsTestingConnection] = useState(false);
    const [formData, setFormData] = useState<Partial<Meter>>({
        name: '',
        meter_type: 'total_meter',
        building_id: 0,
        user_id: undefined,
        apartment_unit: '',
        connection_type: 'loxone_api',
        connection_config: '{}',
        device_type: 'generic',
        notes: '',
        is_active: true,
        is_mid_certified: true
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
        loxone_mac_address: '',
        loxone_connection_mode: 'local',
        loxone_username: '',
        loxone_password: '',
        loxone_device_id: '',
        loxone_mode: 'meter_block',
        loxone_export_device_id: '',
        mqtt_topic: '',
        mqtt_broker: 'localhost',
        mqtt_port: 1883,
        mqtt_username: '',
        mqtt_password: '',
        mqtt_qos: 1,
        // Smart-me defaults
        auth_type: 'apikey',
        username: '',
        password: '',
        api_key: '',
        client_id: '',
        client_secret: '',
        device_id: '',
        serial: '',
        virtual_sources: [],
        virtual_mode: 'power',
        e3dc_protocol: 'modbus',
        e3dc_host: '',
        e3dc_port: 502,
        e3dc_unit_id: 1,
        e3dc_user: '',
        e3dc_password: '',
        e3dc_rscp_key: '',
        e3dc_value: 'grid',
        e3dc_external_power: false
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
            loxone_mode: 'meter_block',
            loxone_export_device_id: '',
            mqtt_topic: '',
            mqtt_broker: 'localhost',
            mqtt_port: 1883,
            mqtt_username: '',
            mqtt_password: '',
            mqtt_qos: 1,
            // Smart-me defaults
            auth_type: 'apikey',
            username: '',
            password: '',
            api_key: '',
            client_id: '',
            client_secret: '',
            device_id: '',
            e3dc_protocol: 'modbus',
            e3dc_host: '',
            e3dc_port: 502,
            e3dc_unit_id: 1,
            e3dc_user: '',
            e3dc_password: '',
            e3dc_rscp_key: '',
            e3dc_value: 'grid',
            e3dc_external_power: false
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
                scale: config.scale || 1,
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
                mqtt_qos: config.mqtt_qos || 1,
                // Smart-me config
                auth_type: config.auth_type || 'apikey',
                username: config.username || '',
                password: config.password || '',
                api_key: config.api_key || '',
                client_id: config.client_id || '',
                client_secret: config.client_secret || '',
                device_id: config.device_id || '',
                serial: config.serial || '',
                virtual_sources: config.sources || [],
                // Existing virtual meters with no mode are legacy energy-composition.
                virtual_mode: (config.mode === 'power' ? 'power' : 'energy'),
                e3dc_protocol: config.e3dc_protocol || 'modbus',
                e3dc_host: config.e3dc_host || '',
                e3dc_port: config.e3dc_port || (config.e3dc_protocol === 'rscp' ? 5033 : 502),
                e3dc_unit_id: config.e3dc_unit_id || 1,
                e3dc_user: config.e3dc_user || '',
                e3dc_password: config.e3dc_password || '',
                e3dc_rscp_key: config.e3dc_rscp_key || '',
                e3dc_value: config.e3dc_value || 'grid',
                e3dc_external_power: config.e3dc_external_power || false
            });
        } catch (e) {
            console.error('Failed to parse config:', e);
        }

        setShowModal(true);
    };

    const validateSmartMeConfig = (): string | null => {
        const hasDeviceId = !!connectionConfig.device_id && connectionConfig.device_id.trim() !== '';
        const hasSerial = !!connectionConfig.serial && connectionConfig.serial.trim() !== '';

        // Either a device UUID or a serial number must be provided.
        if (!hasDeviceId && !hasSerial) {
            return t('meters.errorDeviceIdOrSerialRequired');
        }

        // If a UUID is given, validate its format. Serial-only is allowed.
        if (hasDeviceId) {
            const uuidRegex = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
            if (!uuidRegex.test(connectionConfig.device_id!)) {
                return t('meters.errorInvalidDeviceIdFormat');
            }
        }

        switch (connectionConfig.auth_type) {
            case 'apikey':
                if (!connectionConfig.api_key || connectionConfig.api_key.trim() === '') {
                    return t('meters.errorApiKeyRequired');
                }
                break;
            case 'basic':
                if (!connectionConfig.username || connectionConfig.username.trim() === '') {
                    return t('meters.errorUsernameRequired');
                }
                if (!connectionConfig.password || connectionConfig.password.trim() === '') {
                    return t('meters.errorPasswordRequired');
                }
                break;
            case 'oauth':
                if (!connectionConfig.client_id || connectionConfig.client_id.trim() === '') {
                    return t('meters.errorClientIdRequired');
                }
                if (!connectionConfig.client_secret || connectionConfig.client_secret.trim() === '') {
                    return t('meters.errorClientSecretRequired');
                }
                break;
        }

        return null;
    };

    const handleTestConnection = async () => {
        if (formData.connection_type !== 'smartme') {
            notify(t('meters.testConnectionOnlySmartme'));
            return;
        }

        // Validate configuration first
        const validationError = validateSmartMeConfig();
        if (validationError) {
            notify(validationError);
            return;
        }

        setIsTestingConnection(true);

        try {
            // Build config object for testing (device UUID or serial number)
            const testConfig: any = {
                auth_type: connectionConfig.auth_type,
                device_id: connectionConfig.device_id?.trim() || '',
                serial: connectionConfig.serial?.trim() || ''
            };

            // Add auth-specific fields
            if (connectionConfig.auth_type === 'apikey') {
                testConfig.api_key = connectionConfig.api_key;
            } else if (connectionConfig.auth_type === 'basic') {
                testConfig.username = connectionConfig.username;
                testConfig.password = connectionConfig.password;
            } else if (connectionConfig.auth_type === 'oauth') {
                testConfig.client_id = connectionConfig.client_id;
                testConfig.client_secret = connectionConfig.client_secret;
            }

            await api.testSmartMeConnection(testConfig);
            notify(t('meters.testConnectionSuccess'));
        } catch (err: any) {
            console.error('Connection test failed:', err);
            const errorMsg = err?.response?.data?.error || err?.message || t('meters.testConnectionFailed');
            notify(`${t('meters.testConnectionFailed')}:\n\n${errorMsg}`);
        } finally {
            setIsTestingConnection(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Extra validation for Smart-me
        if (formData.connection_type === 'smartme') {
            const validationError = validateSmartMeConfig();
            if (validationError) {
                notify(validationError);
                return;
            }
        }

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
        } else if (formData.connection_type === 'kostal') {
            // Kostal inverter (Plenticore/PIKO) over Modbus TCP. We preset the
            // SunSpec/Kostal "Total yield" energy register (1056, float32, Wh) and
            // scale to kWh. The user only provides IP + (optionally) port/unit id.
            config = {
                ip_address: connectionConfig.ip_address,
                port: connectionConfig.port || 1502,
                unit_id: connectionConfig.unit_id || 71,
                function_code: 3,
                // Kostal encodes 32-bit registers word-swapped (evcc "float32s").
                data_type: 'float32s',
                // Kostal "Total yield" register (Wh) — fixed, not user-editable.
                register_address: 1056,
                register_count: 2,
                scale: connectionConfig.scale || 0.001,
                has_export_register: false
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
        } else if (formData.connection_type === 'e3dc') {
            // E3/DC EMS metering. Modbus is read-only (no auth); RSCP needs
            // portal credentials + the device RSCP key. The value read is
            // derived from the meter type — no separate, contradictory choice.
            const e3dcValue =
                formData.meter_type === 'solar_meter' ? 'pv'
                : formData.meter_type === 'battery_meter' ? 'battery'
                : 'grid';
            config = {
                e3dc_protocol: connectionConfig.e3dc_protocol,
                e3dc_host: connectionConfig.e3dc_host,
                e3dc_port: connectionConfig.e3dc_port,
                e3dc_value: e3dcValue,
                e3dc_external_power: formData.meter_type === 'solar_meter' ? connectionConfig.e3dc_external_power : false
            };
            if (connectionConfig.e3dc_protocol === 'rscp') {
                config.e3dc_user = connectionConfig.e3dc_user;
                config.e3dc_password = connectionConfig.e3dc_password;
                config.e3dc_rscp_key = connectionConfig.e3dc_rscp_key;
            } else {
                config.e3dc_unit_id = connectionConfig.e3dc_unit_id;
            }
        } else if (formData.connection_type === 'smartme') {
            // Smart-me configuration
            config = {
                auth_type: connectionConfig.auth_type,
                device_id: connectionConfig.device_id?.trim(),
                serial: connectionConfig.serial?.trim()
            };

            // Add auth-specific fields
            if (connectionConfig.auth_type === 'apikey') {
                config.api_key = connectionConfig.api_key?.trim();
            } else if (connectionConfig.auth_type === 'basic') {
                config.username = connectionConfig.username?.trim();
                config.password = connectionConfig.password;
            } else if (connectionConfig.auth_type === 'oauth') {
                config.client_id = connectionConfig.client_id?.trim();
                config.client_secret = connectionConfig.client_secret?.trim();
            }
        } else if (formData.connection_type === 'virtual') {
            // Virtual (computed) meter: store the source meters, their +/- op and
            // the evaluation mode. Power mode drops the per-source channel (import/
            // export) — direction is derived from the sign of the net flow.
            const mode: 'power' | 'energy' = connectionConfig.virtual_mode || 'power';
            const sources = (connectionConfig.virtual_sources || [])
                .filter(s => s.meter_id && s.meter_id > 0)
                .map(s => mode === 'power'
                    ? { meter_id: s.meter_id, op: s.op }
                    : { meter_id: s.meter_id, op: s.op, field: s.field || 'import' });
            if (sources.length === 0) {
                notify(t('meters.errorVirtualSourcesRequired'));
                return;
            }
            config = { sources, mode } as any;
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
        } catch (err: any) {
            console.error('Failed to save meter:', err);
            
            // Extract detailed error message
            let errorMessage = t('meters.saveFailed');
            
            if (err?.response?.data?.error) {
                errorMessage += `:\n\n${err.response.data.error}`;
            } else if (err?.response?.data?.message) {
                errorMessage += `:\n\n${err.response.data.message}`;
            } else if (err?.message) {
                errorMessage += `:\n\n${err.message}`;
            }
            
            // Add specific guidance for Smart-me errors
            if (formData.connection_type === 'smartme') {
                if (err?.response?.status === 401 || err?.response?.status === 403) {
                    errorMessage += `\n\n${t('meters.errorCheckCredentials')}`;
                } else if (err?.response?.status === 404) {
                    errorMessage += `\n\n${t('meters.errorDeviceNotFound')}`;
                }
            }
            
            notify(errorMessage);
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
        isTestingConnection,
        handleAddMeter,
        handleEdit,
        handleSubmit,
        handleCancel,
        handleConnectionTypeChange,
        handleNameChange,
        handleTestConnection,
        setFormData,
        setConnectionConfig
    };
}