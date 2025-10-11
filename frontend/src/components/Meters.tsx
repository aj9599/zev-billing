import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, X, Info, HelpCircle, Zap, Download } from 'lucide-react';
import { api } from '../api/client';
import type { Meter, Building, User } from '../types';

interface ConnectionConfig {
  endpoint?: string;
  power_field?: string;
  ip_address?: string;
  port?: number;
  register_address?: number;
  register_count?: number;
  unit_id?: number;
  listen_port?: number;
  data_key?: string;
}

export default function Meters() {
  const [meters, setMeters] = useState<Meter[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [editingMeter, setEditingMeter] = useState<Meter | null>(null);
  const [formData, setFormData] = useState<Partial<Meter>>({
    name: '', meter_type: 'total_meter', building_id: 0, user_id: undefined,
    connection_type: 'http', connection_config: '{}', notes: '', is_active: true
  });
  const [connectionConfig, setConnectionConfig] = useState<ConnectionConfig>({
    endpoint: '',
    power_field: 'power_kwh',
    ip_address: '',
    port: 502,
    register_address: 0,
    register_count: 2,
    unit_id: 1,
    listen_port: 8888,
    data_key: 'power_kwh'
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [metersData, buildingsData, usersData] = await Promise.all([
      api.getMeters(),
      api.getBuildings(),
      api.getUsers()
    ]);
    setMeters(metersData);
    setBuildings(buildingsData);
    setUsers(usersData);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    let config: ConnectionConfig = {};
    
    if (formData.connection_type === 'http') {
      config = {
        endpoint: connectionConfig.endpoint,
        power_field: connectionConfig.power_field
      };
    } else if (formData.connection_type === 'modbus_tcp') {
      config = {
        ip_address: connectionConfig.ip_address,
        port: connectionConfig.port,
        register_address: connectionConfig.register_address,
        register_count: connectionConfig.register_count,
        unit_id: connectionConfig.unit_id
      };
    } else if (formData.connection_type === 'udp') {
      config = {
        listen_port: connectionConfig.listen_port,
        data_key: connectionConfig.data_key
      };
    }
    
    const dataToSend = {
      ...formData,
      connection_config: JSON.stringify(config)
    };

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
    } catch (err) {
      alert('Failed to save meter');
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm('Are you sure you want to delete this meter?')) {
      try {
        await api.deleteMeter(id);
        loadData();
      } catch (err) {
        alert('Failed to delete meter');
      }
    }
  };

  const handleEdit = (meter: Meter) => {
    setEditingMeter(meter);
    setFormData(meter);
    
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
        listen_port: config.listen_port || 8888,
        data_key: config.data_key || 'power_kwh'
      });
    } catch (e) {
      console.error('Failed to parse config:', e);
    }
    
    setShowModal(true);
  };

  const handleExport = async () => {
    try {
      const response = await fetch('/api/billing/export?type=meters', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `meters-export-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('Failed to export data');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '', meter_type: 'total_meter', building_id: 0, user_id: undefined,
      connection_type: 'http', connection_config: '{}', notes: '', is_active: true
    });
    setConnectionConfig({
      endpoint: '',
      power_field: 'power_kwh',
      ip_address: '',
      port: 502,
      register_address: 0,
      register_count: 2,
      unit_id: 1,
      listen_port: 8888,
      data_key: 'power_kwh'
    });
  };

  const meterTypes = [
    { value: 'total_meter', label: 'Total Meter' },
    { value: 'solar_meter', label: 'Solar Meter' },
    { value: 'apartment_meter', label: 'Apartment Meter' },
    { value: 'heating_meter', label: 'Heating Meter' },
    { value: 'other', label: 'Other' }
  ];

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
          <h2 style={{ fontSize: '24px', fontWeight: 'bold' }}>Meter Setup Instructions</h2>
          <button onClick={() => setShowInstructions(false)} 
            style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        <div style={{ lineHeight: '1.8', color: '#374151' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', marginTop: '20px', marginBottom: '10px', color: '#1f2937' }}>
            🔌 HTTP Connection (Recommended for Loxone)
          </h3>
          <div style={{ backgroundColor: '#f3f4f6', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
            <p><strong>Loxone Virtual Output Setup:</strong></p>
            <ol style={{ marginLeft: '20px', marginTop: '10px' }}>
              <li>In Loxone Config, create a Virtual Output</li>
              <li>Set the address to: <code style={{ backgroundColor: '#e5e7eb', padding: '2px 6px', borderRadius: '4px' }}>http://YOUR_RASPBERRY_IP:8080/api/meters/data</code></li>
              <li>In the meter configuration, set endpoint to the same URL</li>
              <li>Set power_field to match your JSON field name (default: "power_kwh")</li>
              <li>Loxone should send: <code style={{ backgroundColor: '#e5e7eb', padding: '2px 6px', borderRadius: '4px' }}>{"{"}"power_kwh": 123.45{"}"}</code></li>
            </ol>
          </div>

          <h3 style={{ fontSize: '18px', fontWeight: '600', marginTop: '20px', marginBottom: '10px', color: '#1f2937' }}>
            📡 UDP Connection (Shared Port - RECOMMENDED!)
          </h3>
          <div style={{ backgroundColor: '#dbeafe', padding: '16px', borderRadius: '8px', marginBottom: '16px', border: '2px solid #3b82f6' }}>
            <p><strong>⭐ NEW: Share ONE UDP port for multiple meters!</strong></p>
            <ol style={{ marginLeft: '20px', marginTop: '10px' }}>
              <li>In Loxone Config, create Virtual Output UDP devices</li>
              <li>Set ALL meters to the SAME port (e.g., 8888)</li>
              <li>Each meter uses a UNIQUE JSON key to identify its data</li>
              <li><strong>Example for Building A with 3 meters:</strong></li>
            </ol>
            <div style={{ backgroundColor: '#fff', padding: '12px', borderRadius: '6px', marginTop: '10px', fontFamily: 'monospace', fontSize: '13px' }}>
              <strong>Apartment Meter 1:</strong><br/>
              Port: 8888<br/>
              Data Key: "apart1_kwh"<br/>
              Loxone sends: {"{"}"apart1_kwh": &lt;v&gt;{"}"}<br/><br/>
              
              <strong>Apartment Meter 2:</strong><br/>
              Port: 8888 (same port!)<br/>
              Data Key: "apart2_kwh"<br/>
              Loxone sends: {"{"}"apart2_kwh": &lt;v&gt;{"}"}<br/><br/>
              
              <strong>Solar Meter:</strong><br/>
              Port: 8888 (same port!)<br/>
              Data Key: "solar_kwh"<br/>
              Loxone sends: {"{"}"solar_kwh": &lt;v&gt;{"}"}
            </div>
            <p style={{ marginTop: '10px', fontSize: '14px', color: '#1f2937' }}>
              <strong>Benefits:</strong> One UDP port per building instead of one per meter. Much cleaner network configuration!
            </p>
          </div>

          <h3 style={{ fontSize: '18px', fontWeight: '600', marginTop: '20px', marginBottom: '10px', color: '#1f2937' }}>
            🔧 Testing Your Connection
          </h3>
          <div style={{ backgroundColor: '#dbeafe', padding: '16px', borderRadius: '8px', marginBottom: '16px', border: '1px solid #3b82f6' }}>
            <p><strong>Check the Admin Logs page to see:</strong></p>
            <ul style={{ marginLeft: '20px', marginTop: '10px' }}>
              <li>Data collection attempts every 15 minutes</li>
              <li>Successful meter readings with data keys</li>
              <li>Connection errors and debugging information</li>
              <li>UDP packet reception logs showing which keys were received</li>
            </ul>
          </div>

          <h3 style={{ fontSize: '18px', fontWeight: '600', marginTop: '20px', marginBottom: '10px', color: '#1f2937' }}>
            ⚡ Modbus TCP Connection
          </h3>
          <div style={{ backgroundColor: '#f3f4f6', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
            <p><strong>For Modbus-compatible meters:</strong></p>
            <ol style={{ marginLeft: '20px', marginTop: '10px' }}>
              <li>Enter the meter's IP address</li>
              <li>Port (default: 502)</li>
              <li>Register address where power data is stored</li>
              <li>Number of registers to read (typically 2 for float values)</li>
              <li>Unit ID (slave address, typically 1)</li>
            </ol>
          </div>

          <h3 style={{ fontSize: '18px', fontWeight: '600', marginTop: '20px', marginBottom: '10px', color: '#1f2937' }}>
            🔍 Troubleshooting
          </h3>
          <div style={{ backgroundColor: '#fef3c7', padding: '16px', borderRadius: '8px', border: '1px solid #f59e0b' }}>
            <ul style={{ marginLeft: '20px' }}>
              <li>Check firewall: <code style={{ backgroundColor: '#fff', padding: '2px 6px', borderRadius: '4px' }}>sudo ufw status</code></li>
              <li>Verify service: <code style={{ backgroundColor: '#fff', padding: '2px 6px', borderRadius: '4px' }}>sudo systemctl status zev-billing</code></li>
              <li>Check logs: <code style={{ backgroundColor: '#fff', padding: '2px 6px', borderRadius: '4px' }}>journalctl -u zev-billing -f</code></li>
              <li>Test network: <code style={{ backgroundColor: '#fff', padding: '2px 6px', borderRadius: '4px' }}>ping YOUR_LOXONE_IP</code></li>
              <li>Monitor the Admin Logs page in real-time for debugging</li>
              <li><strong>UDP:</strong> Make sure each meter has a UNIQUE data_key!</li>
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
        <div>
          <h1 style={{ 
            fontSize: '36px', 
            fontWeight: '800', 
            marginBottom: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
          }}>
            <Zap size={36} style={{ color: '#667eea' }} />
            Power Meters
          </h1>
          <p style={{ color: '#6b7280', fontSize: '16px' }}>
            Monitor and manage power consumption meters
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={handleExport}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
              backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px', cursor: 'pointer'
            }}
          >
            <Download size={18} />
            Export Data
          </button>
          <button
            onClick={() => setShowInstructions(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
              backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px', cursor: 'pointer'
            }}
          >
            <HelpCircle size={18} />
            Setup Instructions
          </button>
          <button
            onClick={() => { resetForm(); setShowModal(true); }}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
              backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px', cursor: 'pointer'
            }}
          >
            <Plus size={18} />
            Add Meter
          </button>
        </div>
      </div>

      <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
        <table style={{ width: '100%' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '1px solid #eee' }}>
              <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>Name</th>
              <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>Type</th>
              <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>Building</th>
              <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>Connection</th>
              <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>Last Reading</th>
              <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>Status</th>
              <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {meters.map(meter => (
              <tr key={meter.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '16px', fontWeight: '500' }}>{meter.name}</td>
                <td style={{ padding: '16px' }}>{meter.meter_type.replace('_', ' ')}</td>
                <td style={{ padding: '16px' }}>
                  {buildings.find(b => b.id === meter.building_id)?.name || '-'}
                </td>
                <td style={{ padding: '16px' }}>{meter.connection_type.toUpperCase()}</td>
                <td style={{ padding: '16px' }}>
                  {meter.last_reading ? `${meter.last_reading.toFixed(2)} kWh` : '-'}
                </td>
                <td style={{ padding: '16px' }}>
                  <span style={{
                    padding: '4px 12px', borderRadius: '12px', fontSize: '12px',
                    backgroundColor: meter.is_active ? '#d4edda' : '#f8d7da',
                    color: meter.is_active ? '#155724' : '#721c24'
                  }}>
                    {meter.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td style={{ padding: '16px' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => handleEdit(meter)} style={{ padding: '6px', border: 'none', background: 'none', cursor: 'pointer' }}>
                      <Edit2 size={16} color="#007bff" />
                    </button>
                    <button onClick={() => handleDelete(meter.id)} style={{ padding: '6px', border: 'none', background: 'none', cursor: 'pointer' }}>
                      <Trash2 size={16} color="#dc3545" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {meters.length === 0 && (
          <div style={{ padding: '60px', textAlign: 'center', color: '#999' }}>
            No meters found. Click "Setup Instructions" to learn how to configure your first meter.
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
                  {editingMeter ? 'Edit Meter' : 'Add Meter'}
                </h2>
                <button 
                  onClick={() => setShowInstructions(true)}
                  style={{ padding: '6px', border: 'none', background: 'none', cursor: 'pointer', color: '#007bff' }}
                  title="Show setup instructions"
                >
                  <Info size={20} />
                </button>
              </div>
              <button onClick={() => { setShowModal(false); setEditingMeter(null); }} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
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
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>Meter Type *</label>
                <select required value={formData.meter_type} onChange={(e) => setFormData({ ...formData, meter_type: e.target.value })}
                  style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}>
                  {meterTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>

              <div style={{ marginTop: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>Building *</label>
                <select required value={formData.building_id} onChange={(e) => setFormData({ ...formData, building_id: parseInt(e.target.value) })}
                  style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}>
                  <option value={0}>Select Building</option>
                  {buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>

              {formData.meter_type === 'apartment_meter' && (
                <div style={{ marginTop: '16px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>User (for apartment meter)</label>
                  <select value={formData.user_id || ''} onChange={(e) => setFormData({ ...formData, user_id: e.target.value ? parseInt(e.target.value) : undefined })}
                    style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}>
                    <option value="">Select User</option>
                    {users.filter(u => u.building_id === formData.building_id).map(u => (
                      <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ marginTop: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>Connection Type *</label>
                <select required value={formData.connection_type} onChange={(e) => setFormData({ ...formData, connection_type: e.target.value })}
                  style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}>
                  <option value="http">HTTP (Loxone Virtual Output)</option>
                  <option value="udp">UDP (Shared Port - Recommended!)</option>
                  <option value="modbus_tcp">Modbus TCP</option>
                </select>
              </div>

              <div style={{ marginTop: '20px', padding: '20px', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>
                  Connection Configuration
                </h3>

                {formData.connection_type === 'http' && (
                  <>
                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                        Endpoint URL *
                      </label>
                      <input type="url" required value={connectionConfig.endpoint}
                        onChange={(e) => setConnectionConfig({ ...connectionConfig, endpoint: e.target.value })}
                        placeholder="http://YOUR_LOXONE_IP/api/power"
                        style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                        Power Field Name *
                      </label>
                      <input type="text" required value={connectionConfig.power_field}
                        onChange={(e) => setConnectionConfig({ ...connectionConfig, power_field: e.target.value })}
                        placeholder="power_kwh"
                        style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                      <p style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                        JSON field name that contains the power value in kWh
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
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          Register Address *
                        </label>
                        <input type="number" required value={connectionConfig.register_address}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, register_address: parseInt(e.target.value) })}
                          placeholder="0"
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          Register Count *
                        </label>
                        <input type="number" required value={connectionConfig.register_count}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, register_count: parseInt(e.target.value) })}
                          placeholder="2"
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

                {formData.connection_type === 'udp' && (
                  <>
                    <div style={{ backgroundColor: '#dbeafe', padding: '12px', borderRadius: '6px', marginBottom: '12px', border: '1px solid #3b82f6' }}>
                      <p style={{ fontSize: '13px', color: '#1e40af', margin: 0 }}>
                        <strong>⭐ Shared UDP Port:</strong> Multiple meters can share the same port! Use unique data keys to distinguish them.
                      </p>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          Listen Port *
                        </label>
                        <input type="number" required value={connectionConfig.listen_port}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, listen_port: parseInt(e.target.value) })}
                          placeholder="8888"
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                        <p style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                          Same port for all meters in this building
                        </p>
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          Data Key (JSON field) *
                        </label>
                        <input type="text" required value={connectionConfig.data_key}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, data_key: e.target.value })}
                          placeholder="apart1_kwh"
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                        <p style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                          Unique key like: apart1_kwh, solar_kwh, etc.
                        </p>
                      </div>
                    </div>
                    <div style={{ backgroundColor: '#fff', padding: '12px', borderRadius: '6px', marginTop: '12px', fontFamily: 'monospace', fontSize: '12px', border: '1px solid #e5e7eb' }}>
                      <strong>Loxone Configuration:</strong><br/>
                      Virtual Output UDP to {connectionConfig.listen_port || 8888}<br/>
                      Command: {"{"}"<span style={{ color: '#3b82f6' }}>{connectionConfig.data_key || 'YOUR_KEY'}</span>": &lt;v&gt;{"}"}
                    </div>
                  </>
                )}
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
                  {editingMeter ? 'Update' : 'Create'}
                </button>
                <button type="button" onClick={() => { setShowModal(false); setEditingMeter(null); }} style={{
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