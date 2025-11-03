import { useState, useEffect, memo, useCallback } from 'react';
import { Plus, Edit2, Trash2, X, HelpCircle, Info, Car, Download, Search, Building, Radio, Settings, Star, Wifi, WifiOff, AlertCircle, AlertTriangle } from 'lucide-react';
import { api } from '../api/client';
import type { Charger, Building as BuildingType } from '../types';
import { useTranslation } from '../i18n';
import { CHARGER_PRESETS, getPreset, type PresetConfig } from './chargerPresets';
import ExportModal from '../components/ExportModal';
import DeleteCaptcha from '../components/DeleteCaptcha';

interface ChargerConnectionConfig {
  power_endpoint?: string;
  state_endpoint?: string;
  user_id_endpoint?: string;
  mode_endpoint?: string;
  ip_address?: string;
  port?: number;
  power_register?: number;
  state_register?: number;
  user_id_register?: number;
  mode_register?: number;
  unit_id?: number;
  listen_port?: number;
  power_key?: string;
  state_key?: string;
  user_id_key?: string;
  mode_key?: string;
  state_cable_locked?: string;
  state_waiting_auth?: string;
  state_charging?: string;
  state_idle?: string;
  mode_normal?: string;
  mode_priority?: string;
  // Loxone API fields
  loxone_host?: string;
  loxone_username?: string;
  loxone_password?: string;
  loxone_power_uuid?: string;
  loxone_state_uuid?: string;
  loxone_user_id_uuid?: string;
  loxone_mode_uuid?: string;
}

interface ChargerSession {
  charger_id: number;
  power_kwh: number;
  state: string;
  mode: string;
}

interface LoxoneConnectionStatus {
  [chargerId: number]: {
    charger_name: string;
    host: string;
    is_connected: boolean;
    last_reading: number;
    last_update: string;
    last_error?: string;
  };
}

interface DeletionImpact {
  charger_id: number;
  charger_name: string;
  sessions_count: number;
  oldest_session: string;
  newest_session: string;
  has_data: boolean;
}


// Modal component props interface
interface DeleteConfirmationModalProps {
  deletionImpact: DeletionImpact | null;
  deleteConfirmationText: string;
  deleteUnderstandChecked: boolean;
  captchaValid: boolean;
  onConfirmationTextChange: (text: string) => void;
  onUnderstandCheckChange: (checked: boolean) => void;
  onCaptchaValidationChange: (isValid: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
  t: (key: string) => string;
}

const DeleteConfirmationModal = memo(({
  deletionImpact,
  deleteConfirmationText,
  deleteUnderstandChecked,
  captchaValid,
  onConfirmationTextChange,
  onUnderstandCheckChange,
  onCaptchaValidationChange,
  onCancel,
  onConfirm,
  t
}: DeleteConfirmationModalProps) => {
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', zIndex: 2500, padding: '20px'
    }}>
      <div style={{
        backgroundColor: 'white', borderRadius: '16px', padding: '32px',
        maxWidth: '550px', width: '100%', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        maxHeight: '90vh', overflow: 'auto'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
          <div style={{
            width: '48px', height: '48px', borderRadius: '50%',
            backgroundColor: 'rgba(239, 68, 68, 0.1)', display: 'flex',
            alignItems: 'center', justifyContent: 'center'
          }}>
            <AlertTriangle size={24} color="#ef4444" />
          </div>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#1f2937', margin: 0 }}>
              {t('chargers.deleteConfirmTitle') || 'Confirm Deletion'}
            </h2>
            <p style={{ fontSize: '14px', color: '#6b7280', margin: '4px 0 0 0' }}>
              {t('chargers.deleteWarning') || 'This action cannot be undone'}
            </p>
          </div>
        </div>

        {deletionImpact && (
          <div style={{ marginBottom: '24px' }}>
            <div style={{
              backgroundColor: '#fef3c7', border: '2px solid #f59e0b',
              borderRadius: '12px', padding: '16px', marginBottom: '16px'
            }}>
              <p style={{ fontSize: '14px', fontWeight: '600', color: '#92400e', marginBottom: '12px' }}>
                {t('chargers.deleteImpactTitle') || 'The following will be permanently deleted:'}
              </p>
              <ul style={{ margin: 0, paddingLeft: '20px', color: '#92400e' }}>
                <li style={{ marginBottom: '8px' }}>
                  <strong>{deletionImpact.charger_name}</strong> {t('chargers.chargerWillBeDeleted') || '(Charger configuration)'}
                </li>
                {deletionImpact.has_data && (
                  <li style={{ marginBottom: '8px' }}>
                    <strong>{deletionImpact.sessions_count.toLocaleString()}</strong> {t('chargers.sessionsWillBeDeleted') || 'charging sessions'}
                    {deletionImpact.oldest_session && deletionImpact.newest_session && (
                      <div style={{ fontSize: '12px', marginTop: '4px', color: '#78350f' }}>
                        {t('chargers.dataRange') || 'Data from'} {new Date(deletionImpact.oldest_session).toLocaleDateString()} {t('common.to') || 'to'} {new Date(deletionImpact.newest_session).toLocaleDateString()}
                      </div>
                    )}
                  </li>
                )}
              </ul>
            </div>

            <div style={{
              backgroundColor: '#fee2e2', border: '2px solid #ef4444',
              borderRadius: '12px', padding: '16px', marginBottom: '16px'
            }}>
              <p style={{ fontSize: '13px', fontWeight: '600', color: '#991b1b', margin: 0 }}>
                âš ï¸ {t('chargers.dataLossWarning') || 'Warning: All historical data for this charger will be permanently lost. This cannot be recovered.'}
              </p>
            </div>

            <DeleteCaptcha onValidationChange={onCaptchaValidationChange} />

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px', color: '#374151' }}>
                {t('chargers.typeToConfirm') || 'Type the charger name to confirm:'}
              </label>
              <div style={{
                padding: '8px 12px', backgroundColor: '#f3f4f6',
                borderRadius: '6px', marginBottom: '8px', fontFamily: 'monospace',
                fontSize: '14px', fontWeight: '600', color: '#1f2937'
              }}>
                {deletionImpact.charger_name}
              </div>
              <input
                type="text"
                value={deleteConfirmationText}
                onChange={(e) => onConfirmationTextChange(e.target.value)}
                placeholder={t('chargers.typeChargerName') || 'Type charger name here...'}
                style={{
                  width: '100%', padding: '12px', border: '2px solid #e5e7eb',
                  borderRadius: '8px', fontSize: '14px', fontFamily: 'inherit'
                }}
              />
            </div>

            <label style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '12px', backgroundColor: '#f9fafb',
              borderRadius: '8px', cursor: 'pointer', marginBottom: '16px'
            }}>
              <input
                type="checkbox"
                checked={deleteUnderstandChecked}
                onChange={(e) => onUnderstandCheckChange(e.target.checked)}
                style={{ width: '20px', height: '20px', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                {t('chargers.understandDataLoss') || 'I understand that this will permanently delete all data and cannot be undone'}
              </span>
            </label>
          </div>
        )}

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1, padding: '12px', backgroundColor: '#f3f4f6',
              color: '#374151', border: 'none', borderRadius: '8px',
              fontSize: '14px', fontWeight: '600', cursor: 'pointer'
            }}
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={onConfirm}
            disabled={!deleteUnderstandChecked || deleteConfirmationText !== deletionImpact?.charger_name || !captchaValid}
            style={{
              flex: 1, padding: '12px',
              backgroundColor: (!deleteUnderstandChecked || deleteConfirmationText !== deletionImpact?.charger_name || !captchaValid) ? '#fca5a5' : '#ef4444',
              color: 'white', border: 'none', borderRadius: '8px',
              fontSize: '14px', fontWeight: '600',
              cursor: (!deleteUnderstandChecked || deleteConfirmationText !== deletionImpact?.charger_name || !captchaValid) ? 'not-allowed' : 'pointer',
              opacity: (!deleteUnderstandChecked || deleteConfirmationText !== deletionImpact?.charger_name || !captchaValid) ? 0.6 : 1
            }}
          >
            {t('chargers.deletePermanently') || 'Delete Permanently'}
          </button>
        </div>
      </div>
    </div>
  );
});

