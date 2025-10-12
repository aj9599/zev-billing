import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, X, HelpCircle, Info, Car, Download, Search, Building } from 'lucide-react';
import { api } from '../api/client';
import type { Charger, Building as BuildingType } from '../types';
import { useTranslation } from '../i18n';

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
  listen_port?: number;
  power_key?: string;
  state_key?: string;
  user_id_key?: string;
  mode_key?: string;
}

export default function Chargers() {
  const { t } = useTranslation();
  const [chargers, setChargers] = useState<Charger[]>([]);
  const [buildings, setBuildings] = useState<BuildingType[]>([]);
  const [selectedBuildingId, setSelectedBuildingId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [editingCharger, setEditingCharger] = useState<Charger | null>(null);
  const [formData, setFormData] = useState<Partial<Charger>>({
    name: '', brand: 'weidmuller', preset: 'weidmuller', building_id: 0,
    connection_type: 'udp', connection_config: '{}', supports_priority: true,
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
    unit_id: 1,
    listen_port: 8888,
    power_key: 'charger_power',
    state_key: 'charger_state',
    user_id_key: 'charger_user',
    mode_key: 'charger_mode'
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
    setBuildings(buildingsData.filter(b => !b.is_group));
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
    } else if (formData.connection_type === 'udp') {
      config = {
        listen_port: connectionConfig.listen_port,
        power_key: connectionConfig.power_key,
        state_key: connectionConfig.state_key,
        user_id_key: connectionConfig.user_id_key,
        mode_key: connectionConfig.mode_key
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
      alert(t('chargers.saveFailed'));
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm(t('chargers.deleteConfirm'))) {
      try {
        await api.deleteCharger(id);
        loadData();
      } catch (err) {
        alert(t('chargers.deleteFailed'));
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
        unit_id: config.unit_id || 1,
        listen_port: config.listen_port || 8888,
        power_key: config.power_key || 'charger_power',
        state_key: config.state_key || 'charger_state',
        user_id_key: config.user_id_key || 'charger_user',
        mode_key: config.mode_key || 'charger_mode'
      });
    } catch (e) {
      console.error('Failed to parse config:', e);
    }
    
    setShowModal(true);
  };

  const handleExport = async () => {
    try {
      const response = await fetch('/api/billing/export?type=chargers', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chargers-export-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(t('chargers.exportFailed'));
    }
  };

  const resetForm = () => {
    setFormData({
      name: '', brand: 'weidmuller', preset: 'weidmuller', building_id: 0,
      connection_type: 'udp', connection_config: '{}', supports_priority: true,
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
      unit_id: 1,
      listen_port: 8888,
      power_key: 'charger_power',
      state_key: 'charger_state',
      user_id_key: 'charger_user',
      mode_key: 'charger_mode'
    });
  };

  const filteredBuildings = buildings.filter(b =>
    b.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredChargers = selectedBuildingId
    ? chargers.filter(c => c.building_id === selectedBuildingId)
    : chargers;

  const groupedChargers = filteredChargers.reduce((acc, charger) => {
    if (!acc[charger.building_id]) {
      acc[charger.building_id] = [];
    }
    acc[charger.building_id].push(charger);
    return acc;
  }, {} as Record<number, Charger[]>);

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
            🚗 WeidMüller Charger Setup
          </h3>
          <div style={{ backgroundColor: '#f3f4f6', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
            <p><strong>WeidMüller chargers require 4 data points:</strong></p>
            <ul style={{ marginLeft: '20px', marginTop: '10px' }}>
              <li><strong>Power Consumed:</strong> Current power consumption in kWh</li>
              <li><strong>State:</strong> Charging state (charging, idle, error, etc.)</li>
              <li><strong>User ID:</strong> Which user is using the charger</li>
              <li><strong>Mode:</strong> "normal" or "priority" charging</li>
            </ul>
          </div>

          <h3 style={{ fontSize: '18px', fontWeight: '600', marginTop: '20px', marginBottom: '10px', color: '#1f2937' }}>
            📡 UDP Connection (Shared Port - RECOMMENDED!)
          </h3>
          <div style={{ backgroundColor: '#dbeafe', padding: '16px', borderRadius: '8px', marginBottom: '16px', border: '2px solid #3b82f6' }}>
            <p><strong>⭐ Share ONE UDP port for chargers and meters!</strong></p>
            <ol style={{ marginLeft: '20px', marginTop: '10px' }}>
              <li>Use the SAME UDP port as your meters (e.g., 8888)</li>
              <li>Configure 4 unique JSON keys for the charger data</li>
              <li>Send all data in a single JSON packet or separate packets</li>
              <li><strong>Example Configuration:</strong></li>
            </ol>
            <div style={{ backgroundColor: '#fff', padding: '12px', borderRadius: '6px', marginTop: '10px', fontFamily: 'monospace', fontSize: '13px' }}>
              <strong>Charger 1 Config:</strong><br/>
              Port: 8888<br/>
              Power Key: "charger1_power"<br/>
              State Key: "charger1_state"<br/>
              User ID Key: "charger1_user"<br/>
              Mode Key: "charger1_mode"<br/><br/>
              
              <strong>Loxone sends (all in one or separate):</strong><br/>
              {"{"}<br/>
              &nbsp;&nbsp;"charger1_power": &lt;v&gt;,<br/>
              &nbsp;&nbsp;"charger1_state": "charging",<br/>
              &nbsp;&nbsp;"charger1_user": "USER_001",<br/>
              &nbsp;&nbsp;"charger1_mode": "priority"<br/>
              {"}"}
            </div>
            <p style={{ marginTop: '10px', fontSize: '14px', color: '#1f2937' }}>
              <strong>Benefits:</strong> One UDP port for entire building - meters AND chargers!
            </p>
          </div>

          <h3 style={{ fontSize: '18px', fontWeight: '600', marginTop: '20px', marginBottom: '10px', color: '#1f2937' }}>
            🔌 HTTP Connection (Alternative)
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
              <li>Ensure the charger IP/port is reachable from the Raspberry Pi</li>
              <li>For UDP: Verify unique keys don't conflict with meter keys</li>
            </ul>
          </div>

          <h3 style={{ fontSize: '18px', fontWeight: '600', marginTop: '20px', marginBottom: '10px', color: '#1f2937' }}>
            ⚠️ Troubleshooting
          </h3>
          <div style={{ backgroundColor: '#fef3c7', padding: '16px', borderRadius: '8px', border: '1px solid #f59e0b' }}>
            <ul style={{ marginLeft: '20px' }}>
              <li>Verify network connectivity: <code style={{ backgroundColor: '#fff', padding: '2px 6px', borderRadius: '4px' }}>ping charger-ip</code></li>
              <li>Check firewall allows HTTP/Modbus/UDP traffic</li>
              <li>Test endpoints manually with curl or browser</li>
              <li>Check Admin Logs for detailed error messages</li>
              <li>Verify JSON format matches expected structure</li>
              <li>Ensure all 4 data points return valid data</li>
              <li><strong>UDP:</strong> Make sure each charger has UNIQUE keys!</li>
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
            <Car size={36} style={{ color: '#667eea' }} />
            {t('chargers.title')}
          </h1>
          <p style={{ color: '#6b7280', fontSize: '16px' }}>
            {t('chargers.subtitle')}
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
            {t('chargers.exportData')}
          </button>
          <button
            onClick={() => setShowInstructions(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
              backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px', cursor: 'pointer'
            }}
          >
            <HelpCircle size={18} />
            {t('chargers.setupInstructions')}
          </button>
          <button
            onClick={() => { resetForm(); setShowModal(true); }}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
              backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px', cursor: 'pointer'
            }}
          >
            <Plus size={18} />
            {t('chargers.addCharger')}
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
            {chargers.length} chargers
          </p>
        </div>

        {/* Individual Building Cards */}
        {filteredBuildings.map(building => {
          const buildingChargers = chargers.filter(c => c.building_id === building.id);
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
                {buildingChargers.length} chargers
              </p>
            </div>
          );
        })}
      </div>

      {/* Chargers grouped by building */}
      {Object.entries(groupedChargers).map(([buildingId, buildingChargers]) => {
        const building = buildings.find(b => b.id === parseInt(buildingId));
        return (
          <div key={buildingId} style={{ marginBottom: '30px' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '16px', color: '#1f2937' }}>
              {building?.name || 'Unknown Building'}
            </h2>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', 
              gap: '20px' 
            }}>
              {buildingChargers.map(charger => (
                <div key={charger.id} style={{
                  backgroundColor: 'white',
                  borderRadius: '16px',
                  padding: '24px',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.07)',
                  border: '1px solid #f0f0f0',
                  position: 'relative',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 8px 12px rgba(0,0,0,0.12)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.07)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}>
                  {/* Action buttons in top right */}
                  <div style={{ 
                    position: 'absolute', 
                    top: '16px', 
                    right: '16px', 
                    display: 'flex', 
                    gap: '8px' 
                  }}>
                    <button 
                      onClick={() => handleEdit(charger)} 
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        border: 'none',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        color: '#3b82f6',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.2)';
                        e.currentTarget.style.transform = 'scale(1.1)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
                        e.currentTarget.style.transform = 'scale(1)';
                      }}
                      title="Edit"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button 
                      onClick={() => handleDelete(charger.id)} 
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        border: 'none',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        color: '#ef4444',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.2)';
                        e.currentTarget.style.transform = 'scale(1.1)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
                        e.currentTarget.style.transform = 'scale(1)';
                      }}
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  {/* Card content */}
                  <div style={{ paddingRight: '72px' }}>
                    <h3 style={{ 
                      fontSize: '20px', 
                      fontWeight: '600', 
                      marginBottom: '6px', 
                      color: '#1f2937',
                      lineHeight: '1.3'
                    }}>
                      {charger.name}
                    </h3>
                    <p style={{ 
                      fontSize: '14px', 
                      color: '#6b7280', 
                      margin: 0,
                      textTransform: 'capitalize'
                    }}>
                      {charger.brand}
                    </p>
                  </div>

                  <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #f3f4f6' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <span style={{ fontSize: '13px', color: '#9ca3af', fontWeight: '500' }}>Connection</span>
                      <span style={{ 
                        fontSize: '13px', 
                        fontWeight: '600', 
                        color: '#667eea',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                      }}>
                        {charger.connection_type}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <span style={{ fontSize: '13px', color: '#9ca3af', fontWeight: '500' }}>Priority Mode</span>
                      <span style={{ 
                        fontSize: '13px', 
                        fontWeight: '600', 
                        color: charger.supports_priority ? '#22c55e' : '#6b7280'
                      }}>
                        {charger.supports_priority ? '✓ Supported' : '✗ Not supported'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '13px', color: '#9ca3af', fontWeight: '500' }}>Status</span>
                      <span style={{
                        padding: '4px 12px',
                        borderRadius: '20px',
                        fontSize: '12px',
                        fontWeight: '600',
                        backgroundColor: charger.is_active ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                        color: charger.is_active ? '#22c55e' : '#ef4444'
                      }}>
                        {charger.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {filteredChargers.length === 0 && (
        <div style={{ 
          backgroundColor: 'white', 
          borderRadius: '12px', 
          padding: '60px', 
          textAlign: 'center', 
          color: '#999',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          {t('chargers.noChargers')}
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
                  {editingCharger ? t('chargers.editCharger') : t('chargers.addCharger')}
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
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>{t('common.name')} *</label>
                <input type="text" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
              </div>

              <div style={{ marginTop: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>{t('chargers.brandPreset')} *</label>
                <select required value={formData.brand} onChange={(e) => {
                  setFormData({ ...formData, brand: e.target.value, preset: e.target.value });
                }}
                  style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}>
                  <option value="weidmuller">{t('chargers.weidmuller')}</option>
                </select>
                <p style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                  {t('chargers.weidmullerHelp')}
                </p>
              </div>

              <div style={{ marginTop: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>{t('users.building')} *</label>
                <select required value={formData.building_id} onChange={(e) => setFormData({ ...formData, building_id: parseInt(e.target.value) })}
                  style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}>
                  <option value={0}>{t('users.selectBuilding')}</option>
                  {buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>

              <div style={{ marginTop: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>{t('meters.connectionType')} *</label>
                <select required value={formData.connection_type} onChange={(e) => setFormData({ ...formData, connection_type: e.target.value })}
                  style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}>
                  <option value="udp">UDP (Recommended)</option>
                  <option value="http">HTTP</option>
                  <option value="modbus_tcp">Modbus TCP</option>
                </select>
              </div>

              <div style={{ marginTop: '20px', padding: '20px', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>
                  {t('chargers.connectionConfig')}
                </h3>

                {formData.connection_type === 'udp' && (
                  <>
                    <div style={{ backgroundColor: '#dbeafe', padding: '12px', borderRadius: '6px', marginBottom: '12px', border: '1px solid #3b82f6' }}>
                      <p style={{ fontSize: '13px', color: '#1e40af', margin: 0 }}>
                        <strong>⭐ {t('chargers.sharedPortInfo')}</strong>
                      </p>
                    </div>
                    <div style={{ marginBottom: '12px' }}>
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
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          {t('chargers.powerKey')} *
                        </label>
                        <input type="text" required value={connectionConfig.power_key}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, power_key: e.target.value })}
                          placeholder="charger1_power"
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          {t('chargers.stateKey')} *
                        </label>
                        <input type="text" required value={connectionConfig.state_key}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, state_key: e.target.value })}
                          placeholder="charger1_state"
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          {t('chargers.userIdKey')} *
                        </label>
                        <input type="text" required value={connectionConfig.user_id_key}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, user_id_key: e.target.value })}
                          placeholder="charger1_user"
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          {t('chargers.modeKey')} *
                        </label>
                        <input type="text" required value={connectionConfig.mode_key}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, mode_key: e.target.value })}
                          placeholder="charger1_mode"
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                      </div>
                    </div>
                    <div style={{ backgroundColor: '#fff', padding: '12px', borderRadius: '6px', marginTop: '12px', fontFamily: 'monospace', fontSize: '12px', border: '1px solid #e5e7eb' }}>
                      <strong>Loxone Configuration:</strong><br/>
                      Virtual Output UDP to {connectionConfig.listen_port || 8888}<br/>
                      Command: {"{"}<br/>
                      &nbsp;&nbsp;"<span style={{ color: '#3b82f6' }}>{connectionConfig.power_key || 'power_key'}</span>": &lt;v&gt;,<br/>
                      &nbsp;&nbsp;"<span style={{ color: '#3b82f6' }}>{connectionConfig.state_key || 'state_key'}</span>": "charging",<br/>
                      &nbsp;&nbsp;"<span style={{ color: '#3b82f6' }}>{connectionConfig.user_id_key || 'user_key'}</span>": "USER_001",<br/>
                      &nbsp;&nbsp;"<span style={{ color: '#3b82f6' }}>{connectionConfig.mode_key || 'mode_key'}</span>": "normal"<br/>
                      {"}"}
                    </div>
                  </>
                )}

                {formData.connection_type === 'http' && (
                  <>
                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                        {t('chargers.powerEndpoint')} *
                      </label>
                      <input type="url" required value={connectionConfig.power_endpoint}
                        onChange={(e) => setConnectionConfig({ ...connectionConfig, power_endpoint: e.target.value })}
                        placeholder="http://192.168.1.100/api/power"
                        style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                    </div>
                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                        {t('chargers.stateEndpoint')} *
                      </label>
                      <input type="url" required value={connectionConfig.state_endpoint}
                        onChange={(e) => setConnectionConfig({ ...connectionConfig, state_endpoint: e.target.value })}
                        placeholder="http://192.168.1.100/api/state"
                        style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                    </div>
                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                        {t('chargers.userIdEndpoint')} *
                      </label>
                      <input type="url" required value={connectionConfig.user_id_endpoint}
                        onChange={(e) => setConnectionConfig({ ...connectionConfig, user_id_endpoint: e.target.value })}
                        placeholder="http://192.168.1.100/api/user_id"
                        style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                        {t('chargers.modeEndpoint')} *
                      </label>
                      <input type="url" required value={connectionConfig.mode_endpoint}
                        onChange={(e) => setConnectionConfig({ ...connectionConfig, mode_endpoint: e.target.value })}
                        placeholder="http://192.168.1.100/api/mode"
                        style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                      <p style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                        {t('chargers.modeEndpointHelp')}
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
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          {t('chargers.powerRegister')} *
                        </label>
                        <input type="number" required value={connectionConfig.power_register}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, power_register: parseInt(e.target.value) })}
                          placeholder="0"
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          {t('chargers.stateRegister')} *
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
                          {t('chargers.userIdRegister')} *
                        </label>
                        <input type="number" required value={connectionConfig.user_id_register}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, user_id_register: parseInt(e.target.value) })}
                          placeholder="2"
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          {t('chargers.modeRegister')} *
                        </label>
                        <input type="number" required value={connectionConfig.mode_register}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, mode_register: parseInt(e.target.value) })}
                          placeholder="3"
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
                  <input type="checkbox" checked={formData.supports_priority} onChange={(e) => setFormData({ ...formData, supports_priority: e.target.checked })} />
                  <span style={{ fontWeight: '500', fontSize: '14px' }}>{t('chargers.supportsPriority')}</span>
                </label>
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
                  {editingCharger ? t('common.update') : t('common.create')}
                </button>
                <button type="button" onClick={() => { setShowModal(false); setEditingCharger(null); }} style={{
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