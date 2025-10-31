import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, X, Info, HelpCircle, Zap, Download, Search, Building, Radio, Settings, AlertCircle, Star, Wifi, WifiOff, AlertTriangle } from 'lucide-react';
import { api } from '../api/client';
import type { Meter, Building as BuildingType, User } from '../types';
import { useTranslation } from '../i18n';
import ExportModal from '../components/ExportModal';

interface ConnectionConfig {
  endpoint?: string;
  power_field?: string;
  ip_address?: string;
  port?: number;
  register_address?: number;
  register_count?: number;
  unit_id?: number;
  listen_port?: number;
  data_key?: string;
  // Loxone API fields
  loxone_host?: string;
  loxone_username?: string;
  loxone_password?: string;
  loxone_device_id?: string;
}

interface LoxoneConnectionStatus {
  [meterId: number]: {
    meter_name: string;
    host: string;
    device_id: string;
    is_connected: boolean;
    last_reading: number;
    last_update: string;
    last_error?: string;
  };
}

interface DeletionImpact {
  meter_id: number;
  meter_name: string;
  readings_count: number;
  oldest_reading: string;
  newest_reading: string;
  has_data: boolean;
}

export default function Meters() {
  const { t } = useTranslation();
  const [meters, setMeters] = useState<Meter[]>([]);
  const [buildings, setBuildings] = useState<BuildingType[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedBuildingId, setSelectedBuildingId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [meterToDelete, setMeterToDelete] = useState<Meter | null>(null);
  const [deletionImpact, setDeletionImpact] = useState<DeletionImpact | null>(null);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [deleteUnderstandChecked, setDeleteUnderstandChecked] = useState(false);
  const [editingMeter, setEditingMeter] = useState<Meter | null>(null);
  const [loxoneStatus, setLoxoneStatus] = useState<LoxoneConnectionStatus>({});
  const [formData, setFormData] = useState<Partial<Meter>>({
    name: '', meter_type: 'total_meter', building_id: 0, user_id: undefined,
    connection_type: 'loxone_api', connection_config: '{}', notes: '', is_active: true
  });
  const [connectionConfig, setConnectionConfig] = useState<ConnectionConfig>({
    endpoint: '',
    power_field: 'power_kwh',
    ip_address: '',
    port: 502,
    register_address: 0,
    register_count: 2,
    unit_id: 1,
    listen_port: 8888,
    data_key: 'power_kwh',
    loxone_host: '',
    loxone_username: '',
    loxone_password: '',
    loxone_device_id: ''
  });

  useEffect(() => {
    loadData();
    fetchLoxoneStatus();
    
    // Poll for Loxone status every 30 seconds
    const interval = setInterval(fetchLoxoneStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    const [metersData, buildingsData, usersData] = await Promise.all([
      api.getMeters(),
      api.getBuildings(),
      api.getUsers()
    ]);
    setMeters(metersData);
    setBuildings(buildingsData.filter(b => !b.is_group));
    setUsers(usersData);
  };

  const fetchLoxoneStatus = async () => {
    try {
      const debugData = await api.getDebugStatus();
      if (debugData.loxone_connections) {
        setLoxoneStatus(debugData.loxone_connections);
      }
    } catch (error) {
      console.error('Failed to fetch Loxone status:', error);
    }
  };

  const generateUUID = (): string => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };

  const isDataKeyUsed = (dataKey: string): boolean => {
    return meters.some(meter => {
      if (meter.connection_type !== 'udp' && meter.connection_type !== 'http') return false;
      try {
        const config = JSON.parse(meter.connection_config);
        return config.data_key === dataKey || config.power_field === dataKey;
      } catch (e) {
        return false;
      }
    });
  };

  const generateUniqueDataKey = (): string => {
    let uuid = generateUUID() + '_power_kwh';
    let attempts = 0;
    const maxAttempts = 100;

    while (isDataKeyUsed(uuid) && attempts < maxAttempts) {
      uuid = generateUUID() + '_power_kwh';
      attempts++;
    }

    return uuid;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let config: ConnectionConfig = {};

    if (formData.connection_type === 'loxone_api') {
      config = {
        loxone_host: connectionConfig.loxone_host,
        loxone_username: connectionConfig.loxone_username,
        loxone_password: connectionConfig.loxone_password,
        loxone_device_id: connectionConfig.loxone_device_id
      };
    } else if (formData.connection_type === 'modbus_tcp') {
      config = {
        ip_address: connectionConfig.ip_address,
        port: connectionConfig.port,
        register_address: connectionConfig.register_address,
        register_count: connectionConfig.register_count,
        unit_id: connectionConfig.unit_id
      };
    } else if (formData.connection_type === 'udp') {
      config = {
        listen_port: connectionConfig.listen_port,
        data_key: connectionConfig.data_key
      };
    }

    const dataToSend = {
      ...formData,
      connection_config: JSON.stringify(config)
    };

    try {
      if (editingMeter) {
        await api.updateMeter(editingMeter.id, dataToSend);
      } else {
        await api.createMeter(dataToSend);
      }
      setShowModal(false);
      setEditingMeter(null);
      resetForm();
      loadData();
      // Refresh Loxone status after creating/updating
      setTimeout(fetchLoxoneStatus, 2000);
    } catch (err) {
      alert(t('meters.saveFailed'));
    }
  };

  const handleDeleteClick = async (meter: Meter) => {
    setMeterToDelete(meter);
    setDeleteConfirmationText('');
    setDeleteUnderstandChecked(false);
    
    try {
      const impact = await api.getMeterDeletionImpact(meter.id);
      setDeletionImpact(impact);
      setShowDeleteConfirmation(true);
    } catch (err) {
      console.error('Failed to get deletion impact:', err);
      // If we can't get the impact, still allow deletion but without the details
      setDeletionImpact({
        meter_id: meter.id,
        meter_name: meter.name,
        readings_count: 0,
        oldest_reading: '',
        newest_reading: '',
        has_data: false
      });
      setShowDeleteConfirmation(true);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!meterToDelete || !deletionImpact) return;
    
    // Validate confirmation
    if (deleteConfirmationText !== deletionImpact.meter_name) {
      alert(t('meters.deleteNameMismatch') || 'The meter name does not match. Please type it exactly as shown.');
      return;
    }
    
    if (!deleteUnderstandChecked) {
      alert(t('meters.deleteCheckRequired') || 'Please check the confirmation box to proceed.');
      return;
    }

    try {
      await api.deleteMeter(meterToDelete.id);
      setShowDeleteConfirmation(false);
      setMeterToDelete(null);
      setDeletionImpact(null);
      loadData();
      fetchLoxoneStatus();
    } catch (err) {
      alert(t('meters.deleteFailed'));
    }
  };

  const handleEdit = (meter: Meter) => {
    setEditingMeter(meter);
    setFormData(meter);

    try {
      const config = JSON.parse(meter.connection_config);
      setConnectionConfig({
        endpoint: config.endpoint || '',
        power_field: config.power_field || 'power_kwh',
        ip_address: config.ip_address || '',
        port: config.port || 502,
        register_address: config.register_address || 0,
        register_count: config.register_count || 2,
        unit_id: config.unit_id || 1,
        listen_port: config.listen_port || 8888,
        data_key: config.data_key || 'power_kwh',
        loxone_host: config.loxone_host || '',
        loxone_username: config.loxone_username || '',
        loxone_password: config.loxone_password || '',
        loxone_device_id: config.loxone_device_id || ''
      });
    } catch (e) {
      console.error('Failed to parse config:', e);
    }

    setShowModal(true);
  };

  const handleExport = async (startDate: string, endDate: string, meterId?: number) => {
    try {
      const params = new URLSearchParams({
        type: 'meters',
        start_date: startDate,
        end_date: endDate
      });
  
      if (meterId) {
        params.append('meter_id', meterId.toString());
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
  
      const meterName = meterId ? meters.find(m => m.id === meterId)?.name.replace(/\s+/g, '-') : 'all';
      a.download = `meters-${meterName}-${startDate}-to-${endDate}.csv`;
  
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      setShowExportModal(false);
    } catch (error) {
      console.error('Export error:', error);
      alert(t('meters.exportFailed') || 'Export failed. Please try again.');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '', meter_type: 'total_meter', building_id: 0, user_id: undefined,
      connection_type: 'loxone_api', connection_config: '{}', notes: '', is_active: true
    });
    setConnectionConfig({
      endpoint: '',
      power_field: 'power_kwh',
      ip_address: '',
      port: 502,
      register_address: 0,
      register_count: 2,
      unit_id: 1,
      listen_port: 8888,
      data_key: 'power_kwh',
      loxone_host: '',
      loxone_username: '',
      loxone_password: '',
      loxone_device_id: ''
    });
  };

  const handleAddMeter = () => {
    resetForm();
    const uniqueUUID = generateUniqueDataKey();
    setConnectionConfig(prev => ({
      ...prev,
      data_key: uniqueUUID,
      power_field: uniqueUUID
    }));
    setShowModal(true);
  };

  const getLoxoneConnectionStatus = (meterId: number) => {
    return loxoneStatus[meterId];
  };

  const renderConnectionStatus = (meter: Meter) => {
    if (meter.connection_type === 'loxone_api') {
      const status = getLoxoneConnectionStatus(meter.id);
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
                    {t('meters.loxoneConnected')}
                  </div>
                  <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
                    {t('meters.lastUpdate')}: {new Date(status.last_update).toLocaleTimeString()}
                  </div>
                </div>
              </>
            ) : (
              <>
                <WifiOff size={16} style={{ color: '#ef4444' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: '#ef4444' }}>
                    {t('meters.loxoneDisconnected')}
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
            {t('meters.loxoneConnecting')}
          </div>
        </div>
      );
    }
    return null;
  };

  const meterTypes = [
    { value: 'total_meter', label: t('meters.totalMeter') },
    { value: 'solar_meter', label: t('meters.solarMeter') },
    { value: 'apartment_meter', label: t('meters.apartmentMeter') },
    { value: 'heating_meter', label: t('meters.heatingMeter') },
    { value: 'other', label: t('meters.other') }
  ];

  const filteredBuildings = buildings.filter(b =>
    b.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredMeters = selectedBuildingId
    ? meters.filter(m => m.building_id === selectedBuildingId)
    : meters;

  const groupedMeters = filteredMeters.reduce((acc, meter) => {
    if (!acc[meter.building_id]) {
      acc[meter.building_id] = [];
    }
    acc[meter.building_id].push(meter);
    return acc;
  }, {} as Record<number, Meter[]>);

  const exportItems = meters.map(m => {
    const building = buildings.find(b => b.id === m.building_id);
    return {
      id: m.id,
      name: m.name,
      building_id: m.building_id,
      building_name: building?.name || 'Unknown Building'
    };
  });

  const DeleteConfirmationModal = () => (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', zIndex: 2500, padding: '20px'
    }}>
      <div style={{
        backgroundColor: 'white', borderRadius: '16px', padding: '32px',
        maxWidth: '550px', width: '100%', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
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
              {t('meters.deleteConfirmTitle') || 'Confirm Deletion'}
            </h2>
            <p style={{ fontSize: '14px', color: '#6b7280', margin: '4px 0 0 0' }}>
              {t('meters.deleteWarning') || 'This action cannot be undone'}
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
                {t('meters.deleteImpactTitle') || 'The following will be permanently deleted:'}
              </p>
              <ul style={{ margin: 0, paddingLeft: '20px', color: '#92400e' }}>
                <li style={{ marginBottom: '8px' }}>
                  <strong>{deletionImpact.meter_name}</strong> {t('meters.meterWillBeDeleted') || '(Meter configuration)'}
                </li>
                {deletionImpact.has_data && (
                  <li style={{ marginBottom: '8px' }}>
                    <strong>{deletionImpact.readings_count.toLocaleString()}</strong> {t('meters.readingsWillBeDeleted') || 'readings'}
                    {deletionImpact.oldest_reading && deletionImpact.newest_reading && (
                      <div style={{ fontSize: '12px', marginTop: '4px', color: '#78350f' }}>
                        {t('meters.dataRange') || 'Data from'} {new Date(deletionImpact.oldest_reading).toLocaleDateString()} {t('common.to') || 'to'} {new Date(deletionImpact.newest_reading).toLocaleDateString()}
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
                ⚠️ {t('meters.dataLossWarning') || 'Warning: All historical data for this meter will be permanently lost. This cannot be recovered.'}
              </p>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px', color: '#374151' }}>
                {t('meters.typeToConfirm') || 'Type the meter name to confirm:'}
              </label>
              <div style={{
                padding: '8px 12px', backgroundColor: '#f3f4f6',
                borderRadius: '6px', marginBottom: '8px', fontFamily: 'monospace',
                fontSize: '14px', fontWeight: '600', color: '#1f2937'
              }}>
                {deletionImpact.meter_name}
              </div>
              <input
                type="text"
                value={deleteConfirmationText}
                onChange={(e) => setDeleteConfirmationText(e.target.value)}
                placeholder={t('meters.typeMeterName') || 'Type meter name here...'}
                style={{
                  width: '100%', padding: '12px', border: '2px solid #e5e7eb',
                  borderRadius: '8px', fontSize: '14px', fontFamily: 'inherit'
                }}
                autoFocus
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
                onChange={(e) => setDeleteUnderstandChecked(e.target.checked)}
                style={{ width: '20px', height: '20px', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                {t('meters.understandDataLoss') || 'I understand that this will permanently delete all data and cannot be undone'}
              </span>
            </label>
          </div>
        )}

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => {
              setShowDeleteConfirmation(false);
              setMeterToDelete(null);
              setDeletionImpact(null);
            }}
            style={{
              flex: 1, padding: '12px', backgroundColor: '#f3f4f6',
              color: '#374151', border: 'none', borderRadius: '8px',
              fontSize: '14px', fontWeight: '600', cursor: 'pointer'
            }}
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleDeleteConfirm}
            disabled={!deleteUnderstandChecked || deleteConfirmationText !== deletionImpact?.meter_name}
            style={{
              flex: 1, padding: '12px',
              backgroundColor: (!deleteUnderstandChecked || deleteConfirmationText !== deletionImpact?.meter_name) ? '#fca5a5' : '#ef4444',
              color: 'white', border: 'none', borderRadius: '8px',
              fontSize: '14px', fontWeight: '600',
              cursor: (!deleteUnderstandChecked || deleteConfirmationText !== deletionImpact?.meter_name) ? 'not-allowed' : 'pointer',
              opacity: (!deleteUnderstandChecked || deleteConfirmationText !== deletionImpact?.meter_name) ? 0.6 : 1
            }}
          >
            {t('meters.deletePermanently') || 'Delete Permanently'}
          </button>
        </div>
      </div>
    </div>
  );

  const InstructionsModal = () => (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', zIndex: 2000, padding: '20px'
    }}>
      <div className="modal-content" style={{
        backgroundColor: 'white', borderRadius: '12px', padding: '30px',
        maxWidth: '800px', maxHeight: '90vh', overflow: 'auto', width: '100%'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold' }}>{t('meters.instructions.title')}</h2>
          <button onClick={() => setShowInstructions(false)}
            style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        <div style={{ lineHeight: '1.8', color: '#374151' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', marginTop: '20px', marginBottom: '10px', color: '#1f2937', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Wifi size={20} color="#10b981" />
            {t('meters.instructions.loxoneTitle')}
          </h3>
          <div style={{ backgroundColor: '#d1fae5', padding: '16px', borderRadius: '8px', marginBottom: '16px', border: '2px solid #10b981' }}>
            <p style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <Star size={16} fill="#fbbf24" color="#fbbf24" />
              <strong>{t('meters.instructions.loxoneRecommended')}</strong>
            </p>
            
            <h4 style={{ fontSize: '15px', fontWeight: '600', marginTop: '16px', marginBottom: '8px' }}>
              {t('meters.instructions.loxoneUuidTitle')}
            </h4>
            <ol style={{ marginLeft: '20px', marginBottom: '12px' }}>
              <li>{t('meters.instructions.loxoneUuidStep1')}</li>
              <li>{t('meters.instructions.loxoneUuidStep2')}</li>
              <li>{t('meters.instructions.loxoneUuidStep3')}</li>
              <li>{t('meters.instructions.loxoneUuidStep4')}</li>
            </ol>
            
            <div style={{ backgroundColor: '#fff', padding: '12px', borderRadius: '6px', marginBottom: '12px', fontFamily: 'monospace', fontSize: '13px' }}>
              <strong>{t('meters.instructions.loxoneUuidExample')}</strong><br />
              http://192.168.1.100/data/LoxAPP3.json
            </div>

            <h4 style={{ fontSize: '15px', fontWeight: '600', marginTop: '16px', marginBottom: '8px' }}>
              {t('meters.instructions.loxoneSetupTitle')}
            </h4>
            <ol style={{ marginLeft: '20px', marginTop: '10px' }}>
              <li>{t('meters.instructions.loxoneStep1')}</li>
              <li>{t('meters.instructions.loxoneStep2')}</li>
              <li>{t('meters.instructions.loxoneStep3')}</li>
              <li>{t('meters.instructions.loxoneStep4')}</li>
              <li>{t('meters.instructions.loxoneStep5')}</li>
            </ol>
            
            <div style={{ backgroundColor: '#fff', padding: '12px', borderRadius: '6px', marginTop: '10px', fontFamily: 'monospace', fontSize: '13px' }}>
              <strong>{t('meters.instructions.loxoneExample')}</strong><br />
              {t('meters.instructions.loxoneExampleHost')}<br />
              {t('meters.instructions.loxoneExampleDevice')}<br />
              {t('meters.instructions.loxoneExampleCredentials')}<br /><br />
              <strong>{t('meters.instructions.loxoneBenefits')}</strong><br />
              {t('meters.instructions.loxoneBenefit1')}<br />
              {t('meters.instructions.loxoneBenefit2')}<br />
              {t('meters.instructions.loxoneBenefit3')}
            </div>
          </div>

          <h3 style={{ fontSize: '18px', fontWeight: '600', marginTop: '20px', marginBottom: '10px', color: '#1f2937', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Radio size={20} color="#f59e0b" />
            {t('meters.instructions.udpTitle')}
          </h3>
          <div style={{ backgroundColor: '#fef3c7', padding: '16px', borderRadius: '8px', marginBottom: '16px', border: '2px solid #f59e0b' }}>
            <p style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={16} color="#f59e0b" />
              <strong>{t('meters.instructions.udpDeprecated')}</strong>
            </p>
            <ol style={{ marginLeft: '20px', marginTop: '10px' }}>
              <li>{t('meters.instructions.udpStep1')}</li>
              <li>{t('meters.instructions.udpStep2')}</li>
              <li>{t('meters.instructions.udpStep3')}</li>
              <li>{t('meters.instructions.udpStep4')}</li>
              <li><strong>{t('meters.instructions.udpStep5')}</strong></li>
            </ol>
            <div style={{ backgroundColor: '#fff', padding: '12px', borderRadius: '6px', marginTop: '10px', fontFamily: 'monospace', fontSize: '13px' }}>
              <strong>{t('meters.instructions.udpExample1Title')}</strong><br />
              Port: 8888<br />
              Data Key: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d_power_kwh" (auto-generated)<br />
              Loxone sends: {"{\"a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d_power_kwh\": <v>}"}<br /><br />

              <strong>{t('meters.instructions.udpExample2Title')}</strong><br />
              Port: 8888 (same port!)<br />
              Data Key: "f6e5d4c3-b2a1-4098-7654-321fedcba098_power_kwh" (auto-generated)<br />
              Loxone sends: {"{\"f6e5d4c3-b2a1-4098-7654-321fedcba098_power_kwh\": <v>}"}
            </div>
          </div>

          <h3 style={{ fontSize: '18px', fontWeight: '600', marginTop: '20px', marginBottom: '10px', color: '#1f2937', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Zap size={20} color="#6b7280" />
            {t('meters.instructions.modbusTitle')}
          </h3>
          <div style={{ backgroundColor: '#f3f4f6', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
            <p><strong>{t('meters.instructions.modbusSetup')}</strong></p>
            <ol style={{ marginLeft: '20px', marginTop: '10px' }}>
              <li>{t('meters.instructions.modbusStep1')}</li>
              <li>{t('meters.instructions.modbusStep2')}</li>
              <li>{t('meters.instructions.modbusStep3')}</li>
              <li>{t('meters.instructions.modbusStep4')}</li>
              <li>{t('meters.instructions.modbusStep5')}</li>
            </ol>
          </div>

          <h3 style={{ fontSize: '18px', fontWeight: '600', marginTop: '20px', marginBottom: '10px', color: '#1f2937', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Settings size={20} color="#3b82f6" />
            {t('meters.instructions.testingTitle')}
          </h3>
          <div style={{ backgroundColor: '#dbeafe', padding: '16px', borderRadius: '8px', marginBottom: '16px', border: '1px solid #3b82f6' }}>
            <p><strong>{t('meters.instructions.testingIntro')}</strong></p>
            <ul style={{ marginLeft: '20px', marginTop: '10px' }}>
              <li>{t('meters.instructions.testingPoint1')}</li>
              <li>{t('meters.instructions.testingPoint2')}</li>
              <li>{t('meters.instructions.testingPoint3')}</li>
              <li>{t('meters.instructions.testingPoint4')}</li>
            </ul>
          </div>

          <h3 style={{ fontSize: '18px', fontWeight: '600', marginTop: '20px', marginBottom: '10px', color: '#1f2937', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={20} color="#f59e0b" />
            {t('meters.instructions.troubleshootingTitle')}
          </h3>
          <div style={{ backgroundColor: '#fef3c7', padding: '16px', borderRadius: '8px', border: '1px solid #f59e0b' }}>
            <ul style={{ marginLeft: '20px' }}>
              <li><strong>Loxone WebSocket:</strong> {t('meters.instructions.troubleshootingLoxoneWebSocket')}</li>
              <li><strong>Loxone WebSocket:</strong> {t('meters.instructions.troubleshootingLoxoneAuth')}</li>
              <li><strong>Loxone WebSocket:</strong> {t('meters.instructions.troubleshootingLoxoneDevice')}</li>
              <li>{t('meters.instructions.troubleshootingService')} <code style={{ backgroundColor: '#fff', padding: '2px 6px', borderRadius: '4px' }}>sudo systemctl status zev-billing</code></li>
              <li>{t('meters.instructions.troubleshootingLogs')} <code style={{ backgroundColor: '#fff', padding: '2px 6px', borderRadius: '4px' }}>journalctl -u zev-billing -f</code></li>
              <li>{t('meters.instructions.troubleshootingNetwork')} <code style={{ backgroundColor: '#fff', padding: '2px 6px', borderRadius: '4px' }}>ping YOUR_LOXONE_IP</code></li>
              <li>{t('meters.instructions.troubleshootingMonitor')}</li>
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
    <div className="meters-container">
      <div className="meters-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', gap: '15px', flexWrap: 'wrap' }}>
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
            <Zap size={36} style={{ color: '#667eea' }} />
            {t('meters.title')}
          </h1>
          <p style={{ color: '#6b7280', fontSize: '16px' }}>
            {t('meters.subtitle')}
          </p>
        </div>
        <div className="header-actions" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowExportModal(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
              backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px', cursor: 'pointer'
            }}
          >
            <Download size={18} />
            <span className="button-text">{t('meters.exportData')}</span>
          </button>
          <button
            onClick={() => setShowInstructions(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
              backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px', cursor: 'pointer'
            }}
          >
            <HelpCircle size={18} />
            <span className="button-text">{t('meters.setupInstructions')}</span>
          </button>
          <button
            onClick={handleAddMeter}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
              backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px', cursor: 'pointer'
            }}
          >
            <Plus size={18} />
            <span className="button-text">{t('meters.addMeter')}</span>
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

      <div style={{
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
            {meters.length} {t('meters.metersCount')}
          </p>
        </div>

        {filteredBuildings.map(building => {
          const buildingMeters = meters.filter(m => m.building_id === building.id);
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
                {buildingMeters.length} {t('meters.metersCount')}
              </p>
            </div>
          );
        })}
      </div>

      {Object.entries(groupedMeters).map(([buildingId, buildingMeters]) => {
        const building = buildings.find(b => b.id === parseInt(buildingId));
        return (
          <div key={buildingId} style={{ marginBottom: '30px' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '16px', color: '#1f2937' }}>
              {building?.name || t('common.unknownBuilding')}
            </h2>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: '20px'
            }}>
              {buildingMeters.map(meter => (
                <div key={meter.id} style={{
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
                      onClick={() => handleEdit(meter)}
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
                      onClick={() => handleDeleteClick(meter)}
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
                      {meter.name}
                    </h3>
                    <p style={{
                      fontSize: '14px',
                      color: '#6b7280',
                      margin: 0,
                      textTransform: 'capitalize'
                    }}>
                      {meter.meter_type.replace('_', ' ')}
                    </p>
                  </div>

                  <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #f3f4f6' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <span style={{ fontSize: '13px', color: '#9ca3af', fontWeight: '500' }}>{t('meters.connection')}</span>
                      <span style={{
                        fontSize: '13px',
                        fontWeight: '600',
                        color: '#667eea',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                      }}>
                        {meter.connection_type === 'loxone_api' ? 'Loxone WebSocket' : meter.connection_type}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <span style={{ fontSize: '13px', color: '#9ca3af', fontWeight: '500' }}>{t('meters.lastReading')}</span>
                      <span style={{ fontSize: '15px', fontWeight: '600', color: '#1f2937' }}>
                        {meter.last_reading ? `${meter.last_reading.toFixed(3)} kWh` : '-'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '13px', color: '#9ca3af', fontWeight: '500' }}>{t('common.status')}</span>
                      <span style={{
                        padding: '4px 12px',
                        borderRadius: '20px',
                        fontSize: '12px',
                        fontWeight: '600',
                        backgroundColor: meter.is_active ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                        color: meter.is_active ? '#22c55e' : '#ef4444'
                      }}>
                        {meter.is_active ? t('common.active') : t('common.inactive')}
                      </span>
                    </div>
                  </div>

                  {renderConnectionStatus(meter)}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {filteredMeters.length === 0 && (
        <div style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '60px 20px',
          textAlign: 'center',
          color: '#999',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          {t('meters.noMeters')}
        </div>
      )}

      {showInstructions && <InstructionsModal />}
      {showDeleteConfirmation && <DeleteConfirmationModal />}
      {showExportModal && (
        <ExportModal
          type="meters"
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
                  {editingMeter ? t('meters.editMeter') : t('meters.addMeter')}
                </h2>
                <button
                  onClick={() => setShowInstructions(true)}
                  style={{ padding: '6px', border: 'none', background: 'none', cursor: 'pointer', color: '#007bff' }}
                  title={t('meters.setupInstructions')}
                >
                  <Info size={20} />
                </button>
              </div>
              <button onClick={() => { setShowModal(false); setEditingMeter(null); }} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
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
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>{t('meters.meterType')} *</label>
                <select required value={formData.meter_type} onChange={(e) => setFormData({ ...formData, meter_type: e.target.value })}
                  style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}>
                  {meterTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>

              <div style={{ marginTop: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>{t('users.building')} *</label>
                <select required value={formData.building_id} onChange={(e) => setFormData({ ...formData, building_id: parseInt(e.target.value) })}
                  style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}>
                  <option value={0}>{t('users.selectBuilding')}</option>
                  {buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>

              {formData.meter_type === 'apartment_meter' && (
                <div style={{ marginTop: '16px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>{t('meters.userForApartment')}</label>
                  <select value={formData.user_id || ''} onChange={(e) => setFormData({ ...formData, user_id: e.target.value ? parseInt(e.target.value) : undefined })}
                    style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}>
                    <option value="">{t('meters.selectUser')}</option>
                    {users.filter(u => u.building_id === formData.building_id).map(u => (
                      <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ marginTop: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>{t('meters.connectionType')} *</label>
                <select required value={formData.connection_type} onChange={(e) => setFormData({ ...formData, connection_type: e.target.value })}
                  style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}>
                  <option value="loxone_api">{t('meters.loxoneApiRecommended')}</option>
                  <option value="udp">{t('meters.udpAlternative')}</option>
                  <option value="modbus_tcp">{t('meters.modbusTcp')}</option>
                </select>
              </div>

              <div style={{ marginTop: '20px', padding: '20px', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>
                  {t('meters.connectionConfig')}
                </h3>

                {formData.connection_type === 'loxone_api' && (
                  <>
                    <div style={{ backgroundColor: '#d1fae5', padding: '12px', borderRadius: '6px', marginBottom: '12px', border: '1px solid #10b981', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Wifi size={16} color="#10b981" />
                      <p style={{ fontSize: '13px', color: '#065f46', margin: 0 }}>
                        <strong>{t('meters.loxoneApiDescription')}</strong>
                      </p>
                    </div>
                    
                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                        {t('meters.loxoneHost')} *
                      </label>
                      <input type="text" required value={connectionConfig.loxone_host || ''}
                        onChange={(e) => setConnectionConfig({ ...connectionConfig, loxone_host: e.target.value })}
                        placeholder="192.168.1.100"
                        style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                      <p style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                        {t('meters.loxoneHostDescription')}
                      </p>
                    </div>

                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                        {t('meters.loxoneDeviceId')} *
                      </label>
                      <input type="text" required value={connectionConfig.loxone_device_id || ''}
                        onChange={(e) => setConnectionConfig({ ...connectionConfig, loxone_device_id: e.target.value })}
                        placeholder="1e475b8d-017e-c7b5-ffff336efb88726d"
                        style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontFamily: 'monospace' }} />
                      <p style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                        {t('meters.loxoneDeviceIdDescription')}
                      </p>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          {t('meters.loxoneUsername')} *
                        </label>
                        <input type="text" required value={connectionConfig.loxone_username || ''}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, loxone_username: e.target.value })}
                          placeholder="admin"
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          {t('meters.loxonePassword')} *
                        </label>
                        <input type="password" required value={connectionConfig.loxone_password || ''}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, loxone_password: e.target.value })}
                          placeholder="••••••••"
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                      </div>
                    </div>
                    <p style={{ fontSize: '11px', color: '#666', marginBottom: '12px' }}>
                      {t('meters.loxoneCredentialsDescription')}
                    </p>

                    <div style={{ backgroundColor: '#fff', padding: '12px', borderRadius: '6px', marginTop: '12px', fontFamily: 'monospace', fontSize: '12px', border: '1px solid #e5e7eb' }}>
                      <strong>{t('meters.loxoneSetupGuide')}</strong><br />
                      {t('meters.loxoneSetupStep1')}<br />
                      {t('meters.loxoneSetupStep2')}<br />
                      {t('meters.loxoneSetupStep3')}<br />
                      {t('meters.loxoneSetupStep4')}<br /><br />
                      <div style={{ backgroundColor: '#d1fae5', padding: '8px', borderRadius: '4px', fontSize: '11px', color: '#065f46' }}>
                        <strong>{t('meters.loxoneFeatures')}</strong><br />
                        {t('meters.loxoneFeature1')}<br />
                        {t('meters.loxoneFeature2')}<br />
                        {t('meters.loxoneFeature3')}
                      </div>
                    </div>
                  </>
                )}

                {formData.connection_type === 'udp' && (
                  <>
                    <div style={{ backgroundColor: '#fef3c7', padding: '12px', borderRadius: '6px', marginBottom: '12px', border: '1px solid #f59e0b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <AlertCircle size={16} color="#f59e0b" />
                      <p style={{ fontSize: '13px', color: '#92400e', margin: 0 }}>
                        <strong>{editingMeter ? t('chargers.existingUuidKeys') : t('meters.udpDeprecatedWarning')}</strong>
                      </p>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          {t('meters.listenPort')} *
                        </label>
                        <input type="number" required value={connectionConfig.listen_port}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, listen_port: parseInt(e.target.value) })}
                          placeholder="8888"
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                        <p style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                          {t('meters.samePort')}
                        </p>
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          {t('meters.dataKey')} * (UUID_power_kwh)
                        </label>
                        <input type="text" required value={connectionConfig.data_key}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, data_key: e.target.value })}
                          placeholder="uuid_power_kwh"
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontFamily: 'monospace', fontSize: '12px' }}
                          readOnly={!editingMeter} />
                        <p style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                          {editingMeter ? t('meters.dataKeyModifiable') : t('meters.dataKeyAutoGenerated')}
                        </p>
                      </div>
                    </div>
                    <div style={{ backgroundColor: '#fff', padding: '12px', borderRadius: '6px', marginTop: '12px', fontFamily: 'monospace', fontSize: '12px', border: '1px solid #e5e7eb' }}>
                      <strong>{t('meters.loxoneConfiguration')}</strong><br />
                      {t('meters.udpVirtualOutput')} {connectionConfig.listen_port || 8888}<br />
                      {t('meters.udpCommand')} {"{\""}
                      <span style={{ color: '#3b82f6', fontWeight: 'bold' }}>{connectionConfig.data_key || 'YOUR_UUID_power_kwh'}</span>
                      {"\": <v>}"}
                    </div>
                  </>
                )}

                {formData.connection_type === 'modbus_tcp' && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px', marginBottom: '12px' }}>
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
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          {t('meters.registerAddress')} *
                        </label>
                        <input type="number" required value={connectionConfig.register_address}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, register_address: parseInt(e.target.value) })}
                          placeholder="0"
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                          {t('meters.registerCount')} *
                        </label>
                        <input type="number" required value={connectionConfig.register_count}
                          onChange={(e) => setConnectionConfig({ ...connectionConfig, register_count: parseInt(e.target.value) })}
                          placeholder="2"
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
                  {editingMeter ? t('common.update') : t('common.create')}
                </button>
                <button type="button" onClick={() => { setShowModal(false); setEditingMeter(null); }} style={{
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
          .meters-container h1 {
            font-size: 24px !important;
          }

          .meters-container h1 svg {
            width: 24px !important;
            height: 24px !important;
          }

          .meters-container > div > div > p {
            font-size: 14px !important;
          }

          .meters-header {
            flex-direction: column !important;
            align-items: stretch !important;
          }

          .header-actions {
            width: 100%;
            flex-direction: column !important;
          }

          .header-actions button {
            width: 100% !important;
            justify-content: center !important;
          }

          .modal-content {
            padding: 20px !important;
          }

          .modal-content h2 {
            font-size: 20px !important;
          }
        }

        @media (max-width: 480px) {
          .meters-container h1 {
            font-size: 20px !important;
          }

          .meters-container h1 svg {
            width: 20px !important;
            height: 20px !important;
          }

          .button-text {
            display: inline !important;
          }

          .modal-content {
            padding: 15px !important;
          }
        }
      `}</style>
    </div>
  );
}