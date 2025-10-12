import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, X, Users as UsersIcon, Mail, Phone, MapPin } from 'lucide-react';
import { api } from '../api/client';
import type { User, Building } from '../types';
import { useTranslation } from '../i18n';

export default function Users() {
  const { t } = useTranslation();
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
      alert(t('users.saveFailed'));
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm(t('users.deleteConfirm'))) {
      try {
        await api.deleteUser(id);
        loadData();
      } catch (err) {
        alert(t('users.deleteFailed'));
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
    <div className="users-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', gap: '15px', flexWrap: 'wrap' }}>
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
            <UsersIcon size={36} style={{ color: '#667eea' }} />
            {t('users.title')}
          </h1>
          <p style={{ color: '#6b7280', fontSize: '16px' }}>
            {t('users.subtitle')}
          </p>
        </div>
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
            fontSize: '14px',
            cursor: 'pointer'
          }}
        >
          <Plus size={18} />
          {t('users.addUser')}
        </button>
      </div>

      {/* Desktop Table */}
      <div className="desktop-table" style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
        <table style={{ width: '100%' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '1px solid #eee' }}>
              <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>{t('common.name')}</th>
              <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>{t('common.email')}</th>
              <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>{t('common.phone')}</th>
              <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>{t('users.building')}</th>
              <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>{t('common.actions')}</th>
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
            {t('users.noUsers')}
          </div>
        )}
      </div>

      {/* Mobile Cards */}
      <div className="mobile-cards">
        {users.map(user => (
          <div key={user.id} style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '16px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '4px', color: '#1f2937' }}>
                  {user.first_name} {user.last_name}
                </h3>
                <div style={{ fontSize: '13px', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <Mail size={14} />
                  {user.email}
                </div>
                {user.phone && (
                  <div style={{ fontSize: '13px', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                    <Phone size={14} />
                    {user.phone}
                  </div>
                )}
                {user.building_id && (
                  <div style={{ fontSize: '13px', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <MapPin size={14} />
                    {buildings.find(b => b.id === user.building_id)?.name || '-'}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => handleEdit(user)} style={{ padding: '8px', border: 'none', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '6px', cursor: 'pointer' }}>
                  <Edit2 size={16} color="#3b82f6" />
                </button>
                <button onClick={() => handleDelete(user.id)} style={{ padding: '8px', border: 'none', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '6px', cursor: 'pointer' }}>
                  <Trash2 size={16} color="#ef4444" />
                </button>
              </div>
            </div>
          </div>
        ))}
        {users.length === 0 && (
          <div style={{ backgroundColor: 'white', padding: '40px 20px', textAlign: 'center', color: '#999', borderRadius: '12px' }}>
            {t('users.noUsers')}
          </div>
        )}
      </div>

      {showModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          padding: '15px'
        }}>
          <div className="modal-content" style={{
            backgroundColor: 'white', borderRadius: '12px', padding: '30px',
            width: '90%', maxWidth: '600px', maxHeight: '90vh', overflow: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '24px', fontWeight: 'bold' }}>
                {editingUser ? t('users.editUser') : t('users.addUser')}
              </h2>
              <button onClick={() => { setShowModal(false); setEditingUser(null); }} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>{t('users.firstName')} *</label>
                  <input type="text" required value={formData.first_name} onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                    style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>{t('users.lastName')} *</label>
                  <input type="text" required value={formData.last_name} onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                    style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                </div>
              </div>

              <div style={{ marginTop: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>{t('common.email')} *</label>
                <input type="email" required value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
              </div>

              <div style={{ marginTop: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>{t('common.phone')}</label>
                <input type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
              </div>

              <div style={{ marginTop: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>{t('users.building')}</label>
                <select value={formData.building_id || ''} onChange={(e) => setFormData({ ...formData, building_id: e.target.value ? parseInt(e.target.value) : undefined })}
                  style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}>
                  <option value="">{t('users.selectBuilding')}</option>
                  {buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>

              <div style={{ marginTop: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>{t('common.address')}</label>
                <input type="text" value={formData.address_street} onChange={(e) => setFormData({ ...formData, address_street: e.target.value })}
                  placeholder={t('users.street')} style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', marginBottom: '8px' }} />
                <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <input type="text" value={formData.address_zip} onChange={(e) => setFormData({ ...formData, address_zip: e.target.value })}
                    placeholder={t('users.zip')} style={{ padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                  <input type="text" value={formData.address_city} onChange={(e) => setFormData({ ...formData, address_city: e.target.value })}
                    placeholder={t('users.city')} style={{ padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                </div>
              </div>

              <div style={{ marginTop: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>{t('users.bankDetails')}</label>
                <input type="text" value={formData.bank_name} onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                  placeholder={t('users.bankName')} style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', marginBottom: '8px' }} />
                <input type="text" value={formData.bank_iban} onChange={(e) => setFormData({ ...formData, bank_iban: e.target.value })}
                  placeholder={t('users.iban')} style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', marginBottom: '8px' }} />
                <input type="text" value={formData.bank_account_holder} onChange={(e) => setFormData({ ...formData, bank_account_holder: e.target.value })}
                  placeholder={t('users.accountHolder')} style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
              </div>

              <div style={{ marginTop: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>{t('users.chargerIds')}</label>
                <input type="text" value={formData.charger_ids} onChange={(e) => setFormData({ ...formData, charger_ids: e.target.value })}
                  placeholder={t('users.chargerIdsPlaceholder')} style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
              </div>

              <div style={{ marginTop: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>{t('common.notes')}</label>
                <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3} style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontFamily: 'inherit' }} />
              </div>

              <div className="button-group" style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button type="submit" style={{
                  flex: 1, padding: '12px', backgroundColor: '#007bff', color: 'white',
                  border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '500'
                }}>
                  {editingUser ? t('common.update') : t('common.create')}
                </button>
                <button type="button" onClick={() => { setShowModal(false); setEditingUser(null); }} style={{
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

      <style>{`
        @media (max-width: 768px) {
          .users-container h1 {
            font-size: 24px !important;
          }

          .users-container h1 svg {
            width: 24px !important;
            height: 24px !important;
          }

          .users-container p {
            font-size: 14px !important;
          }

          .modal-content h2 {
            font-size: 20px !important;
          }
        }

        @media (max-width: 480px) {
          .users-container h1 {
            font-size: 20px !important;
          }

          .users-container h1 svg {
            width: 20px !important;
            height: 20px !important;
          }
        }
      `}</style>
    </div>
  );
}