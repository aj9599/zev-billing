import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, X, HelpCircle, Info, Car, Download, Search, Building, Radio, Plug, Zap, Settings, AlertCircle, Star } from 'lucide-react';
import { api } from '../api/client';
import type { Charger, Building as BuildingType } from '../types';
import { useTranslation } from '../i18n';
import { CHARGER_PRESETS, getPreset, type PresetConfig } from './chargerPresets';

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
  state_cable_locked?: string;
  state_waiting_auth?: string;
  state_charging?: string;
  state_idle?: string;
  mode_normal?: string;
  mode_priority?: string;
}

export default function Chargers() {
  const { t } = useTranslation();
  const [chargers, setChargers] = useState<Charger[]>([]);
  const [buildings, setBuildings] = useState<BuildingType[]>([]);
  const [selectedBuildingId, setSelectedBuildingId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [editingCharger, setEditingCharger] = useState<Charger | null>(null);
  const [exportDateRange, setExportDateRange] = useState({
    start_date: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0]
  });
  const [formData, setFormData] = useState<Partial<Charger>>({
    name: '', brand: 'weidmuller', preset: 'weidmuller', building_id: 0,
    connection_type: 'udp', connection_config: '{}',
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
    power_key: '',
    state_key: '',
    user_id_key: '',
    mode_key: '',
    state_cable_locked: '65',
    state_waiting_auth: '66',
    state_charging: '67',
    state_idle: '50',
    mode_normal: '1',
    mode_priority: '2'
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

  const generateUUID = (): string => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };

  const generateUniqueKeys = () => {
    const baseUUID = generateUUID();
    return {
      power_key: `${baseUUID}_power`,
      state_key: `${baseUUID}_state`,
      user_id_key: `${baseUUID}_user`,
      mode_key: `${baseUUID}_mode`
    };
  };

  const getCurrentPreset = (): PresetConfig => {
    return getPreset(formData.preset || 'weidmuller');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    let config: ChargerConnectionConfig = {};
    
    if (formData.connection_type === 'http') {
      config = {
        power_endpoint: connectionConfig.power_endpoint,
        state_endpoint: connectionConfig.state_endpoint,
        user_id_endpoint: connectionConfig.user_id_endpoint,
        mode_endpoint: connectionConfig.mode_endpoint,
        state_cable_locked: connectionConfig.state_cable_locked,
        state_waiting_auth: connectionConfig.state_waiting_auth,
        state_charging: connectionConfig.state_charging,
        state_idle: connectionConfig.state_idle,
        mode_normal: connectionConfig.mode_normal,
        mode_priority: connectionConfig.mode_priority
      };
    } else if (formData.connection_type === 'modbus_tcp') {
      config = {
        ip_address: connectionConfig.ip_address,
        port: connectionConfig.port,
        power_register: connectionConfig.power_register,
        state_register: connectionConfig.state_register,
        user_id_register: connectionConfig.user_id_register,
        mode_register: connectionConfig.mode_register,
        unit_id: connectionConfig.unit_id,
        state_cable_locked: connectionConfig.state_cable_locked,
        state_waiting_auth: connectionConfig.state_waiting_auth,
        state_charging: connectionConfig.state_charging,
        state_idle: connectionConfig.state_idle,
        mode_normal: connectionConfig.mode_normal,
        mode_priority: connectionConfig.mode_priority
      };
    } else if (formData.connection_type === 'udp') {
      config = {
        listen_port: connectionConfig.listen_port,
        power_key: connectionConfig.power_key,
        state_key: connectionConfig.state_key,
        user_id_key: connectionConfig.user_id_key,
        mode_key: connectionConfig.mode_key,
        state_cable_locked: connectionConfig.state_cable_locked,
        state_waiting_auth: connectionConfig.state_waiting_auth,
        state_charging: connectionConfig.state_charging,
        state_idle: connectionConfig.state_idle,
        mode_normal: connectionConfig.mode_normal,
        mode_priority: connectionConfig.mode_priority
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
      const preset = getPreset(charger.preset);
      
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
        power_key: config.power_key || '',
        state_key: config.state_key || '',
        user_id_key: config.user_id_key || '',
        mode_key: config.mode_key || '',
        state_cable_locked: config.state_cable_locked || preset.defaultStateMappings.cable_locked,
        state_waiting_auth: config.state_waiting_auth || preset.defaultStateMappings.waiting_auth,
        state_charging: config.state_charging || preset.defaultStateMappings.charging,
        state_idle: config.state_idle || preset.defaultStateMappings.idle,
        mode_normal: config.mode_normal || preset.defaultModeMappings.normal,
        mode_priority: config.mode_priority || preset.defaultModeMappings.priority
      });
    } catch (e) {
      console.error('Failed to parse config:', e);
    }
    
    setShowModal(true);
  };

  const handleExport = async () => {
    try {
      const params = new URLSearchParams({
        type: 'chargers',
        start_date: exportDateRange.start_date,
        end_date: exportDateRange.end_date
      });
      
      const response = await fetch(`/api/billing/export?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chargers-export-${exportDateRange.start_date}-to-${exportDateRange.end_date}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      setShowExportModal(false);
    } catch (err) {
      alert(t('chargers.exportFailed'));
    }
  };

  const resetForm = () => {
    const preset = getPreset('weidmuller');
    setFormData({
      name: '', brand: 'weidmuller', preset: 'weidmuller', building_id: 0,
      connection_type: 'udp', connection_config: '{}',
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
      power_key: '',
      state_key: '',
      user_id_key: '',
      mode_key: '',
      state_cable_locked: preset.defaultStateMappings.cable_locked,
      state_waiting_auth: preset.defaultStateMappings.waiting_auth,
      state_charging: preset.defaultStateMappings.charging,
      state_idle: preset.defaultStateMappings.idle,
      mode_normal: preset.defaultModeMappings.normal,
      mode_priority: preset.defaultModeMappings.priority
    });
  };

  const handleAddCharger = () => {
    resetForm();
    const uniqueKeys = generateUniqueKeys();
    setConnectionConfig(prev => ({
      ...prev,
      ...uniqueKeys
    }));
    setShowModal(true);
  };

  const handlePresetChange = (presetName: string) => {
    const preset = getPreset(presetName);
    setFormData({ 
      ...formData, 
      brand: presetName, 
      preset: presetName
    });
    setConnectionConfig({
      ...connectionConfig,
      state_cable_locked: preset.defaultStateMappings.cable_locked,
      state_waiting_auth: preset.defaultStateMappings.waiting_auth,
      state_charging: preset.defaultStateMappings.charging,
      state_idle: preset.defaultStateMappings.idle,
      mode_normal: preset.defaultModeMappings.normal,
      mode_priority: preset.defaultModeMappings.priority
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

  const ExportModal = () => (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', 
      justifyContent: 'center', zIndex: 2000, padding: '20px'
    }}>
      <div className="modal-content" style={{
        backgroundColor: 'white', borderRadius: '12px', padding: '30px',
        maxWidth: '500px', width: '100%'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold' }}>Export Charger Data</h2>
          <button onClick={() => setShowExportModal(false)} 
            style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
            Start Date *
          </label>
          <input 
            type="date" 
            required 
            value={exportDateRange.start_date}
            onChange={(e) => setExportDateRange({ ...exportDateRange, start_date: e.target.value })}
            style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} 
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
            End Date *
          </label>
          <input 
            type="date" 
            required 
            value={exportDateRange.end_date}
            onChange={(e) => setExportDateRange({ ...exportDateRange, end_date: e.target.value })}
            style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} 
          />
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={handleExport} style={{
            flex: 1, padding: '12px', backgroundColor: '#28a745', color: 'white',
            border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '500', cursor: 'pointer'
          }}>
            Export Data
          </button>
          <button onClick={() => setShowExportModal(false)} style={{
            flex: 1, padding: '12px', backgroundColor: '#6c757d', color: 'white',
            border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '500', cursor: 'pointer'
          }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );

  const InstructionsModal = () => (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', 
      justifyContent: 'center', zIndex: 2000, padding: '20px'
    }}>
      <div className="modal-content instructions-modal" style={{
        backgroundColor: 'white', borderRadius: '12px', padding: '30px',
        maxWidth: '800px', maxHeight: '90vh', overflow: 'auto', width: '100%'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold' }}>{t('chargers.setupInstructions')}</h2>
          <button onClick={() => setShowInstructions(false)} 
            style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        <div style={{ lineHeight: '1.8', color: '#374151' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', marginTop: '20px', marginBottom: '10px', color: '#1f2937', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Car size={20} color="#667eea" />
            {getCurrentPreset().label} {t('chargers.chargerSetup')}
          </h3>
          <div style={{ backgroundColor: '#f3f4f6', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
            <p><strong>{t('chargers.requiresFourDataPoints')}</strong></p>
            <ul style={{ marginLeft: '20px', marginTop: '10px' }}>
              <li><strong>{t('chargers.powerUuidPower')}:</strong> {t('chargers.powerDescription')}</li>
              <li><strong>{t('chargers.stateUuidState')}:</strong> {t('chargers.stateDescription')}</li>
              <li><strong>{t('chargers.userIdUuidUser')}:</strong> {t('chargers.userIdDescription')}</li>
              <li><strong>{t('chargers.modeUuidMode')}:</strong> {t('chargers.modeDescription')}</li>
            </ul>
          </div>

          <h3 style={{ fontSize: '18px', fontWeight: '600', marginTop: '20px', marginBottom: '10px', color: '#1f2937', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Radio size={20} color="#3b82f6" />
            {t('chargers.udpConnection')}
          </h3>
          <div style={{ backgroundColor: '#dbeafe', padding: '16px', borderRadius: '8px', marginBottom: '16px', border: '2px solid #3b82f6' }}>
            <p style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Star size={16} fill="#fbbf24" color="#fbbf24" />
              <strong>{t('chargers.autoGeneratedUuidKeys')}</strong>
            </p>
            <p style={{ marginTop: '10px' }}>{t('chargers.udpInstructions')}</p>
          </div>

          <h3 style={{ fontSize: '18px', fontWeight: '600', marginTop: '20px', marginBottom: '10px', color: '#1f2937', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Settings size={20} color="#6b7280" />
            {t('chargers.stateAndModeValues')}
          </h3>
          <div style={{ backgroundColor: '#fef3c7', padding: '16px', borderRadius: '8px', marginBottom: '16px', border: '1px solid #f59e0b' }}>
            <p><strong>{t('chargers.configureNumericValues')}</strong></p>
            <p style={{ marginTop: '10px' }}>{t('chargers.valueMappingsDescription')}</p>
          </div>
        </div>

        <button onClick={() => setShowInstructions(false)} style={{
          width: '100%', marginTop: '24px', padding: '12px',
          backgroundColor: '#007bff', color: 'white', border: 'none',
          borderRadius: '6px', fontSize: '14px', fontWeight: '500', cursor: 'pointer'
        }}>
          {t('common.close')}
        </button>
      </div>
    </div>
  );

  return (
    <div className="chargers-container">
      <div className="chargers-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', gap: '15px', flexWrap: 'wrap' }}>
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
        <div className="button-group-header" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowExportModal(true)}
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
            onClick={handleAddCharger}
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

      <div style={{ marginBottom: '20px' }}>
        <div style={{ position: 'relative', maxWidth: '400px' }}>
          <Search size={20} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
          <input
            type="text"
            placeholder={t('dashboard.searchBuildings')}
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

      <div className="building-cards-grid" style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', 
        gap: '16px', 
        marginBottom: '30px' 
      }}>
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
              {t('dashboard.allBuildings')}
            </h3>
          </div>
          <p style={{ fontSize: '14px', margin: 0, opacity: 0.9 }}>
            {chargers.length} {t('chargers.chargers')}
          </p>
        </div>

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
                {buildingChargers.length} {t('chargers.chargers')}
              </p>
            </div>
          );
        })}
      </div>

      {Object.entries(groupedChargers).map(([buildingId, buildingChargers]) => {
        const building = buildings.find(b => b.id === parseInt(buildingId));
        return (
          <div key={buildingId} style={{ marginBottom: '30px' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '16px', color: '#1f2937' }}>
              {building?.name || t('common.unknownBuilding')}
            </h2>
            <div className="chargers-grid" style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', 
              gap: '20px' 
            }}>
              {buildingChargers.map(charger => {
                const chargerPreset = getPreset(charger.preset);
                return (
                  <div key={charger.id} className="charger-card" style={{
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
                        title={t('common.edit')}
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
                        title={t('common.delete')}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

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
                        {chargerPreset.label}
                      </p>
                    </div>

                    <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #f3f4f6' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <span style={{ fontSize: '13px', color: '#9ca3af', fontWeight: '500' }}>{t('chargers.connection')}</span>
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
                      {chargerPreset.supportsPriority && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                          <span style={{ fontSize: '13px', color: '#9ca3af', fontWeight: '500' }}>{t('chargers.priorityMode')}</span>
                          <span style={{ 
                            fontSize: '13px', 
                            fontWeight: '600', 
                            color: '#22c55e'
                          }}>
                            ✓ {t('chargers.supported')}
                          </span>
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '13px', color: '#9ca3af', fontWeight: '500' }}>{t('common.status')}</span>
                        <span style={{
                          padding: '4px 12px',
                          borderRadius: '20px',
                          fontSize: '12px',
                          fontWeight: '600',
                          backgroundColor: charger.is_active ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                          color: charger.is_active ? '#22c55e' : '#ef4444'
                        }}>
                          {charger.is_active ? t('common.active') : t('common.inactive')}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {filteredChargers.length === 0 && (
        <div style={{ 
          backgroundColor: 'white', 
          borderRadius: '12px', 
          padding: '60px 20px', 
          textAlign: 'center', 
          color: '#999',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          {t('chargers.noChargers')}
        </div>
      )}

      {showInstructions && <InstructionsModal />}
      {showExportModal && <ExportModal />}

      {showModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          padding: '15px'
        }}>
          <div className="modal-content" style={{
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
                  title={t('chargers.setupInstructions')}
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
                <select required value={formData.brand} onChange={(e) => handlePresetChange(e.target.value)}
                  style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}>
                  {Object.values(CHARGER_PRESETS).map(preset => (
                    <option key={preset.name} value={preset.name}>{preset.label}</option>
                  ))}
                </select>
                <p style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                  {getCurrentPreset().description}
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
                  <option value="udp">{t('meters.udp')} ({t('common.recommended')})</option>
                  <option value="http">{t('meters.http')}</option>
                  <option value="modbus_tcp">{t('meters.modbusTcp')}</option>
                </select>
              </div>

              <div style={{ marginTop: '20px', padding: '20px', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>
                  {t('chargers.connectionConfig')}
                </h3>

                {formData.connection_type === 'udp' && (
                  <>
                    <div style={{ backgroundColor: '#dbeafe', padding: '12px', borderRadius: '6px', marginBottom: '12px', border: '1px solid #3b82f6', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Star size={16} fill="#fbbf24" color="#fbbf24" />
                      <p style={{ fontSize: '13px', color: '#1e40af', margin: 0 }}>
                        <strong>{editingCharger ? t('chargers.existingUuidKeys') : t('chargers.autoGeneratedUuidKeys')}</strong>
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
                    </div>
                    <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          {t('chargers.powerKey')} *
                        </label>
                        <input type="text" required value={connectionConfig.power_key}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, power_key: e.target.value })}
                          readOnly={!editingCharger}
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontFamily: 'monospace', fontSize: '12px' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          {t('chargers.stateKey')} *
                        </label>
                        <input type="text" required value={connectionConfig.state_key}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, state_key: e.target.value })}
                          readOnly={!editingCharger}
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontFamily: 'monospace', fontSize: '12px' }} />
                      </div>
                    </div>
                    <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          {t('chargers.userIdKey')} *
                        </label>
                        <input type="text" required value={connectionConfig.user_id_key}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, user_id_key: e.target.value })}
                          readOnly={!editingCharger}
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontFamily: 'monospace', fontSize: '12px' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          {t('chargers.modeKey')} *
                        </label>
                        <input type="text" required value={connectionConfig.mode_key}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, mode_key: e.target.value })}
                          readOnly={!editingCharger}
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontFamily: 'monospace', fontSize: '12px' }} />
                      </div>
                    </div>
                    <div style={{ backgroundColor: '#fff', padding: '12px', borderRadius: '6px', marginTop: '12px', fontFamily: 'monospace', fontSize: '12px', border: '1px solid #e5e7eb' }}>
                      <strong>{t('chargers.loxoneSendsTo')} {connectionConfig.listen_port || 8888}:</strong><br/>
                      {"{"}<br/>
                      &nbsp;&nbsp;"<span style={{ color: '#3b82f6' }}>{connectionConfig.power_key || 'UUID_power'}</span>": &lt;v&gt;,<br/>
                      &nbsp;&nbsp;"<span style={{ color: '#3b82f6' }}>{connectionConfig.state_key || 'UUID_state'}</span>": 67,<br/>
                      &nbsp;&nbsp;"<span style={{ color: '#3b82f6' }}>{connectionConfig.user_id_key || 'UUID_user'}</span>": "USER_001",<br/>
                      &nbsp;&nbsp;"<span style={{ color: '#3b82f6' }}>{connectionConfig.mode_key || 'UUID_mode'}</span>": 2<br/>
                      {"}"}
                    </div>
                  </>
                )}

                {formData.connection_type === 'http' && (
                  <>
                    <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          {t('chargers.powerEndpoint')} *
                        </label>
                        <input type="url" required value={connectionConfig.power_endpoint}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, power_endpoint: e.target.value })}
                          placeholder="http://192.168.1.100/api/power"
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          {t('chargers.stateEndpoint')} *
                        </label>
                        <input type="url" required value={connectionConfig.state_endpoint}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, state_endpoint: e.target.value })}
                          placeholder="http://192.168.1.100/api/state"
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                      </div>
                    </div>
                    <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                      <div>
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
                      </div>
                    </div>
                  </>
                )}

                {formData.connection_type === 'modbus_tcp' && (
                  <>
                    <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px', marginBottom: '12px' }}>
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
                    <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          {t('chargers.powerReg')} *
                        </label>
                        <input type="number" required value={connectionConfig.power_register}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, power_register: parseInt(e.target.value) })}
                          placeholder="0"
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          {t('chargers.stateReg')} *
                        </label>
                        <input type="number" required value={connectionConfig.state_register}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, state_register: parseInt(e.target.value) })}
                          placeholder="1"
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          {t('chargers.userReg')} *
                        </label>
                        <input type="number" required value={connectionConfig.user_id_register}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, user_id_register: parseInt(e.target.value) })}
                          placeholder="2"
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          {t('chargers.modeReg')} *
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
                      <input type="text" required value={connectionConfig.state_cable_locked}
                        onChange={(e) => setConnectionConfig({ ...connectionConfig, state_cable_locked: e.target.value })}
                        placeholder="65"
                        style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '500' }}>
                        {t('chargers.stateWaitingAuth')}
                      </label>
                      <input type="text" required value={connectionConfig.state_waiting_auth}
                        onChange={(e) => setConnectionConfig({ ...connectionConfig, state_waiting_auth: e.target.value })}
                        placeholder="66"
                        style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '500' }}>
                        {t('chargers.stateCharging')}
                      </label>
                      <input type="text" required value={connectionConfig.state_charging}
                        onChange={(e) => setConnectionConfig({ ...connectionConfig, state_charging: e.target.value })}
                        placeholder="67"
                        style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '500' }}>
                        {t('chargers.stateIdle')}
                      </label>
                      <input type="text" required value={connectionConfig.state_idle}
                        onChange={(e) => setConnectionConfig({ ...connectionConfig, state_idle: e.target.value })}
                        placeholder="50"
                        style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px' }} />
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
                      <input type="text" required value={connectionConfig.mode_normal}
                        onChange={(e) => setConnectionConfig({ ...connectionConfig, mode_normal: e.target.value })}
                        placeholder="1"
                        style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '500' }}>
                        {t('chargers.modePriority')}
                      </label>
                      <input type="text" required value={connectionConfig.mode_priority}
                        onChange={(e) => setConnectionConfig({ ...connectionConfig, mode_priority: e.target.value })}
                        placeholder="2"
                        style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px' }} />
                    </div>
                  </div>
                </div>
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

              <div className="button-group" style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button type="submit" style={{
                  flex: 1, padding: '12px', backgroundColor: '#007bff', color: 'white',
                  border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '500', cursor: 'pointer'
                }}>
                  {editingCharger ? t('common.update') : t('common.create')}
                </button>
                <button type="button" onClick={() => { setShowModal(false); setEditingCharger(null); }} style={{
                  flex: 1, padding: '12px', backgroundColor: '#6c757d', color: 'white',
                  border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '500', cursor: 'pointer'
                }}>
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .chargers-container .chargers-header h1 {
            font-size: 24px !important;
          }

          .chargers-container .chargers-header h1 svg {
            width: 24px !important;
            height: 24px !important;
          }

          .chargers-container .chargers-header p {
            font-size: 14px !important;
          }

          .button-group-header {
            width: 100%;
            justify-content: stretch !important;
          }

          .button-group-header button {
            flex: 1;
            justify-content: center;
          }

          .building-cards-grid {
            grid-template-columns: 1fr !important;
            gap: 12px !important;
          }

          .chargers-grid {
            grid-template-columns: 1fr !important;
            gap: 16px !important;
          }

          .charger-card {
            padding: 20px !important;
          }

          .charger-card h3 {
            font-size: 18px !important;
          }

          .modal-content h2 {
            font-size: 20px !important;
          }

          .instructions-modal {
            padding: 20px !important;
          }

          .instructions-modal h2 {
            font-size: 20px !important;
          }

          .instructions-modal h3 {
            font-size: 16px !important;
          }

          .form-row {
            grid-template-columns: 1fr !important;
          }
        }

        @media (max-width: 480px) {
          .chargers-container .chargers-header h1 {
            font-size: 20px !important;
            gap: 8px !important;
          }

          .chargers-container .chargers-header h1 svg {
            width: 20px !important;
            height: 20px !important;
          }

          .button-group-header {
            flex-direction: column;
          }

          .button-group-header button {
            width: 100%;
          }

          .building-cards-grid > div {
            padding: 16px !important;
          }

          .building-cards-grid h3 {
            font-size: 16px !important;
          }

          .charger-card {
            padding: 16px !important;
          }

          .charger-card h3 {
            font-size: 16px !important;
          }

          .modal-content {
            padding: 20px !important;
          }

          .instructions-modal {
            padding: 16px !important;
          }

          .instructions-modal h2 {
            font-size: 18px !important;
          }

          .instructions-modal h3 {
            font-size: 15px !important;
          }

          .instructions-modal div {
            font-size: 13px !important;
          }
        }
      `}</style>
    </div>
  );
}