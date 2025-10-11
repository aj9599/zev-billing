import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, X, Download, Database } from 'lucide-react';
import { api } from '../api/client';
import type { BillingSettings, Building } from '../types';

export default function PricingSettings() {
  const [settings, setSettings] = useState<BillingSettings[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingSetting, setEditingSetting] = useState<BillingSettings | null>(null);
  const [formData, setFormData] = useState<Partial<BillingSettings>>({
    building_id: 0,
    normal_power_price: 0.25,
    solar_power_price: 0.15,
    car_charging_normal_price: 0.30,
    car_charging_priority_price: 0.40,
    currency: 'CHF',
    valid_from: new Date().toISOString().split('T')[0],
    valid_to: '',
    is_active: true
  });
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [settingsData, buildingsData] = await Promise.all([
      api.getBillingSettings(),
      api.getBuildings()
    ]);
    setSettings(Array.isArray(settingsData) ? settingsData : []);
    setBuildings(buildingsData);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    
    try {
      if (editingSetting) {
        await api.updateBillingSettings({ ...formData, id: editingSetting.id });
      } else {
        await api.createBillingSettings(formData);
      }
      setShowModal(false);
      setEditingSetting(null);
      resetForm();
      loadData();
      setMessage('Pricing settings saved successfully!');
    } catch (err) {
      setMessage('Failed to save settings');
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm('Are you sure you want to delete this pricing setting?')) {
      try {
        await api.deleteBillingSettings(id);
        loadData();
        setMessage('Pricing setting deleted successfully!');
      } catch (err) {
        setMessage('Failed to delete setting');
      }
    }
  };

  const handleEdit = (setting: BillingSettings) => {
    setEditingSetting(setting);
    setFormData(setting);
    setShowModal(true);
  };

  const handleBackup = async () => {
    try {
      const response = await fetch('/api/billing/backup', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `zev-billing-backup-${new Date().toISOString().split('T')[0]}.db`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      setMessage('Database backup downloaded successfully!');
    } catch (err) {
      setMessage('Failed to download backup');
    }
  };

  const handleExport = async (type: 'meters' | 'chargers') => {
    try {
      const response = await fetch(`/api/billing/export?type=${type}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `zev-export-${type}-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      setMessage(`${type === 'meters' ? 'Meter' : 'Charger'} data exported successfully!`);
    } catch (err) {
      setMessage('Failed to export data');
    }
  };

  const resetForm = () => {
    setFormData({
      building_id: 0,
      normal_power_price: 0.25,
      solar_power_price: 0.15,
      car_charging_normal_price: 0.30,
      car_charging_priority_price: 0.40,
      currency: 'CHF',
      valid_from: new Date().toISOString().split('T')[0],
      valid_to: '',
      is_active: true
    });
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: 'bold' }}>Pricing Settings</h1>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={handleBackup} style={{
            display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
            backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px'
          }}>
            <Database size={18} />
            Backup Database
          </button>
          <button onClick={() => handleExport('meters')} style={{
            display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
            backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px'
          }}>
            <Download size={18} />
            Export Meters
          </button>
          <button onClick={() => handleExport('chargers')} style={{
            display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
            backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px'
          }}>
            <Download size={18} />
            Export Chargers
          </button>
          <button onClick={() => { resetForm(); setShowModal(true); }} style={{
            display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
            backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px'
          }}>
            <Plus size={18} />
            Add Pricing
          </button>
        </div>
      </div>

      {message && (
        <div style={{
          padding: '16px', marginBottom: '20px', borderRadius: '8px',
          backgroundColor: message.includes('success') ? '#d4edda' : '#f8d7da',
          color: message.includes('success') ? '#155724' : '#721c24'
        }}>
          {message}
        </div>
      )}

      <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
        <table style={{ width: '100%' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '1px solid #eee' }}>
              <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>Building</th>
              <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>Normal kWh</th>
              <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>Solar kWh</th>
              <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>Charging Normal</th>
              <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>Charging Priority</th>
              <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>Valid Period</th>
              <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>Status</th>
              <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {settings.map(setting => {
              const building = buildings.find(b => b.id === setting.building_id);
              return (
                <tr key={setting.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '16px', fontWeight: '500' }}>{building?.name || '-'}</td>
                  <td style={{ padding: '16px' }}>{setting.currency} {setting.normal_power_price.toFixed(2)}</td>
                  <td style={{ padding: '16px' }}>{setting.currency} {setting.solar_power_price.toFixed(2)}</td>
                  <td style={{ padding: '16px' }}>{setting.currency} {setting.car_charging_normal_price.toFixed(2)}</td>
                  <td style={{ padding: '16px' }}>{setting.currency} {setting.car_charging_priority_price.toFixed(2)}</td>
                  <td style={{ padding: '16px', fontSize: '13px' }}>
                    {setting.valid_from} {setting.valid_to ? `to ${setting.valid_to}` : '(ongoing)'}
                  </td>
                  <td style={{ padding: '16px' }}>
                    <span style={{
                      padding: '4px 12px', borderRadius: '12px', fontSize: '12px',
                      backgroundColor: setting.is_active ? '#d4edda' : '#f8d7da',
                      color: setting.is_active ? '#155724' : '#721c24'
                    }}>
                      {setting.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ padding: '16px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => handleEdit(setting)} style={{ padding: '6px', border: 'none', background: 'none', cursor: 'pointer' }}>
                        <Edit2 size={16} color="#007bff" />
                      </button>
                      <button onClick={() => handleDelete(setting.id)} style={{ padding: '6px', border: 'none', background: 'none', cursor: 'pointer' }}>
                        <Trash2 size={16} color="#dc3545" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {settings.length === 0 && (
          <div style={{ padding: '60px', textAlign: 'center', color: '#999' }}>
            No pricing settings configured. Add your first pricing to get started.
          </div>
        )}
      </div>

      {showModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white', borderRadius: '12px', padding: '30px',
            width: '90%', maxWidth: '600px', maxHeight: '90vh', overflow: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '24px', fontWeight: 'bold' }}>
                {editingSetting ? 'Edit Pricing' : 'Add Pricing'}
              </h2>
              <button onClick={() => { setShowModal(false); setEditingSetting(null); }} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>Building *</label>
                <select required value={formData.building_id} onChange={(e) => setFormData({ ...formData, building_id: parseInt(e.target.value) })}
                  style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}>
                  <option value={0}>Select Building</option>
                  {buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                    Normal Power (CHF/kWh) *
                  </label>
                  <input type="number" step="0.01" required value={formData.normal_power_price}
                    onChange={(e) => setFormData({ ...formData, normal_power_price: parseFloat(e.target.value) })}
                    style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                    Solar Power (CHF/kWh) *
                  </label>
                  <input type="number" step="0.01" required value={formData.solar_power_price}
                    onChange={(e) => setFormData({ ...formData, solar_power_price: parseFloat(e.target.value) })}
                    style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                    Car Charging Normal (CHF/kWh) *
                  </label>
                  <input type="number" step="0.01" required value={formData.car_charging_normal_price}
                    onChange={(e) => setFormData({ ...formData, car_charging_normal_price: parseFloat(e.target.value) })}
                    style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                    Car Charging Priority (CHF/kWh) *
                  </label>
                  <input type="number" step="0.01" required value={formData.car_charging_priority_price}
                    onChange={(e) => setFormData({ ...formData, car_charging_priority_price: parseFloat(e.target.value) })}
                    style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                    Valid From *
                  </label>
                  <input type="date" required value={formData.valid_from}
                    onChange={(e) => setFormData({ ...formData, valid_from: e.target.value })}
                    style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                    Valid To (optional)
                  </label>
                  <input type="date" value={formData.valid_to}
                    onChange={(e) => setFormData({ ...formData, valid_to: e.target.value })}
                    style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                </div>
              </div>

              <div style={{ marginTop: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })} />
                  <span style={{ fontWeight: '500', fontSize: '14px' }}>Active (use for billing)</span>
                </label>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button type="submit" style={{
                  flex: 1, padding: '12px', backgroundColor: '#007bff', color: 'white',
                  border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '500'
                }}>
                  {editingSetting ? 'Update' : 'Create'}
                </button>
                <button type="button" onClick={() => { setShowModal(false); setEditingSetting(null); }} style={{
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