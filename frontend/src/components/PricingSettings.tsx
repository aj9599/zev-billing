import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, X, DollarSign, Search, Building, HelpCircle } from 'lucide-react';
import { api } from '../api/client';
import type { BillingSettings, Building as BuildingType } from '../types';
import { useTranslation } from '../i18n';

export default function PricingSettings() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<BillingSettings[]>([]);
  const [buildings, setBuildings] = useState<BuildingType[]>([]);
  const [selectedBuildingId, setSelectedBuildingId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [editingSetting, setEditingSetting] = useState<BillingSettings | null>(null);
  const [expandedBuildings, setExpandedBuildings] = useState<Set<number>>(new Set());
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
    try {
      const [settingsData, buildingsData] = await Promise.all([
        api.getBillingSettings(),
        api.getBuildings()
      ]);
      setSettings(Array.isArray(settingsData) ? settingsData : []);
      const nonGroupBuildings = buildingsData.filter(b => !b.is_group);
      setBuildings(nonGroupBuildings);
      
      const buildingIds = new Set(nonGroupBuildings.map(b => b.id));
      setExpandedBuildings(buildingIds);
    } catch (err) {
      console.error('Failed to load data:', err);
      setMessage(t('pricing.loadFailed'));
    }
  };

  const checkDateOverlap = (buildingId: number, validFrom: string, validTo: string, currentId?: number): boolean => {
    const newStart = new Date(validFrom);
    const newEnd = validTo ? new Date(validTo) : new Date('2099-12-31');
    
    const overlapping = settings.filter(s => {
      if (currentId && s.id === currentId) return false;
      if (s.building_id !== buildingId) return false;
      if (!s.is_active) return false;
      
      const existingStart = new Date(s.valid_from);
      const existingEnd = s.valid_to ? new Date(s.valid_to) : new Date('2099-12-31');
      
      return newStart <= existingEnd && newEnd >= existingStart;
    });
    
    return overlapping.length > 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    
    if (!formData.building_id || formData.building_id === 0) {
      setMessage(t('pricing.selectBuilding'));
      return;
    }
    
    if (formData.valid_from && formData.valid_to) {
      const startDate = new Date(formData.valid_from);
      const endDate = new Date(formData.valid_to);
      
      if (endDate <= startDate) {
        setMessage(t('pricing.endDateBeforeStart'));
        return;
      }
    }
    
    if (formData.is_active) {
      const hasOverlap = checkDateOverlap(
        formData.building_id!, 
        formData.valid_from!, 
        formData.valid_to || '',
        editingSetting?.id
      );
      
      if (hasOverlap) {
        setMessage(t('pricing.dateOverlapError'));
        return;
      }
    }
    
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
      setMessage(t('pricing.saveSuccess'));
    } catch (err) {
      setMessage(t('pricing.saveFailed'));
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm(t('pricing.deleteConfirm'))) {
      try {
        await api.deleteBillingSettings(id);
        loadData();
        setMessage(t('pricing.deleteSuccess'));
      } catch (err) {
        setMessage(t('pricing.deleteFailed'));
      }
    }
  };

  const handleEdit = (setting: BillingSettings) => {
    setEditingSetting(setting);
    setFormData(setting);
    setShowModal(true);
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

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const toggleBuildingExpand = (id: number) => {
    const newExpanded = new Set(expandedBuildings);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedBuildings(newExpanded);
  };

  const filteredBuildings = buildings.filter(b =>
    b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.address_city?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredSettings = selectedBuildingId
    ? settings.filter(s => s.building_id === selectedBuildingId)
    : settings;

  const settingsByBuilding = buildings.map(building => ({
    building,
    settings: filteredSettings.filter(s => s.building_id === building.id)
  })).filter(group => group.settings.length > 0);

  const InstructionsModal = () => (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', 
      justifyContent: 'center', zIndex: 2000, padding: '20px'
    }}>
      <div style={{
        backgroundColor: 'white', borderRadius: '12px', padding: '30px',
        maxWidth: '700px', maxHeight: '90vh', overflow: 'auto', width: '100%'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold' }}>{t('pricing.instructions.title')}</h2>
          <button onClick={() => setShowInstructions(false)} 
            style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        <div style={{ lineHeight: '1.8', color: '#374151' }}>
          <div style={{ backgroundColor: '#dbeafe', padding: '16px', borderRadius: '8px', marginBottom: '16px', border: '2px solid #3b82f6' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '10px', color: '#1f2937' }}>
              {t('pricing.instructions.whatIsPricing')}
            </h3>
            <p>{t('pricing.instructions.pricingDescription')}</p>
          </div>

          <div style={{ backgroundColor: '#fef3c7', padding: '16px', borderRadius: '8px', marginBottom: '16px', border: '2px solid #f59e0b' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '10px', color: '#1f2937' }}>
              {t('pricing.instructions.howPricingWorks')}
            </h3>
            <ul style={{ marginLeft: '20px' }}>
              <li>{t('pricing.instructions.work1')}</li>
              <li>{t('pricing.instructions.work2')}</li>
              <li>{t('pricing.instructions.work3')}</li>
              <li>{t('pricing.instructions.work4')}</li>
            </ul>
          </div>

          <h3 style={{ fontSize: '18px', fontWeight: '600', marginTop: '20px', marginBottom: '10px', color: '#1f2937' }}>
            {t('pricing.instructions.howToUse')}
          </h3>
          <ul style={{ marginLeft: '20px' }}>
            <li>{t('pricing.instructions.step1')}</li>
            <li>{t('pricing.instructions.step2')}</li>
            <li>{t('pricing.instructions.step3')}</li>
            <li>{t('pricing.instructions.step4')}</li>
            <li>{t('pricing.instructions.step5')}</li>
          </ul>

          <div style={{ backgroundColor: '#fee2e2', padding: '16px', borderRadius: '8px', marginTop: '16px', border: '2px solid #ef4444' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px', color: '#1f2937' }}>
              {t('pricing.instructions.important')}
            </h3>
            <ul style={{ marginLeft: '20px', fontSize: '14px' }}>
              <li>{t('pricing.instructions.important1')}</li>
              <li>{t('pricing.instructions.important2')}</li>
              <li>{t('pricing.instructions.important3')}</li>
            </ul>
          </div>

          <div style={{ backgroundColor: '#d1fae5', padding: '16px', borderRadius: '8px', marginTop: '16px', border: '1px solid #10b981' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px', color: '#1f2937' }}>
              {t('pricing.instructions.tips')}
            </h3>
            <ul style={{ marginLeft: '20px', fontSize: '14px' }}>
              <li>{t('pricing.instructions.tip1')}</li>
              <li>{t('pricing.instructions.tip2')}</li>
              <li>{t('pricing.instructions.tip3')}</li>
            </ul>
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
    <div className="pricing-container" style={{ width: '100%', maxWidth: '100%' }}>
      <div className="pricing-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', gap: '15px', flexWrap: 'wrap' }}>
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
            <DollarSign size={36} style={{ color: '#667eea' }} />
            {t('pricing.title')}
          </h1>
          <p style={{ color: '#6b7280', fontSize: '16px' }}>
            {t('pricing.subtitle')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => setShowInstructions(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
              backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px', cursor: 'pointer'
            }}
          >
            <HelpCircle size={18} />
            {t('pricing.instructions.button')}
          </button>
          <button onClick={() => { resetForm(); setShowModal(true); }} style={{
            display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
            backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px', cursor: 'pointer'
          }}>
            <Plus size={18} />
            {t('pricing.addPricing')}
          </button>
        </div>
      </div>

      {message && (
        <div style={{
          padding: '16px', marginBottom: '20px', borderRadius: '8px',
          backgroundColor: message.includes('success') || message.includes('erfolgreich') ? '#d4edda' : '#f8d7da',
          color: message.includes('success') || message.includes('erfolgreich') ? '#155724' : '#721c24'
        }}>
          {message}
        </div>
      )}

      <div style={{ marginBottom: '20px', width: '100%' }}>
        <div style={{ position: 'relative', maxWidth: '400px' }}>
          <Search size={20} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
          <input
            type="text"
            placeholder={t('pricing.searchBuildings')}
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

      <div style={{ 
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
              {t('pricing.allBuildings')}
            </h3>
          </div>
          <p style={{ fontSize: '14px', margin: 0, opacity: 0.9 }}>
            {settings.length} {t('pricing.pricingSettings')}
          </p>
        </div>

        {filteredBuildings.map(building => {
          const buildingSettings = settings.filter(s => s.building_id === building.id);
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
                {buildingSettings.length} {t('pricing.pricingSettings')}
              </p>
            </div>
          );
        })}
      </div>

      {settingsByBuilding.length === 0 ? (
        <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', padding: '60px 20px', textAlign: 'center', color: '#999' }}>
          {t('pricing.noPricing')}
        </div>
      ) : (
        settingsByBuilding.map(({ building, settings: buildingSettings }) => (
          <div key={building.id} style={{ marginBottom: '24px' }}>
            <div 
              onClick={() => toggleBuildingExpand(building.id)}
              style={{ 
                backgroundColor: '#f8f9fa', 
                padding: '16px 20px', 
                borderRadius: '8px', 
                marginBottom: '12px',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                border: '2px solid #e9ecef'
              }}
            >
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: '600', margin: 0 }}>
                  {building.name}
                </h2>
                <p style={{ fontSize: '14px', color: '#666', margin: '4px 0 0 0' }}>
                  {buildingSettings.length} {t('pricing.pricingSettings')}
                </p>
              </div>
              <span style={{ fontSize: '24px', color: '#666' }}>
                {expandedBuildings.has(building.id) ? '▼' : '▶'}
              </span>
            </div>

            {expandedBuildings.has(building.id) && (
              <>
                <div className="desktop-table" style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', overflow: 'hidden', width: '100%', marginBottom: '12px' }}>
                  <table style={{ width: '100%' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '1px solid #eee' }}>
                        <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>{t('pricing.normalKwh')}</th>
                        <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>{t('pricing.solarKwh')}</th>
                        <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>{t('pricing.chargingNormal')}</th>
                        <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>{t('pricing.chargingPriority')}</th>
                        <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>{t('pricing.validPeriod')}</th>
                        <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>{t('common.status')}</th>
                        <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>{t('common.actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {buildingSettings.map(setting => (
                        <tr key={setting.id} style={{ borderBottom: '1px solid #eee' }}>
                          <td style={{ padding: '16px' }}>{setting.currency} {setting.normal_power_price.toFixed(2)}</td>
                          <td style={{ padding: '16px' }}>{setting.currency} {setting.solar_power_price.toFixed(2)}</td>
                          <td style={{ padding: '16px' }}>{setting.currency} {setting.car_charging_normal_price.toFixed(2)}</td>
                          <td style={{ padding: '16px' }}>{setting.currency} {setting.car_charging_priority_price.toFixed(2)}</td>
                          <td style={{ padding: '16px', fontSize: '13px' }}>
                            {formatDate(setting.valid_from)} {setting.valid_to ? `- ${formatDate(setting.valid_to)}` : `(${t('pricing.ongoing')})`}
                          </td>
                          <td style={{ padding: '16px' }}>
                            <span style={{
                              padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: '600',
                              backgroundColor: setting.is_active ? '#d4edda' : '#f8d7da',
                              color: setting.is_active ? '#155724' : '#721c24'
                            }}>
                              {setting.is_active ? t('common.active') : t('common.inactive')}
                            </span>
                          </td>
                          <td style={{ padding: '16px' }}>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button onClick={() => handleEdit(setting)} style={{ padding: '6px', border: 'none', background: 'none', cursor: 'pointer' }} title={t('common.edit')}>
                                <Edit2 size={16} color="#007bff" />
                              </button>
                              <button onClick={() => handleDelete(setting.id)} style={{ padding: '6px', border: 'none', background: 'none', cursor: 'pointer' }} title={t('common.delete')}>
                                <Trash2 size={16} color="#dc3545" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mobile-cards">
                  {buildingSettings.map(setting => (
                    <div key={setting.id} style={{
                      backgroundColor: 'white',
                      borderRadius: '12px',
                      padding: '16px',
                      marginBottom: '12px',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                        <div>
                          <span style={{
                            padding: '4px 12px',
                            borderRadius: '12px',
                            fontSize: '12px',
                            fontWeight: '600',
                            backgroundColor: setting.is_active ? '#d4edda' : '#f8d7da',
                            color: setting.is_active ? '#155724' : '#721c24',
                            display: 'inline-block'
                          }}>
                            {setting.is_active ? t('common.active') : t('common.inactive')}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button onClick={() => handleEdit(setting)} style={{ padding: '8px', border: 'none', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '6px', cursor: 'pointer' }}>
                            <Edit2 size={16} color="#3b82f6" />
                          </button>
                          <button onClick={() => handleDelete(setting.id)} style={{ padding: '8px', border: 'none', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '6px', cursor: 'pointer' }}>
                            <Trash2 size={16} color="#ef4444" />
                          </button>
                        </div>
                      </div>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                        <div>
                          <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '4px' }}>{t('pricing.normalKwh')}</div>
                          <div style={{ fontSize: '15px', fontWeight: '600', color: '#1f2937' }}>
                            {setting.currency} {setting.normal_power_price.toFixed(2)}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '4px' }}>{t('pricing.solarKwh')}</div>
                          <div style={{ fontSize: '15px', fontWeight: '600', color: '#1f2937' }}>
                            {setting.currency} {setting.solar_power_price.toFixed(2)}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '4px' }}>{t('pricing.chargingNormal')}</div>
                          <div style={{ fontSize: '15px', fontWeight: '600', color: '#1f2937' }}>
                            {setting.currency} {setting.car_charging_normal_price.toFixed(2)}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '4px' }}>{t('pricing.chargingPriority')}</div>
                          <div style={{ fontSize: '15px', fontWeight: '600', color: '#1f2937' }}>
                            {setting.currency} {setting.car_charging_priority_price.toFixed(2)}
                          </div>
                        </div>
                      </div>
                      
                      <div style={{ paddingTop: '12px', borderTop: '1px solid #f3f4f6' }}>
                        <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '4px' }}>{t('pricing.validPeriod')}</div>
                        <div style={{ fontSize: '13px', color: '#6b7280' }}>
                          {formatDate(setting.valid_from)} {setting.valid_to ? `- ${formatDate(setting.valid_to)}` : `(${t('pricing.ongoing')})`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        ))
      )}

      {showInstructions && <InstructionsModal />}

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
                {editingSetting ? t('pricing.editPricing') : t('pricing.addPricing')}
              </h2>
              <button onClick={() => { setShowModal(false); setEditingSetting(null); }} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>{t('users.building')} *</label>
                <select required value={formData.building_id} onChange={(e) => setFormData({ ...formData, building_id: parseInt(e.target.value) })}
                  style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}>
                  <option value={0}>{t('users.selectBuilding')}</option>
                  {buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>

              <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                    {t('pricing.normalPower')} *
                  </label>
                  <input type="number" step="0.01" required value={formData.normal_power_price}
                    onChange={(e) => setFormData({ ...formData, normal_power_price: parseFloat(e.target.value) })}
                    style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                    {t('pricing.solarPower')} *
                  </label>
                  <input type="number" step="0.01" required value={formData.solar_power_price}
                    onChange={(e) => setFormData({ ...formData, solar_power_price: parseFloat(e.target.value) })}
                    style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                </div>
              </div>

              <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                    {t('pricing.chargingNormal')} *
                  </label>
                  <input type="number" step="0.01" required value={formData.car_charging_normal_price}
                    onChange={(e) => setFormData({ ...formData, car_charging_normal_price: parseFloat(e.target.value) })}
                    style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                    {t('pricing.chargingPriority')} *
                  </label>
                  <input type="number" step="0.01" required value={formData.car_charging_priority_price}
                    onChange={(e) => setFormData({ ...formData, car_charging_priority_price: parseFloat(e.target.value) })}
                    style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                </div>
              </div>

              <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                    {t('pricing.validFrom')} *
                  </label>
                  <input type="date" required value={formData.valid_from}
                    onChange={(e) => setFormData({ ...formData, valid_from: e.target.value })}
                    style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                    {t('pricing.validTo')} ({t('common.optional')})
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
                  <span style={{ fontWeight: '500', fontSize: '14px' }}>{t('pricing.activeUseForBilling')}</span>
                </label>
              </div>

              <div className="button-group" style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button type="submit" style={{
                  flex: 1, padding: '12px', backgroundColor: '#007bff', color: 'white',
                  border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '500'
                }}>
                  {editingSetting ? t('common.update') : t('common.create')}
                </button>
                <button type="button" onClick={() => { setShowModal(false); setEditingSetting(null); }} style={{
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
        .pricing-container {
          width: 100%;
          max-width: 100%;
        }

        @media (min-width: 769px) {
          .mobile-cards {
            display: none;
          }
        }

        @media (max-width: 768px) {
          .desktop-table {
            display: none;
          }

          .mobile-cards {
            display: block;
          }

          .pricing-container .pricing-header h1 {
            font-size: 24px !important;
          }

          .pricing-container .pricing-header h1 svg {
            width: 24px !important;
            height: 24px !important;
          }

          .pricing-container .pricing-header p {
            font-size: 14px !important;
          }

          .modal-content h2 {
            font-size: 20px !important;
          }

          .form-row {
            grid-template-columns: 1fr !important;
          }
        }

        @media (max-width: 480px) {
          .pricing-container .pricing-header h1 {
            font-size: 20px !important;
            gap: 8px !important;
          }

          .pricing-container .pricing-header h1 svg {
            width: 20px !important;
            height: 20px !important;
          }
        }
      `}</style>
    </div>
  );
}