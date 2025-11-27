import { useState, useEffect } from 'react';
import { Smartphone, Plus, Edit2, Trash2, Eye, EyeOff, Power, Users, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { useTranslation } from '../i18n';
import { api } from '../api/client';

interface AppUser {
  id: number;
  username: string;
  description: string;
  permissions: {
    meters: boolean;
    chargers: boolean;
    users: boolean;
    buildings: boolean;
    bills: boolean;
  };
  firebase_uid: string;
  device_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface AppSettings {
  mobile_app_enabled: boolean;
  firebase_project_id: string;
  firebase_config: string;
  last_sync: string;
}

export default function AppManagement() {
  const { t } = useTranslation();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [appUsers, setAppUsers] = useState<AppUser[]>([]);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [syncing, setSyncing] = useState(false);
  
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    description: '',
    permissions: {
      meters: false,
      chargers: false,
      users: false,
      buildings: false,
      bills: false
    }
  });

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [users, settings] = await Promise.all([
        api.getAppUsers(),
        api.getAppSettings()
      ]);
      setAppUsers(users);
      setAppSettings(settings);
    } catch (err) {
      console.error('Failed to load app management data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAppEnabled = async () => {
    if (!appSettings) return;
    
    try {
      const newSettings = await api.updateAppSettings({
        mobile_app_enabled: !appSettings.mobile_app_enabled
      });
      setAppSettings(newSettings);
      
      if (newSettings.mobile_app_enabled) {
        alert(t('appManagement.appEnabled'));
      } else {
        alert(t('appManagement.appDisabled'));
      }
    } catch (err) {
      console.error('Failed to toggle app:', err);
      alert(t('appManagement.toggleFailed'));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.username || !formData.password) {
      alert(t('appManagement.fillRequiredFields'));
      return;
    }

    try {
      if (editingUser) {
        await api.updateAppUser(editingUser.id, formData);
        alert(t('appManagement.userUpdated'));
      } else {
        await api.createAppUser(formData);
        alert(t('appManagement.userCreated'));
      }
      
      setShowForm(false);
      setEditingUser(null);
      setFormData({
        username: '',
        password: '',
        description: '',
        permissions: {
          meters: false,
          chargers: false,
          users: false,
          buildings: false,
          bills: false
        }
      });
      loadData();
    } catch (err: any) {
      console.error('Failed to save app user:', err);
      alert(err.message || t('appManagement.saveFailed'));
    }
  };

  const handleEdit = (user: AppUser) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      password: '', // Don't show password
      description: user.description,
      permissions: user.permissions
    });
    setShowForm(true);
  };

  const handleDelete = async (userId: number) => {
    if (!confirm(t('appManagement.confirmDelete'))) return;
    
    try {
      await api.deleteAppUser(userId);
      alert(t('appManagement.userDeleted'));
      loadData();
    } catch (err) {
      console.error('Failed to delete app user:', err);
      alert(t('appManagement.deleteFailed'));
    }
  };

  const handleToggleActive = async (userId: number, currentStatus: boolean) => {
    try {
      await api.updateAppUser(userId, { is_active: !currentStatus });
      loadData();
    } catch (err) {
      console.error('Failed to toggle user status:', err);
      alert(t('appManagement.toggleUserFailed'));
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      await api.syncToFirebase();
      alert(t('appManagement.syncSuccess'));
      loadData();
    } catch (err) {
      console.error('Failed to sync:', err);
      alert(t('appManagement.syncFailed'));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="app-management-container" style={{ 
      maxWidth: '100%', 
      width: '100%',
      padding: isMobile ? '0' : '0',
      boxSizing: 'border-box'
    }}>
      <div className="app-management-header" style={{ marginBottom: isMobile ? '20px' : '30px' }}>
        <div style={{ marginBottom: isMobile ? '16px' : '20px' }}>
          <h1 style={{ 
            fontSize: isMobile ? '24px' : '36px', 
            fontWeight: '800', 
            marginBottom: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: isMobile ? '8px' : '12px',
            color: '#667eea'
          }}>
            <Smartphone size={isMobile ? 24 : 36} />
            {t('appManagement.title')}
          </h1>
          <p style={{ 
            color: '#6b7280', 
            fontSize: isMobile ? '13px' : '16px',
            margin: 0
          }}>
            {t('appManagement.subtitle')}
          </p>
        </div>
      </div>

      {/* App Enable/Disable Toggle */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: isMobile ? '12px' : '16px',
        padding: isMobile ? '20px' : '30px',
        marginBottom: isMobile ? '16px' : '24px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        border: '2px solid #e5e7eb'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <h2 style={{ 
              fontSize: isMobile ? '18px' : '20px', 
              fontWeight: '700', 
              marginBottom: '4px',
              color: '#1f2937',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <Power size={20} />
              {t('appManagement.mobileAppStatus')}
            </h2>
            <p style={{ fontSize: isMobile ? '13px' : '14px', color: '#6b7280', margin: 0 }}>
              {appSettings?.mobile_app_enabled ? t('appManagement.appCurrentlyEnabled') : t('appManagement.appCurrentlyDisabled')}
            </p>
          </div>
          
          <button
            onClick={handleToggleAppEnabled}
            style={{
              padding: isMobile ? '10px 20px' : '12px 24px',
              backgroundColor: appSettings?.mobile_app_enabled ? '#dc2626' : '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: isMobile ? '8px' : '10px',
              fontSize: isMobile ? '13px' : '14px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s ease',
              boxShadow: `0 2px 8px ${appSettings?.mobile_app_enabled ? 'rgba(220, 38, 38, 0.2)' : 'rgba(16, 185, 129, 0.2)'}`
            }}
          >
            <Power size={16} />
            {appSettings?.mobile_app_enabled ? t('appManagement.disableApp') : t('appManagement.enableApp')}
          </button>
        </div>
      </div>

      {/* Sync Status Card */}
      {appSettings?.mobile_app_enabled && (
        <div style={{
          backgroundColor: 'white',
          borderRadius: isMobile ? '12px' : '16px',
          padding: isMobile ? '20px' : '30px',
          marginBottom: isMobile ? '16px' : '24px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          border: '2px solid #e5e7eb'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <h2 style={{ 
                fontSize: isMobile ? '18px' : '20px', 
                fontWeight: '700', 
                marginBottom: '4px',
                color: '#1f2937',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <RefreshCw size={20} />
                {t('appManagement.syncStatus')}
              </h2>
              <p style={{ fontSize: isMobile ? '13px' : '14px', color: '#6b7280', margin: 0 }}>
                {appSettings?.last_sync 
                  ? `${t('appManagement.lastSync')}: ${new Date(appSettings.last_sync).toLocaleString()}`
                  : t('appManagement.neverSynced')}
              </p>
            </div>
            
            <button
              onClick={handleSyncNow}
              disabled={syncing}
              style={{
                padding: isMobile ? '10px 20px' : '12px 24px',
                backgroundColor: syncing ? '#9ca3af' : '#667eea',
                color: 'white',
                border: 'none',
                borderRadius: isMobile ? '8px' : '10px',
                fontSize: isMobile ? '13px' : '14px',
                fontWeight: '600',
                cursor: syncing ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s ease',
                boxShadow: syncing ? 'none' : '0 2px 8px rgba(102, 126, 234, 0.2)'
              }}
            >
              <RefreshCw size={16} className={syncing ? 'spinning' : ''} />
              {syncing ? t('appManagement.syncing') : t('appManagement.syncNow')}
            </button>
          </div>
        </div>
      )}

      {/* App Users Section */}
      {appSettings?.mobile_app_enabled && (
        <>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: isMobile ? '16px' : '20px',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <h2 style={{ 
              fontSize: isMobile ? '20px' : '24px', 
              fontWeight: '700',
              color: '#1f2937',
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <Users size={24} />
              {t('appManagement.appUsers')}
            </h2>
            
            {!showForm && (
              <button
                onClick={() => {
                  setShowForm(true);
                  setEditingUser(null);
                  setFormData({
                    username: '',
                    password: '',
                    description: '',
                    permissions: {
                      meters: false,
                      chargers: false,
                      users: false,
                      buildings: false,
                      bills: false
                    }
                  });
                }}
                style={{
                  padding: isMobile ? '10px 16px' : '12px 20px',
                  backgroundColor: '#667eea',
                  color: 'white',
                  border: 'none',
                  borderRadius: isMobile ? '8px' : '10px',
                  fontSize: isMobile ? '13px' : '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 2px 8px rgba(102, 126, 234, 0.2)'
                }}
              >
                <Plus size={16} />
                {t('appManagement.addUser')}
              </button>
            )}
          </div>

          {/* User Form */}
          {showForm && (
            <div style={{
              backgroundColor: 'white',
              borderRadius: isMobile ? '12px' : '16px',
              padding: isMobile ? '20px' : '30px',
              marginBottom: isMobile ? '16px' : '24px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              border: '2px solid #667eea'
            }}>
              <h3 style={{ 
                fontSize: isMobile ? '18px' : '20px', 
                fontWeight: '700',
                marginBottom: isMobile ? '16px' : '20px',
                color: '#1f2937'
              }}>
                {editingUser ? t('appManagement.editUser') : t('appManagement.addNewUser')}
              </h3>

              <form onSubmit={handleSubmit}>
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)',
                  gap: isMobile ? '16px' : '20px',
                  marginBottom: isMobile ? '16px' : '20px'
                }}>
                  <div>
                    <label style={{ 
                      display: 'block', 
                      marginBottom: '8px', 
                      fontWeight: '600', 
                      color: '#374151',
                      fontSize: '14px'
                    }}>
                      {t('appManagement.username')} *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                      style={{ 
                        width: '100%', 
                        padding: '12px', 
                        border: '2px solid #e5e7eb', 
                        borderRadius: '8px',
                        fontSize: '14px'
                      }}
                      placeholder={t('appManagement.enterUsername')}
                    />
                  </div>

                  <div>
                    <label style={{ 
                      display: 'block', 
                      marginBottom: '8px', 
                      fontWeight: '600', 
                      color: '#374151',
                      fontSize: '14px'
                    }}>
                      {t('appManagement.password')} {!editingUser && '*'}
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required={!editingUser}
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        style={{ 
                          width: '100%', 
                          padding: '12px', 
                          paddingRight: '40px',
                          border: '2px solid #e5e7eb', 
                          borderRadius: '8px',
                          fontSize: '14px'
                        }}
                        placeholder={editingUser ? t('appManagement.leaveBlankToKeep') : t('appManagement.enterPassword')}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        style={{
                          position: 'absolute',
                          right: '10px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: '#6b7280'
                        }}
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>
                </div>

                <div style={{ marginBottom: isMobile ? '16px' : '20px' }}>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: '8px', 
                    fontWeight: '600', 
                    color: '#374151',
                    fontSize: '14px'
                  }}>
                    {t('appManagement.description')}
                  </label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    style={{ 
                      width: '100%', 
                      padding: '12px', 
                      border: '2px solid #e5e7eb', 
                      borderRadius: '8px',
                      fontSize: '14px'
                    }}
                    placeholder={t('appManagement.enterDescription')}
                  />
                </div>

                <div style={{ marginBottom: isMobile ? '20px' : '24px' }}>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: '12px', 
                    fontWeight: '600', 
                    color: '#374151',
                    fontSize: '14px'
                  }}>
                    {t('appManagement.permissions')}
                  </label>
                  
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
                    gap: '12px'
                  }}>
                    {(['meters', 'chargers', 'users', 'buildings', 'bills'] as const).map((permission) => (
                      <label key={permission} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '12px',
                        backgroundColor: formData.permissions[permission] ? '#ede9fe' : '#f9fafb',
                        border: `2px solid ${formData.permissions[permission] ? '#8b5cf6' : '#e5e7eb'}`,
                        borderRadius: '8px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}>
                        <input
                          type="checkbox"
                          checked={formData.permissions[permission]}
                          onChange={(e) => setFormData({
                            ...formData,
                            permissions: {
                              ...formData.permissions,
                              [permission]: e.target.checked
                            }
                          })}
                          style={{ cursor: 'pointer' }}
                        />
                        <span style={{ 
                          fontSize: '14px', 
                          fontWeight: '500',
                          color: formData.permissions[permission] ? '#6b21a8' : '#374151'
                        }}>
                          {t(`appManagement.${permission}`)}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div style={{ 
                  display: 'flex', 
                  gap: '12px', 
                  justifyContent: 'flex-end',
                  flexDirection: isMobile ? 'column' : 'row'
                }}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowForm(false);
                      setEditingUser(null);
                    }}
                    style={{
                      padding: '12px 24px',
                      backgroundColor: '#f3f4f6',
                      color: '#4b5563',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    {t('appManagement.cancel')}
                  </button>
                  
                  <button
                    type="submit"
                    style={{
                      padding: '12px 24px',
                      backgroundColor: '#667eea',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(102, 126, 234, 0.3)'
                    }}
                  >
                    {editingUser ? t('appManagement.updateUser') : t('appManagement.createUser')}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Users List */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
              {t('appManagement.loading')}
            </div>
          ) : appUsers.length === 0 ? (
            <div style={{
              backgroundColor: 'white',
              borderRadius: isMobile ? '12px' : '16px',
              padding: '40px',
              textAlign: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }}>
              <Users size={48} color="#9ca3af" style={{ marginBottom: '16px' }} />
              <p style={{ color: '#6b7280', fontSize: '16px' }}>
                {t('appManagement.noUsers')}
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: isMobile ? '12px' : '16px' }}>
              {appUsers.map((user) => (
                <div
                  key={user.id}
                  style={{
                    backgroundColor: 'white',
                    borderRadius: isMobile ? '12px' : '16px',
                    padding: isMobile ? '16px' : '24px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                    border: '2px solid #e5e7eb'
                  }}
                >
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'flex-start',
                    marginBottom: '16px',
                    flexWrap: 'wrap',
                    gap: '12px'
                  }}>
                    <div style={{ flex: 1, minWidth: '200px' }}>
                      <h3 style={{ 
                        fontSize: isMobile ? '16px' : '18px', 
                        fontWeight: '700',
                        marginBottom: '4px',
                        color: '#1f2937',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}>
                        {user.username}
                        {user.is_active ? (
                          <CheckCircle size={18} color="#10b981" />
                        ) : (
                          <XCircle size={18} color="#ef4444" />
                        )}
                      </h3>
                      <p style={{ fontSize: '14px', color: '#6b7280', margin: 0 }}>
                        {user.description || t('appManagement.noDescription')}
                      </p>
                      {user.device_id && (
                        <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px', margin: 0 }}>
                          {t('appManagement.deviceId')}: {user.device_id}
                        </p>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => handleToggleActive(user.id, user.is_active)}
                        style={{
                          padding: '8px 12px',
                          backgroundColor: user.is_active ? '#fee2e2' : '#d1fae5',
                          color: user.is_active ? '#991b1b' : '#065f46',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: '600',
                          cursor: 'pointer'
                        }}
                        title={user.is_active ? t('appManagement.deactivate') : t('appManagement.activate')}
                      >
                        <Power size={14} />
                      </button>
                      
                      <button
                        onClick={() => handleEdit(user)}
                        style={{
                          padding: '8px 12px',
                          backgroundColor: '#dbeafe',
                          color: '#1e40af',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: '600',
                          cursor: 'pointer'
                        }}
                        title={t('appManagement.edit')}
                      >
                        <Edit2 size={14} />
                      </button>
                      
                      <button
                        onClick={() => handleDelete(user.id)}
                        style={{
                          padding: '8px 12px',
                          backgroundColor: '#fee2e2',
                          color: '#991b1b',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: '600',
                          cursor: 'pointer'
                        }}
                        title={t('appManagement.delete')}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  <div style={{ 
                    display: 'flex', 
                    gap: '8px', 
                    flexWrap: 'wrap',
                    paddingTop: '12px',
                    borderTop: '1px solid #f3f4f6'
                  }}>
                    {Object.entries(user.permissions).map(([key, value]) => (
                      value && (
                        <span
                          key={key}
                          style={{
                            padding: '4px 12px',
                            backgroundColor: '#ede9fe',
                            color: '#6b21a8',
                            borderRadius: '12px',
                            fontSize: '12px',
                            fontWeight: '600'
                          }}
                        >
                          {t(`appManagement.${key}`)}
                        </span>
                      )
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <style>{`
        .spinning {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @media (max-width: 768px) {
          .app-management-container {
            padding: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}