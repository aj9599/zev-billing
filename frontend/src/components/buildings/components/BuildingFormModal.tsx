import { X } from 'lucide-react';
import { useTranslation } from '../../../i18n';
import { getAvailableBuildings } from '../utils/buildingUtils';
import LegoApartmentBuilder from './apartments/LegoApartmentBuilder';
import type { Building } from '../../../types';

interface BuildingFormModalProps {
  editingBuilding: Building | null;
  formData: Partial<Building>;
  setFormData: (data: Partial<Building>) => void;
  buildings: Building[];
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
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '15px'
    }}>
      <div
        className="modal-content"
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: isMobile ? '20px' : '30px',
          width: '95%',
          maxWidth: '1200px',
          maxHeight: '90vh',
          overflow: 'auto'
        }}
      >
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px'
        }}>
          <h2 style={{
            fontSize: isMobile ? '20px' : '24px',
            fontWeight: 'bold'
          }}>
            {editingBuilding ? t('buildings.editBuilding') : t('buildings.addBuilding')}
          </h2>
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: 'none',
              cursor: 'pointer'
            }}
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={onSubmit}>
          <div>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontWeight: '500',
              fontSize: '14px'
            }}>
              {t('common.name')} *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ddd',
                borderRadius: '6px',
                fontSize: isMobile ? '16px' : '14px'
              }}
            />
          </div>

          <div style={{ marginTop: '16px' }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer'
            }}>
              <input
                type="checkbox"
                checked={formData.is_group}
                onChange={(e) => setFormData({ ...formData, is_group: e.target.checked })}
              />
              <span style={{ fontWeight: '500', fontSize: '14px' }}>
                {t('buildings.isComplex')}
              </span>
            </label>
          </div>

          {formData.is_group && (
            <div style={{
              marginTop: '16px',
              padding: '16px',
              backgroundColor: '#f9f9f9',
              borderRadius: '6px'
            }}>
              <label style={{
                display: 'block',
                marginBottom: '12px',
                fontWeight: '500',
                fontSize: '14px'
              }}>
                {t('buildings.selectBuildings')}
              </label>
              {availableBuildings.length === 0 ? (
                <p style={{ color: '#999', fontSize: '14px' }}>
                  {t('buildings.noAvailableBuildings')}
                </p>
              ) : (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  maxHeight: '200px',
                  overflowY: 'auto'
                }}>
                  {availableBuildings.map(b => (
                    <label
                      key={b.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        cursor: 'pointer'
                      }}
                    >
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

          {!formData.is_group && (
            <>
              <div style={{ marginTop: '16px' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontWeight: '500',
                  fontSize: '14px'
                }}>
                  {t('common.address')}
                </label>
                <input
                  type="text"
                  value={formData.address_street}
                  onChange={(e) =>
                    setFormData({ ...formData, address_street: e.target.value })
                  }
                  placeholder={t('users.street')}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    marginBottom: '8px',
                    fontSize: isMobile ? '16px' : '14px'
                  }}
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
                    style={{
                      padding: '10px',
                      border: '1px solid #ddd',
                      borderRadius: '6px',
                      fontSize: isMobile ? '16px' : '14px'
                    }}
                  />
                  <input
                    type="text"
                    value={formData.address_city}
                    onChange={(e) =>
                      setFormData({ ...formData, address_city: e.target.value })
                    }
                    placeholder={t('users.city')}
                    style={{
                      padding: '10px',
                      border: '1px solid #ddd',
                      borderRadius: '6px',
                      fontSize: isMobile ? '16px' : '14px'
                    }}
                  />
                </div>
              </div>

              {/* Apartment Management Toggle */}
              <div style={{ marginTop: '16px' }}>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer'
                }}>
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
                  />
                  <span style={{
                    fontWeight: '600',
                    fontSize: '14px',
                    color: '#0369a1'
                  }}>
                    {t('buildings.apartmentConfig.enable')}
                  </span>
                </label>
                <p style={{
                  fontSize: '12px',
                  color: '#0369a1',
                  marginTop: '4px',
                  marginLeft: '28px'
                }}>
                  {t('buildings.apartmentConfig.enableDescription')}
                </p>
                {!formData.has_apartments && (
                  <p style={{
                    fontSize: '11px',
                    color: '#6b7280',
                    marginTop: '4px',
                    marginLeft: '28px',
                    fontStyle: 'italic'
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

          <div style={{ marginTop: '16px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontWeight: '500',
              fontSize: '14px'
            }}>
              {t('common.notes')}
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ddd',
                borderRadius: '6px',
                fontFamily: 'inherit',
                fontSize: isMobile ? '16px' : '14px'
              }}
            />
          </div>

          <div
            className="button-group"
            style={{
              display: 'flex',
              flexDirection: isMobile ? 'column' : 'row',
              gap: '12px',
              marginTop: '24px'
            }}
          >
            <button
              type="submit"
              style={{
                flex: 1,
                padding: '12px',
                backgroundColor: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              {editingBuilding ? t('common.update') : t('common.create')}
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: '12px',
                backgroundColor: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              {t('common.cancel')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}