import React from 'react';
import { X, Info, Wifi, AlertCircle, AlertTriangle } from 'lucide-react';
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
  const getCurrentPreset = () => {
    return getPreset(formData.preset || 'weidmuller');
  };

  // Determine if we're using single-block mode
  const isSingleBlockMode = connectionConfig.loxone_uuid_mode === 'single';
  const isMultiUuidMode = !isSingleBlockMode && formData.connection_type === 'loxone_api';

  // ðŸ” DEBUG: Log form state on render
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h2 style={{ fontSize: '24px', fontWeight: 'bold' }}>
              {editingCharger ? t('chargers.editCharger') : t('chargers.addCharger')}
            </h2>
            <button
              onClick={onShowInstructions}
              style={{ padding: '6px', border: 'none', background: 'none', cursor: 'pointer', color: '#007bff' }}
              title={t('chargers.setupInstructions')}
            >
              <Info size={20} />
            </button>
          </div>
          <button
            onClick={onClose}
            style={{ border: 'none', background: 'none', cursor: 'pointer' }}
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={onSubmit}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
              {t('common.name')} *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => onFormDataChange({ ...formData, name: e.target.value })}
              style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}
            />
          </div>

          <div style={{ marginTop: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
              {t('chargers.brandPreset')} *
            </label>
            <select
              required
              value={formData.brand}
              onChange={(e) => onPresetChange(e.target.value)}
              style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}
            >
              {Object.values(CHARGER_PRESETS).map(preset => (
                <option key={preset.name} value={preset.name}>{preset.label}</option>
              ))}
            </select>
            <p style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
              {getCurrentPreset().description}
            </p>
          </div>

          <div style={{ marginTop: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
              {t('users.building')} *
            </label>
            <select
              required
              value={formData.building_id}
              onChange={(e) => onFormDataChange({ ...formData, building_id: parseInt(e.target.value) })}
              style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}
            >
              <option value={0}>{t('users.selectBuilding')}</option>
              {buildings.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          {formData.preset !== 'zaptec' && (
            <div style={{ marginTop: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                {t('meters.connectionType')} *
              </label>
              <select
                required
                value={formData.connection_type}
                onChange={(e) => onFormDataChange({ ...formData, connection_type: e.target.value })}
                style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}
              >
                <option value="loxone_api">{t('chargers.loxoneApiRecommended')}</option>
                <option value="udp">{t('chargers.udpAlternative')}</option>
                <option value="http">{t('meters.http')}</option>
                <option value="modbus_tcp">{t('meters.modbusTcp')}</option>
              </select>
            </div>
          )}

          <div style={{ marginTop: '20px', padding: '20px', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>
              {t('chargers.connectionConfig')}
            </h3>

            {/* Loxone API Configuration */}
            {(isSingleBlockMode || isMultiUuidMode) && (
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
                    <strong>{isSingleBlockMode ? t('chargers.singleBlockMode') : t('chargers.loxoneApiDescription')}</strong>
                  </p>
                </div>

                {/* Connection Mode Selection - Local vs Remote */}
                <div style={{ marginBottom: '12px' }}>
                  <label style={{
                    display: 'block',
                    marginBottom: '8px',
                    fontWeight: '500',
                    fontSize: '14px'
                  }}>
                    {t('meters.loxoneConnectionMode')} *
                  </label>
                  <select
                    required
                    value={connectionConfig.loxone_connection_mode || 'local'}
                    onChange={(e) => onConnectionConfigChange({
                      ...connectionConfig,
                      loxone_connection_mode: e.target.value as 'local' | 'remote'
                    })}
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid #ddd',
                      borderRadius: '6px'
                    }}
                  >
                    <option value="local">{t('meters.loxoneConnectionModeLocal')}</option>
                    <option value="remote">{t('meters.loxoneConnectionModeRemote')}</option>
                  </select>
                  <p style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                    {connectionConfig.loxone_connection_mode === 'remote'
                      ? t('meters.loxoneConnectionModeRemoteHelp')
                      : t('meters.loxoneConnectionModeLocalHelp')}
                  </p>
                </div>

                {/* UUID Mode Selection - Single vs Multi UUID (only for Weidmüller) */}
                {formData.preset === 'weidmuller' && (
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{
                      display: 'block',
                      marginBottom: '8px',
                      fontWeight: '500',
                      fontSize: '14px'
                    }}>
                      {t('chargers.loxoneUuidMode')} *
                    </label>
                    <select
                      required
                      value={connectionConfig.loxone_uuid_mode || 'multi'}
                      onChange={(e) => onConnectionConfigChange({
                        ...connectionConfig,
                        loxone_uuid_mode: e.target.value as 'single' | 'multi'
                      })}
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '1px solid #ddd',
                        borderRadius: '6px'
                      }}
                    >
                      <option value="multi">{t('chargers.loxoneUuidModeMulti')}</option>
                      <option value="single">{t('chargers.loxoneUuidModeSingle')}</option>
                    </select>
                    <p style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                      {connectionConfig.loxone_uuid_mode === 'single'
                        ? t('chargers.loxoneUuidModeSingleHelp')
                        : t('chargers.loxoneUuidModeMultiHelp')}
                    </p>
                  </div>
                )}

                {/* Conditional: Local IP or Remote MAC Address */}
                {connectionConfig.loxone_connection_mode === 'remote' ? (
                  // REMOTE MODE - MAC Address
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{
                      display: 'block',
                      marginBottom: '8px',
                      fontWeight: '500',
                      fontSize: '14px'
                    }}>
                      {t('meters.loxoneMacAddress')} *
                    </label>
                    <input
                      type="text"
                      required
                      value={connectionConfig.loxone_mac_address || ''}
                      onChange={(e) => {
                        // Auto-format: remove non-hex chars and convert to uppercase
                        const cleaned = e.target.value.toUpperCase().replace(/[^0-9A-F]/g, '');
                        onConnectionConfigChange({
                          ...connectionConfig,
                          loxone_mac_address: cleaned
                        });
                      }}
                      placeholder="504F94XXXXXX"
                      maxLength={12}
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '1px solid #ddd',
                        borderRadius: '6px',
                        fontFamily: 'monospace',
                        fontSize: '14px',
                        textTransform: 'uppercase'
                      }}
                    />
                    <p style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                      {t('meters.loxoneMacAddressHelp')}
                    </p>
                    <div style={{
                      backgroundColor: '#fef3c7',
                      padding: '12px',
                      borderRadius: '6px',
                      marginTop: '8px',
                      border: '1px solid #f59e0b'
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
                  // LOCAL MODE - IP Address
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{
                      display: 'block',
                      marginBottom: '8px',
                      fontWeight: '500',
                      fontSize: '14px'
                    }}>
                      {t('chargers.loxoneHost')} *
                    </label>
                    <input
                      type="text"
                      required
                      value={connectionConfig.loxone_host || ''}
                      onChange={(e) => onConnectionConfigChange({ ...connectionConfig, loxone_host: e.target.value })}
                      placeholder="192.168.1.100"
                      style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}
                    />
                    <p style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                      {t('chargers.loxoneHostDescription')}
                    </p>
                  </div>
                )}

                {isSingleBlockMode ? (
                  // SINGLE-BLOCK MODE: Only one UUID needed
                  <>
                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                        {t('chargers.chargerBlockUuid')} *
                      </label>
                      <input
                        type="text"
                        required
                        value={connectionConfig.loxone_charger_block_uuid || ''}
                        onChange={(e) => onConnectionConfigChange({ ...connectionConfig, loxone_charger_block_uuid: e.target.value })}
                        placeholder="1ea26192-03d0-8c9b-ffff..."
                        style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontFamily: 'monospace', fontSize: '12px' }}
                      />
                      <p style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                        {t('chargers.chargerBlockUuidDescription')}
                      </p>
                    </div>
                  </>
                ) : (
                  // MULTI-UUID MODE: Original 4 UUIDs
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          {t('chargers.loxonePowerUuid')} *
                        </label>
                        <input
                          type="text"
                          required
                          value={connectionConfig.loxone_power_uuid || ''}
                          onChange={(e) => onConnectionConfigChange({ ...connectionConfig, loxone_power_uuid: e.target.value })}
                          placeholder="1a2b3c4d-..."
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontFamily: 'monospace', fontSize: '12px' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          {t('chargers.loxoneStateUuid')} *
                        </label>
                        <input
                          type="text"
                          required
                          value={connectionConfig.loxone_state_uuid || ''}
                          onChange={(e) => onConnectionConfigChange({ ...connectionConfig, loxone_state_uuid: e.target.value })}
                          placeholder="2b3c4d5e-..."
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontFamily: 'monospace', fontSize: '12px' }}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          {t('chargers.loxoneUserIdUuid')} *
                        </label>
                        <input
                          type="text"
                          required
                          value={connectionConfig.loxone_user_id_uuid || ''}
                          onChange={(e) => onConnectionConfigChange({ ...connectionConfig, loxone_user_id_uuid: e.target.value })}
                          placeholder="3c4d5e6f-..."
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontFamily: 'monospace', fontSize: '12px' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          {t('chargers.loxoneModeUuid')} *
                        </label>
                        <input
                          type="text"
                          required
                          value={connectionConfig.loxone_mode_uuid || ''}
                          onChange={(e) => onConnectionConfigChange({ ...connectionConfig, loxone_mode_uuid: e.target.value })}
                          placeholder="4d5e6f7g-..."
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontFamily: 'monospace', fontSize: '12px' }}
                        />
                      </div>
                    </div>

                    <p style={{ fontSize: '11px', color: '#666', marginBottom: '12px' }}>
                      {t('chargers.loxoneUuidsDescription')}
                    </p>
                  </>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                      {t('chargers.loxoneUsername')} *
                    </label>
                    <input
                      type="text"
                      required
                      value={connectionConfig.loxone_username || ''}
                      onChange={(e) => onConnectionConfigChange({ ...connectionConfig, loxone_username: e.target.value })}
                      placeholder="admin"
                      style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                      {t('chargers.loxonePassword')} *
                    </label>
                    <input
                      type="password"
                      required
                      value={connectionConfig.loxone_password || ''}
                      onChange={(e) => onConnectionConfigChange({ ...connectionConfig, loxone_password: e.target.value })}
                      placeholder="••••••••"
                      style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}
                    />
                  </div>
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
                    <strong>{editingCharger ? t('chargers.existingUuidKeys') : t('chargers.udpDeprecatedWarning')}</strong>
                  </p>
                </div>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                    {t('meters.listenPort')} *
                  </label>
                  <input
                    type="number"
                    required
                    value={connectionConfig.listen_port}
                    onChange={(e) => onConnectionConfigChange({ ...connectionConfig, listen_port: parseInt(e.target.value) })}
                    placeholder="8888"
                    style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}
                  />
                </div>
                <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                      {t('chargers.powerKey')} *
                    </label>
                    <input
                      type="text"
                      required
                      value={connectionConfig.power_key}
                      onChange={(e) => onConnectionConfigChange({ ...connectionConfig, power_key: e.target.value })}
                      readOnly={!editingCharger}
                      style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontFamily: 'monospace', fontSize: '12px' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                      {t('chargers.stateKey')} *
                    </label>
                    <input
                      type="text"
                      required
                      value={connectionConfig.state_key}
                      onChange={(e) => onConnectionConfigChange({ ...connectionConfig, state_key: e.target.value })}
                      readOnly={!editingCharger}
                      style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontFamily: 'monospace', fontSize: '12px' }}
                    />
                  </div>
                </div>
              </>
            )}

            {/* Zaptec API Configuration */}
            {formData.connection_type === 'zaptec_api' && (
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
                    <strong>{t('chargers.zaptecCloudApi')}</strong>
                  </p>
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                    {t('chargers.zaptecUsernameEmail')} *
                  </label>
                  <input
                    type="email"
                    required
                    value={connectionConfig.zaptec_username || ''}
                    onChange={(e) => onConnectionConfigChange({ ...connectionConfig, zaptec_username: e.target.value })}
                    placeholder="your.email@example.com"
                    style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}
                  />
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                    {t('chargers.zaptecPassword')} *
                  </label>
                  <input
                    type="password"
                    required
                    value={connectionConfig.zaptec_password || ''}
                    onChange={(e) => onConnectionConfigChange({ ...connectionConfig, zaptec_password: e.target.value })}
                    placeholder="••••••••"
                    style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}
                  />
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                    {t('chargers.zaptecChargerId')} *
                  </label>
                  <input
                    type="text"
                    required
                    value={connectionConfig.zaptec_charger_id || ''}
                    onChange={(e) => onConnectionConfigChange({ ...connectionConfig, zaptec_charger_id: e.target.value })}
                    placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
                    style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontFamily: 'monospace', fontSize: '12px' }}
                  />
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                    {t('chargers.zaptecInstallationId')}
                  </label>
                  <input
                    type="text"
                    value={connectionConfig.zaptec_installation_id || ''}
                    onChange={(e) => onConnectionConfigChange({ ...connectionConfig, zaptec_installation_id: e.target.value })}
                    placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
                    style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontFamily: 'monospace', fontSize: '12px' }}
                  />
                </div>
              </>
            )}

            {/* HTTP Configuration */}
            {formData.connection_type === 'http' && (
              <>
                <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                      {t('chargers.powerEndpoint')} *
                    </label>
                    <input
                      type="url"
                      required
                      value={connectionConfig.power_endpoint}
                      onChange={(e) => onConnectionConfigChange({ ...connectionConfig, power_endpoint: e.target.value })}
                      placeholder="http://192.168.1.100/api/power"
                      style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                      {t('chargers.stateEndpoint')} *
                    </label>
                    <input
                      type="url"
                      required
                      value={connectionConfig.state_endpoint}
                      onChange={(e) => onConnectionConfigChange({ ...connectionConfig, state_endpoint: e.target.value })}
                      placeholder="http://192.168.1.100/api/state"
                      style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}
                    />
                  </div>
                </div>
                <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                      {t('chargers.userIdEndpoint')} *
                    </label>
                    <input
                      type="url"
                      required
                      value={connectionConfig.user_id_endpoint}
                      onChange={(e) => onConnectionConfigChange({ ...connectionConfig, user_id_endpoint: e.target.value })}
                      placeholder="http://192.168.1.100/api/user_id"
                      style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                      {t('chargers.modeEndpoint')} *
                    </label>
                    <input
                      type="url"
                      required
                      value={connectionConfig.mode_endpoint}
                      onChange={(e) => onConnectionConfigChange({ ...connectionConfig, mode_endpoint: e.target.value })}
                      placeholder="http://192.168.1.100/api/mode"
                      style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}
                    />
                  </div>
                </div>
              </>
            )}

            {/* Modbus TCP Configuration */}
            {formData.connection_type === 'modbus_tcp' && (
              <>
                <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                      {t('meters.ipAddress')} *
                    </label>
                    <input
                      type="text"
                      required
                      value={connectionConfig.ip_address}
                      onChange={(e) => onConnectionConfigChange({ ...connectionConfig, ip_address: e.target.value })}
                      placeholder="192.168.1.100"
                      style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                      {t('meters.port')} *
                    </label>
                    <input
                      type="number"
                      required
                      value={connectionConfig.port}
                      onChange={(e) => onConnectionConfigChange({ ...connectionConfig, port: parseInt(e.target.value) })}
                      placeholder="502"
                      style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}
                    />
                  </div>
                </div>
                <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                      {t('chargers.powerReg')} *
                    </label>
                    <input
                      type="number"
                      required
                      value={connectionConfig.power_register}
                      onChange={(e) => onConnectionConfigChange({ ...connectionConfig, power_register: parseInt(e.target.value) })}
                      placeholder="0"
                      style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                      {t('chargers.stateReg')} *
                    </label>
                    <input
                      type="number"
                      required
                      value={connectionConfig.state_register}
                      onChange={(e) => onConnectionConfigChange({ ...connectionConfig, state_register: parseInt(e.target.value) })}
                      placeholder="1"
                      style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                      {t('chargers.userReg')} *
                    </label>
                    <input
                      type="number"
                      required
                      value={connectionConfig.user_id_register}
                      onChange={(e) => onConnectionConfigChange({ ...connectionConfig, user_id_register: parseInt(e.target.value) })}
                      placeholder="2"
                      style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                      {t('chargers.modeReg')} *
                    </label>
                    <input
                      type="number"
                      required
                      value={connectionConfig.mode_register}
                      onChange={(e) => onConnectionConfigChange({ ...connectionConfig, mode_register: parseInt(e.target.value) })}
                      placeholder="3"
                      style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                      {t('meters.unitId')} *
                    </label>
                    <input
                      type="number"
                      required
                      value={connectionConfig.unit_id}
                      onChange={(e) => onConnectionConfigChange({ ...connectionConfig, unit_id: parseInt(e.target.value) })}
                      placeholder="1"
                      style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}
                    />
                  </div>
                </div>
              </>
            )}

            {/* State and Mode Mappings - Hide for single-block mode */}
            {formData.preset !== 'zaptec' && !isSingleBlockMode && (
              <>
                <div style={{ marginTop: '20px', padding: '16px', backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#1f2937' }}>
                    {t('chargers.stateValueMappings')}
                  </h4>
                  <p style={{ fontSize: '12px', color: '#666', marginBottom: '12px' }}>
                    {t('chargers.configureStateValues')}
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '500' }}>
                        {t('chargers.stateCableLocked')}
                      </label>
                      <input
                        type="text"
                        required
                        value={connectionConfig.state_cable_locked}
                        onChange={(e) => onConnectionConfigChange({ ...connectionConfig, state_cable_locked: e.target.value })}
                        placeholder="65"
                        style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '500' }}>
                        {t('chargers.stateWaitingAuth')}
                      </label>
                      <input
                        type="text"
                        required
                        value={connectionConfig.state_waiting_auth}
                        onChange={(e) => onConnectionConfigChange({ ...connectionConfig, state_waiting_auth: e.target.value })}
                        placeholder="66"
                        style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '500' }}>
                        {t('chargers.stateCharging')}
                      </label>
                      <input
                        type="text"
                        required
                        value={connectionConfig.state_charging}
                        onChange={(e) => onConnectionConfigChange({ ...connectionConfig, state_charging: e.target.value })}
                        placeholder="67"
                        style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '500' }}>
                        {t('chargers.stateIdle')}
                      </label>
                      <input
                        type="text"
                        required
                        value={connectionConfig.state_idle}
                        onChange={(e) => onConnectionConfigChange({ ...connectionConfig, state_idle: e.target.value })}
                        placeholder="50"
                        style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px' }}
                      />
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: '12px', padding: '16px', backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#1f2937' }}>
                    {t('chargers.modeValueMappings')}
                  </h4>
                  <p style={{ fontSize: '12px', color: '#666', marginBottom: '12px' }}>
                    {t('chargers.configureModeValues')}
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '500' }}>
                        {t('chargers.modeNormal')}
                      </label>
                      <input
                        type="text"
                        required
                        value={connectionConfig.mode_normal}
                        onChange={(e) => onConnectionConfigChange({ ...connectionConfig, mode_normal: e.target.value })}
                        placeholder="1"
                        style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '500' }}>
                        {t('chargers.modePriority')}
                      </label>
                      <input
                        type="text"
                        required
                        value={connectionConfig.mode_priority}
                        onChange={(e) => onConnectionConfigChange({ ...connectionConfig, mode_priority: e.target.value })}
                        placeholder="2"
                        style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px' }}
                      />
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <div style={{ marginTop: '16px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => onFormDataChange({ ...formData, is_active: e.target.checked })}
              />
              <span style={{ fontWeight: '500', fontSize: '14px' }}>
                {t('meters.activeCollectData')}
              </span>
            </label>
          </div>

          <div style={{ marginTop: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
              {t('common.notes')}
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => onFormDataChange({ ...formData, notes: e.target.value })}
              rows={2}
              style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontFamily: 'inherit' }}
            />
          </div>

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
              {editingCharger ? t('common.update') : t('common.create')}
            </button>
            <button
              type="button"
              onClick={onClose}
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