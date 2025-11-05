import { useState, useEffect } from 'react';
import { X, AlertTriangle, RefreshCw, Check, Info, Wifi, Radio, Zap, ArrowRight } from 'lucide-react';
import { api } from '../api/client';
import type { Meter, MeterReplacementRequest } from '../types';
import { useTranslation } from '../i18n';

interface MeterReplacementModalProps {
  meter: Meter;
  onClose: () => void;
  onSuccess: () => void;
}

export default function MeterReplacementModal({ meter, onClose, onSuccess }: MeterReplacementModalProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Form data
  const [oldFinalReading, setOldFinalReading] = useState(meter.last_reading?.toString() || '0');
  const [newMeterName, setNewMeterName] = useState(`${meter.name} (New)`);
  const [newMeterType, setNewMeterType] = useState(meter.meter_type);
  const [copySettings, setCopySettings] = useState(true);
  const [newConnectionType, setNewConnectionType] = useState(meter.connection_type);
  const [newConnectionConfig, setNewConnectionConfig] = useState<any>({});
  const [newInitialReading, setNewInitialReading] = useState('0');
  const [replacementNotes, setReplacementNotes] = useState('');

  // Initialize connection config based on type
  useEffect(() => {
    if (newConnectionType === 'loxone_api') {
      setNewConnectionConfig({
        loxone_host: '',
        loxone_username: '',
        loxone_password: '',
        loxone_device_id: ''
      });
    } else if (newConnectionType === 'udp') {
      // Generate unique UUID for UDP
      const uuid = generateUUID();
      setNewConnectionConfig({
        listen_port: 8888,
        data_key: `${uuid}_power_kwh`
      });
    } else if (newConnectionType === 'modbus_tcp') {
      setNewConnectionConfig({
        ip_address: '',
        port: 502,
        register_address: 0,
        register_count: 2,
        unit_id: 1
      });
    }
  }, [newConnectionType]);

  const generateUUID = (): string => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };

  const calculateOffset = () => {
    const oldReading = parseFloat(oldFinalReading) || 0;
    const newReading = parseFloat(newInitialReading) || 0;
    return oldReading - newReading;
  };

  const handleNext = () => {
    setError('');
    
    // Validation for each step
    if (step === 2) {
      const oldReading = parseFloat(oldFinalReading);
      if (isNaN(oldReading) || oldReading < 0) {
        setError(t('meters.replacement.invalidOldReading') || 'Invalid final reading');
        return;
      }
      if (oldReading < (meter.last_reading || 0)) {
        setError(t('meters.replacement.readingTooLow') || 'Final reading must be >= last recorded reading');
        return;
      }
    }
    
    if (step === 3) {
      if (!newMeterName.trim()) {
        setError(t('meters.replacement.nameRequired') || 'Meter name is required');
        return;
      }
    }
    
    if (step === 4) {
      // Validate connection config
      if (newConnectionType === 'loxone_api') {
        if (!newConnectionConfig.loxone_host || !newConnectionConfig.loxone_device_id) {
          setError(t('meters.replacement.loxoneConfigRequired') || 'Loxone host and device ID are required');
          return;
        }
      } else if (newConnectionType === 'modbus_tcp') {
        if (!newConnectionConfig.ip_address) {
          setError(t('meters.replacement.modbusConfigRequired') || 'IP address is required');
          return;
        }
      }
    }
    
    if (step === 5) {
      const newReading = parseFloat(newInitialReading);
      if (isNaN(newReading) || newReading < 0) {
        setError(t('meters.replacement.invalidNewReading') || 'Invalid initial reading');
        return;
      }
    }
    
    setStep(step + 1);
  };

  const handleBack = () => {
    setError('');
    setStep(step - 1);
  };

  const handleReplace = async () => {
    setLoading(true);
    setError('');

    try {
      const replacementDate = new Date().toISOString();
      const oldReading = parseFloat(oldFinalReading);
      const newReading = parseFloat(newInitialReading);

      const request: MeterReplacementRequest = {
        old_meter_id: meter.id,
        new_meter_name: newMeterName,
        new_meter_type: newMeterType,
        new_connection_type: newConnectionType,
        new_connection_config: JSON.stringify(newConnectionConfig),
        replacement_date: replacementDate,
        old_meter_final_reading: oldReading,
        new_meter_initial_reading: newReading,
        replacement_notes: replacementNotes,
        copy_settings: copySettings
      };

      await api.replaceMeter(request);
      onSuccess();
    } catch (err: any) {
      setError(err.message || t('meters.replacement.failed'));
      setLoading(false);
    }
  };

  const meterTypes = [
    { value: 'total_meter', label: t('meters.totalMeter') },
    { value: 'solar_meter', label: t('meters.solarMeter') },
    { value: 'apartment_meter', label: t('meters.apartmentMeter') },
    { value: 'heating_meter', label: t('meters.heatingMeter') },
    { value: 'other', label: t('meters.other') }
  ];

  const connectionTypes = [
    { value: 'loxone_api', label: 'Loxone WebSocket API', icon: Wifi, color: '#10b981' },
    { value: 'udp', label: 'UDP (Legacy)', icon: Radio, color: '#f59e0b' },
    { value: 'modbus_tcp', label: 'Modbus TCP', icon: Zap, color: '#6b7280' }
  ];

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', zIndex: 2500, padding: '20px'
    }}>
      <div style={{
        backgroundColor: 'white', borderRadius: '16px', padding: '32px',
        maxWidth: '700px', width: '100%', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
        maxHeight: '90vh', overflow: 'auto'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '48px', height: '48px', borderRadius: '50%',
              backgroundColor: 'rgba(102, 126, 234, 0.1)', display: 'flex',
              alignItems: 'center', justifyContent: 'center'
            }}>
              <RefreshCw size={24} color="#667eea" />
            </div>
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#1f2937', margin: 0 }}>
                {t('meters.replacement.title') || 'Replace Meter'}
              </h2>
              <p style={{ fontSize: '14px', color: '#6b7280', margin: '4px 0 0 0' }}>
                {t('meters.replacement.subtitle') || 'Step'} {step} {t('common.of')} 6
              </p>
            </div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '8px' }}>
            <X size={24} color="#6b7280" />
          </button>
        </div>

        {/* Progress Bar */}
        <div style={{
          height: '4px', backgroundColor: '#e5e7eb', borderRadius: '2px', marginBottom: '24px', overflow: 'hidden'
        }}>
          <div style={{
            height: '100%', backgroundColor: '#667eea', transition: 'width 0.3s',
            width: `${(step / 6) * 100}%`
          }} />
        </div>

        {error && (
          <div style={{
            backgroundColor: '#fee2e2', border: '2px solid #ef4444',
            borderRadius: '8px', padding: '12px', marginBottom: '20px',
            display: 'flex', alignItems: 'center', gap: '8px'
          }}>
            <AlertTriangle size={20} color="#ef4444" />
            <span style={{ color: '#991b1b', fontSize: '14px', fontWeight: '500' }}>{error}</span>
          </div>
        )}

        {/* Step 1: Introduction & Confirmation */}
        {step === 1 && (
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px', color: '#1f2937' }}>
              {t('meters.replacement.step1.title') || 'Meter Replacement Overview'}
            </h3>
            
            <div style={{
              backgroundColor: '#f0f9ff', border: '2px solid #3b82f6',
              borderRadius: '12px', padding: '16px', marginBottom: '16px'
            }}>
              <p style={{ fontSize: '14px', color: '#1e40af', margin: 0, lineHeight: '1.6' }}>
                <strong>{t('meters.replacement.step1.currentMeter') || 'Current Meter'}:</strong> {meter.name}
              </p>
              <p style={{ fontSize: '14px', color: '#1e40af', margin: '8px 0 0 0', lineHeight: '1.6' }}>
                <strong>{t('meters.replacement.step1.lastReading') || 'Last Reading'}:</strong> {meter.last_reading?.toFixed(3) || '0.000'} kWh
              </p>
              <p style={{ fontSize: '14px', color: '#1e40af', margin: '8px 0 0 0', lineHeight: '1.6' }}>
                <strong>{t('meters.replacement.step1.connectionType') || 'Connection Type'}:</strong> {meter.connection_type}
              </p>
            </div>

            <div style={{
              backgroundColor: '#fef3c7', border: '2px solid #f59e0b',
              borderRadius: '12px', padding: '16px', marginBottom: '16px'
            }}>
              <div style={{ display: 'flex', alignItems: 'start', gap: '12px' }}>
                <Info size={20} color="#f59e0b" style={{ marginTop: '2px', flexShrink: 0 }} />
                <div style={{ fontSize: '13px', color: '#92400e', lineHeight: '1.6' }}>
                  <p style={{ margin: '0 0 8px 0', fontWeight: '600' }}>
                    {t('meters.replacement.step1.whatHappens') || 'What happens during replacement:'}
                  </p>
                  <ul style={{ margin: 0, paddingLeft: '20px' }}>
                    <li>{t('meters.replacement.step1.point1') || 'Old meter will be archived (not deleted)'}</li>
                    <li>{t('meters.replacement.step1.point2') || 'Historical data will be preserved'}</li>
                    <li>{t('meters.replacement.step1.point3') || 'New meter will take over data collection'}</li>
                    <li>{t('meters.replacement.step1.point4') || 'Billing will continue seamlessly with offset calculation'}</li>
                    <li>{t('meters.replacement.step1.point5') || 'You can change connection type if needed'}</li>
                  </ul>
                </div>
              </div>
            </div>

            <div style={{
              backgroundColor: '#fee2e2', border: '2px solid #ef4444',
              borderRadius: '12px', padding: '16px'
            }}>
              <div style={{ display: 'flex', alignItems: 'start', gap: '12px' }}>
                <AlertTriangle size={20} color="#ef4444" style={{ marginTop: '2px', flexShrink: 0 }} />
                <div style={{ fontSize: '13px', color: '#991b1b', lineHeight: '1.6' }}>
                  <p style={{ margin: 0, fontWeight: '600' }}>
                    {t('meters.replacement.step1.warning') || 'Important: This action cannot be undone. Make sure you have the correct readings before proceeding.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Enter Old Meter Final Reading */}
        {step === 2 && (
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px', color: '#1f2937' }}>
              {t('meters.replacement.step2.title') || 'Old Meter Final Reading'}
            </h3>
            
            <div style={{ marginBottom: '16px' }}>
              <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '12px', lineHeight: '1.6' }}>
                {t('meters.replacement.step2.instruction') || 'Enter the final reading from the old meter. This should be the last reading you can see on the physical meter before disconnecting it.'}
              </p>
              
              <div style={{
                backgroundColor: '#f3f4f6', padding: '12px', borderRadius: '8px', marginBottom: '12px'
              }}>
                <p style={{ fontSize: '13px', color: '#4b5563', margin: 0 }}>
                  <strong>{t('meters.replacement.step2.lastRecorded') || 'Last Recorded Reading'}:</strong> {meter.last_reading?.toFixed(3) || '0.000'} kWh
                </p>
                <p style={{ fontSize: '12px', color: '#6b7280', margin: '4px 0 0 0' }}>
                  {t('meters.replacement.step2.reference') || 'Use this as reference - your final reading should be ≥ this value'}
                </p>
              </div>

              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px', color: '#374151' }}>
                {t('meters.replacement.step2.finalReading') || 'Final Reading (kWh)'} *
              </label>
              <input
                type="number"
                step="0.001"
                value={oldFinalReading}
                onChange={(e) => setOldFinalReading(e.target.value)}
                placeholder="300000.500"
                style={{
                  width: '100%', padding: '12px', border: '2px solid #e5e7eb',
                  borderRadius: '8px', fontSize: '16px', fontFamily: 'monospace'
                }}
              />
            </div>

            <div style={{
              backgroundColor: '#dbeafe', border: '1px solid #3b82f6',
              borderRadius: '8px', padding: '12px'
            }}>
              <p style={{ fontSize: '13px', color: '#1e40af', margin: 0 }}>
                💡 {t('meters.replacement.step2.tip') || 'Tip: Record this reading accurately. It will be used to calculate the offset for billing continuity.'}
              </p>
            </div>
          </div>
        )}

        {/* Step 3: Configure New Meter Details */}
        {step === 3 && (
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px', color: '#1f2937' }}>
              {t('meters.replacement.step3.title') || 'New Meter Configuration'}
            </h3>
            
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px', color: '#374151' }}>
                {t('common.name')} *
              </label>
              <input
                type="text"
                value={newMeterName}
                onChange={(e) => setNewMeterName(e.target.value)}
                placeholder={t('meters.replacement.step3.namePlaceholder') || 'Enter new meter name'}
                style={{
                  width: '100%', padding: '12px', border: '2px solid #e5e7eb',
                  borderRadius: '8px', fontSize: '14px'
                }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px', color: '#374151' }}>
                {t('meters.meterType')} *
              </label>
              <select
                value={newMeterType}
                onChange={(e) => setNewMeterType(e.target.value)}
                style={{
                  width: '100%', padding: '12px', border: '2px solid #e5e7eb',
                  borderRadius: '8px', fontSize: '14px'
                }}
              >
                {meterTypes.map(type => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>

            <label style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '12px', backgroundColor: '#f9fafb',
              borderRadius: '8px', cursor: 'pointer'
            }}>
              <input
                type="checkbox"
                checked={copySettings}
                onChange={(e) => setCopySettings(e.target.checked)}
                style={{ width: '20px', height: '20px', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                {t('meters.replacement.step3.copySettings') || 'Copy building and apartment settings from old meter'}
              </span>
            </label>
          </div>
        )}

        {/* Step 4: Connection Type & Configuration */}
        {step === 4 && (
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px', color: '#1f2937' }}>
              {t('meters.replacement.step4.title') || 'Connection Configuration'}
            </h3>

            <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '16px' }}>
              {t('meters.replacement.step4.subtitle') || 'Select how the new meter will send data. You can change the connection type if needed.'}
            </p>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '12px', fontWeight: '600', fontSize: '14px', color: '#374151' }}>
                {t('meters.connectionType')} *
              </label>
              
              <div style={{ display: 'grid', gap: '12px' }}>
                {connectionTypes.map(type => {
                  const Icon = type.icon;
                  const isSelected = newConnectionType === type.value;
                  
                  return (
                    <div
                      key={type.value}
                      onClick={() => setNewConnectionType(type.value)}
                      style={{
                        padding: '16px',
                        border: `2px solid ${isSelected ? type.color : '#e5e7eb'}`,
                        borderRadius: '12px',
                        cursor: 'pointer',
                        backgroundColor: isSelected ? `${type.color}15` : 'white',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px'
                      }}
                    >
                      <Icon size={24} color={type.color} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: '600', fontSize: '14px', color: '#1f2937' }}>
                          {type.label}
                        </div>
                      </div>
                      {isSelected && <Check size={20} color={type.color} />}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Connection-specific configuration */}
            {newConnectionType === 'loxone_api' && (
              <div style={{
                backgroundColor: '#d1fae5', padding: '16px', borderRadius: '12px',
                border: '2px solid #10b981', marginBottom: '16px'
              }}>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px', color: '#065f46' }}>
                    {t('meters.loxoneHost')} *
                  </label>
                  <input
                    type="text"
                    value={newConnectionConfig.loxone_host || ''}
                    onChange={(e) => setNewConnectionConfig({ ...newConnectionConfig, loxone_host: e.target.value })}
                    placeholder="192.168.1.100"
                    style={{
                      width: '100%', padding: '10px', border: '1px solid #10b981',
                      borderRadius: '6px', fontSize: '14px'
                    }}
                  />
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px', color: '#065f46' }}>
                    {t('meters.loxoneDeviceId')} *
                  </label>
                  <input
                    type="text"
                    value={newConnectionConfig.loxone_device_id || ''}
                    onChange={(e) => setNewConnectionConfig({ ...newConnectionConfig, loxone_device_id: e.target.value })}
                    placeholder="1e475b8d-017e-c7b5-ffff336efb88726d"
                    style={{
                      width: '100%', padding: '10px', border: '1px solid #10b981',
                      borderRadius: '6px', fontSize: '12px', fontFamily: 'monospace'
                    }}
                  />
                  <p style={{ fontSize: '11px', color: '#065f46', marginTop: '4px', margin: 0 }}>
                    {t('meters.loxoneDeviceIdDescription')}
                  </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px', color: '#065f46' }}>
                      {t('meters.loxoneUsername')}
                    </label>
                    <input
                      type="text"
                      value={newConnectionConfig.loxone_username || ''}
                      onChange={(e) => setNewConnectionConfig({ ...newConnectionConfig, loxone_username: e.target.value })}
                      placeholder="admin"
                      style={{
                        width: '100%', padding: '10px', border: '1px solid #10b981',
                        borderRadius: '6px', fontSize: '14px'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px', color: '#065f46' }}>
                      {t('meters.loxonePassword')}
                    </label>
                    <input
                      type="password"
                      value={newConnectionConfig.loxone_password || ''}
                      onChange={(e) => setNewConnectionConfig({ ...newConnectionConfig, loxone_password: e.target.value })}
                      placeholder="••••••••"
                      style={{
                        width: '100%', padding: '10px', border: '1px solid #10b981',
                        borderRadius: '6px', fontSize: '14px'
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {newConnectionType === 'udp' && (
              <div style={{
                backgroundColor: '#fef3c7', padding: '16px', borderRadius: '12px',
                border: '2px solid #f59e0b'
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px', color: '#92400e' }}>
                      {t('meters.listenPort')} *
                    </label>
                    <input
                      type="number"
                      value={newConnectionConfig.listen_port || 8888}
                      onChange={(e) => setNewConnectionConfig({ ...newConnectionConfig, listen_port: parseInt(e.target.value) })}
                      style={{
                        width: '100%', padding: '10px', border: '1px solid #f59e0b',
                        borderRadius: '6px', fontSize: '14px'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px', color: '#92400e' }}>
                      {t('meters.dataKey')} (Auto-generated)
                    </label>
                    <input
                      type="text"
                      value={newConnectionConfig.data_key || ''}
                      readOnly
                      style={{
                        width: '100%', padding: '10px', border: '1px solid #f59e0b',
                        borderRadius: '6px', fontSize: '11px', fontFamily: 'monospace',
                        backgroundColor: '#fef3c7'
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {newConnectionType === 'modbus_tcp' && (
              <div style={{
                backgroundColor: '#f3f4f6', padding: '16px', borderRadius: '12px',
                border: '2px solid #6b7280'
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px', color: '#374151' }}>
                      {t('meters.ipAddress')} *
                    </label>
                    <input
                      type="text"
                      value={newConnectionConfig.ip_address || ''}
                      onChange={(e) => setNewConnectionConfig({ ...newConnectionConfig, ip_address: e.target.value })}
                      placeholder="192.168.1.100"
                      style={{
                        width: '100%', padding: '10px', border: '1px solid #6b7280',
                        borderRadius: '6px', fontSize: '14px'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px', color: '#374151' }}>
                      {t('meters.port')} *
                    </label>
                    <input
                      type="number"
                      value={newConnectionConfig.port || 502}
                      onChange={(e) => setNewConnectionConfig({ ...newConnectionConfig, port: parseInt(e.target.value) })}
                      style={{
                        width: '100%', padding: '10px', border: '1px solid #6b7280',
                        borderRadius: '6px', fontSize: '14px'
                      }}
                    />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px', color: '#374151' }}>
                      {t('meters.registerAddress')}
                    </label>
                    <input
                      type="number"
                      value={newConnectionConfig.register_address || 0}
                      onChange={(e) => setNewConnectionConfig({ ...newConnectionConfig, register_address: parseInt(e.target.value) })}
                      style={{
                        width: '100%', padding: '10px', border: '1px solid #6b7280',
                        borderRadius: '6px', fontSize: '14px'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px', color: '#374151' }}>
                      {t('meters.registerCount')}
                    </label>
                    <input
                      type="number"
                      value={newConnectionConfig.register_count || 2}
                      onChange={(e) => setNewConnectionConfig({ ...newConnectionConfig, register_count: parseInt(e.target.value) })}
                      style={{
                        width: '100%', padding: '10px', border: '1px solid #6b7280',
                        borderRadius: '6px', fontSize: '14px'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px', color: '#374151' }}>
                      {t('meters.unitId')}
                    </label>
                    <input
                      type="number"
                      value={newConnectionConfig.unit_id || 1}
                      onChange={(e) => setNewConnectionConfig({ ...newConnectionConfig, unit_id: parseInt(e.target.value) })}
                      style={{
                        width: '100%', padding: '10px', border: '1px solid #6b7280',
                        borderRadius: '6px', fontSize: '14px'
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 5: New Meter Initial Reading */}
        {step === 5 && (
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px', color: '#1f2937' }}>
              {t('meters.replacement.step5.title') || 'New Meter Initial Reading'}
            </h3>
            
            <div style={{ marginBottom: '16px' }}>
              <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '12px', lineHeight: '1.6' }}>
                {t('meters.replacement.step5.instruction') || 'Enter the initial reading from the new meter. This is typically 0 or a small number for a new meter.'}
              </p>

              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px', color: '#374151' }}>
                {t('meters.replacement.step5.initialReading') || 'Initial Reading (kWh)'} *
              </label>
              <input
                type="number"
                step="0.001"
                value={newInitialReading}
                onChange={(e) => setNewInitialReading(e.target.value)}
                placeholder="0.000"
                style={{
                  width: '100%', padding: '12px', border: '2px solid #e5e7eb',
                  borderRadius: '8px', fontSize: '16px', fontFamily: 'monospace'
                }}
              />
            </div>

            <div style={{
              backgroundColor: '#f0f9ff', border: '2px solid #3b82f6',
              borderRadius: '12px', padding: '16px'
            }}>
              <p style={{ fontSize: '14px', fontWeight: '600', color: '#1e40af', margin: '0 0 12px 0' }}>
                📊 {t('meters.replacement.step5.offsetCalculation') || 'Offset Calculation Preview'}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px', color: '#1e40af' }}>
                <span>{parseFloat(oldFinalReading || '0').toFixed(3)} kWh</span>
                <span>−</span>
                <span>{parseFloat(newInitialReading || '0').toFixed(3)} kWh</span>
                <span>=</span>
                <strong style={{ fontSize: '16px' }}>{calculateOffset().toFixed(3)} kWh</strong>
              </div>
              <p style={{ fontSize: '12px', color: '#1e40af', margin: '8px 0 0 0' }}>
                {t('meters.replacement.step5.offsetExplanation') || 'This offset will be applied to all new readings for billing continuity'}
              </p>
            </div>
          </div>
        )}

        {/* Step 6: Review & Confirm */}
        {step === 6 && (
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px', color: '#1f2937' }}>
              {t('meters.replacement.step6.title') || 'Review & Confirm'}
            </h3>
            
            <div style={{
              backgroundColor: '#f9fafb', borderRadius: '12px', padding: '20px',
              marginBottom: '16px', border: '1px solid #e5e7eb'
            }}>
              <div style={{ marginBottom: '16px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#6b7280', margin: '0 0 8px 0' }}>
                  {t('meters.replacement.step6.oldMeter') || 'Old Meter'}
                </h4>
                <p style={{ fontSize: '14px', color: '#1f2937', margin: 0 }}>
                  <strong>{meter.name}</strong>
                </p>
                <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0 0' }}>
                  {t('meters.replacement.step6.finalReading')}: {parseFloat(oldFinalReading).toFixed(3)} kWh
                </p>
              </div>

              <div style={{ height: '2px', backgroundColor: '#e5e7eb', margin: '16px 0' }} />

              <div>
                <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#6b7280', margin: '0 0 8px 0' }}>
                  {t('meters.replacement.step6.newMeter') || 'New Meter'}
                </h4>
                <p style={{ fontSize: '14px', color: '#1f2937', margin: 0 }}>
                  <strong>{newMeterName}</strong>
                </p>
                <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0 0' }}>
                  {t('meters.replacement.step6.initialReading')}: {parseFloat(newInitialReading).toFixed(3)} kWh
                </p>
                <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0 0' }}>
                  {t('meters.connectionType')}: {newConnectionType}
                </p>
              </div>

              <div style={{ height: '2px', backgroundColor: '#e5e7eb', margin: '16px 0' }} />

              <div style={{
                backgroundColor: '#3b82f6', color: 'white',
                borderRadius: '8px', padding: '12px', textAlign: 'center'
              }}>
                <p style={{ fontSize: '13px', margin: '0 0 4px 0', opacity: 0.9 }}>
                  {t('meters.replacement.step6.readingOffset') || 'Reading Offset'}
                </p>
                <p style={{ fontSize: '24px', fontWeight: '700', margin: 0 }}>
                  {calculateOffset().toFixed(3)} kWh
                </p>
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px', color: '#374151' }}>
                {t('meters.replacement.step6.notes') || 'Replacement Notes (Optional)'}
              </label>
              <textarea
                value={replacementNotes}
                onChange={(e) => setReplacementNotes(e.target.value)}
                placeholder={t('meters.replacement.step6.notesPlaceholder') || 'e.g., Meter malfunction, scheduled maintenance, upgrade...'}
                rows={3}
                style={{
                  width: '100%', padding: '12px', border: '2px solid #e5e7eb',
                  borderRadius: '8px', fontSize: '14px', fontFamily: 'inherit',
                  resize: 'vertical'
                }}
              />
            </div>

            <div style={{
              backgroundColor: '#fee2e2', border: '2px solid #ef4444',
              borderRadius: '12px', padding: '16px'
            }}>
              <div style={{ display: 'flex', alignItems: 'start', gap: '12px' }}>
                <AlertTriangle size={20} color="#ef4444" style={{ marginTop: '2px', flexShrink: 0 }} />
                <div style={{ fontSize: '13px', color: '#991b1b', lineHeight: '1.6' }}>
                  <p style={{ margin: '0 0 8px 0', fontWeight: '600' }}>
                    {t('meters.replacement.step6.finalWarning') || 'Final Warning'}
                  </p>
                  <p style={{ margin: 0 }}>
                    {t('meters.replacement.step6.cannotUndo') || 'This replacement cannot be undone. The old meter will be archived and the new meter will immediately start collecting data.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
          {step > 1 && (
            <button
              onClick={handleBack}
              disabled={loading}
              style={{
                flex: 1, padding: '12px', backgroundColor: '#f3f4f6',
                color: '#374151', border: 'none', borderRadius: '8px',
                fontSize: '14px', fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1
              }}
            >
              {t('common.back')}
            </button>
          )}
          
          {step < 6 ? (
            <button
              onClick={handleNext}
              style={{
                flex: 1, padding: '12px', backgroundColor: '#667eea',
                color: 'white', border: 'none', borderRadius: '8px',
                fontSize: '14px', fontWeight: '600', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
              }}
            >
              {t('common.next')}
              <ArrowRight size={18} />
            </button>
          ) : (
            <button
              onClick={handleReplace}
              disabled={loading}
              style={{
                flex: 1, padding: '12px', backgroundColor: loading ? '#fca5a5' : '#ef4444',
                color: 'white', border: 'none', borderRadius: '8px',
                fontSize: '14px', fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
              }}
            >
              {loading ? t('meters.replacement.replacing') || 'Replacing...' : (
                <>
                  <RefreshCw size={18} />
                  {t('meters.replacement.confirmReplace') || 'Replace Meter'}
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}