import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, HelpCircle, X, Calendar, Clock, Building, Users, PlayCircle, PauseCircle } from 'lucide-react';
import { api } from '../api/client';
import { useTranslation } from '../i18n';

interface AutoBillingConfig {
  id: number;
  name: string;
  building_ids: number[];
  user_ids: number[];
  frequency: 'monthly' | 'quarterly' | 'half_yearly' | 'yearly';
  generation_day: number;
  is_active: boolean;
  last_run?: string;
  next_run?: string;
  sender_name?: string;
  sender_address?: string;
  sender_city?: string;
  sender_zip?: string;
  sender_country?: string;
  bank_name?: string;
  bank_iban?: string;
  bank_account_holder?: string;
  created_at: string;
  updated_at: string;
}

interface Building {
  id: number;
  name: string;
  is_group: boolean;
}

interface User {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  building_id?: number;
}

export default function AutoBilling() {
  const { t } = useTranslation();
  const [configs, setConfigs] = useState<AutoBillingConfig[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [editingConfig, setEditingConfig] = useState<AutoBillingConfig | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    building_ids: [] as number[],
    user_ids: [] as number[],
    frequency: 'monthly' as 'monthly' | 'quarterly' | 'half_yearly' | 'yearly',
    generation_day: 1,
    is_active: true,
    sender_name: '',
    sender_address: '',
    sender_city: '',
    sender_zip: '',
    sender_country: 'Switzerland',
    bank_name: '',
    bank_iban: '',
    bank_account_holder: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [configsData, buildingsData, usersData] = await Promise.all([
        api.getAutoBillingConfigs(),
        api.getBuildings(),
        api.getUsers()
      ]);
      setConfigs(configsData);
      setBuildings(buildingsData.filter(b => !b.is_group));
      setUsers(usersData);
    } catch (err) {
      console.error('Failed to load data:', err);
    }
  };

  const handleSubmit = async () => {
    if (formData.building_ids.length === 0) {
      alert(t('autoBilling.selectAtLeastOneBuilding'));
      return;
    }

    try {
      if (editingConfig) {
        await api.updateAutoBillingConfig(editingConfig.id, formData);
      } else {
        await api.createAutoBillingConfig(formData);
      }
      setShowModal(false);
      resetForm();
      loadData();
      alert(editingConfig ? t('autoBilling.updateSuccess') : t('autoBilling.createSuccess'));
    } catch (err: any) {
      alert(t('autoBilling.saveFailed') + '\n' + (err.message || err));
    }
  };

  const handleEdit = (config: AutoBillingConfig) => {
    setEditingConfig(config);
    setFormData({
      name: config.name,
      building_ids: config.building_ids,
      user_ids: config.user_ids,
      frequency: config.frequency,
      generation_day: config.generation_day,
      is_active: config.is_active,
      sender_name: config.sender_name || '',
      sender_address: config.sender_address || '',
      sender_city: config.sender_city || '',
      sender_zip: config.sender_zip || '',
      sender_country: config.sender_country || 'Switzerland',
      bank_name: config.bank_name || '',
      bank_iban: config.bank_iban || '',
      bank_account_holder: config.bank_account_holder || ''
    });
    setShowModal(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t('autoBilling.deleteConfirm'))) return;
    
    try {
      await api.deleteAutoBillingConfig(id);
      loadData();
      alert(t('autoBilling.deleteSuccess'));
    } catch (err) {
      alert(t('autoBilling.deleteFailed') + ' ' + err);
    }
  };

  const toggleActive = async (config: AutoBillingConfig) => {
    try {
      await api.updateAutoBillingConfig(config.id, {
        ...config,
        is_active: !config.is_active
      });
      loadData();
    } catch (err) {
      alert(t('autoBilling.toggleFailed') + ' ' + err);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      building_ids: [],
      user_ids: [],
      frequency: 'monthly',
      generation_day: 1,
      is_active: true,
      sender_name: '',
      sender_address: '',
      sender_city: '',
      sender_zip: '',
      sender_country: 'Switzerland',
      bank_name: '',
      bank_iban: '',
      bank_account_holder: ''
    });
    setEditingConfig(null);
  };

  const toggleBuilding = (id: number) => {
    if (formData.building_ids.includes(id)) {
      setFormData({ ...formData, building_ids: formData.building_ids.filter(bid => bid !== id) });
    } else {
      setFormData({ ...formData, building_ids: [...formData.building_ids, id] });
    }
  };

  const toggleUser = (id: number) => {
    if (formData.user_ids.includes(id)) {
      setFormData({ ...formData, user_ids: formData.user_ids.filter(uid => uid !== id) });
    } else {
      setFormData({ ...formData, user_ids: [...formData.user_ids, id] });
    }
  };

  const getFrequencyLabel = (freq: string) => {
    return t(`autoBilling.frequency.${freq}`);
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('de-CH');
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
          <h2 style={{ fontSize: '24px', fontWeight: 'bold' }}>{t('autoBilling.instructions.title')}</h2>
          <button onClick={() => setShowInstructions(false)}
            style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        <div style={{ lineHeight: '1.8', color: '#374151' }}>
          <div style={{ backgroundColor: '#dbeafe', padding: '16px', borderRadius: '8px', marginBottom: '16px', border: '2px solid #3b82f6' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '10px', color: '#1f2937', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Calendar size={20} color="#3b82f6" />
              {t('autoBilling.instructions.whatIsAutoBilling')}
            </h3>
            <p>{t('autoBilling.instructions.autoBillingDescription')}</p>
          </div>

          <h3 style={{ fontSize: '18px', fontWeight: '600', marginTop: '20px', marginBottom: '10px', color: '#1f2937' }}>
            {t('autoBilling.instructions.howItWorks')}
          </h3>
          <ul style={{ marginLeft: '20px' }}>
            <li>{t('autoBilling.instructions.work1')}</li>
            <li>{t('autoBilling.instructions.work2')}</li>
            <li>{t('autoBilling.instructions.work3')}</li>
            <li>{t('autoBilling.instructions.work4')}</li>
          </ul>

          <h3 style={{ fontSize: '18px', fontWeight: '600', marginTop: '20px', marginBottom: '10px', color: '#1f2937' }}>
            {t('autoBilling.instructions.frequencies')}
          </h3>
          <ul style={{ marginLeft: '20px' }}>
            <li><strong>{t('autoBilling.frequency.monthly')}:</strong> {t('autoBilling.instructions.freq1')}</li>
            <li><strong>{t('autoBilling.frequency.quarterly')}:</strong> {t('autoBilling.instructions.freq2')}</li>
            <li><strong>{t('autoBilling.frequency.half_yearly')}:</strong> {t('autoBilling.instructions.freq3')}</li>
            <li><strong>{t('autoBilling.frequency.yearly')}:</strong> {t('autoBilling.instructions.freq4')}</li>
          </ul>

          <h3 style={{ fontSize: '18px', fontWeight: '600', marginTop: '20px', marginBottom: '10px', color: '#1f2937' }}>
            {t('autoBilling.instructions.howToUse')}
          </h3>
          <ul style={{ marginLeft: '20px' }}>
            <li>{t('autoBilling.instructions.step1')}</li>
            <li>{t('autoBilling.instructions.step2')}</li>
            <li>{t('autoBilling.instructions.step3')}</li>
            <li>{t('autoBilling.instructions.step4')}</li>
            <li>{t('autoBilling.instructions.step5')}</li>
          </ul>

          <div style={{ backgroundColor: '#fef3c7', padding: '16px', borderRadius: '8px', marginTop: '16px', border: '1px solid #f59e0b' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px', color: '#1f2937' }}>
              {t('autoBilling.instructions.important')}
            </h3>
            <ul style={{ marginLeft: '20px', fontSize: '14px' }}>
              <li>{t('autoBilling.instructions.important1')}</li>
              <li>{t('autoBilling.instructions.important2')}</li>
              <li>{t('autoBilling.instructions.important3')}</li>
              <li>{t('autoBilling.instructions.important4')}</li>
            </ul>
          </div>

          <div style={{ backgroundColor: '#f0fdf4', padding: '16px', borderRadius: '8px', marginTop: '16px', border: '1px solid #10b981' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px', color: '#1f2937' }}>
              {t('autoBilling.instructions.tips')}
            </h3>
            <ul style={{ marginLeft: '20px', fontSize: '14px' }}>
              <li>{t('autoBilling.instructions.tip1')}</li>
              <li>{t('autoBilling.instructions.tip2')}</li>
              <li>{t('autoBilling.instructions.tip3')}</li>
              <li>{t('autoBilling.instructions.tip4')}</li>
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
    <div className="auto-billing-container" style={{ width: '100%', maxWidth: '100%' }}>
      <div className="auto-billing-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', gap: '15px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
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
            <Calendar size={36} style={{ color: '#667eea' }} />
            {t('autoBilling.title')}
          </h1>
          <p style={{ color: '#6b7280', fontSize: '16px' }}>
            {t('autoBilling.subtitle')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            onClick={() => setShowInstructions(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
              backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '6px',
              fontSize: '14px', cursor: 'pointer'
            }}
          >
            <HelpCircle size={18} />
            {t('autoBilling.setupInstructions')}
          </button>
          <button
            onClick={() => { resetForm(); setShowModal(true); }}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
              backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '6px',
              fontSize: '14px', cursor: 'pointer'
            }}
          >
            <Plus size={18} />
            {t('autoBilling.addConfig')}
          </button>
        </div>
      </div>

      {configs.length === 0 ? (
        <div style={{
          backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          padding: '60px 20px', textAlign: 'center', color: '#999'
        }}>
          {t('autoBilling.noConfigs')}
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
          gap: '20px'
        }}>
          {configs.map(config => (
            <div key={config.id} style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              padding: '20px',
              border: config.is_active ? '2px solid #28a745' : '2px solid #ddd'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px', color: '#1f2937' }}>
                    {config.name}
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <Clock size={16} color="#6b7280" />
                    <span style={{ fontSize: '14px', color: '#6b7280' }}>
                      {getFrequencyLabel(config.frequency)} - {t('autoBilling.day')} {config.generation_day}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => toggleActive(config)}
                  style={{
                    padding: '8px',
                    backgroundColor: config.is_active ? '#28a745' : '#6c757d',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                  title={config.is_active ? t('autoBilling.pause') : t('autoBilling.activate')}
                >
                  {config.is_active ? <PauseCircle size={16} /> : <PlayCircle size={16} />}
                </button>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <Building size={16} color="#6b7280" />
                  <span style={{ fontSize: '13px', fontWeight: '600', color: '#6b7280' }}>
                    {config.building_ids.length} {config.building_ids.length === 1 ? t('buildings.title').slice(0, -1) : t('buildings.title')}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <Users size={16} color="#6b7280" />
                  <span style={{ fontSize: '13px', color: '#6b7280' }}>
                    {config.user_ids.length === 0 
                      ? t('autoBilling.allUsers') 
                      : `${config.user_ids.length} ${config.user_ids.length === 1 ? t('users.user') : t('users.users')}`}
                  </span>
                </div>
              </div>

              <div style={{
                padding: '12px',
                backgroundColor: '#f9f9f9',
                borderRadius: '8px',
                marginBottom: '12px'
              }}>
                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
                  {t('autoBilling.lastRun')}: <strong>{formatDate(config.last_run)}</strong>
                </div>
                <div style={{ fontSize: '12px', color: '#6b7280' }}>
                  {t('autoBilling.nextRun')}: <strong style={{ color: '#28a745' }}>{formatDate(config.next_run)}</strong>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid #f3f4f6', paddingTop: '12px' }}>
                <button
                  onClick={() => handleEdit(config)}
                  style={{
                    flex: 1,
                    padding: '8px',
                    backgroundColor: '#007bff',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px'
                  }}
                >
                  <Edit2 size={14} />
                  {t('common.edit')}
                </button>
                <button
                  onClick={() => handleDelete(config.id)}
                  style={{
                    flex: 1,
                    padding: '8px',
                    backgroundColor: '#dc3545',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px'
                  }}
                >
                  <Trash2 size={14} />
                  {t('common.delete')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showInstructions && <InstructionsModal />}

      {showModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', zIndex: 1000, padding: '15px', overflow: 'auto'
        }}>
          <div className="modal-content" style={{
            backgroundColor: 'white', borderRadius: '12px', padding: '30px',
            width: '90%', maxWidth: '700px', maxHeight: '90vh', overflow: 'auto'
          }}>
            <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '20px' }}>
              {editingConfig ? t('autoBilling.editConfig') : t('autoBilling.addConfig')}
            </h2>

            <div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                  {t('autoBilling.configName')} *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}
                  placeholder={t('autoBilling.configNamePlaceholder')}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '12px', fontWeight: '600', fontSize: '15px' }}>
                  {t('autoBilling.selectBuildings')} * ({t('billing.atLeastOne')})
                </label>
                <div style={{ padding: '16px', backgroundColor: '#f9f9f9', borderRadius: '8px', maxHeight: '200px', overflow: 'auto' }}>
                  {buildings.map(b => (
                    <label key={b.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={formData.building_ids.includes(b.id)}
                        onChange={() => toggleBuilding(b.id)}
                      />
                      <span>{b.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '12px', fontWeight: '600', fontSize: '15px' }}>
                  {t('autoBilling.selectUsers')} ({t('billing.leaveEmptyForAll')})
                </label>
                <div style={{ padding: '16px', backgroundColor: '#f9f9f9', borderRadius: '8px', maxHeight: '200px', overflow: 'auto' }}>
                  {users.filter(u => formData.building_ids.includes(u.building_id || 0)).map(u => (
                    <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={formData.user_ids.includes(u.id)}
                        onChange={() => toggleUser(u.id)}
                      />
                      <span style={{ fontSize: '14px' }}>{u.first_name} {u.last_name} ({u.email})</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                    {t('autoBilling.frequency')} *
                  </label>
                  <select
                    value={formData.frequency}
                    onChange={(e) => setFormData({ ...formData, frequency: e.target.value as any })}
                    style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}
                  >
                    <option value="monthly">{t('autoBilling.frequency.monthly')}</option>
                    <option value="quarterly">{t('autoBilling.frequency.quarterly')}</option>
                    <option value="half_yearly">{t('autoBilling.frequency.half_yearly')}</option>
                    <option value="yearly">{t('autoBilling.frequency.yearly')}</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                    {t('autoBilling.generationDay')} *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="28"
                    value={formData.generation_day}
                    onChange={(e) => setFormData({ ...formData, generation_day: parseInt(e.target.value) })}
                    style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}
                  />
                  <small style={{ fontSize: '12px', color: '#666' }}>{t('autoBilling.generationDayHelp')}</small>
                </div>
              </div>

              <div style={{ marginBottom: '16px', padding: '16px', backgroundColor: '#f0f4ff', borderRadius: '8px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>{t('billing.senderInfo')}</h3>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px' }}>{t('billing.senderName')}</label>
                  <input
                    type="text"
                    value={formData.sender_name}
                    onChange={(e) => setFormData({ ...formData, sender_name: e.target.value })}
                    style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px' }}
                    placeholder={t('billing.senderNamePlaceholder')}
                  />
                </div>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px' }}>{t('billing.senderAddress')}</label>
                  <input
                    type="text"
                    value={formData.sender_address}
                    onChange={(e) => setFormData({ ...formData, sender_address: e.target.value })}
                    style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px' }}
                    placeholder={t('billing.senderAddressPlaceholder')}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px' }}>{t('billing.zip')}</label>
                    <input
                      type="text"
                      value={formData.sender_zip}
                      onChange={(e) => setFormData({ ...formData, sender_zip: e.target.value })}
                      style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px' }}
                      placeholder={t('billing.zipPlaceholder')}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px' }}>{t('billing.city')}</label>
                    <input
                      type="text"
                      value={formData.sender_city}
                      onChange={(e) => setFormData({ ...formData, sender_city: e.target.value })}
                      style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px' }}
                      placeholder={t('billing.cityPlaceholder')}
                    />
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: '16px', padding: '16px', backgroundColor: '#f0fff4', borderRadius: '8px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>{t('billing.bankingInfo')}</h3>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px' }}>{t('billing.bankName')}</label>
                  <input
                    type="text"
                    value={formData.bank_name}
                    onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                    style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px' }}
                    placeholder={t('billing.bankNamePlaceholder')}
                  />
                </div>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px' }}>{t('billing.iban')}</label>
                  <input
                    type="text"
                    value={formData.bank_iban}
                    onChange={(e) => setFormData({ ...formData, bank_iban: e.target.value })}
                    style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px' }}
                    placeholder={t('billing.ibanPlaceholder')}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px' }}>{t('billing.accountHolder')}</label>
                  <input
                    type="text"
                    value={formData.bank_account_holder}
                    onChange={(e) => setFormData({ ...formData, bank_account_holder: e.target.value })}
                    style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px' }}
                    placeholder={t('billing.accountHolderPlaceholder')}
                  />
                </div>
              </div>

              <div className="button-group" style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button onClick={handleSubmit} style={{
                  flex: 1, padding: '12px', backgroundColor: '#28a745', color: 'white',
                  border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '500', cursor: 'pointer'
                }}>
                  {editingConfig ? t('common.update') : t('common.create')}
                </button>
                <button onClick={() => { setShowModal(false); resetForm(); }} style={{
                  flex: 1, padding: '12px', backgroundColor: '#6c757d', color: 'white',
                  border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '500', cursor: 'pointer'
                }}>
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .auto-billing-container h1 {
            font-size: 24px !important;
          }

          .auto-billing-container h1 svg {
            width: 24px !important;
            height: 24px !important;
          }

          .auto-billing-header {
            flex-direction: column !important;
            align-items: stretch !important;
          }

          .auto-billing-header > div:last-child {
            width: 100%;
          }

          .auto-billing-header button {
            width: 100% !important;
            justify-content: center !important;
          }

          .modal-content {
            padding: 20px !important;
          }

          .form-row {
            grid-template-columns: 1fr !important;
          }
        }

        @media (max-width: 480px) {
          .auto-billing-container h1 {
            font-size: 20px !important;
          }

          .modal-content {
            padding: 15px !important;
          }
        }
      `}</style>
    </div>
  );
}