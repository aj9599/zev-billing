import { UsersIcon, CheckCircle, XCircle, MapPin, CreditCard, Home, Calendar } from 'lucide-react';
import type { User as UserType, Building as BuildingType } from '../../types';
import { filterUsers, getBuildingName } from './utils/userUtils';
import { formatRentPeriod } from './utils/dateUtils';
import { ActionBtn, UserMobileCard } from './AdminUsersSection';

interface RegularUsersSectionProps {
  users: UserType[];
  buildings: BuildingType[];
  selectedBuildingId: number | 'all';
  searchQuery: string;
  showArchive: boolean;
  handleToggleActive: (user: UserType) => void;
  handleEdit: (user: UserType) => void;
  handleDelete: (id: number) => void;
  isMobile: boolean;
  t: (key: string) => string;
}

export default function RegularUsersSection({
  users,
  buildings,
  selectedBuildingId,
  searchQuery,
  showArchive,
  handleToggleActive,
  handleEdit,
  handleDelete,
  isMobile,
  t
}: RegularUsersSectionProps) {
  const filteredUsers = filterUsers(users, buildings, selectedBuildingId, searchQuery, showArchive);
  const regularUsers = filteredUsers.filter(u => u.user_type === 'regular');

  return (
    <div>
      {/* Section header */}
      <h2 style={{
        fontSize: isMobile ? '14px' : '15px',
        fontWeight: '700',
        marginBottom: '12px',
        color: '#374151',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        textTransform: 'uppercase',
        letterSpacing: '0.5px'
      }}>
        <UsersIcon size={16} color="#10b981" />
        {t('users.regularUsers')}
        <span style={{
          fontSize: '11px',
          fontWeight: '600',
          padding: '2px 8px',
          backgroundColor: '#f3f4f6',
          borderRadius: '10px',
          color: '#6b7280',
          textTransform: 'none',
          letterSpacing: '0'
        }}>
          {regularUsers.length}
        </span>
      </h2>

      {/* Desktop Table */}
      <div className="desktop-table" style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        overflow: 'hidden'
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
              <th style={thStyle}>{t('users.status')}</th>
              <th style={thStyle}>{t('common.name')}</th>
              <th style={thStyle}>{t('common.email')}</th>
              <th style={thStyle}>{t('users.apartment')}</th>
              <th style={thStyle}>{t('users.rentPeriod')}</th>
              <th style={thStyle}>{t('users.rfidCards')}</th>
              <th style={thStyle}>{t('users.building')}</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {regularUsers.map(user => (
              <tr
                key={user.id}
                className="u-table-row"
                style={{
                  borderBottom: '1px solid #f9fafb',
                  opacity: user.is_active ? 1 : 0.5,
                  transition: 'background-color 0.15s'
                }}
              >
                <td style={tdStyle}>
                  {user.is_active ? (
                    <CheckCircle size={18} color="#22c55e" />
                  ) : (
                    <XCircle size={18} color="#ef4444" />
                  )}
                </td>
                <td style={tdStyle}>
                  <span style={{ fontWeight: '600', color: '#1f2937' }}>
                    {user.first_name} {user.last_name}
                  </span>
                </td>
                <td style={{ ...tdStyle, color: '#6b7280', fontSize: '13px' }}>{user.email}</td>
                <td style={tdStyle}>
                  {user.apartment_unit ? (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '3px 8px',
                      backgroundColor: '#f0fdf4',
                      color: '#15803d',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: '600'
                    }}>
                      <Home size={12} />
                      {user.apartment_unit}
                    </span>
                  ) : <span style={{ color: '#d1d5db' }}>—</span>}
                </td>
                <td style={{ ...tdStyle, fontSize: '12px' }}>
                  {user.rent_start_date ? (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '3px 8px',
                      backgroundColor: '#fef3c7',
                      color: '#92400e',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: '600'
                    }}>
                      <Calendar size={11} />
                      {formatRentPeriod(user.rent_start_date, user.rent_end_date)}
                    </span>
                  ) : (
                    <span style={{ color: '#ef4444', fontSize: '11px', fontWeight: '600' }}>
                      {t('users.notSet')}
                    </span>
                  )}
                </td>
                <td style={tdStyle}>
                  {user.charger_ids ? (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '3px 8px',
                      backgroundColor: '#eef2ff',
                      color: '#4338ca',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: '600',
                      fontFamily: 'monospace'
                    }}>
                      <CreditCard size={11} />
                      {user.charger_ids}
                    </span>
                  ) : <span style={{ color: '#d1d5db' }}>—</span>}
                </td>
                <td style={{ ...tdStyle, fontSize: '13px', color: '#6b7280' }}>
                  {getBuildingName(user.building_id, buildings)}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                    <ActionBtn
                      icon={Archive}
                      color="#8b5cf6"
                      onClick={() => handleToggleActive(user)}
                      title={user.is_active ? t('users.deactivate') : t('users.activate')}
                    />
                    <ActionBtn icon={Edit2} color="#3b82f6" onClick={() => handleEdit(user)} title={t('common.edit')} />
                    <ActionBtn icon={Trash2} color="#ef4444" onClick={() => handleDelete(user.id)} title={t('common.delete')} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {regularUsers.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
            <UsersIcon size={24} color="#d1d5db" style={{ marginBottom: '8px' }} />
            <p style={{ margin: 0 }}>{showArchive ? t('users.noArchivedRegularUsers') : t('users.noRegularUsers')}</p>
          </div>
        )}
      </div>

      {/* Mobile Cards */}
      <div className="mobile-cards">
        {regularUsers.map(user => (
          <UserMobileCard
            key={user.id}
            user={user}
            typeBadge={t('users.regular')}
            typeBadgeColor="#15803d"
            typeBadgeBg="#f0fdf4"
            extra={
              <>
                {user.apartment_unit && (
                  <div style={{ fontSize: '12px', color: '#15803d', display: 'flex', alignItems: 'center', gap: '5px', marginTop: '4px' }}>
                    <Home size={12} /> {user.apartment_unit}
                  </div>
                )}
                {user.rent_start_date && (
                  <div style={{ fontSize: '12px', color: '#92400e', display: 'flex', alignItems: 'center', gap: '5px', marginTop: '3px' }}>
                    <Calendar size={12} /> {formatRentPeriod(user.rent_start_date, user.rent_end_date)}
                  </div>
                )}
                {user.charger_ids && (
                  <div style={{ fontSize: '12px', color: '#4338ca', display: 'flex', alignItems: 'center', gap: '5px', marginTop: '3px' }}>
                    <CreditCard size={12} /> {user.charger_ids}
                  </div>
                )}
                {user.building_id && (
                  <div style={{ fontSize: '12px', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '5px', marginTop: '3px' }}>
                    <MapPin size={12} /> {getBuildingName(user.building_id, buildings)}
                  </div>
                )}
              </>
            }
            handleToggleActive={handleToggleActive}
            handleEdit={handleEdit}
            handleDelete={handleDelete}
            t={t}
          />
        ))}
        {regularUsers.length === 0 && (
          <div style={{ backgroundColor: 'white', padding: '40px 20px', textAlign: 'center', color: '#9ca3af', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            {showArchive ? t('users.noArchivedRegularUsers') : t('users.noRegularUsers')}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Table styles ──────────────────────────────────────────────────

const thStyle: React.CSSProperties = {
  padding: '12px 16px',
  textAlign: 'left',
  fontWeight: '600',
  fontSize: '12px',
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: '0.5px'
};

const tdStyle: React.CSSProperties = {
  padding: '12px 16px'
};
