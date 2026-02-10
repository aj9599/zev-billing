import { useState, useEffect } from 'react';
import { X, Info, AlertCircle, Wifi, Rss, Cloud, Zap, Check } from 'lucide-react';
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
    // Smart-me configuration
    auth_type?: 'basic' | 'apikey' | 'oauth';
    username?: string;
    password?: string;
    api_key?: string;
    client_id?: string;
    client_secret?: string;
    device_id?: string;
}

interface MeterFormModalProps {
    editingMeter: Meter | null;
    formData: Partial<Meter>;
    connectionConfig: ConnectionConfig;
    buildings: Building[];
    users: User[];
    isTestingConnection: boolean;
    onSubmit: (e: React.FormEvent) => Promise<void>;
    onCancel: () => void;
    onFormDataChange: (data: Partial<Meter>) => void;
    onConnectionConfigChange: (config: ConnectionConfig) => void;
    onConnectionTypeChange: (connectionType: string, meterName: string, buildingName?: string, apartmentUnit?: string) => void;
    onNameChange: (name: string, connectionType: string, buildingName?: string, apartmentUnit?: string) => void;
    onShowInstructions: () => void;
    onTestConnection: () => Promise<void>;
}

// Focus/blur handlers for themed inputs
const focusHandler = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    e.target.style.borderColor = '#667eea';
    e.target.style.boxShadow = '0 0 0 3px rgba(102,126,234,0.1)';
};
const blurHandler = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    e.target.style.borderColor = '#e5e7eb';
    e.target.style.boxShadow = 'none';
};

const inputStyle = (isMobile: boolean, mono?: boolean): React.CSSProperties => ({
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    fontSize: isMobile ? '16px' : '14px',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    outline: 'none',
    backgroundColor: 'white',
    ...(mono ? { fontFamily: 'monospace' } : {})
});

const labelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: '6px',
    fontWeight: '600',
    fontSize: '13px',
    color: '#374151'
};

const helpTextStyle: React.CSSProperties = {
    fontSize: '11px',
    color: '#9ca3af',
    marginTop: '4px',
    lineHeight: '1.4'
};

// Custom checkbox component
function CustomCheckbox({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
    return (
        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
            <div
                onClick={(e) => { e.preventDefault(); onChange(!checked); }}
                style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '6px',
                    border: checked ? '2px solid #667eea' : '2px solid #d1d5db',
                    backgroundColor: checked ? '#667eea' : 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s',
                    flexShrink: 0,
                    cursor: 'pointer'
                }}
            >
                {checked && <Check size={14} color="white" strokeWidth={3} />}
            </div>
            <span style={{ fontWeight: '500', fontSize: '14px', color: '#374151' }}>{label}</span>
        </label>
    );
}

