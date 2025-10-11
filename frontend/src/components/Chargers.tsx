import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, X, HelpCircle, Info } from 'lucide-react';
import { api } from '../api/client';
import type { Charger, Building } from '../types';

interface ChargerConnectionConfig {
  power_endpoint?: string;
  state_endpoint?: string;
  user_id_endpoint?: string;
  mode_endpoint?: string;
  ip_address?: string;
  port?: number;
  power_register?: number;
  state_register?: number;
  user_id_register?: number;
  mode_register?: number;
  unit_id?: number;
}

export default function Chargers() {
  const [chargers, setChargers] = useState<Charger[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [editingCharger, setEditingCharger] = useState<Charger | null>(null);
  const [formData, setFormData] = useState<Partial<Charger>>({
    name: '', brand: 'weidmuller', preset: 'weidmuller', building_id: 0,
    connection_type: 'http', connection_config: '{}', supports_priority: true,
    notes: '', is_active: true
  });
  const [connectionConfig, setConnectionConfig] = useState<ChargerConnectionConfig>({
    power_endpoint: '',
    state_endpoint: '',
    user_id_endpoint: '',
    mode_endpoint: '',
    ip_address: '',
    port: 502,
    power_register: 0,
    state_register: 1,
    user_id_register: 2,
    mode_register: 3,
    unit_id: 1
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [chargersData, buildingsData] = await Promise.all([
      api.getChargers(),
      api.getBuildings()
    ]);
    setChargers(chargersData);
    setBuildings(buildingsData);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    let config: ChargerConnectionConfig = {};
    
    if (formData.connection_type === 'http') {
      config = {
        power_endpoint: connectionConfig.power_endpoint,
        state_endpoint: connectionConfig.state_endpoint,
        user_id_endpoint: connectionConfig.user_id_endpoint,
        mode_endpoint: connectionConfig.mode_endpoint
      };
    } else if (formData.connection_type === 'modbus_tcp') {
      config = {
        ip_address: connectionConfig.ip_address,
        port: connectionConfig.port,
        power_register: connectionConfig.power_register,
        state_register: connectionConfig.state_register,
        user_id_register: connectionConfig.user_id_register,
        mode_register: connectionConfig.mode_register,
        unit_id: connectionConfig.unit_id
      };
    }
    
    const dataToSend = {
      ...formData,
      connection_config: JSON.stringify(config)
    };

    try {
      if (editingCharger) {
        await api.updateCharger(editingCharger.id, dataToSend);
      } else {
        await api.createCharger(dataToSend);
      }
      setShowModal(false);
      setEditingCharger(null);
      resetForm();
      loadData();
    } catch (err) {
      alert('Failed to save charger');
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm('Are you sure you want to delete this charger?')) {
      try {
        await api.deleteCharger(id);
        loadData();
      } catch (err) {
        alert('Failed to delete charger');
      }
    }
  };

  const handleEdit = (charger: Charger) => {
    setEditingCharger(charger);
    setFormData(charger);
    
    try {
      const config = JSON.parse(charger.connection_config);
      setConnectionConfig({
        power_endpoint: config.power_endpoint || '',
        state_endpoint: config.state_endpoint || '',
        user_id_endpoint: config.user_id_endpoint || '',
        mode_endpoint: config.mode_endpoint || '',
        ip_address: config.ip_address || '',
        port: config.port || 502,
        power_register: config.power_register || 0,
        state_register: config.state_register || 1,
        user_id_register: config.user_id_register || 2,
        mode_register: config.mode_register || 3,
        unit_id: config.unit_id || 1
      });
    } catch (e) {
      console.error('Failed to parse config:', e);
    }
    
    setShowModal(true);
  };

  const resetForm = () => {
    setFormData({
      name: '', brand: 'weidmuller', preset: 'weidmuller', building_id: 0,
      connection_type: 'http', connection_config: '{}', supports_priority: true,
      notes: '', is_active: true
    });
    setConnectionConfig({
      power_endpoint: '',
      state_endpoint: '',
      user_id_endpoint: '',
      mode_endpoint: '',
      ip_address: '',
      port: 502,
      power_register: 0,
      state_register: 1,
      user_id_register: 2,
      mode_register: 3,
      unit_id: 1
    });
  };

  const InstructionsModal = () => (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', 
      justifyContent: 'center', zIndex: 2000, padding: '20px'
    }}>
      <div style={{
        backgroundColor: 'white', borderRadius: '12px', padding: '30px',
        maxWidth: '800px', maxHeight: '90vh', overflow: 'auto', width: '100%'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold' }}>Charger Setup Instructions</h2>
          <button onClick={() => setShowInstructions(false)} 
            style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        <div style={{ lineHeight: '1.8', color: '#374151' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', marginTop: '20px', marginBottom: '10px', color: '#1f2937' }}>
            🚗 WeidmÃ¼ller Charger Setup
          </h3>
          <div style={{ backgroundColor: '#f3f4f6', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
            <p><strong>WeidmÃ¼ller chargers require 4 data points:</strong></p>
            <ul style={{ marginLeft: '20px', marginTop: '10px' }}>
              <li><strong>Power Consumed:</strong> Current power consumption in kWh</li>
              <li><strong>State:</strong> Charging state (charging, idle, error, etc.)</li>
              <li><strong>User ID:</strong> Which user is using the charger</li>
              <li><strong>Mode:</strong> "normal" or "priority" charging</li>
            </ul>
          </div>

          <h3 style={{ fontSize: '18px', fontWeight: '600', marginTop: '20px', marginBottom: '10px', color: '#1f2937' }}>
            🔌 HTTP Connection (Recommended)
          </h3>
          <div style={{ backgroundColor: '#f3f4f6', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
            <p><strong>Setup with Loxone or HTTP-enabled charger:</strong></p>
            <ol style={{ marginLeft: '20px', marginTop: '10px' }}>
              <li>Configure 4 separate Virtual Outputs in Loxone</li>
              <li>Set each endpoint to point to your charger's API</li>
              <li>Example endpoints:</li>
            </ol>
            <div style={{ backgroundColor: '#e5e7eb', padding: '12px', borderRadius: '6px', marginTop: '10px', fontFamily: 'monospace', fontSize: '13px' }}>
              Power: http://charger-ip/api/power<br/>
              State: http://charger-ip/api/state<br/>
              User ID: http://charger-ip/api/user_id<br/>
              Mode: http://charger-ip/api/mode
            </div>
            <p style={{ marginTop: '10px' }}><strong>Expected JSON responses:</strong></p>
            <div style={{ backgroundColor: '#e5e7eb', padding: '12px', borderRadius: '6px', marginTop: '6px', fontFamily: 'monospace', fontSize: '13px' }}>
              {"{"}"power_kwh": 12.5{"}"}<br/>
              {"{"}"state": "charging"{"}"}<br/>
              {"{"}"user_id": "USER_001"{"}"}<br/>
              {"{"}"mode": "normal"{"}"} or {"{"}"mode": "priority"{"}"}
            </div>
          </div>

          <h3 style={{ fontSize: '18px', fontWeight: '600', marginTop: '20px', marginBottom: '10px', color: '#1f2937' }}>
            ⚡ Modbus TCP Connection
          </h3>
          <div style={{ backgroundColor: '#f3f4f6', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
            <p><strong>For Modbus-compatible chargers:</strong></p>
            <ol style={{ marginLeft: '20px', marginTop: '10px' }}>
              <li>Enter the charger's IP address</li>
              <li>Port (default: 502)</li>
              <li>Configure register addresses for each data point:</li>
            </ol>
            <ul style={{ marginLeft: '40px', marginTop: '6px' }}>
              <li>Power Register (where kWh data is stored)</li>
              <li>State Register (charging state)</li>
              <li>User ID Register (current user)</li>
              <li>Mode Register (normal/priority mode)</li>
            </ul>
            <p style={{ marginTop: '10px', fontSize: '14px', color: '#6b7280' }}>
              <strong>Note:</strong> Consult your charger's documentation for exact register addresses
            </p>
          </div>

          <h3 style={{ fontSize: '18px', fontWeight: '600', marginTop: '20px', marginBottom: '10px', color: '#1f2937' }}>
            🔍 Testing & Debugging
          </h3>
          <div style={{ backgroundColor: '#dbeafe', padding: '16px', borderRadius: '8px', marginBottom: '16px', border: '1px solid #3b82f6' }}>
            <p><strong>Monitor your charger connection:</strong></p>
            <ul style={{ marginLeft: '20px', marginTop: '10px' }}>
              <li>Check Admin Logs page every 15 minutes for collection attempts</li>
              <li>Verify all 4 data points are being collected</li>
              <li>Check for error messages in the logs</li>
              <li>Ensure the charger IP is reachable from the Raspberry Pi</li>
            </ul>
          </div>

          <h3 style={{ fontSize: '18px', fontWeight: '600', marginTop: '20px', marginBottom: '10px', color: '#1f2937' }}>
            ⚠️ Troubleshooting
          </h3>
          <div style={{ backgroundColor: '#fef3c7', padding: '16px', borderRadius: '8px', border: '1px solid #f59e0b' }}>
            <ul style={{ marginLeft: '20px' }}>
              <li>Verify network connectivity: <code style={{ backgroundColor: '#fff', padding: '2px 6px', borderRadius: '4px' }}>ping charger-ip</code></li>
              <li>Check firewall allows HTTP/Modbus traffic</li>
              <li>Test endpoints manually with curl or browser</li>
              <li>Check Admin Logs for detailed error messages</li>
              <li>Verify JSON format matches expected structure</li>
              <li>Ensure all 4 endpoints return valid data</li>
            </ul>
          </div>
        </div>

        <button onClick={() => setShowInstructions(false)} style={{
          width: '100%', marginTop: '24px', padding: '12px',
          backgroundColor: '#007bff', color: 'white', border: 'none',
          borderRadius: '6px', fontSize: '14px', fontWeight: '500'
        }}>
          Got it!
        </button>
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: 'bold' }}>Car Chargers</h1>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => setShowInstructions(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
              backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px'
            }}
          >
            <HelpCircle size={18} />
            Setup Instructions
          </button>
          <button
            onClick={() => { resetForm(); setShowModal(true); }}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
              backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px'
            }}
          >
            <Plus size={18} />
            Add Charger
          </button>
        </div>
      </div>

      <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
        <table style={{ width: '100%' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '1px solid #eee' }}>
              <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>Name</th>
              <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>Brand</th>
              <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>Building</th>
              <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>Connection</th>
              <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>Priority</th>
              <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>Status</th>
              <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {chargers.map(charger => (
              <tr key={charger.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '16px', fontWeight: '500' }}>{charger.name}</td>
                <td style={{ padding: '16px' }}>{charger.brand}</td>
                <td style={{ padding: '16px' }}>
                  {buildings.find(b => b.id === charger.building_id)?.name || '-'}
                </td>
                <td style={{ padding: '16px' }}>{charger.connection_type.toUpperCase()}</td>
                <td style={{ padding: '16px' }}>
                  {charger.supports_priority ? '✓' : '✗'}
                </td>
                <td style={{ padding: '16px' }}>
                  <span style={{
                    padding: '4px 12px', borderRadius: '12px', fontSize: '12px',
                    backgroundColor: charger.is_active ? '#d4edda' : '#f8d7da',
                    color: charger.is_active ? '#155724' : '#721c24'
                  }}>
                    {charger.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td style={{ padding: '16px' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => handleEdit(charger)} style={{ padding: '6px', border: 'none', background: 'none', cursor: 'pointer' }}>
                      <Edit2 size={16} color="#007bff" />
                    </button>
                    <button onClick={() => handleDelete(charger.id)} style={{ padding: '6px', border: 'none', background: 'none', cursor: 'pointer' }}>
                      <Trash2 size={16} color="#dc3545" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {chargers.length === 0 && (
          <div style={{ padding: '60px', textAlign: 'center', color: '#999' }}>
            No chargers found. Click "Setup Instructions" to learn how to configure your first charger.
          </div>
        )}
      </div>

      {showInstructions && <InstructionsModal />}

      {showModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white', borderRadius: '12px', padding: '30px',
            width: '90%', maxWidth: '700px', maxHeight: '90vh', overflow: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <h2 style={{ fontSize: '24px', fontWeight: 'bold' }}>
                  {editingCharger ? 'Edit Charger' : 'Add Charger'}
                </h2>
                <button 
                  onClick={() => setShowInstructions(true)}
                  style={{ padding: '6px', border: 'none', background: 'none', cursor: 'pointer', color: '#007bff' }}
                  title="Show setup instructions"
                >
                  <Info size={20} />
                </button>
              </div>
              <button onClick={() => { setShowModal(false); setEditingCharger(null); }} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>Name *</label>
                <input type="text" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
              </div>

              <div style={{ marginTop: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>Brand / Preset *</label>
                <select required value={formData.brand} onChange={(e) => {
                  setFormData({ ...formData, brand: e.target.value, preset: e.target.value });
                }}
                  style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}>
                  <option value="weidmuller">WeidmÃ¼ller</option>
                </select>
                <p style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                  WeidmÃ¼ller chargers require 4 data points: power, state, user ID, and mode
                </p>
              </div>

              <div style={{ marginTop: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>Building *</label>
                <select required value={formData.building_id} onChange={(e) => setFormData({ ...formData, building_id: parseInt(e.target.value) })}
                  style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}>
                  <option value={0}>Select Building</option>
                  {buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>

              <div style={{ marginTop: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>Connection Type *</label>
                <select required value={formData.connection_type} onChange={(e) => setFormData({ ...formData, connection_type: e.target.value })}
                  style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}>
                  <option value="http">HTTP</option>
                  <option value="modbus_tcp">Modbus TCP</option>
                </select>
              </div>

              <div style={{ marginTop: '20px', padding: '20px', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>
                  Connection Configuration (WeidmÃ¼ller - 4 Data Points)
                </h3>

                {formData.connection_type === 'http' && (
                  <>
                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                        Power Consumed Endpoint *
                      </label>
                      <input type="url" required value={connectionConfig.power_endpoint}
                        onChange={(e) => setConnectionConfig({ ...connectionConfig, power_endpoint: e.target.value })}
                        placeholder="http://192.168.1.100/api/power"
                        style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                    </div>
                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                        State Endpoint *
                      </label>
                      <input type="url" required value={connectionConfig.state_endpoint}
                        onChange={(e) => setConnectionConfig({ ...connectionConfig, state_endpoint: e.target.value })}
                        placeholder="http://192.168.1.100/api/state"
                        style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                    </div>
                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                        User ID Endpoint *
                      </label>
                      <input type="url" required value={connectionConfig.user_id_endpoint}
                        onChange={(e) => setConnectionConfig({ ...connectionConfig, user_id_endpoint: e.target.value })}
                        placeholder="http://192.168.1.100/api/user_id"
                        style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                        Mode Endpoint *
                      </label>
                      <input type="url" required value={connectionConfig.mode_endpoint}
                        onChange={(e) => setConnectionConfig({ ...connectionConfig, mode_endpoint: e.target.value })}
                        placeholder="http://192.168.1.100/api/mode"
                        style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                      <p style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                        Mode endpoint returns "normal" or "priority" charging mode
                      </p>
                    </div>
                  </>
                )}

                {formData.connection_type === 'modbus_tcp' && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px', marginBottom: '12px' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          IP Address *
                        </label>
                        <input type="text" required value={connectionConfig.ip_address}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, ip_address: e.target.value })}
                          placeholder="192.168.1.100"
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          Port *
                        </label>
                        <input type="number" required value={connectionConfig.port}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, port: parseInt(e.target.value) })}
                          placeholder="502"
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          Power Register *
                        </label>
                        <input type="number" required value={connectionConfig.power_register}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, power_register: parseInt(e.target.value) })}
                          placeholder="0"
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          State Register *
                        </label>
                        <input type="number" required value={connectionConfig.state_register}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, state_register: parseInt(e.target.value) })}
                          placeholder="1"
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          User ID Register *
                        </label>
                        <input type="number" required value={connectionConfig.user_id_register}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, user_id_register: parseInt(e.target.value) })}
                          placeholder="2"
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          Mode Register *
                        </label>
                        <input type="number" required value={connectionConfig.mode_register}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, mode_register: parseInt(e.target.value) })}
                          placeholder="3"
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          Unit ID *
                        </label>
                        <input type="number" required value={connectionConfig.unit_id}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, unit_id: parseInt(e.target.value) })}
                          placeholder="1"
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div style={{ marginTop: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={formData.supports_priority} onChange={(e) => setFormData({ ...formData, supports_priority: e.target.checked })} />
                  <span style={{ fontWeight: '500', fontSize: '14px' }}>Supports Priority Charging</span>
                </label>
              </div>

              <div style={{ marginTop: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={formData.is_active} onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })} />
                  <span style={{ fontWeight: '500', fontSize: '14px' }}>Active (collect data)</span>
                </label>
              </div>

              <div style={{ marginTop: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>Notes</label>
                <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={2} style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontFamily: 'inherit' }} />
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button type="submit" style={{
                  flex: 1, padding: '12px', backgroundColor: '#007bff', color: 'white',
                  border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '500'
                }}>
                  {editingCharger ? 'Update' : 'Create'}
                </button>
                <button type="button" onClick={() => { setShowModal(false); setEditingCharger(null); }} style={{
                  flex: 1, padding: '12px', backgroundColor: '#6c757d', color: 'white',
                  border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '500'
                }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}