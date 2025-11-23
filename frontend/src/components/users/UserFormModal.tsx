import { X, Home, Calendar, CreditCard, Building, Info } from 'lucide-react';
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
    [], // We'll need to pass users from parent if needed
    editingUser?.id
  );

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      padding: '15px'
    }}>
      <div className="modal-content" style={{
        backgroundColor: 'white', borderRadius: '12px', padding: '30px',
        width: '90%', maxWidth: '600px', maxHeight: '90vh', overflow: 'auto'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold' }}>
            {editingUser ? t('users.editUser') : t('users.addUser')}
          </h2>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        <form onSubmit={onSubmit}>
          {/* User Type Selection */}
          <div style={{ marginBottom: '20px', padding: '16px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
            <label style={{ display: 'block', marginBottom: '12px', fontWeight: '600', fontSize: '14px', color: '#111827' }}>
              {t('users.userType')} *
            </label>
            <div style={{ display: 'flex', gap: '12px' }}>
              <label style={{
                flex: 1,
                padding: '12px',
                border: `2px solid ${formData.user_type === 'regular' ? '#15803d' : '#e5e7eb'}`,
                backgroundColor: formData.user_type === 'regular' ? '#f0fdf4' : 'white',
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}>
                <input
                  type="radio"
                  name="user_type"
                  value="regular"
                  checked={formData.user_type === 'regular'}
                  onChange={() => setFormData({ ...formData, user_type: 'regular' })}
                  style={{ marginRight: '8px' }}
                />
                <span style={{ fontWeight: '500', color: formData.user_type === 'regular' ? '#15803d' : '#374151' }}>
                  {t('users.regular')}
                </span>
              </label>
              <label style={{
                flex: 1,
                padding: '12px',
                border: `2px solid ${formData.user_type === 'administration' ? '#0369a1' : '#e5e7eb'}`,
                backgroundColor: formData.user_type === 'administration' ? '#f0f9ff' : 'white',
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}>
                <input
                  type="radio"
                  name="user_type"
                  value="administration"
                  checked={formData.user_type === 'administration'}
                  onChange={() => setFormData({ ...formData, user_type: 'administration' })}
                  style={{ marginRight: '8px' }}
                />
                <span style={{ fontWeight: '500', color: formData.user_type === 'administration' ? '#0369a1' : '#374151' }}>
                  {t('users.administration')}
                </span>
              </label>
            </div>
          </div>

          {/* Active Status */}
          <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#f9fafb', borderRadius: '6px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              />
              <span style={{ fontWeight: '500', fontSize: '14px' }}>{t('users.activeUser')}</span>
            </label>
            <small style={{ display: 'block', marginTop: '4px', marginLeft: '28px', color: '#6b7280', fontSize: '12px' }}>
              {t('users.inactiveUserNote')}
            </small>
          </div>

          {/* Basic Information */}
          <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>{t('users.firstName')} *</label>
              <input type="text" required value={formData.first_name} onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>{t('users.lastName')} *</label>
              <input type="text" required value={formData.last_name} onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
            </div>
          </div>

          <div style={{ marginTop: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>{t('common.email')} *</label>
            <input type="email" required value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
          </div>

          <div style={{ marginTop: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>{t('common.phone')}</label>
            <input type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
          </div>

          {/* Building Assignment - Only for Regular Users */}
          {formData.user_type === 'regular' && (
            <>
              <div style={{ marginTop: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>{t('users.building')}</label>
                <select value={formData.building_id || ''} onChange={(e) => {
                  const buildingId = e.target.value ? parseInt(e.target.value) : undefined;
                  setFormData({ ...formData, building_id: buildingId, apartment_unit: '' });
                }}
                  style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}>
                  <option value="">{t('users.selectBuilding')}</option>
                  {buildings.filter(b => !b.is_group).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <small style={{ display: 'block', marginTop: '4px', color: '#666', fontSize: '12px' }}>
                  {t('users.canChargeAnywhere')}
                </small>
              </div>

              {/* Apartment Selection */}
              {formData.building_id && buildings.find(b => b.id === formData.building_id)?.has_apartments && (
                <div style={{
                  marginTop: '16px',
                  padding: '20px',
                  backgroundColor: '#f0fdf4',
                  borderRadius: '8px',
                  border: '2px solid #22c55e',
                  boxShadow: '0 2px 8px rgba(34, 197, 94, 0.1)'
                }}>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '12px',
                    fontWeight: '600',
                    fontSize: '15px',
                    color: '#15803d'
                  }}>
                    <Home size={20} />
                    {t('users.apartmentUnit')} *
                  </label>
                  <select
                    value={formData.apartment_unit || ''}
                    onChange={(e) => setFormData({ ...formData, apartment_unit: e.target.value })}
                    required
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '2px solid #22c55e',
                      borderRadius: '6px',
                      fontSize: '14px',
                      backgroundColor: 'white'
                    }}
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
                    marginTop: '10px',
                    padding: '10px',
                    backgroundColor: '#dcfce7',
                    borderRadius: '6px',
                    fontSize: '13px',
                    color: '#15803d',
                    lineHeight: '1.5'
                  }}>
                    <strong style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Info size={16} />
                      {t('users.apartmentInfo')}
                    </strong>
                    <br />
                    {t('users.apartmentExplanation')}
                  </div>
                </div>
              )}

              {/* Rent Period Section */}
              <div style={{
                marginTop: '16px',
                padding: '20px',
                backgroundColor: '#fef3c7',
                borderRadius: '8px',
                border: '2px solid #f59e0b',
                boxShadow: '0 2px 8px rgba(245, 158, 11, 0.1)'
              }}>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '12px',
                  fontWeight: '600',
                  fontSize: '15px',
                  color: '#92400e'
                }}>
                  <Calendar size={20} />
                  {t('users.rentPeriod')} *
                </label>

                <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                      {t('users.startDate')} *
                    </label>
                    <input
                      type="date"
                      required
                      value={formData.rent_start_date || ''}
                      onChange={(e) => setFormData({ ...formData, rent_start_date: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '2px solid #f59e0b',
                        borderRadius: '6px',
                        fontSize: '14px',
                        backgroundColor: 'white'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                      {t('users.endDate')}
                    </label>
                    <input
                      type="date"
                      value={formData.rent_end_date || ''}
                      onChange={(e) => setFormData({ ...formData, rent_end_date: e.target.value })}
                      placeholder="2099-01-01"
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '2px solid #f59e0b',
                        borderRadius: '6px',
                        fontSize: '14px',
                        backgroundColor: 'white'
                      }}
                    />
                  </div>
                </div>

                <div style={{
                  marginTop: '10px',
                  padding: '10px',
                  backgroundColor: '#fef3c7',
                  borderRadius: '6px',
                  fontSize: '13px',
                  color: '#92400e',
                  lineHeight: '1.5'
                }}>
                  <strong style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Info size={16} />
                    {t('users.rentPeriodInfo')}
                  </strong>
                  <br />
                  {t('users.rentPeriodExplanation')}
                </div>
              </div>

              {/* RFID Card IDs */}
              <div style={{ marginTop: '16px', padding: '16px', backgroundColor: '#f0f9ff', borderRadius: '8px', border: '1px solid #bae6fd' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontWeight: '600', fontSize: '14px', color: '#0369a1' }}>
                  <CreditCard size={18} />
                  {t('users.rfidCardIds')}
                </label>
                <input
                  type="text"
                  value={formData.charger_ids || ''}
                  onChange={(e) => setFormData({ ...formData, charger_ids: e.target.value })}
                  placeholder="15"
                  style={{ width: '100%', padding: '10px', border: '1px solid #bae6fd', borderRadius: '6px', fontFamily: 'monospace' }}
                />
                <small style={{ display: 'block', marginTop: '6px', color: '#0369a1', fontSize: '12px', lineHeight: '1.4' }}>
                  <strong>{t('users.rfidImportant')}:</strong> {t('users.rfidEnterNumber')}
                  <br />
                  {t('users.rfidNotChargerId')} ({t('users.rfidOptional')})
                </small>
              </div>
            </>
          )}

          {/* Managed Buildings - Only for Administration Users */}
          {formData.user_type === 'administration' && (
            <div style={{ marginTop: '16px', padding: '16px', backgroundColor: '#f0f9ff', borderRadius: '8px', border: '1px solid #bae6fd' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontWeight: '600', fontSize: '14px', color: '#0369a1' }}>
                <Building size={18} />
                {t('users.managedBuildings')}
              </label>
              <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #bae6fd', borderRadius: '6px', padding: '8px', backgroundColor: 'white' }}>
                {buildings.map(building => (
                  <label key={building.id} style={{ display: 'block', padding: '8px', cursor: 'pointer', borderRadius: '4px' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0f9ff'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <input
                      type="checkbox"
                      checked={(() => {
                        const managed = formData.managed_buildings || [];
                        const managedArray = Array.isArray(managed) ? managed : [];
                        return managedArray.includes(building.id);
                      })()}
                      onChange={(e) => {
                        const current = formData.managed_buildings || [];
                        const currentArray: number[] = Array.isArray(current) ? current : [];
                        const updated = e.target.checked
                          ? [...currentArray, building.id]
                          : currentArray.filter((id: number) => id !== building.id);
                        setFormData({ ...formData, managed_buildings: updated });
                      }}
                      style={{ marginRight: '8px' }}
                    />
                    <span style={{ fontSize: '14px' }}>
                      {building.name}
                      {building.is_group && <span style={{ marginLeft: '6px', fontSize: '12px', color: '#6b7280' }}>({t('users.complex')})</span>}
                    </span>
                  </label>
                ))}
              </div>
              <small style={{ display: 'block', marginTop: '6px', color: '#0369a1', fontSize: '12px' }}>
                {t('users.selectManagedBuildings')}
              </small>
            </div>
          )}

          {/* Address */}
          <div style={{ marginTop: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>{t('common.address')}</label>
            <input type="text" value={formData.address_street} onChange={(e) => setFormData({ ...formData, address_street: e.target.value })}
              placeholder={t('users.street')} style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', marginBottom: '8px' }} />
            <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <input type="text" value={formData.address_zip} onChange={(e) => setFormData({ ...formData, address_zip: e.target.value })}
                placeholder={t('users.zip')} style={{ padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
              <input type="text" value={formData.address_city} onChange={(e) => setFormData({ ...formData, address_city: e.target.value })}
                placeholder={t('users.city')} style={{ padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
            </div>
          </div>

          {/* Bank Details - Only for Regular Users */}
          {formData.user_type === 'regular' && (
            <div style={{ marginTop: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>{t('users.bankDetails')}</label>
              <input type="text" value={formData.bank_name} onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                placeholder={t('users.bankName')} style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', marginBottom: '8px' }} />
              <input type="text" value={formData.bank_iban} onChange={(e) => setFormData({ ...formData, bank_iban: e.target.value })}
                placeholder={t('users.iban')} style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', marginBottom: '8px' }} />
              <input type="text" value={formData.bank_account_holder} onChange={(e) => setFormData({ ...formData, bank_account_holder: e.target.value })}
                placeholder={t('users.accountHolder')} style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
            </div>
          )}

          {/* Invoice Language - Only for Regular Users */}
          {formData.user_type === 'regular' && (
            <div style={{ marginTop: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>{t('users.invoiceLanguage')}</label>
              <select
                value={formData.language || 'de'}
                onChange={(e) => setFormData({ ...formData, language: e.target.value })}
                style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}
              >
                <option value="de">🇨🇭 Deutsch</option>
                <option value="fr">🇫🇷 Français</option>
                <option value="it">🇮🇹 Italiano</option>
                <option value="en">🇬🇧 English</option>
              </select>
            </div>
          )}

          {/* Notes */}
          <div style={{ marginTop: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>{t('common.notes')}</label>
            <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3} style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontFamily: 'inherit' }} />
          </div>

          {/* Buttons */}
          <div className="button-group" style={{ display: 'flex', gap: '12px', marginTop: '24px', flexWrap: 'wrap' }}>
            <button type="submit" style={{
              flex: 1, minWidth: '120px', padding: '12px', backgroundColor: '#007bff', color: 'white',
              border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '500', cursor: 'pointer'
            }}>
              {editingUser ? t('common.update') : t('common.create')}
            </button>
            <button type="button" onClick={onClose} style={{
              flex: 1, minWidth: '120px', padding: '12px', backgroundColor: '#6c757d', color: 'white',
              border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '500', cursor: 'pointer'
            }}>
              {t('common.cancel')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}