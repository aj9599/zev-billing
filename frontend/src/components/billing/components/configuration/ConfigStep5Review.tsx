import { useState, useEffect } from 'react';
import { Bookmark, Trash2 } from 'lucide-react';
import { useTranslation } from '../../../../i18n';
import { api } from '../../../../api/client';
import { notify } from '../../../../utils/toast';
import type { BillingProfile } from '../../../../types';

interface ConfigStep5ReviewProps {
  isVZEVMode: boolean;
  startDate: string;
  endDate: string;
  buildingCount: number;
  apartmentCount: number;
  userCount: number;
  sharedMeterCount: number;
  customItemCount: number;
  senderName: string;
  senderAddress: string;
  senderCity: string;
  senderZip: string;
  bankName: string;
  bankIban: string;
  bankAccountHolder: string;
  onSenderNameChange: (value: string) => void;
  onSenderAddressChange: (value: string) => void;
  onSenderCityChange: (value: string) => void;
  onSenderZipChange: (value: string) => void;
  onBankNameChange: (value: string) => void;
  onBankIbanChange: (value: string) => void;
  onBankAccountHolderChange: (value: string) => void;
}

export default function ConfigStep5Review({
  isVZEVMode,
  startDate,
  endDate,
  buildingCount,
  apartmentCount,
  userCount,
  sharedMeterCount,
  customItemCount,
  senderName,
  senderAddress,
  senderCity,
  senderZip,
  bankName,
  bankIban,
  bankAccountHolder,
  onSenderNameChange,
  onSenderAddressChange,
  onSenderCityChange,
  onSenderZipChange,
  onBankNameChange,
  onBankIbanChange,
  onBankAccountHolderChange
}: ConfigStep5ReviewProps) {
  const { t } = useTranslation();
  const [profiles, setProfiles] = useState<BillingProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [newProfileName, setNewProfileName] = useState('');

  const loadProfiles = async () => {
    try {
      setProfiles(await api.getBillingProfiles());
    } catch {
      // non-fatal; the form still works without saved profiles
    }
  };

  useEffect(() => { loadProfiles(); }, []);

  const applyProfile = (id: string) => {
    setSelectedProfileId(id);
    const p = profiles.find(pr => String(pr.id) === id);
    if (!p) return;
    onSenderNameChange(p.sender_name);
    onSenderAddressChange(p.sender_address);
    onSenderZipChange(p.sender_zip);
    onSenderCityChange(p.sender_city);
    onBankNameChange(p.bank_name);
    onBankIbanChange(p.bank_iban);
    onBankAccountHolderChange(p.bank_account_holder);
  };

  const handleSaveProfile = async () => {
    const name = newProfileName.trim();
    if (!name) return;
    try {
      await api.createBillingProfile({
        name,
        sender_name: senderName,
        sender_address: senderAddress,
        sender_zip: senderZip,
        sender_city: senderCity,
        sender_country: '',
        bank_name: bankName,
        bank_iban: bankIban,
        bank_account_holder: bankAccountHolder,
      });
      setNewProfileName('');
      await loadProfiles();
      notify.success(t('billConfig.step5.profileSaved'));
    } catch {
      notify.error(t('billConfig.step5.profileSaveFailed'));
    }
  };

  const handleDeleteProfile = async () => {
    if (!selectedProfileId) return;
    try {
      await api.deleteBillingProfile(parseInt(selectedProfileId));
      setSelectedProfileId('');
      await loadProfiles();
      notify.success(t('billConfig.step5.profileDeleted'));
    } catch {
      notify.error(t('billConfig.step5.profileDeleteFailed'));
    }
  };

  const fieldStyle: React.CSSProperties = {
    padding: '10px',
    border: '1px solid #ced4da',
    borderRadius: '6px',
    fontSize: '14px'
  };

  return (
    <div>
      <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '24px' }}>
        {t('billConfig.step5.title')}
      </h3>

      {/* Summary Section */}
      <div style={{
        marginBottom: '24px',
        padding: '20px',
        backgroundColor: '#f8f9fa',
        borderRadius: '8px'
      }}>
        <h4 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px', color: '#667EEA' }}>
          {t('billConfig.step5.summary')}
        </h4>
        <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px', lineHeight: '1.8' }}>
          <li>
            <strong>{t('billConfig.step5.mode')}:</strong>{' '}
            {isVZEVMode ? t('billConfig.step5.modeVzev') : t('billConfig.step5.modeZev')}
          </li>
          <li>
            <strong>{t('billConfig.step5.period')}:</strong> {startDate} {t('billConfig.step5.to')} {endDate}
          </li>
          <li>
            <strong>{isVZEVMode ? t('billConfig.step5.complexes') : t('billConfig.step5.buildings')}:</strong> {buildingCount}
          </li>
          <li>
            <strong>{t('billConfig.step5.apartments')}:</strong> {apartmentCount}
          </li>
          <li>
            <strong>{t('billConfig.step5.users')}:</strong> {userCount}
          </li>
          <li>
            <strong>{t('billConfig.step5.sharedMeters')}:</strong> {sharedMeterCount}
          </li>
          <li>
            <strong>{t('billConfig.step5.customItems')}:</strong> {customItemCount}
          </li>
          <li>
            <strong>{t('billConfig.step5.estimatedInvoices')}:</strong> {userCount}
          </li>
        </ul>
      </div>

      {/* Saved sender/banking profiles — pick one to fill the fields below, or save the current set */}
      <div style={{
        marginBottom: '20px',
        padding: '14px 16px',
        backgroundColor: '#eef2ff',
        border: '1px solid #c7d2fe',
        borderRadius: '10px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700, color: '#4338ca', marginBottom: '10px' }}>
          <Bookmark size={14} /> {t('billConfig.step5.savedProfiles')}
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            value={selectedProfileId}
            onChange={(e) => applyProfile(e.target.value)}
            style={{ ...fieldStyle, flex: '1 1 200px', minWidth: '180px', backgroundColor: 'white' }}
          >
            <option value="">{t('billConfig.step5.selectProfile')}</option>
            {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {selectedProfileId && (
            <button
              type="button"
              onClick={handleDeleteProfile}
              title={t('common.delete')}
              style={{ ...fieldStyle, border: 'none', cursor: 'pointer', backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Trash2 size={15} />
            </button>
          )}
          <div style={{ flexBasis: '100%', height: 0 }} />
          <input
            type="text"
            value={newProfileName}
            onChange={(e) => setNewProfileName(e.target.value)}
            placeholder={t('billConfig.step5.profileNamePlaceholder')}
            style={{ ...fieldStyle, flex: '1 1 200px', minWidth: '180px' }}
          />
          <button
            type="button"
            onClick={handleSaveProfile}
            disabled={!newProfileName.trim()}
            style={{
              ...fieldStyle,
              border: 'none',
              cursor: newProfileName.trim() ? 'pointer' : 'not-allowed',
              backgroundColor: newProfileName.trim() ? '#4f46e5' : '#c7d2fe',
              color: 'white',
              fontWeight: 600
            }}
          >
            {t('billConfig.step5.saveProfile')}
          </button>
        </div>
      </div>

      {/* Sender Information */}
      <div style={{ marginBottom: '24px' }}>
        <h4 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>
          {t('billConfig.step5.senderInfo')}
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
          <div>
            <label style={{
              display: 'block',
              fontSize: '14px',
              marginBottom: '6px',
              fontWeight: '500'
            }}>
              {t('billConfig.step5.name')} *
            </label>
            <input
              type="text"
              value={senderName}
              onChange={(e) => onSenderNameChange(e.target.value)}
              placeholder="Company or Organization Name"
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
            <label style={{
              display: 'block',
              fontSize: '14px',
              marginBottom: '6px',
              fontWeight: '500'
            }}>
              {t('billConfig.step5.address')}
            </label>
            <input
              type="text"
              value={senderAddress}
              onChange={(e) => onSenderAddressChange(e.target.value)}
              placeholder="Street and Number"
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
              <label style={{
                display: 'block',
                fontSize: '14px',
                marginBottom: '6px',
                fontWeight: '500'
              }}>
                {t('billConfig.step5.zip')}
              </label>
              <input
                type="text"
                value={senderZip}
                onChange={(e) => onSenderZipChange(e.target.value)}
                placeholder="1234"
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
              <label style={{
                display: 'block',
                fontSize: '14px',
                marginBottom: '6px',
                fontWeight: '500'
              }}>
                {t('billConfig.step5.city')}
              </label>
              <input
                type="text"
                value={senderCity}
                onChange={(e) => onSenderCityChange(e.target.value)}
                placeholder="City Name"
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
        <h4 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>
          {t('billConfig.step5.bankingInfo')}
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
          <div>
            <label style={{
              display: 'block',
              fontSize: '14px',
              marginBottom: '6px',
              fontWeight: '500'
            }}>
              {t('billConfig.step5.bankName')}
            </label>
            <input
              type="text"
              value={bankName}
              onChange={(e) => onBankNameChange(e.target.value)}
              placeholder="Bank Name"
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
            <label style={{
              display: 'block',
              fontSize: '14px',
              marginBottom: '6px',
              fontWeight: '500'
            }}>
              {t('billConfig.step5.iban')} *
            </label>
            <input
              type="text"
              value={bankIban}
              onChange={(e) => onBankIbanChange(e.target.value)}
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
            <label style={{
              display: 'block',
              fontSize: '14px',
              marginBottom: '6px',
              fontWeight: '500'
            }}>
              {t('billConfig.step5.accountHolder')}
            </label>
            <input
              type="text"
              value={bankAccountHolder}
              onChange={(e) => onBankAccountHolderChange(e.target.value)}
              placeholder="Account Holder Name"
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
}