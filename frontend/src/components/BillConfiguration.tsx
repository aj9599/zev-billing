import { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Check, FileText, Users, Zap, DollarSign } from 'lucide-react';
import { api } from '../api/client';
import type { Building, User, SharedMeterConfig, CustomLineItem, GenerateBillsRequest } from '../types';
import { useTranslation } from '../i18n';

interface BillConfigurationProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: () => void;
}

export default function BillConfiguration({ isOpen, onClose, onGenerate }: BillConfigurationProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState(1);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [sharedMeters, setSharedMeters] = useState<SharedMeterConfig[]>([]);
  const [customItems, setCustomItems] = useState<CustomLineItem[]>([]);
  const [loading, setLoading] = useState(false);

  const [config, setConfig] = useState<GenerateBillsRequest>({
    building_ids: [],
    user_ids: [],
    start_date: '',
    end_date: '',
    include_shared_meters: false,
    shared_meter_configs: [],
    custom_line_items: [],
    sender_name: '',
    sender_address: '',
    sender_city: '',
    sender_zip: '',
    sender_country: 'Switzerland',
    bank_name: '',
    bank_iban: '',
    bank_account_holder: ''
  });

  const [selectedSharedMeters, setSelectedSharedMeters] = useState<number[]>([]);
  const [selectedCustomItems, setSelectedCustomItems] = useState<number[]>([]);

  useEffect(() => {
    if (isOpen) {
      loadData();
      loadSavedInfo();
    }
  }, [isOpen]);

  const loadData = async () => {
    try {
      const [buildingsData, usersData, sharedMetersData, customItemsData] = await Promise.all([
        api.getBuildings(),
        api.getUsers(undefined, true),
        api.getSharedMeterConfigs(),
        api.getCustomLineItems()
      ]);
      setBuildings(buildingsData);
      setUsers(usersData);
      setSharedMeters(sharedMetersData);
      setCustomItems(customItemsData.filter(item => item.is_active));
    } catch (err) {
      console.error('Failed to load data:', err);
    }
  };

  const loadSavedInfo = () => {
    try {
      const savedSender = sessionStorage.getItem('zev_sender_info');
      const savedBanking = sessionStorage.getItem('zev_banking_info');

      if (savedSender) {
        const parsed = JSON.parse(savedSender);
        setConfig(prev => ({
          ...prev,
          sender_name: parsed.name || '',
          sender_address: parsed.address || '',
          sender_city: parsed.city || '',
          sender_zip: parsed.zip || '',
          sender_country: parsed.country || 'Switzerland'
        }));
      }

      if (savedBanking) {
        const parsed = JSON.parse(savedBanking);
        setConfig(prev => ({
          ...prev,
          bank_name: parsed.name || '',
          bank_iban: parsed.iban || '',
          bank_account_holder: parsed.holder || ''
        }));
      }
    } catch (e) {
      console.error('Failed to load saved info:', e);
    }
  };

  const filteredUsers = users.filter(user => 
    config.building_ids.length === 0 || config.building_ids.includes(user.building_id || 0)
  );

  const filteredSharedMeters = sharedMeters.filter(meter =>
    config.building_ids.includes(meter.building_id)
  );

  const filteredCustomItems = customItems.filter(item =>
    config.building_ids.includes(item.building_id)
  );

  const handleBuildingToggle = (buildingId: number) => {
    const newBuildings = config.building_ids.includes(buildingId)
      ? config.building_ids.filter(id => id !== buildingId)
      : [...config.building_ids, buildingId];
    
    setConfig({ ...config, building_ids: newBuildings });
  };

  const handleUserToggle = (userId: number) => {
    const newUsers = config.user_ids.includes(userId)
      ? config.user_ids.filter(id => id !== userId)
      : [...config.user_ids, userId];
    
    setConfig({ ...config, user_ids: newUsers });
  };

  const handleSharedMeterToggle = (meterId: number) => {
    if (selectedSharedMeters.includes(meterId)) {
      setSelectedSharedMeters(selectedSharedMeters.filter(id => id !== meterId));
    } else {
      setSelectedSharedMeters([...selectedSharedMeters, meterId]);
    }
  };

  const handleCustomItemToggle = (itemId: number) => {
    if (selectedCustomItems.includes(itemId)) {
      setSelectedCustomItems(selectedCustomItems.filter(id => id !== itemId));
    } else {
      setSelectedCustomItems([...selectedCustomItems, itemId]);
    }
  };

  const handleGenerate = async () => {
    if (!config.start_date || !config.end_date) {
      alert('Please select start and end dates');
      return;
    }

    if (config.building_ids.length === 0) {
      alert('Please select at least one building');
      return;
    }

    if (config.user_ids.length === 0) {
      alert('Please select at least one user');
      return;
    }

    setLoading(true);
    try {
      // Prepare shared meter configs
      const sharedMeterConfigs = selectedSharedMeters.map(id => {
        const meter = sharedMeters.find(m => m.id === id);
        return meter!;
      });

      // Prepare custom line items
      const customLineItems = selectedCustomItems.map(id => {
        const item = customItems.find(i => i.id === id);
        return {
          item_id: item!.id,
          description: item!.description,
          amount: item!.amount,
          category: item!.category,
          is_one_time: false
        };
      });

      const finalConfig = {
        ...config,
        include_shared_meters: selectedSharedMeters.length > 0,
        shared_meter_configs: sharedMeterConfigs,
        custom_line_items: customLineItems
      };

      const result = await api.generateBills(finalConfig);
      alert(`Successfully generated ${result.length} invoices!`);
      onGenerate();
      onClose();
      resetForm();
    } catch (err) {
      console.error('Failed to generate bills:', err);
      alert(`Failed to generate bills: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setStep(1);
    setConfig({
      building_ids: [],
      user_ids: [],
      start_date: '',
      end_date: '',
      include_shared_meters: false,
      shared_meter_configs: [],
      custom_line_items: [],
      sender_name: '',
      sender_address: '',
      sender_city: '',
      sender_zip: '',
      sender_country: 'Switzerland',
      bank_name: '',
      bank_iban: '',
      bank_account_holder: ''
    });
    setSelectedSharedMeters([]);
    setSelectedCustomItems([]);
  };

  const canProceed = () => {
    switch (step) {
      case 1:
        return config.building_ids.length > 0 && config.user_ids.length > 0 && 
               config.start_date && config.end_date;
      case 2:
        return true; // Optional step
      case 3:
        return true; // Optional step
      case 4:
        return config.sender_name && config.bank_iban;
      default:
        return false;
    }
  };

  // Step 1: Building & User Selection
  const renderStep1 = () => (
    <div>
      <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '24px' }}>
        Select Buildings, Users & Period
      </h3>

      {/* Date Range */}
      <div style={{ marginBottom: '30px', padding: '20px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
        <label style={{ display: 'block', fontWeight: '600', marginBottom: '12px', fontSize: '15px' }}>
          Billing Period
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '14px', marginBottom: '6px', color: '#6c757d' }}>
              Start Date
            </label>
            <input
              type="date"
              value={config.start_date}
              onChange={(e) => setConfig({ ...config, start_date: e.target.value })}
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ced4da',
                borderRadius: '6px',
                fontSize: '15px'
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '14px', marginBottom: '6px', color: '#6c757d' }}>
              End Date
            </label>
            <input
              type="date"
              value={config.end_date}
              onChange={(e) => setConfig({ ...config, end_date: e.target.value })}
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ced4da',
                borderRadius: '6px',
                fontSize: '15px'
              }}
            />
          </div>
        </div>
      </div>

      {/* Buildings */}
      <div style={{ marginBottom: '24px' }}>
        <label style={{ display: 'block', fontWeight: '600', marginBottom: '12px', fontSize: '15px' }}>
          Select Buildings ({config.building_ids.length} selected)
        </label>
        <div style={{ 
          maxHeight: '200px', 
          overflowY: 'auto', 
          border: '1px solid #dee2e6', 
          borderRadius: '6px',
          backgroundColor: 'white'
        }}>
          {buildings.map(building => (
            <label
              key={building.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '12px 16px',
                cursor: 'pointer',
                borderBottom: '1px solid #f0f0f0',
                transition: 'background-color 0.2s'
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f8f9fa'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'white'}
            >
              <input
                type="checkbox"
                checked={config.building_ids.includes(building.id)}
                onChange={() => handleBuildingToggle(building.id)}
                style={{ marginRight: '12px', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '15px' }}>{building.name}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Users */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <label style={{ fontWeight: '600', fontSize: '15px' }}>
            Select Users ({config.user_ids.length} selected)
          </label>
          {config.building_ids.length > 0 && (
            <button
              onClick={() => {
                const userIds = filteredUsers.filter(u => u.is_active).map(u => u.id);
                setConfig({ ...config, user_ids: userIds });
              }}
              style={{
                padding: '6px 12px',
                backgroundColor: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              Select All Active
            </button>
          )}
        </div>
        <div style={{ 
          maxHeight: '300px', 
          overflowY: 'auto', 
          border: '1px solid #dee2e6', 
          borderRadius: '6px',
          backgroundColor: 'white'
        }}>
          {filteredUsers.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#6c757d' }}>
              {config.building_ids.length === 0 ? 'Select a building first' : 'No users found'}
            </div>
          ) : (
            filteredUsers.map(user => (
              <label
                key={user.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '12px 16px',
                  cursor: 'pointer',
                  borderBottom: '1px solid #f0f0f0',
                  transition: 'background-color 0.2s',
                  opacity: user.is_active ? 1 : 0.6
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f8f9fa'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'white'}
              >
                <input
                  type="checkbox"
                  checked={config.user_ids.includes(user.id)}
                  onChange={() => handleUserToggle(user.id)}
                  style={{ marginRight: '12px', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '15px' }}>
                  {user.first_name} {user.last_name}
                  {!user.is_active && <span style={{ color: '#dc3545', marginLeft: '8px', fontSize: '13px' }}>(Archived)</span>}
                </span>
              </label>
            ))
          )}
        </div>
      </div>
    </div>
  );

  // Step 2: Shared Meters
  const renderStep2 = () => (
    <div>
      <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '16px' }}>
        Shared Meters (Optional)
      </h3>
      <p style={{ color: '#6c757d', marginBottom: '24px', fontSize: '14px' }}>
        Select which shared meters to include in the invoices. Leave empty to skip.
      </p>

      {filteredSharedMeters.length === 0 ? (
        <div style={{ 
          padding: '40px', 
          textAlign: 'center', 
          backgroundColor: '#f8f9fa', 
          borderRadius: '8px',
          color: '#6c757d'
        }}>
          <Zap size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
          <p>No shared meters configured for selected buildings</p>
        </div>
      ) : (
        <div style={{ 
          border: '1px solid #dee2e6', 
          borderRadius: '6px',
          backgroundColor: 'white'
        }}>
          {filteredSharedMeters.map(meter => {
            const building = buildings.find(b => b.id === meter.building_id);
            return (
              <label
                key={meter.id}
                style={{
                  display: 'flex',
                  alignItems: 'start',
                  padding: '16px',
                  cursor: 'pointer',
                  borderBottom: '1px solid #f0f0f0',
                  transition: 'background-color 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f8f9fa'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'white'}
              >
                <input
                  type="checkbox"
                  checked={selectedSharedMeters.includes(meter.id)}
                  onChange={() => handleSharedMeterToggle(meter.id)}
                  style={{ marginRight: '12px', marginTop: '2px', cursor: 'pointer' }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '15px', fontWeight: '600', marginBottom: '4px' }}>
                    {meter.meter_name}
                  </div>
                  <div style={{ fontSize: '13px', color: '#6c757d' }}>
                    {building?.name} • {meter.split_type} split • CHF {meter.unit_price.toFixed(3)}/kWh
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      )}

      <div style={{ 
        marginTop: '20px', 
        padding: '16px', 
        backgroundColor: '#e7f3ff', 
        borderRadius: '6px',
        fontSize: '14px',
        color: '#004a99'
      }}>
        <strong>Selected:</strong> {selectedSharedMeters.length} shared meter(s)
      </div>
    </div>
  );

  // Step 3: Custom Line Items
  const renderStep3 = () => (
    <div>
      <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '16px' }}>
        Custom Line Items (Optional)
      </h3>
      <p style={{ color: '#6c757d', marginBottom: '24px', fontSize: '14px' }}>
        Add custom charges like meter rental, maintenance fees, etc.
      </p>

      {filteredCustomItems.length === 0 ? (
        <div style={{ 
          padding: '40px', 
          textAlign: 'center', 
          backgroundColor: '#f8f9fa', 
          borderRadius: '8px',
          color: '#6c757d'
        }}>
          <DollarSign size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
          <p>No custom line items configured for selected buildings</p>
        </div>
      ) : (
        <div style={{ 
          border: '1px solid #dee2e6', 
          borderRadius: '6px',
          backgroundColor: 'white'
        }}>
          {filteredCustomItems.map(item => {
            const building = buildings.find(b => b.id === item.building_id);
            return (
              <label
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'start',
                  padding: '16px',
                  cursor: 'pointer',
                  borderBottom: '1px solid #f0f0f0',
                  transition: 'background-color 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f8f9fa'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'white'}
              >
                <input
                  type="checkbox"
                  checked={selectedCustomItems.includes(item.id)}
                  onChange={() => handleCustomItemToggle(item.id)}
                  style={{ marginRight: '12px', marginTop: '2px', cursor: 'pointer' }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '15px', fontWeight: '600', marginBottom: '4px' }}>
                    {item.description}
                  </div>
                  <div style={{ fontSize: '13px', color: '#6c757d' }}>
                    {building?.name} • CHF {item.amount.toFixed(2)} • {item.frequency} • {item.category}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      )}

      <div style={{ 
        marginTop: '20px', 
        padding: '16px', 
        backgroundColor: '#e7f3ff', 
        borderRadius: '6px',
        fontSize: '14px',
        color: '#004a99'
      }}>
        <strong>Selected:</strong> {selectedCustomItems.length} custom item(s)
      </div>
    </div>
  );

  // Step 4: Review & Sender Info
  const renderStep4 = () => (
    <div>
      <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '24px' }}>
        Review & Sender Information
      </h3>

      {/* Summary */}
      <div style={{ 
        marginBottom: '24px', 
        padding: '20px', 
        backgroundColor: '#f8f9fa', 
        borderRadius: '8px'
      }}>
        <h4 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>Summary</h4>
        <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px', lineHeight: '1.8' }}>
          <li><strong>Period:</strong> {config.start_date} to {config.end_date}</li>
          <li><strong>Buildings:</strong> {config.building_ids.length}</li>
          <li><strong>Users:</strong> {config.user_ids.length}</li>
          <li><strong>Shared Meters:</strong> {selectedSharedMeters.length}</li>
          <li><strong>Custom Items:</strong> {selectedCustomItems.length}</li>
          <li><strong>Estimated Invoices:</strong> {config.user_ids.length}</li>
        </ul>
      </div>

      {/* Sender Information */}
      <div style={{ marginBottom: '24px' }}>
        <h4 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>Sender Information</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '14px', marginBottom: '6px', fontWeight: '500' }}>
              Name *
            </label>
            <input
              type="text"
              value={config.sender_name}
              onChange={(e) => setConfig({ ...config, sender_name: e.target.value })}
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ced4da',
                borderRadius: '6px',
                fontSize: '15px'
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '14px', marginBottom: '6px', fontWeight: '500' }}>
              Address
            </label>
            <input
              type="text"
              value={config.sender_address}
              onChange={(e) => setConfig({ ...config, sender_address: e.target.value })}
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ced4da',
                borderRadius: '6px',
                fontSize: '15px'
              }}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '14px', marginBottom: '6px', fontWeight: '500' }}>
                ZIP
              </label>
              <input
                type="text"
                value={config.sender_zip}
                onChange={(e) => setConfig({ ...config, sender_zip: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #ced4da',
                  borderRadius: '6px',
                  fontSize: '15px'
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '14px', marginBottom: '6px', fontWeight: '500' }}>
                City
              </label>
              <input
                type="text"
                value={config.sender_city}
                onChange={(e) => setConfig({ ...config, sender_city: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #ced4da',
                  borderRadius: '6px',
                  fontSize: '15px'
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Banking Information */}
      <div>
        <h4 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>Banking Information</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '14px', marginBottom: '6px', fontWeight: '500' }}>
              Bank Name
            </label>
            <input
              type="text"
              value={config.bank_name}
              onChange={(e) => setConfig({ ...config, bank_name: e.target.value })}
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ced4da',
                borderRadius: '6px',
                fontSize: '15px'
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '14px', marginBottom: '6px', fontWeight: '500' }}>
              IBAN *
            </label>
            <input
              type="text"
              value={config.bank_iban}
              onChange={(e) => setConfig({ ...config, bank_iban: e.target.value })}
              placeholder="CH93 0000 0000 0000 0000 0"
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ced4da',
                borderRadius: '6px',
                fontSize: '15px'
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '14px', marginBottom: '6px', fontWeight: '500' }}>
              Account Holder
            </label>
            <input
              type="text"
              value={config.bank_account_holder}
              onChange={(e) => setConfig({ ...config, bank_account_holder: e.target.value })}
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ced4da',
                borderRadius: '6px',
                fontSize: '15px'
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000,
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        maxWidth: '900px',
        width: '100%',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 10px 40px rgba(0,0,0,0.2)'
      }}>
        {/* Header */}
        <div style={{ 
          padding: '24px 30px', 
          borderBottom: '1px solid #dee2e6',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0 }}>
            Advanced Bill Configuration
          </h2>
          <button
            onClick={onClose}
            style={{
              padding: '8px',
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <X size={24} />
          </button>
        </div>

        {/* Progress Steps */}
        <div style={{ 
          padding: '20px 30px', 
          borderBottom: '1px solid #dee2e6',
          backgroundColor: '#f8f9fa'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative' }}>
            {[1, 2, 3, 4].map(s => (
              <div key={s} style={{ 
                flex: 1, 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center',
                position: 'relative'
              }}>
                {s < 4 && (
                  <div style={{
                    position: 'absolute',
                    top: '20px',
                    left: '50%',
                    right: '-50%',
                    height: '2px',
                    backgroundColor: step > s ? '#28a745' : '#dee2e6',
                    zIndex: 0
                  }} />
                )}
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  backgroundColor: step >= s ? (step > s ? '#28a745' : '#007bff') : '#dee2e6',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 'bold',
                  position: 'relative',
                  zIndex: 1
                }}>
                  {step > s ? <Check size={20} /> : s}
                </div>
                <div style={{ 
                  marginTop: '8px', 
                  fontSize: '12px', 
                  textAlign: 'center',
                  fontWeight: step === s ? '600' : 'normal',
                  color: step === s ? '#007bff' : '#6c757d'
                }}>
                  {s === 1 && 'Selection'}
                  {s === 2 && 'Meters'}
                  {s === 3 && 'Items'}
                  {s === 4 && 'Review'}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ 
          padding: '30px', 
          flex: 1, 
          overflowY: 'auto' 
        }}>
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          {step === 4 && renderStep4()}
        </div>

        {/* Footer */}
        <div style={{ 
          padding: '20px 30px', 
          borderTop: '1px solid #dee2e6',
          display: 'flex',
          justifyContent: 'space-between',
          gap: '12px',
          backgroundColor: '#f8f9fa'
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '12px 24px',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '15px',
              fontWeight: '500'
            }}
          >
            Cancel
          </button>
          
          <div style={{ display: 'flex', gap: '12px' }}>
            {step > 1 && (
              <button
                onClick={() => setStep(step - 1)}
                style={{
                  padding: '12px 24px',
                  backgroundColor: 'white',
                  color: '#007bff',
                  border: '1px solid #007bff',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '15px',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <ChevronLeft size={18} />
                Previous
              </button>
            )}
            
            {step < 4 ? (
              <button
                onClick={() => setStep(step + 1)}
                disabled={!canProceed()}
                style={{
                  padding: '12px 24px',
                  backgroundColor: canProceed() ? '#007bff' : '#ced4da',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: canProceed() ? 'pointer' : 'not-allowed',
                  fontSize: '15px',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                Next
                <ChevronRight size={18} />
              </button>
            ) : (
              <button
                onClick={handleGenerate}
                disabled={!canProceed() || loading}
                style={{
                  padding: '12px 24px',
                  backgroundColor: (canProceed() && !loading) ? '#28a745' : '#ced4da',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: (canProceed() && !loading) ? 'pointer' : 'not-allowed',
                  fontSize: '15px',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <FileText size={18} />
                {loading ? 'Generating...' : `Generate ${config.user_ids.length} Invoice(s)`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}