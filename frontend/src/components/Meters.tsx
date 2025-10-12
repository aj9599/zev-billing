import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, X, Info, HelpCircle, Zap, Download, Search, Building } from 'lucide-react';
import { api } from '../api/client';
import type { Meter, Building as BuildingType, User } from '../types';
import { useTranslation } from '../i18n';

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
  const { t } = useTranslation();
  const [meters, setMeters] = useState<Meter[]>([]);
  const [buildings, setBuildings] = useState<BuildingType[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedBuildingId, setSelectedBuildingId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [editingMeter, setEditingMeter] = useState<Meter | null>(null);
  const [formData, setFormData] = useState<Partial<Meter>>({
    name: '', meter_type: 'total_meter', building_id: 0, user_id: undefined,
    connection_type: 'udp', connection_config: '{}', notes: '', is_active: true
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
    setBuildings(buildingsData.filter(b => !b.is_group));
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
      alert(t('meters.saveFailed'));
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm(t('meters.deleteConfirm'))) {
      try {
        await api.deleteMeter(id);
        loadData();
      } catch (err) {
        alert(t('meters.deleteFailed'));
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
      alert(t('meters.exportFailed'));
    }
  };

  const resetForm = () => {
    setFormData({
      name: '', meter_type: 'total_meter', building_id: 0, user_id: undefined,
      connection_type: 'udp', connection_config: '{}', notes: '', is_active: true
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
    { value: 'total_meter', label: t('meters.totalMeter') },
    { value: 'solar_meter', label: t('meters.solarMeter') },
    { value: 'apartment_meter', label: t('meters.apartmentMeter') },
    { value: 'heating_meter', label: t('meters.heatingMeter') },
    { value: 'other', label: t('meters.other') }
  ];

  const filteredBuildings = buildings.filter(b =>
    b.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredMeters = selectedBuildingId
    ? meters.filter(m => m.building_id === selectedBuildingId)
    : meters;

  const groupedMeters = filteredMeters.reduce((acc, meter) => {
    if (!acc[meter.building_id]) {
      acc[meter.building_id] = [];
    }
    acc[meter.building_id].push(meter);
    return acc;
  }, {} as Record<number, Meter[]>);

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
              Loxone sends: {"{\"apart1_kwh\": <v>}"}<br/><br/>
              
              <strong>Apartment Meter 2:</strong><br/>
              Port: 8888 (same port!)<br/>
              Data Key: "apart2_kwh"<br/>
              Loxone sends: {"{\"apart2_kwh\": <v>}"}<br/><br/>
              
              <strong>Solar Meter:</strong><br/>
              Port: 8888 (same port!)<br/>
              Data Key: "solar_kwh"<br/>
              Loxone sends: {"{\"solar_kwh\": <v>}"}
            </div>
            <p style={{ marginTop: '10px', fontSize: '14px', color: '#1f2937' }}>
              <strong>Benefits:</strong> One UDP port per building instead of one per meter. Much cleaner network configuration!
            </p>
          </div>

          <h3 style={{ fontSize: '18px', fontWeight: '600', marginTop: '20px', marginBottom: '10px', color: '#1f2937' }}>
            🔌 HTTP Connection (Alternative)
          </h3>
          <div style={{ backgroundColor: '#f3f4f6', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
            <p><strong>Loxone Virtual Output Setup:</strong></p>
            <ol style={{ marginLeft: '20px', marginTop: '10px' }}>
              <li>In Loxone Config, create a Virtual Output</li>
              <li>Set the address to: <code style={{ backgroundColor: '#e5e7eb', padding: '2px 6px', borderRadius: '4px' }}>http://YOUR_RASPBERRY_IP:8080/api/meters/data</code></li>
              <li>In the meter configuration, set endpoint to the same URL</li>
              <li>Set power_field to match your JSON field name (default: "power_kwh")</li>
              <li>Loxone should send: <code style={{ backgroundColor: '#e5e7eb', padding: '2px 6px', borderRadius: '4px' }}>{"{\"power_kwh\": 123.45}"}</code></li>
            </ol>
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
          {t('common.close')}
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
            {t('meters.title')}
          </h1>
          <p style={{ color: '#6b7280', fontSize: '16px' }}>
            {t('meters.subtitle')}
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
            {t('meters.exportData')}
          </button>
          <button
            onClick={() => setShowInstructions(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
              backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px', cursor: 'pointer'
            }}
          >
            <HelpCircle size={18} />
            {t('meters.setupInstructions')}
          </button>
          <button
            onClick={() => { resetForm(); setShowModal(true); }}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
              backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px', cursor: 'pointer'
            }}
          >
            <Plus size={18} />
            {t('meters.addMeter')}
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ position: 'relative', maxWidth: '400px' }}>
          <Search size={20} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
          <input
            type="text"
            placeholder="Search buildings..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 10px 10px 40px',
              border: '1px solid #ddd',
              borderRadius: '8px',
              fontSize: '14px'
            }}
          />
        </div>
      </div>

      {/* Building Cards */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', 
        gap: '16px', 
        marginBottom: '30px' 
      }}>
        {/* All Buildings Card */}
        <div
          onClick={() => setSelectedBuildingId(null)}
          style={{
            padding: '20px',
            backgroundColor: selectedBuildingId === null ? '#667eea' : 'white',
            color: selectedBuildingId === null ? 'white' : '#1f2937',
            borderRadius: '12px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            cursor: 'pointer',
            transition: 'all 0.2s',
            border: selectedBuildingId === null ? '2px solid #667eea' : '2px solid transparent'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <Building size={24} />
            <h3 style={{ fontSize: '18px', fontWeight: '600', margin: 0 }}>
              All Buildings
            </h3>
          </div>
          <p style={{ fontSize: '14px', margin: 0, opacity: 0.9 }}>
            {meters.length} meters
          </p>
        </div>

        {/* Individual Building Cards */}
        {filteredBuildings.map(building => {
          const buildingMeters = meters.filter(m => m.building_id === building.id);
          return (
            <div
              key={building.id}
              onClick={() => setSelectedBuildingId(building.id)}
              style={{
                padding: '20px',
                backgroundColor: selectedBuildingId === building.id ? '#667eea' : 'white',
                color: selectedBuildingId === building.id ? 'white' : '#1f2937',
                borderRadius: '12px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                cursor: 'pointer',
                transition: 'all 0.2s',
                border: selectedBuildingId === building.id ? '2px solid #667eea' : '2px solid transparent'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <Building size={24} />
                <h3 style={{ fontSize: '18px', fontWeight: '600', margin: 0 }}>
                  {building.name}
                </h3>
              </div>
              <p style={{ fontSize: '14px', margin: 0, opacity: 0.9 }}>
                {buildingMeters.length} meters
              </p>
            </div>
          );
        })}
      </div>

      {/* Meters grouped by building */}
      {Object.entries(groupedMeters).map(([buildingId, buildingMeters]) => {
        const building = buildings.find(b => b.id === parseInt(buildingId));
        return (
          <div key={buildingId} style={{ marginBottom: '30px' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '16px', color: '#1f2937' }}>
              {building?.name || 'Unknown Building'}
            </h2>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', 
              gap: '16px' 
            }}>
              {buildingMeters.map(meter => (
                <div key={meter.id} style={{
                  backgroundColor: 'white',
                  borderRadius: '12px',
                  padding: '20px',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  border: '1px solid #e5e7eb'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px' }}>
                    <div>
                      <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '4px', color: '#1f2937' }}>
                        {meter.name}
                      </h3>
                      <p style={{ fontSize: '14px', color: '#6b7280', margin: 0 }}>
                        {meter.meter_type.replace('_', ' ')}
                      </p>
                    </div>
                    <span style={{
                      padding: '4px 12px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      backgroundColor: meter.is_active ? '#d4edda' : '#f8d7da',
                      color: meter.is_active ? '#155724' : '#721c24'
                    }}>
                      {meter.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontSize: '14px', color: '#6b7280' }}>Connection:</span>
                      <span style={{ fontSize: '14px', fontWeight: '500', color: '#1f2937', textTransform: 'uppercase' }}>
                        {meter.connection_type}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '14px', color: '#6b7280' }}>Last Reading:</span>
                      <span style={{ fontSize: '14px', fontWeight: '500', color: '#1f2937' }}>
                        {meter.last_reading ? `${meter.last_reading.toFixed(2)} kWh` : '-'}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
                    <button 
                      onClick={() => handleEdit(meter)} 
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        padding: '8px',
                        backgroundColor: '#007bff',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '14px',
                        cursor: 'pointer'
                      }}
                    >
                      <Edit2 size={16} />
                      Edit
                    </button>
                    <button 
                      onClick={() => handleDelete(meter.id)} 
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        padding: '8px',
                        backgroundColor: '#dc3545',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '14px',
                        cursor: 'pointer'
                      }}
                    >
                      <Trash2 size={16} />
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {filteredMeters.length === 0 && (
        <div style={{ 
          backgroundColor: 'white', 
          borderRadius: '12px', 
          padding: '60px', 
          textAlign: 'center', 
          color: '#999',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          {t('meters.noMeters')}
        </div>
      )}

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
                  {editingMeter ? t('meters.editMeter') : t('meters.addMeter')}
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
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>{t('common.name')} *</label>
                <input type="text" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
              </div>

              <div style={{ marginTop: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>{t('meters.meterType')} *</label>
                <select required value={formData.meter_type} onChange={(e) => setFormData({ ...formData, meter_type: e.target.value })}
                  style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}>
                  {meterTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>

              <div style={{ marginTop: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>{t('users.building')} *</label>
                <select required value={formData.building_id} onChange={(e) => setFormData({ ...formData, building_id: parseInt(e.target.value) })}
                  style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}>
                  <option value={0}>{t('users.selectBuilding')}</option>
                  {buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>

              {formData.meter_type === 'apartment_meter' && (
                <div style={{ marginTop: '16px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>{t('meters.userForApartment')}</label>
                  <select value={formData.user_id || ''} onChange={(e) => setFormData({ ...formData, user_id: e.target.value ? parseInt(e.target.value) : undefined })}
                    style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}>
                    <option value="">{t('meters.selectUser')}</option>
                    {users.filter(u => u.building_id === formData.building_id).map(u => (
                      <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ marginTop: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>{t('meters.connectionType')} *</label>
                <select required value={formData.connection_type} onChange={(e) => setFormData({ ...formData, connection_type: e.target.value })}
                  style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}>
                  <option value="udp">{t('meters.udp')} (Recommended)</option>
                  <option value="http">{t('meters.http')}</option>
                  <option value="modbus_tcp">{t('meters.modbusTcp')}</option>
                </select>
              </div>

              <div style={{ marginTop: '20px', padding: '20px', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>
                  {t('meters.connectionConfig')}
                </h3>

                {formData.connection_type === 'udp' && (
                  <>
                    <div style={{ backgroundColor: '#dbeafe', padding: '12px', borderRadius: '6px', marginBottom: '12px', border: '1px solid #3b82f6' }}>
                      <p style={{ fontSize: '13px', color: '#1e40af', margin: 0 }}>
                        <strong>⭐ {t('meters.sharedPortInfo')}</strong>
                      </p>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          {t('meters.listenPort')} *
                        </label>
                        <input type="number" required value={connectionConfig.listen_port}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, listen_port: parseInt(e.target.value) })}
                          placeholder="8888"
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                        <p style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                          {t('meters.samePort')}
                        </p>
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          {t('meters.dataKey')} *
                        </label>
                        <input type="text" required value={connectionConfig.data_key}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, data_key: e.target.value })}
                          placeholder="apart1_kwh"
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                        <p style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                          {t('meters.dataKeyHelp')}
                        </p>
                      </div>
                    </div>
                    <div style={{ backgroundColor: '#fff', padding: '12px', borderRadius: '6px', marginTop: '12px', fontFamily: 'monospace', fontSize: '12px', border: '1px solid #e5e7eb' }}>
                      <strong>Loxone Configuration:</strong><br/>
                      Virtual Output UDP to {connectionConfig.listen_port || 8888}<br/>
                      Command: {"{\""}
                      <span style={{ color: '#3b82f6' }}>{connectionConfig.data_key || 'YOUR_KEY'}</span>
                      {"\": <v>}"}
                    </div>
                  </>
                )}

                {formData.connection_type === 'http' && (
                  <>
                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                        {t('meters.endpointUrl')} *
                      </label>
                      <input type="url" required value={connectionConfig.endpoint}
                        onChange={(e) => setConnectionConfig({ ...connectionConfig, endpoint: e.target.value })}
                        placeholder="http://YOUR_LOXONE_IP/api/power"
                        style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                        {t('meters.powerField')} *
                      </label>
                      <input type="text" required value={connectionConfig.power_field}
                        onChange={(e) => setConnectionConfig({ ...connectionConfig, power_field: e.target.value })}
                        placeholder="power_kwh"
                        style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                      <p style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                        {t('meters.powerFieldHelp')}
                      </p>
                    </div>
                  </>
                )}

                {formData.connection_type === 'modbus_tcp' && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px', marginBottom: '12px' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          {t('meters.ipAddress')} *
                        </label>
                        <input type="text" required value={connectionConfig.ip_address}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, ip_address: e.target.value })}
                          placeholder="192.168.1.100"
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          {t('meters.port')} *
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
                          {t('meters.registerAddress')} *
                        </label>
                        <input type="number" required value={connectionConfig.register_address}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, register_address: parseInt(e.target.value) })}
                          placeholder="0"
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          {t('meters.registerCount')} *
                        </label>
                        <input type="number" required value={connectionConfig.register_count}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, register_count: parseInt(e.target.value) })}
                          placeholder="2"
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          {t('meters.unitId')} *
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
                  <input type="checkbox" checked={formData.is_active} onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })} />
                  <span style={{ fontWeight: '500', fontSize: '14px' }}>{t('meters.activeCollectData')}</span>
                </label>
              </div>

              <div style={{ marginTop: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>{t('common.notes')}</label>
                <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={2} style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontFamily: 'inherit' }} />
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button type="submit" style={{
                  flex: 1, padding: '12px', backgroundColor: '#007bff', color: 'white',
                  border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '500'
                }}>
                  {editingMeter ? t('common.update') : t('common.create')}
                </button>
                <button type="button" onClick={() => { setShowModal(false); setEditingMeter(null); }} style={{
                  flex: 1, padding: '12px', backgroundColor: '#6c757d', color: 'white',
                  border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '500'
                }}>
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}