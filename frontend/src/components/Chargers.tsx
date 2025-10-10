import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, X } from 'lucide-react';
import { api } from '../api/client';
import type { Charger, Building } from '../types';

export default function Chargers() {
  const [chargers, setChargers] = useState<Charger[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingCharger, setEditingCharger] = useState<Charger | null>(null);
  const [formData, setFormData] = useState<Partial<Charger>>({
    name: '', brand: 'weidmuller', preset: 'weidmuller', building_id: 0,
    connection_type: 'http', connection_config: '{}', supports_priority: true,
    notes: '', is_active: true
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
    try {
      if (editingCharger) {
        await api.updateCharger(editingCharger.id, formData);
      } else {
        await api.createCharger(formData);
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
    setShowModal(true);
  };

  const resetForm = () => {
    setFormData({
      name: '', brand: 'weidmuller', preset: 'weidmuller', building_id: 0,
      connection_type: 'http', connection_config: '{}', supports_priority: true,
      notes: '', is_active: true
    });
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: 'bold' }}>Car Chargers</h1>
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
            No chargers found. Create your first charger to start tracking charging sessions.
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
                {editingCharger ? 'Edit Charger' : 'Add Charger'}
              </h2>
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
                  <option value="weidmuller">Weidmüller</option>
                </select>
                <p style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                  Currently only Weidmüller preset is available
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
                  <option value="udp">UDP</option>
                </select>
              </div>

              <div style={{ marginTop: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                  Connection Config (JSON) *
                </label>
                <textarea required value={formData.connection_config} onChange={(e) => setFormData({ ...formData, connection_config: e.target.value })}
                  placeholder='{"power_endpoint": "http://...", "state_endpoint": "http://...", "user_id_endpoint": "http://...", "mode_endpoint": "http://..."}'
                  rows={6} style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontFamily: 'monospace', fontSize: '13px' }} />
                <p style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                  Weidmüller requires 4 endpoints: power_endpoint, state_endpoint, user_id_endpoint, mode_endpoint
                </p>
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