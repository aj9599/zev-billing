import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, X, Users as UsersIcon, Mail, Phone, MapPin, CreditCard, Search, Building, User, HelpCircle, Archive, CheckCircle, XCircle, Home, Calendar } from 'lucide-react';
import { api } from '../api/client';
import type { User as UserType, Building as BuildingType } from '../types';
import { useTranslation } from '../i18n';

export default function Users() {
  const { t } = useTranslation();
  const [users, setUsers] = useState<UserType[]>([]);
  const [buildings, setBuildings] = useState<BuildingType[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [editingUser, setEditingUser] = useState<UserType | null>(null);
  const [selectedBuildingId, setSelectedBuildingId] = useState<number | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchive, setShowArchive] = useState(false);
  const [formData, setFormData] = useState<Partial<UserType>>({
    first_name: '', last_name: '', email: '', phone: '',
    address_street: '', address_city: '', address_zip: '', address_country: 'Switzerland',
    bank_name: '', bank_iban: '', bank_account_holder: '',
    charger_ids: '', notes: '', building_id: undefined, apartment_unit: '',
    user_type: 'regular',
    managed_buildings: [],
    language: 'de', // Default to German
    is_active: true,
    rent_start_date: '', // NEW: Rent period start date
    rent_end_date: ''    // NEW: Rent period end date
  });

  useEffect(() => {
    loadData();
  }, [showArchive]);

  const loadData = async () => {
    // Always fetch all users (both active and inactive)
    const [usersData, buildingsData] = await Promise.all([
      api.getUsers(undefined, true),  // Fetch all users
      api.getBuildings()
    ]);
    setUsers(usersData);
    setBuildings(buildingsData);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate apartment selection for buildings with apartments
    if (formData.user_type === 'regular' && formData.building_id) {
      const selectedBuilding = buildings.find(b => b.id === formData.building_id);
      if (selectedBuilding?.has_apartments && !formData.apartment_unit) {
        alert(t('users.pleaseSelectApartment'));
        return;
      }
    }
    
    // Validate rent period for regular users
    if (formData.user_type === 'regular' && !formData.rent_start_date) {
      alert(t('users.rentStartDateRequired'));
      return;
    }
    
    try {
      const dataToSend = {
        ...formData,
        managed_buildings: formData.user_type === 'administration' && formData.managed_buildings 
          ? JSON.stringify(formData.managed_buildings)
          : undefined
      };

      if (editingUser) {
        await api.updateUser(editingUser.id, dataToSend);
      } else {
        await api.createUser(dataToSend);
      }
      setShowModal(false);
      setEditingUser(null);
      resetForm();
      loadData();
    } catch (err: any) {
      console.error('Save error:', err);
      alert(err.message || t('users.saveFailed'));
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm(t('users.deleteConfirm'))) {
      try {
        await api.deleteUser(id);
        loadData();
      } catch (err) {
        alert(t('users.deleteFailed'));
      }
    }
  };

  const handleToggleActive = async (user: UserType) => {
    try {
      await api.updateUser(user.id, { ...user, is_active: !user.is_active });
      loadData();
    } catch (err) {
      alert(t('users.updateFailed') || 'Failed to update user status');
    }
  };

  const handleEdit = (user: UserType) => {
    setEditingUser(user);
    let managedBuildingsArray: number[] = [];
    if (user.managed_buildings) {
      try {
        if (typeof user.managed_buildings === 'string') {
          managedBuildingsArray = JSON.parse(user.managed_buildings);
        } else if (Array.isArray(user.managed_buildings)) {
          managedBuildingsArray = user.managed_buildings;
        }
      } catch (e) {
        console.error('Error parsing managed_buildings:', e);
      }
    }
    
    setFormData({
      ...user,
      managed_buildings: managedBuildingsArray,
      rent_start_date: user.rent_start_date || '',
      rent_end_date: user.rent_end_date || '2099-01-01' // Set default end date if missing
    });
    setShowModal(true);
  };

  const resetForm = () => {
    setFormData({
      first_name: '', last_name: '', email: '', phone: '',
      address_street: '', address_city: '', address_zip: '', address_country: 'Switzerland',
      bank_name: '', bank_iban: '', bank_account_holder: '',
      charger_ids: '', notes: '', building_id: undefined, apartment_unit: '',
      user_type: 'regular',
      managed_buildings: [],
      language: 'de',
      is_active: true,
      rent_start_date: '',
      rent_end_date: '2099-01-01' // Set default end date
    });
  };

  const filteredBuildingsForCards = buildings.filter(b =>
    !b.is_group && b.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Helper function to check if user's managed buildings include the selected building
  const userManagesBuilding = (user: UserType, buildingId: number): boolean => {
    if (user.user_type !== 'administration' || !user.managed_buildings) return false;
    
    let managedBuildingIds: number[] = [];
    try {
      if (typeof user.managed_buildings === 'string') {
        managedBuildingIds = JSON.parse(user.managed_buildings);
      } else if (Array.isArray(user.managed_buildings)) {
        managedBuildingIds = user.managed_buildings;
      }
    } catch (e) {
      return false;
    }
    
    // Check if the building is directly managed
    if (managedBuildingIds.includes(buildingId)) return true;
    
    // Check if the user manages a complex that includes this building
    for (const managedId of managedBuildingIds) {
      const managedBuilding = buildings.find(b => b.id === managedId);
      if (managedBuilding && managedBuilding.is_group && managedBuilding.group_buildings) {
        const groupBuildingIds = typeof managedBuilding.group_buildings === 'string' 
          ? JSON.parse(managedBuilding.group_buildings) 
          : managedBuilding.group_buildings;
        if (groupBuildingIds.includes(buildingId)) return true;
      }
    }
    
    return false;
  };

  const filteredUsers = users.filter(user => {
    // Filter by active/inactive status based on showArchive
    const matchesActiveStatus = showArchive ? !user.is_active : user.is_active;
    
    // Filter by building
    let matchesBuilding = false;
    if (selectedBuildingId === 'all') {
      matchesBuilding = true;
    } else if (user.user_type === 'regular') {
      matchesBuilding = user.building_id === selectedBuildingId;
    } else if (user.user_type === 'administration') {
      // For admins, check if they manage this building or a complex containing it
      matchesBuilding = userManagesBuilding(user, selectedBuildingId as number);
    }
    
    // Filter by search query
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = searchQuery === '' || 
      `${user.first_name} ${user.last_name}`.toLowerCase().includes(searchLower) ||
      user.email.toLowerCase().includes(searchLower) ||
      (user.apartment_unit && user.apartment_unit.toLowerCase().includes(searchLower));
    
    return matchesActiveStatus && matchesBuilding && matchesSearch;
  });

  const adminUsers = filteredUsers.filter(u => u.user_type === 'administration');
  const regularUsers = filteredUsers.filter(u => u.user_type === 'regular');

  const getBuildingName = (buildingId?: number) => {
    if (!buildingId) return '-';
    return buildings.find(b => b.id === buildingId)?.name || '-';
  };

  const getManagedBuildingsNames = (managedBuildings?: number[] | string) => {
    let buildingIds: number[] = [];
    
    if (!managedBuildings) return '-';
    
    try {
      if (typeof managedBuildings === 'string') {
        buildingIds = JSON.parse(managedBuildings);
      } else if (Array.isArray(managedBuildings)) {
        buildingIds = managedBuildings;
      }
    } catch (e) {
      return '-';
    }
    
    if (buildingIds.length === 0) return '-';
    return buildingIds.map(id => buildings.find(b => b.id === id)?.name || `ID ${id}`).join(', ');
  };

  const getUserCountForBuilding = (buildingId: number) => {
    return users.filter(u => u.building_id === buildingId && u.is_active).length;
  };

  const getAvailableApartments = (buildingId?: number): string[] => {
    if (!buildingId) return [];
    
    const building = buildings.find(b => b.id === buildingId);
    if (!building || !building.has_apartments || !building.floors_config) return [];
    
    const allApartments: string[] = [];
    building.floors_config.forEach(floor => {
      floor.apartments.forEach(apt => {
        allApartments.push(`${floor.floor_name} - ${apt}`);
      });
    });
    
    // Filter out occupied apartments (only by active users, excluding current user if editing)
    const occupiedApartments = users
      .filter(u => u.building_id === buildingId && u.is_active && u.apartment_unit && u.id !== editingUser?.id)
      .map(u => u.apartment_unit);
    
    return allApartments.filter(apt => !occupiedApartments.includes(apt));
  };

  // Helper function to format rent period display (DD.MM.YYYY format)
  const formatRentPeriod = (startDate?: string, endDate?: string) => {
    if (!startDate) return '-';
    
    const formatDate = (dateStr: string) => {
      const date = new Date(dateStr);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}.${month}.${year}`;
    };
    
    const start = formatDate(startDate);
    
    // Don't show end date if it's the default far future date
    if (!endDate || endDate === '2099-01-01') {
      return `${start} â†’`;
    }
    
    const end = formatDate(endDate);
    return `${start} â†’ ${end}`;
  };

  const InstructionsModal = () => (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', 
      justifyContent: 'center', zIndex: 2000, padding: '20px'
    }}>
      <div style={{
        backgroundColor: 'white', borderRadius: '12px', padding: '30px',
        maxWidth: '700px', maxHeight: '90vh', overflow: 'auto', width: '100%'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold' }}>{t('users.instructions.title')}</h2>
          <button onClick={() => setShowInstructions(false)} 
            style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        <div style={{ lineHeight: '1.8', color: '#374151' }}>
          <div style={{ backgroundColor: '#f0fdf4', padding: '16px', borderRadius: '8px', marginBottom: '16px', border: '2px solid #22c55e' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '10px', color: '#1f2937', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <UsersIcon size={20} color="#22c55e" />
              {t('users.instructions.whatIsRegularUser')}
            </h3>
            <p>{t('users.instructions.regularUserDescription')}</p>
          </div>

          <div style={{ backgroundColor: '#f0f9ff', padding: '16px', borderRadius: '8px', marginBottom: '16px', border: '2px solid #3b82f6' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '10px', color: '#1f2937', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <User size={20} color="#3b82f6" />
              {t('users.instructions.whatIsAdminUser')}
            </h3>
            <p>{t('users.instructions.adminUserDescription')}</p>
          </div>

          <div style={{ backgroundColor: '#fef3c7', padding: '16px', borderRadius: '8px', marginBottom: '16px', border: '2px solid #f59e0b' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '10px', color: '#1f2937', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Home size={20} color="#f59e0b" />
              {t('users.instructions.apartmentsAndStatus')}
            </h3>
            <p>{t('users.instructions.apartmentsAndStatusDescription')}</p>
          </div>

          <h3 style={{ fontSize: '18px', fontWeight: '600', marginTop: '20px', marginBottom: '10px', color: '#1f2937' }}>
            {t('users.instructions.howToUse')}
          </h3>
          <ul style={{ marginLeft: '20px' }}>
            <li>{t('users.instructions.step1')}</li>
            <li>{t('users.instructions.step2')}</li>
            <li>{t('users.instructions.step3')}</li>
            <li>{t('users.instructions.step4')}</li>
            <li>{t('users.instructions.step5')}</li>
            <li>{t('users.instructions.step6')}</li>
            <li>{t('users.instructions.step7')}</li>
          </ul>

          <div style={{ backgroundColor: '#fef3c7', padding: '16px', borderRadius: '8px', marginTop: '16px', border: '1px solid #f59e0b' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px', color: '#1f2937' }}>
              {t('users.instructions.rfidTitle')}
            </h3>
            <ul style={{ marginLeft: '20px', fontSize: '14px' }}>
              <li>{t('users.instructions.rfidPoint1')}</li>
              <li>{t('users.instructions.rfidPoint2')}</li>
              <li>{t('users.instructions.rfidPoint3')}</li>
              <li>{t('users.instructions.rfidPoint4')}</li>
            </ul>
          </div>

          <div style={{ backgroundColor: '#ede9fe', padding: '16px', borderRadius: '8px', marginTop: '16px', border: '1px solid #a78bfa' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px', color: '#1f2937' }}>
              {t('users.instructions.tips')}
            </h3>
            <ul style={{ marginLeft: '20px', fontSize: '14px' }}>
              <li>{t('users.instructions.tip1')}</li>
              <li>{t('users.instructions.tip2')}</li>
              <li>{t('users.instructions.tip3')}</li>
              <li>{t('users.instructions.tip4')}</li>
            </ul>
          </div>
        </div>

        <button onClick={() => setShowInstructions(false)} style={{
          width: '100%', marginTop: '24px', padding: '12px',
          backgroundColor: '#007bff', color: 'white', border: 'none',
          borderRadius: '6px', fontSize: '14px', fontWeight: '500', cursor: 'pointer'
        }}>
          {t('common.close')}
        </button>
      </div>
    </div>
  );

  return (
    <div className="users-container" style={{ width: '100%', maxWidth: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', gap: '15px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ 
            fontSize: '36px', 
            fontWeight: '800', 
            marginBottom: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
          }}>
            <UsersIcon size={36} style={{ color: '#667eea' }} />
            {t('users.title')}
          </h1>
          <p style={{ color: '#6b7280', fontSize: '16px' }}>
            {showArchive ? t('users.archivedUsersSubtitle') : t('users.subtitle')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowArchive(!showArchive)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
              backgroundColor: showArchive ? '#6b7280' : '#8b5cf6', color: 'white', 
              border: 'none', borderRadius: '6px', fontSize: '14px', cursor: 'pointer'
            }}
          >
            <Archive size={18} />
            {showArchive ? t('users.showActive') : t('users.showArchive')}
          </button>
          <button
            onClick={() => setShowInstructions(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
              backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px', cursor: 'pointer'
            }}
          >
            <HelpCircle size={18} />
            {t('users.setupInstructions')}
          </button>
          <button
            onClick={() => { resetForm(); setShowModal(true); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              cursor: 'pointer'
            }}
          >
            <Plus size={18} />
            {t('users.addUser')}
          </button>
        </div>
      </div>

      {/* Search bar */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ position: 'relative', maxWidth: '400px' }}>
          <Search size={20} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
          <input
            type="text"
            placeholder={t('users.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 10px 10px 40px',
              border: '1px solid #ddd',
              borderRadius: '8px',
              fontSize: '14px'
            }}
          />
        </div>
      </div>

      {/* Building Filter Cards */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', 
        gap: '16px', 
        marginBottom: '30px' 
      }}>
        <div
          onClick={() => setSelectedBuildingId('all')}
          style={{
            padding: '20px',
            backgroundColor: selectedBuildingId === 'all' ? '#667eea' : 'white',
            color: selectedBuildingId === 'all' ? 'white' : '#1f2937',
            borderRadius: '12px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            cursor: 'pointer',
            transition: 'all 0.2s',
            border: selectedBuildingId === 'all' ? '2px solid #667eea' : '2px solid transparent'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <Building size={24} />
            <h3 style={{ fontSize: '18px', fontWeight: '600', margin: 0 }}>
              {t('users.allUsers')}
            </h3>
          </div>
          <p style={{ fontSize: '14px', margin: 0, opacity: 0.9 }}>
            {users.filter(u => u.is_active).length} {t('users.active')}
          </p>
        </div>

        {filteredBuildingsForCards.map(building => {
          const userCount = getUserCountForBuilding(building.id);
          return (
            <div
              key={building.id}
              onClick={() => setSelectedBuildingId(building.id)}
              style={{
                padding: '20px',
                backgroundColor: selectedBuildingId === building.id ? '#667eea' : 'white',
                color: selectedBuildingId === building.id ? 'white' : '#1f2937',
                borderRadius: '12px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                cursor: 'pointer',
                transition: 'all 0.2s',
                border: selectedBuildingId === building.id ? '2px solid #667eea' : '2px solid transparent'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <Building size={24} />
                <h3 style={{ fontSize: '18px', fontWeight: '600', margin: 0 }}>
                  {building.name}
                </h3>
              </div>
              <p style={{ fontSize: '14px', margin: 0, opacity: 0.9 }}>
                {userCount} {t('users.active')} {userCount === 1 ? t('users.user') : t('users.users')}
              </p>
            </div>
          );
        })}
      </div>

      {/* Administration Users Section */}
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
                    {getManagedBuildingsNames(user.managed_buildings)}
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

        {/* Mobile Cards for Admin Users */}
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
                    <strong>{t('users.manages')}:</strong> {getManagedBuildingsNames(user.managed_buildings)}
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

      {/* Regular Users Section */}
      <div>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '10px', 
          marginBottom: '15px',
          padding: '12px 16px',
          backgroundColor: '#f0fdf4',
          borderRadius: '8px',
          border: '1px solid #bbf7d0'
        }}>
          <UsersIcon size={20} style={{ color: '#15803d' }} />
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#15803d', margin: 0 }}>
              {t('users.regularUsers')}
            </h2>
            <p style={{ fontSize: '13px', color: '#166534', margin: '2px 0 0 0' }}>
              {t('users.regularDescription')}
            </p>
          </div>
        </div>

        <div className="desktop-table" style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
          <table style={{ width: '100%' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '1px solid #eee' }}>
                <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>{t('users.status')}</th>
                <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>{t('common.name')}</th>
                <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>{t('common.email')}</th>
                <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>{t('users.apartment')}</th>
                <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>{t('users.rentPeriod')}</th>
                <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>{t('users.rfidCards')}</th>
                <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>{t('users.building')}</th>
                <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {regularUsers.map(user => (
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
                  <td style={{ padding: '16px' }}>
                    {user.apartment_unit ? (
                      <span style={{ 
                        display: 'inline-flex', 
                        alignItems: 'center', 
                        gap: '4px',
                        padding: '4px 8px',
                        backgroundColor: '#f0fdf4',
                        color: '#15803d',
                        borderRadius: '4px',
                        fontSize: '13px'
                      }}>
                        <Home size={14} />
                        {user.apartment_unit}
                      </span>
                    ) : '-'}
                  </td>
                  <td style={{ padding: '16px', fontSize: '13px' }}>
                    {user.rent_start_date ? (
                      <span style={{ 
                        display: 'inline-flex', 
                        alignItems: 'center', 
                        gap: '4px',
                        padding: '4px 8px',
                        backgroundColor: '#fef3c7',
                        color: '#92400e',
                        borderRadius: '4px',
                        fontSize: '12px'
                      }}>
                        <Calendar size={14} />
                        {formatRentPeriod(user.rent_start_date, user.rent_end_date)}
                      </span>
                    ) : (
                      <span style={{ color: '#ef4444', fontSize: '12px' }}>âš ï¸ {t('users.notSet')}</span>
                    )}
                  </td>
                  <td style={{ padding: '16px' }}>
                    {user.charger_ids ? (
                      <span style={{ 
                        display: 'inline-flex', 
                        alignItems: 'center', 
                        gap: '4px',
                        padding: '4px 8px',
                        backgroundColor: '#f0f9ff',
                        color: '#0369a1',
                        borderRadius: '4px',
                        fontSize: '13px',
                        fontFamily: 'monospace'
                      }}>
                        <CreditCard size={14} />
                        {user.charger_ids}
                      </span>
                    ) : '-'}
                  </td>
                  <td style={{ padding: '16px' }}>{getBuildingName(user.building_id)}</td>
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
          {regularUsers.length === 0 && (
            <div style={{ padding: '40px', textAlign: 'center', color: '#999' }}>
              {showArchive ? t('users.noArchivedRegularUsers') : t('users.noRegularUsers')}
            </div>
          )}
        </div>

        {/* Mobile Cards for Regular Users */}
        <div className="mobile-cards">
          {regularUsers.map(user => (
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
                      backgroundColor: '#f0fdf4',
                      color: '#15803d',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: '600'
                    }}>
                      {t('users.regular')}
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
                  {user.apartment_unit && (
                    <div style={{ fontSize: '13px', color: '#15803d', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <Home size={14} />
                      {t('users.apartment')}: {user.apartment_unit}
                    </div>
                  )}
                  {user.rent_start_date && (
                    <div style={{ fontSize: '13px', color: '#92400e', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <Calendar size={14} />
                      {formatRentPeriod(user.rent_start_date, user.rent_end_date)}
                    </div>
                  )}
                  {user.charger_ids && (
                    <div style={{ fontSize: '13px', color: '#0369a1', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <CreditCard size={14} />
                      RFID: {user.charger_ids}
                    </div>
                  )}
                  {user.building_id && (
                    <div style={{ fontSize: '13px', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <MapPin size={14} />
                      {getBuildingName(user.building_id)}
                    </div>
                  )}
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
          {regularUsers.length === 0 && (
            <div style={{ backgroundColor: 'white', padding: '40px 20px', textAlign: 'center', color: '#999', borderRadius: '12px' }}>
              {showArchive ? t('users.noArchivedRegularUsers') : t('users.noRegularUsers')}
            </div>
          )}
        </div>
      </div>

      {showInstructions && <InstructionsModal />}

      {/* Modal */}
      {showModal && (
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
              <button onClick={() => { setShowModal(false); setEditingUser(null); }} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
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
                        {getAvailableApartments(formData.building_id).map(apt => (
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
                        <strong>â„¹ï¸ {t('users.apartmentInfo')}</strong>
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
                      <strong>â„¹ï¸ {t('users.rentPeriodInfo')}</strong>
                      <br />
                      {t('users.rentPeriodExplanation')}
                    </div>
                  </div>

                  {/* RFID Card IDs - Now Optional */}
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

              {/* Bank Details */}
              <div style={{ marginTop: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>{t('users.bankDetails')}</label>
                <input type="text" value={formData.bank_name} onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                  placeholder={t('users.bankName')} style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', marginBottom: '8px' }} />
                <input type="text" value={formData.bank_iban} onChange={(e) => setFormData({ ...formData, bank_iban: e.target.value })}
                  placeholder={t('users.iban')} style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', marginBottom: '8px' }} />
                <input type="text" value={formData.bank_account_holder} onChange={(e) => setFormData({ ...formData, bank_account_holder: e.target.value })}
                  placeholder={t('users.accountHolder')} style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
              </div>

              {/* Invoice Language */}
              <div style={{ marginTop: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>{t('users.invoiceLanguage')}</label>
                <select 
                  value={formData.language || 'de'} 
                  onChange={(e) => setFormData({ ...formData, language: e.target.value })}
                  style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}
                >
                  <option value="de">ðŸ‡©ðŸ‡ª German (Deutsch)</option>
                  <option value="fr">ðŸ‡«ðŸ‡· French (FranÃ§ais)</option>
                  <option value="it">ðŸ‡®ðŸ‡¹ Italian (Italiano)</option>
                  <option value="en">ðŸ‡¬ðŸ‡§ English</option>
                </select>
              </div>

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
                <button type="button" onClick={() => { setShowModal(false); setEditingUser(null); }} style={{
                  flex: 1, minWidth: '120px', padding: '12px', backgroundColor: '#6c757d', color: 'white',
                  border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '500', cursor: 'pointer'
                }}>
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
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