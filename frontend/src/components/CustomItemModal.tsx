import { useState, useEffect } from 'react';
import { X, Plus, Edit2, Trash2, DollarSign, AlertCircle, CheckCircle, Loader } from 'lucide-react';
import { api } from '../api/client';
import type { CustomLineItem, Building } from '../types';
import { useTranslation } from '../i18n';

interface CustomItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
}

interface Toast {
  message: string;
  type: 'success' | 'error' | 'info';
}

export default function CustomItemModal({ isOpen, onClose, onSave }: CustomItemModalProps) {
  const { t } = useTranslation();
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [items, setItems] = useState<CustomLineItem[]>([]);
  const [selectedBuildingId, setSelectedBuildingId] = useState<number | null>(null);
  const [editingItem, setEditingItem] = useState<CustomLineItem | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  const [formData, setFormData] = useState({
    building_id: 0,
    description: '',
    amount: 0,
    frequency: 'monthly' as 'once' | 'monthly' | 'quarterly' | 'yearly',
    category: 'other' as 'meter_rent' | 'maintenance' | 'service' | 'other',
    is_active: true
  });

  useEffect(() => {
    if (isOpen) {
      loadBuildings();
      if (selectedBuildingId) {
        loadItems(selectedBuildingId);
      }
    }
  }, [isOpen]);

  useEffect(() => {
    if (selectedBuildingId) {
      loadItems(selectedBuildingId);
    }
  }, [selectedBuildingId]);

  // Auto-hide toast after 3 seconds
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
      setBuildings(data);
      if (data.length > 0 && !selectedBuildingId) {
        setSelectedBuildingId(data[0].id);
      }
    } catch (err) {
      console.error('Failed to load buildings:', err);
      showToast('Failed to load buildings', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadItems = async (buildingId?: number) => {
    try {
      setLoading(true);
      const data = await api.getCustomLineItems(buildingId);
      setItems(data);
    } catch (err) {
      console.error('Failed to load custom items:', err);
      showToast('Failed to load custom items', 'error');
    } finally {
      setLoading(false);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.description.trim()) {
      newErrors.description = 'Description is required';
    } else if (formData.description.length > 200) {
      newErrors.description = 'Description must be less than 200 characters';
    }

    if (formData.amount <= 0) {
      newErrors.amount = 'Amount must be greater than 0';
    } else if (formData.amount > 999999) {
      newErrors.amount = 'Amount is too large';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      showToast('Please fix the errors in the form', 'error');
      return;
    }

    if (!selectedBuildingId) {
      showToast('Please select a building', 'error');
      return;
    }
    
    try {
      setSaving(true);
      if (editingItem) {
        await api.updateCustomLineItem(editingItem.id, formData);
        showToast('Custom item updated successfully', 'success');
      } else {
        await api.createCustomLineItem({
          ...formData,
          building_id: selectedBuildingId
        });
        showToast('Custom item created successfully', 'success');
      }
      
      resetForm();
      await loadItems(selectedBuildingId);
      onSave();
    } catch (err) {
      console.error('Failed to save custom item:', err);
      showToast(`Failed to save custom item: ${(err as Error).message}`, 'error');
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
    setShowForm(true);
    setErrors({});
    
    // Scroll form into view
    setTimeout(() => {
      document.getElementById('custom-item-form')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this custom item? This action cannot be undone.')) return;
    
    try {
      await api.deleteCustomLineItem(id);
      showToast('Custom item deleted successfully', 'success');
      await loadItems(selectedBuildingId!);
      onSave();
    } catch (err) {
      console.error('Failed to delete custom item:', err);
      showToast(`Failed to delete custom item: ${(err as Error).message}`, 'error');
    }
  };

  const resetForm = () => {
    setFormData({
      building_id: selectedBuildingId || 0,
      description: '',
      amount: 0,
      frequency: 'monthly',
      category: 'other',
      is_active: true
    });
    setEditingItem(null);
    setShowForm(false);
    setErrors({});
  };

  const getCategoryLabel = (category: string) => {
    const labels = {
      meter_rent: t('customItems.category.meterRent') || 'Meter Rent',
      maintenance: t('customItems.category.maintenance') || 'Maintenance',
      service: t('customItems.category.service') || 'Service',
      other: t('customItems.category.other') || 'Other'
    };
    return labels[category as keyof typeof labels] || category;
  };

  const getFrequencyLabel = (frequency: string) => {
    const labels = {
      once: t('customItems.frequency.once') || 'One-time',
      monthly: t('customItems.frequency.monthly') || 'Monthly',
      quarterly: t('customItems.frequency.quarterly') || 'Quarterly',
      yearly: t('customItems.frequency.yearly') || 'Yearly'
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

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      animation: 'fadeIn 0.2s ease-in'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '30px',
        maxWidth: '900px',
        width: '90%',
        maxHeight: '90vh',
        overflow: 'auto',
        animation: 'slideUp 0.3s ease-out',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
      }}>
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
            zIndex: 1001,
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
          <h2 style={{ 
            fontSize: '24px', 
            fontWeight: 'bold', 
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <DollarSign size={24} style={{ color: '#667eea' }} />
            {t('customItems.title') || 'Manage Custom Line Items'}
          </h2>
          <button 
            onClick={onClose} 
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '8px',
              borderRadius: '4px',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <X size={24} />
          </button>
        </div>

        {/* Building Selection */}
        <div style={{ marginBottom: '25px' }}>
          <label style={{ 
            display: 'block', 
            marginBottom: '8px', 
            fontWeight: '500',
            fontSize: '14px',
            color: '#374151'
          }}>
            {t('customItems.selectBuilding') || 'Select Building'} *
          </label>
          <select
            value={selectedBuildingId || ''}
            onChange={(e) => {
              setSelectedBuildingId(Number(e.target.value));
              setShowForm(false);
              resetForm();
            }}
            disabled={loading}
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
              backgroundColor: loading ? '#f9fafb' : 'white',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'border-color 0.2s'
            }}
          >
            <option value="">{t('customItems.selectBuildingPlaceholder') || 'Select a building'}</option>
            {buildings.map(building => (
              <option key={building.id} value={building.id}>
                {building.name}
              </option>
            ))}
          </select>
        </div>

        {/* Loading State */}
        {loading && (
          <div style={{
            textAlign: 'center',
            padding: '40px',
            color: '#666'
          }}>
            <Loader size={40} style={{ animation: 'spin 1s linear infinite' }} />
            <p style={{ marginTop: '10px', fontSize: '14px' }}>Loading...</p>
          </div>
        )}

        {/* Add New Item Button */}
        {!loading && !showForm && selectedBuildingId && (
          <button
            onClick={() => setShowForm(true)}
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: '#667eea',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#5568d3'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#667eea'}
          >
            <Plus size={18} />
            {t('customItems.addNew') || 'Add New Custom Item'}
          </button>
        )}

        {/* Form */}
        {showForm && (
          <form 
            id="custom-item-form"
            onSubmit={handleSubmit} 
            style={{
              backgroundColor: '#f9fafb',
              padding: '20px',
              borderRadius: '8px',
              marginBottom: '25px',
              border: '1px solid #e5e7eb'
            }}
          >
            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '15px', color: '#111827' }}>
              {editingItem ? (t('customItems.editItem') || 'Edit Custom Item') : (t('customItems.newItem') || 'New Custom Item')}
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                  {t('customItems.description') || 'Description'} *
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
                  placeholder={t('customItems.descriptionPlaceholder') || 'e.g., Monthly maintenance fee'}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: `1px solid ${errors.description ? '#ef4444' : '#d1d5db'}`,
                    borderRadius: '4px',
                    fontSize: '14px',
                    outline: 'none',
                    transition: 'border-color 0.2s'
                  }}
                  onFocus={(e) => !errors.description && (e.target.style.borderColor = '#667eea')}
                  onBlur={(e) => !errors.description && (e.target.style.borderColor = '#d1d5db')}
                />
                {errors.description && (
                  <p style={{ color: '#ef4444', fontSize: '12px', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <AlertCircle size={12} />
                    {errors.description}
                  </p>
                )}
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                  {t('customItems.amount') || 'Amount'} (CHF) *
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
                    padding: '8px',
                    border: `1px solid ${errors.amount ? '#ef4444' : '#d1d5db'}`,
                    borderRadius: '4px',
                    fontSize: '14px',
                    outline: 'none',
                    transition: 'border-color 0.2s'
                  }}
                  onFocus={(e) => !errors.amount && (e.target.style.borderColor = '#667eea')}
                  onBlur={(e) => !errors.amount && (e.target.style.borderColor = '#d1d5db')}
                />
                {errors.amount && (
                  <p style={{ color: '#ef4444', fontSize: '12px', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <AlertCircle size={12} />
                    {errors.amount}
                  </p>
                )}
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                  {t('customItems.category') || 'Category'} *
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
                  required
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '14px',
                    cursor: 'pointer',
                    backgroundColor: 'white'
                  }}
                >
                  <option value="meter_rent">{t('customItems.category.meterRent') || 'Meter Rent'}</option>
                  <option value="maintenance">{t('customItems.category.maintenance') || 'Maintenance'}</option>
                  <option value="service">{t('customItems.category.service') || 'Service'}</option>
                  <option value="other">{t('customItems.category.other') || 'Other'}</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                {t('customItems.frequency') || 'Frequency'} *
              </label>
              <select
                value={formData.frequency}
                onChange={(e) => setFormData({ ...formData, frequency: e.target.value as any })}
                required
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '14px',
                  cursor: 'pointer',
                  backgroundColor: 'white'
                }}
              >
                <option value="once">{t('customItems.frequency.once') || 'One-time'}</option>
                <option value="monthly">{t('customItems.frequency.monthly') || 'Monthly'}</option>
                <option value="quarterly">{t('customItems.frequency.quarterly') || 'Quarterly'}</option>
                <option value="yearly">{t('customItems.frequency.yearly') || 'Yearly'}</option>
              </select>
              <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                {formData.frequency === 'once' && (t('customItems.frequencyHelp.once') || 'Added once to the first bill in the period')}
                {formData.frequency === 'monthly' && (t('customItems.frequencyHelp.monthly') || 'Multiplied by the number of months in the billing period')}
                {formData.frequency === 'quarterly' && (t('customItems.frequencyHelp.quarterly') || 'Multiplied by the number of quarters in the billing period')}
                {formData.frequency === 'yearly' && (t('customItems.frequencyHelp.yearly') || 'Multiplied by the number of years in the billing period')}
              </p>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px', 
                cursor: 'pointer',
                padding: '10px',
                backgroundColor: formData.is_active ? '#ecfdf5' : '#fef2f2',
                borderRadius: '6px',
                border: `1px solid ${formData.is_active ? '#10b981' : '#ef4444'}`,
                transition: 'all 0.2s'
              }}>
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '14px', fontWeight: '500', color: '#111827' }}>
                  {formData.is_active 
                    ? (t('customItems.active') || 'Active (will be included in bills)') 
                    : (t('customItems.inactive') || 'Inactive (will not be included in bills)')}
                </span>
              </label>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="submit"
                disabled={saving}
                style={{
                  flex: 1,
                  padding: '10px',
                  backgroundColor: saving ? '#9ca3af' : '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => !saving && (e.currentTarget.style.backgroundColor = '#059669')}
                onMouseLeave={(e) => !saving && (e.currentTarget.style.backgroundColor = '#10b981')}
              >
                {saving && <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} />}
                {editingItem ? (t('common.update') || 'Update') : (t('common.create') || 'Create')}
              </button>
              <button
                type="button"
                onClick={resetForm}
                disabled={saving}
                style={{
                  flex: 1,
                  padding: '10px',
                  backgroundColor: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => !saving && (e.currentTarget.style.backgroundColor = '#4b5563')}
                onMouseLeave={(e) => !saving && (e.currentTarget.style.backgroundColor = '#6b7280')}
              >
                {t('common.cancel') || 'Cancel'}
              </button>
            </div>
          </form>
        )}

        {/* Items List */}
        {!loading && selectedBuildingId && (
          <div>
            <h3 style={{ 
              fontSize: '18px', 
              fontWeight: '600', 
              marginBottom: '15px',
              color: '#111827',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <span>{t('customItems.itemsForBuilding') || 'Custom Items for Building'}</span>
              <span style={{ 
                fontSize: '14px', 
                fontWeight: '500', 
                color: '#6b7280',
                backgroundColor: '#f3f4f6',
                padding: '4px 12px',
                borderRadius: '12px'
              }}>
                {items.length} {items.length === 1 ? 'item' : 'items'}
              </span>
            </h3>

            {items.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '40px',
                color: '#6b7280',
                backgroundColor: '#f9fafb',
                borderRadius: '8px',
                border: '2px dashed #d1d5db'
              }}>
                <DollarSign size={48} style={{ marginBottom: '10px', opacity: 0.3, margin: '0 auto' }} />
                <p style={{ fontSize: '16px', fontWeight: '500', marginBottom: '4px' }}>
                  {t('customItems.noItems') || 'No custom items found'}
                </p>
                <p style={{ fontSize: '14px', marginTop: '5px' }}>
                  {t('customItems.noItemsDescription') || 'Click "Add New Custom Item" to create one.'}
                </p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '12px' }}>
                {items.map(item => (
                  <div
                    key={item.id}
                    style={{
                      padding: '16px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      backgroundColor: item.is_active ? 'white' : '#f9fafb',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      borderLeft: `4px solid ${getCategoryColor(item.category)}`,
                      transition: 'box-shadow 0.2s',
                      cursor: 'default'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)'}
                    onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                        <h4 style={{ fontSize: '16px', fontWeight: '600', margin: 0, color: '#111827' }}>
                          {item.description}
                        </h4>
                        {!item.is_active && (
                          <span style={{
                            fontSize: '12px',
                            padding: '2px 8px',
                            backgroundColor: '#fef3c7',
                            color: '#92400e',
                            borderRadius: '12px',
                            fontWeight: '500'
                          }}>
                            {t('customItems.inactive') || 'Inactive'}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '20px', fontSize: '14px', color: '#6b7280', flexWrap: 'wrap' }}>
                        <span style={{ 
                          display: 'flex', 
                          alignItems: 'center',
                          gap: '4px',
                          fontWeight: '500'
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
                        <span style={{ fontWeight: '600', color: '#111827' }}>
                          CHF {item.amount.toFixed(2)}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                      <button
                        onClick={() => handleEdit(item)}
                        style={{
                          padding: '8px 12px',
                          backgroundColor: '#667eea',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '13px',
                          fontWeight: '500',
                          transition: 'background-color 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#5568d3'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#667eea'}
                      >
                        <Edit2 size={14} />
                        {t('common.edit') || 'Edit'}
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        style={{
                          padding: '8px 12px',
                          backgroundColor: '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '13px',
                          fontWeight: '500',
                          transition: 'background-color 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#dc2626'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ef4444'}
                      >
                        <Trash2 size={14} />
                        {t('common.delete') || 'Delete'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: '25px', paddingTop: '20px', borderTop: '1px solid #e5e7eb' }}>
          <button
            onClick={onClose}
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: '#f3f4f6',
              color: '#374151',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#e5e7eb'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
          >
            {t('common.close') || 'Close'}
          </button>
        </div>

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

          @media (max-width: 640px) {
            .modal-content {
              width: 95%;
              padding: 20px;
            }
          }
        `}</style>
      </div>
    </div>
  );
}