export default function MeterFormModal({
    editingMeter,
    formData,
    connectionConfig,
    buildings,
    users,
    isTestingConnection,
    onSubmit,
    onCancel,
    onFormDataChange,
    onConnectionConfigChange,
    onConnectionTypeChange,
    onNameChange,
    onShowInstructions,
    onTestConnection
}: MeterFormModalProps) {
    const { t } = useTranslation();
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Helper to check if meter type supports export
    const supportsExport = formData.meter_type === 'total_meter' || formData.meter_type === 'solar_meter';

    // Helper to get available modes for current meter type
    const getAvailableModes = () => {
        if (supportsExport) {
            return [
                { value: 'meter_block', label: t('meters.loxoneModeMeterBlock') },
                { value: 'virtual_output_dual', label: t('meters.loxoneModeVirtualOutputDual') }
            ];
        } else {
            return [
                { value: 'energy_meter_block', label: t('meters.loxoneModeEnergyMeterBlock') },
                { value: 'virtual_output_single', label: t('meters.loxoneModeVirtualOutputSingle') }
            ];
        }
    };

    const meterTypes = [
        { value: 'total_meter', label: t('meters.totalMeter') },
        { value: 'solar_meter', label: t('meters.solarMeter') },
        { value: 'apartment_meter', label: t('meters.apartmentMeter') },
        { value: 'heating_meter', label: t('meters.heatingMeter') },
        { value: 'other', label: t('meters.other') }
    ];

    const deviceTypes = [
        { value: 'generic', label: t('meters.deviceTypes.generic') },
        { value: 'whatwatt-go', label: t('meters.deviceTypes.whatwattGo') },
        { value: 'shelly-3em', label: t('meters.deviceTypes.shelly3em') },
        { value: 'shelly-em', label: t('meters.deviceTypes.shellyEm') },
        { value: 'shelly-2pm', label: t('meters.deviceTypes.shelly2pm') },
        { value: 'custom', label: t('meters.deviceTypes.custom') }
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
        <>
        {/* Backdrop */}
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.4)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '15px',
            animation: 'mfm-fadeIn 0.2s ease-out'
        }}>
            <div style={{
                backgroundColor: 'white',
                borderRadius: '16px',
                width: '90%',
                maxWidth: '700px',
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                boxShadow: '0 25px 50px rgba(0,0,0,0.15)',
                animation: 'mfm-slideUp 0.3s ease-out'
            }}>
                {/* Header */}
                <div style={{
                    padding: isMobile ? '16px 20px' : '20px 28px',
                    borderBottom: '1px solid #f3f4f6',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexShrink: 0
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '12px',
                            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                        }}>
                            <Zap size={20} color="white" />
                        </div>
                        <div>
                            <h2 style={{
                                fontSize: isMobile ? '18px' : '20px',
                                fontWeight: '700',
                                color: '#1f2937',
                                margin: 0
                            }}>
                                {editingMeter ? t('meters.editMeter') : t('meters.addMeter')}
                            </h2>
                            <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>
                                {editingMeter ? formData.name || '' : t('meters.subtitle')}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={onShowInstructions}
                            style={{
                                padding: '6px',
                                border: 'none',
                                background: 'none',
                                cursor: 'pointer',
                                color: '#667eea',
                                borderRadius: '8px',
                                transition: 'background-color 0.2s'
                            }}
                            title={t('meters.setupInstructions')}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f5f3ff'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                            <Info size={20} />
                        </button>
                    </div>
                    <button
                        type="button"
                        onClick={onCancel}
                        style={{
                            width: '32px',
                            height: '32px',
                            border: 'none',
                            background: 'none',
                            cursor: 'pointer',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#9ca3af',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#f3f4f6';
                            e.currentTarget.style.color = '#374151';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                            e.currentTarget.style.color = '#9ca3af';
                        }}
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Scrollable Body */}
                <div style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: isMobile ? '16px 20px' : '24px 28px',
                    backgroundColor: '#f9fafb'
                }}>
                    <form id="meter-form" onSubmit={onSubmit}>
                        {/* Basic Info Section */}
                        <div style={{
                            backgroundColor: 'white',
                            borderRadius: '12px',
                            padding: isMobile ? '16px' : '20px',
                            border: '1px solid #e5e7eb',
                            marginBottom: '16px'
                        }}>
                            <h3 style={{
                                fontSize: '14px',
                                fontWeight: '700',
                                color: '#374151',
                                marginBottom: '16px',
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px'
                            }}>
                                {t('common.name')} & {t('meters.meterType')}
                            </h3>

                            {/* Name Field */}
                            <div style={{ marginBottom: '14px' }}>
                                <label style={labelStyle}>
                                    {t('common.name')} *
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={formData.name || ''}
                                    onChange={(e) => handleNameChange(e.target.value)}
                                    onFocus={focusHandler}
                                    onBlur={blurHandler}
                                    style={inputStyle(isMobile)}
                                />
                            </div>

                            {/* Meter Type */}
                            <div style={{ marginBottom: '14px' }}>
                                <label style={labelStyle}>
                                    {t('meters.meterType')} *
                                </label>
                                <select
                                    required
                                    value={formData.meter_type || 'total_meter'}
                                    onChange={(e) => onFormDataChange({ ...formData, meter_type: e.target.value })}
                                    onFocus={focusHandler}
                                    onBlur={blurHandler}
                                    style={inputStyle(isMobile)}
                                >
                                    {meterTypes.map(mt => (
                                        <option key={mt.value} value={mt.value}>{mt.label}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Building */}
                            <div>
                                <label style={labelStyle}>
                                    {t('users.building')} *
                                </label>
                                <select
                                    required
                                    value={formData.building_id || 0}
                                    onChange={(e) => {
                                        const newBuildingId = parseInt(e.target.value);
                                        onFormDataChange({ ...formData, building_id: newBuildingId });
                                        if (formData.connection_type === 'mqtt' && formData.name) {
                                            const building = buildings.find(b => b.id === newBuildingId);
                                            onConnectionTypeChange('mqtt', formData.name, building?.name, formData.apartment_unit);
                                        }
                                    }}
                                    onFocus={focusHandler}
                                    onBlur={blurHandler}
                                    style={inputStyle(isMobile)}
                                >
                                    <option value={0}>{t('users.selectBuilding')}</option>
                                    {buildings.map(b => (
                                        <option key={b.id} value={b.id}>{b.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Apartment Section (only for apartment meters) */}
                        {formData.meter_type === 'apartment_meter' && (
                            <div style={{
                                backgroundColor: 'white',
                                borderRadius: '12px',
                                padding: isMobile ? '16px' : '20px',
                                border: '1px solid #e5e7eb',
                                marginBottom: '16px'
                            }}>
                                <h3 style={{
                                    fontSize: '14px',
                                    fontWeight: '700',
                                    color: '#374151',
                                    marginBottom: '16px',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.5px'
                                }}>
                                    {t('meters.apartmentUnit')}
                                </h3>

                                {(() => {
                                    const selectedBuilding = buildings.find(b => b.id === formData.building_id);
                                    const hasApartments = selectedBuilding?.has_apartments && selectedBuilding?.floors_config && selectedBuilding.floors_config.length > 0;
                                    const allApartments = hasApartments
                                        ? selectedBuilding!.floors_config!.flatMap(floor =>
                                            floor.apartments.map(apt => `${floor.floor_name} - ${apt}`)
                                        )
                                        : [];

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
                                                <div style={{ marginBottom: '14px' }}>
                                                    <label style={labelStyle}>
                                                        {t('meters.apartmentUnit')} *
                                                    </label>
                                                    <select
                                                        required
                                                        value={formData.apartment_unit || ''}
                                                        onChange={(e) => {
                                                            const selectedApt = e.target.value;
                                                            const aptUser = users.find(u =>
                                                                u.building_id === formData.building_id &&
                                                                u.apartment_unit === selectedApt &&
                                                                u.is_active
                                                            );
                                                            onFormDataChange({
                                                                ...formData,
                                                                apartment_unit: selectedApt,
                                                                user_id: aptUser ? aptUser.id : undefined
                                                            });
                                                            if (formData.connection_type === 'mqtt' && formData.name) {
                                                                const building = buildings.find(b => b.id === formData.building_id);
                                                                onConnectionTypeChange('mqtt', formData.name, building?.name, selectedApt);
                                                            }
                                                        }}
                                                        onFocus={focusHandler}
                                                        onBlur={blurHandler}
                                                        style={inputStyle(isMobile)}
                                                    >
                                                        <option value="">{t('meters.selectApartment')}</option>
                                                        {allApartments.map((apt, idx) => (
                                                            <option key={idx} value={apt}>{apt}</option>
                                                        ))}
                                                    </select>
                                                    <p style={helpTextStyle}>
                                                        {t('meters.apartmentHelpText')}
                                                    </p>
                                                </div>
                                            )}

                                            {formData.apartment_unit && (
                                                <div>
                                                    <label style={labelStyle}>
                                                        {t('meters.linkedUser')}
                                                    </label>
                                                    {linkedUser ? (
                                                        <div style={{
                                                            padding: '12px',
                                                            backgroundColor: '#f0f9ff',
                                                            border: '2px solid #667eea',
                                                            borderRadius: '10px',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '10px'
                                                        }}>
                                                            <div style={{
                                                                width: '36px',
                                                                height: '36px',
                                                                borderRadius: '50%',
                                                                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                                                color: 'white',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                fontWeight: '600',
                                                                fontSize: '14px',
                                                                flexShrink: 0
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
                                                                padding: '4px 10px',
                                                                backgroundColor: '#10b981',
                                                                color: 'white',
                                                                borderRadius: '12px',
                                                                fontSize: '11px',
                                                                fontWeight: '600'
                                                            }}>
                                                                ✓ {t('common.active')}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div style={{
                                                            padding: '12px',
                                                            backgroundColor: '#fffbeb',
                                                            border: '1px solid #f59e0b',
                                                            borderRadius: '10px',
                                                            color: '#92400e',
                                                            fontSize: '13px',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '8px'
                                                        }}>
                                                            <AlertCircle size={16} color="#f59e0b" />
                                                            {t('meters.noUserLinked')}
                                                        </div>
                                                    )}
                                                    <p style={helpTextStyle}>
                                                        {t('meters.userOptionalHelpText')}
                                                    </p>
                                                </div>
                                            )}

                                            {!formData.apartment_unit && hasApartments && (
                                                <div style={{
                                                    padding: '12px',
                                                    backgroundColor: '#f3f4f6',
                                                    borderRadius: '10px',
                                                    color: '#6b7280',
                                                    fontSize: '13px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '8px'
                                                }}>
                                                    <Info size={16} />
                                                    {t('meters.apartmentNotSelected')}
                                                </div>
                                            )}
                                        </>
                                    );
                                })()}
                            </div>
                        )}

                        {/* Connection Type Section */}
                        <div style={{
                            backgroundColor: 'white',
                            borderRadius: '12px',
                            padding: isMobile ? '16px' : '20px',
                            border: '1px solid #e5e7eb',
                            marginBottom: '16px'
                        }}>
                            <h3 style={{
                                fontSize: '14px',
                                fontWeight: '700',
                                color: '#374151',
                                marginBottom: '16px',
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px'
                            }}>
                                {t('meters.connectionType')}
                            </h3>

                            <div style={{ marginBottom: '14px' }}>
                                <label style={labelStyle}>
                                    {t('meters.connectionType')} *
                                </label>
                                <select
                                    required
                                    value={formData.connection_type || 'loxone_api'}
                                    onChange={(e) => handleConnectionTypeChange(e.target.value)}
                                    onFocus={focusHandler}
                                    onBlur={blurHandler}
                                    style={inputStyle(isMobile)}
                                >
                                    <option value="loxone_api">{t('meters.loxoneApiRecommended')}</option>
                                    <option value="smartme">{t('meters.smartmeApi')}</option>
                                    <option value="mqtt">{t('meters.mqttProtocol')}</option>
                                    <option value="udp">{t('meters.udpAlternative')}</option>
                                    <option value="modbus_tcp">{t('meters.modbusTcp')}</option>
                                </select>
                            </div>
                        </div>

                        {/* Connection Configuration Section */}
                        <div style={{
                            backgroundColor: 'white',
                            borderRadius: '12px',
                            padding: isMobile ? '16px' : '20px',
                            border: '1px solid #e5e7eb',
                            marginBottom: '16px'
                        }}>
                            <h3 style={{
                                fontSize: '14px',
                                fontWeight: '700',
                                color: '#374151',
                                marginBottom: '16px',
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px'
                            }}>
                                {t('meters.connectionConfig')}
                            </h3>

                            {/* ===== Loxone API Configuration ===== */}
                            {formData.connection_type === 'loxone_api' && (
                                <>
                                    <div style={{
                                        backgroundColor: '#f0fdf4',
                                        padding: '12px 14px',
                                        borderRadius: '10px',
                                        marginBottom: '16px',
                                        border: '1px solid #bbf7d0',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px'
                                    }}>
                                        <Wifi size={18} color="#10b981" />
                                        <p style={{ fontSize: '13px', color: '#065f46', margin: 0, fontWeight: '500' }}>
                                            {t('meters.loxoneApiDescription')}
                                        </p>
                                    </div>

                                    {/* Connection Mode */}
                                    <div style={{ marginBottom: '14px' }}>
                                        <label style={labelStyle}>
                                            {t('meters.loxoneConnectionMode')} *
                                        </label>
                                        <select
                                            required
                                            value={connectionConfig.loxone_connection_mode || 'local'}
                                            onChange={(e) => onConnectionConfigChange({
                                                ...connectionConfig,
                                                loxone_connection_mode: e.target.value as 'local' | 'remote'
                                            })}
                                            onFocus={focusHandler}
                                            onBlur={blurHandler}
                                            style={inputStyle(isMobile)}
                                        >
                                            <option value="local">{t('meters.loxoneConnectionModeLocal')}</option>
                                            <option value="remote">{t('meters.loxoneConnectionModeRemote')}</option>
                                        </select>
                                        <p style={helpTextStyle}>
                                            {connectionConfig.loxone_connection_mode === 'remote'
                                                ? t('meters.loxoneConnectionModeRemoteHelp')
                                                : t('meters.loxoneConnectionModeLocalHelp')}
                                        </p>
                                    </div>

                                    {/* Remote: MAC Address / Local: IP Address */}
                                    {connectionConfig.loxone_connection_mode === 'remote' ? (
                                        <div style={{ marginBottom: '14px' }}>
                                            <label style={labelStyle}>
                                                {t('meters.loxoneMacAddress')} *
                                            </label>
                                            <input
                                                type="text"
                                                required
                                                value={connectionConfig.loxone_mac_address || ''}
                                                onChange={(e) => {
                                                    const cleaned = e.target.value.toUpperCase().replace(/[^0-9A-F]/g, '');
                                                    onConnectionConfigChange({
                                                        ...connectionConfig,
                                                        loxone_mac_address: cleaned
                                                    });
                                                }}
                                                placeholder="504F94XXXXXX"
                                                maxLength={12}
                                                onFocus={focusHandler}
                                                onBlur={blurHandler}
                                                style={{ ...inputStyle(isMobile, true), textTransform: 'uppercase' }}
                                            />
                                            <p style={helpTextStyle}>
                                                {t('meters.loxoneMacAddressHelp')}
                                            </p>
                                            <div style={{
                                                backgroundColor: '#fffbeb',
                                                padding: '12px',
                                                borderRadius: '8px',
                                                marginTop: '8px',
                                                border: '1px solid #fde68a'
                                            }}>
                                                <p style={{ fontSize: '12px', color: '#92400e', margin: 0 }}>
                                                    <strong>ℹ️ {t('meters.loxoneCloudDnsTitle')}</strong><br />
                                                    {t('meters.loxoneCloudDnsDescription')}
                                                    <br /><br />
                                                    <strong>{t('meters.loxoneMacAddressLocationTitle')}:</strong><br />
                                                    {t('meters.loxoneMacAddressLocation')}
                                                </p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ marginBottom: '14px' }}>
                                            <label style={labelStyle}>
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
                                                onFocus={focusHandler}
                                                onBlur={blurHandler}
                                                style={inputStyle(isMobile)}
                                            />
                                            <p style={helpTextStyle}>
                                                {t('meters.loxoneHostDescription')}
                                            </p>
                                        </div>
                                    )}

                                    {/* Loxone Mode */}
                                    <div style={{ marginBottom: '14px' }}>
                                        <label style={labelStyle}>
                                            {t('meters.loxoneMode')} *
                                        </label>
                                        <select
                                            required
                                            value={connectionConfig.loxone_mode || (supportsExport ? 'meter_block' : 'energy_meter_block')}
                                            onChange={(e) => onConnectionConfigChange({
                                                ...connectionConfig,
                                                loxone_mode: e.target.value as any
                                            })}
                                            onFocus={focusHandler}
                                            onBlur={blurHandler}
                                            style={inputStyle(isMobile)}
                                        >
                                            {getAvailableModes().map(mode => (
                                                <option key={mode.value} value={mode.value}>{mode.label}</option>
                                            ))}
                                        </select>
                                        <p style={helpTextStyle}>
                                            {connectionConfig.loxone_mode === 'meter_block' && t('meters.loxoneModeMeterBlockHelp')}
                                            {connectionConfig.loxone_mode === 'energy_meter_block' && t('meters.loxoneModeEnergyMeterBlockHelp')}
                                            {connectionConfig.loxone_mode === 'virtual_output_dual' && t('meters.loxoneModeVirtualOutputDualHelp')}
                                            {connectionConfig.loxone_mode === 'virtual_output_single' && t('meters.loxoneModeVirtualOutputSingleHelp')}
                                        </p>
                                    </div>

                                    {/* Device UUID */}
                                    <div style={{ marginBottom: '14px' }}>
                                        <label style={labelStyle}>
                                            {connectionConfig.loxone_mode === 'meter_block'
                                                ? t('meters.loxoneMeterUuid')
                                                : connectionConfig.loxone_mode === 'energy_meter_block'
                                                    ? t('meters.loxoneEnergyMeterUuid')
                                                    : connectionConfig.loxone_mode === 'virtual_output_dual'
                                                        ? t('meters.loxoneDeviceUuidImport')
                                                        : t('meters.loxoneVirtualOutputUuid')
                                            } *
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
                                            onFocus={focusHandler}
                                            onBlur={blurHandler}
                                            style={inputStyle(isMobile, true)}
                                        />
                                        <p style={helpTextStyle}>
                                            {supportsExport && connectionConfig.loxone_mode === 'meter_block'
                                                ? t('meters.loxoneMeterUuidDescription')
                                                : t('meters.loxoneDeviceIdDescription')}
                                        </p>
                                    </div>

                                    {/* Export UUID for virtual_output_dual */}
                                    {connectionConfig.loxone_mode === 'virtual_output_dual' && (
                                        <div style={{ marginBottom: '14px' }}>
                                            <label style={labelStyle}>
                                                {t('meters.loxoneDeviceUuidExport')} *
                                            </label>
                                            <input
                                                type="text"
                                                required
                                                value={connectionConfig.loxone_export_device_id || ''}
                                                onChange={(e) => onConnectionConfigChange({
                                                    ...connectionConfig,
                                                    loxone_export_device_id: e.target.value
                                                })}
                                                placeholder="1fa3ef88-035e-7e1b-ffffed57184a04d2"
                                                onFocus={focusHandler}
                                                onBlur={blurHandler}
                                                style={inputStyle(isMobile, true)}
                                            />
                                            <p style={helpTextStyle}>
                                                {t('meters.loxoneExportUuidDescription')}
                                            </p>
                                        </div>
                                    )}

                                    {/* Credentials */}
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                                        gap: '12px',
                                        marginBottom: '14px'
                                    }}>
                                        <div>
                                            <label style={labelStyle}>
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
                                                onFocus={focusHandler}
                                                onBlur={blurHandler}
                                                style={inputStyle(isMobile)}
                                            />
                                        </div>
                                        <div>
                                            <label style={labelStyle}>
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
                                                placeholder="••••••••"
                                                onFocus={focusHandler}
                                                onBlur={blurHandler}
                                                style={inputStyle(isMobile)}
                                            />
                                        </div>
                                    </div>
                                    <p style={{ ...helpTextStyle, marginBottom: '14px' }}>
                                        {t('meters.loxoneCredentialsDescription')}
                                    </p>

                                    {/* Setup Guide */}
                                    <div style={{
                                        backgroundColor: '#f9fafb',
                                        padding: '14px',
                                        borderRadius: '10px',
                                        fontFamily: 'monospace',
                                        fontSize: '12px',
                                        border: '1px solid #e5e7eb',
                                        lineHeight: '1.6'
                                    }}>
                                        <strong>{t('meters.loxoneSetupGuide')}</strong><br />
                                        {t('meters.loxoneSetupStep1')}<br />
                                        {t('meters.loxoneSetupStep2')}<br />
                                        {t('meters.loxoneSetupStep3')}<br />
                                        {t('meters.loxoneSetupStep4')}<br /><br />
                                        <div style={{
                                            backgroundColor: '#f0fdf4',
                                            padding: '10px',
                                            borderRadius: '8px',
                                            fontSize: '11px',
                                            color: '#065f46'
                                        }}>
                                            <strong>{t('meters.loxoneFeatures')}</strong><br />
                                            {t('meters.loxoneFeature1')}<br />
                                            {t('meters.loxoneFeature2')}<br />
                                            {t('meters.loxoneFeature3')}
                                            {supportsExport && <><br />✓ Import/Export tracking with meter blocks or virtual outputs</>}
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* ===== Smart-me API Configuration ===== */}
                            {formData.connection_type === 'smartme' && (
                                <>
                                    <div style={{
                                        backgroundColor: '#eff6ff',
                                        padding: '12px 14px',
                                        borderRadius: '10px',
                                        marginBottom: '16px',
                                        border: '1px solid #bfdbfe',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px'
                                    }}>
                                        <Cloud size={18} color="#3b82f6" />
                                        <p style={{ fontSize: '13px', color: '#1e40af', margin: 0, fontWeight: '500' }}>
                                            {t('meters.smartmeApiDescription')}
                                        </p>
                                    </div>

                                    {/* Auth Type */}
                                    <div style={{ marginBottom: '14px' }}>
                                        <label style={labelStyle}>
                                            {t('meters.smartmeAuthType')} *
                                        </label>
                                        <select
                                            required
                                            value={connectionConfig.auth_type || 'apikey'}
                                            onChange={(e) => onConnectionConfigChange({
                                                ...connectionConfig,
                                                auth_type: e.target.value as 'basic' | 'apikey' | 'oauth'
                                            })}
                                            onFocus={focusHandler}
                                            onBlur={blurHandler}
                                            style={inputStyle(isMobile)}
                                        >
                                            <option value="apikey">{t('meters.smartmeAuthApiKey')}</option>
                                            <option value="basic">{t('meters.smartmeAuthBasic')}</option>
                                            <option value="oauth">{t('meters.smartmeAuthOAuth')}</option>
                                        </select>
                                        <p style={helpTextStyle}>
                                            {t('meters.smartmeAuthTypeHelp')}
                                        </p>
                                    </div>

                                    {/* API Key Auth */}
                                    {connectionConfig.auth_type === 'apikey' && (
                                        <div style={{ marginBottom: '14px' }}>
                                            <label style={labelStyle}>
                                                {t('meters.smartmeApiKey')} *
                                            </label>
                                            <input
                                                type="text"
                                                required
                                                value={connectionConfig.api_key || ''}
                                                onChange={(e) => onConnectionConfigChange({
                                                    ...connectionConfig,
                                                    api_key: e.target.value
                                                })}
                                                placeholder="MTRH5eUjFXV8U4i1viZF2jHNoUNsnDTx"
                                                onFocus={focusHandler}
                                                onBlur={blurHandler}
                                                style={inputStyle(isMobile, true)}
                                            />
                                            <p style={helpTextStyle}>
                                                {t('meters.smartmeApiKeyHelp')}
                                            </p>
                                        </div>
                                    )}

                                    {/* Basic Auth */}
                                    {connectionConfig.auth_type === 'basic' && (
                                        <div style={{
                                            display: 'grid',
                                            gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                                            gap: '12px',
                                            marginBottom: '14px'
                                        }}>
                                            <div>
                                                <label style={labelStyle}>
                                                    {t('meters.smartmeUsername')} *
                                                </label>
                                                <input
                                                    type="text"
                                                    required
                                                    value={connectionConfig.username || ''}
                                                    onChange={(e) => onConnectionConfigChange({
                                                        ...connectionConfig,
                                                        username: e.target.value
                                                    })}
                                                    placeholder="user@example.com"
                                                    onFocus={focusHandler}
                                                    onBlur={blurHandler}
                                                    style={inputStyle(isMobile)}
                                                />
                                            </div>
                                            <div>
                                                <label style={labelStyle}>
                                                    {t('meters.smartmePassword')} *
                                                </label>
                                                <input
                                                    type="password"
                                                    required
                                                    value={connectionConfig.password || ''}
                                                    onChange={(e) => onConnectionConfigChange({
                                                        ...connectionConfig,
                                                        password: e.target.value
                                                    })}
                                                    placeholder="••••••••"
                                                    onFocus={focusHandler}
                                                    onBlur={blurHandler}
                                                    style={inputStyle(isMobile)}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* OAuth Auth */}
                                    {connectionConfig.auth_type === 'oauth' && (
                                        <div style={{
                                            display: 'grid',
                                            gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                                            gap: '12px',
                                            marginBottom: '14px'
                                        }}>
                                            <div>
                                                <label style={labelStyle}>
                                                    {t('meters.smartmeClientId')} *
                                                </label>
                                                <input
                                                    type="text"
                                                    required
                                                    value={connectionConfig.client_id || ''}
                                                    onChange={(e) => onConnectionConfigChange({
                                                        ...connectionConfig,
                                                        client_id: e.target.value
                                                    })}
                                                    placeholder="client_id_1234567890"
                                                    onFocus={focusHandler}
                                                    onBlur={blurHandler}
                                                    style={inputStyle(isMobile, true)}
                                                />
                                            </div>
                                            <div>
                                                <label style={labelStyle}>
                                                    {t('meters.smartmeClientSecret')} *
                                                </label>
                                                <input
                                                    type="password"
                                                    required
                                                    value={connectionConfig.client_secret || ''}
                                                    onChange={(e) => onConnectionConfigChange({
                                                        ...connectionConfig,
                                                        client_secret: e.target.value
                                                    })}
                                                    placeholder="••••••••"
                                                    onFocus={focusHandler}
                                                    onBlur={blurHandler}
                                                    style={inputStyle(isMobile, true)}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* Device ID */}
                                    <div style={{ marginBottom: '14px' }}>
                                        <label style={labelStyle}>
                                            {t('meters.smartmeDeviceId')} *
                                        </label>
                                        <input
                                            type="text"
                                            required
                                            value={connectionConfig.device_id || ''}
                                            onChange={(e) => onConnectionConfigChange({
                                                ...connectionConfig,
                                                device_id: e.target.value
                                            })}
                                            placeholder="6a7fae30-c598-4778-8f1f-a14620550274"
                                            onFocus={focusHandler}
                                            onBlur={blurHandler}
                                            style={inputStyle(isMobile, true)}
                                        />
                                        <p style={helpTextStyle}>
                                            {t('meters.smartmeDeviceIdHelp')}
                                        </p>
                                    </div>

                                    {/* Test Connection */}
                                    <div style={{ marginBottom: '14px' }}>
                                        <button
                                            type="button"
                                            onClick={onTestConnection}
                                            disabled={isTestingConnection || !connectionConfig.device_id}
                                            style={{
                                                width: '100%',
                                                padding: '12px',
                                                background: isTestingConnection ? '#6b7280' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '10px',
                                                fontSize: '14px',
                                                fontWeight: '600',
                                                cursor: isTestingConnection || !connectionConfig.device_id ? 'not-allowed' : 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '8px',
                                                opacity: isTestingConnection || !connectionConfig.device_id ? 0.6 : 1,
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            {isTestingConnection ? (
                                                <>
                                                    <div style={{
                                                        width: '16px',
                                                        height: '16px',
                                                        border: '2px solid white',
                                                        borderTopColor: 'transparent',
                                                        borderRadius: '50%',
                                                        animation: 'mfm-spin 1s linear infinite'
                                                    }} />
                                                    {t('meters.testingConnection')}
                                                </>
                                            ) : (
                                                <>
                                                    <Wifi size={16} />
                                                    {t('meters.testConnection')}
                                                </>
                                            )}
                                        </button>
                                        <p style={{ ...helpTextStyle, textAlign: 'center' }}>
                                            {t('meters.testConnectionHelp')}
                                        </p>
                                    </div>

                                    {/* Setup Guide */}
                                    <div style={{
                                        backgroundColor: '#f9fafb',
                                        padding: '14px',
                                        borderRadius: '10px',
                                        fontFamily: 'monospace',
                                        fontSize: '12px',
                                        border: '1px solid #e5e7eb',
                                        lineHeight: '1.6'
                                    }}>
                                        <strong>{t('meters.smartmeSetupGuide')}</strong><br />
                                        {t('meters.smartmeSetupStep1')}<br />
                                        {t('meters.smartmeSetupStep2')}<br />
                                        {t('meters.smartmeSetupStep3')}<br />
                                        {t('meters.smartmeSetupStep4')}<br /><br />
                                        <div style={{
                                            backgroundColor: '#eff6ff',
                                            padding: '10px',
                                            borderRadius: '8px',
                                            fontSize: '11px',
                                            color: '#1e40af'
                                        }}>
                                            <strong>{t('meters.smartmeFeatures')}</strong><br />
                                            {t('meters.smartmeFeature1')}<br />
                                            {t('meters.smartmeFeature2')}<br />
                                            {t('meters.smartmeFeature3')}
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* ===== MQTT Configuration ===== */}
                            {formData.connection_type === 'mqtt' && (
                                <>
                                    <div style={{
                                        backgroundColor: '#faf5ff',
                                        padding: '12px 14px',
                                        borderRadius: '10px',
                                        marginBottom: '16px',
                                        border: '1px solid #e9d5ff',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px'
                                    }}>
                                        <Rss size={18} color="#8b5cf6" />
                                        <p style={{ fontSize: '13px', color: '#5b21b6', margin: 0, fontWeight: '500' }}>
                                            {t('meters.mqttProtocolDescription')}
                                        </p>
                                    </div>

                                    {/* Device Type */}
                                    <div style={{ marginBottom: '14px' }}>
                                        <label style={labelStyle}>
                                            {t('meters.deviceType')} *
                                        </label>
                                        <select
                                            required
                                            value={formData.device_type || 'generic'}
                                            onChange={(e) => handleDeviceTypeChange(e.target.value)}
                                            onFocus={focusHandler}
                                            onBlur={blurHandler}
                                            style={inputStyle(isMobile)}
                                        >
                                            {deviceTypes.map(dt => (
                                                <option key={dt.value} value={dt.value}>{dt.label}</option>
                                            ))}
                                        </select>
                                        <p style={helpTextStyle}>
                                            {t('meters.deviceTypeHelp')}
                                        </p>
                                    </div>

                                    {/* MQTT Topic */}
                                    <div style={{ marginBottom: '14px' }}>
                                        <label style={labelStyle}>
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
                                            onFocus={focusHandler}
                                            onBlur={blurHandler}
                                            style={inputStyle(isMobile, true)}
                                        />
                                        <p style={helpTextStyle}>
                                            {editingMeter
                                                ? t('meters.mqttTopicHelpEdit')
                                                : t('meters.mqttTopicHelpNew')}
                                        </p>
                                    </div>

                                    {/* Broker + Port */}
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr',
                                        gap: '12px',
                                        marginBottom: '14px'
                                    }}>
                                        <div>
                                            <label style={labelStyle}>
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
                                                onFocus={focusHandler}
                                                onBlur={blurHandler}
                                                style={inputStyle(isMobile)}
                                            />
                                        </div>
                                        <div>
                                            <label style={labelStyle}>
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
                                                onFocus={focusHandler}
                                                onBlur={blurHandler}
                                                style={inputStyle(isMobile)}
                                            />
                                        </div>
                                    </div>

                                    {/* MQTT Credentials */}
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                                        gap: '12px',
                                        marginBottom: '14px'
                                    }}>
                                        <div>
                                            <label style={labelStyle}>
                                                {t('meters.mqttUsername')} ({t('common.optional')})
                                            </label>
                                            <input
                                                type="text"
                                                value={connectionConfig.mqtt_username || ''}
                                                onChange={(e) => onConnectionConfigChange({
                                                    ...connectionConfig,
                                                    mqtt_username: e.target.value
                                                })}
                                                placeholder={t('meters.mqttAuthPlaceholder')}
                                                onFocus={focusHandler}
                                                onBlur={blurHandler}
                                                style={inputStyle(isMobile)}
                                            />
                                        </div>
                                        <div>
                                            <label style={labelStyle}>
                                                {t('meters.mqttPassword')} ({t('common.optional')})
                                            </label>
                                            <input
                                                type="password"
                                                value={connectionConfig.mqtt_password || ''}
                                                onChange={(e) => onConnectionConfigChange({
                                                    ...connectionConfig,
                                                    mqtt_password: e.target.value
                                                })}
                                                placeholder={t('meters.mqttAuthPlaceholder')}
                                                onFocus={focusHandler}
                                                onBlur={blurHandler}
                                                style={inputStyle(isMobile)}
                                            />
                                        </div>
                                    </div>

                                    <div style={{
                                        backgroundColor: '#eff6ff',
                                        padding: '10px 14px',
                                        borderRadius: '8px',
                                        marginBottom: '14px',
                                        fontSize: '12px',
                                        color: '#1e40af',
                                        border: '1px solid #bfdbfe'
                                    }}>
                                        ℹ️ <strong>{t('meters.mqttAuthInfo')}</strong> {t('meters.mqttAuthDescription')}
                                    </div>

                                    {/* QoS */}
                                    <div style={{ marginBottom: '14px' }}>
                                        <label style={labelStyle}>
                                            {t('meters.mqttQos')} *
                                        </label>
                                        <select
                                            value={connectionConfig.mqtt_qos || 1}
                                            onChange={(e) => onConnectionConfigChange({
                                                ...connectionConfig,
                                                mqtt_qos: parseInt(e.target.value)
                                            })}
                                            onFocus={focusHandler}
                                            onBlur={blurHandler}
                                            style={inputStyle(isMobile)}
                                        >
                                            <option value={0}>{t('meters.mqttQos0')}</option>
                                            <option value={1}>{t('meters.mqttQos1')}</option>
                                            <option value={2}>{t('meters.mqttQos2')}</option>
                                        </select>
                                        <p style={helpTextStyle}>
                                            {t('meters.mqttQosHelp')}
                                        </p>
                                    </div>

                                    {/* Supported Formats */}
                                    <div style={{
                                        backgroundColor: '#f9fafb',
                                        padding: '14px',
                                        borderRadius: '10px',
                                        fontFamily: 'monospace',
                                        fontSize: '12px',
                                        border: '1px solid #e5e7eb',
                                        lineHeight: '1.6'
                                    }}>
                                        <strong>{t('meters.mqttSupportedFormats')}</strong><br /><br />
                                        <strong>{t('meters.mqttShellyFormat')}:</strong><br />
                                        {`{ "id": 0, "total_act": 12345.67, "total_act_ret": 678.9 }`}<br /><br />

                                        <strong>{t('meters.mqttShelly2pmFormat')}:</strong><br />
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

                            {/* ===== UDP Configuration ===== */}
                            {formData.connection_type === 'udp' && (
                                <>
                                    <div style={{
                                        backgroundColor: '#fffbeb',
                                        padding: '12px 14px',
                                        borderRadius: '10px',
                                        marginBottom: '16px',
                                        border: '1px solid #fde68a',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px'
                                    }}>
                                        <AlertCircle size={18} color="#f59e0b" />
                                        <p style={{ fontSize: '13px', color: '#92400e', margin: 0, fontWeight: '500' }}>
                                            {editingMeter ? t('chargers.existingUuidKeys') : t('meters.udpDeprecatedWarning')}
                                        </p>
                                    </div>

                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: isMobile ? '1fr' : '1fr 2fr',
                                        gap: '12px',
                                        marginBottom: '14px'
                                    }}>
                                        <div>
                                            <label style={labelStyle}>
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
                                                onFocus={focusHandler}
                                                onBlur={blurHandler}
                                                style={inputStyle(isMobile)}
                                            />
                                            <p style={helpTextStyle}>
                                                {t('meters.samePort')}
                                            </p>
                                        </div>
                                        <div>
                                            <label style={labelStyle}>
                                                {t('meters.dataKey')} * ({t('meters.uuidPowerKwh')})
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
                                                readOnly={!editingMeter}
                                                onFocus={focusHandler}
                                                onBlur={blurHandler}
                                                style={{ ...inputStyle(isMobile, true), fontSize: '12px' }}
                                            />
                                            <p style={helpTextStyle}>
                                                {editingMeter ? t('meters.dataKeyModifiable') : t('meters.dataKeyAutoGenerated')}
                                            </p>
                                        </div>
                                    </div>

                                    <div style={{
                                        backgroundColor: '#f9fafb',
                                        padding: '14px',
                                        borderRadius: '10px',
                                        fontFamily: 'monospace',
                                        fontSize: '12px',
                                        border: '1px solid #e5e7eb',
                                        lineHeight: '1.6'
                                    }}>
                                        <strong>{t('meters.loxoneConfiguration')}</strong><br />
                                        {t('meters.udpVirtualOutput')} {connectionConfig.listen_port || 8888}<br />
                                        {t('meters.udpCommand')} {"{\""}
                                        <span style={{ color: '#667eea', fontWeight: 'bold' }}>
                                            {connectionConfig.data_key || 'YOUR_UUID_power_kwh'}
                                        </span>
                                        {"\": <v>}"}
                                    </div>
                                </>
                            )}

                            {/* ===== Modbus TCP Configuration ===== */}
                            {formData.connection_type === 'modbus_tcp' && (
                                <>
                                    <div style={{
                                        backgroundColor: '#eff6ff',
                                        padding: '12px 14px',
                                        borderRadius: '10px',
                                        marginBottom: '16px',
                                        border: '1px solid #bfdbfe'
                                    }}>
                                        <p style={{ fontSize: '13px', color: '#1e40af', margin: 0 }}>
                                            <strong>{t('meters.modbusConfigTitle')}</strong><br />
                                            {t('meters.modbusConfigDescription')}
                                        </p>
                                    </div>

                                    {/* IP + Port */}
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr',
                                        gap: '12px',
                                        marginBottom: '14px'
                                    }}>
                                        <div>
                                            <label style={labelStyle}>
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
                                                onFocus={focusHandler}
                                                onBlur={blurHandler}
                                                style={inputStyle(isMobile)}
                                            />
                                        </div>
                                        <div>
                                            <label style={labelStyle}>
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
                                                onFocus={focusHandler}
                                                onBlur={blurHandler}
                                                style={inputStyle(isMobile)}
                                            />
                                        </div>
                                    </div>

                                    {/* Unit ID */}
                                    <div style={{ marginBottom: '14px' }}>
                                        <label style={labelStyle}>
                                            {t('meters.modbusUnitId')} *
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
                                            onFocus={focusHandler}
                                            onBlur={blurHandler}
                                            style={inputStyle(isMobile)}
                                        />
                                        <p style={helpTextStyle}>
                                            {t('meters.modbusUnitIdHelp')}
                                        </p>
                                    </div>

                                    {/* Function Code */}
                                    <div style={{ marginBottom: '14px' }}>
                                        <label style={labelStyle}>
                                            {t('meters.modbusFunctionCode')} *
                                        </label>
                                        <select
                                            required
                                            value={connectionConfig.function_code || 3}
                                            onChange={(e) => onConnectionConfigChange({
                                                ...connectionConfig,
                                                function_code: parseInt(e.target.value)
                                            })}
                                            onFocus={focusHandler}
                                            onBlur={blurHandler}
                                            style={inputStyle(isMobile)}
                                        >
                                            <option value={3}>{t('meters.modbusFc03')}</option>
                                            <option value={4}>{t('meters.modbusFc04')}</option>
                                            <option value={1}>{t('meters.modbusFc01')}</option>
                                            <option value={2}>{t('meters.modbusFc02')}</option>
                                        </select>
                                        <p style={helpTextStyle}>
                                            {t('meters.modbusFunctionCodeHelp')}
                                        </p>
                                    </div>

                                    {/* Data Type */}
                                    <div style={{ marginBottom: '14px' }}>
                                        <label style={labelStyle}>
                                            {t('meters.modbusDataType')} *
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
                                            onFocus={focusHandler}
                                            onBlur={blurHandler}
                                            style={inputStyle(isMobile)}
                                        >
                                            <option value="float32">{t('meters.modbusFloat32')}</option>
                                            <option value="float64">{t('meters.modbusFloat64')}</option>
                                            <option value="int32">{t('meters.modbusInt32')}</option>
                                            <option value="int16">{t('meters.modbusInt16')}</option>
                                            <option value="uint32">{t('meters.modbusUint32')}</option>
                                            <option value="uint16">{t('meters.modbusUint16')}</option>
                                        </select>
                                        <p style={helpTextStyle}>
                                            {t('meters.modbusDataTypeHelp')}
                                        </p>
                                    </div>

                                    {/* Import Energy */}
                                    <div style={{
                                        backgroundColor: '#f0fdf4',
                                        padding: '14px',
                                        borderRadius: '10px',
                                        marginBottom: '14px',
                                        border: '1px solid #bbf7d0'
                                    }}>
                                        <strong style={{ color: '#15803d', fontSize: '13px' }}>{t('meters.modbusImportEnergy')}</strong>
                                        <div style={{ marginTop: '12px' }}>
                                            <label style={labelStyle}>
                                                {t('meters.modbusRegisterAddress')} *
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
                                                onFocus={(e) => {
                                                    e.target.style.borderColor = '#22c55e';
                                                    e.target.style.boxShadow = '0 0 0 3px rgba(34,197,94,0.1)';
                                                }}
                                                onBlur={(e) => {
                                                    e.target.style.borderColor = '#bbf7d0';
                                                    e.target.style.boxShadow = 'none';
                                                }}
                                                style={{
                                                    ...inputStyle(isMobile),
                                                    borderColor: '#bbf7d0'
                                                }}
                                            />
                                            <p style={{ fontSize: '11px', color: '#15803d', marginTop: '4px' }}>
                                                {t('meters.modbusRegisterAddressHelp')}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Export Energy */}
                                    {(formData.meter_type === 'total_meter' || formData.meter_type === 'solar_meter') && (
                                        <div style={{
                                            backgroundColor: '#fffbeb',
                                            padding: '14px',
                                            borderRadius: '10px',
                                            marginBottom: '14px',
                                            border: '1px solid #fde68a'
                                        }}>
                                            <CustomCheckbox
                                                checked={connectionConfig.has_export_register === true}
                                                onChange={(checked) => onConnectionConfigChange({
                                                    ...connectionConfig,
                                                    has_export_register: checked
                                                })}
                                                label={t('meters.modbusExportRegister')}
                                            />

                                            {connectionConfig.has_export_register && (
                                                <div style={{ marginTop: '12px' }}>
                                                    <label style={labelStyle}>
                                                        {t('meters.modbusExportAddress')} *
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
                                                        onFocus={(e) => {
                                                            e.target.style.borderColor = '#f59e0b';
                                                            e.target.style.boxShadow = '0 0 0 3px rgba(245,158,11,0.1)';
                                                        }}
                                                        onBlur={(e) => {
                                                            e.target.style.borderColor = '#fde68a';
                                                            e.target.style.boxShadow = 'none';
                                                        }}
                                                        style={{
                                                            ...inputStyle(isMobile),
                                                            borderColor: '#fde68a'
                                                        }}
                                                    />
                                                    <p style={{ fontSize: '11px', color: '#92400e', marginTop: '4px' }}>
                                                        {t('meters.modbusExportAddressHelp')}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Summary */}
                                    <div style={{
                                        backgroundColor: '#f9fafb',
                                        padding: '14px',
                                        borderRadius: '10px',
                                        fontFamily: 'monospace',
                                        fontSize: '12px',
                                        border: '1px solid #e5e7eb',
                                        lineHeight: '1.6'
                                    }}>
                                        <strong>{t('meters.modbusSummary')}:</strong><br />
                                        {connectionConfig.ip_address || '192.168.1.100'}:{connectionConfig.port || 502}<br />
                                        {t('meters.modbusUnit')}: {connectionConfig.unit_id || 1} | FC{String(connectionConfig.function_code || 3).padStart(2, '0')}<br />
                                        {t('meters.modbusType')}: {connectionConfig.data_type || 'float32'}<br />
                                        {t('meters.modbusImport')}@{connectionConfig.register_address || 0}
                                        {connectionConfig.has_export_register && ` | ${t('meters.modbusExport')}@${connectionConfig.export_register_address || 0}`}
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Options Section */}
                        <div style={{
                            backgroundColor: 'white',
                            borderRadius: '12px',
                            padding: isMobile ? '16px' : '20px',
                            border: '1px solid #e5e7eb',
                            marginBottom: '16px'
                        }}>
                            <h3 style={{
                                fontSize: '14px',
                                fontWeight: '700',
                                color: '#374151',
                                marginBottom: '16px',
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px'
                            }}>
                                {t('common.options') || 'Options'}
                            </h3>

                            {/* Active Checkbox */}
                            <div style={{ marginBottom: '14px' }}>
                                <CustomCheckbox
                                    checked={formData.is_active !== false}
                                    onChange={(checked) => onFormDataChange({
                                        ...formData,
                                        is_active: checked
                                    })}
                                    label={t('meters.activeCollectData')}
                                />
                            </div>

                            {/* Notes */}
                            <div>
                                <label style={labelStyle}>
                                    {t('common.notes')}
                                </label>
                                <textarea
                                    value={formData.notes || ''}
                                    onChange={(e) => onFormDataChange({ ...formData, notes: e.target.value })}
                                    rows={2}
                                    onFocus={focusHandler as any}
                                    onBlur={blurHandler as any}
                                    style={{
                                        ...inputStyle(isMobile),
                                        fontFamily: 'inherit',
                                        resize: 'vertical',
                                        minHeight: '60px'
                                    }}
                                />
                            </div>
                        </div>
                    </form>
                </div>

                {/* Footer */}
                <div style={{
                    padding: isMobile ? '16px 20px' : '16px 28px',
                    borderTop: '1px solid #f3f4f6',
                    display: 'flex',
                    gap: '12px',
                    flexShrink: 0,
                    backgroundColor: 'white'
                }}>
                    <button
                        type="button"
                        onClick={onCancel}
                        style={{
                            flex: 1,
                            padding: '12px',
                            backgroundColor: 'white',
                            color: '#374151',
                            border: '1px solid #e5e7eb',
                            borderRadius: '10px',
                            fontSize: '14px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#f9fafb';
                            e.currentTarget.style.borderColor = '#d1d5db';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'white';
                            e.currentTarget.style.borderColor = '#e5e7eb';
                        }}
                    >
                        {t('common.cancel')}
                    </button>
                    <button
                        type="submit"
                        form="meter-form"
                        style={{
                            flex: 1,
                            padding: '12px',
                            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '10px',
                            fontSize: '14px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            boxShadow: '0 2px 8px rgba(102, 126, 234, 0.3)',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)';
                            e.currentTarget.style.transform = 'translateY(-1px)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.boxShadow = '0 2px 8px rgba(102, 126, 234, 0.3)';
                            e.currentTarget.style.transform = 'translateY(0)';
                        }}
                    >
                        {editingMeter ? t('common.update') : t('common.create')}
                    </button>
                </div>
            </div>
        </div>

        <style>{`
            @keyframes mfm-spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            @keyframes mfm-fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes mfm-slideUp {
                from { opacity: 0; transform: translateY(20px) scale(0.98); }
                to { opacity: 1; transform: translateY(0) scale(1); }
            }
        `}</style>
        </>
    );
}
