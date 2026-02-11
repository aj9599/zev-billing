import { useState, useEffect } from 'react';
import { Loader, AlertCircle, X, Zap } from 'lucide-react';
import type { SharedMeterConfig, Building, Meter, User } from '../../../../types';
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

  const isFormValid = formData.building_id && formData.meter_id && formData.unit_price > 0 && !saving;

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
      animation: 'sm-fadeIn 0.2s ease-out'
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
        animation: 'sm-slideUp 0.3s ease-out',
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
              backgroundColor: 'rgba(251, 191, 36, 0.1)',
              color: '#f59e0b',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Zap size={18} />
            </div>
            <div>
              <h2 style={{
                fontSize: '18px',
                fontWeight: '700',
                color: '#1f2937',
                margin: 0
              }}>
                {editingConfig ? t('sharedMeters.editTitle') : t('sharedMeters.createTitle')}
              </h2>
              <p style={{ fontSize: '13px', color: '#9ca3af', margin: '2px 0 0 0' }}>
                {editingConfig ? t('sharedMeters.editSubtitle') : t('sharedMeters.createSubtitle')}
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
          <form id="shared-meter-form" onSubmit={handleSubmit}>
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
                  padding: '10px 12px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '14px',
                  backgroundColor: 'white',
                  cursor: 'pointer',
                  transition: 'border-color 0.2s'
                }}
                onFocus={(e) => e.target.style.borderColor = '#667eea'}
                onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
              >
                <option value="">{t('sharedMeters.selectBuilding')}</option>
                {buildings.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            {/* Meter Selection */}
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
                  padding: '10px 12px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '14px',
                  backgroundColor: formData.building_id ? 'white' : '#f3f4f6',
                  cursor: formData.building_id ? 'pointer' : 'not-allowed',
                  transition: 'border-color 0.2s'
                }}
                onFocus={(e) => formData.building_id && (e.target.style.borderColor = '#667eea')}
                onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
              >
                <option value="">{t('sharedMeters.selectMeter')}</option>
                {buildingMeters.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
              {formData.building_id && buildingMeters.length === 0 && (
                <p style={{
                  fontSize: '12px',
                  color: '#ef4444',
                  marginTop: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  <AlertCircle size={12} />
                  {t('sharedMeters.noMetersFound')}
                </p>
              )}
            </div>

            {/* Split Type Selection */}
            <div style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              padding: '16px',
              marginBottom: '16px'
            }}>
              <label style={{
                display: 'block',
                marginBottom: '10px',
                fontSize: '13px',
                fontWeight: '600',
                color: '#374151',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                {t('sharedMeters.splitType.label')} <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {(['equal', 'custom'] as const).map(type => (
                  <label
                    key={type}
                    style={{
                      display: 'flex',
                      alignItems: 'start',
                      gap: '10px',
                      padding: '12px',
                      border: `1px solid ${formData.split_type === type ? '#667eea' : '#e5e7eb'}`,
                      borderRadius: '10px',
                      cursor: 'pointer',
                      backgroundColor: formData.split_type === type ? '#667eea08' : 'white',
                      transition: 'all 0.2s'
                    }}
                  >
                    <input
                      type="radio"
                      name="split_type"
                      value={type}
                      checked={formData.split_type === type}
                      onChange={(e) => setFormData({ ...formData, split_type: e.target.value as any })}
                      style={{ marginTop: '2px', cursor: 'pointer', accentColor: '#667eea' }}
                    />
                    <div style={{ flex: 1 }}>
                      <strong style={{
                        fontSize: '13px',
                        display: 'block',
                        marginBottom: '2px',
                        color: '#1f2937'
                      }}>
                        {getSplitTypeLabel(type)}
                      </strong>
                      <p style={{
                        fontSize: '12px',
                        color: '#9ca3af',
                        margin: 0,
                        lineHeight: '1.4'
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
            <div style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              padding: '16px'
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
                  padding: '10px 12px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '14px',
                  transition: 'border-color 0.2s'
                }}
                onFocus={(e) => e.target.style.borderColor = '#667eea'}
                onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
              />
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
            form="shared-meter-form"
            disabled={!isFormValid}
            style={{
              flex: 1,
              padding: '10px',
              background: isFormValid ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : '#d1d5db',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: isFormValid ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.2s',
              boxShadow: isFormValid ? '0 2px 8px rgba(102, 126, 234, 0.35)' : 'none'
            }}
          >
            {saving && <Loader size={14} style={{ animation: 'sm-spin 1s linear infinite' }} />}
            {editingConfig ? t('common.update') : t('common.create')}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes sm-fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes sm-slideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes sm-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
