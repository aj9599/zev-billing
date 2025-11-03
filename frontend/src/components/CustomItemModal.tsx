import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, DollarSign, AlertCircle, CheckCircle, Loader, Building as BuildingIcon } from 'lucide-react';
import { api } from '../api/client';
import type { CustomLineItem, Building } from '../types';
import { useTranslation } from '../i18n';

interface CustomItemsProps {
  onSave: () => void;
  selectedBuildingId: number | null;
}

interface Toast {
  message: string;
  type: 'success' | 'error' | 'info';
}

export default function CustomItems({ onSave, selectedBuildingId }: CustomItemsProps) {
  const { t } = useTranslation();
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [items, setItems] = useState<CustomLineItem[]>([]);
  const [editingItem, setEditingItem] = useState<CustomLineItem | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [expandedBuildings, setExpandedBuildings] = useState<Set<number>>(new Set());
  
  const [formData, setFormData] = useState({
    building_id: 0,
    description: '',
    amount: 0,
    frequency: 'monthly' as 'once' | 'monthly' | 'quarterly' | 'yearly',
    category: 'other' as 'meter_rent' | 'maintenance' | 'service' | 'other',
    is_active: true
  });

  useEffect(() => {
    loadBuildings();
    loadItems();
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

  const loadBuildings = async () => {
    try {
      setLoading(true);
      const data = await api.getBuildings();
      const nonGroupBuildings = data.filter(b => !b.is_group);
      setBuildings(nonGroupBuildings);
      
      // Expand all buildings by default
      const buildingIds = new Set(nonGroupBuildings.map(b => b.id));
      setExpandedBuildings(buildingIds);
    } catch (err) {
      console.error('Failed to load buildings:', err);
      showToast(t('customItems.loadBuildingsFailed'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadItems = async () => {
    try {
      setLoading(true);
      const data = await api.getCustomLineItems();
      setItems(data);
    } catch (err) {
      console.error('Failed to load custom items:', err);
      showToast(t('customItems.loadItemsFailed'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.description.trim()) {
      newErrors.description = t('customItems.validation.descriptionRequired');
    } else if (formData.description.length > 200) {
      newErrors.description = t('customItems.validation.descriptionTooLong');
    }

    if (formData.amount <= 0) {
      newErrors.amount = t('customItems.validation.amountPositive');
    } else if (formData.amount > 999999) {
      newErrors.amount = t('customItems.validation.amountTooLarge');
    }

    if (!formData.building_id) {
      newErrors.building_id = t('customItems.validation.selectBuilding');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      showToast(t('customItems.validation.fixErrors'), 'error');
      return;
    }
    
    try {
      setSaving(true);
      if (editingItem) {
        await api.updateCustomLineItem(editingItem.id, formData);
        showToast(t('customItems.updateSuccess'), 'success');
      } else {
        await api.createCustomLineItem(formData);
        showToast(t('customItems.createSuccess'), 'success');
      }
      
      resetForm();
      await loadItems();
      onSave();
    } catch (err) {
      console.error('Failed to save custom item:', err);
      showToast(t('customItems.saveFailed') + `: ${(err as Error).message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (item: CustomLineItem) => {
    setEditingItem(item);
    setFormData({
      building_id: item.building_id,
      description: item.description,
      amount: item.amount,
      frequency: item.frequency as any,
      category: item.category as any,
      is_active: item.is_active
    });
    setShowModal(true);
    setErrors({});
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t('customItems.deleteConfirm'))) return;
    
    try {
      await api.deleteCustomLineItem(id);
      showToast(t('customItems.deleteSuccess'), 'success');
      await loadItems();
      onSave();
    } catch (err) {
      console.error('Failed to delete custom item:', err);
      showToast(t('customItems.deleteFailed') + `: ${(err as Error).message}`, 'error');
    }
  };

  const resetForm = () => {
    setFormData({
      building_id: 0,
      description: '',
      amount: 0,
      frequency: 'monthly',
      category: 'other',
      is_active: true
    });
    setEditingItem(null);
    setShowModal(false);
    setErrors({});
  };

  const getCategoryLabel = (category: string) => {
    const labels = {
      meter_rent: t('customItems.category.meterRent'),
      maintenance: t('customItems.category.maintenance'),
      service: t('customItems.category.service'),
      other: t('customItems.category.other')
    };
    return labels[category as keyof typeof labels] || category;
  };

  const getFrequencyLabel = (frequency: string) => {
    const labels = {
      once: t('customItems.frequency.once'),
      monthly: t('customItems.frequency.monthly'),
      quarterly: t('customItems.frequency.quarterly'),
      yearly: t('customItems.frequency.yearly')
    };
    return labels[frequency as keyof typeof labels] || frequency;
  };

  const getCategoryColor = (category: string) => {
    const colors = {
      meter_rent: '#3b82f6',
      maintenance: '#f59e0b',
      service: '#10b981',
      other: '#6b7280'
    };
    return colors[category as keyof typeof colors] || '#6b7280';
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

  // Filter items based on selected building
  const filteredItems = selectedBuildingId 
    ? items.filter(item => item.building_id === selectedBuildingId)
    : items;

  // Organize items by building
  const organizedItems = buildings.map(building => {
    const buildingItems = filteredItems.filter(item => item.building_id === building.id);
    return {
      building,
      items: buildingItems,
      totalCount: buildingItems.length
    };
  }).filter(group => group.totalCount > 0);

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

      {/* Add New Item Button */}
      {!loading && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '30px' }}>
          <button
            onClick={() => setShowModal(true)}
            style={{
              padding: '12px 24px',
              backgroundColor: '#667EEA',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '15px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s',
              boxShadow: '0 2px 4px rgba(0, 123, 255, 0.3)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 4px 6px rgba(0, 123, 255, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 123, 255, 0.3)';
            }}
          >
            <Plus size={18} />
            {t('customItems.addNew')}
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div style={{
          textAlign: 'center',
          padding: '40px',
          color: '#666'
        }}>
          <Loader size={40} style={{ animation: 'spin 1s linear infinite', color: '#667EEA' }} />
          <p style={{ marginTop: '10px', fontSize: '14px' }}>{t('customItems.loading')}</p>
        </div>
      )}

      {/* Items List Organized by Building */}
      {!loading && (
        <div>
          <h3 style={{ 
            fontSize: '18px', 
            fontWeight: '700', 
            marginBottom: '16px',
            color: '#111827',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <span>{t('customItems.organizedByBuilding')}</span>
            <span style={{ 
              fontSize: '14px', 
              fontWeight: '600', 
              color: '#667EEA',
              backgroundColor: '#e7f3ff',
              padding: '6px 14px',
              borderRadius: '20px',
              border: '2px solid #667EEA'
            }}>
              {filteredItems.length} {filteredItems.length === 1 ? t('customItems.item') : t('customItems.items')}
            </span>
          </h3>

          {organizedItems.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '60px',
              color: '#6b7280',
              backgroundColor: '#f8f9fa',
              borderRadius: '12px',
              border: '2px dashed #d1d5db'
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
                <DollarSign size={40} color="white" />
              </div>
              <p style={{ fontSize: '16px', fontWeight: '600', marginBottom: '4px', color: '#1f2937' }}>
                {t('customItems.noItems')}
              </p>
              <p style={{ fontSize: '14px', marginTop: '5px' }}>
                {t('customItems.noItemsDescription')}
              </p>
            </div>
          ) : (
            organizedItems.map(({ building, items: buildingItems, totalCount }) => (
              <div key={building.id} style={{ marginBottom: '20px' }}>
                <div
                  onClick={() => toggleBuildingExpand(building.id)}
                  style={{
                    backgroundColor: '#f8f9fa',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    marginBottom: '8px',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    border: '2px solid #e9ecef',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#e9ecef'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#f8f9fa'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <BuildingIcon size={20} color="#667EEA" />
                    <h4 style={{ fontSize: '16px', fontWeight: '600', margin: 0, color: '#1f2937' }}>
                      {building.name}
                    </h4>
                    <span style={{ fontSize: '13px', color: '#6b7280' }}>
                      ({totalCount} {totalCount === 1 ? t('customItems.item') : t('customItems.items')})
                    </span>
                  </div>
                  <span style={{ fontSize: '18px', color: '#666' }}>
                    {expandedBuildings.has(building.id) ? '▼' : '▶'}
                  </span>
                </div>

                {expandedBuildings.has(building.id) && (
                  <div style={{ display: 'grid', gap: '12px', paddingLeft: '20px' }}>
                    {buildingItems.map(item => (
                      <div
                        key={item.id}
                        style={{
                          padding: '18px',
                          border: '2px solid #e5e7eb',
                          borderRadius: '12px',
                          backgroundColor: item.is_active ? 'white' : '#f9fafb',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          borderLeft: `4px solid ${getCategoryColor(item.category)}`,
                          transition: 'all 0.2s',
                          cursor: 'default'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
                          e.currentTarget.style.transform = 'translateY(-2px)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.boxShadow = 'none';
                          e.currentTarget.style.transform = 'translateY(0)';
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                            <h5 style={{ fontSize: '16px', fontWeight: '700', margin: 0, color: '#111827' }}>
                              {item.description}
                            </h5>
                            {!item.is_active && (
                              <span style={{
                                fontSize: '12px',
                                padding: '3px 10px',
                                backgroundColor: '#fef3c7',
                                color: '#92400e',
                                borderRadius: '12px',
                                fontWeight: '600'
                              }}>
                                {t('customItems.inactiveLabel')}
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: '20px', fontSize: '14px', color: '#6b7280', flexWrap: 'wrap' }}>
                            <span style={{ 
                              display: 'flex', 
                              alignItems: 'center',
                              gap: '6px',
                              fontWeight: '600'
                            }}>
                              <span style={{ 
                                width: '8px', 
                                height: '8px', 
                                borderRadius: '50%', 
                                backgroundColor: getCategoryColor(item.category) 
                              }} />
                              {getCategoryLabel(item.category)}
                            </span>
                            <span>{getFrequencyLabel(item.frequency)}</span>
                            <span style={{ fontWeight: '700', color: '#111827' }}>
                              CHF {item.amount.toFixed(2)}
                            </span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                          <button
                            onClick={() => handleEdit(item)}
                            style={{
                              padding: '10px 14px',
                              backgroundColor: '#667EEA',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              fontSize: '13px',
                              fontWeight: '600',
                              transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = '#0056b3';
                              e.currentTarget.style.transform = 'translateY(-1px)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = '#667EEA';
                              e.currentTarget.style.transform = 'translateY(0)';
                            }}
                          >
                            <Edit2 size={14} />
                            {t('common.edit')}
                          </button>
                          <button
                            onClick={() => handleDelete(item.id)}
                            style={{
                              padding: '10px 14px',
                              backgroundColor: '#ef4444',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              fontSize: '13px',
                              fontWeight: '600',
                              transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = '#dc2626';
                              e.currentTarget.style.transform = 'translateY(-1px)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = '#ef4444';
                              e.currentTarget.style.transform = 'translateY(0)';
                            }}
                          >
                            <Trash2 size={14} />
                            {t('common.delete')}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Modal for Add/Edit */}
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
                {editingItem ? t('customItems.editItem') : t('customItems.newItem')}
              </h2>
              <p style={{ fontSize: '14px', color: '#6b7280' }}>
                {editingItem ? t('customItems.editSubtitle') : t('customItems.createSubtitle')}
              </p>
            </div>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                  {t('customItems.selectBuilding')} <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  value={formData.building_id || ''}
                  onChange={(e) => {
                    setFormData({ ...formData, building_id: Number(e.target.value) });
                    if (errors.building_id) setErrors({ ...errors, building_id: '' });
                  }}
                  required
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: `2px solid ${errors.building_id ? '#ef4444' : '#e5e7eb'}`,
                    borderRadius: '8px',
                    fontSize: '15px',
                    outline: 'none',
                    transition: 'border-color 0.2s',
                    backgroundColor: 'white',
                    cursor: 'pointer'
                  }}
                  onFocus={(e) => !errors.building_id && (e.target.style.borderColor = '#667EEA')}
                  onBlur={(e) => !errors.building_id && (e.target.style.borderColor = '#e5e7eb')}
                >
                  <option value="">{t('customItems.selectBuildingPlaceholder')}</option>
                  {buildings.map(building => (
                    <option key={building.id} value={building.id}>
                      {building.name}
                    </option>
                  ))}
                </select>
                {errors.building_id && (
                  <p style={{ color: '#ef4444', fontSize: '12px', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <AlertCircle size={12} />
                    {errors.building_id}
                  </p>
                )}
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                  {t('customItems.description')} <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => {
                    setFormData({ ...formData, description: e.target.value });
                    if (errors.description) setErrors({ ...errors, description: '' });
                  }}
                  required
                  maxLength={200}
                  placeholder={t('customItems.descriptionPlaceholder')}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: `2px solid ${errors.description ? '#ef4444' : '#e5e7eb'}`,
                    borderRadius: '8px',
                    fontSize: '15px',
                    outline: 'none',
                    transition: 'border-color 0.2s',
                    backgroundColor: 'white'
                  }}
                  onFocus={(e) => !errors.description && (e.target.style.borderColor = '#667EEA')}
                  onBlur={(e) => !errors.description && (e.target.style.borderColor = '#e5e7eb')}
                />
                {errors.description && (
                  <p style={{ color: '#ef4444', fontSize: '12px', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <AlertCircle size={12} />
                    {errors.description}
                  </p>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                    {t('customItems.amount')} (CHF) <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="999999"
                    value={formData.amount || ''}
                    onChange={(e) => {
                      setFormData({ ...formData, amount: Number(e.target.value) });
                      if (errors.amount) setErrors({ ...errors, amount: '' });
                    }}
                    required
                    placeholder="0.00"
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: `2px solid ${errors.amount ? '#ef4444' : '#e5e7eb'}`,
                      borderRadius: '8px',
                      fontSize: '15px',
                      outline: 'none',
                      transition: 'border-color 0.2s',
                      backgroundColor: 'white'
                    }}
                    onFocus={(e) => !errors.amount && (e.target.style.borderColor = '#667EEA')}
                    onBlur={(e) => !errors.amount && (e.target.style.borderColor = '#e5e7eb')}
                  />
                  {errors.amount && (
                    <p style={{ color: '#ef4444', fontSize: '12px', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <AlertCircle size={12} />
                      {errors.amount}
                    </p>
                  )}
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                    {t('customItems.category.label')} <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
                    required
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '2px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '15px',
                      cursor: 'pointer',
                      backgroundColor: 'white',
                      transition: 'border-color 0.2s'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#667EEA'}
                    onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                  >
                    <option value="meter_rent">{t('customItems.category.meterRent')}</option>
                    <option value="maintenance">{t('customItems.category.maintenance')}</option>
                    <option value="service">{t('customItems.category.service')}</option>
                    <option value="other">{t('customItems.category.other')}</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                  {t('customItems.frequency.label')} <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  value={formData.frequency}
                  onChange={(e) => setFormData({ ...formData, frequency: e.target.value as any })}
                  required
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '2px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '15px',
                    cursor: 'pointer',
                    backgroundColor: 'white',
                    transition: 'border-color 0.2s'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#667EEA'}
                  onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                >
                  <option value="once">{t('customItems.frequency.once')}</option>
                  <option value="monthly">{t('customItems.frequency.monthly')}</option>
                  <option value="quarterly">{t('customItems.frequency.quarterly')}</option>
                  <option value="yearly">{t('customItems.frequency.yearly')}</option>
                </select>
                <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '6px', fontStyle: 'italic' }}>
                  {formData.frequency === 'once' && t('customItems.frequencyHelp.once')}
                  {formData.frequency === 'monthly' && t('customItems.frequencyHelp.monthly')}
                  {formData.frequency === 'quarterly' && t('customItems.frequencyHelp.quarterly')}
                  {formData.frequency === 'yearly' && t('customItems.frequencyHelp.yearly')}
                </p>
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '10px', 
                  cursor: 'pointer',
                  padding: '12px',
                  backgroundColor: formData.is_active ? '#ecfdf5' : '#fef2f2',
                  borderRadius: '8px',
                  border: `2px solid ${formData.is_active ? '#10b981' : '#ef4444'}`,
                  transition: 'all 0.2s'
                }}>
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#667EEA' }}
                  />
                  <span style={{ fontSize: '14px', fontWeight: '600', color: '#111827' }}>
                    {formData.is_active 
                      ? t('customItems.active')
                      : t('customItems.inactive')}
                  </span>
                </label>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={saving}
                  style={{
                    flex: 1,
                    padding: '12px',
                    backgroundColor: '#6b7280',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '15px',
                    fontWeight: '600',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s',
                    opacity: saving ? 0.6 : 1
                  }}
                  onMouseEnter={(e) => !saving && (e.currentTarget.style.backgroundColor = '#4b5563')}
                  onMouseLeave={(e) => !saving && (e.currentTarget.style.backgroundColor = '#6b7280')}
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    flex: 1,
                    padding: '12px',
                    backgroundColor: saving ? '#9ca3af' : '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '15px',
                    fontWeight: '600',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 0.2s',
                    boxShadow: saving ? 'none' : '0 2px 4px rgba(16, 185, 129, 0.3)'
                  }}
                  onMouseEnter={(e) => !saving && (e.currentTarget.style.transform = 'translateY(-1px)')}
                  onMouseLeave={(e) => !saving && (e.currentTarget.style.transform = 'translateY(0)')}
                >
                  {saving && <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} />}
                  {editingItem ? t('common.update') : t('common.create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CSS Animations */}
      <style>{`
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
        
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}