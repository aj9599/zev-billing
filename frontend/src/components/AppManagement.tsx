import { useState, useEffect } from 'react';
import { Smartphone, Plus, Edit2, Trash2, Eye, EyeOff, Power, Users, CheckCircle, XCircle, RefreshCw, Shield, Key, Upload, AlertCircle, Tablet } from 'lucide-react';
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
  const [showFirebaseConfig, setShowFirebaseConfig] = useState(false);
  const [uploadingConfig, setUploadingConfig] = useState(false);
  
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    description: '',
    device_id: '', // NEW: Device ID field
    permissions: {
      meters: false,
      chargers: false,
      users: false,
      buildings: false,
      bills: false
    }
  });

  const [firebaseConfig, setFirebaseConfig] = useState({
    project_id: '',
    config_json: ''
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
        api.getAppUsers().catch(() => []),
        api.getAppSettings().catch(() => ({
          mobile_app_enabled: false,
          firebase_project_id: '',
          firebase_config: '',
          last_sync: null
        }))
      ]);
      setAppUsers(Array.isArray(users) ? users : []);
      setAppSettings(settings || null);
      
      if (settings?.firebase_project_id) {
        setFirebaseConfig({
          project_id: settings.firebase_project_id,
          config_json: settings.firebase_config || ''
        });
      }
    } catch (err) {
      console.error('Failed to load app management data:', err);
      setAppUsers([]);
      setAppSettings(null);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAppEnabled = async () => {
    if (!appSettings) return;
    
    // Check if Firebase is configured before enabling
    if (!appSettings.mobile_app_enabled && !appSettings.firebase_config) {
      alert(t('appManagement.configureFirebaseFirst') || 'Please configure Firebase first before enabling the mobile app.');
      setShowFirebaseConfig(true);
      return;
    }
    
    try {
      const newSettings = await api.updateAppSettings({
        mobile_app_enabled: !appSettings.mobile_app_enabled
      });
      setAppSettings(newSettings);
      
      if (newSettings.mobile_app_enabled) {
        alert(t('appManagement.appEnabled') || 'Mobile app enabled successfully!');
      } else {
        alert(t('appManagement.appDisabled') || 'Mobile app disabled successfully.');
      }
    } catch (err) {
      console.error('Failed to toggle app:', err);
      alert(t('appManagement.toggleFailed') || 'Failed to toggle mobile app status.');
    }
  };

  const handleFirebaseConfigUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingConfig(true);
      const text = await file.text();
      const config = JSON.parse(text);
      
      // Validate it's a Firebase service account key
      if (!config.project_id || !config.private_key || !config.client_email) {
        alert(t('appManagement.invalidFirebaseConfig') || 'Invalid Firebase service account key. Please upload a valid JSON file.');
        return;
      }

      setFirebaseConfig({
        project_id: config.project_id,
        config_json: text
      });

      alert(t('appManagement.configUploaded') || 'Firebase configuration uploaded successfully. Click "Save Configuration" to apply.');
    } catch (err) {
      console.error('Failed to parse Firebase config:', err);
      alert(t('appManagement.configParseFailed') || 'Failed to parse Firebase configuration file. Please ensure it\'s a valid JSON file.');
    } finally {
      setUploadingConfig(false);
    }
  };

  const handleSaveFirebaseConfig = async () => {
    if (!firebaseConfig.config_json) {
      alert(t('appManagement.uploadConfigFirst') || 'Please upload a Firebase configuration file first.');
      return;
    }

    try {
      const newSettings = await api.updateAppSettings({
        firebase_project_id: firebaseConfig.project_id,
        firebase_config: firebaseConfig.config_json
      });
      setAppSettings(newSettings);
      setShowFirebaseConfig(false);
      alert(t('appManagement.configSaved') || 'Firebase configuration saved successfully!');
    } catch (err) {
      console.error('Failed to save Firebase config:', err);
      alert(t('appManagement.configSaveFailed') || 'Failed to save Firebase configuration.');
    }
  };

  const generateDeviceID = () => {
    // Generate a random device ID (you can customize this format)
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 7);
    return `device_${timestamp}_${random}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.username || (!editingUser && !formData.password)) {
      alert(t('appManagement.fillRequiredFields') || 'Please fill in all required fields.');
      return;
    }

    // Validate device_id is provided
    if (!formData.device_id) {
      alert('Please provide a Device ID or generate one.');
      return;
    }

    try {
      if (editingUser) {
        await api.updateAppUser(editingUser.id, formData);
        alert(t('appManagement.userUpdated') || 'User updated successfully!');
      } else {
        await api.createAppUser(formData);
        alert(t('appManagement.userCreated') || 'User created successfully!');
      }
      
      setShowForm(false);
      setEditingUser(null);
      setFormData({
        username: '',
        password: '',
        description: '',
        device_id: '',
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
      alert(err.message || t('appManagement.saveFailed') || 'Failed to save user.');
    }
  };

  const handleEdit = (user: AppUser) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      password: '',
      description: user.description,
      device_id: user.device_id || '',
      permissions: user.permissions
    });
    setShowForm(true);
  };

  const handleDelete = async (userId: number) => {
    if (!confirm(t('appManagement.confirmDelete') || 'Are you sure you want to delete this user?')) return;
    
    try {
      await api.deleteAppUser(userId);
      alert(t('appManagement.userDeleted') || 'User deleted successfully.');
      loadData();
    } catch (err) {
      console.error('Failed to delete app user:', err);
      alert(t('appManagement.deleteFailed') || 'Failed to delete user.');
    }
  };

  const handleToggleActive = async (userId: number, currentStatus: boolean) => {
    try {
      await api.updateAppUser(userId, { is_active: !currentStatus });
      loadData();
    } catch (err) {
      console.error('Failed to toggle user status:', err);
      alert(t('appManagement.toggleUserFailed') || 'Failed to toggle user status.');
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      await api.syncToFirebase();
      alert(t('appManagement.syncSuccess') || 'Data synchronized to Firebase successfully!');
      loadData();
    } catch (err) {
      console.error('Failed to sync:', err);
      alert(t('appManagement.syncFailed') || 'Failed to sync data to Firebase.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="app-management-container" style={{ 
      maxWidth: '100%', 
      width: '100%',
      padding: 0,
      boxSizing: 'border-box'
    }}>
      {/* Header */}
      <div style={{ marginBottom: isMobile ? '24px' : '32px' }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '16px',
          marginBottom: '12px'
        }}>
          <div style={{
            width: isMobile ? '48px' : '56px',
            height: isMobile ? '48px' : '56px',
            backgroundColor: '#667eea',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Smartphone size={isMobile ? 24 : 28} color="white" />
          </div>
          <div>
            <h1 style={{ 
              fontSize: isMobile ? '24px' : '32px', 
              fontWeight: '700', 
              margin: 0,
              color: '#111827'
            }}>
              {t('appManagement.title') || 'Mobile App Management'}
            </h1>
            <p style={{ 
              color: '#6b7280', 
              fontSize: isMobile ? '14px' : '16px',
              margin: '4px 0 0 0'
            }}>
              {t('appManagement.subtitle') || 'Configure and manage your mobile application'}
            </p>
          </div>
        </div>
      </div>

      {/* Firebase Configuration Section */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: isMobile ? '20px' : '24px',
        marginBottom: '20px',
        border: '1px solid #e5e7eb',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
      }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '16px',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <h2 style={{ 
              fontSize: isMobile ? '18px' : '20px', 
              fontWeight: '600', 
              margin: 0,
              color: '#111827',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <Shield size={20} color="#667eea" />
              Firebase Configuration
            </h2>
            <p style={{ fontSize: '14px', color: '#6b7280', margin: '4px 0 0 0' }}>
              {appSettings?.firebase_project_id 
                ? `Project: ${appSettings.firebase_project_id}` 
                : 'No configuration uploaded'}
            </p>
          </div>
          
          <button
            onClick={() => setShowFirebaseConfig(!showFirebaseConfig)}
            style={{
              padding: '10px 18px',
              backgroundColor: showFirebaseConfig ? '#f3f4f6' : '#667eea',
              color: showFirebaseConfig ? '#374151' : 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s ease'
            }}
          >
            <Key size={16} />
            {showFirebaseConfig ? 'Hide Configuration' : 'Configure Firebase'}
          </button>
        </div>

        {showFirebaseConfig && (
          <div style={{
            marginTop: '20px',
            padding: '20px',
            backgroundColor: '#f9fafb',
            borderRadius: '8px',
            border: '1px solid #e5e7eb'
          }}>
            <div style={{ marginBottom: '16px' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '12px',
                padding: '12px',
                backgroundColor: '#fef3c7',
                border: '1px solid #fbbf24',
                borderRadius: '6px'
              }}>
                <AlertCircle size={18} color="#d97706" />
                <p style={{ fontSize: '13px', color: '#92400e', margin: 0, fontWeight: '500' }}>
                  Upload your Firebase service account JSON key. This will be encrypted before storage.
                </p>
              </div>

              <label style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                cursor: 'pointer'
              }}>
                <span style={{ fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                  Service Account Key (JSON)
                </span>
                <div style={{
                  padding: '32px',
                  border: '2px dashed #d1d5db',
                  borderRadius: '8px',
                  backgroundColor: 'white',
                  textAlign: 'center',
                  transition: 'all 0.2s ease',
                  cursor: 'pointer'
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.currentTarget.style.borderColor = '#667eea';
                  e.currentTarget.style.backgroundColor = '#ede9fe';
                }}
                onDragLeave={(e) => {
                  e.currentTarget.style.borderColor = '#d1d5db';
                  e.currentTarget.style.backgroundColor = 'white';
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.style.borderColor = '#d1d5db';
                  e.currentTarget.style.backgroundColor = 'white';
                  const file = e.dataTransfer.files[0];
                  if (file) {
                    const input = document.getElementById('firebase-config-input') as HTMLInputElement;
                    const dataTransfer = new DataTransfer();
                    dataTransfer.items.add(file);
                    input.files = dataTransfer.files;
                    handleFirebaseConfigUpload({ target: input } as any);
                  }
                }}
                >
                  <Upload size={32} color="#9ca3af" style={{ marginBottom: '8px' }} />
                  <p style={{ color: '#6b7280', fontSize: '14px', margin: 0 }}>
                    {firebaseConfig.config_json ? 'Configuration loaded' : 'Click to upload or drag and drop'}
                  </p>
                  <p style={{ color: '#9ca3af', fontSize: '12px', margin: '4px 0 0 0' }}>
                    JSON file from Firebase Console
                  </p>
                </div>
                <input
                  id="firebase-config-input"
                  type="file"
                  accept=".json"
                  onChange={handleFirebaseConfigUpload}
                  style={{ display: 'none' }}
                />
              </label>
            </div>

            {firebaseConfig.config_json && (
              <div style={{
                display: 'flex',
                gap: '12px',
                justifyContent: 'flex-end',
                paddingTop: '16px',
                borderTop: '1px solid #e5e7eb'
              }}>
                <button
                  onClick={() => {
                    setFirebaseConfig({ project_id: '', config_json: '' });
                    setShowFirebaseConfig(false);
                  }}
                  style={{
                    padding: '10px 18px',
                    backgroundColor: '#f3f4f6',
                    color: '#374151',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveFirebaseConfig}
                  disabled={uploadingConfig}
                  style={{
                    padding: '10px 18px',
                    backgroundColor: uploadingConfig ? '#9ca3af' : '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: uploadingConfig ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <Shield size={16} />
                  Save Configuration
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* App Status Card */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: isMobile ? '20px' : '24px',
        marginBottom: '20px',
        border: '1px solid #e5e7eb',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
      }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          flexWrap: 'wrap', 
          gap: '16px' 
        }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <h2 style={{ 
              fontSize: isMobile ? '18px' : '20px', 
              fontWeight: '600', 
              margin: 0,
              color: '#111827',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <Power size={20} color="#667eea" />
              Mobile App Status
            </h2>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px', 
              marginTop: '8px' 
            }}>
              <div style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: appSettings?.mobile_app_enabled ? '#10b981' : '#ef4444'
              }} />
              <p style={{ fontSize: '14px', color: '#6b7280', margin: 0, fontWeight: '500' }}>
                {appSettings?.mobile_app_enabled ? 'Active and running' : 'Currently disabled'}
              </p>
            </div>
          </div>
          
          <button
            onClick={handleToggleAppEnabled}
            style={{
              padding: '10px 18px',
              backgroundColor: appSettings?.mobile_app_enabled ? '#fef2f2' : '#10b981',
              color: appSettings?.mobile_app_enabled ? '#dc2626' : 'white',
              border: appSettings?.mobile_app_enabled ? '1px solid #fecaca' : 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s ease'
            }}
          >
            <Power size={16} />
            {appSettings?.mobile_app_enabled ? 'Disable App' : 'Enable App'}
          </button>
        </div>
      </div>

      {/* Sync Status Card */}
      {appSettings?.mobile_app_enabled && (
        <div style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: isMobile ? '20px' : '24px',
          marginBottom: '20px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
        }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            flexWrap: 'wrap', 
            gap: '16px' 
          }}>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <h2 style={{ 
                fontSize: isMobile ? '18px' : '20px', 
                fontWeight: '600', 
                margin: 0,
                color: '#111827',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <RefreshCw size={20} color="#667eea" />
                Data Synchronization
              </h2>
              <p style={{ fontSize: '14px', color: '#6b7280', margin: '8px 0 0 0' }}>
                {appSettings?.last_sync 
                  ? `Last synced: ${new Date(appSettings.last_sync).toLocaleString()}`
                  : 'Never synchronized'}
              </p>
            </div>
            
            <button
              onClick={handleSyncNow}
              disabled={syncing}
              style={{
                padding: '10px 18px',
                backgroundColor: syncing ? '#f3f4f6' : '#667eea',
                color: syncing ? '#9ca3af' : 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: syncing ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s ease'
              }}
            >
              <RefreshCw size={16} className={syncing ? 'spinning' : ''} />
              {syncing ? 'Syncing...' : 'Sync Now'}
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
            marginBottom: '20px',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <h2 style={{ 
              fontSize: isMobile ? '20px' : '24px', 
              fontWeight: '600',
              color: '#111827',
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <Users size={24} color="#667eea" />
              App Users
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
                    device_id: '',
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
                  padding: '10px 18px',
                  backgroundColor: '#667eea',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'all 0.2s ease'
                }}
              >
                <Plus size={16} />
                Add User
              </button>
            )}
          </div>

          {/* User Form */}
          {showForm && (
            <div style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: isMobile ? '20px' : '24px',
              marginBottom: '20px',
              border: '2px solid #667eea',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}>
              <h3 style={{ 
                fontSize: isMobile ? '18px' : '20px', 
                fontWeight: '600',
                marginBottom: '20px',
                color: '#111827'
              }}>
                {editingUser ? 'Edit User' : 'Add New User'}
              </h3>

              <form onSubmit={handleSubmit}>
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)',
                  gap: '20px',
                  marginBottom: '20px'
                }}>
                  <div>
                    <label style={{ 
                      display: 'block', 
                      marginBottom: '8px', 
                      fontWeight: '600', 
                      color: '#374151',
                      fontSize: '14px'
                    }}>
                      Username *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                      style={{ 
                        width: '100%', 
                        padding: '12px', 
                        border: '1px solid #d1d5db', 
                        borderRadius: '8px',
                        fontSize: '14px',
                        fontFamily: 'inherit',
                        outline: 'none',
                        transition: 'border-color 0.2s'
                      }}
                      onFocus={(e) => e.target.style.borderColor = '#667eea'}
                      onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
                      placeholder="Enter username"
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
                      Password {!editingUser && '*'}
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
                          border: '1px solid #d1d5db', 
                          borderRadius: '8px',
                          fontSize: '14px',
                          fontFamily: 'inherit',
                          outline: 'none',
                          transition: 'border-color 0.2s'
                        }}
                        onFocus={(e) => e.target.style.borderColor = '#667eea'}
                        onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
                        placeholder={editingUser ? 'Leave blank to keep current' : 'Enter password'}
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
                          color: '#6b7280',
                          padding: '4px'
                        }}
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: '8px', 
                    fontWeight: '600', 
                    color: '#374151',
                    fontSize: '14px'
                  }}>
                    Device ID *
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      required
                      value={formData.device_id}
                      onChange={(e) => setFormData({ ...formData, device_id: e.target.value })}
                      style={{ 
                        flex: 1,
                        padding: '12px', 
                        border: '1px solid #d1d5db', 
                        borderRadius: '8px',
                        fontSize: '14px',
                        fontFamily: 'inherit',
                        outline: 'none',
                        transition: 'border-color 0.2s'
                      }}
                      onFocus={(e) => e.target.style.borderColor = '#667eea'}
                      onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
                      placeholder="Enter device ID"
                    />
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, device_id: generateDeviceID() })}
                      style={{
                        padding: '10px 18px',
                        backgroundColor: '#667eea',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '14px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      <Tablet size={16} />
                      Generate
                    </button>
                  </div>
                  <p style={{ fontSize: '12px', color: '#6b7280', margin: '6px 0 0 0' }}>
                    Each device needs a unique identifier for Firebase sync
                  </p>
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: '8px', 
                    fontWeight: '600', 
                    color: '#374151',
                    fontSize: '14px'
                  }}>
                    Description
                  </label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    style={{ 
                      width: '100%', 
                      padding: '12px', 
                      border: '1px solid #d1d5db', 
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontFamily: 'inherit',
                      outline: 'none',
                      transition: 'border-color 0.2s'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#667eea'}
                    onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
                    placeholder="Optional description"
                  />
                </div>

                <div style={{ marginBottom: '24px' }}>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: '12px', 
                    fontWeight: '600', 
                    color: '#374151',
                    fontSize: '14px'
                  }}>
                    Permissions
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
                        gap: '10px',
                        padding: '12px 16px',
                        backgroundColor: formData.permissions[permission] ? '#ede9fe' : '#f9fafb',
                        border: `1px solid ${formData.permissions[permission] ? '#8b5cf6' : '#e5e7eb'}`,
                        borderRadius: '8px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        userSelect: 'none'
                      }}
                      onMouseEnter={(e) => {
                        if (!formData.permissions[permission]) {
                          e.currentTarget.style.borderColor = '#d1d5db';
                          e.currentTarget.style.backgroundColor = '#f3f4f6';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!formData.permissions[permission]) {
                          e.currentTarget.style.borderColor = '#e5e7eb';
                          e.currentTarget.style.backgroundColor = '#f9fafb';
                        }
                      }}
                      >
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
                          style={{ 
                            cursor: 'pointer',
                            width: '16px',
                            height: '16px',
                            accentColor: '#8b5cf6'
                          }}
                        />
                        <span style={{ 
                          fontSize: '14px', 
                          fontWeight: '500',
                          color: formData.permissions[permission] ? '#6b21a8' : '#374151',
                          textTransform: 'capitalize'
                        }}>
                          {permission}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div style={{ 
                  display: 'flex', 
                  gap: '12px', 
                  justifyContent: 'flex-end',
                  paddingTop: '16px',
                  borderTop: '1px solid #e5e7eb'
                }}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowForm(false);
                      setEditingUser(null);
                    }}
                    style={{
                      padding: '10px 20px',
                      backgroundColor: '#f3f4f6',
                      color: '#374151',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#e5e7eb'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                  >
                    Cancel
                  </button>
                  
                  <button
                    type="submit"
                    style={{
                      padding: '10px 20px',
                      backgroundColor: '#667eea',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#5568d3'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#667eea'}
                  >
                    {editingUser ? 'Update User' : 'Create User'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Users List */}
          {loading ? (
            <div style={{ 
              textAlign: 'center', 
              padding: '60px 20px', 
              backgroundColor: 'white',
              borderRadius: '12px',
              border: '1px solid #e5e7eb'
            }}>
              <RefreshCw size={32} color="#667eea" className="spinning" style={{ marginBottom: '12px' }} />
              <p style={{ color: '#6b7280', fontSize: '14px', margin: 0 }}>Loading users...</p>
            </div>
          ) : !appUsers || appUsers.length === 0 ? (
            <div style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '60px 20px',
              textAlign: 'center',
              border: '1px solid #e5e7eb'
            }}>
              <Users size={48} color="#d1d5db" style={{ marginBottom: '16px' }} />
              <p style={{ color: '#6b7280', fontSize: '16px', margin: 0, fontWeight: '500' }}>
                No app users yet
              </p>
              <p style={{ color: '#9ca3af', fontSize: '14px', margin: '8px 0 0 0' }}>
                Create your first app user to get started
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '16px' }}>
              {appUsers.map((user) => (
                <div
                  key={user.id}
                  style={{
                    backgroundColor: 'white',
                    borderRadius: '12px',
                    padding: isMobile ? '16px' : '20px',
                    border: '1px solid #e5e7eb',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                    transition: 'box-shadow 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.07)'}
                  onMouseLeave={(e) => e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)'}
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
                        fontWeight: '600',
                        marginBottom: '6px',
                        color: '#111827',
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
                        {user.description || 'No description'}
                      </p>
                      {user.device_id && (
                        <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px', margin: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Tablet size={14} /> Device: {user.device_id}
                        </p>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => handleToggleActive(user.id, user.is_active)}
                        style={{
                          padding: '8px 12px',
                          backgroundColor: user.is_active ? '#fef2f2' : '#d1fae5',
                          color: user.is_active ? '#dc2626' : '#059669',
                          border: user.is_active ? '1px solid #fecaca' : '1px solid #a7f3d0',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                        title={user.is_active ? 'Deactivate' : 'Activate'}
                      >
                        <Power size={14} />
                      </button>
                      
                      <button
                        onClick={() => handleEdit(user)}
                        style={{
                          padding: '8px 12px',
                          backgroundColor: '#eff6ff',
                          color: '#1e40af',
                          border: '1px solid #bfdbfe',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                        title="Edit"
                      >
                        <Edit2 size={14} />
                      </button>
                      
                      <button
                        onClick={() => handleDelete(user.id)}
                        style={{
                          padding: '8px 12px',
                          backgroundColor: '#fef2f2',
                          color: '#dc2626',
                          border: '1px solid #fecaca',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {user.permissions && Object.entries(user.permissions).some(([_, value]) => value) && (
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
                              fontWeight: '600',
                              textTransform: 'capitalize'
                            }}
                          >
                            {key}
                          </span>
                        )
                      ))}
                    </div>
                  )}
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

        input[type="checkbox"] {
          appearance: none;
          -webkit-appearance: none;
          width: 16px;
          height: 16px;
          border: 2px solid #d1d5db;
          borderRadius: 4px;
          background-color: white;
          cursor: pointer;
          position: relative;
          transition: all 0.2s;
        }

        input[type="checkbox"]:checked {
          background-color: #8b5cf6;
          border-color: #8b5cf6;
        }

        input[type="checkbox"]:checked::after {
          content: '✓';
          position: absolute;
          color: white;
          font-size: 12px;
          font-weight: bold;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
        }
      `}</style>
    </div>
  );
}