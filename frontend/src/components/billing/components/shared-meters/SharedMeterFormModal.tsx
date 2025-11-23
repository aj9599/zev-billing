import { useState, useEffect } from 'react';
import { Loader, AlertCircle } from 'lucide-react';
import type { SharedMeterConfig, Building, Meter, User } from '../../../types';
import { useTranslation } from '../../../../i18n';
import CustomSplitsEditor from './CustomSplitsEditor';

interface SharedMeterFormModalProps {
  buildings: Building[];
  meters: Meter[];
  users: User[];
  editingConfig: SharedMeterConfig | null;
  onSave: (formData: any) => Promise<void>;
  onClose: () => void;
  saving: boolean;
  getBuildingUsers: (buildingId: number) => User[];
  getMetersForBuilding: (buildingId: number) => Meter[];
}

export default function SharedMeterFormModal({
  buildings,
  meters,
  users,
  editingConfig,
  onSave,
  onClose,
  saving,
  getBuildingUsers,
  getMetersForBuilding
}: SharedMeterFormModalProps) {
  const { t } = useTranslation();

  const [formData, setFormData] = useState({
    meter_id: 0,
    building_id: 0,
    meter_name: '',
    split_type: 'equal' as 'equal' | 'custom',
    unit_price: 0,
    custom_splits: {} as Record<number, number>
  });

  useEffect(() => {
    if (editingConfig) {
      setFormData({
        meter_id: editingConfig.meter_id,
        building_id: editingConfig.building_id,
        meter_name: editingConfig.meter_name,
        split_type: (editingConfig.split_type === 'equal' || editingConfig.split_type === 'custom') 
          ? editingConfig.split_type 
          : 'equal',
        unit_price: editingConfig.unit_price,
        custom_splits: (editingConfig as any).custom_splits || {}
      });
    }
  }, [editingConfig]);

  // Initialize custom splits when building changes
  useEffect(() => {
    if (formData.building_id && formData.split_type === 'custom') {
      const buildingUsers = getBuildingUsers(formData.building_id);
      if (buildingUsers.length > 0 && Object.keys(formData.custom_splits).length === 0) {
        const equalSplit = 100 / buildingUsers.length;
        const newSplits: Record<number, number> = {};
        buildingUsers.forEach(user => {
          newSplits[user.id] = parseFloat(equalSplit.toFixed(2));
        });
        setFormData(prev => ({ ...prev, custom_splits: newSplits }));
      }
    }
  }, [formData.building_id, formData.split_type]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await onSave(formData);
      onClose();
    } catch (err) {
      console.error('Failed to save:', err);
    }
  };

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

  const getSplitTypeLabel = (type: string) => {
    return type === 'equal' ? t('sharedMeters.splitType.equal') : t('sharedMeters.splitType.custom');
  };

  const getSplitTypeDescription = (type: string) => {
    return type === 'equal' 
      ? t('sharedMeters.splitTypeDesc.equal') 
      : t('sharedMeters.splitTypeDesc.custom');
  };

  const buildingUsers = formData.building_id ? getBuildingUsers(formData.building_id) : [];
  const buildingMeters = formData.building_id ? getMetersForBuilding(formData.building_id) : [];

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
            {editingConfig ? t('sharedMeters.editTitle') : t('sharedMeters.createTitle')}
          </h2>
          <p style={{ fontSize: '14px', color: '#6b7280' }}>
            {editingConfig ? t('sharedMeters.editSubtitle') : t('sharedMeters.createSubtitle')}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
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
              value={formData.building_id || ''}
              onChange={(e) => {
                const buildingId = parseInt(e.target.value);
                setFormData({
                  ...formData,
                  building_id: buildingId,
                  meter_id: 0,
                  meter_name: '',
                  custom_splits: {}
                });
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
              <option value="">{t('sharedMeters.selectBuilding')}</option>
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
              value={formData.meter_id || ''}
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
              <option value="">{t('sharedMeters.selectMeter')}</option>
              {buildingMeters.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            {formData.building_id && buildingMeters.length === 0 && (
              <p style={{
                fontSize: '13px',
                color: '#ef4444',
                marginTop: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
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
                <label
                  key={type}
                  style={{
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
                    onChange={(e) => setFormData({ ...formData, split_type: e.target.value as any })}
                    style={{ marginTop: '2px', cursor: 'pointer', accentColor: '#667EEA' }}
                  />
                  <div style={{ flex: 1 }}>
                    <strong style={{
                      fontSize: '15px',
                      display: 'block',
                      marginBottom: '4px',
                      color: '#1f2937'
                    }}>
                      {getSplitTypeLabel(type)}
                    </strong>
                    <p style={{
                      fontSize: '13px',
                      color: '#6b7280',
                      margin: 0,
                      lineHeight: '1.5'
                    }}>
                      {getSplitTypeDescription(type)}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Custom Splits Configuration */}
          {formData.split_type === 'custom' && formData.building_id && buildingUsers.length > 0 && (
            <CustomSplitsEditor
              users={buildingUsers}
              customSplits={formData.custom_splits}
              onChange={handlePercentageChange}
            />
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
              onChange={(e) => setFormData({ ...formData, unit_price: parseFloat(e.target.value) || 0 })}
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
              type="submit"
              disabled={!formData.building_id || !formData.meter_id || formData.unit_price <= 0 || saving}
              style={{
                flex: 1,
                padding: '12px',
                backgroundColor: (!formData.building_id || !formData.meter_id || formData.unit_price <= 0 || saving) 
                  ? '#d1d5db' 
                  : '#667EEA',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: (!formData.building_id || !formData.meter_id || formData.unit_price <= 0 || saving) 
                  ? 'not-allowed' 
                  : 'pointer',
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