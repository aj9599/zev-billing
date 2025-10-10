import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, X } from 'lucide-react';
import { api } from '../api/client';
import type { User, Building } from '../types';

export default function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState<Partial<User>>({
    first_name: '', last_name: '', email: '', phone: '',
    address_street: '', address_city: '', address_zip: '', address_country: 'Switzerland',
    bank_name: '', bank_iban: '', bank_account_holder: '',
    charger_ids: '', notes: '', building_id: undefined
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [usersData, buildingsData] = await Promise.all([
      api.getUsers(),
      api.getBuildings()
    ]);
    setUsers(usersData);
    setBuildings(buildingsData);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingUser) {
        await api.updateUser(editingUser.id, formData);
      } else {
        await api.createUser(formData);
      }
      setShowModal(false);
      setEditingUser(null);
      resetForm();
      loadData();
    } catch (err) {
      alert('Failed to save user');
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm('Are you sure you want to delete this user?')) {
      try {
        await api.deleteUser(id);
        loadData();
      } catch (err) {
        alert('Failed to delete user');
      }
    }
  };

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setFormData(user);
    setShowModal(true);
  };

  const resetForm = () => {
    setFormData({
      first_name: '', last_name: '', email: '', phone: '',
      address_street: '', address_city: '', address_zip: '', address_country: 'Switzerland',
      bank_name: '', bank_iban: '', bank_account_holder: '',
      charger_ids: '', notes: '', building_id: undefined
    });
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: 'bold' }}>Users</h1>
        <button
          onClick={() => { resetForm(); setShowModal(true); }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 20px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px'
          }}
        >
          <Plus size={18} />
          Add User
        </button>
      </div>

      <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
        <table style={{ width: '100%' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '1px solid #eee' }}>
              <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>Name</th>
              <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>Email</th>
              <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>Phone</th>
              <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>Building</th>
              <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '16px' }}>{user.first_name} {user.last_name}</td>
                <td style={{ padding: '16px' }}>{user.email}</td>
                <td style={{ padding: '16px' }}>{user.phone}</td>
                <td style={{ padding: '16px' }}>
                  {buildings.find(b => b.id === user.building_id)?.name || '-'}
                </td>
                <td style={{ padding: '16px' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => handleEdit(user)} style={{ padding: '6px', border: 'none', background: 'none', cursor: 'pointer' }}>
                      <Edit2 size={16} color="#007bff" />
                    </button>
                    <button onClick={() => handleDelete(user.id)} style={{ padding: '6px', border: 'none', background: 'none', cursor: 'pointer' }}>
                      <Trash2 size={16} color="#dc3545" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && (
          <div style={{ padding: '60px', textAlign: 'center', color: '#999' }}>
            No users found. Create your first user to get started.
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
                {editingUser ? 'Edit User' : 'Add User'}
              </h2>
              <button onClick={() => { setShowModal(false); setEditingUser(null); }} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>First Name *</label>
                  <input type="text" required value={formData.first_name} onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                    style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>Last Name *</label>
                  <input type="text" required value={formData.last_name} onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                    style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                </div>
              </div>

              <div style={{ marginTop: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>Email *</label>
                <input type="email" required value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
              </div>

              <div style={{ marginTop: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>Phone</label>
                <input type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
              </div>

              <div style={{ marginTop: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>Building</label>
                <select value={formData.building_id || ''} onChange={(e) => setFormData({ ...formData, building_id: e.target.value ? parseInt(e.target.value) : undefined })}
                  style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}>
                  <option value="">Select Building</option>
                  {buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>

              <div style={{ marginTop: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>Address</label>
                <input type="text" value={formData.address_street} onChange={(e) => setFormData({ ...formData, address_street: e.target.value })}
                  placeholder="Street" style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', marginBottom: '8px' }} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <input type="text" value={formData.address_zip} onChange={(e) => setFormData({ ...formData, address_zip: e.target.value })}
                    placeholder="ZIP" style={{ padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                  <input type="text" value={formData.address_city} onChange={(e) => setFormData({ ...formData, address_city: e.target.value })}
                    placeholder="City" style={{ padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                </div>
              </div>

              <div style={{ marginTop: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>Bank Details</label>
                <input type="text" value={formData.bank_name} onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                  placeholder="Bank Name" style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', marginBottom: '8px' }} />
                <input type="text" value={formData.bank_iban} onChange={(e) => setFormData({ ...formData, bank_iban: e.target.value })}
                  placeholder="IBAN" style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', marginBottom: '8px' }} />
                <input type="text" value={formData.bank_account_holder} onChange={(e) => setFormData({ ...formData, bank_account_holder: e.target.value })}
                  placeholder="Account Holder" style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
              </div>

              <div style={{ marginTop: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>Charger IDs (comma-separated)</label>
                <input type="text" value={formData.charger_ids} onChange={(e) => setFormData({ ...formData, charger_ids: e.target.value })}
                  placeholder="e.g., CHARGER_001, CHARGER_002" style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
              </div>

              <div style={{ marginTop: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>Notes</label>
                <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3} style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontFamily: 'inherit' }} />
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button type="submit" style={{
                  flex: 1, padding: '12px', backgroundColor: '#007bff', color: 'white',
                  border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '500'
                }}>
                  {editingUser ? 'Update' : 'Create'}
                </button>
                <button type="button" onClick={() => { setShowModal(false); setEditingUser(null); }} style={{
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