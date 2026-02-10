import { X, Home, Calendar, CreditCard, Building, Info, User, Shield } from 'lucide-react';
import type { User as UserType, Building as BuildingType } from '../../types';
import { getAvailableApartments } from './utils/userUtils';

interface UserFormModalProps {
  formData: Partial<UserType>;
  setFormData: (data: Partial<UserType>) => void;
  editingUser: UserType | null;
  buildings: BuildingType[];
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  t: (key: string) => string;
}

export default function UserFormModal({
  formData,
  setFormData,
  editingUser,
  buildings,
  onSubmit,
  onClose,
  t
}: UserFormModalProps) {
  const availableApartments = getAvailableApartments(
    formData.building_id,
    buildings,
    [],
    editingUser?.id
  );

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      padding: '15px',
      backdropFilter: 'blur(4px)'
    }}>
      <div className="modal-content" style={{
        backgroundColor: '#f9fafb', borderRadius: '16px', padding: 0,
        width: '90%', maxWidth: '600px', maxHeight: '90vh', overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
        display: 'flex', flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '20px 24px',
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
              <User size={18} color="white" />
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#1f2937', margin: 0 }}>
              {editingUser ? t('users.editUser') : t('users.addUser')}
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              width: '32px', height: '32px', borderRadius: '8px', border: 'none',
              backgroundColor: '#f3f4f6', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#e5e7eb'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#f3f4f6'; }}
          >
            <X size={18} color="#6b7280" />
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ overflow: 'auto', padding: '20px 24px', flex: 1 }}>
          <form onSubmit={onSubmit} id="user-form">
            {/* User Type Selection */}
            <div style={{
              marginBottom: '16px', padding: '16px',
              backgroundColor: 'white', borderRadius: '10px', border: '1px solid #e5e7eb'
            }}>
              <label style={labelStyle}>{t('users.userType')} *</label>
              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <TypeCard
                  selected={formData.user_type === 'regular'}
                  onClick={() => setFormData({ ...formData, user_type: 'regular' })}
                  icon={<User size={16} />}
                  label={t('users.regular')}
                  color="#10b981"
                />
                <TypeCard
                  selected={formData.user_type === 'administration'}
                  onClick={() => setFormData({ ...formData, user_type: 'administration' })}
                  icon={<Shield size={16} />}
                  label={t('users.administration')}
                  color="#667eea"
                />
              </div>
            </div>

            {/* Active Status */}
            <div style={{
              marginBottom: '16px', padding: '14px 16px',
              backgroundColor: 'white', borderRadius: '10px', border: '1px solid #e5e7eb'
            }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <CustomCheckbox
                  checked={!!formData.is_active}
                  onChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
                <div>
                  <div style={{ fontWeight: '600', fontSize: '14px', color: '#1f2937' }}>{t('users.activeUser')}</div>
                  <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>{t('users.inactiveUserNote')}</div>
                </div>
              </label>
            </div>

            {/* Basic Information */}
            <div style={{
              marginBottom: '16px', padding: '16px',
              backgroundColor: 'white', borderRadius: '10px', border: '1px solid #e5e7eb'
            }}>
              <label style={{ ...labelStyle, marginBottom: '12px' }}>{t('users.firstName')} & {t('users.lastName')}</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <input type="text" required value={formData.first_name}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                    placeholder={t('users.firstName')}
                    style={inputStyle}
                    onFocus={focusHandler} onBlur={blurHandler}
                  />
                </div>
                <div>
                  <input type="text" required value={formData.last_name}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                    placeholder={t('users.lastName')}
                    style={inputStyle}
                    onFocus={focusHandler} onBlur={blurHandler}
                  />
                </div>
              </div>

              <div style={{ marginTop: '10px' }}>
                <input type="email" required value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder={t('common.email') + ' *'}
                  style={inputStyle}
                  onFocus={focusHandler} onBlur={blurHandler}
                />
              </div>
              <div style={{ marginTop: '10px' }}>
                <input type="tel" value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder={t('common.phone')}
                  style={inputStyle}
                  onFocus={focusHandler} onBlur={blurHandler}
                />
              </div>
            </div>

            {/* Building Assignment - Only for Regular Users */}
            {formData.user_type === 'regular' && (
              <>
                {/* Building + Apartment */}
                <div style={{
                  marginBottom: '16px', padding: '16px',
                  backgroundColor: 'white', borderRadius: '10px', border: '1px solid #e5e7eb'
                }}>
                  <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                    <Building size={14} color="#667eea" />
                    {t('users.building')}
                  </label>
                  <select value={formData.building_id || ''} onChange={(e) => {
                    const buildingId = e.target.value ? parseInt(e.target.value) : undefined;
                    setFormData({ ...formData, building_id: buildingId, apartment_unit: '' });
                  }}
                    style={selectStyle}
                    onFocus={focusHandler} onBlur={blurHandler}
                  >
                    <option value="">{t('users.selectBuilding')}</option>
                    {buildings.filter(b => !b.is_group).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '6px' }}>
                    {t('users.canChargeAnywhere')}
                  </div>

                  {/* Apartment Selection */}
                  {formData.building_id && buildings.find(b => b.id === formData.building_id)?.has_apartments && (
                    <div style={{
                      marginTop: '14px',
                      padding: '14px',
                      backgroundColor: '#f0fdf4',
                      borderRadius: '8px',
                      borderLeft: '3px solid #22c55e'
                    }}>
                      <label style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        marginBottom: '8px', fontWeight: '600', fontSize: '13px', color: '#15803d'
                      }}>
                        <Home size={14} />
                        {t('users.apartmentUnit')} *
                      </label>
                      <select
                        value={formData.apartment_unit || ''}
                        onChange={(e) => setFormData({ ...formData, apartment_unit: e.target.value })}
                        required
                        style={{
                          ...selectStyle,
                          borderColor: '#bbf7d0',
                          backgroundColor: 'white'
                        }}
                        onFocus={(e) => { e.currentTarget.style.borderColor = '#22c55e'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(34,197,94,0.1)'; }}
                        onBlur={(e) => { e.currentTarget.style.borderColor = '#bbf7d0'; e.currentTarget.style.boxShadow = 'none'; }}
                      >
                        <option value="">{t('users.selectApartment')}</option>
                        {availableApartments.map(apt => (
                          <option key={apt} value={apt}>{apt}</option>
                        ))}
                        {editingUser?.apartment_unit && formData.apartment_unit === editingUser.apartment_unit && (
                          <option value={editingUser.apartment_unit}>{editingUser.apartment_unit} ({t('users.current')})</option>
                        )}
                      </select>
                      <div style={{
                        marginTop: '8px', fontSize: '12px', color: '#15803d', lineHeight: '1.5',
                        display: 'flex', alignItems: 'flex-start', gap: '6px'
                      }}>
                        <Info size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
                        <span>{t('users.apartmentExplanation')}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Rent Period */}
                <div style={{
                  marginBottom: '16px', padding: '16px',
                  backgroundColor: 'white', borderRadius: '10px', border: '1px solid #e5e7eb'
                }}>
                  <label style={{
                    ...labelStyle,
                    display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px'
                  }}>
                    <Calendar size={14} color="#f59e0b" />
                    {t('users.rentPeriod')} *
                  </label>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: '#6b7280', fontWeight: '500' }}>
                        {t('users.startDate')} *
                      </label>
                      <input
                        type="date" required
                        value={formData.rent_start_date || ''}
                        onChange={(e) => setFormData({ ...formData, rent_start_date: e.target.value })}
                        style={inputStyle}
                        onFocus={focusHandler} onBlur={blurHandler}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: '#6b7280', fontWeight: '500' }}>
                        {t('users.endDate')}
                      </label>
                      <input
                        type="date"
                        value={formData.rent_end_date || ''}
                        onChange={(e) => setFormData({ ...formData, rent_end_date: e.target.value })}
                        placeholder="2099-01-01"
                        style={inputStyle}
                        onFocus={focusHandler} onBlur={blurHandler}
                      />
                    </div>
                  </div>
                  <div style={{
                    marginTop: '10px', fontSize: '12px', color: '#92400e', lineHeight: '1.5',
                    display: 'flex', alignItems: 'flex-start', gap: '6px',
                    padding: '10px', backgroundColor: '#fffbeb', borderRadius: '6px'
                  }}>
                    <Info size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
                    <span>{t('users.rentPeriodExplanation')}</span>
                  </div>
                </div>

                {/* RFID Card IDs */}
                <div style={{
                  marginBottom: '16px', padding: '16px',
                  backgroundColor: 'white', borderRadius: '10px', border: '1px solid #e5e7eb'
                }}>
                  <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                    <CreditCard size={14} color="#667eea" />
                    {t('users.rfidCardIds')}
                  </label>
                  <input
                    type="text"
                    value={formData.charger_ids || ''}
                    onChange={(e) => setFormData({ ...formData, charger_ids: e.target.value })}
                    placeholder="15"
                    style={{ ...inputStyle, fontFamily: 'monospace' }}
                    onFocus={focusHandler} onBlur={blurHandler}
                  />
                  <div style={{ marginTop: '6px', fontSize: '12px', color: '#6b7280', lineHeight: '1.4' }}>
                    <strong>{t('users.rfidImportant')}:</strong> {t('users.rfidEnterNumber')}
                    <br />
                    {t('users.rfidNotChargerId')} ({t('users.rfidOptional')})
                  </div>
                </div>
              </>
            )}

            {/* Managed Buildings - Only for Administration Users */}
            {formData.user_type === 'administration' && (
              <div style={{
                marginBottom: '16px', padding: '16px',
                backgroundColor: 'white', borderRadius: '10px', border: '1px solid #e5e7eb'
              }}>
                <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                  <Building size={14} color="#667eea" />
                  {t('users.managedBuildings')}
                </label>
                <div style={{
                  maxHeight: '200px', overflowY: 'auto', borderRadius: '8px',
                  border: '1px solid #e5e7eb', backgroundColor: '#fafafa'
                }}>
                  {buildings.map(building => (
                    <label key={building.id} style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '10px 12px', cursor: 'pointer',
                      borderBottom: '1px solid #f3f4f6', transition: 'background-color 0.15s'
                    }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0f0ff'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <CustomCheckbox
                        checked={(() => {
                          const managed = formData.managed_buildings || [];
                          const managedArray = Array.isArray(managed) ? managed : [];
                          return managedArray.includes(building.id);
                        })()}
                        onChange={(checked) => {
                          const current = formData.managed_buildings || [];
                          const currentArray: number[] = Array.isArray(current) ? current : [];
                          const updated = checked
                            ? [...currentArray, building.id]
                            : currentArray.filter((id: number) => id !== building.id);
                          setFormData({ ...formData, managed_buildings: updated });
                        }}
                      />
                      <span style={{ fontSize: '14px', color: '#374151' }}>
                        {building.name}
                        {building.is_group && (
                          <span style={{
                            marginLeft: '8px', fontSize: '11px', padding: '2px 6px',
                            backgroundColor: '#f3f4f6', borderRadius: '4px', color: '#6b7280'
                          }}>
                            {t('users.complex')}
                          </span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
                <div style={{ marginTop: '6px', fontSize: '12px', color: '#9ca3af' }}>
                  {t('users.selectManagedBuildings')}
                </div>
              </div>
            )}

            {/* Address */}
            <div style={{
              marginBottom: '16px', padding: '16px',
              backgroundColor: 'white', borderRadius: '10px', border: '1px solid #e5e7eb'
            }}>
              <label style={{ ...labelStyle, marginBottom: '10px' }}>{t('common.address')}</label>
              <input type="text" value={formData.address_street}
                onChange={(e) => setFormData({ ...formData, address_street: e.target.value })}
                placeholder={t('users.street')}
                style={{ ...inputStyle, marginBottom: '8px' }}
                onFocus={focusHandler} onBlur={blurHandler}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <input type="text" value={formData.address_zip}
                  onChange={(e) => setFormData({ ...formData, address_zip: e.target.value })}
                  placeholder={t('users.zip')} style={inputStyle}
                  onFocus={focusHandler} onBlur={blurHandler}
                />
                <input type="text" value={formData.address_city}
                  onChange={(e) => setFormData({ ...formData, address_city: e.target.value })}
                  placeholder={t('users.city')} style={inputStyle}
                  onFocus={focusHandler} onBlur={blurHandler}
                />
              </div>
            </div>

            {/* Bank Details - Only for Regular Users */}
            {formData.user_type === 'regular' && (
              <div style={{
                marginBottom: '16px', padding: '16px',
                backgroundColor: 'white', borderRadius: '10px', border: '1px solid #e5e7eb'
              }}>
                <label style={{ ...labelStyle, marginBottom: '10px' }}>{t('users.bankDetails')}</label>
                <input type="text" value={formData.bank_name}
                  onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                  placeholder={t('users.bankName')}
                  style={{ ...inputStyle, marginBottom: '8px' }}
                  onFocus={focusHandler} onBlur={blurHandler}
                />
                <input type="text" value={formData.bank_iban}
                  onChange={(e) => setFormData({ ...formData, bank_iban: e.target.value })}
                  placeholder={t('users.iban')}
                  style={{ ...inputStyle, marginBottom: '8px', fontFamily: 'monospace' }}
                  onFocus={focusHandler} onBlur={blurHandler}
                />
                <input type="text" value={formData.bank_account_holder}
                  onChange={(e) => setFormData({ ...formData, bank_account_holder: e.target.value })}
                  placeholder={t('users.accountHolder')} style={inputStyle}
                  onFocus={focusHandler} onBlur={blurHandler}
                />
              </div>
            )}

            {/* Invoice Language - Only for Regular Users */}
            {formData.user_type === 'regular' && (
              <div style={{
                marginBottom: '16px', padding: '16px',
                backgroundColor: 'white', borderRadius: '10px', border: '1px solid #e5e7eb'
              }}>
                <label style={{ ...labelStyle, marginBottom: '10px' }}>{t('users.invoiceLanguage')}</label>
                <select
                  value={formData.language || 'de'}
                  onChange={(e) => setFormData({ ...formData, language: e.target.value })}
                  style={selectStyle}
                  onFocus={focusHandler} onBlur={blurHandler}
                >
                  <option value="de">Deutsch</option>
                  <option value="fr">Français</option>
                  <option value="it">Italiano</option>
                  <option value="en">English</option>
                </select>
              </div>
            )}

            {/* Notes */}
            <div style={{
              marginBottom: '0', padding: '16px',
              backgroundColor: 'white', borderRadius: '10px', border: '1px solid #e5e7eb'
            }}>
              <label style={{ ...labelStyle, marginBottom: '10px' }}>{t('common.notes')}</label>
              <textarea value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical', minHeight: '80px' }}
                onFocus={focusHandler} onBlur={blurHandler}
              />
            </div>
          </form>
        </div>

        {/* Footer buttons */}
        <div style={{
          display: 'flex', gap: '10px',
          padding: '16px 24px',
          backgroundColor: 'white',
          borderTop: '1px solid #f0f0f0'
        }}>
          <button type="submit" form="user-form" style={{
            flex: 1, padding: '12px 24px',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white', border: 'none', borderRadius: '10px',
            fontSize: '14px', fontWeight: '600', cursor: 'pointer',
            transition: 'all 0.2s',
            boxShadow: '0 2px 8px rgba(102, 126, 234, 0.3)'
          }}
            onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(102, 126, 234, 0.3)'; e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            {editingUser ? t('common.update') : t('common.create')}
          </button>
          <button type="button" onClick={onClose} style={{
            padding: '12px 24px', backgroundColor: 'white',
            color: '#6b7280', border: '1px solid #e5e7eb', borderRadius: '10px',
            fontSize: '14px', fontWeight: '600', cursor: 'pointer',
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

// ─── Sub-components ─────────────────────────────────────────────────

function TypeCard({ selected, onClick, icon, label, color }: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  color: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: '12px',
        border: `2px solid ${selected ? color : '#e5e7eb'}`,
        backgroundColor: selected ? `${color}08` : 'white',
        borderRadius: '10px',
        cursor: 'pointer',
        transition: 'all 0.2s',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px'
      }}
      onMouseEnter={(e) => { if (!selected) e.currentTarget.style.borderColor = '#d1d5db'; }}
      onMouseLeave={(e) => { if (!selected) e.currentTarget.style.borderColor = '#e5e7eb'; }}
    >
      <span style={{ color: selected ? color : '#9ca3af' }}>{icon}</span>
      <span style={{
        fontWeight: '600',
        fontSize: '14px',
        color: selected ? color : '#6b7280'
      }}>
        {label}
      </span>
    </button>
  );
}

function CustomCheckbox({ checked, onChange }: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div
      onClick={() => onChange(!checked)}
      style={{
        width: '20px', height: '20px', borderRadius: '6px',
        border: `2px solid ${checked ? '#667eea' : '#d1d5db'}`,
        backgroundColor: checked ? '#667eea' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.2s', flexShrink: 0, cursor: 'pointer'
      }}
    >
      {checked && (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
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

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  fontSize: '14px',
  color: '#1f2937',
  backgroundColor: 'white',
  transition: 'border-color 0.2s, box-shadow 0.2s',
  outline: 'none'
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer'
};

const focusHandler = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
  e.currentTarget.style.borderColor = '#667eea';
  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(102,126,234,0.1)';
};

const blurHandler = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
  e.currentTarget.style.borderColor = '#e5e7eb';
  e.currentTarget.style.boxShadow = 'none';
};
