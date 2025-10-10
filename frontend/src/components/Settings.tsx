import { useState, useEffect } from 'react';
import { Save, Lock } from 'lucide-react';
import { api } from '../api/client';
import type { BillingSettings, Building } from '../types';

export default function Settings() {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [selectedBuilding, setSelectedBuilding] = useState<number>(0);
  const [formData, setFormData] = useState<Partial<BillingSettings>>({
    normal_power_price: 0.25,
    solar_power_price: 0.15,
    car_charging_normal_price: 0.30,
    car_charging_priority_price: 0.40,
    currency: 'CHF'
  });
  const [passwordForm, setPasswordForm] = useState({
    old_password: '',
    new_password: '',
    confirm_password: ''
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedBuilding > 0) {
      loadBuildingSettings(selectedBuilding);
    }
  }, [selectedBuilding]);

  const loadData = async () => {
    const buildingsData = await api.getBuildings();
    setBuildings(buildingsData);
    
    if (buildingsData.length > 0 && selectedBuilding === 0) {
      setSelectedBuilding(buildingsData[0].id);
    }
  };

  const loadBuildingSettings = async (buildingId: number) => {
    try {
      const data = await api.getBillingSettings(buildingId);
      if (!Array.isArray(data)) {
        setFormData(data);
      }
    } catch (err) {
      // No settings exist yet, use defaults
      setFormData({
        building_id: buildingId,
        normal_power_price: 0.25,
        solar_power_price: 0.15,
        car_charging_normal_price: 0.30,
        car_charging_priority_price: 0.40,
        currency: 'CHF'
      });
    }
  };

  const handleSavePricing = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    
    try {
      await api.updateBillingSettings({ ...formData, building_id: selectedBuilding });
      setMessage('Pricing settings saved successfully!');
      loadData();
    } catch (err) {
      setMessage('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      setMessage('New passwords do not match');
      return;
    }

    try {
      await api.changePassword(passwordForm.old_password, passwordForm.new_password);
      setMessage('Password changed successfully!');
      setPasswordForm({ old_password: '', new_password: '', confirm_password: '' });
    } catch (err) {
      setMessage('Failed to change password. Check your old password.');
    }
  };

  return (
    <div>
      <h1 style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '30px' }}>
        Settings
      </h1>

      {message && (
        <div style={{
          padding: '16px', marginBottom: '20px', borderRadius: '8px',
          backgroundColor: message.includes('success') ? '#d4edda' : '#f8d7da',
          color: message.includes('success') ? '#155724' : '#721c24'
        }}>
          {message}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '30px' }}>
        <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '30px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Save size={24} />
            Billing Pricing Settings
          </h2>

          <form onSubmit={handleSavePricing}>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                Select Building
              </label>
              <select
                value={selectedBuilding}
                onChange={(e) => setSelectedBuilding(parseInt(e.target.value))}
                style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}
              >
                {buildings.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <p style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                Set prices per building or building group
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                  Normal Power Price (CHF/kWh)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.normal_power_price}
                  onChange={(e) => setFormData({ ...formData, normal_power_price: parseFloat(e.target.value) })}
                  style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                  Solar Power Price (CHF/kWh)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.solar_power_price}
                  onChange={(e) => setFormData({ ...formData, solar_power_price: parseFloat(e.target.value) })}
                  style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                  Car Charging Normal (CHF/kWh)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.car_charging_normal_price}
                  onChange={(e) => setFormData({ ...formData, car_charging_normal_price: parseFloat(e.target.value) })}
                  style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                  Car Charging Priority (CHF/kWh)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.car_charging_priority_price}
                  onChange={(e) => setFormData({ ...formData, car_charging_priority_price: parseFloat(e.target.value) })}
                  style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}
                />
              </div>
            </div>

            <div style={{ padding: '16px', backgroundColor: '#f9f9f9', borderRadius: '8px', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px' }}>
                Swiss ZEV Billing Standard
              </h3>
              <p style={{ fontSize: '13px', color: '#666', lineHeight: '1.6' }}>
                Prices are calculated based on 15-minute intervals following the Swiss ZEV (Zusammenschluss zum Eigenverbrauch) standard.
                Different rates apply for normal power, solar power, and car charging modes.
              </p>
            </div>

            <button
              type="submit"
              disabled={saving}
              style={{
                width: '100%', padding: '12px', backgroundColor: '#007bff', color: 'white',
                border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '500',
                opacity: saving ? 0.7 : 1
              }}
            >
              {saving ? 'Saving...' : 'Save Pricing Settings'}
            </button>
          </form>
        </div>

        <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '30px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Lock size={24} />
            Change Password
          </h2>

          <form onSubmit={handleChangePassword}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                Current Password
              </label>
              <input
                type="password"
                required
                value={passwordForm.old_password}
                onChange={(e) => setPasswordForm({ ...passwordForm, old_password: e.target.value })}
                style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                New Password
              </label>
              <input
                type="password"
                required
                value={passwordForm.new_password}
                onChange={(e) => setPasswordForm({ ...passwordForm, new_password: e.target.value })}
                style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                Confirm New Password
              </label>
              <input
                type="password"
                required
                value={passwordForm.confirm_password}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirm_password: e.target.value })}
                style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}
              />
            </div>

            <button
              type="submit"
              style={{
                width: '100%', padding: '12px', backgroundColor: '#28a745', color: 'white',
                border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '500'
              }}
            >
              Change Password
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}