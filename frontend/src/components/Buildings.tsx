import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, X, Building as BuildingIcon, Search, MapPin } from 'lucide-react';
import { api } from '../api/client';
import type { Building } from '../types';
import { useTranslation } from '../i18n';

export default function Buildings() {
  const { t } = useTranslation();
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingBuilding, setEditingBuilding] = useState<Building | null>(null);
  const [formData, setFormData] = useState<Partial<Building>>({
    name: '', address_street: '', address_city: '', address_zip: '',
    address_country: 'Switzerland', notes: '', is_group: false, group_buildings: []
  });

  useEffect(() => {
    loadBuildings();
  }, []);

  const loadBuildings = async () => {
    const data = await api.getBuildings();
    setBuildings(data);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingBuilding) {
        await api.updateBuilding(editingBuilding.id, formData);
      } else {
        await api.createBuilding(formData);
      }
      setShowModal(false);
      setEditingBuilding(null);
      resetForm();
      loadBuildings();
    } catch (err) {
      alert(t('buildings.saveFailed'));
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm(t('buildings.deleteConfirm'))) {
      try {
        await api.deleteBuilding(id);
        loadBuildings();
      } catch (err) {
        alert(t('buildings.deleteFailed'));
      }
    }
  };

  const handleEdit = (building: Building) => {
    setEditingBuilding(building);
    setFormData(building);
    setShowModal(true);
  };

  const resetForm = () => {
    setFormData({
      name: '', address_street: '', address_city: '', address_zip: '',
      address_country: 'Switzerland', notes: '', is_group: false, group_buildings: []
    });
  };

  const toggleGroupBuilding = (buildingId: number) => {
    const current = formData.group_buildings || [];
    if (current.includes(buildingId)) {
      setFormData({ ...formData, group_buildings: current.filter(id => id !== buildingId) });
    } else {
      setFormData({ ...formData, group_buildings: [...current, buildingId] });
    }
  };

  const availableBuildings = buildings.filter(b => !b.is_group && b.id !== editingBuilding?.id);

  const filteredBuildings = buildings.filter(b =>
    b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.address_street.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.address_city.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="buildings-container">
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
            <BuildingIcon size={36} style={{ color: '#667eea' }} />
            {t('buildings.title')}
          </h1>
          <p style={{ color: '#6b7280', fontSize: '16px' }}>
            {t('buildings.subtitle')}
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
          {t('buildings.addBuilding')}
        </button>
      </div>

      {/* Search Bar */}
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

      {/* Desktop Table */}
      <div className="desktop-table" style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
        <table style={{ width: '100%' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '1px solid #eee' }}>
              <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>{t('common.name')}</th>
              <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>{t('common.address')}</th>
              <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>{t('buildings.type')}</th>
              <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {filteredBuildings.map(building => (
              <tr key={building.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '16px', fontWeight: '500' }}>{building.name}</td>
                <td style={{ padding: '16px' }}>
                  {building.address_street}, {building.address_zip} {building.address_city}
                </td>
                <td style={{ padding: '16px' }}>
                  <span style={{
                    padding: '4px 12px', borderRadius: '12px', fontSize: '12px',
                    backgroundColor: building.is_group ? '#e3f2fd' : '#f3e5f5',
                    color: building.is_group ? '#1976d2' : '#7b1fa2'
                  }}>
                    {building.is_group ? t('buildings.group') : t('buildings.single')}
                  </span>
                </td>
                <td style={{ padding: '16px' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => handleEdit(building)} style={{ padding: '6px', border: 'none', background: 'none', cursor: 'pointer' }}>
                      <Edit2 size={16} color="#007bff" />
                    </button>
                    <button onClick={() => handleDelete(building.id)} style={{ padding: '6px', border: 'none', background: 'none', cursor: 'pointer' }}>
                      <Trash2 size={16} color="#dc3545" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredBuildings.length === 0 && (
          <div style={{ padding: '60px', textAlign: 'center', color: '#999' }}>
            {searchQuery ? t('buildings.noResults') : t('buildings.noBuildings')}
          </div>
        )}
      </div>

      {/* Mobile Cards */}
      <div className="mobile-cards">
        {filteredBuildings.map(building => (
          <div key={building.id} style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '16px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px', color: '#1f2937' }}>
                  {building.name}
                </h3>
                <div style={{ fontSize: '13px', color: '#6b7280', display: 'flex', alignItems: 'start', gap: '6px', marginBottom: '8px' }}>
                  <MapPin size={14} style={{ marginTop: '2px', flexShrink: 0 }} />
                  <span>
                    {building.address_street}<br />
                    {building.address_zip} {building.address_city}
                  </span>
                </div>
                <span style={{
                  padding: '4px 12px',
                  borderRadius: '12px',
                  fontSize: '12px',
                  backgroundColor: building.is_group ? '#e3f2fd' : '#f3e5f5',
                  color: building.is_group ? '#1976d2' : '#7b1fa2',
                  display: 'inline-block'
                }}>
                  {building.is_group ? t('buildings.group') : t('buildings.single')}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => handleEdit(building)} style={{ padding: '8px', border: 'none', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '6px', cursor: 'pointer' }}>
                  <Edit2 size={16} color="#3b82f6" />
                </button>
                <button onClick={() => handleDelete(building.id)} style={{ padding: '8px', border: 'none', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '6px', cursor: 'pointer' }}>
                  <Trash2 size={16} color="#ef4444" />
                </button>
              </div>
            </div>
          </div>
        ))}
        {filteredBuildings.length === 0 && (
          <div style={{ backgroundColor: 'white', padding: '40px 20px', textAlign: 'center', color: '#999', borderRadius: '12px' }}>
            {searchQuery ? t('buildings.noResults') : t('buildings.noBuildings')}
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
                {editingBuilding ? t('buildings.editBuilding') : t('buildings.addBuilding')}
              </h2>
              <button onClick={() => { setShowModal(false); setEditingBuilding(null); }} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
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
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={formData.is_group} onChange={(e) => setFormData({ ...formData, is_group: e.target.checked })} />
                  <span style={{ fontWeight: '500', fontSize: '14px' }}>{t('buildings.isGroup')}</span>
                </label>
              </div>

              {formData.is_group && (
                <div style={{ marginTop: '16px', padding: '16px', backgroundColor: '#f9f9f9', borderRadius: '6px' }}>
                  <label style={{ display: 'block', marginBottom: '12px', fontWeight: '500', fontSize: '14px' }}>
                    {t('buildings.selectBuildings')}
                  </label>
                  {availableBuildings.length === 0 ? (
                    <p style={{ color: '#999', fontSize: '14px' }}>{t('buildings.noAvailableBuildings')}</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                      {availableBuildings.map(b => (
                        <label key={b.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={(formData.group_buildings || []).includes(b.id)}
                            onChange={() => toggleGroupBuilding(b.id)}
                          />
                          <span style={{ fontSize: '14px' }}>{b.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div style={{ marginTop: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>{t('common.address')}</label>
                <input type="text" value={formData.address_street} onChange={(e) => setFormData({ ...formData, address_street: e.target.value })}
                  placeholder={t('users.street')} style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', marginBottom: '8px' }} />
                <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '8px' }}>
                  <input type="text" value={formData.address_zip} onChange={(e) => setFormData({ ...formData, address_zip: e.target.value })}
                    placeholder={t('users.zip')} style={{ padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                  <input type="text" value={formData.address_city} onChange={(e) => setFormData({ ...formData, address_city: e.target.value })}
                    placeholder={t('users.city')} style={{ padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                </div>
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
                  {editingBuilding ? t('common.update') : t('common.create')}
                </button>
                <button type="button" onClick={() => { setShowModal(false); setEditingBuilding(null); }} style={{
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
          .buildings-container h1 {
            font-size: 24px !important;
          }

          .buildings-container h1 svg {
            width: 24px !important;
            height: 24px !important;
          }

          .buildings-container p {
            font-size: 14px !important;
          }

          .modal-content h2 {
            font-size: 20px !important;
          }
        }

        @media (max-width: 480px) {
          .buildings-container h1 {
            font-size: 20px !important;
          }

          .buildings-container h1 svg {
            width: 20px !important;
            height: 20px !important;
          }
        }
      `}</style>
    </div>
  );
}