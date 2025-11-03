import { useState, useEffect } from 'react';
import { Settings, Plus, Edit2, Trash2, Building as BuildingIcon, Zap, AlertCircle } from 'lucide-react';
import { api } from '../api/client';
import type { SharedMeterConfig, Building, Meter } from '../types';
//import { useTranslation } from '../i18n';

export default function SharedMeterConfig() {
  //const { t } = useTranslation();
  const [configs, setConfigs] = useState<SharedMeterConfig[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [meters, setMeters] = useState<Meter[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingConfig, setEditingConfig] = useState<SharedMeterConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const [formData, setFormData] = useState({
    meter_id: 0,
    building_id: 0,
    meter_name: '',
    split_type: 'equal' as 'equal' | 'by_area' | 'by_units' | 'custom',
    unit_price: 0
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [configsData, buildingsData, metersData] = await Promise.all([
        api.getSharedMeterConfigs(),
        api.getBuildings(),
        api.getMeters()
      ]);
      setConfigs(configsData);
      setBuildings(buildingsData);
      // Only show building-level meters (no user_id)
      setMeters(metersData.filter(m => !m.user_id));
    } catch (err) {
      console.error('Failed to load data:', err);
      alert('Failed to load shared meter configurations');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingConfig(null);
    setFormData({
      meter_id: 0,
      building_id: 0,
      meter_name: '',
      split_type: 'equal',
      unit_price: 0
    });
    setShowModal(true);
  };

  const handleEdit = (config: SharedMeterConfig) => {
    setEditingConfig(config);
    setFormData({
      meter_id: config.meter_id,
      building_id: config.building_id,
      meter_name: config.meter_name,
      split_type: config.split_type,
      unit_price: config.unit_price
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.building_id || !formData.meter_id || formData.unit_price <= 0) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      if (editingConfig) {
        await api.updateSharedMeterConfig(editingConfig.id, formData);
      } else {
        await api.createSharedMeterConfig(formData);
      }
      setShowModal(false);
      loadData();
      alert('Shared meter configuration saved successfully');
    } catch (err) {
      console.error('Failed to save:', err);
      alert(`Failed to save: ${err}`);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this shared meter configuration?')) return;
    
    try {
      await api.deleteSharedMeterConfig(id);
      loadData();
      alert('Deleted successfully');
    } catch (err) {
      console.error('Failed to delete:', err);
      alert(`Failed to delete: ${err}`);
    }
  };

  const getBuildingName = (buildingId: number) => {
    const building = buildings.find(b => b.id === buildingId);
    return building?.name || 'Unknown';
  };

  const getSplitTypeLabel = (splitType: string) => {
    switch (splitType) {
      case 'equal': return 'Equal Split';
      case 'by_area': return 'By Area';
      case 'by_units': return 'By Units';
      case 'custom': return 'Custom';
      default: return splitType;
    }
  };

  const getSplitTypeDescription = (splitType: string) => {
    switch (splitType) {
      case 'equal': return 'Cost is split equally among all active users in the building';
      case 'by_area': return 'Cost is proportional to apartment area (requires area data)';
      case 'by_units': return 'Cost is proportional to number of units (requires unit count)';
      case 'custom': return 'Custom percentage split for each user (requires configuration)';
      default: return '';
    }
  };

  if (loading) {
    return (
      <div style={{ 
        padding: '40px', 
        textAlign: 'center',
        minHeight: '400px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <p>Loading shared meter configurations...</p>
      </div>
    );
  }

  return (
    <div style={{ 
      padding: '30px', 
      maxWidth: '1400px', 
      margin: '0 auto',
      backgroundColor: '#f8f9fa',
      minHeight: '100vh'
    }}>
      <div style={{ 
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '30px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
      }}>
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'start',
          marginBottom: '30px',
          paddingBottom: '20px',
          borderBottom: '2px solid #e9ecef'
        }}>
          <div>
            <h1 style={{ 
              fontSize: '28px', 
              fontWeight: 'bold', 
              marginBottom: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <Settings size={32} />
              Shared Meter Configuration
            </h1>
            <p style={{ fontSize: '15px', color: '#6c757d' }}>
              Configure shared meters and how their costs are split among users
            </p>
          </div>
          <button
            onClick={handleCreate}
            style={{
              padding: '12px 24px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '15px',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#0056b3'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#007bff'}
          >
            <Plus size={18} />
            Add Shared Meter
          </button>
        </div>

        {/* Info Banner */}
        <div style={{
          backgroundColor: '#e7f3ff',
          border: '1px solid #b3d9ff',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '24px',
          display: 'flex',
          gap: '12px'
        }}>
          <AlertCircle size={20} color="#0066cc" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div style={{ fontSize: '14px', color: '#004a99', lineHeight: '1.6' }}>
            <strong>About Shared Meters:</strong> Shared meters track common-area electricity (hallways, elevators, parking, etc.) 
            that is split among multiple users. Configure how costs are divided using equal split, area-based, or custom percentages.
          </div>
        </div>

        {/* Configs List */}
        {configs.length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            padding: '60px 20px',
            color: '#6c757d'
          }}>
            <Zap size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
            <p style={{ fontSize: '16px', marginBottom: '8px' }}>No shared meters configured yet</p>
            <p style={{ fontSize: '14px' }}>Click "Add Shared Meter" to create your first configuration</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ 
              width: '100%', 
              borderCollapse: 'collapse',
              backgroundColor: 'white'
            }}>
              <thead>
                <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #dee2e6' }}>
                  <th style={{ 
                    padding: '14px 16px', 
                    textAlign: 'left', 
                    fontWeight: '600',
                    fontSize: '14px',
                    color: '#495057'
                  }}>
                    Meter Name
                  </th>
                  <th style={{ 
                    padding: '14px 16px', 
                    textAlign: 'left', 
                    fontWeight: '600',
                    fontSize: '14px',
                    color: '#495057'
                  }}>
                    Building
                  </th>
                  <th style={{ 
                    padding: '14px 16px', 
                    textAlign: 'left', 
                    fontWeight: '600',
                    fontSize: '14px',
                    color: '#495057'
                  }}>
                    Split Type
                  </th>
                  <th style={{ 
                    padding: '14px 16px', 
                    textAlign: 'right', 
                    fontWeight: '600',
                    fontSize: '14px',
                    color: '#495057'
                  }}>
                    Unit Price
                  </th>
                  <th style={{ 
                    padding: '14px 16px', 
                    textAlign: 'right', 
                    fontWeight: '600',
                    fontSize: '14px',
                    color: '#495057'
                  }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {configs.map(config => (
                  <tr key={config.id} style={{ 
                    borderBottom: '1px solid #dee2e6',
                    transition: 'background-color 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f8f9fa'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'white'}
                  >
                    <td style={{ padding: '14px 16px', fontSize: '15px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Zap size={16} color="#ffc107" />
                        <strong>{config.meter_name}</strong>
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: '15px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <BuildingIcon size={16} color="#6c757d" />
                        {getBuildingName(config.building_id)}
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: '14px' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '4px 12px',
                        borderRadius: '12px',
                        backgroundColor: '#e7f3ff',
                        color: '#0066cc',
                        fontSize: '13px',
                        fontWeight: '500'
                      }}>
                        {getSplitTypeLabel(config.split_type)}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right', fontSize: '15px', fontWeight: '600' }}>
                      CHF {config.unit_price.toFixed(3)}/kWh
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => handleEdit(config)}
                          style={{
                            padding: '8px 12px',
                            backgroundColor: '#28a745',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            transition: 'all 0.2s'
                          }}
                          onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#218838'}
                          onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#28a745'}
                        >
                          <Edit2 size={14} />
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(config.id)}
                          style={{
                            padding: '8px 12px',
                            backgroundColor: '#dc3545',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            transition: 'all 0.2s'
                          }}
                          onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#c82333'}
                          onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#dc3545'}
                        >
                          <Trash2 size={14} />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '30px',
            maxWidth: '600px',
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 10px 40px rgba(0,0,0,0.2)'
          }}>
            <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '24px' }}>
              {editingConfig ? 'Edit Shared Meter' : 'Add Shared Meter'}
            </h2>
            
            {/* Building Selection */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '8px', 
                fontWeight: '600',
                fontSize: '14px',
                color: '#495057'
              }}>
                Building <span style={{ color: '#dc3545' }}>*</span>
              </label>
              <select 
                value={formData.building_id}
                onChange={(e) => {
                  const buildingId = parseInt(e.target.value);
                  setFormData({...formData, building_id: buildingId, meter_id: 0, meter_name: ''});
                }}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #ced4da',
                  borderRadius: '6px',
                  fontSize: '15px',
                  backgroundColor: 'white'
                }}
              >
                <option value={0}>Select a building...</option>
                {buildings.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            {/* Meter Selection */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '8px', 
                fontWeight: '600',
                fontSize: '14px',
                color: '#495057'
              }}>
                Meter <span style={{ color: '#dc3545' }}>*</span>
              </label>
              <select 
                value={formData.meter_id}
                onChange={(e) => {
                  const meterId = parseInt(e.target.value);
                  const meter = meters.find(m => m.id === meterId);
                  setFormData({
                    ...formData, 
                    meter_id: meterId,
                    meter_name: meter?.name || ''
                  });
                }}
                disabled={!formData.building_id}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #ced4da',
                  borderRadius: '6px',
                  fontSize: '15px',
                  backgroundColor: formData.building_id ? 'white' : '#e9ecef',
                  cursor: formData.building_id ? 'pointer' : 'not-allowed'
                }}
              >
                <option value={0}>Select a meter...</option>
                {meters
                  .filter(m => m.building_id === formData.building_id)
                  .map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
              </select>
              {formData.building_id && meters.filter(m => m.building_id === formData.building_id).length === 0 && (
                <p style={{ fontSize: '13px', color: '#dc3545', marginTop: '6px' }}>
                  No building-level meters found for this building
                </p>
              )}
            </div>

            {/* Split Type Selection */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '12px', 
                fontWeight: '600',
                fontSize: '14px',
                color: '#495057'
              }}>
                Split Type <span style={{ color: '#dc3545' }}>*</span>
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {(['equal', 'by_area', 'by_units', 'custom'] as const).map(type => (
                  <label key={type} style={{
                    display: 'flex',
                    alignItems: 'start',
                    gap: '12px',
                    padding: '14px',
                    border: `2px solid ${formData.split_type === type ? '#007bff' : '#dee2e6'}`,
                    borderRadius: '8px',
                    cursor: 'pointer',
                    backgroundColor: formData.split_type === type ? '#e7f3ff' : 'white',
                    transition: 'all 0.2s'
                  }}>
                    <input
                      type="radio"
                      name="split_type"
                      value={type}
                      checked={formData.split_type === type}
                      onChange={(e) => setFormData({...formData, split_type: e.target.value as any})}
                      style={{ marginTop: '2px', cursor: 'pointer' }}
                    />
                    <div style={{ flex: 1 }}>
                      <strong style={{ fontSize: '15px', display: 'block', marginBottom: '4px' }}>
                        {getSplitTypeLabel(type)}
                      </strong>
                      <p style={{ fontSize: '13px', color: '#6c757d', margin: 0 }}>
                        {getSplitTypeDescription(type)}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Unit Price */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '8px', 
                fontWeight: '600',
                fontSize: '14px',
                color: '#495057'
              }}>
                Unit Price (CHF/kWh) <span style={{ color: '#dc3545' }}>*</span>
              </label>
              <input
                type="number"
                step="0.001"
                min="0"
                value={formData.unit_price}
                onChange={(e) => setFormData({...formData, unit_price: parseFloat(e.target.value) || 0})}
                placeholder="0.250"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #ced4da',
                  borderRadius: '6px',
                  fontSize: '15px'
                }}
              />
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  flex: 1,
                  padding: '12px',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '15px',
                  fontWeight: '500',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#5a6268'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#6c757d'}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!formData.building_id || !formData.meter_id || formData.unit_price <= 0}
                style={{
                  flex: 1,
                  padding: '12px',
                  backgroundColor: (!formData.building_id || !formData.meter_id || formData.unit_price <= 0) ? '#ced4da' : '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: (!formData.building_id || !formData.meter_id || formData.unit_price <= 0) ? 'not-allowed' : 'pointer',
                  fontSize: '15px',
                  fontWeight: '500',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => {
                  if (formData.building_id && formData.meter_id && formData.unit_price > 0) {
                    e.currentTarget.style.backgroundColor = '#0056b3';
                  }
                }}
                onMouseOut={(e) => {
                  if (formData.building_id && formData.meter_id && formData.unit_price > 0) {
                    e.currentTarget.style.backgroundColor = '#007bff';
                  }
                }}
              >
                {editingConfig ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}