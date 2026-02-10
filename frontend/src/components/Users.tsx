import { useState, useEffect } from 'react';
import { UsersIcon, Shield, UserCheck, Archive } from 'lucide-react';
import { api } from '../api/client';
import type { User as UserType, Building as BuildingType } from '../types';
import { useTranslation } from '../i18n';
import { useUserForm } from './users/hooks/useUserForm';
import { useUserDeletion } from './users/hooks/useUserDeletion';
import { useUserStatus } from './users/hooks/useUserStatus';
import { useUserFilters } from './users/hooks/useUserFilters';
import UsersHeader from './users/UsersHeader';
import BuildingFilterCards from './users/BuildingFilterCards';
import InstructionsModal from './users/InstructionsModal';
import UserFormModal from './users/UserFormModal';
import AdminUsersSection from './users/AdminUsersSection';
import RegularUsersSection from './users/RegularUsersSection';

export default function Users() {
  const { t } = useTranslation();
  const [users, setUsers] = useState<UserType[]>([]);
  const [buildings, setBuildings] = useState<BuildingType[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  const { selectedBuildingId, searchQuery, setSelectedBuildingId, setSearchQuery } = useUserFilters();

  const {
    formData,
    editingUser,
    setFormData,
    setEditingUser,
    handleEdit,
    resetForm,
    handleSubmit: submitForm
  } = useUserForm(loadData);

  const { handleDelete } = useUserDeletion(loadData);
  const { handleToggleActive } = useUserStatus(loadData);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    loadData();
  }, [showArchive]);

  async function loadData() {
    try {
      const [usersData, buildingsData] = await Promise.all([
        api.getUsers(undefined, true),
        api.getBuildings()
      ]);
      setUsers(usersData);
      setBuildings(buildingsData);
    } finally {
      setLoading(false);
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitForm(e, formData, editingUser, buildings, () => {
      setShowModal(false);
      setEditingUser(null);
      resetForm();
    });
  };

  const openModal = () => {
    resetForm();
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingUser(null);
  };

  const handleEditUser = (user: UserType) => {
    handleEdit(user);
    setShowModal(true);
  };

  // Stats
  const activeUsers = users.filter(u => u.is_active);
  const adminCount = activeUsers.filter(u => u.user_type === 'administration').length;
  const regularCount = activeUsers.filter(u => u.user_type === 'regular').length;
  const archivedCount = users.filter(u => !u.is_active).length;

  // Loading skeleton
  if (loading) {
    return (
      <div className="users-container" style={{ width: '100%', maxWidth: '100%' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="u-shimmer" style={{ height: '60px', borderRadius: '12px' }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
            {[1,2,3,4].map(i => (
              <div key={i} className="u-shimmer" style={{ height: '80px', borderRadius: '12px' }} />
            ))}
          </div>
          <div className="u-shimmer" style={{ height: '48px', borderRadius: '12px' }} />
          <div className="u-shimmer" style={{ height: '200px', borderRadius: '12px' }} />
        </div>
        <style>{shimmerCSS}</style>
      </div>
    );
  }

  return (
    <div className="users-container" style={{ width: '100%', maxWidth: '100%' }}>

      {/* Header */}
      <div className="u-fade-in">
        <UsersHeader
          showArchive={showArchive}
          setShowArchive={setShowArchive}
          setShowInstructions={setShowInstructions}
          openModal={openModal}
          isMobile={isMobile}
          t={t}
        />
      </div>

      {/* Stats row */}
      <div className="u-fade-in u-stats-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: '12px',
        marginBottom: '20px',
        animationDelay: '0.05s'
      }}>
        <StatsCard icon={UsersIcon} label={t('users.totalUsers')} value={activeUsers.length} color="#3b82f6" />
        <StatsCard icon={Shield} label={t('users.administrationUsers')} value={adminCount} color="#667eea" />
        <StatsCard icon={UserCheck} label={t('users.regularUsers')} value={regularCount} color="#10b981" />
        <StatsCard icon={Archive} label={t('users.archived')} value={archivedCount} color="#6b7280" />
      </div>

      {/* Search + Building filter */}
      <div className="u-fade-in" style={{ animationDelay: '0.1s' }}>
        <BuildingFilterCards
          buildings={buildings}
          users={users}
          selectedBuildingId={selectedBuildingId}
          searchQuery={searchQuery}
          setSelectedBuildingId={setSelectedBuildingId}
          setSearchQuery={setSearchQuery}
          isMobile={isMobile}
          t={t}
        />
      </div>

      {/* Admin users */}
      <div className="u-fade-in" style={{ animationDelay: '0.15s' }}>
        <AdminUsersSection
          users={users}
          buildings={buildings}
          selectedBuildingId={selectedBuildingId}
          searchQuery={searchQuery}
          showArchive={showArchive}
          handleToggleActive={handleToggleActive}
          handleEdit={handleEditUser}
          handleDelete={handleDelete}
          isMobile={isMobile}
          t={t}
        />
      </div>

      {/* Regular users */}
      <div className="u-fade-in" style={{ animationDelay: '0.2s' }}>
        <RegularUsersSection
          users={users}
          buildings={buildings}
          selectedBuildingId={selectedBuildingId}
          searchQuery={searchQuery}
          showArchive={showArchive}
          handleToggleActive={handleToggleActive}
          handleEdit={handleEditUser}
          handleDelete={handleDelete}
          isMobile={isMobile}
          t={t}
        />
      </div>

      {/* Modals */}
      {showInstructions && (
        <InstructionsModal
          onClose={() => setShowInstructions(false)}
          t={t}
        />
      )}

      {showModal && (
        <UserFormModal
          formData={formData}
          setFormData={setFormData}
          editingUser={editingUser}
          buildings={buildings}
          onSubmit={handleSubmit}
          onClose={closeModal}
          t={t}
        />
      )}

      {/* Styles */}
      <style>{`
        @keyframes u-fadeSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .u-fade-in {
          animation: u-fadeSlideIn 0.4s ease-out both;
        }

        .u-stats-card {
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .u-stats-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.1) !important;
        }

        .u-table-row:hover {
          background-color: #fafafa;
        }

        .u-btn-primary:hover {
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4) !important;
          transform: translateY(-1px);
        }

        .u-btn-secondary:hover {
          background-color: #f9fafb !important;
          border-color: #667eea !important;
        }

        .desktop-table {
          display: block;
        }

        .mobile-cards {
          display: none;
        }

        @media (max-width: 1280px) {
          .desktop-table {
            display: none;
          }
          .mobile-cards {
            display: block;
          }
        }

        @media (max-width: 768px) {
          .u-stats-grid {
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 8px !important;
          }
        }

        @media (max-width: 480px) {
          .u-stats-grid {
            grid-template-columns: 1fr !important;
          }
        }

        ${shimmerCSS}
      `}</style>
    </div>
  );
}

// ─── Stats Card ────────────────────────────────────────────────────

function StatsCard({ icon: Icon, label, value, color }: {
  icon: any;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="u-stats-card" style={{
      backgroundColor: 'white',
      padding: '16px',
      borderRadius: '12px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
      borderLeft: `4px solid ${color}`
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: '500', marginBottom: '4px' }}>
            {label}
          </div>
          <div style={{ fontSize: '24px', fontWeight: '800', color: '#1f2937', lineHeight: 1.1 }}>
            {value}
          </div>
        </div>
        <div style={{
          width: '40px',
          height: '40px',
          borderRadius: '10px',
          backgroundColor: color + '15',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}>
          <Icon size={20} color={color} />
        </div>
      </div>
    </div>
  );
}

const shimmerCSS = `
  @keyframes u-shimmerAnim {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }
  .u-shimmer {
    background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
    background-size: 200% 100%;
    animation: u-shimmerAnim 1.5s infinite;
  }
`;
