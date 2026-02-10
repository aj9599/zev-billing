import { User, Shield, CheckCircle, XCircle, Archive, Edit2, Trash2, Mail, Phone, Building } from 'lucide-react';
import type { User as UserType, Building as BuildingType } from '../../types';
import { filterUsers, getManagedBuildingsNames } from './utils/userUtils';

interface AdminUsersSectionProps {
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

export default function AdminUsersSection({
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
}: AdminUsersSectionProps) {
  const filteredUsers = filterUsers(users, buildings, selectedBuildingId, searchQuery, showArchive);
  const adminUsers = filteredUsers.filter(u => u.user_type === 'administration');

  return (
    <div style={{ marginBottom: '24px' }}>
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
        <Shield size={16} color="#667eea" />
        {t('users.administrationUsers')}
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
          {adminUsers.length}
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
              <th style={thStyle}>{t('users.managedBuildings')}</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {adminUsers.map(user => (
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
                <td style={{ ...tdStyle, fontSize: '12px', color: '#6b7280' }}>
                  {getManagedBuildingsNames(user.managed_buildings, buildings)}
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
        {adminUsers.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
            <User size={24} color="#d1d5db" style={{ marginBottom: '8px' }} />
            <p style={{ margin: 0 }}>{showArchive ? t('users.noArchivedAdminUsers') : t('users.noAdminUsers')}</p>
          </div>
        )}
      </div>

      {/* Mobile Cards */}
      <div className="mobile-cards">
        {adminUsers.map(user => (
          <UserMobileCard
            key={user.id}
            user={user}
            typeBadge={t('users.administration')}
            typeBadgeColor="#667eea"
            typeBadgeBg="#eef2ff"
            extra={
              <div style={{ fontSize: '12px', color: '#667eea', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
                <Building size={13} />
                <strong>{t('users.manages')}:</strong> {getManagedBuildingsNames(user.managed_buildings, buildings)}
              </div>
            }
            handleToggleActive={handleToggleActive}
            handleEdit={handleEdit}
            handleDelete={handleDelete}
            t={t}
          />
        ))}
        {adminUsers.length === 0 && (
          <div style={{ backgroundColor: 'white', padding: '40px 20px', textAlign: 'center', color: '#9ca3af', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            {showArchive ? t('users.noArchivedAdminUsers') : t('users.noAdminUsers')}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Shared sub-components ─────────────────────────────────────────

function ActionBtn({ icon: Icon, color, onClick, title }: { icon: any; color: string; onClick: () => void; title: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: '30px',
        height: '30px',
        borderRadius: '8px',
        border: 'none',
        backgroundColor: `${color}12`,
        color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        transition: 'all 0.2s'
      }}
      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = `${color}22`; }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = `${color}12`; }}
    >
      <Icon size={14} />
    </button>
  );
}

function UserMobileCard({ user, typeBadge, typeBadgeColor, typeBadgeBg, extra, handleToggleActive, handleEdit, handleDelete, t }: {
  user: UserType;
  typeBadge: string;
  typeBadgeColor: string;
  typeBadgeBg: string;
  extra?: React.ReactNode;
  handleToggleActive: (user: UserType) => void;
  handleEdit: (user: UserType) => void;
  handleDelete: (id: number) => void;
  t: (key: string) => string;
}) {
  return (
    <div style={{
      backgroundColor: 'white',
      borderRadius: '12px',
      padding: '14px 16px',
      marginBottom: '8px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
      opacity: user.is_active ? 1 : 0.5,
      transition: 'box-shadow 0.2s'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            {user.is_active ? <CheckCircle size={16} color="#22c55e" /> : <XCircle size={16} color="#ef4444" />}
            <span style={{
              padding: '2px 8px',
              backgroundColor: typeBadgeBg,
              color: typeBadgeColor,
              borderRadius: '4px',
              fontSize: '10px',
              fontWeight: '700'
            }}>
              {typeBadge}
            </span>
          </div>
          <h3 style={{ fontSize: '15px', fontWeight: '600', margin: '0 0 4px 0', color: '#1f2937' }}>
            {user.first_name} {user.last_name}
          </h3>
          <div style={{ fontSize: '12px', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Mail size={12} /> {user.email}
          </div>
          {user.phone && (
            <div style={{ fontSize: '12px', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '5px', marginTop: '3px' }}>
              <Phone size={12} /> {user.phone}
            </div>
          )}
          {extra}
        </div>
        <div style={{ display: 'flex', gap: '4px', flexShrink: 0, marginLeft: '12px' }}>
          <ActionBtn icon={Archive} color="#8b5cf6" onClick={() => handleToggleActive(user)} title={user.is_active ? t('users.deactivate') : t('users.activate')} />
          <ActionBtn icon={Edit2} color="#3b82f6" onClick={() => handleEdit(user)} title={t('common.edit')} />
          <ActionBtn icon={Trash2} color="#ef4444" onClick={() => handleDelete(user.id)} title={t('common.delete')} />
        </div>
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

export { ActionBtn, UserMobileCard };
