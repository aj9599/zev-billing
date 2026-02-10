import { X, Building, Home, FileText } from 'lucide-react';
import { useTranslation } from '../../../i18n';
import { getAvailableBuildings } from '../utils/buildingUtils';
import LegoApartmentBuilder from './apartments/LegoApartmentBuilder';
import type { Building as BuildingType } from '../../../types';

interface BuildingFormModalProps {
  editingBuilding: BuildingType | null;
  formData: Partial<BuildingType>;
  setFormData: (data: Partial<BuildingType>) => void;
  buildings: BuildingType[];
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  isMobile: boolean;
}

export default function BuildingFormModal({
  editingBuilding,
  formData,
  setFormData,
  buildings,
  onSubmit,
  onClose,
  isMobile
}: BuildingFormModalProps) {
  const { t } = useTranslation();
  const availableBuildings = getAvailableBuildings(buildings, editingBuilding?.id);

  const toggleGroupBuilding = (buildingId: number) => {
    const current = formData.group_buildings || [];
    if (current.includes(buildingId)) {
      setFormData({
        ...formData,
        group_buildings: current.filter(id => id !== buildingId)
      });
    } else {
      setFormData({
        ...formData,
        group_buildings: [...current, buildingId]
      });
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.4)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '15px',
      backdropFilter: 'blur(4px)'
    }}>
      <div
        className="modal-content"
        style={{
          backgroundColor: '#f9fafb',
          borderRadius: '16px',
          padding: 0,
          width: '95%',
          maxWidth: '1200px',
          maxHeight: '90vh',
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: isMobile ? '16px 20px' : '20px 30px',
          backgroundColor: 'white',
          borderBottom: '1px solid #f0f0f0'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Building size={18} color="white" />
            </div>
            <h2 style={{
              fontSize: isMobile ? '18px' : '20px',
              fontWeight: '700',
              color: '#1f2937',
              margin: 0
            }}>
              {editingBuilding ? t('buildings.editBuilding') : t('buildings.addBuilding')}
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: '#f3f4f6',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#e5e7eb'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#f3f4f6'; }}
          >
            <X size={18} color="#6b7280" />
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{
          overflow: 'auto',
          padding: isMobile ? '20px' : '24px 30px',
          flex: 1
        }}>
          <form onSubmit={onSubmit} id="building-form">
            {/* Name field */}
            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>{t('common.name')} *</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                style={inputStyle(isMobile)}
                onFocus={(e) => { e.currentTarget.style.borderColor = '#667eea'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(102,126,234,0.1)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = 'none'; }}
              />
            </div>

            {/* Group toggle */}
            <div style={{
              marginBottom: '20px',
              padding: '14px 16px',
              backgroundColor: 'white',
              borderRadius: '10px',
              border: '1px solid #e5e7eb'
            }}>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                cursor: 'pointer'
              }}>
                <div style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '6px',
                  border: `2px solid ${formData.is_group ? '#667eea' : '#d1d5db'}`,
                  backgroundColor: formData.is_group ? '#667eea' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s',
                  flexShrink: 0
                }}>
                  {formData.is_group && (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
                <input
                  type="checkbox"
                  checked={formData.is_group}
                  onChange={(e) => setFormData({ ...formData, is_group: e.target.checked })}
                  style={{ display: 'none' }}
                />
                <span style={{ fontWeight: '600', fontSize: '14px', color: '#1f2937' }}>
                  {t('buildings.isComplex')}
                </span>
              </label>
            </div>

            {/* Group building selection */}
            {formData.is_group && (
              <div style={{
                marginBottom: '20px',
                padding: '16px',
                backgroundColor: 'white',
                borderRadius: '10px',
                border: '1px solid #e5e7eb'
              }}>
                <label style={{ ...labelStyle, marginBottom: '12px' }}>
                  {t('buildings.selectBuildings')}
                </label>
                {availableBuildings.length === 0 ? (
                  <p style={{ color: '#9ca3af', fontSize: '14px', margin: 0 }}>
                    {t('buildings.noAvailableBuildings')}
                  </p>
                ) : (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    maxHeight: '200px',
                    overflowY: 'auto'
                  }}>
                    {availableBuildings.map(b => (
                      <label
                        key={b.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          cursor: 'pointer',
                          padding: '8px 10px',
                          borderRadius: '8px',
                          transition: 'background-color 0.15s'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f9fafb'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                      >
                        <div style={{
                          width: '18px',
                          height: '18px',
                          borderRadius: '5px',
                          border: `2px solid ${(formData.group_buildings || []).includes(b.id) ? '#667eea' : '#d1d5db'}`,
                          backgroundColor: (formData.group_buildings || []).includes(b.id) ? '#667eea' : 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.2s',
                          flexShrink: 0
                        }}>
                          {(formData.group_buildings || []).includes(b.id) && (
                            <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                              <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </div>
                        <input
                          type="checkbox"
                          checked={(formData.group_buildings || []).includes(b.id)}
                          onChange={() => toggleGroupBuilding(b.id)}
                          style={{ display: 'none' }}
                        />
                        <span style={{ fontSize: '14px', color: '#374151' }}>{b.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            {!formData.is_group && (
              <>
                {/* Address section */}
                <div style={{
                  marginBottom: '20px',
                  padding: '16px',
                  backgroundColor: 'white',
                  borderRadius: '10px',
                  border: '1px solid #e5e7eb'
                }}>
                  <label style={{ ...labelStyle, marginBottom: '12px' }}>
                    {t('common.address')}
                  </label>
                  <input
                    type="text"
                    value={formData.address_street}
                    onChange={(e) =>
                      setFormData({ ...formData, address_street: e.target.value })
                    }
                    placeholder={t('users.street')}
                    style={{ ...inputStyle(isMobile), marginBottom: '8px' }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = '#667eea'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(102,126,234,0.1)'; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = 'none'; }}
                  />
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile ? '1fr' : '1fr 2fr',
                    gap: '8px'
                  }}>
                    <input
                      type="text"
                      value={formData.address_zip}
                      onChange={(e) =>
                        setFormData({ ...formData, address_zip: e.target.value })
                      }
                      placeholder={t('users.zip')}
                      style={inputStyle(isMobile)}
                      onFocus={(e) => { e.currentTarget.style.borderColor = '#667eea'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(102,126,234,0.1)'; }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = 'none'; }}
                    />
                    <input
                      type="text"
                      value={formData.address_city}
                      onChange={(e) =>
                        setFormData({ ...formData, address_city: e.target.value })
                      }
                      placeholder={t('users.city')}
                      style={inputStyle(isMobile)}
                      onFocus={(e) => { e.currentTarget.style.borderColor = '#667eea'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(102,126,234,0.1)'; }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = 'none'; }}
                    />
                  </div>
                </div>

                {/* Apartment Management Toggle */}
                <div style={{
                  marginBottom: '20px',
                  padding: '14px 16px',
                  backgroundColor: 'white',
                  borderRadius: '10px',
                  border: '1px solid #e5e7eb'
                }}>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    cursor: 'pointer'
                  }}>
                    <div style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '6px',
                      border: `2px solid ${formData.has_apartments ? '#667eea' : '#d1d5db'}`,
                      backgroundColor: formData.has_apartments ? '#667eea' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.2s',
                      flexShrink: 0
                    }}>
                      {formData.has_apartments && (
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                    <input
                      type="checkbox"
                      checked={formData.has_apartments}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          has_apartments: e.target.checked,
                          floors_config: e.target.checked ? formData.floors_config : []
                        })
                      }
                      style={{ display: 'none' }}
                    />
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '14px', color: '#1f2937' }}>
                        <Home size={14} style={{ marginRight: '6px', verticalAlign: '-2px' }} />
                        {t('buildings.apartmentConfig.enable')}
                      </div>
                      <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                        {t('buildings.apartmentConfig.enableDescription')}
                      </div>
                    </div>
                  </label>
                  {!formData.has_apartments && (
                    <p style={{
                      fontSize: '11px',
                      color: '#9ca3af',
                      marginTop: '8px',
                      marginLeft: '30px',
                      fontStyle: 'italic',
                      margin: '8px 0 0 30px'
                    }}>
                      {t('buildings.apartmentConfig.singleFamilyHint')}
                    </p>
                  )}
                </div>

                {/* LEGO-Style Apartment Builder */}
                {formData.has_apartments && (
                  <LegoApartmentBuilder
                    formData={formData}
                    setFormData={setFormData}
                    isMobile={isMobile}
                  />
                )}
              </>
            )}

            {/* Notes */}
            <div style={{
              marginBottom: '0',
              padding: '16px',
              backgroundColor: 'white',
              borderRadius: '10px',
              border: '1px solid #e5e7eb'
            }}>
              <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                <FileText size={14} color="#6b7280" />
                {t('common.notes')}
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                style={{
                  ...inputStyle(isMobile),
                  fontFamily: 'inherit',
                  resize: 'vertical',
                  minHeight: '80px'
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = '#667eea'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(102,126,234,0.1)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = 'none'; }}
              />
            </div>
          </form>
        </div>

        {/* Footer buttons */}
        <div style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          gap: '10px',
          padding: isMobile ? '16px 20px' : '16px 30px',
          backgroundColor: 'white',
          borderTop: '1px solid #f0f0f0'
        }}>
          <button
            type="submit"
            form="building-form"
            style={{
              flex: 1,
              padding: '12px 24px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: '0 2px 8px rgba(102, 126, 234, 0.3)'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(102, 126, 234, 0.3)'; e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            {editingBuilding ? t('common.update') : t('common.create')}
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: isMobile ? 1 : 'none',
              padding: '12px 24px',
              backgroundColor: 'white',
              color: '#6b7280',
              border: '1px solid #e5e7eb',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f9fafb'; e.currentTarget.style.borderColor = '#d1d5db'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'white'; e.currentTarget.style.borderColor = '#e5e7eb'; }}
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Shared styles ──────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '8px',
  fontWeight: '600',
  fontSize: '13px',
  color: '#374151',
  letterSpacing: '0.01em'
};

const inputStyle = (isMobile: boolean): React.CSSProperties => ({
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  fontSize: isMobile ? '16px' : '14px',
  color: '#1f2937',
  backgroundColor: 'white',
  transition: 'border-color 0.2s, box-shadow 0.2s',
  outline: 'none'
});
