import { useState, useEffect } from 'react';
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
    loadData();
  }, [showArchive]);

  async function loadData() {
    const [usersData, buildingsData] = await Promise.all([
      api.getUsers(undefined, true),
      api.getBuildings()
    ]);
    setUsers(usersData);
    setBuildings(buildingsData);
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

  return (
    <div className="users-container" style={{ width: '100%', maxWidth: '100%' }}>
      <UsersHeader
        showArchive={showArchive}
        setShowArchive={setShowArchive}
        setShowInstructions={setShowInstructions}
        openModal={openModal}
        t={t}
      />

      <BuildingFilterCards
        buildings={buildings}
        users={users}
        selectedBuildingId={selectedBuildingId}
        searchQuery={searchQuery}
        setSelectedBuildingId={setSelectedBuildingId}
        setSearchQuery={setSearchQuery}
        t={t}
      />

      <AdminUsersSection
        users={users}
        buildings={buildings}
        selectedBuildingId={selectedBuildingId}
        searchQuery={searchQuery}
        showArchive={showArchive}
        handleToggleActive={handleToggleActive}
        handleEdit={handleEditUser}
        handleDelete={handleDelete}
        t={t}
      />

      <RegularUsersSection
        users={users}
        buildings={buildings}
        selectedBuildingId={selectedBuildingId}
        searchQuery={searchQuery}
        showArchive={showArchive}
        handleToggleActive={handleToggleActive}
        handleEdit={handleEditUser}
        handleDelete={handleDelete}
        t={t}
      />

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

      <style>{`
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

          .users-container h1 {
            font-size: 24px !important;
          }

          .users-container h1 svg {
            width: 24px !important;
            height: 24px !important;
          }

          .users-container p {
            font-size: 14px !important;
          }

          .modal-content {
            padding: 20px !important;
          }

          .modal-content h2 {
            font-size: 20px !important;
          }

          .form-row {
            grid-template-columns: 1fr !important;
          }

          .button-group {
            flex-direction: column !important;
          }

          .button-group button {
            width: 100% !important;
          }
        }

        @media (max-width: 480px) {
          .users-container h1 {
            font-size: 20px !important;
          }

          .users-container h1 svg {
            width: 20px !important;
            height: 20px !important;
          }

          .modal-content {
            padding: 15px !important;
          }
        }
      `}</style>
    </div>
  );
}