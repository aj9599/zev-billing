import { useState, useEffect } from 'react';
import { Loader, AlertCircle, X, DollarSign } from 'lucide-react';
import type { CustomLineItem, Building } from '../../../../types';
import { useTranslation } from '../../../../i18n';

interface CustomItemFormModalProps {
  buildings: Building[];
  editingItem: CustomLineItem | null;
  onSave: (formData: any) => Promise<void>;
  onClose: () => void;
  saving: boolean;
}

export default function CustomItemFormModal({
  buildings,
  editingItem,
  onSave,
  onClose,
  saving
}: CustomItemFormModalProps) {
  const { t } = useTranslation();
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
    if (editingItem) {
      setFormData({
        building_id: editingItem.building_id,
        description: editingItem.description,
        amount: editingItem.amount,
        frequency: editingItem.frequency as any,
        category: editingItem.category as any,
        is_active: editingItem.is_active
      });
    }
  }, [editingItem]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    try {
      await onSave(formData);
      onClose();
    } catch (err) {
      console.error('Failed to save:', err);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.15)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000,
      padding: '20px',
      animation: 'ci-fadeIn 0.2s ease-out'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '20px',
        maxWidth: '600px',
        width: '100%',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
        animation: 'ci-slideUp 0.3s ease-out',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #f3f4f6',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '10px',
              backgroundColor: '#667eea15',
              color: '#667eea',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <DollarSign size={18} />
            </div>
            <div>
              <h2 style={{
                fontSize: '18px',
                fontWeight: '700',
                color: '#1f2937',
                margin: 0
              }}>
                {editingItem ? t('customItems.editItem') : t('customItems.newItem')}
              </h2>
              <p style={{ fontSize: '13px', color: '#9ca3af', margin: '2px 0 0 0' }}>
                {editingItem ? t('customItems.editSubtitle') : t('customItems.createSubtitle')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: '32px', height: '32px', borderRadius: '8px',
              border: 'none', backgroundColor: '#f3f4f6', color: '#6b7280',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#e5e7eb'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#f3f4f6'; }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{
          padding: '24px',
          overflowY: 'auto',
          flex: 1,
          backgroundColor: '#f9fafb'
        }}>
          <form id="custom-item-form" onSubmit={handleSubmit}>
            {/* Building Selection */}
            <div style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              padding: '16px',
              marginBottom: '16px'
            }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '13px',
                fontWeight: '600',
                color: '#374151',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
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
                  padding: '10px 12px',
                  border: `1px solid ${errors.building_id ? '#ef4444' : '#e5e7eb'}`,
                  borderRadius: '8px',
                  fontSize: '14px',
                  outline: 'none',
                  transition: 'border-color 0.2s',
                  backgroundColor: 'white',
                  cursor: 'pointer'
                }}
                onFocus={(e) => !errors.building_id && (e.target.style.borderColor = '#667eea')}
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
                <p style={{
                  color: '#ef4444',
                  fontSize: '12px',
                  marginTop: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  <AlertCircle size={12} />
                  {errors.building_id}
                </p>
              )}
            </div>

            {/* Description */}
            <div style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              padding: '16px',
              marginBottom: '16px'
            }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '13px',
                fontWeight: '600',
                color: '#374151',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
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
                  padding: '10px 12px',
                  border: `1px solid ${errors.description ? '#ef4444' : '#e5e7eb'}`,
                  borderRadius: '8px',
                  fontSize: '14px',
                  outline: 'none',
                  transition: 'border-color 0.2s',
                  backgroundColor: 'white'
                }}
                onFocus={(e) => !errors.description && (e.target.style.borderColor = '#667eea')}
                onBlur={(e) => !errors.description && (e.target.style.borderColor = '#e5e7eb')}
              />
              {errors.description && (
                <p style={{
                  color: '#ef4444',
                  fontSize: '12px',
                  marginTop: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  <AlertCircle size={12} />
                  {errors.description}
                </p>
              )}
            </div>

            {/* Amount and Category */}
            <div style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              padding: '16px',
              marginBottom: '16px'
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{
                    display: 'block',
                    marginBottom: '8px',
                    fontSize: '13px',
                    fontWeight: '600',
                    color: '#374151',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
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
                      padding: '10px 12px',
                      border: `1px solid ${errors.amount ? '#ef4444' : '#e5e7eb'}`,
                      borderRadius: '8px',
                      fontSize: '14px',
                      outline: 'none',
                      transition: 'border-color 0.2s',
                      backgroundColor: 'white'
                    }}
                    onFocus={(e) => !errors.amount && (e.target.style.borderColor = '#667eea')}
                    onBlur={(e) => !errors.amount && (e.target.style.borderColor = '#e5e7eb')}
                  />
                  {errors.amount && (
                    <p style={{
                      color: '#ef4444',
                      fontSize: '12px',
                      marginTop: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      <AlertCircle size={12} />
                      {errors.amount}
                    </p>
                  )}
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    marginBottom: '8px',
                    fontSize: '13px',
                    fontWeight: '600',
                    color: '#374151',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    {t('customItems.category.label')} <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
                    required
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                      cursor: 'pointer',
                      backgroundColor: 'white',
                      transition: 'border-color 0.2s'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#667eea'}
                    onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                  >
                    <option value="meter_rent">{t('customItems.category.meterRent')}</option>
                    <option value="maintenance">{t('customItems.category.maintenance')}</option>
                    <option value="service">{t('customItems.category.service')}</option>
                    <option value="other">{t('customItems.category.other')}</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Frequency */}
            <div style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              padding: '16px',
              marginBottom: '16px'
            }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '13px',
                fontWeight: '600',
                color: '#374151',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                {t('customItems.frequency.label')} <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                value={formData.frequency}
                onChange={(e) => setFormData({ ...formData, frequency: e.target.value as any })}
                required
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '14px',
                  cursor: 'pointer',
                  backgroundColor: 'white',
                  transition: 'border-color 0.2s'
                }}
                onFocus={(e) => e.target.style.borderColor = '#667eea'}
                onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
              >
                <option value="once">{t('customItems.frequency.once')}</option>
                <option value="monthly">{t('customItems.frequency.monthly')}</option>
                <option value="quarterly">{t('customItems.frequency.quarterly')}</option>
                <option value="yearly">{t('customItems.frequency.yearly')}</option>
              </select>
              <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '6px', fontStyle: 'italic' }}>
                {formData.frequency === 'once' && t('customItems.frequencyHelp.once')}
                {formData.frequency === 'monthly' && t('customItems.frequencyHelp.monthly')}
                {formData.frequency === 'quarterly' && t('customItems.frequencyHelp.quarterly')}
                {formData.frequency === 'yearly' && t('customItems.frequencyHelp.yearly')}
              </p>
            </div>

            {/* Active Status */}
            <div style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              padding: '16px'
            }}>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                cursor: 'pointer',
                padding: '10px 12px',
                backgroundColor: formData.is_active ? 'rgba(16, 185, 129, 0.06)' : 'rgba(239, 68, 68, 0.06)',
                borderRadius: '8px',
                border: `1px solid ${formData.is_active ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                transition: 'all 0.2s'
              }}>
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#667eea' }}
                />
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#1f2937' }}>
                  {formData.is_active ? t('customItems.active') : t('customItems.inactive')}
                </span>
              </label>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid #f3f4f6',
          display: 'flex',
          gap: '10px',
          flexShrink: 0,
          backgroundColor: 'white'
        }}>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              flex: 1,
              padding: '10px',
              backgroundColor: 'white',
              color: '#374151',
              border: '1px solid #e5e7eb',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: saving ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              opacity: saving ? 0.6 : 1
            }}
            onMouseEnter={(e) => !saving && (e.currentTarget.style.backgroundColor = '#f9fafb')}
            onMouseLeave={(e) => !saving && (e.currentTarget.style.backgroundColor = 'white')}
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            form="custom-item-form"
            disabled={saving}
            style={{
              flex: 1,
              padding: '10px',
              background: saving ? '#d1d5db' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: saving ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.2s',
              boxShadow: saving ? 'none' : '0 2px 8px rgba(102, 126, 234, 0.35)'
            }}
          >
            {saving && <Loader size={14} style={{ animation: 'ci-spin 1s linear infinite' }} />}
            {editingItem ? t('common.update') : t('common.create')}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes ci-fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes ci-slideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes ci-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
