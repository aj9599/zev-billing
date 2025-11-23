import { User, CheckCircle, XCircle, Archive, Edit2, Trash2, Mail, Phone, Building } from 'lucide-react';
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
  t
}: AdminUsersSectionProps) {
  const filteredUsers = filterUsers(users, buildings, selectedBuildingId, searchQuery, showArchive);
  const adminUsers = filteredUsers.filter(u => u.user_type === 'administration');

  return (
    <div style={{ marginBottom: '30px' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        marginBottom: '15px',
        padding: '12px 16px',
        backgroundColor: '#f0f9ff',
        borderRadius: '8px',
        border: '1px solid #bae6fd'
      }}>
        <User size={20} style={{ color: '#0369a1' }} />
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#0369a1', margin: 0 }}>
            {t('users.administrationUsers')}
          </h2>
          <p style={{ fontSize: '13px', color: '#0c4a6e', margin: '2px 0 0 0' }}>
            {t('users.adminDescription')}
          </p>
        </div>
      </div>

      {/* Desktop Table */}
      <div className="desktop-table" style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
        <table style={{ width: '100%' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '1px solid #eee' }}>
              <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>{t('users.status')}</th>
              <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>{t('common.name')}</th>
              <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>{t('common.email')}</th>
              <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>{t('users.managedBuildings')}</th>
              <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {adminUsers.map(user => (
              <tr key={user.id} style={{ borderBottom: '1px solid #eee', opacity: user.is_active ? 1 : 0.5 }}>
                <td style={{ padding: '16px' }}>
                  <span title={user.is_active ? t('users.activeStatus') : t('users.inactiveStatus')}>
                    {user.is_active ? (
                      <CheckCircle size={20} color="#22c55e" />
                    ) : (
                      <XCircle size={20} color="#ef4444" />
                    )}
                  </span>
                </td>
                <td style={{ padding: '16px' }}>{user.first_name} {user.last_name}</td>
                <td style={{ padding: '16px' }}>{user.email}</td>
                <td style={{ padding: '16px', fontSize: '13px', color: '#6b7280' }}>
                  {getManagedBuildingsNames(user.managed_buildings, buildings)}
                </td>
                <td style={{ padding: '16px' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => handleToggleActive(user)}
                      style={{ padding: '6px', border: 'none', background: 'none', cursor: 'pointer' }}
                      title={user.is_active ? t('users.deactivate') : t('users.activate')}
                    >
                      <Archive size={16} color="#8b5cf6" />
                    </button>
                    <button onClick={() => handleEdit(user)} style={{ padding: '6px', border: 'none', background: 'none', cursor: 'pointer' }}>
                      <Edit2 size={16} color="#007bff" />
                    </button>
                    <button onClick={() => handleDelete(user.id)} style={{ padding: '6px', border: 'none', background: 'none', cursor: 'pointer' }}>
                      <Trash2 size={16} color="#dc3545" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {adminUsers.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: '#999' }}>
            {showArchive ? t('users.noArchivedAdminUsers') : t('users.noAdminUsers')}
          </div>
        )}
      </div>

      {/* Mobile Cards */}
      <div className="mobile-cards">
        {adminUsers.map(user => (
          <div key={user.id} style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '16px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            opacity: user.is_active ? 1 : 0.5
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  {user.is_active ? (
                    <CheckCircle size={18} color="#22c55e" />
                  ) : (
                    <XCircle size={18} color="#ef4444" />
                  )}
                  <div style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    backgroundColor: '#f0f9ff',
                    color: '#0369a1',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: '600'
                  }}>
                    {t('users.administration')}
                  </div>
                </div>
                <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '4px', color: '#1f2937' }}>
                  {user.first_name} {user.last_name}
                </h3>
                <div style={{ fontSize: '13px', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <Mail size={14} />
                  {user.email}
                </div>
                {user.phone && (
                  <div style={{ fontSize: '13px', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                    <Phone size={14} />
                    {user.phone}
                  </div>
                )}
                <div style={{ fontSize: '13px', color: '#0369a1', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px' }}>
                  <Building size={14} />
                  <strong>{t('users.manages')}:</strong> {getManagedBuildingsNames(user.managed_buildings, buildings)}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button onClick={() => handleToggleActive(user)} style={{ padding: '8px', border: 'none', background: 'rgba(139, 92, 246, 0.1)', borderRadius: '6px', cursor: 'pointer' }}>
                  <Archive size={16} color="#8b5cf6" />
                </button>
                <button onClick={() => handleEdit(user)} style={{ padding: '8px', border: 'none', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '6px', cursor: 'pointer' }}>
                  <Edit2 size={16} color="#3b82f6" />
                </button>
                <button onClick={() => handleDelete(user.id)} style={{ padding: '8px', border: 'none', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '6px', cursor: 'pointer' }}>
                  <Trash2 size={16} color="#ef4444" />
                </button>
              </div>
            </div>
          </div>
        ))}
        {adminUsers.length === 0 && (
          <div style={{ backgroundColor: 'white', padding: '40px 20px', textAlign: 'center', color: '#999', borderRadius: '12px' }}>
            {showArchive ? t('users.noArchivedAdminUsers') : t('users.noAdminUsers')}
          </div>
        )}
      </div>
    </div>
  );
}