import { X, Info, AlertCircle, Wifi, Rss } from 'lucide-react';
import { useTranslation } from '../../i18n';
import type { Meter, Building, User } from '../../types';

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
    loxone_username?: string;
    loxone_password?: string;
    loxone_device_id?: string;
    mqtt_topic?: string;
    mqtt_broker?: string;
    mqtt_port?: number;
    mqtt_username?: string;
    mqtt_password?: string;
    mqtt_qos?: number;
}

interface MeterFormModalProps {
    editingMeter: Meter | null;
    formData: Partial<Meter>;
    connectionConfig: ConnectionConfig;
    buildings: Building[];
    users: User[];
    onSubmit: (e: React.FormEvent) => Promise<void>;
    onCancel: () => void;
    onFormDataChange: (data: Partial<Meter>) => void;
    onConnectionConfigChange: (config: ConnectionConfig) => void;
    onConnectionTypeChange: (connectionType: string, meterName: string, buildingName?: string, apartmentUnit?: string) => void;
    onNameChange: (name: string, connectionType: string, buildingName?: string, apartmentUnit?: string) => void;
    onShowInstructions: () => void;
}

export default function MeterFormModal({
    editingMeter,
    formData,
    connectionConfig,
    buildings,
    users,
    onSubmit,
    onCancel,
    onFormDataChange,
    onConnectionConfigChange,
    onConnectionTypeChange,
    onNameChange,
    onShowInstructions
}: MeterFormModalProps) {
    const { t } = useTranslation();

    const meterTypes = [
        { value: 'total_meter', label: t('meters.totalMeter') },
        { value: 'solar_meter', label: t('meters.solarMeter') },
        { value: 'apartment_meter', label: t('meters.apartmentMeter') },
        { value: 'heating_meter', label: t('meters.heatingMeter') },
        { value: 'other', label: t('meters.other') }
    ];

    const deviceTypes = [
        { value: 'generic', label: 'Generic Device (Flexible JSON)' },
        { value: 'whatwatt-go', label: 'WhatWatt Go' },
        { value: 'shelly-3em', label: 'Shelly 3EM (3-Phase)' },
        { value: 'shelly-em', label: 'Shelly EM (Single Phase)' },
        { value: 'shelly-2pm', label: 'Shelly 2PM (Dual Channel)' },
        { value: 'custom', label: 'Custom Device' }
    ];

    const handleNameChange = (name: string) => {
        const building = buildings.find(b => b.id === formData.building_id);
        onNameChange(name, formData.connection_type || 'loxone_api', building?.name, formData.apartment_unit);
    };

    const handleConnectionTypeChange = (connectionType: string) => {
        onFormDataChange({ ...formData, connection_type: connectionType });
        // Auto-generate MQTT topic when switching to MQTT
        if (connectionType === 'mqtt' && formData.name) {
            const building = buildings.find(b => b.id === formData.building_id);
            onConnectionTypeChange(connectionType, formData.name, building?.name, formData.apartment_unit);
        }
    };

    const handleDeviceTypeChange = (deviceType: string) => {
        console.log('Device type changed to:', deviceType);
        onFormDataChange({ ...formData, device_type: deviceType });
    };

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
            padding: '15px'
        }}>
            <div className="modal-content" style={{
                backgroundColor: 'white',
                borderRadius: '12px',
                padding: '30px',
                width: '90%',
                maxWidth: '700px',
                maxHeight: '90vh',
                overflow: 'auto'
            }}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '20px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <h2 style={{ fontSize: '24px', fontWeight: 'bold' }}>
                            {editingMeter ? t('meters.editMeter') : t('meters.addMeter')}
                        </h2>
                        <button
                            onClick={onShowInstructions}
                            style={{
                                padding: '6px',
                                border: 'none',
                                background: 'none',
                                cursor: 'pointer',
                                color: '#007bff'
                            }}
                            title={t('meters.setupInstructions')}
                        >
                            <Info size={20} />
                        </button>
                    </div>
                    <button
                        onClick={onCancel}
                        style={{ border: 'none', background: 'none', cursor: 'pointer' }}
                    >
                        <X size={24} />
                    </button>
                </div>

                <form onSubmit={onSubmit}>
                    {/* Name Field */}
                    <div>
                        <label style={{
                            display: 'block',
                            marginBottom: '8px',
                            fontWeight: '500',
                            fontSize: '14px'
                        }}>
                            {t('common.name')} *
                        </label>
                        <input
                            type="text"
                            required
                            value={formData.name || ''}
                            onChange={(e) => handleNameChange(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '10px',
                                border: '1px solid #ddd',
                                borderRadius: '6px'
                            }}
                        />
                    </div>

                    {/* Meter Type Field */}
                    <div style={{ marginTop: '16px' }}>
                        <label style={{
                            display: 'block',
                            marginBottom: '8px',
                            fontWeight: '500',
                            fontSize: '14px'
                        }}>
                            {t('meters.meterType')} *
                        </label>
                        <select
                            required
                            value={formData.meter_type || 'total_meter'}
                            onChange={(e) => onFormDataChange({ ...formData, meter_type: e.target.value })}
                            style={{
                                width: '100%',
                                padding: '10px',
                                border: '1px solid #ddd',
                                borderRadius: '6px'
                            }}
                        >
                            {meterTypes.map(t => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* Building Field */}
                    <div style={{ marginTop: '16px' }}>
                        <label style={{
                            display: 'block',
                            marginBottom: '8px',
                            fontWeight: '500',
                            fontSize: '14px'
                        }}>
                            {t('users.building')} *
                        </label>
                        <select
                            required
                            value={formData.building_id || 0}
                            onChange={(e) => {
                                const newBuildingId = parseInt(e.target.value);
                                onFormDataChange({ ...formData, building_id: newBuildingId });
                                // Regenerate MQTT topic if using MQTT
                                if (formData.connection_type === 'mqtt' && formData.name) {
                                    const building = buildings.find(b => b.id === newBuildingId);
                                    onConnectionTypeChange('mqtt', formData.name, building?.name, formData.apartment_unit);
                                }
                            }}
                            style={{
                                width: '100%',
                                padding: '10px',
                                border: '1px solid #ddd',
                                borderRadius: '6px'
                            }}
                        >
                            <option value={0}>{t('users.selectBuilding')}</option>
                            {buildings.map(b => (
                                <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Apartment Unit Selection (only for apartment meters) */}
                    {formData.meter_type === 'apartment_meter' && (
                        <>
                            {(() => {
                                const selectedBuilding = buildings.find(b => b.id === formData.building_id);
                                const hasApartments = selectedBuilding?.has_apartments && selectedBuilding?.floors_config && selectedBuilding.floors_config.length > 0;
                                const allApartments = hasApartments
                                    ? selectedBuilding!.floors_config!.flatMap(floor =>
                                        floor.apartments.map(apt => `${floor.floor_name} - ${apt}`)
                                    )
                                    : [];

                                // Find user linked to selected apartment
                                const linkedUser = formData.apartment_unit
                                    ? users.find(u =>
                                        u.building_id === formData.building_id &&
                                        u.apartment_unit === formData.apartment_unit &&
                                        u.is_active
                                    )
                                    : null;

                                return (
                                    <>
                                        {hasApartments && (
                                            <div style={{ marginTop: '16px' }}>
                                                <label style={{
                                                    display: 'block',
                                                    marginBottom: '8px',
                                                    fontWeight: '500',
                                                    fontSize: '14px'
                                                }}>
                                                    {t('meters.apartmentUnit')} *
                                                </label>
                                                <select
                                                    required
                                                    value={formData.apartment_unit || ''}
                                                    onChange={(e) => {
                                                        const selectedApt = e.target.value;
                                                        // Find user for this apartment
                                                        const aptUser = users.find(u =>
                                                            u.building_id === formData.building_id &&
                                                            u.apartment_unit === selectedApt &&
                                                            u.is_active
                                                        );
                                                        // Update form with apartment and auto-link user if found
                                                        onFormDataChange({
                                                            ...formData,
                                                            apartment_unit: selectedApt,
                                                            user_id: aptUser ? aptUser.id : undefined
                                                        });
                                                        // Regenerate MQTT topic if using MQTT
                                                        if (formData.connection_type === 'mqtt' && formData.name) {
                                                            const building = buildings.find(b => b.id === formData.building_id);
                                                            onConnectionTypeChange('mqtt', formData.name, building?.name, selectedApt);
                                                        }
                                                    }}
                                                    style={{
                                                        width: '100%',
                                                        padding: '10px',
                                                        border: '1px solid #ddd',
                                                        borderRadius: '6px'
                                                    }}
                                                >
                                                    <option value="">{t('meters.selectApartment')}</option>
                                                    {allApartments.map((apt, idx) => (
                                                        <option key={idx} value={apt}>{apt}</option>
                                                    ))}
                                                </select>
                                                <p style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                                                    {t('meters.apartmentHelpText')}
                                                </p>
                                            </div>
                                        )}

                                        {formData.apartment_unit && (
                                            <div style={{ marginTop: '16px' }}>
                                                <label style={{
                                                    display: 'block',
                                                    marginBottom: '8px',
                                                    fontWeight: '500',
                                                    fontSize: '14px'
                                                }}>
                                                    {t('meters.linkedUser')}
                                                </label>
                                                {linkedUser ? (
                                                    <div style={{
                                                        padding: '12px',
                                                        backgroundColor: '#f0f9ff',
                                                        border: '2px solid #3b82f6',
                                                        borderRadius: '8px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '10px'
                                                    }}>
                                                        <div style={{
                                                            width: '36px',
                                                            height: '36px',
                                                            borderRadius: '50%',
                                                            backgroundColor: '#3b82f6',
                                                            color: 'white',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            fontWeight: '600',
                                                            fontSize: '14px'
                                                        }}>
                                                            {linkedUser.first_name.charAt(0)}{linkedUser.last_name.charAt(0)}
                                                        </div>
                                                        <div style={{ flex: 1 }}>
                                                            <div style={{ fontWeight: '600', color: '#1f2937', fontSize: '14px' }}>
                                                                {linkedUser.first_name} {linkedUser.last_name}
                                                            </div>
                                                            <div style={{ fontSize: '12px', color: '#6b7280' }}>
                                                                {linkedUser.email}
                                                            </div>
                                                        </div>
                                                        <div style={{
                                                            padding: '4px 8px',
                                                            backgroundColor: '#22c55e',
                                                            color: 'white',
                                                            borderRadius: '12px',
                                                            fontSize: '11px',
                                                            fontWeight: '600'
                                                        }}>
                                                            Ã¢Å“â€œ {t('common.active')}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div style={{
                                                        padding: '12px',
                                                        backgroundColor: '#fef3c7',
                                                        border: '2px solid #f59e0b',
                                                        borderRadius: '8px',
                                                        color: '#92400e',
                                                        fontSize: '13px'
                                                    }}>
                                                        Ã¢Å¡Â Ã¯Â¸Â {t('meters.noUserLinked')}
                                                    </div>
                                                )}
                                                <p style={{ fontSize: '11px', color: '#666', marginTop: '6px' }}>
                                                    {t('meters.userOptionalHelpText')}
                                                </p>
                                            </div>
                                        )}

                                        {!formData.apartment_unit && hasApartments && (
                                            <div style={{
                                                marginTop: '16px',
                                                padding: '12px',
                                                backgroundColor: '#f3f4f6',
                                                borderRadius: '8px',
                                                color: '#6b7280',
                                                fontSize: '13px'
                                            }}>
                                                Ã¢â€žÂ¹Ã¯Â¸Â {t('meters.apartmentNotSelected')}
                                            </div>
                                        )}
                                    </>
                                );
                            })()}
                        </>
                    )}

                    {/* Connection Type */}
                    <div style={{ marginTop: '16px' }}>
                        <label style={{
                            display: 'block',
                            marginBottom: '8px',
                            fontWeight: '500',
                            fontSize: '14px'
                        }}>
                            {t('meters.connectionType')} *
                        </label>
                        <select
                            required
                            value={formData.connection_type || 'loxone_api'}
                            onChange={(e) => handleConnectionTypeChange(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '10px',
                                border: '1px solid #ddd',
                                borderRadius: '6px'
                            }}
                        >
                            <option value="loxone_api">{t('meters.loxoneApiRecommended')}</option>
                            <option value="mqtt">{t('meters.mqttProtocol')}</option>
                            <option value="udp">{t('meters.udpAlternative')}</option>
                            <option value="modbus_tcp">{t('meters.modbusTcp')}</option>
                        </select>
                    </div>

                    {/* Connection Configuration */}
                    <div style={{
                        marginTop: '20px',
                        padding: '20px',
                        backgroundColor: '#f9f9f9',
                        borderRadius: '8px'
                    }}>
                        <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>
                            {t('meters.connectionConfig')}
                        </h3>

                        {/* Loxone API Configuration */}
                        {formData.connection_type === 'loxone_api' && (
                            <>
                                <div style={{
                                    backgroundColor: '#d1fae5',
                                    padding: '12px',
                                    borderRadius: '6px',
                                    marginBottom: '12px',
                                    border: '1px solid #10b981',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px'
                                }}>
                                    <Wifi size={16} color="#10b981" />
                                    <p style={{ fontSize: '13px', color: '#065f46', margin: 0 }}>
                                        <strong>{t('meters.loxoneApiDescription')}</strong>
                                    </p>
                                </div>

                                <div style={{ marginBottom: '12px' }}>
                                    <label style={{
                                        display: 'block',
                                        marginBottom: '8px',
                                        fontWeight: '500',
                                        fontSize: '14px'
                                    }}>
                                        {t('meters.loxoneHost')} *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={connectionConfig.loxone_host || ''}
                                        onChange={(e) => onConnectionConfigChange({
                                            ...connectionConfig,
                                            loxone_host: e.target.value
                                        })}
                                        placeholder="192.168.1.100"
                                        style={{
                                            width: '100%',
                                            padding: '10px',
                                            border: '1px solid #ddd',
                                            borderRadius: '6px'
                                        }}
                                    />
                                    <p style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                                        {t('meters.loxoneHostDescription')}
                                    </p>
                                </div>

                                <div style={{ marginBottom: '12px' }}>
                                    <label style={{
                                        display: 'block',
                                        marginBottom: '8px',
                                        fontWeight: '500',
                                        fontSize: '14px'
                                    }}>
                                        {t('meters.loxoneDeviceId')} *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={connectionConfig.loxone_device_id || ''}
                                        onChange={(e) => onConnectionConfigChange({
                                            ...connectionConfig,
                                            loxone_device_id: e.target.value
                                        })}
                                        placeholder="1e475b8d-017e-c7b5-ffff336efb88726d"
                                        style={{
                                            width: '100%',
                                            padding: '10px',
                                            border: '1px solid #ddd',
                                            borderRadius: '6px',
                                            fontFamily: 'monospace'
                                        }}
                                    />
                                    <p style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                                        {t('meters.loxoneDeviceIdDescription')}
                                    </p>
                                </div>

                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: '1fr 1fr',
                                    gap: '12px',
                                    marginBottom: '12px'
                                }}>
                                    <div>
                                        <label style={{
                                            display: 'block',
                                            marginBottom: '8px',
                                            fontWeight: '500',
                                            fontSize: '14px'
                                        }}>
                                            {t('meters.loxoneUsername')} *
                                        </label>
                                        <input
                                            type="text"
                                            required
                                            value={connectionConfig.loxone_username || ''}
                                            onChange={(e) => onConnectionConfigChange({
                                                ...connectionConfig,
                                                loxone_username: e.target.value
                                            })}
                                            placeholder="admin"
                                            style={{
                                                width: '100%',
                                                padding: '10px',
                                                border: '1px solid #ddd',
                                                borderRadius: '6px'
                                            }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{
                                            display: 'block',
                                            marginBottom: '8px',
                                            fontWeight: '500',
                                            fontSize: '14px'
                                        }}>
                                            {t('meters.loxonePassword')} *
                                        </label>
                                        <input
                                            type="password"
                                            required
                                            value={connectionConfig.loxone_password || ''}
                                            onChange={(e) => onConnectionConfigChange({
                                                ...connectionConfig,
                                                loxone_password: e.target.value
                                            })}
                                            placeholder="Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢"
                                            style={{
                                                width: '100%',
                                                padding: '10px',
                                                border: '1px solid #ddd',
                                                borderRadius: '6px'
                                            }}
                                        />
                                    </div>
                                </div>
                                <p style={{ fontSize: '11px', color: '#666', marginBottom: '12px' }}>
                                    {t('meters.loxoneCredentialsDescription')}
                                </p>

                                <div style={{
                                    backgroundColor: '#fff',
                                    padding: '12px',
                                    borderRadius: '6px',
                                    marginTop: '12px',
                                    fontFamily: 'monospace',
                                    fontSize: '12px',
                                    border: '1px solid #e5e7eb'
                                }}>
                                    <strong>{t('meters.loxoneSetupGuide')}</strong><br />
                                    {t('meters.loxoneSetupStep1')}<br />
                                    {t('meters.loxoneSetupStep2')}<br />
                                    {t('meters.loxoneSetupStep3')}<br />
                                    {t('meters.loxoneSetupStep4')}<br /><br />
                                    <div style={{
                                        backgroundColor: '#d1fae5',
                                        padding: '8px',
                                        borderRadius: '4px',
                                        fontSize: '11px',
                                        color: '#065f46'
                                    }}>
                                        <strong>{t('meters.loxoneFeatures')}</strong><br />
                                        {t('meters.loxoneFeature1')}<br />
                                        {t('meters.loxoneFeature2')}<br />
                                        {t('meters.loxoneFeature3')}
                                    </div>
                                </div>
                            </>
                        )}

                        {/* MQTT Configuration */}
                        {formData.connection_type === 'mqtt' && (
                            <>
                                <div style={{
                                    backgroundColor: '#f3e8ff',
                                    padding: '12px',
                                    borderRadius: '6px',
                                    marginBottom: '12px',
                                    border: '1px solid #8b5cf6',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px'
                                }}>
                                    <Rss size={16} color="#8b5cf6" />
                                    <p style={{ fontSize: '13px', color: '#5b21b6', margin: 0 }}>
                                        <strong>{t('meters.mqttProtocolDescription')}</strong>
                                    </p>
                                </div>

                                {/* Device Type Selection */}
                                <div style={{ marginBottom: '12px' }}>
                                    <label style={{
                                        display: 'block',
                                        marginBottom: '8px',
                                        fontWeight: '500',
                                        fontSize: '14px'
                                    }}>
                                        Device Type *
                                    </label>
                                    <select
                                        required
                                        value={formData.device_type || 'generic'}
                                        onChange={(e) => handleDeviceTypeChange(e.target.value)}
                                        style={{
                                            width: '100%',
                                            padding: '10px',
                                            border: '1px solid #ddd',
                                            borderRadius: '6px'
                                        }}
                                    >
                                        {deviceTypes.map(dt => (
                                            <option key={dt.value} value={dt.value}>{dt.label}</option>
                                        ))}
                                    </select>
                                    <p style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                                        Select the type of device sending MQTT data. Use "Generic" for flexible JSON parsing.
                                    </p>
                                </div>

                                <div style={{ marginBottom: '12px' }}>
                                    <label style={{
                                        display: 'block',
                                        marginBottom: '8px',
                                        fontWeight: '500',
                                        fontSize: '14px'
                                    }}>
                                        {t('meters.mqttTopic')} *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={connectionConfig.mqtt_topic || ''}
                                        onChange={(e) => onConnectionConfigChange({
                                            ...connectionConfig,
                                            mqtt_topic: e.target.value
                                        })}
                                        placeholder="meters/building_name/apartment/meter_name"
                                        style={{
                                            width: '100%',
                                            padding: '10px',
                                            border: '1px solid #ddd',
                                            borderRadius: '6px',
                                            fontFamily: 'monospace'
                                        }}
                                    />
                                    <p style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                                        {editingMeter
                                            ? t('meters.mqttTopicHelpEdit')
                                            : t('meters.mqttTopicHelpNew')}
                                    </p>
                                </div>

                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: '2fr 1fr',
                                    gap: '12px',
                                    marginBottom: '12px'
                                }}>
                                    <div>
                                        <label style={{
                                            display: 'block',
                                            marginBottom: '8px',
                                            fontWeight: '500',
                                            fontSize: '14px'
                                        }}>
                                            {t('meters.mqttBrokerHost')} *
                                        </label>
                                        <input
                                            type="text"
                                            required
                                            value={connectionConfig.mqtt_broker || ''}
                                            onChange={(e) => onConnectionConfigChange({
                                                ...connectionConfig,
                                                mqtt_broker: e.target.value
                                            })}
                                            placeholder={t('meters.mqttBrokerPlaceholder')}
                                            style={{
                                                width: '100%',
                                                padding: '10px',
                                                border: '1px solid #ddd',
                                                borderRadius: '6px'
                                            }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{
                                            display: 'block',
                                            marginBottom: '8px',
                                            fontWeight: '500',
                                            fontSize: '14px'
                                        }}>
                                            {t('meters.port')} *
                                        </label>
                                        <input
                                            type="number"
                                            required
                                            value={connectionConfig.mqtt_port || 1883}
                                            onChange={(e) => onConnectionConfigChange({
                                                ...connectionConfig,
                                                mqtt_port: parseInt(e.target.value) || 1883
                                            })}
                                            placeholder="1883"
                                            style={{
                                                width: '100%',
                                                padding: '10px',
                                                border: '1px solid #ddd',
                                                borderRadius: '6px'
                                            }}
                                        />
                                    </div>
                                </div>

                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: '1fr 1fr',
                                    gap: '12px',
                                    marginBottom: '12px'
                                }}>
                                    <div>
                                        <label style={{
                                            display: 'block',
                                            marginBottom: '8px',
                                            fontWeight: '500',
                                            fontSize: '14px'
                                        }}>
                                            {t('meters.mqttUsername')} (Optional)
                                        </label>
                                        <input
                                            type="text"
                                            value={connectionConfig.mqtt_username || ''}
                                            onChange={(e) => onConnectionConfigChange({
                                                ...connectionConfig,
                                                mqtt_username: e.target.value
                                            })}
                                            placeholder="Leave empty if no authentication"
                                            style={{
                                                width: '100%',
                                                padding: '10px',
                                                border: '1px solid #ddd',
                                                borderRadius: '6px'
                                            }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{
                                            display: 'block',
                                            marginBottom: '8px',
                                            fontWeight: '500',
                                            fontSize: '14px'
                                        }}>
                                            {t('meters.mqttPassword')} (Optional)
                                        </label>
                                        <input
                                            type="password"
                                            value={connectionConfig.mqtt_password || ''}
                                            onChange={(e) => onConnectionConfigChange({
                                                ...connectionConfig,
                                                mqtt_password: e.target.value
                                            })}
                                            placeholder="Leave empty if no authentication"
                                            style={{
                                                width: '100%',
                                                padding: '10px',
                                                border: '1px solid #ddd',
                                                borderRadius: '6px'
                                            }}
                                        />
                                    </div>
                                </div>

                                <div style={{
                                    backgroundColor: '#e0f2fe',
                                    padding: '10px',
                                    borderRadius: '6px',
                                    marginBottom: '12px',
                                    fontSize: '12px',
                                    color: '#0c4a6e',
                                    border: '1px solid #7dd3fc'
                                }}>
                                    Ã¢â€žÂ¹Ã¯Â¸Â <strong>Authentication is optional.</strong> Leave username and password empty if your MQTT broker doesn't require authentication (allow_anonymous = true). Fill them in if authentication is enabled.
                                </div>

                                <div style={{ marginBottom: '12px' }}>
                                    <label style={{
                                        display: 'block',
                                        marginBottom: '8px',
                                        fontWeight: '500',
                                        fontSize: '14px'
                                    }}>
                                        {t('meters.mqttQos')} *
                                    </label>
                                    <select
                                        value={connectionConfig.mqtt_qos || 1}
                                        onChange={(e) => onConnectionConfigChange({
                                            ...connectionConfig,
                                            mqtt_qos: parseInt(e.target.value)
                                        })}
                                        style={{
                                            width: '100%',
                                            padding: '10px',
                                            border: '1px solid #ddd',
                                            borderRadius: '6px'
                                        }}
                                    >
                                        <option value={0}>{t('meters.mqttQos0')}</option>
                                        <option value={1}>{t('meters.mqttQos1')}</option>
                                        <option value={2}>{t('meters.mqttQos2')}</option>
                                    </select>
                                    <p style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                                        {t('meters.mqttQosHelp')}
                                    </p>
                                </div>

                                <div style={{
                                    backgroundColor: '#fff',
                                    padding: '12px',
                                    borderRadius: '6px',
                                    marginTop: '12px',
                                    fontFamily: 'monospace',
                                    fontSize: '12px',
                                    border: '1px solid #e5e7eb'
                                }}>
                                    <strong>{t('meters.mqttSupportedFormats')}</strong><br /><br />
                                    <strong>Shelly 3EM Format:</strong><br />
                                    {`{ "id": 0, "total_act": 12345.67, "total_act_ret": 678.9 }`}<br /><br />

                                    <strong>Shelly 2PM Format:</strong><br />
                                    {`{ "id": 1, "aenergy": {"total": 170204.016}, "ret_aenergy": {"total": 168518.016} }`}<br /><br />

                                    <strong>{t('meters.mqttFormat1')}</strong><br />
                                    {`{ "device_id": "...", "energy": 123.456, "power": 1500 }`}<br /><br />

                                    <strong>{t('meters.mqttFormat2')}</strong><br />
                                    {`{ "energy": 123.456 }`} {t('common.or')} {`{ "power_kwh": 123.456 }`}<br /><br />

                                    <strong>{t('meters.mqttFormat3')}</strong><br />
                                    123.456
                                </div>
                            </>
                        )}

                        {/* UDP Configuration */}
                        {formData.connection_type === 'udp' && (
                            <>
                                <div style={{
                                    backgroundColor: '#fef3c7',
                                    padding: '12px',
                                    borderRadius: '6px',
                                    marginBottom: '12px',
                                    border: '1px solid #f59e0b',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px'
                                }}>
                                    <AlertCircle size={16} color="#f59e0b" />
                                    <p style={{ fontSize: '13px', color: '#92400e', margin: 0 }}>
                                        <strong>{editingMeter ? t('chargers.existingUuidKeys') : t('meters.udpDeprecatedWarning')}</strong>
                                    </p>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
                                    <div>
                                        <label style={{
                                            display: 'block',
                                            marginBottom: '8px',
                                            fontWeight: '500',
                                            fontSize: '14px'
                                        }}>
                                            {t('meters.listenPort')} *
                                        </label>
                                        <input
                                            type="number"
                                            required
                                            value={connectionConfig.listen_port || 8888}
                                            onChange={(e) => onConnectionConfigChange({
                                                ...connectionConfig,
                                                listen_port: parseInt(e.target.value)
                                            })}
                                            placeholder="8888"
                                            style={{
                                                width: '100%',
                                                padding: '10px',
                                                border: '1px solid #ddd',
                                                borderRadius: '6px'
                                            }}
                                        />
                                        <p style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                                            {t('meters.samePort')}
                                        </p>
                                    </div>
                                    <div>
                                        <label style={{
                                            display: 'block',
                                            marginBottom: '8px',
                                            fontWeight: '500',
                                            fontSize: '14px'
                                        }}>
                                            {t('meters.dataKey')} * (UUID_power_kwh)
                                        </label>
                                        <input
                                            type="text"
                                            required
                                            value={connectionConfig.data_key || ''}
                                            onChange={(e) => onConnectionConfigChange({
                                                ...connectionConfig,
                                                data_key: e.target.value
                                            })}
                                            placeholder="uuid_power_kwh"
                                            style={{
                                                width: '100%',
                                                padding: '10px',
                                                border: '1px solid #ddd',
                                                borderRadius: '6px',
                                                fontFamily: 'monospace',
                                                fontSize: '12px'
                                            }}
                                            readOnly={!editingMeter}
                                        />
                                        <p style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                                            {editingMeter ? t('meters.dataKeyModifiable') : t('meters.dataKeyAutoGenerated')}
                                        </p>
                                    </div>
                                </div>
                                <div style={{
                                    backgroundColor: '#fff',
                                    padding: '12px',
                                    borderRadius: '6px',
                                    marginTop: '12px',
                                    fontFamily: 'monospace',
                                    fontSize: '12px',
                                    border: '1px solid #e5e7eb'
                                }}>
                                    <strong>{t('meters.loxoneConfiguration')}</strong><br />
                                    {t('meters.udpVirtualOutput')} {connectionConfig.listen_port || 8888}<br />
                                    {t('meters.udpCommand')} {"{\""}
                                    <span style={{ color: '#3b82f6', fontWeight: 'bold' }}>
                                        {connectionConfig.data_key || 'YOUR_UUID_power_kwh'}
                                    </span>
                                    {"\": <v>}"}
                                </div>
                            </>
                        )}

                        {/* Modbus TCP Configuration */}
                        {formData.connection_type === 'modbus_tcp' && (
                            <>
                                <div style={{
                                    backgroundColor: '#e0f2fe',
                                    padding: '12px',
                                    borderRadius: '6px',
                                    marginBottom: '12px',
                                    border: '1px solid #0284c7'
                                }}>
                                    <p style={{ fontSize: '13px', color: '#0c4a6e', margin: 0 }}>
                                        <strong>Modbus TCP Configuration</strong><br />
                                        Configure according to your device manual
                                    </p>
                                </div>

                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: '2fr 1fr',
                                    gap: '12px',
                                    marginBottom: '12px'
                                }}>
                                    <div>
                                        <label style={{
                                            display: 'block',
                                            marginBottom: '8px',
                                            fontWeight: '500',
                                            fontSize: '14px'
                                        }}>
                                            {t('meters.ipAddress')} *
                                        </label>
                                        <input
                                            type="text"
                                            required
                                            value={connectionConfig.ip_address || ''}
                                            onChange={(e) => onConnectionConfigChange({
                                                ...connectionConfig,
                                                ip_address: e.target.value
                                            })}
                                            placeholder="192.168.1.100"
                                            style={{
                                                width: '100%',
                                                padding: '10px',
                                                border: '1px solid #ddd',
                                                borderRadius: '6px'
                                            }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{
                                            display: 'block',
                                            marginBottom: '8px',
                                            fontWeight: '500',
                                            fontSize: '14px'
                                        }}>
                                            {t('meters.port')} *
                                        </label>
                                        <input
                                            type="number"
                                            required
                                            value={connectionConfig.port || 502}
                                            onChange={(e) => onConnectionConfigChange({
                                                ...connectionConfig,
                                                port: parseInt(e.target.value)
                                            })}
                                            placeholder="502"
                                            style={{
                                                width: '100%',
                                                padding: '10px',
                                                border: '1px solid #ddd',
                                                borderRadius: '6px'
                                            }}
                                        />
                                    </div>
                                </div>

                                <div style={{ marginBottom: '12px' }}>
                                    <label style={{
                                        display: 'block',
                                        marginBottom: '8px',
                                        fontWeight: '500',
                                        fontSize: '14px'
                                    }}>
                                        Unit ID (Slave ID) *
                                    </label>
                                    <input
                                        type="number"
                                        required
                                        value={connectionConfig.unit_id || 1}
                                        onChange={(e) => onConnectionConfigChange({
                                            ...connectionConfig,
                                            unit_id: parseInt(e.target.value)
                                        })}
                                        placeholder="1"
                                        style={{
                                            width: '100%',
                                            padding: '10px',
                                            border: '1px solid #ddd',
                                            borderRadius: '6px'
                                        }}
                                    />
                                    <p style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                                        Modbus device/slave ID (typically 1-247)
                                    </p>
                                </div>

                                <div style={{ marginBottom: '12px' }}>
                                    <label style={{
                                        display: 'block',
                                        marginBottom: '8px',
                                        fontWeight: '500',
                                        fontSize: '14px'
                                    }}>
                                        Function Code *
                                    </label>
                                    <select
                                        required
                                        value={connectionConfig.function_code || 3}
                                        onChange={(e) => onConnectionConfigChange({
                                            ...connectionConfig,
                                            function_code: parseInt(e.target.value)
                                        })}
                                        style={{
                                            width: '100%',
                                            padding: '10px',
                                            border: '1px solid #ddd',
                                            borderRadius: '6px'
                                        }}
                                    >
                                        <option value={3}>Read Holding Registers (FC03)</option>
                                        <option value={4}>Read Input Registers (FC04)</option>
                                        <option value={1}>Read Coils (FC01)</option>
                                        <option value={2}>Read Discrete Inputs (FC02)</option>
                                    </select>
                                    <p style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                                        Most energy meters use FC03 or FC04
                                    </p>
                                </div>

                                <div style={{ marginBottom: '12px' }}>
                                    <label style={{
                                        display: 'block',
                                        marginBottom: '8px',
                                        fontWeight: '500',
                                        fontSize: '14px'
                                    }}>
                                        Data Type *
                                    </label>
                                    <select
                                        required
                                        value={connectionConfig.data_type || 'float32'}
                                        onChange={(e) => onConnectionConfigChange({
                                            ...connectionConfig,
                                            data_type: e.target.value,
                                            register_count: e.target.value === 'float32' ? 2 : 
                                                           e.target.value === 'float64' ? 4 :
                                                           e.target.value === 'int32' ? 2 : 1
                                        })}
                                        style={{
                                            width: '100%',
                                            padding: '10px',
                                            border: '1px solid #ddd',
                                            borderRadius: '6px'
                                        }}
                                    >
                                        <option value="float32">32-bit Float (2 registers)</option>
                                        <option value="float64">64-bit Float (4 registers)</option>
                                        <option value="int32">32-bit Integer (2 registers)</option>
                                        <option value="int16">16-bit Integer (1 register)</option>
                                        <option value="uint32">32-bit Unsigned (2 registers)</option>
                                        <option value="uint16">16-bit Unsigned (1 register)</option>
                                    </select>
                                    <p style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                                        Most energy meters use 32-bit Float
                                    </p>
                                </div>

                                {/* Import Energy */}
                                <div style={{
                                    backgroundColor: '#f0fdf4',
                                    padding: '12px',
                                    borderRadius: '6px',
                                    marginBottom: '12px',
                                    border: '1px solid #22c55e'
                                }}>
                                    <strong style={{ color: '#15803d' }}>Import Energy</strong>
                                    <div style={{ marginTop: '12px' }}>
                                        <label style={{
                                            display: 'block',
                                            marginBottom: '8px',
                                            fontWeight: '500',
                                            fontSize: '14px'
                                        }}>
                                            Register Address *
                                        </label>
                                        <input
                                            type="number"
                                            required
                                            value={connectionConfig.register_address || 0}
                                            onChange={(e) => onConnectionConfigChange({
                                                ...connectionConfig,
                                                register_address: parseInt(e.target.value)
                                            })}
                                            placeholder="0"
                                            style={{
                                                width: '100%',
                                                padding: '10px',
                                                border: '1px solid #22c55e',
                                                borderRadius: '6px'
                                            }}
                                        />
                                        <p style={{ fontSize: '11px', color: '#15803d', marginTop: '4px' }}>
                                            Starting from 0 (e.g., 40001 → 0)
                                        </p>
                                    </div>
                                </div>

                                {/* Export Energy */}
                                {(formData.meter_type === 'total_meter' || formData.meter_type === 'solar_meter') && (
                                    <div style={{
                                        backgroundColor: '#fef3c7',
                                        padding: '12px',
                                        borderRadius: '6px',
                                        marginBottom: '12px',
                                        border: '1px solid #f59e0b'
                                    }}>
                                        <label style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            cursor: 'pointer'
                                        }}>
                                            <input
                                                type="checkbox"
                                                checked={connectionConfig.has_export_register === true}
                                                onChange={(e) => onConnectionConfigChange({
                                                    ...connectionConfig,
                                                    has_export_register: e.target.checked
                                                })}
                                            />
                                            <strong style={{ color: '#92400e' }}>Export Energy Register</strong>
                                        </label>

                                        {connectionConfig.has_export_register && (
                                            <div style={{ marginTop: '12px' }}>
                                                <label style={{
                                                    display: 'block',
                                                    marginBottom: '8px',
                                                    fontWeight: '500',
                                                    fontSize: '14px'
                                                }}>
                                                    Export Register Address *
                                                </label>
                                                <input
                                                    type="number"
                                                    required={connectionConfig.has_export_register}
                                                    value={connectionConfig.export_register_address || 0}
                                                    onChange={(e) => onConnectionConfigChange({
                                                        ...connectionConfig,
                                                        export_register_address: parseInt(e.target.value)
                                                    })}
                                                    placeholder="0"
                                                    style={{
                                                        width: '100%',
                                                        padding: '10px',
                                                        border: '1px solid #f59e0b',
                                                        borderRadius: '6px'
                                                    }}
                                                />
                                                <p style={{ fontSize: '11px', color: '#92400e', marginTop: '4px' }}>
                                                    Separate register for export/feed-in
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div style={{
                                    backgroundColor: '#fff',
                                    padding: '12px',
                                    borderRadius: '6px',
                                    fontFamily: 'monospace',
                                    fontSize: '12px',
                                    border: '1px solid #e5e7eb'
                                }}>
                                    <strong>Summary:</strong><br />
                                    {connectionConfig.ip_address || '192.168.1.100'}:{connectionConfig.port || 502}<br />
                                    Unit: {connectionConfig.unit_id || 1} | FC{String(connectionConfig.function_code || 3).padStart(2, '0')}<br />
                                    Type: {connectionConfig.data_type || 'float32'}<br />
                                    Import@{connectionConfig.register_address || 0}
                                    {connectionConfig.has_export_register && ` | Export@${connectionConfig.export_register_address || 0}`}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Active Checkbox */}
                    <div style={{ marginTop: '16px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={formData.is_active !== false}
                                onChange={(e) => onFormDataChange({
                                    ...formData,
                                    is_active: e.target.checked
                                })}
                            />
                            <span style={{ fontWeight: '500', fontSize: '14px' }}>
                                {t('meters.activeCollectData')}
                            </span>
                        </label>
                    </div>

                    {/* Notes Field */}
                    <div style={{ marginTop: '16px' }}>
                        <label style={{
                            display: 'block',
                            marginBottom: '8px',
                            fontWeight: '500',
                            fontSize: '14px'
                        }}>
                            {t('common.notes')}
                        </label>
                        <textarea
                            value={formData.notes || ''}
                            onChange={(e) => onFormDataChange({ ...formData, notes: e.target.value })}
                            rows={2}
                            style={{
                                width: '100%',
                                padding: '10px',
                                border: '1px solid #ddd',
                                borderRadius: '6px',
                                fontFamily: 'inherit'
                            }}
                        />
                    </div>

                    {/* Action Buttons */}
                    <div className="button-group" style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                        <button
                            type="submit"
                            style={{
                                flex: 1,
                                padding: '12px',
                                backgroundColor: '#007bff',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '14px',
                                fontWeight: '500',
                                cursor: 'pointer'
                            }}
                        >
                            {editingMeter ? t('common.update') : t('common.create')}
                        </button>
                        <button
                            type="button"
                            onClick={onCancel}
                            style={{
                                flex: 1,
                                padding: '12px',
                                backgroundColor: '#6c757d',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '14px',
                                fontWeight: '500',
                                cursor: 'pointer'
                            }}
                        >
                            {t('common.cancel')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}