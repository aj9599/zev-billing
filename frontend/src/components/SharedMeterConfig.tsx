import { useState, useEffect } from 'react';
import { Settings, Plus, Edit2, Trash2, Building as BuildingIcon, Zap, AlertCircle, CheckCircle, Loader } from 'lucide-react';
import { api } from '../api/client';
import type { SharedMeterConfig, Building, Meter, User } from '../types';
import { useTranslation } from '../i18n';

export default function SharedMeterConfigComponent() {
  const { t } = useTranslation();
  const [configs, setConfigs] = useState<SharedMeterConfig[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [meters, setMeters] = useState<Meter[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingConfig, setEditingConfig] = useState<SharedMeterConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const [formData, setFormData] = useState({
    meter_id: 0,
    building_id: 0,
    meter_name: '',
    split_type: 'equal' as 'equal' | 'custom',
    unit_price: 0,
    custom_splits: {} as Record<number, number> // user_id -> percentage
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [configsData, buildingsData, metersData, usersData] = await Promise.all([
        api.getSharedMeterConfigs(),
        api.getBuildings(),
        api.getMeters(),
        api.getUsers()
      ]);
      setConfigs(configsData);
      setBuildings(buildingsData.filter(b => !b.is_group));
      
      // Only show Heating and Other meters (exclude Apartment, Solar, Total)
      const filteredMeters = metersData.filter(m => {
        if (m.user_id) return false; // Exclude user-specific meters
        const meterType = m.meter_type?.toLowerCase() || '';
        return meterType === 'heating' || meterType === 'other';
      });
      setMeters(filteredMeters);
      setUsers(usersData.filter(u => u.is_active));
    } catch (err) {
      console.error('Failed to load data:', err);
      showToast(t('sharedMeters.loadFailed'), 'error');
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
      unit_price: 0,
      custom_splits: {}
    });
    setShowModal(true);
  };

  const handleEdit = (config: SharedMeterConfig) => {
    setEditingConfig(config);
    setFormData({
      meter_id: config.meter_id,
      building_id: config.building_id,
      meter_name: config.meter_name,
      split_type: config.split_type === 'equal' || config.split_type === 'custom' ? config.split_type : 'equal',
      unit_price: config.unit_price,
      custom_splits: (config as any).custom_splits || {}
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.building_id || !formData.meter_id || formData.unit_price <= 0) {
      showToast(t('sharedMeters.fillAllFields'), 'error');
      return;
    }

    // Validate custom splits if split_type is custom
    if (formData.split_type === 'custom') {
      const buildingUsers = users.filter(u => u.building_id === formData.building_id && u.is_active);
      const totalPercentage = Object.values(formData.custom_splits).reduce((sum, val) => sum + val, 0);
      
      if (buildingUsers.length > 0 && Math.abs(totalPercentage - 100) > 0.01) {
        showToast(t('sharedMeters.totalMustBe100'), 'error');
        return;
      }
    }

    try {
      setSaving(true);
      const saveData = {
        ...formData,
        custom_splits: formData.split_type === 'custom' ? formData.custom_splits : undefined
      };
      
      if (editingConfig) {
        await api.updateSharedMeterConfig(editingConfig.id, saveData);
        showToast(t('sharedMeters.updateSuccess'), 'success');
      } else {
        await api.createSharedMeterConfig(saveData);
        showToast(t('sharedMeters.createSuccess'), 'success');
      }
      setShowModal(false);
      loadData();
    } catch (err) {
      console.error('Failed to save:', err);
      showToast(t('sharedMeters.saveFailed') + ': ' + (err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t('sharedMeters.deleteConfirm'))) return;
    
    try {
      await api.deleteSharedMeterConfig(id);
      showToast(t('sharedMeters.deleteSuccess'), 'success');
      loadData();
    } catch (err) {
      console.error('Failed to delete:', err);
      showToast(t('sharedMeters.deleteFailed') + ': ' + (err as Error).message, 'error');
    }
  };

  const getBuildingName = (buildingId: number) => {
    const building = buildings.find(b => b.id === buildingId);
    return building?.name || t('common.unknown');
  };

  const getSplitTypeLabel = (splitType: string) => {
    const labels: Record<string, string> = {
      'equal': t('sharedMeters.splitType.equal'),
      'custom': t('sharedMeters.splitType.custom')
    };
    return labels[splitType] || splitType;
  };

  const getSplitTypeDescription = (splitType: string) => {
    const descriptions: Record<string, string> = {
      'equal': t('sharedMeters.splitTypeDesc.equal'),
      'custom': t('sharedMeters.splitTypeDesc.custom')
    };
    return descriptions[splitType] || '';
  };

  const buildingUsers = users.filter(u => u.building_id === formData.building_id && u.is_active);

  // Initialize custom splits when building changes
  useEffect(() => {
    if (formData.building_id && formData.split_type === 'custom') {
      const buildingUsers = users.filter(u => u.building_id === formData.building_id && u.is_active);
      if (buildingUsers.length > 0 && Object.keys(formData.custom_splits).length === 0) {
        const equalSplit = 100 / buildingUsers.length;
        const newSplits: Record<number, number> = {};
        buildingUsers.forEach(user => {
          newSplits[user.id] = parseFloat(equalSplit.toFixed(2));
        });
        setFormData(prev => ({ ...prev, custom_splits: newSplits }));
      }
    }
  }, [formData.building_id, formData.split_type, users]);

  const handlePercentageChange = (userId: number, value: string) => {
    const numValue = parseFloat(value) || 0;
    setFormData(prev => ({
      ...prev,
      custom_splits: {
        ...prev.custom_splits,
        [userId]: numValue
      }
    }));
  };

  const getTotalPercentage = () => {
    return Object.values(formData.custom_splits).reduce((sum, val) => sum + val, 0);
  };

  if (loading) {
    return (
      <div style={{ 
        padding: '40px', 
        textAlign: 'center',
        minHeight: '400px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <Loader size={48} style={{ animation: 'spin 1s linear infinite', color: '#667EEA', marginBottom: '16px' }} />
        <p style={{ fontSize: '16px', color: '#6b7280' }}>{t('sharedMeters.loading')}</p>
      </div>
    );
  }

  return (
    <div style={{ width: '100%' }}>
      {/* Toast Notification */}
      {toast && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          padding: '16px 20px',
          backgroundColor: toast.type === 'success' ? '#10b981' : toast.type === 'error' ? '#ef4444' : '#3b82f6',
          color: 'white',
          borderRadius: '8px',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          zIndex: 2000,
          animation: 'slideInRight 0.3s ease-out',
          maxWidth: '400px'
        }}>
          {toast.type === 'success' && <CheckCircle size={20} />}
          {toast.type === 'error' && <AlertCircle size={20} />}
          {toast.type === 'info' && <AlertCircle size={20} />}
          <span style={{ fontSize: '14px', fontWeight: '500' }}>{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'start',
        marginBottom: '30px'
      }}>
        <button
          onClick={handleCreate}
          style={{
            padding: '12px 24px',
            backgroundColor: '#667EEA',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '15px',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s',
            boxShadow: '0 2px 4px rgba(0, 123, 255, 0.3)',
            marginLeft: 'auto'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = '#0056b3';
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 4px 6px rgba(0, 123, 255, 0.4)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = '#667EEA';
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 123, 255, 0.3)';
          }}
        >
          <Plus size={18} />
          {t('sharedMeters.addNew')}
        </button>
      </div>

      {/* Info Banner */}
      <div style={{
        backgroundColor: '#e7f3ff',
        border: '2px solid #667EEA',
        borderRadius: '12px',
        padding: '20px',
        marginBottom: '30px',
        display: 'flex',
        gap: '16px'
      }}>
        <AlertCircle size={24} color="#667EEA" style={{ flexShrink: 0, marginTop: '2px' }} />
        <div style={{ fontSize: '14px', color: '#4b5563', lineHeight: '1.7' }}>
          <strong style={{ display: 'block', fontSize: '15px', marginBottom: '6px', color: '#1f2937' }}>
            {t('sharedMeters.infoTitle')}
          </strong>
          {t('sharedMeters.infoDescription')}
          <br />
          <strong style={{ marginTop: '8px', display: 'block' }}>{t('sharedMeters.onlyHeatingOther')}</strong>
        </div>
      </div>

      {/* Configs List */}
      {configs.length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            padding: '80px 20px',
            backgroundColor: '#f8f9fa',
            borderRadius: '12px',
            border: '2px dashed #dee2e6'
          }}>
            <div style={{
              width: '80px',
              height: '80px',
              margin: '0 auto 20px',
              backgroundColor: '#667EEA',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Zap size={40} color="white" />
            </div>
            <p style={{ fontSize: '18px', marginBottom: '8px', fontWeight: '600', color: '#1f2937' }}>
              {t('sharedMeters.noConfigs')}
            </p>
            <p style={{ fontSize: '14px', color: '#6b7280' }}>
              {t('sharedMeters.noConfigsDescription')}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ 
              width: '100%', 
              borderCollapse: 'collapse',
              backgroundColor: 'white'
            }}>
              <thead>
                <tr style={{ 
                  backgroundColor: '#f8f9fa',
                  color: '#1f2937',
                  borderBottom: '2px solid #e9ecef'
                }}>
                  <th style={{ 
                    padding: '16px', 
                    textAlign: 'left', 
                    fontWeight: '600',
                    fontSize: '14px'
                  }}>
                    {t('sharedMeters.meterName')}
                  </th>
                  <th style={{ 
                    padding: '16px', 
                    textAlign: 'left', 
                    fontWeight: '600',
                    fontSize: '14px'
                  }}>
                    {t('sharedMeters.building')}
                  </th>
                  <th style={{ 
                    padding: '16px', 
                    textAlign: 'left', 
                    fontWeight: '600',
                    fontSize: '14px'
                  }}>
                    {t('sharedMeters.splitType.label')}
                  </th>
                  <th style={{ 
                    padding: '16px', 
                    textAlign: 'right', 
                    fontWeight: '600',
                    fontSize: '14px'
                  }}>
                    {t('sharedMeters.unitPrice')}
                  </th>
                  <th style={{ 
                    padding: '16px', 
                    textAlign: 'right', 
                    fontWeight: '600',
                    fontSize: '14px'
                  }}>
                    {t('common.actions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {configs.map(config => (
                  <tr key={config.id} style={{ 
                    borderBottom: '1px solid #e9ecef',
                    transition: 'background-color 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f8f9fa'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'white'}
                  >
                    <td style={{ padding: '16px', fontSize: '15px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                          width: '36px',
                          height: '36px',
                          backgroundColor: '#fbbf24',
                          borderRadius: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          <Zap size={18} color="white" />
                        </div>
                        <strong>{config.meter_name}</strong>
                      </div>
                    </td>
                    <td style={{ padding: '16px', fontSize: '15px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <BuildingIcon size={16} color="#6b7280" />
                        {getBuildingName(config.building_id)}
                      </div>
                    </td>
                    <td style={{ padding: '16px', fontSize: '14px' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '6px 14px',
                        borderRadius: '20px',
                        backgroundColor: '#667EEA',
                        color: 'white',
                        fontSize: '13px',
                        fontWeight: '600'
                      }}>
                        {getSplitTypeLabel(config.split_type)}
                      </span>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'right', fontSize: '15px', fontWeight: '600' }}>
                      CHF {config.unit_price.toFixed(3)}/kWh
                    </td>
                    <td style={{ padding: '16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => handleEdit(config)}
                          style={{
                            padding: '8px 14px',
                            backgroundColor: '#10b981',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: '600',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            transition: 'all 0.2s'
                          }}
                          onMouseOver={(e) => {
                            e.currentTarget.style.backgroundColor = '#059669';
                            e.currentTarget.style.transform = 'translateY(-1px)';
                          }}
                          onMouseOut={(e) => {
                            e.currentTarget.style.backgroundColor = '#10b981';
                            e.currentTarget.style.transform = 'translateY(0)';
                          }}
                        >
                          <Edit2 size={14} />
                          {t('common.edit')}
                        </button>
                        <button
                          onClick={() => handleDelete(config.id)}
                          style={{
                            padding: '8px 14px',
                            backgroundColor: '#ef4444',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: '600',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            transition: 'all 0.2s'
                          }}
                          onMouseOver={(e) => {
                            e.currentTarget.style.backgroundColor = '#dc2626';
                            e.currentTarget.style.transform = 'translateY(-1px)';
                          }}
                          onMouseOut={(e) => {
                            e.currentTarget.style.backgroundColor = '#ef4444';
                            e.currentTarget.style.transform = 'translateY(0)';
                          }}
                        >
                          <Trash2 size={14} />
                          {t('common.delete')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

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
          padding: '20px',
          animation: 'fadeIn 0.2s ease-in'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '30px',
            maxWidth: '650px',
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            animation: 'slideUp 0.3s ease-out'
          }}>
            <div style={{ marginBottom: '24px', paddingBottom: '20px', borderBottom: '2px solid #e9ecef' }}>
              <h2 style={{ 
                fontSize: '24px', 
                fontWeight: '700',
                color: '#1f2937',
                marginBottom: '8px'
              }}>
                {editingConfig ? t('sharedMeters.editTitle') : t('sharedMeters.createTitle')}
              </h2>
              <p style={{ fontSize: '14px', color: '#6b7280' }}>
                {editingConfig ? t('sharedMeters.editSubtitle') : t('sharedMeters.createSubtitle')}
              </p>
            </div>
            
            {/* Building Selection */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '8px', 
                fontWeight: '600',
                fontSize: '14px',
                color: '#374151'
              }}>
                {t('sharedMeters.building')} <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select 
                value={formData.building_id}
                onChange={(e) => {
                  const buildingId = parseInt(e.target.value);
                  setFormData({...formData, building_id: buildingId, meter_id: 0, meter_name: '', custom_splits: {}});
                }}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '15px',
                  backgroundColor: 'white',
                  cursor: 'pointer',
                  transition: 'border-color 0.2s'
                }}
                onFocus={(e) => e.target.style.borderColor = '#667EEA'}
                onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
              >
                <option value={0}>{t('sharedMeters.selectBuilding')}</option>
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
                color: '#374151'
              }}>
                {t('sharedMeters.meter')} <span style={{ color: '#ef4444' }}>*</span>
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
                  padding: '12px',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '15px',
                  backgroundColor: formData.building_id ? 'white' : '#f3f4f6',
                  cursor: formData.building_id ? 'pointer' : 'not-allowed',
                  transition: 'border-color 0.2s'
                }}
                onFocus={(e) => formData.building_id && (e.target.style.borderColor = '#667EEA')}
                onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
              >
                <option value={0}>{t('sharedMeters.selectMeter')}</option>
                {meters
                  .filter(m => m.building_id === formData.building_id)
                  .map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
              </select>
              {formData.building_id && meters.filter(m => m.building_id === formData.building_id).length === 0 && (
                <p style={{ fontSize: '13px', color: '#ef4444', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <AlertCircle size={14} />
                  {t('sharedMeters.noMetersFound')}
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
                color: '#374151'
              }}>
                {t('sharedMeters.splitType.label')} <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {(['equal', 'custom'] as const).map(type => (
                  <label key={type} style={{
                    display: 'flex',
                    alignItems: 'start',
                    gap: '12px',
                    padding: '16px',
                    border: `2px solid ${formData.split_type === type ? '#667EEA' : '#e5e7eb'}`,
                    borderRadius: '10px',
                    cursor: 'pointer',
                    backgroundColor: formData.split_type === type ? '#e7f3ff' : 'white',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => {
                    if (formData.split_type !== type) {
                      e.currentTarget.style.backgroundColor = '#f3f4f6';
                    }
                  }}
                  onMouseOut={(e) => {
                    if (formData.split_type !== type) {
                      e.currentTarget.style.backgroundColor = 'white';
                    }
                  }}
                  >
                    <input
                      type="radio"
                      name="split_type"
                      value={type}
                      checked={formData.split_type === type}
                      onChange={(e) => setFormData({...formData, split_type: e.target.value as any})}
                      style={{ marginTop: '2px', cursor: 'pointer', accentColor: '#667EEA' }}
                    />
                    <div style={{ flex: 1 }}>
                      <strong style={{ fontSize: '15px', display: 'block', marginBottom: '4px', color: '#1f2937' }}>
                        {getSplitTypeLabel(type)}
                      </strong>
                      <p style={{ fontSize: '13px', color: '#6b7280', margin: 0, lineHeight: '1.5' }}>
                        {getSplitTypeDescription(type)}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Custom Splits Configuration */}
            {formData.split_type === 'custom' && formData.building_id && buildingUsers.length > 0 && (
              <div style={{ 
                marginBottom: '20px',
                padding: '16px',
                backgroundColor: '#f8f9fa',
                borderRadius: '8px',
                border: '2px solid #e5e7eb'
              }}>
                <h4 style={{ 
                  fontSize: '15px', 
                  fontWeight: '600', 
                  marginBottom: '12px',
                  color: '#1f2937'
                }}>
                  {t('sharedMeters.percentagePerApartment')}
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {buildingUsers.map(user => (
                    <div key={user.id} style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '12px',
                      padding: '10px',
                      backgroundColor: 'white',
                      borderRadius: '6px',
                      border: '1px solid #e5e7eb'
                    }}>
                      <label style={{ 
                        flex: 1, 
                        fontSize: '14px',
                        fontWeight: '500',
                        color: '#374151'
                      }}>
                        {user.first_name} {user.last_name}
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={formData.custom_splits[user.id] || 0}
                          onChange={(e) => handlePercentageChange(user.id, e.target.value)}
                          style={{
                            width: '80px',
                            padding: '6px 10px',
                            border: '2px solid #d1d5db',
                            borderRadius: '6px',
                            fontSize: '14px',
                            textAlign: 'right'
                          }}
                        />
                        <span style={{ fontSize: '14px', fontWeight: '600', color: '#6b7280' }}>%</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ 
                  marginTop: '12px',
                  padding: '10px',
                  backgroundColor: getTotalPercentage() === 100 ? '#ecfdf5' : '#fef2f2',
                  borderRadius: '6px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  border: `2px solid ${getTotalPercentage() === 100 ? '#10b981' : '#ef4444'}`
                }}>
                  <span style={{ fontSize: '14px', fontWeight: '600', color: '#1f2937' }}>
                    {t('common.total')}:
                  </span>
                  <span style={{ 
                    fontSize: '16px', 
                    fontWeight: '700',
                    color: getTotalPercentage() === 100 ? '#10b981' : '#ef4444'
                  }}>
                    {getTotalPercentage().toFixed(2)}%
                  </span>
                </div>
              </div>
            )}

            {/* Unit Price */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '8px', 
                fontWeight: '600',
                fontSize: '14px',
                color: '#374151'
              }}>
                {t('sharedMeters.unitPrice')} (CHF/kWh) <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="number"
                step="0.001"
                min="0"
                value={formData.unit_price || ''}
                onChange={(e) => setFormData({...formData, unit_price: parseFloat(e.target.value) || 0})}
                placeholder="0.250"
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '15px',
                  transition: 'border-color 0.2s'
                }}
                onFocus={(e) => e.target.style.borderColor = '#667EEA'}
                onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
              />
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button
                onClick={() => setShowModal(false)}
                disabled={saving}
                style={{
                  flex: 1,
                  padding: '12px',
                  backgroundColor: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  fontSize: '15px',
                  fontWeight: '600',
                  transition: 'all 0.2s',
                  opacity: saving ? 0.6 : 1
                }}
                onMouseOver={(e) => !saving && (e.currentTarget.style.backgroundColor = '#4b5563')}
                onMouseOut={(e) => !saving && (e.currentTarget.style.backgroundColor = '#6b7280')}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSave}
                disabled={!formData.building_id || !formData.meter_id || formData.unit_price <= 0 || saving}
                style={{
                  flex: 1,
                  padding: '12px',
                  backgroundColor: (!formData.building_id || !formData.meter_id || formData.unit_price <= 0 || saving) ? '#d1d5db' : '#667EEA',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: (!formData.building_id || !formData.meter_id || formData.unit_price <= 0 || saving) ? 'not-allowed' : 'pointer',
                  fontSize: '15px',
                  fontWeight: '600',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
                onMouseOver={(e) => {
                  if (formData.building_id && formData.meter_id && formData.unit_price > 0 && !saving) {
                    e.currentTarget.style.backgroundColor = '#0056b3';
                  }
                }}
                onMouseOut={(e) => {
                  if (formData.building_id && formData.meter_id && formData.unit_price > 0 && !saving) {
                    e.currentTarget.style.backgroundColor = '#667EEA';
                  }
                }}
              >
                {saving && <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} />}
                {editingConfig ? t('common.update') : t('common.create')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSS Animations */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes slideInRight {
          from {
            opacity: 0;
            transform: translateX(20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}