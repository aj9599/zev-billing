import React, { useState, useEffect } from 'react';
import { X, Info, Wifi, AlertCircle, AlertTriangle, Car, Check } from 'lucide-react';
import type { Charger, Building as BuildingType } from '../../types';
import type { ChargerConnectionConfig } from './hooks/useChargerForm';
import { CHARGER_PRESETS, getPreset } from '../chargerPresets';

interface ChargerFormModalProps {
  editingCharger: Charger | null;
  formData: Partial<Charger>;
  connectionConfig: ChargerConnectionConfig;
  buildings: BuildingType[];
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  onFormDataChange: (data: Partial<Charger>) => void;
  onConnectionConfigChange: (config: ChargerConnectionConfig) => void;
  onPresetChange: (preset: string) => void;
  onShowInstructions: () => void;
  t: (key: string) => string;
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

const smallLabelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: '4px',
    fontSize: '12px',
    fontWeight: '600',
    color: '#374151'
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

export default function ChargerFormModal({
  editingCharger,
  formData,
  connectionConfig,
  buildings,
  onSubmit,
  onClose,
  onFormDataChange,
  onConnectionConfigChange,
  onPresetChange,
  onShowInstructions,
  t
}: ChargerFormModalProps) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const getCurrentPreset = () => {
    return getPreset(formData.preset || 'weidmuller');
  };

  // Determine if we're using single-block mode
  const isSingleBlockMode = connectionConfig.loxone_uuid_mode === 'single';
  const isMultiUuidMode = !isSingleBlockMode && formData.connection_type === 'loxone_api';

  // Debug logging
  React.useEffect(() => {
    console.log('🖨️ MODAL RENDER STATE:');
    console.log('  Preset:', formData.preset);
    console.log('  UUID Mode:', connectionConfig.loxone_uuid_mode);
    console.log('  Is Single Block Mode:', isSingleBlockMode);
    console.log('  Is Multi UUID Mode:', isMultiUuidMode);
    console.log('  Connection Type:', formData.connection_type);
    console.log('  Block UUID from connectionConfig:', connectionConfig.loxone_charger_block_uuid);
    console.log('  Has block UUID:', !!connectionConfig.loxone_charger_block_uuid);
  }, [formData.preset, connectionConfig.loxone_uuid_mode, isSingleBlockMode, isMultiUuidMode, formData.connection_type, connectionConfig.loxone_charger_block_uuid]);

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
      animation: 'cfm-fadeIn 0.2s ease-out'
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
        animation: 'cfm-slideUp 0.3s ease-out'
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
              <Car size={20} color="white" />
            </div>
            <div>
              <h2 style={{
                fontSize: isMobile ? '18px' : '20px',
                fontWeight: '700',
                color: '#1f2937',
                margin: 0
              }}>
                {editingCharger ? t('chargers.editCharger') : t('chargers.addCharger')}
              </h2>
              <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>
                {editingCharger ? formData.name || '' : t('chargers.subtitle')}
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
              title={t('chargers.setupInstructions')}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f5f3ff'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <Info size={20} />
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
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
          <form id="charger-form" onSubmit={onSubmit}>
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
                {t('common.name')} & {t('chargers.brandPreset')}
              </h3>

