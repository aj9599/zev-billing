import React from 'react';
import { X, Info, Wifi, AlertCircle, Check } from 'lucide-react';
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

  // Determine mode based on CONNECTION_TYPE (not preset)
  const isSingleBlockMode = formData.connection_type === 'loxone_api_single';
  const isMultiUuidMode = formData.connection_type === 'loxone_api_multi';
  const isLoxoneMode = isSingleBlockMode || isMultiUuidMode;

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
          {/* Charger Name */}
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

          {/* Brand/Preset - Dynamically rendered from presets */}
          <div style={{ marginTop: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
              {t('chargers.brand')} *
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

          {/* Building */}
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

          {/* Connection Type - THIS IS WHERE YOU CHOOSE */}
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
              {formData.brand === 'weidmuller' && (
                <>
                  <option value="loxone_api_single">Loxone API (Single-Block UUID) â­ Recommended</option>
                  <option value="loxone_api_multi">Loxone API (Multi-UUID) - Legacy</option>
                  <option value="modbus_tcp">Modbus TCP</option>
                  <option value="udp">UDP Listener</option>
                  <option value="http">HTTP REST API</option>
                </>
              )}
              {formData.brand === 'zaptec' && (
                <option value="zaptec_api">Zaptec Cloud API</option>
              )}
            </select>
            {isSingleBlockMode && (
              <p style={{ fontSize: '12px', color: '#10b981', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Check size={14} /> Best option: All charger data in one response (23 outputs)
              </p>
            )}
            {isMultiUuidMode && (
              <p style={{ fontSize: '12px', color: '#f59e0b', marginTop: '4px' }}>
                âš ï¸ Legacy mode: Requires 4 separate UUIDs (slower)
              </p>
            )}
          </div>

          {/* Connection Configuration Section */}
          <div style={{ marginTop: '20px', padding: '20px', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>
              {t('chargers.connectionConfig')}
            </h3>

            {/* LOXONE API CONFIGURATION */}
            {isLoxoneMode && (
              <>
                {/* Connection Mode: Local vs Remote */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                    Connection Mode *
                  </label>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', flex: 1, padding: '10px', border: connectionConfig.loxone_connection_mode === 'local' ? '2px solid #007bff' : '1px solid #ddd', borderRadius: '6px', backgroundColor: connectionConfig.loxone_connection_mode === 'local' ? '#e7f3ff' : 'white' }}>
                      <input 
                        type="radio" 
                        name="loxone_mode" 
                        value="local"
                        checked={connectionConfig.loxone_connection_mode === 'local'}
                        onChange={() => onConnectionConfigChange({ ...connectionConfig, loxone_connection_mode: 'local' })}
                      />
                      <Wifi size={16} />
                      <span style={{ fontSize: '14px', fontWeight: '500' }}>Local IP</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', flex: 1, padding: '10px', border: connectionConfig.loxone_connection_mode === 'remote' ? '2px solid #007bff' : '1px solid #ddd', borderRadius: '6px', backgroundColor: connectionConfig.loxone_connection_mode === 'remote' ? '#e7f3ff' : 'white' }}>
                      <input 
                        type="radio" 
                        name="loxone_mode" 
                        value="remote"
                        checked={connectionConfig.loxone_connection_mode === 'remote'}
                        onChange={() => onConnectionConfigChange({ ...connectionConfig, loxone_connection_mode: 'remote' })}
                      />
                      <Wifi size={16} />
                      <span style={{ fontSize: '14px', fontWeight: '500' }}>Remote (Cloud)</span>
                    </label>
                  </div>
                </div>

                {/* Host or MAC Address */}
                {connectionConfig.loxone_connection_mode === 'local' ? (
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '500' }}>
                      Loxone Miniserver IP Address *
                    </label>
                    <input 
                      type="text" 
                      required 
                      value={connectionConfig.loxone_host}
                      onChange={(e) => onConnectionConfigChange({ ...connectionConfig, loxone_host: e.target.value })}
                      placeholder="192.168.1.100"
                      style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} 
                    />
                    <p style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                      Internal network IP address of your Miniserver
                    </p>
                  </div>
                ) : (
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '500' }}>
                      Miniserver MAC Address *
                    </label>
                    <input 
                      type="text" 
                      required 
                      value={connectionConfig.loxone_mac_address}
                      onChange={(e) => onConnectionConfigChange({ ...connectionConfig, loxone_mac_address: e.target.value })}
                      placeholder="504F94XXXXXX"
                      style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} 
                    />
                    <p style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                      Find in Loxone Config â†’ Miniserver â†’ Network â†’ MAC Address
                    </p>
                  </div>
                )}

                {/* Loxone Credentials */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '500' }}>
                      Username *
                    </label>
                    <input 
                      type="text" 
                      required 
                      value={connectionConfig.loxone_username}
                      onChange={(e) => onConnectionConfigChange({ ...connectionConfig, loxone_username: e.target.value })}
                      placeholder="admin"
                      style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} 
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '500' }}>
                      Password *
                    </label>
                    <input 
                      type="password" 
                      required 
                      value={connectionConfig.loxone_password}
                      onChange={(e) => onConnectionConfigChange({ ...connectionConfig, loxone_password: e.target.value })}
                      placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
                      style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} 
                    />
                  </div>
                </div>

                {/* SINGLE-BLOCK MODE: One UUID field */}
                {isSingleBlockMode && (
                  <div style={{ 
                    backgroundColor: '#dbeafe', 
                    padding: '16px', 
                    borderRadius: '8px', 
                    border: '2px solid #3b82f6',
                    marginTop: '16px'
                  }}>
                    <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#1e40af', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Check size={16} />
                      Single-Block UUID (Recommended)
                    </h4>
                    <p style={{ fontSize: '12px', color: '#1e40af', marginBottom: '12px' }}>
                      Copy the UUID from the entire eMobility Charger BLOCK (not individual outputs)
                    </p>
                    
                    <div>
                      <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '500' }}>
                        Charger Block UUID *
                      </label>
                      <input 
                        type="text" 
                        required 
                        value={connectionConfig.loxone_charger_block_uuid}
                        onChange={(e) => onConnectionConfigChange({ ...connectionConfig, loxone_charger_block_uuid: e.target.value })}
                        placeholder="1fa4aa46-0000-0000-ffffed57184a04d2"
                        style={{ width: '100%', padding: '10px', border: '1px solid #3b82f6', borderRadius: '6px', fontFamily: 'monospace' }} 
                      />
                      <p style={{ fontSize: '11px', color: '#1e40af', marginTop: '6px' }}>
                        â„¹ï¸ Right-click the eMobility Charger BLOCK â†’ Properties â†’ Copy UUID
                      </p>
                    </div>

                    <div style={{ marginTop: '12px', padding: '12px', backgroundColor: '#eff6ff', borderRadius: '6px', border: '1px solid #93c5fd' }}>
                      <p style={{ fontSize: '11px', color: '#1e40af', fontWeight: '600', marginBottom: '6px' }}>
                        âœ¨ Features with Single-Block Mode:
                      </p>
                      <ul style={{ fontSize: '11px', color: '#1e40af', margin: 0, paddingLeft: '20px', lineHeight: '1.6' }}>
                        <li>All 23 outputs in one request (4x faster)</li>
                        <li>Enhanced session tracking with exact timing</li>
                        <li>Weekly, monthly, yearly energy statistics</li>
                        <li>Automatic user detection from Uid and Lcl</li>
                        <li>Last session energy and duration</li>
                      </ul>
                    </div>
                  </div>
                )}

                {/* MULTI-UUID MODE: Four UUID fields */}
                {isMultiUuidMode && (
                  <div style={{ 
                    backgroundColor: '#fef3c7', 
                    padding: '16px', 
                    borderRadius: '8px', 
                    border: '2px solid #f59e0b',
                    marginTop: '16px'
                  }}>
                    <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#92400e', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <AlertCircle size={16} />
                      Multi-UUID Mode (Legacy)
                    </h4>
                    <p style={{ fontSize: '12px', color: '#92400e', marginBottom: '12px' }}>
                      Copy UUIDs from individual virtual outputs (4 separate UUIDs required)
                    </p>
                    
                    <div style={{ display: 'grid', gap: '12px' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '500' }}>
                          Power UUID (Cp) *
                        </label>
                        <input 
                          type="text" 
                          required 
                          value={connectionConfig.loxone_power_uuid}
                          onChange={(e) => onConnectionConfigChange({ ...connectionConfig, loxone_power_uuid: e.target.value })}
                          placeholder="1fa4aa46-0111-4618-ffffed57184a04d2"
                          style={{ width: '100%', padding: '10px', border: '1px solid #f59e0b', borderRadius: '6px', fontFamily: 'monospace', fontSize: '13px' }} 
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '500' }}>
                          State UUID (Cac) *
                        </label>
                        <input 
                          type="text" 
                          required 
                          value={connectionConfig.loxone_state_uuid}
                          onChange={(e) => onConnectionConfigChange({ ...connectionConfig, loxone_state_uuid: e.target.value })}
                          placeholder="1fa4aa47-01dc-5290-ffffed57184a04d2"
                          style={{ width: '100%', padding: '10px', border: '1px solid #f59e0b', borderRadius: '6px', fontFamily: 'monospace', fontSize: '13px' }} 
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '500' }}>
                          User ID UUID (Uid) *
                        </label>
                        <input 
                          type="text" 
                          required 
                          value={connectionConfig.loxone_user_id_uuid}
                          onChange={(e) => onConnectionConfigChange({ ...connectionConfig, loxone_user_id_uuid: e.target.value })}
                          placeholder="1fa4aa47-035a-5f0b-ffffed57184a04d2"
                          style={{ width: '100%', padding: '10px', border: '1px solid #f59e0b', borderRadius: '6px', fontFamily: 'monospace', fontSize: '13px' }} 
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '500' }}>
                          Mode UUID (M) *
                        </label>
                        <input 
                          type="text" 
                          required 
                          value={connectionConfig.loxone_mode_uuid}
                          onChange={(e) => onConnectionConfigChange({ ...connectionConfig, loxone_mode_uuid: e.target.value })}
                          placeholder="1fa4aa48-0196-6b89-ffffed57184a04d2"
                          style={{ width: '100%', padding: '10px', border: '1px solid #f59e0b', borderRadius: '6px', fontFamily: 'monospace', fontSize: '13px' }} 
                        />
                      </div>
                    </div>

                    <div style={{ marginTop: '12px', padding: '12px', backgroundColor: '#fef9c3', borderRadius: '6px', border: '1px solid #fde047' }}>
                      <p style={{ fontSize: '11px', color: '#92400e', fontWeight: '600', marginBottom: '6px' }}>
                        ðŸ’¡ Tip: Consider upgrading to Single-Block mode for:
                      </p>
                      <ul style={{ fontSize: '11px', color: '#92400e', margin: 0, paddingLeft: '20px', lineHeight: '1.6' }}>
                        <li>4x faster data collection (1 request instead of 4)</li>
                        <li>Enhanced statistics (weekly, monthly, yearly)</li>
                        <li>Better session tracking with exact timing</li>
                      </ul>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ZAPTEC API CONFIGURATION */}
            {formData.connection_type === 'zaptec_api' && (
              <div style={{ backgroundColor: '#e0f2fe', padding: '16px', borderRadius: '8px', border: '1px solid #0ea5e9' }}>
                <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#0c4a6e' }}>
                  Zaptec Cloud Credentials
                </h4>
                <div style={{ display: 'grid', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '500' }}>
                      Zaptec Username *
                    </label>
                    <input 
                      type="text" 
                      required 
                      value={connectionConfig.zaptec_username}
                      onChange={(e) => onConnectionConfigChange({ ...connectionConfig, zaptec_username: e.target.value })}
                      placeholder="your@email.com"
                      style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} 
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '500' }}>
                      Zaptec Password *
                    </label>
                    <input 
                      type="password" 
                      required 
                      value={connectionConfig.zaptec_password}
                      onChange={(e) => onConnectionConfigChange({ ...connectionConfig, zaptec_password: e.target.value })}
                      placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
                      style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} 
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '500' }}>
                      Charger ID *
                    </label>
                    <input 
                      type="text" 
                      required 
                      value={connectionConfig.zaptec_charger_id}
                      onChange={(e) => onConnectionConfigChange({ ...connectionConfig, zaptec_charger_id: e.target.value })}
                      placeholder="ZAP123456"
                      style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} 
                    />
                    <p style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                      Find in Zaptec Portal â†’ Chargers â†’ Charger Details
                    </p>
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '500' }}>
                      Installation ID (Optional)
                    </label>
                    <input 
                      type="text" 
                      value={connectionConfig.zaptec_installation_id || ''}
                      onChange={(e) => onConnectionConfigChange({ ...connectionConfig, zaptec_installation_id: e.target.value })}
                      placeholder="INST123456"
                      style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} 
                    />
                  </div>
                </div>
              </div>
            )}

            {/* MODBUS TCP CONFIGURATION */}
            {formData.connection_type === 'modbus_tcp' && (
              <div style={{ display: 'grid', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '500' }}>
                    IP Address *
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '500' }}>
                      Port *
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
                  <div>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '500' }}>
                      Unit ID *
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
                {/* Register mappings for Modbus */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '500' }}>
                      Power Register *
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
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '500' }}>
                      State Register *
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
                </div>
              </div>
            )}

            {/* UDP CONFIGURATION */}
            {formData.connection_type === 'udp' && (
              <div style={{ display: 'grid', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '500' }}>
                    Listen Port *
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '500' }}>
                      Power Key *
                    </label>
                    <input 
                      type="text" 
                      required 
                      value={connectionConfig.power_key}
                      onChange={(e) => onConnectionConfigChange({ ...connectionConfig, power_key: e.target.value })}
                      placeholder="power"
                      style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} 
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '500' }}>
                      State Key *
                    </label>
                    <input 
                      type="text" 
                      required 
                      value={connectionConfig.state_key}
                      onChange={(e) => onConnectionConfigChange({ ...connectionConfig, state_key: e.target.value })}
                      placeholder="state"
                      style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} 
                    />
                  </div>
                </div>
              </div>
            )}

            {/* State and Mode Mappings - Only for non-Loxone-single-block, non-Zaptec */}
            {formData.brand !== 'zaptec' && !isSingleBlockMode && formData.connection_type !== 'loxone_api_single' && (
              <>
                <div style={{ marginTop: '20px', padding: '16px', backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#1f2937' }}>
                    State Value Mappings
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '500' }}>
                        Cable Locked
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
                        Waiting Auth
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
                        Charging
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
                        Idle
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
                    Mode Value Mappings
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '500' }}>
                        Normal Mode
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
                        Priority Mode
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

          {/* Active Checkbox */}
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

          {/* Notes */}
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

          {/* Buttons */}
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