import { useState, useEffect } from 'react';
import { Loader, AlertCircle } from 'lucide-react';
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
          {/* Building Selection */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: '600',
              color: '#374151'
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
          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: '600',
              color: '#374151'
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
            <div>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: '600',
                color: '#374151'
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
                fontSize: '14px',
                fontWeight: '600',
                color: '#374151'
              }}>
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

          {/* Frequency */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: '600',
              color: '#374151'
            }}>
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

          {/* Active Status */}
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
                {formData.is_active ? t('customItems.active') : t('customItems.inactive')}
              </span>
            </label>
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              type="button"
              onClick={onClose}
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
        
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}