DeleteConfirmationModal.displayName = 'DeleteConfirmationModal';


export default function Chargers() {
  const { t } = useTranslation();
  const [chargers, setChargers] = useState<Charger[]>([]);
  const [buildings, setBuildings] = useState<BuildingType[]>([]);
  const [chargerSessions, setChargerSessions] = useState<Record<number, ChargerSession>>({});
  const [loxoneStatus, setLoxoneStatus] = useState<LoxoneConnectionStatus>({});
  const [selectedBuildingId, setSelectedBuildingId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [chargerToDelete, setChargerToDelete] = useState<Charger | null>(null);
  const [deletionImpact, setDeletionImpact] = useState<DeletionImpact | null>(null);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [deleteUnderstandChecked, setDeleteUnderstandChecked] = useState(false);
  const [captchaValid, setCaptchaValid] = useState(false);
  const [editingCharger, setEditingCharger] = useState<Charger | null>(null);
  const [formData, setFormData] = useState<Partial<Charger>>({
    name: '', brand: 'weidmuller', preset: 'weidmuller', building_id: 0,
    connection_type: 'loxone_api', connection_config: '{}',
    notes: '', is_active: true
  });
  const [connectionConfig, setConnectionConfig] = useState<ChargerConnectionConfig>({
    power_endpoint: '',
    state_endpoint: '',
    user_id_endpoint: '',
    mode_endpoint: '',
    ip_address: '',
    port: 502,
    power_register: 0,
    state_register: 1,
    user_id_register: 2,
    mode_register: 3,
    unit_id: 1,
    listen_port: 8888,
    power_key: '',
    state_key: '',
    user_id_key: '',
    mode_key: '',
    state_cable_locked: '65',
    state_waiting_auth: '66',
    state_charging: '67',
    state_idle: '50',
    mode_normal: '1',
    mode_priority: '2',
    loxone_host: '',
    loxone_username: '',
    loxone_password: '',
    loxone_power_uuid: '',
    loxone_state_uuid: '',
    loxone_user_id_uuid: '',
    loxone_mode_uuid: ''
  });

  // Memoize the cancel handler
  const handleDeleteCancel = useCallback(() => {
    setShowDeleteConfirmation(false);
    setChargerToDelete(null);
    setDeletionImpact(null);
    setDeleteConfirmationText('');
    setDeleteUnderstandChecked(false);
    setCaptchaValid(false);
  }, []);


  useEffect(() => {
    loadData();
    fetchLoxoneStatus();

    // Poll for Loxone status and sessions every 30 seconds
    const interval = setInterval(() => {
      fetchLoxoneStatus();
      loadChargerSessions();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    const [chargersData, buildingsData] = await Promise.all([
      api.getChargers(),
      api.getBuildings()
    ]);
    setChargers(chargersData);
    setBuildings(buildingsData.filter(b => !b.is_group));
    loadChargerSessions();
  };

  const fetchLoxoneStatus = async () => {
    try {
      const debugData = await api.getDebugStatus();
      if (debugData.loxone_charger_connections) {
        setLoxoneStatus(debugData.loxone_charger_connections);
      }
    } catch (error) {
      console.error('Failed to fetch Loxone charger status:', error);
    }
  };

  const loadChargerSessions = async () => {
    try {
      const response = await fetch('/api/chargers/sessions/latest', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (response.ok) {
        const sessions = await response.json();
        const sessionsMap: Record<number, ChargerSession> = {};
        sessions.forEach((session: ChargerSession) => {
          sessionsMap[session.charger_id] = session;
        });
        setChargerSessions(sessionsMap);
      }
    } catch (err) {
      console.error('Failed to load charger sessions:', err);
    }
  };

  const generateUUID = (): string => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };

  const generateUniqueKeys = () => {
    const baseUUID = generateUUID();
    return {
      power_key: `${baseUUID}_power`,
      state_key: `${baseUUID}_state`,
      user_id_key: `${baseUUID}_user`,
      mode_key: `${baseUUID}_mode`
    };
  };

  const getCurrentPreset = (): PresetConfig => {
    return getPreset(formData.preset || 'weidmuller');
  };

  const getStateDisplay = (charger: Charger, stateValue?: string): string => {
    if (!stateValue) return t('chargers.state.unknown');

    try {
      const config = JSON.parse(charger.connection_config);
      // Convert both values to strings for comparison to handle number/string mismatches
      const stateStr = String(stateValue).trim();
      if (stateStr === String(config.state_cable_locked).trim()) return t('chargers.state.cableLocked');
      if (stateStr === String(config.state_waiting_auth).trim()) return t('chargers.state.waitingAuth');
      if (stateStr === String(config.state_charging).trim()) return t('chargers.state.charging');
      if (stateStr === String(config.state_idle).trim()) return t('chargers.state.idle');

      // Log for debugging if no match found
      console.log(`State value '${stateStr}' did not match any configured states for charger ${charger.name}`);
    } catch (e) {
      console.error('Failed to parse charger config:', e);
    }

    return t('chargers.state.unknown');
  };

  const getModeDisplay = (charger: Charger, modeValue?: string): string => {
    if (!modeValue) return t('chargers.mode.unknown');
  
    try {
      const config = JSON.parse(charger.connection_config);
      // Convert both values to strings for comparison to handle number/string mismatches
      const modeStr = String(modeValue).trim();
      if (modeStr === String(config.mode_normal).trim()) return t('chargers.mode.normal');
      if (modeStr === String(config.mode_priority).trim()) return t('chargers.mode.priority');
      
      // Log for debugging if no match found
      console.log(`Mode value '${modeStr}' did not match any configured modes for charger ${charger.name}`, {
        received: modeStr,
        configured: {
          normal: String(config.mode_normal).trim(),
          priority: String(config.mode_priority).trim()
        }
      });
    } catch (e) {
      console.error('Failed to parse charger config:', e);
    }
  
    return t('chargers.mode.unknown');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let config: ChargerConnectionConfig = {};

    if (formData.connection_type === 'loxone_api') {
      config = {
        loxone_host: connectionConfig.loxone_host,
        loxone_username: connectionConfig.loxone_username,
        loxone_password: connectionConfig.loxone_password,
        loxone_power_uuid: connectionConfig.loxone_power_uuid,
        loxone_state_uuid: connectionConfig.loxone_state_uuid,
        loxone_user_id_uuid: connectionConfig.loxone_user_id_uuid,
        loxone_mode_uuid: connectionConfig.loxone_mode_uuid,
        state_cable_locked: connectionConfig.state_cable_locked,
        state_waiting_auth: connectionConfig.state_waiting_auth,
        state_charging: connectionConfig.state_charging,
        state_idle: connectionConfig.state_idle,
        mode_normal: connectionConfig.mode_normal,
        mode_priority: connectionConfig.mode_priority
      };
    } else if (formData.connection_type === 'http') {
      config = {
        power_endpoint: connectionConfig.power_endpoint,
        state_endpoint: connectionConfig.state_endpoint,
        user_id_endpoint: connectionConfig.user_id_endpoint,
        mode_endpoint: connectionConfig.mode_endpoint,
        state_cable_locked: connectionConfig.state_cable_locked,
        state_waiting_auth: connectionConfig.state_waiting_auth,
        state_charging: connectionConfig.state_charging,
        state_idle: connectionConfig.state_idle,
        mode_normal: connectionConfig.mode_normal,
        mode_priority: connectionConfig.mode_priority
      };
    } else if (formData.connection_type === 'modbus_tcp') {
      config = {
        ip_address: connectionConfig.ip_address,
        port: connectionConfig.port,
        power_register: connectionConfig.power_register,
        state_register: connectionConfig.state_register,
        user_id_register: connectionConfig.user_id_register,
        mode_register: connectionConfig.mode_register,
        unit_id: connectionConfig.unit_id,
        state_cable_locked: connectionConfig.state_cable_locked,
        state_waiting_auth: connectionConfig.state_waiting_auth,
        state_charging: connectionConfig.state_charging,
        state_idle: connectionConfig.state_idle,
        mode_normal: connectionConfig.mode_normal,
        mode_priority: connectionConfig.mode_priority
      };
    } else if (formData.connection_type === 'udp') {
      config = {
        listen_port: connectionConfig.listen_port,
        power_key: connectionConfig.power_key,
        state_key: connectionConfig.state_key,
        user_id_key: connectionConfig.user_id_key,
        mode_key: connectionConfig.mode_key,
        state_cable_locked: connectionConfig.state_cable_locked,
        state_waiting_auth: connectionConfig.state_waiting_auth,
        state_charging: connectionConfig.state_charging,
        state_idle: connectionConfig.state_idle,
        mode_normal: connectionConfig.mode_normal,
        mode_priority: connectionConfig.mode_priority
      };
    }

    const dataToSend = {
      ...formData,
      connection_config: JSON.stringify(config)
    };

    try {
      if (editingCharger) {
        await api.updateCharger(editingCharger.id, dataToSend);
      } else {
        await api.createCharger(dataToSend);
      }
      setShowModal(false);
      setEditingCharger(null);
      resetForm();
      loadData();
      // Refresh Loxone status after creating/updating
      setTimeout(fetchLoxoneStatus, 2000);
    } catch (err) {
      alert(t('chargers.saveFailed'));
    }
  };

  const handleDeleteClick = async (charger: Charger) => {
    setChargerToDelete(charger);
    setDeleteConfirmationText('');
    setDeleteUnderstandChecked(false);
    setCaptchaValid(false);
    
    try {
      // Use the fetch API directly since the method might not be in the API client yet
      const response = await fetch(`/api/chargers/${charger.id}/deletion-impact`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        const impact = await response.json();
        setDeletionImpact(impact);
      } else {
        // If endpoint doesn't exist, create basic impact
        setDeletionImpact({
          charger_id: charger.id,
          charger_name: charger.name,
          sessions_count: 0,
          oldest_session: '',
          newest_session: '',
          has_data: false
        });
      }
      setShowDeleteConfirmation(true);
    } catch (err) {
      console.error('Failed to get deletion impact:', err);
      // If we can't get the impact, still allow deletion but without the details
      setDeletionImpact({
        charger_id: charger.id,
        charger_name: charger.name,
        sessions_count: 0,
        oldest_session: '',
        newest_session: '',
        has_data: false
      });
      setShowDeleteConfirmation(true);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!chargerToDelete || !deletionImpact) return;
    
    // Validate confirmation
    if (deleteConfirmationText !== deletionImpact.charger_name) {
      alert(t('chargers.deleteNameMismatch') || 'The charger name does not match. Please type it exactly as shown.');
      return;
    }
    
    if (!deleteUnderstandChecked) {
      alert(t('chargers.deleteCheckRequired') || 'Please check the confirmation box to proceed.');
      return;
    }

    if (!captchaValid) {
      alert(t('chargers.captchaRequired') || 'Please solve the security challenge to proceed.');
      return;
    }

    try {
      await api.deleteCharger(chargerToDelete.id);
      setShowDeleteConfirmation(false);
      setChargerToDelete(null);
      setDeletionImpact(null);
      setDeleteConfirmationText('');
      setDeleteUnderstandChecked(false);
      setCaptchaValid(false);
      loadData();
      fetchLoxoneStatus();
    } catch (err) {
      alert(t('chargers.deleteFailed'));
    }
  };

  const handleEdit = (charger: Charger) => {
    setEditingCharger(charger);
    setFormData(charger);

    try {
      const config = JSON.parse(charger.connection_config);
      const preset = getPreset(charger.preset);

      setConnectionConfig({
        power_endpoint: config.power_endpoint || '',
        state_endpoint: config.state_endpoint || '',
        user_id_endpoint: config.user_id_endpoint || '',
        mode_endpoint: config.mode_endpoint || '',
        ip_address: config.ip_address || '',
        port: config.port || 502,
        power_register: config.power_register || 0,
        state_register: config.state_register || 1,
        user_id_register: config.user_id_register || 2,
        mode_register: config.mode_register || 3,
        unit_id: config.unit_id || 1,
        listen_port: config.listen_port || 8888,
        power_key: config.power_key || '',
        state_key: config.state_key || '',
        user_id_key: config.user_id_key || '',
        mode_key: config.mode_key || '',
        state_cable_locked: config.state_cable_locked || preset.defaultStateMappings.cable_locked,
        state_waiting_auth: config.state_waiting_auth || preset.defaultStateMappings.waiting_auth,
        state_charging: config.state_charging || preset.defaultStateMappings.charging,
        state_idle: config.state_idle || preset.defaultStateMappings.idle,
        mode_normal: config.mode_normal || preset.defaultModeMappings.normal,
        mode_priority: config.mode_priority || preset.defaultModeMappings.priority,
        loxone_host: config.loxone_host || '',
        loxone_username: config.loxone_username || '',
        loxone_password: config.loxone_password || '',
        loxone_power_uuid: config.loxone_power_uuid || '',
        loxone_state_uuid: config.loxone_state_uuid || '',
        loxone_user_id_uuid: config.loxone_user_id_uuid || '',
        loxone_mode_uuid: config.loxone_mode_uuid || ''
      });
    } catch (e) {
      console.error('Failed to parse config:', e);
    }

    setShowModal(true);
  };

  const handleExport = async (startDate: string, endDate: string, chargerId?: number) => {
    try {
      const params = new URLSearchParams({
        type: 'chargers',
        start_date: startDate,
        end_date: endDate
      });

      if (chargerId) {
        params.append('charger_id', chargerId.toString());
      }

      const response = await fetch(`/api/export/data?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Export failed: ${response.status} - ${errorText}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      const chargerName = chargerId ? chargers.find(c => c.id === chargerId)?.name.replace(/\s+/g, '-') : 'all';
      a.download = `chargers-${chargerName}-${startDate}-to-${endDate}.csv`;

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      setShowExportModal(false);
    } catch (error) {
      console.error('Export error:', error);
      alert(t('chargers.exportFailed') || 'Export failed. Please try again.');
    }
  };

  const resetForm = () => {
    const preset = getPreset('weidmuller');
    setFormData({
      name: '', brand: 'weidmuller', preset: 'weidmuller', building_id: 0,
      connection_type: 'loxone_api', connection_config: '{}',
      notes: '', is_active: true
    });
    setConnectionConfig({
      power_endpoint: '',
      state_endpoint: '',
      user_id_endpoint: '',
      mode_endpoint: '',
      ip_address: '',
      port: 502,
      power_register: 0,
      state_register: 1,
      user_id_register: 2,
      mode_register: 3,
      unit_id: 1,
      listen_port: 8888,
      power_key: '',
      state_key: '',
      user_id_key: '',
      mode_key: '',
      state_cable_locked: preset.defaultStateMappings.cable_locked,
      state_waiting_auth: preset.defaultStateMappings.waiting_auth,
      state_charging: preset.defaultStateMappings.charging,
      state_idle: preset.defaultStateMappings.idle,
      mode_normal: preset.defaultModeMappings.normal,
      mode_priority: preset.defaultModeMappings.priority,
      loxone_host: '',
      loxone_username: '',
      loxone_password: '',
      loxone_power_uuid: '',
      loxone_state_uuid: '',
      loxone_user_id_uuid: '',
      loxone_mode_uuid: ''
    });
  };

  const handleAddCharger = () => {
    resetForm();
    const uniqueKeys = generateUniqueKeys();
    setConnectionConfig(prev => ({
      ...prev,
      ...uniqueKeys
    }));
    setShowModal(true);
  };

  const handlePresetChange = (presetName: string) => {
    const preset = getPreset(presetName);
    setFormData({
      ...formData,
      brand: presetName,
      preset: presetName
    });
    setConnectionConfig({
      ...connectionConfig,
      state_cable_locked: preset.defaultStateMappings.cable_locked,
      state_waiting_auth: preset.defaultStateMappings.waiting_auth,
      state_charging: preset.defaultStateMappings.charging,
      state_idle: preset.defaultStateMappings.idle,
      mode_normal: preset.defaultModeMappings.normal,
      mode_priority: preset.defaultModeMappings.priority
    });
  };

  const getLoxoneConnectionStatus = (chargerId: number) => {
    return loxoneStatus[chargerId];
  };

  const renderConnectionStatus = (charger: Charger) => {
    if (charger.connection_type === 'loxone_api') {
      const status = getLoxoneConnectionStatus(charger.id);
      if (status) {
        return (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            backgroundColor: status.is_connected ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            borderRadius: '8px',
            marginTop: '12px'
          }}>
            {status.is_connected ? (
              <>
                <Wifi size={16} style={{ color: '#22c55e' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: '#22c55e' }}>
                    {t('chargers.loxoneConnected')}
                  </div>
                  <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
                    {t('chargers.lastUpdate')}: {new Date(status.last_update).toLocaleTimeString(undefined, { hour12: false })}
                  </div>
                </div>
              </>
            ) : (
              <>
                <WifiOff size={16} style={{ color: '#ef4444' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: '#ef4444' }}>
                    {t('chargers.loxoneDisconnected')}
                  </div>
                  {status.last_error && (
                    <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
                      {status.last_error}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        );
      }
      return (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          backgroundColor: 'rgba(156, 163, 175, 0.1)',
          borderRadius: '8px',
          marginTop: '12px'
        }}>
          <Wifi size={16} style={{ color: '#9ca3af' }} />
          <div style={{ fontSize: '12px', color: '#6b7280' }}>
            {t('chargers.loxoneConnecting')}
          </div>
        </div>
      );
    }
    return null;
  };

  const filteredBuildings = buildings.filter(b =>
    b.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredChargers = selectedBuildingId
    ? chargers.filter(c => c.building_id === selectedBuildingId)
    : chargers;

  const groupedChargers = filteredChargers.reduce((acc, charger) => {
    if (!acc[charger.building_id]) {
      acc[charger.building_id] = [];
    }
    acc[charger.building_id].push(charger);
    return acc;
  }, {} as Record<number, Charger[]>);

  const exportItems = chargers.map(c => {
    const building = buildings.find(b => b.id === c.building_id);
    return {
      id: c.id,
      name: c.name,
      building_id: c.building_id,
      building_name: building?.name || 'Unknown Building'
    };
  });


  const InstructionsModal = () => (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', zIndex: 2000, padding: '20px'
    }}>
      <div className="modal-content instructions-modal" style={{
        backgroundColor: 'white', borderRadius: '12px', padding: '30px',
        maxWidth: '800px', maxHeight: '90vh', overflow: 'auto', width: '100%'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold' }}>{t('chargers.instructions.title')}</h2>
          <button onClick={() => setShowInstructions(false)}
            style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        <div style={{ lineHeight: '1.8', color: '#374151' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', marginTop: '20px', marginBottom: '10px', color: '#1f2937', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Wifi size={20} color="#10b981" />
            {t('chargers.instructions.loxoneTitle')}
          </h3>
          <div style={{ backgroundColor: '#d1fae5', padding: '16px', borderRadius: '8px', marginBottom: '16px', border: '2px solid #10b981' }}>
            <p style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <Star size={16} fill="#fbbf24" color="#fbbf24" />
              <strong>{t('chargers.instructions.loxoneRecommended')}</strong>
            </p>

            <h4 style={{ fontSize: '15px', fontWeight: '600', marginTop: '16px', marginBottom: '8px' }}>
              {t('chargers.instructions.loxoneUuidTitle')}
            </h4>
            <p style={{ fontSize: '13px', marginBottom: '8px' }}>
              {t('chargers.instructions.loxoneChargerRequires')}
            </p>
            <ul style={{ marginLeft: '20px', marginBottom: '12px', fontSize: '13px' }}>
              <li><strong>{t('chargers.instructions.loxonePowerUuid')}</strong></li>
              <li><strong>{t('chargers.instructions.loxoneStateUuid')}</strong></li>
              <li><strong>{t('chargers.instructions.loxoneUserIdUuid')}</strong></li>
              <li><strong>{t('chargers.instructions.loxoneModeUuid')}</strong></li>
            </ul>

            <h4 style={{ fontSize: '15px', fontWeight: '600', marginTop: '16px', marginBottom: '8px' }}>
              {t('chargers.instructions.loxoneFindingUuid')}
            </h4>
            <ol style={{ marginLeft: '20px', marginBottom: '12px', fontSize: '13px' }}>
              <li>{t('chargers.instructions.loxoneUuidStep1')}</li>
              <li>{t('chargers.instructions.loxoneUuidStep2')}</li>
              <li>{t('chargers.instructions.loxoneUuidStep3')}</li>
              <li>{t('chargers.instructions.loxoneUuidStep4')}</li>
            </ol>

            <h4 style={{ fontSize: '15px', fontWeight: '600', marginTop: '16px', marginBottom: '8px' }}>
              {t('chargers.instructions.loxoneSetupTitle')}
            </h4>
            <ol style={{ marginLeft: '20px', marginTop: '10px', fontSize: '13px' }}>
              <li>{t('chargers.instructions.loxoneStep1')}</li>
              <li>{t('chargers.instructions.loxoneStep2')}</li>
              <li>{t('chargers.instructions.loxoneStep3')}</li>
              <li>{t('chargers.instructions.loxoneStep4')}</li>
              <li>{t('chargers.instructions.loxoneStep5')}</li>
            </ol>

            <div style={{ backgroundColor: '#fff', padding: '12px', borderRadius: '6px', marginTop: '10px', fontFamily: 'monospace', fontSize: '12px' }}>
              <strong>{t('chargers.instructions.loxoneExample')}</strong><br />
              {t('chargers.instructions.loxoneExampleHost')}<br />
              {t('chargers.instructions.loxoneExampleUuids')}<br />
              {t('chargers.instructions.loxoneExampleCredentials')}<br /><br />
              <strong>{t('chargers.instructions.loxoneBenefits')}</strong><br />
              {t('chargers.instructions.loxoneBenefit1')}<br />
              {t('chargers.instructions.loxoneBenefit2')}<br />
              {t('chargers.instructions.loxoneBenefit3')}
            </div>
          </div>

          <h3 style={{ fontSize: '18px', fontWeight: '600', marginTop: '20px', marginBottom: '10px', color: '#1f2937', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Radio size={20} color="#f59e0b" />
            {t('chargers.instructions.udpTitle')}
          </h3>
          <div style={{ backgroundColor: '#fef3c7', padding: '16px', borderRadius: '8px', marginBottom: '16px', border: '2px solid #f59e0b' }}>
            <p style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={16} color="#f59e0b" />
              <strong>{t('chargers.instructions.udpDeprecated')}</strong>
            </p>
            <p style={{ marginTop: '10px', fontSize: '13px' }}>{t('chargers.instructions.udpDescription')}</p>
          </div>

          <h3 style={{ fontSize: '18px', fontWeight: '600', marginTop: '20px', marginBottom: '10px', color: '#1f2937', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Settings size={20} color="#6b7280" />
            {t('chargers.instructions.stateAndModeTitle')}
          </h3>
          <div style={{ backgroundColor: '#f3f4f6', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
            <p style={{ fontSize: '13px' }}><strong>{t('chargers.instructions.stateModeDescription')}</strong></p>
            <p style={{ marginTop: '10px', fontSize: '13px' }}>{t('chargers.instructions.stateModeInfo')}</p>
          </div>

          <h3 style={{ fontSize: '18px', fontWeight: '600', marginTop: '20px', marginBottom: '10px', color: '#1f2937', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={20} color="#f59e0b" />
            {t('chargers.instructions.troubleshootingTitle')}
          </h3>
          <div style={{ backgroundColor: '#fef3c7', padding: '16px', borderRadius: '8px', border: '1px solid #f59e0b' }}>
            <ul style={{ marginLeft: '20px', fontSize: '13px' }}>
              <li><strong>Loxone WebSocket:</strong> {t('chargers.instructions.troubleshootingLoxoneWebSocket')}</li>
              <li><strong>Loxone WebSocket:</strong> {t('chargers.instructions.troubleshootingLoxoneAuth')}</li>
              <li><strong>Loxone WebSocket:</strong> {t('chargers.instructions.troubleshootingLoxoneUuids')}</li>
              <li>{t('chargers.instructions.troubleshootingService')} <code style={{ backgroundColor: '#fff', padding: '2px 6px', borderRadius: '4px' }}>sudo systemctl status zev-billing</code></li>
              <li>{t('chargers.instructions.troubleshootingLogs')} <code style={{ backgroundColor: '#fff', padding: '2px 6px', borderRadius: '4px' }}>journalctl -u zev-billing -f</code></li>
              <li>{t('chargers.instructions.troubleshootingNetwork')} <code style={{ backgroundColor: '#fff', padding: '2px 6px', borderRadius: '4px' }}>ping YOUR_LOXONE_IP</code></li>
              <li>{t('chargers.instructions.troubleshootingMonitor')}</li>
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
    <div className="chargers-container">
      <div className="chargers-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', gap: '15px', flexWrap: 'wrap' }}>
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
            <Car size={36} style={{ color: '#667eea' }} />
            {t('chargers.title')}
          </h1>
          <p style={{ color: '#6b7280', fontSize: '16px' }}>
            {t('chargers.subtitle')}
          </p>
        </div>
        <div className="button-group-header" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowExportModal(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
              backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px', cursor: 'pointer'
            }}
          >
            <Download size={18} />
            {t('chargers.exportData')}
          </button>
          <button
            onClick={() => setShowInstructions(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
              backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px', cursor: 'pointer'
            }}
          >
            <HelpCircle size={18} />
            {t('chargers.setupInstructions')}
          </button>
          <button
            onClick={handleAddCharger}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
              backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px', cursor: 'pointer'
            }}
          >
            <Plus size={18} />
            {t('chargers.addCharger')}
          </button>
        </div>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <div style={{ position: 'relative', maxWidth: '400px' }}>
          <Search size={20} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
          <input
            type="text"
            placeholder={t('dashboard.searchBuildings')}
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

      <div className="building-cards-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
        gap: '16px',
        marginBottom: '30px'
      }}>
        <div
          onClick={() => setSelectedBuildingId(null)}
          style={{
            padding: '20px',
            backgroundColor: selectedBuildingId === null ? '#667eea' : 'white',
            color: selectedBuildingId === null ? 'white' : '#1f2937',
            borderRadius: '12px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            cursor: 'pointer',
            transition: 'all 0.2s',
            border: selectedBuildingId === null ? '2px solid #667eea' : '2px solid transparent'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <Building size={24} />
            <h3 style={{ fontSize: '18px', fontWeight: '600', margin: 0 }}>
              {t('dashboard.allBuildings')}
            </h3>
          </div>
          <p style={{ fontSize: '14px', margin: 0, opacity: 0.9 }}>
            {chargers.length} {t('chargers.chargersCount')}
          </p>
        </div>

        {filteredBuildings.map(building => {
          const buildingChargers = chargers.filter(c => c.building_id === building.id);
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
                {buildingChargers.length} {t('chargers.chargersCount')}
              </p>
            </div>
          );
        })}
      </div>

      {Object.entries(groupedChargers).map(([buildingId, buildingChargers]) => {
        const building = buildings.find(b => b.id === parseInt(buildingId));
        return (
          <div key={buildingId} style={{ marginBottom: '30px' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '16px', color: '#1f2937' }}>
              {building?.name || t('common.unknownBuilding')}
            </h2>
            <div className="chargers-grid" style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: '20px'
            }}>
              {buildingChargers.map(charger => {
                const chargerPreset = getPreset(charger.preset);
                const session = chargerSessions[charger.id];
                return (
                  <div key={charger.id} className="charger-card" style={{
                    backgroundColor: 'white',
                    borderRadius: '16px',
                    padding: '24px',
                    boxShadow: '0 4px 6px rgba(0,0,0,0.07)',
                    border: '1px solid #f0f0f0',
                    position: 'relative',
                    transition: 'all 0.2s ease',
                  }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.boxShadow = '0 8px 12px rgba(0,0,0,0.12)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.07)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}>
                    <div style={{
                      position: 'absolute',
                      top: '16px',
                      right: '16px',
                      display: 'flex',
                      gap: '8px'
                    }}>
                      <button
                        onClick={() => handleEdit(charger)}
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          border: 'none',
                          backgroundColor: 'rgba(59, 130, 246, 0.1)',
                          color: '#3b82f6',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.2)';
                          e.currentTarget.style.transform = 'scale(1.1)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
                          e.currentTarget.style.transform = 'scale(1)';
                        }}
                        title={t('common.edit')}
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteClick(charger)}
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          border: 'none',
                          backgroundColor: 'rgba(239, 68, 68, 0.1)',
                          color: '#ef4444',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.2)';
                          e.currentTarget.style.transform = 'scale(1.1)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
                          e.currentTarget.style.transform = 'scale(1)';
                        }}
                        title={t('common.delete')}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <div style={{ paddingRight: '72px' }}>
                      <h3 style={{
                        fontSize: '20px',
                        fontWeight: '600',
                        marginBottom: '6px',
                        color: '#1f2937',
                        lineHeight: '1.3'
                      }}>
                        {charger.name}
                      </h3>
                      <p style={{
                        fontSize: '14px',
                        color: '#6b7280',
                        margin: 0,
                        textTransform: 'capitalize'
                      }}>
                        {chargerPreset.label}
                      </p>
                    </div>

                    <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #f3f4f6' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <span style={{ fontSize: '13px', color: '#9ca3af', fontWeight: '500' }}>{t('chargers.connection')}</span>
                        <span style={{
                          fontSize: '13px',
                          fontWeight: '600',
                          color: '#667eea',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px'
                        }}>
                          {charger.connection_type === 'loxone_api' ? 'Loxone WebSocket' : charger.connection_type}
                        </span>
                      </div>

                      {session && (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <span style={{ fontSize: '13px', color: '#9ca3af', fontWeight: '500' }}>{t('chargers.lastReading')}</span>
                            <span style={{ fontSize: '15px', fontWeight: '600', color: '#1f2937' }}>
                              {session.power_kwh ? `${session.power_kwh.toFixed(3)} kWh` : '-'}
                            </span>
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <span style={{ fontSize: '13px', color: '#9ca3af', fontWeight: '500' }}>{t('chargers.currentState')}</span>
                            <span style={{
                              padding: '4px 12px',
                              borderRadius: '20px',
                              fontSize: '12px',
                              fontWeight: '600',
                              backgroundColor: session.state === 'charging' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                              color: session.state === 'charging' ? '#22c55e' : '#3b82f6'
                            }}>
                              {getStateDisplay(charger, session.state)}
                            </span>
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <span style={{ fontSize: '13px', color: '#9ca3af', fontWeight: '500' }}>{t('chargers.currentMode')}</span>
                            <span style={{
                              padding: '4px 12px',
                              borderRadius: '20px',
                              fontSize: '12px',
                              fontWeight: '600',
                              backgroundColor: session.mode === 'priority' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(107, 114, 128, 0.1)',
                              color: session.mode === 'priority' ? '#f59e0b' : '#6b7280'
                            }}>
                              {getModeDisplay(charger, session.mode)}
                            </span>
                          </div>
                        </>
                      )}

                      {chargerPreset.supportsPriority && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                          <span style={{ fontSize: '13px', color: '#9ca3af', fontWeight: '500' }}>{t('chargers.priorityMode')}</span>
                          <span style={{
                            fontSize: '13px',
                            fontWeight: '600',
                            color: '#22c55e'
                          }}>
                            âœ“ {t('chargers.supported')}
                          </span>
                        </div>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '13px', color: '#9ca3af', fontWeight: '500' }}>{t('common.status')}</span>
                        <span style={{
                          padding: '4px 12px',
                          borderRadius: '20px',
                          fontSize: '12px',
                          fontWeight: '600',
                          backgroundColor: charger.is_active ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                          color: charger.is_active ? '#22c55e' : '#ef4444'
                        }}>
                          {charger.is_active ? t('common.active') : t('common.inactive')}
                        </span>
                      </div>
                    </div>

                    {renderConnectionStatus(charger)}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {filteredChargers.length === 0 && (
        <div style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '60px 20px',
          textAlign: 'center',
          color: '#999',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          {t('chargers.noChargers')}
        </div>
      )}

      {showInstructions && <InstructionsModal />}
      {showDeleteConfirmation && deletionImpact && (
        <DeleteConfirmationModal
          deletionImpact={deletionImpact}
          deleteConfirmationText={deleteConfirmationText}
          deleteUnderstandChecked={deleteUnderstandChecked}
          captchaValid={captchaValid}
          onConfirmationTextChange={setDeleteConfirmationText}
          onUnderstandCheckChange={setDeleteUnderstandChecked}
          onCaptchaValidationChange={setCaptchaValid}
          onCancel={handleDeleteCancel}
          onConfirm={handleDeleteConfirm}
          t={t}
        />
      )}
      {showExportModal && (
        <ExportModal
          type="chargers"
          items={exportItems}
          buildings={buildings.map(b => ({ id: b.id, name: b.name }))}
          onClose={() => setShowExportModal(false)}
          onExport={handleExport}
        />
      )}

      {showModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          padding: '15px'
        }}>
          <div className="modal-content" style={{
            backgroundColor: 'white', borderRadius: '12px', padding: '30px',
            width: '90%', maxWidth: '700px', maxHeight: '90vh', overflow: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <h2 style={{ fontSize: '24px', fontWeight: 'bold' }}>
                  {editingCharger ? t('chargers.editCharger') : t('chargers.addCharger')}
                </h2>
                <button
                  onClick={() => setShowInstructions(true)}
                  style={{ padding: '6px', border: 'none', background: 'none', cursor: 'pointer', color: '#007bff' }}
                  title={t('chargers.setupInstructions')}
                >
                  <Info size={20} />
                </button>
              </div>
              <button onClick={() => { setShowModal(false); setEditingCharger(null); }} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>{t('common.name')} *</label>
                <input type="text" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
              </div>

              <div style={{ marginTop: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>{t('chargers.brandPreset')} *</label>
                <select required value={formData.brand} onChange={(e) => handlePresetChange(e.target.value)}
                  style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}>
                  {Object.values(CHARGER_PRESETS).map(preset => (
                    <option key={preset.name} value={preset.name}>{preset.label}</option>
                  ))}
                </select>
                <p style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                  {getCurrentPreset().description}
                </p>
              </div>

              <div style={{ marginTop: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>{t('users.building')} *</label>
                <select required value={formData.building_id} onChange={(e) => setFormData({ ...formData, building_id: parseInt(e.target.value) })}
                  style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}>
                  <option value={0}>{t('users.selectBuilding')}</option>
                  {buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>

              <div style={{ marginTop: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>{t('meters.connectionType')} *</label>
                <select required value={formData.connection_type} onChange={(e) => setFormData({ ...formData, connection_type: e.target.value })}
                  style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}>
                  <option value="loxone_api">{t('chargers.loxoneApiRecommended')}</option>
                  <option value="udp">{t('chargers.udpAlternative')}</option>
                  <option value="http">{t('meters.http')}</option>
                  <option value="modbus_tcp">{t('meters.modbusTcp')}</option>
                </select>
              </div>

              <div style={{ marginTop: '20px', padding: '20px', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>
                  {t('chargers.connectionConfig')}
                </h3>

                {formData.connection_type === 'loxone_api' && (
                  <>
                    <div style={{ backgroundColor: '#d1fae5', padding: '12px', borderRadius: '6px', marginBottom: '12px', border: '1px solid #10b981', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Wifi size={16} color="#10b981" />
                      <p style={{ fontSize: '13px', color: '#065f46', margin: 0 }}>
                        <strong>{t('chargers.loxoneApiDescription')}</strong>
                      </p>
                    </div>

                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                        {t('chargers.loxoneHost')} *
                      </label>
                      <input type="text" required value={connectionConfig.loxone_host || ''}
                        onChange={(e) => setConnectionConfig({ ...connectionConfig, loxone_host: e.target.value })}
                        placeholder="192.168.1.100"
                        style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                      <p style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                        {t('chargers.loxoneHostDescription')}
                      </p>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          {t('chargers.loxonePowerUuid')} *
                        </label>
                        <input type="text" required value={connectionConfig.loxone_power_uuid || ''}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, loxone_power_uuid: e.target.value })}
                          placeholder="1a2b3c4d-..."
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontFamily: 'monospace', fontSize: '12px' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          {t('chargers.loxoneStateUuid')} *
                        </label>
                        <input type="text" required value={connectionConfig.loxone_state_uuid || ''}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, loxone_state_uuid: e.target.value })}
                          placeholder="2b3c4d5e-..."
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontFamily: 'monospace', fontSize: '12px' }} />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          {t('chargers.loxoneUserIdUuid')} *
                        </label>
                        <input type="text" required value={connectionConfig.loxone_user_id_uuid || ''}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, loxone_user_id_uuid: e.target.value })}
                          placeholder="3c4d5e6f-..."
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontFamily: 'monospace', fontSize: '12px' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          {t('chargers.loxoneModeUuid')} *
                        </label>
                        <input type="text" required value={connectionConfig.loxone_mode_uuid || ''}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, loxone_mode_uuid: e.target.value })}
                          placeholder="4d5e6f7g-..."
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontFamily: 'monospace', fontSize: '12px' }} />
                      </div>
                    </div>

                    <p style={{ fontSize: '11px', color: '#666', marginBottom: '12px' }}>
                      {t('chargers.loxoneUuidsDescription')}
                    </p>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          {t('chargers.loxoneUsername')} *
                        </label>
                        <input type="text" required value={connectionConfig.loxone_username || ''}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, loxone_username: e.target.value })}
                          placeholder="admin"
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          {t('chargers.loxonePassword')} *
                        </label>
                        <input type="password" required value={connectionConfig.loxone_password || ''}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, loxone_password: e.target.value })}
                          placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                      </div>
                    </div>
                    <p style={{ fontSize: '11px', color: '#666', marginBottom: '12px' }}>
                      {t('chargers.loxoneCredentialsDescription')}
                    </p>

                    <div style={{ backgroundColor: '#fff', padding: '12px', borderRadius: '6px', marginTop: '12px', fontFamily: 'monospace', fontSize: '12px', border: '1px solid #e5e7eb' }}>
                      <strong>{t('chargers.loxoneSetupGuide')}</strong><br />
                      {t('chargers.loxoneSetupStep1')}<br />
                      {t('chargers.loxoneSetupStep2')}<br />
                      {t('chargers.loxoneSetupStep3')}<br />
                      {t('chargers.loxoneSetupStep4')}<br /><br />
                      <div style={{ backgroundColor: '#d1fae5', padding: '8px', borderRadius: '4px', fontSize: '11px', color: '#065f46' }}>
                        <strong>{t('chargers.loxoneFeatures')}</strong><br />
                        {t('chargers.loxoneFeature1')}<br />
                        {t('chargers.loxoneFeature2')}<br />
                        {t('chargers.loxoneFeature3')}
                      </div>
                    </div>
                  </>
                )}

                {formData.connection_type === 'udp' && (
                  <>
                    <div style={{ backgroundColor: '#fef3c7', padding: '12px', borderRadius: '6px', marginBottom: '12px', border: '1px solid #f59e0b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <AlertCircle size={16} color="#f59e0b" />
                      <p style={{ fontSize: '13px', color: '#92400e', margin: 0 }}>
                        <strong>{editingCharger ? t('chargers.existingUuidKeys') : t('chargers.udpDeprecatedWarning')}</strong>
                      </p>
                    </div>
                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                        {t('meters.listenPort')} *
                      </label>
                      <input type="number" required value={connectionConfig.listen_port}
                        onChange={(e) => setConnectionConfig({ ...connectionConfig, listen_port: parseInt(e.target.value) })}
                        placeholder="8888"
                        style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                    </div>
                    <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          {t('chargers.powerKey')} *
                        </label>
                        <input type="text" required value={connectionConfig.power_key}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, power_key: e.target.value })}
                          readOnly={!editingCharger}
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontFamily: 'monospace', fontSize: '12px' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          {t('chargers.stateKey')} *
                        </label>
                        <input type="text" required value={connectionConfig.state_key}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, state_key: e.target.value })}
                          readOnly={!editingCharger}
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontFamily: 'monospace', fontSize: '12px' }} />
                      </div>
                    </div>
                    <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          {t('chargers.userIdKey')} *
                        </label>
                        <input type="text" required value={connectionConfig.user_id_key}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, user_id_key: e.target.value })}
                          readOnly={!editingCharger}
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontFamily: 'monospace', fontSize: '12px' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          {t('chargers.modeKey')} *
                        </label>
                        <input type="text" required value={connectionConfig.mode_key}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, mode_key: e.target.value })}
                          readOnly={!editingCharger}
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontFamily: 'monospace', fontSize: '12px' }} />
                      </div>
                    </div>
                    <div style={{ backgroundColor: '#fff', padding: '12px', borderRadius: '6px', marginTop: '12px', fontFamily: 'monospace', fontSize: '12px', border: '1px solid #e5e7eb' }}>
                      <strong>{t('chargers.loxoneSendsTo')} {connectionConfig.listen_port || 8888}:</strong><br />
                      {"{"}<br />
                      &nbsp;&nbsp;"<span style={{ color: '#3b82f6' }}>{connectionConfig.power_key || 'UUID_power'}</span>": &lt;v&gt;,<br />
                      &nbsp;&nbsp;"<span style={{ color: '#3b82f6' }}>{connectionConfig.state_key || 'UUID_state'}</span>": 67,<br />
                      &nbsp;&nbsp;"<span style={{ color: '#3b82f6' }}>{connectionConfig.user_id_key || 'UUID_user'}</span>": "USER_001",<br />
                      &nbsp;&nbsp;"<span style={{ color: '#3b82f6' }}>{connectionConfig.mode_key || 'UUID_mode'}</span>": 2<br />
                      {"}"}
                    </div>
                  </>
                )}

                {formData.connection_type === 'http' && (
                  <>
                    <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          {t('chargers.powerEndpoint')} *
                        </label>
                        <input type="url" required value={connectionConfig.power_endpoint}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, power_endpoint: e.target.value })}
                          placeholder="http://192.168.1.100/api/power"
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          {t('chargers.stateEndpoint')} *
                        </label>
                        <input type="url" required value={connectionConfig.state_endpoint}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, state_endpoint: e.target.value })}
                          placeholder="http://192.168.1.100/api/state"
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                      </div>
                    </div>
                    <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          {t('chargers.userIdEndpoint')} *
                        </label>
                        <input type="url" required value={connectionConfig.user_id_endpoint}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, user_id_endpoint: e.target.value })}
                          placeholder="http://192.168.1.100/api/user_id"
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          {t('chargers.modeEndpoint')} *
                        </label>
                        <input type="url" required value={connectionConfig.mode_endpoint}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, mode_endpoint: e.target.value })}
                          placeholder="http://192.168.1.100/api/mode"
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                      </div>
                    </div>
                  </>
                )}

                {formData.connection_type === 'modbus_tcp' && (
                  <>
                    <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px', marginBottom: '12px' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          {t('meters.ipAddress')} *
                        </label>
                        <input type="text" required value={connectionConfig.ip_address}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, ip_address: e.target.value })}
                          placeholder="192.168.1.100"
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          {t('meters.port')} *
                        </label>
                        <input type="number" required value={connectionConfig.port}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, port: parseInt(e.target.value) })}
                          placeholder="502"
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                      </div>
                    </div>
                    <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          {t('chargers.powerReg')} *
                        </label>
                        <input type="number" required value={connectionConfig.power_register}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, power_register: parseInt(e.target.value) })}
                          placeholder="0"
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          {t('chargers.stateReg')} *
                        </label>
                        <input type="number" required value={connectionConfig.state_register}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, state_register: parseInt(e.target.value) })}
                          placeholder="1"
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          {t('chargers.userReg')} *
                        </label>
                        <input type="number" required value={connectionConfig.user_id_register}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, user_id_register: parseInt(e.target.value) })}
                          placeholder="2"
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          {t('chargers.modeReg')} *
                        </label>
                        <input type="number" required value={connectionConfig.mode_register}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, mode_register: parseInt(e.target.value) })}
                          placeholder="3"
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          {t('meters.unitId')} *
                        </label>
                        <input type="number" required value={connectionConfig.unit_id}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, unit_id: parseInt(e.target.value) })}
                          placeholder="1"
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                      </div>
                    </div>
                  </>
                )}

                <div style={{ marginTop: '20px', padding: '16px', backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#1f2937' }}>
                    {t('chargers.stateValueMappings')}
                  </h4>
                  <p style={{ fontSize: '12px', color: '#666', marginBottom: '12px' }}>
                    {t('chargers.configureStateValues')}
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '500' }}>
                        {t('chargers.stateCableLocked')}
                      </label>
                      <input type="text" required value={connectionConfig.state_cable_locked}
                        onChange={(e) => setConnectionConfig({ ...connectionConfig, state_cable_locked: e.target.value })}
                        placeholder="65"
                        style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '500' }}>
                        {t('chargers.stateWaitingAuth')}
                      </label>
                      <input type="text" required value={connectionConfig.state_waiting_auth}
                        onChange={(e) => setConnectionConfig({ ...connectionConfig, state_waiting_auth: e.target.value })}
                        placeholder="66"
                        style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '500' }}>
                        {t('chargers.stateCharging')}
                      </label>
                      <input type="text" required value={connectionConfig.state_charging}
                        onChange={(e) => setConnectionConfig({ ...connectionConfig, state_charging: e.target.value })}
                        placeholder="67"
                        style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '500' }}>
                        {t('chargers.stateIdle')}
                      </label>
                      <input type="text" required value={connectionConfig.state_idle}
                        onChange={(e) => setConnectionConfig({ ...connectionConfig, state_idle: e.target.value })}
                        placeholder="50"
                        style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px' }} />
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: '12px', padding: '16px', backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#1f2937' }}>
                    {t('chargers.modeValueMappings')}
                  </h4>
                  <p style={{ fontSize: '12px', color: '#666', marginBottom: '12px' }}>
                    {t('chargers.configureModeValues')}
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '500' }}>
                        {t('chargers.modeNormal')}
                      </label>
                      <input type="text" required value={connectionConfig.mode_normal}
                        onChange={(e) => setConnectionConfig({ ...connectionConfig, mode_normal: e.target.value })}
                        placeholder="1"
                        style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '500' }}>
                        {t('chargers.modePriority')}
                      </label>
                      <input type="text" required value={connectionConfig.mode_priority}
                        onChange={(e) => setConnectionConfig({ ...connectionConfig, mode_priority: e.target.value })}
                        placeholder="2"
                        style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px' }} />
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={formData.is_active} onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })} />
                  <span style={{ fontWeight: '500', fontSize: '14px' }}>{t('meters.activeCollectData')}</span>
                </label>
              </div>

              <div style={{ marginTop: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>{t('common.notes')}</label>
                <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={2} style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontFamily: 'inherit' }} />
              </div>

              <div className="button-group" style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button type="submit" style={{
                  flex: 1, padding: '12px', backgroundColor: '#007bff', color: 'white',
                  border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '500', cursor: 'pointer'
                }}>
                  {editingCharger ? t('common.update') : t('common.create')}
                </button>
                <button type="button" onClick={() => { setShowModal(false); setEditingCharger(null); }} style={{
                  flex: 1, padding: '12px', backgroundColor: '#6c757d', color: 'white',
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
        @media (max-width: 768px) {
          .chargers-container .chargers-header h1 {
            font-size: 24px !important;
          }

          .chargers-container .chargers-header h1 svg {
            width: 24px !important;
            height: 24px !important;
          }

          .chargers-container .chargers-header p {
            font-size: 14px !important;
          }

          .button-group-header {
            width: 100%;
            justify-content: stretch !important;
          }

          .button-group-header button {
            flex: 1;
            justify-content: center;
          }

          .building-cards-grid {
            grid-template-columns: 1fr !important;
            gap: 12px !important;
          }

          .chargers-grid {
            grid-template-columns: 1fr !important;
            gap: 16px !important;
          }

          .charger-card {
            padding: 20px !important;
          }

          .charger-card h3 {
            font-size: 18px !important;
          }

          .modal-content h2 {
            font-size: 20px !important;
          }

          .instructions-modal {
            padding: 20px !important;
          }

          .instructions-modal h2 {
            font-size: 20px !important;
          }

          .instructions-modal h3 {
            font-size: 16px !important;
          }

          .form-row {
            grid-template-columns: 1fr !important;
          }
        }

        @media (max-width: 480px) {
          .chargers-container .chargers-header h1 {
            font-size: 20px !important;
            gap: 8px !important;
          }

          .chargers-container .chargers-header h1 svg {
            width: 20px !important;
            height: 20px !important;
          }

          .button-group-header {
            flex-direction: column;
          }

          .button-group-header button {
            width: 100%;
          }

          .building-cards-grid > div {
            padding: 16px !important;
          }

          .building-cards-grid h3 {
            font-size: 16px !important;
          }

          .charger-card {
            padding: 16px !important;
          }

          .charger-card h3 {
            font-size: 16px !important;
          }

          .modal-content {
            padding: 20px !important;
          }

          .instructions-modal {
            padding: 16px !important;
          }

          .instructions-modal h2 {
            font-size: 18px !important;
          }

          .instructions-modal h3 {
            font-size: 15px !important;
          }

          .instructions-modal div {
            font-size: 13px !important;
          }
        }
      `}</style>
    </div>
  );
}