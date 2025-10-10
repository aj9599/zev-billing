import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, X } from 'lucide-react';
import { api } from '../api/client';
import type { Meter, Building, User } from '../types';

export default function Meters() {
  const [meters, setMeters] = useState<Meter[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingMeter, setEditingMeter] = useState<Meter | null>(null);
  const [formData, setFormData] = useState<Partial<Meter>>({
    name: '', meter_type: 'total_meter', building_id: 0, user_id: undefined,
    connection_type: 'http', connection_config: '{}', notes: '', is_active: true
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
    try {
      if (editingMeter) {
        await api.updateMeter(editingMeter.id, formData);
      } else {
        await api.createMeter(formData);
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
    setShowModal(true);
  };

  const resetForm = () => {
    setFormData({
      name: '', meter_type: 'total_meter', building_id: 0, user_id: undefined,
      connection_type: 'http', connection_config: '{}', notes: '', is_active: true
    });
  };

  const meterTypes = [
    { value: 'total_meter', label: 'Total Meter' },
    { value: 'solar_meter', label: 'Solar Meter' },
    { value: 'apartment_meter', label: 'Apartment Meter' },
    { value: 'heating_meter', label: 'Heating Meter' },
    { value: 'other', label: 'Other' }
  ];

  const connectionTypes = [
    { value: 'http', label: 'HTTP' },
    { value: 'modbus_tcp', label: 'Modbus TCP' },
    { value: 'udp', label: 'UDP' }
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: 'bold' }}>Power Meters</h1>
        <button
          onClick={() => { resetForm(); setShowModal(true); }}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
            backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px'
          }}
        >
          <Plus size={18} />
          Add Meter
        </button>
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
            No meters found. Create your first meter to start collecting data.
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
                {editingMeter ? 'Edit Meter' : 'Add Meter'}
              </h2>
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
                  {connectionTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>

              <div style={{ marginTop: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                  Connection Config (JSON) *
                </label>
                <textarea required value={formData.connection_config} onChange={(e) => setFormData({ ...formData, connection_config: e.target.value })}
                  placeholder='{"endpoint": "http://192.168.1.100/api/power", "power_field": "power_kwh"}'
                  rows={4} style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontFamily: 'monospace', fontSize: '13px' }} />
                <p style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                  Example for HTTP: {`{"endpoint": "http://...", "power_field": "power_kwh"}`}
                </p>
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