              {/* Name */}
              <div style={{ marginBottom: '14px' }}>
                <label style={labelStyle}>{t('common.name')} *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => onFormDataChange({ ...formData, name: e.target.value })}
                  onFocus={focusHandler}
                  onBlur={blurHandler}
                  style={inputStyle(isMobile)}
                />
              </div>

              {/* Brand/Preset */}
              <div style={{ marginBottom: '14px' }}>
                <label style={labelStyle}>{t('chargers.brandPreset')} *</label>
                <select
                  required
                  value={formData.brand}
                  onChange={(e) => onPresetChange(e.target.value)}
                  onFocus={focusHandler}
                  onBlur={blurHandler}
                  style={inputStyle(isMobile)}
                >
                  {Object.values(CHARGER_PRESETS).map(preset => (
                    <option key={preset.name} value={preset.name}>{preset.label}</option>
                  ))}
                </select>
                <p style={helpTextStyle}>
                  {getCurrentPreset().description}
                </p>
              </div>

              {/* Building */}
              <div style={{ marginBottom: '14px' }}>
                <label style={labelStyle}>{t('users.building')} *</label>
                <select
                  required
                  value={formData.building_id}
                  onChange={(e) => onFormDataChange({ ...formData, building_id: parseInt(e.target.value) })}
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

              {/* Connection Type (not for Zaptec) */}
              {formData.preset !== 'zaptec' && (
                <div>
                  <label style={labelStyle}>{t('meters.connectionType')} *</label>
                  <select
                    required
                    value={formData.connection_type}
                    onChange={(e) => onFormDataChange({ ...formData, connection_type: e.target.value })}
                    onFocus={focusHandler}
                    onBlur={blurHandler}
                    style={inputStyle(isMobile)}
                  >
                    <option value="loxone_api">{t('chargers.loxoneApiRecommended')}</option>
                    <option value="udp">{t('chargers.udpAlternative')}</option>
                    <option value="http">{t('meters.http')}</option>
                    <option value="modbus_tcp">{t('meters.modbusTcp')}</option>
                  </select>
                </div>
              )}
            </div>

            {/* Connection Config Section */}
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
                {t('chargers.connectionConfig')}
              </h3>

              {/* ===== Loxone API ===== */}
              {(isSingleBlockMode || isMultiUuidMode) && (
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
                      {isSingleBlockMode ? t('chargers.singleBlockMode') : t('chargers.loxoneApiDescription')}
                    </p>
                  </div>

                  {/* Connection Mode */}
                  <div style={{ marginBottom: '14px' }}>
                    <label style={labelStyle}>{t('meters.loxoneConnectionMode')} *</label>
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

                  {/* UUID Mode (Weidmüller only) */}
                  {formData.preset === 'weidmuller' && (
                    <div style={{ marginBottom: '14px' }}>
                      <label style={labelStyle}>{t('chargers.loxoneUuidMode')} *</label>
                      <select
                        required
                        value={connectionConfig.loxone_uuid_mode || 'multi'}
                        onChange={(e) => onConnectionConfigChange({
                          ...connectionConfig,
                          loxone_uuid_mode: e.target.value as 'single' | 'multi'
                        })}
                        onFocus={focusHandler}
                        onBlur={blurHandler}
                        style={inputStyle(isMobile)}
                      >
                        <option value="multi">{t('chargers.loxoneUuidModeMulti')}</option>
                        <option value="single">{t('chargers.loxoneUuidModeSingle')}</option>
                      </select>
                      <p style={helpTextStyle}>
                        {connectionConfig.loxone_uuid_mode === 'single'
                          ? t('chargers.loxoneUuidModeSingleHelp')
                          : t('chargers.loxoneUuidModeMultiHelp')}
                      </p>
                    </div>
                  )}

                  {/* Remote: MAC / Local: IP */}
                  {connectionConfig.loxone_connection_mode === 'remote' ? (
                    <div style={{ marginBottom: '14px' }}>
                      <label style={labelStyle}>{t('meters.loxoneMacAddress')} *</label>
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
                      <p style={helpTextStyle}>{t('meters.loxoneMacAddressHelp')}</p>
                      <div style={{
                        backgroundColor: '#fffbeb',
                        padding: '12px',
                        borderRadius: '8px',
                        marginTop: '8px',
                        border: '1px solid #fde68a'
                      }}>
                        <p style={{ fontSize: '12px', color: '#92400e', margin: 0 }}>
                          <strong style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <AlertTriangle size={14} style={{ display: 'inline' }} />
                            {t('meters.loxoneCloudDnsTitle')}
                          </strong><br />
                          {t('meters.loxoneCloudDnsDescription')}
                          <br /><br />
                          <strong>{t('meters.loxoneMacAddressLocationTitle')}:</strong><br />
                          {t('meters.loxoneMacAddressLocation')}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div style={{ marginBottom: '14px' }}>
                      <label style={labelStyle}>{t('chargers.loxoneHost')} *</label>
                      <input
                        type="text"
                        required
                        value={connectionConfig.loxone_host || ''}
                        onChange={(e) => onConnectionConfigChange({ ...connectionConfig, loxone_host: e.target.value })}
                        placeholder="192.168.1.100"
                        onFocus={focusHandler}
                        onBlur={blurHandler}
                        style={inputStyle(isMobile)}
                      />
                      <p style={helpTextStyle}>{t('chargers.loxoneHostDescription')}</p>
                    </div>
                  )}

                  {isSingleBlockMode ? (
                    /* SINGLE-BLOCK MODE */
                    <div style={{ marginBottom: '14px' }}>
                      <label style={labelStyle}>{t('chargers.chargerBlockUuid')} *</label>
                      <input
                        type="text"
                        required
                        value={connectionConfig.loxone_charger_block_uuid || ''}
                        onChange={(e) => onConnectionConfigChange({ ...connectionConfig, loxone_charger_block_uuid: e.target.value })}
                        placeholder="1ea26192-03d0-8c9b-ffff..."
                        onFocus={focusHandler}
                        onBlur={blurHandler}
                        style={inputStyle(isMobile, true)}
                      />
                      <p style={helpTextStyle}>{t('chargers.chargerBlockUuidDescription')}</p>
                    </div>
                  ) : (
                    /* MULTI-UUID MODE */
                    <>
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                        gap: '12px',
                        marginBottom: '14px'
                      }}>
                        <div>
                          <label style={labelStyle}>{t('chargers.loxonePowerUuid')} *</label>
                          <input
                            type="text"
                            required
                            value={connectionConfig.loxone_power_uuid || ''}
                            onChange={(e) => onConnectionConfigChange({ ...connectionConfig, loxone_power_uuid: e.target.value })}
                            placeholder="1a2b3c4d-..."
                            onFocus={focusHandler}
                            onBlur={blurHandler}
                            style={inputStyle(isMobile, true)}
                          />
                        </div>
                        <div>
                          <label style={labelStyle}>{t('chargers.loxoneStateUuid')} *</label>
                          <input
                            type="text"
                            required
                            value={connectionConfig.loxone_state_uuid || ''}
                            onChange={(e) => onConnectionConfigChange({ ...connectionConfig, loxone_state_uuid: e.target.value })}
                            placeholder="2b3c4d5e-..."
                            onFocus={focusHandler}
                            onBlur={blurHandler}
                            style={inputStyle(isMobile, true)}
                          />
                        </div>
                      </div>

                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                        gap: '12px',
                        marginBottom: '14px'
                      }}>
                        <div>
                          <label style={labelStyle}>{t('chargers.loxoneUserIdUuid')} *</label>
                          <input
                            type="text"
                            required
                            value={connectionConfig.loxone_user_id_uuid || ''}
                            onChange={(e) => onConnectionConfigChange({ ...connectionConfig, loxone_user_id_uuid: e.target.value })}
                            placeholder="3c4d5e6f-..."
                            onFocus={focusHandler}
                            onBlur={blurHandler}
                            style={inputStyle(isMobile, true)}
                          />
                        </div>
                        <div>
                          <label style={labelStyle}>{t('chargers.loxoneModeUuid')} *</label>
                          <input
                            type="text"
                            required
                            value={connectionConfig.loxone_mode_uuid || ''}
                            onChange={(e) => onConnectionConfigChange({ ...connectionConfig, loxone_mode_uuid: e.target.value })}
                            placeholder="4d5e6f7g-..."
                            onFocus={focusHandler}
                            onBlur={blurHandler}
                            style={inputStyle(isMobile, true)}
                          />
                        </div>
                      </div>

                      <p style={helpTextStyle}>{t('chargers.loxoneUuidsDescription')}</p>
                    </>
                  )}

                  {/* Credentials */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                    gap: '12px',
                    marginBottom: '14px'
                  }}>
                    <div>
                      <label style={labelStyle}>{t('chargers.loxoneUsername')} *</label>
                      <input
                        type="text"
                        required
                        value={connectionConfig.loxone_username || ''}
                        onChange={(e) => onConnectionConfigChange({ ...connectionConfig, loxone_username: e.target.value })}
                        placeholder="admin"
                        onFocus={focusHandler}
                        onBlur={blurHandler}
                        style={inputStyle(isMobile)}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>{t('chargers.loxonePassword')} *</label>
                      <input
                        type="password"
                        required
                        value={connectionConfig.loxone_password || ''}
                        onChange={(e) => onConnectionConfigChange({ ...connectionConfig, loxone_password: e.target.value })}
                        placeholder="••••••••"
                        onFocus={focusHandler}
                        onBlur={blurHandler}
                        style={inputStyle(isMobile)}
                      />
                    </div>
                  </div>
                </>
              )}

              {/* ===== UDP ===== */}
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
                      {editingCharger ? t('chargers.existingUuidKeys') : t('chargers.udpDeprecatedWarning')}
                    </p>
                  </div>

                  <div style={{ marginBottom: '14px' }}>
                    <label style={labelStyle}>{t('meters.listenPort')} *</label>
                    <input
                      type="number"
                      required
                      value={connectionConfig.listen_port}
                      onChange={(e) => onConnectionConfigChange({ ...connectionConfig, listen_port: parseInt(e.target.value) })}
                      placeholder="8888"
                      onFocus={focusHandler}
                      onBlur={blurHandler}
                      style={inputStyle(isMobile)}
                    />
                  </div>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                    gap: '12px',
                    marginBottom: '14px'
                  }}>
                    <div>
                      <label style={labelStyle}>{t('chargers.powerKey')} *</label>
                      <input
                        type="text"
                        required
                        value={connectionConfig.power_key}
                        onChange={(e) => onConnectionConfigChange({ ...connectionConfig, power_key: e.target.value })}
                        readOnly={!editingCharger}
                        onFocus={focusHandler}
                        onBlur={blurHandler}
                        style={inputStyle(isMobile, true)}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>{t('chargers.stateKey')} *</label>
                      <input
                        type="text"
                        required
                        value={connectionConfig.state_key}
                        onChange={(e) => onConnectionConfigChange({ ...connectionConfig, state_key: e.target.value })}
                        readOnly={!editingCharger}
                        onFocus={focusHandler}
                        onBlur={blurHandler}
                        style={inputStyle(isMobile, true)}
                      />
                    </div>
                  </div>
                </>
              )}

              {/* ===== Zaptec API ===== */}
              {formData.connection_type === 'zaptec_api' && (
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
                      {t('chargers.zaptecCloudApi')}
                    </p>
                  </div>

                  <div style={{ marginBottom: '14px' }}>
                    <label style={labelStyle}>{t('chargers.zaptecUsernameEmail')} *</label>
                    <input
                      type="email"
                      required
                      value={connectionConfig.zaptec_username || ''}
                      onChange={(e) => onConnectionConfigChange({ ...connectionConfig, zaptec_username: e.target.value })}
                      placeholder="your.email@example.com"
                      onFocus={focusHandler}
                      onBlur={blurHandler}
                      style={inputStyle(isMobile)}
                    />
                  </div>

                  <div style={{ marginBottom: '14px' }}>
                    <label style={labelStyle}>{t('chargers.zaptecPassword')} *</label>
                    <input
                      type="password"
                      required
                      value={connectionConfig.zaptec_password || ''}
                      onChange={(e) => onConnectionConfigChange({ ...connectionConfig, zaptec_password: e.target.value })}
                      placeholder="••••••••"
                      onFocus={focusHandler}
                      onBlur={blurHandler}
                      style={inputStyle(isMobile)}
                    />
                  </div>

                  <div style={{ marginBottom: '14px' }}>
                    <label style={labelStyle}>{t('chargers.zaptecChargerId')} *</label>
                    <input
                      type="text"
                      required
                      value={connectionConfig.zaptec_charger_id || ''}
                      onChange={(e) => onConnectionConfigChange({ ...connectionConfig, zaptec_charger_id: e.target.value })}
                      placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
                      onFocus={focusHandler}
                      onBlur={blurHandler}
                      style={inputStyle(isMobile, true)}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>{t('chargers.zaptecInstallationId')}</label>
                    <input
                      type="text"
                      value={connectionConfig.zaptec_installation_id || ''}
                      onChange={(e) => onConnectionConfigChange({ ...connectionConfig, zaptec_installation_id: e.target.value })}
                      placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
                      onFocus={focusHandler}
                      onBlur={blurHandler}
                      style={inputStyle(isMobile, true)}
                    />
                  </div>
                </>
              )}

              {/* ===== HTTP ===== */}
              {formData.connection_type === 'http' && (
                <>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                    gap: '12px',
                    marginBottom: '14px'
                  }}>
                    <div>
                      <label style={labelStyle}>{t('chargers.powerEndpoint')} *</label>
                      <input
                        type="url"
                        required
                        value={connectionConfig.power_endpoint}
                        onChange={(e) => onConnectionConfigChange({ ...connectionConfig, power_endpoint: e.target.value })}
                        placeholder="http://192.168.1.100/api/power"
                        onFocus={focusHandler}
                        onBlur={blurHandler}
                        style={inputStyle(isMobile)}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>{t('chargers.stateEndpoint')} *</label>
                      <input
                        type="url"
                        required
                        value={connectionConfig.state_endpoint}
                        onChange={(e) => onConnectionConfigChange({ ...connectionConfig, state_endpoint: e.target.value })}
                        placeholder="http://192.168.1.100/api/state"
                        onFocus={focusHandler}
                        onBlur={blurHandler}
                        style={inputStyle(isMobile)}
                      />
                    </div>
                  </div>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                    gap: '12px'
                  }}>
                    <div>
                      <label style={labelStyle}>{t('chargers.userIdEndpoint')} *</label>
                      <input
                        type="url"
                        required
                        value={connectionConfig.user_id_endpoint}
                        onChange={(e) => onConnectionConfigChange({ ...connectionConfig, user_id_endpoint: e.target.value })}
                        placeholder="http://192.168.1.100/api/user_id"
                        onFocus={focusHandler}
                        onBlur={blurHandler}
                        style={inputStyle(isMobile)}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>{t('chargers.modeEndpoint')} *</label>
                      <input
                        type="url"
                        required
                        value={connectionConfig.mode_endpoint}
                        onChange={(e) => onConnectionConfigChange({ ...connectionConfig, mode_endpoint: e.target.value })}
                        placeholder="http://192.168.1.100/api/mode"
                        onFocus={focusHandler}
                        onBlur={blurHandler}
                        style={inputStyle(isMobile)}
                      />
                    </div>
                  </div>
                </>
              )}

              {/* ===== Modbus TCP ===== */}
              {formData.connection_type === 'modbus_tcp' && (
                <>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr',
                    gap: '12px',
                    marginBottom: '14px'
                  }}>
                    <div>
                      <label style={labelStyle}>{t('meters.ipAddress')} *</label>
                      <input
                        type="text"
                        required
                        value={connectionConfig.ip_address}
                        onChange={(e) => onConnectionConfigChange({ ...connectionConfig, ip_address: e.target.value })}
                        placeholder="192.168.1.100"
                        onFocus={focusHandler}
                        onBlur={blurHandler}
                        style={inputStyle(isMobile)}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>{t('meters.port')} *</label>
                      <input
                        type="number"
                        required
                        value={connectionConfig.port}
                        onChange={(e) => onConnectionConfigChange({ ...connectionConfig, port: parseInt(e.target.value) })}
                        placeholder="502"
                        onFocus={focusHandler}
                        onBlur={blurHandler}
                        style={inputStyle(isMobile)}
                      />
                    </div>
                  </div>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)',
                    gap: '10px'
                  }}>
                    <div>
                      <label style={smallLabelStyle}>{t('chargers.powerReg')} *</label>
                      <input
                        type="number" required value={connectionConfig.power_register}
                        onChange={(e) => onConnectionConfigChange({ ...connectionConfig, power_register: parseInt(e.target.value) })}
                        placeholder="0" onFocus={focusHandler} onBlur={blurHandler}
                        style={inputStyle(isMobile)}
                      />
                    </div>
                    <div>
                      <label style={smallLabelStyle}>{t('chargers.stateReg')} *</label>
                      <input
                        type="number" required value={connectionConfig.state_register}
                        onChange={(e) => onConnectionConfigChange({ ...connectionConfig, state_register: parseInt(e.target.value) })}
                        placeholder="1" onFocus={focusHandler} onBlur={blurHandler}
                        style={inputStyle(isMobile)}
                      />
                    </div>
                    <div>
                      <label style={smallLabelStyle}>{t('chargers.userReg')} *</label>
                      <input
                        type="number" required value={connectionConfig.user_id_register}
                        onChange={(e) => onConnectionConfigChange({ ...connectionConfig, user_id_register: parseInt(e.target.value) })}
                        placeholder="2" onFocus={focusHandler} onBlur={blurHandler}
                        style={inputStyle(isMobile)}
                      />
                    </div>
                    <div>
                      <label style={smallLabelStyle}>{t('chargers.modeReg')} *</label>
                      <input
                        type="number" required value={connectionConfig.mode_register}
                        onChange={(e) => onConnectionConfigChange({ ...connectionConfig, mode_register: parseInt(e.target.value) })}
                        placeholder="3" onFocus={focusHandler} onBlur={blurHandler}
                        style={inputStyle(isMobile)}
                      />
                    </div>
                    <div>
                      <label style={smallLabelStyle}>{t('meters.unitId')} *</label>
                      <input
                        type="number" required value={connectionConfig.unit_id}
                        onChange={(e) => onConnectionConfigChange({ ...connectionConfig, unit_id: parseInt(e.target.value) })}
                        placeholder="1" onFocus={focusHandler} onBlur={blurHandler}
                        style={inputStyle(isMobile)}
                      />
                    </div>
                  </div>
                </>
              )}

              {/* State & Mode Mappings (hide for single-block & Zaptec) */}
              {formData.preset !== 'zaptec' && !isSingleBlockMode && (
                <>
                  <div style={{
                    marginTop: '16px',
                    padding: '16px',
                    backgroundColor: '#f9fafb',
                    borderRadius: '10px',
                    border: '1px solid #e5e7eb'
                  }}>
                    <h4 style={{ fontSize: '13px', fontWeight: '700', marginBottom: '10px', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                      {t('chargers.stateValueMappings')}
                    </h4>
                    <p style={{ ...helpTextStyle, marginBottom: '12px' }}>
                      {t('chargers.configureStateValues')}
                    </p>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                      gap: '10px'
                    }}>
                      <div>
                        <label style={smallLabelStyle}>{t('chargers.stateCableLocked')}</label>
                        <input type="text" required value={connectionConfig.state_cable_locked}
                          onChange={(e) => onConnectionConfigChange({ ...connectionConfig, state_cable_locked: e.target.value })}
                          placeholder="65" onFocus={focusHandler} onBlur={blurHandler}
                          style={{ ...inputStyle(isMobile), padding: '8px 12px' }}
                        />
                      </div>
                      <div>
                        <label style={smallLabelStyle}>{t('chargers.stateWaitingAuth')}</label>
                        <input type="text" required value={connectionConfig.state_waiting_auth}
                          onChange={(e) => onConnectionConfigChange({ ...connectionConfig, state_waiting_auth: e.target.value })}
                          placeholder="66" onFocus={focusHandler} onBlur={blurHandler}
                          style={{ ...inputStyle(isMobile), padding: '8px 12px' }}
                        />
                      </div>
                      <div>
                        <label style={smallLabelStyle}>{t('chargers.stateCharging')}</label>
                        <input type="text" required value={connectionConfig.state_charging}
                          onChange={(e) => onConnectionConfigChange({ ...connectionConfig, state_charging: e.target.value })}
                          placeholder="67" onFocus={focusHandler} onBlur={blurHandler}
                          style={{ ...inputStyle(isMobile), padding: '8px 12px' }}
                        />
                      </div>
                      <div>
                        <label style={smallLabelStyle}>{t('chargers.stateIdle')}</label>
                        <input type="text" required value={connectionConfig.state_idle}
                          onChange={(e) => onConnectionConfigChange({ ...connectionConfig, state_idle: e.target.value })}
                          placeholder="50" onFocus={focusHandler} onBlur={blurHandler}
                          style={{ ...inputStyle(isMobile), padding: '8px 12px' }}
                        />
                      </div>
                    </div>
                  </div>

                  <div style={{
                    marginTop: '12px',
                    padding: '16px',
                    backgroundColor: '#f9fafb',
                    borderRadius: '10px',
                    border: '1px solid #e5e7eb'
                  }}>
                    <h4 style={{ fontSize: '13px', fontWeight: '700', marginBottom: '10px', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                      {t('chargers.modeValueMappings')}
                    </h4>
                    <p style={{ ...helpTextStyle, marginBottom: '12px' }}>
                      {t('chargers.configureModeValues')}
                    </p>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                      gap: '10px'
                    }}>
                      <div>
                        <label style={smallLabelStyle}>{t('chargers.modeNormal')}</label>
                        <input type="text" required value={connectionConfig.mode_normal}
                          onChange={(e) => onConnectionConfigChange({ ...connectionConfig, mode_normal: e.target.value })}
                          placeholder="1" onFocus={focusHandler} onBlur={blurHandler}
                          style={{ ...inputStyle(isMobile), padding: '8px 12px' }}
                        />
                      </div>
                      <div>
                        <label style={smallLabelStyle}>{t('chargers.modePriority')}</label>
                        <input type="text" required value={connectionConfig.mode_priority}
                          onChange={(e) => onConnectionConfigChange({ ...connectionConfig, mode_priority: e.target.value })}
                          placeholder="2" onFocus={focusHandler} onBlur={blurHandler}
                          style={{ ...inputStyle(isMobile), padding: '8px 12px' }}
                        />
                      </div>
                    </div>
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

              <div style={{ marginBottom: '14px' }}>
                <CustomCheckbox
                  checked={formData.is_active === true}
                  onChange={(checked) => onFormDataChange({ ...formData, is_active: checked })}
                  label={t('meters.activeCollectData')}
                />
              </div>

              <div>
                <label style={labelStyle}>{t('common.notes')}</label>
                <textarea
                  value={formData.notes}
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
            onClick={onClose}
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
            form="charger-form"
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
            {editingCharger ? t('common.update') : t('common.create')}
          </button>
        </div>
      </div>
    </div>

    <style>{`
      @keyframes cfm-fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes cfm-slideUp {
        from { opacity: 0; transform: translateY(20px) scale(0.98); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
    `}</style>
    </>
  );
}
