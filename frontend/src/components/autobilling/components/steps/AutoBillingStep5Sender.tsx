import { Info } from 'lucide-react';
import { useTranslation } from '../../../i18n';

interface AutoBillingStep5SenderProps {
  senderName: string;
  senderAddress: string;
  senderCity: string;
  senderZip: string;
  senderCountry: string;
  onSenderNameChange: (value: string) => void;
  onSenderAddressChange: (value: string) => void;
  onSenderCityChange: (value: string) => void;
  onSenderZipChange: (value: string) => void;
  onSenderCountryChange: (value: string) => void;
}

export default function AutoBillingStep5Sender({
  senderName,
  senderAddress,
  senderCity,
  senderZip,
  senderCountry,
  onSenderNameChange,
  onSenderAddressChange,
  onSenderCityChange,
  onSenderZipChange,
  onSenderCountryChange
}: AutoBillingStep5SenderProps) {
  const { t } = useTranslation();

  return (
    <div>
      <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '24px' }}>
        {t('billConfig.step5.senderInfo')}
      </h3>

      <p style={{ color: '#6c757d', marginBottom: '24px', fontSize: '14px' }}>
        {t('autoBilling.senderDescription')}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
        {/* Name */}
        <div>
          <label style={{ display: 'block', fontSize: '14px', marginBottom: '6px', fontWeight: '500' }}>
            {t('billConfig.step5.name')} *
          </label>
          <input
            type="text"
            value={senderName}
            onChange={(e) => onSenderNameChange(e.target.value)}
            placeholder={t('autoBilling.placeholder.companyName')}
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #ced4da',
              borderRadius: '6px',
              fontSize: '15px'
            }}
          />
        </div>

        {/* Address */}
        <div>
          <label style={{ display: 'block', fontSize: '14px', marginBottom: '6px', fontWeight: '500' }}>
            {t('billConfig.step5.address')}
          </label>
          <input
            type="text"
            value={senderAddress}
            onChange={(e) => onSenderAddressChange(e.target.value)}
            placeholder={t('autoBilling.placeholder.streetNumber')}
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #ced4da',
              borderRadius: '6px',
              fontSize: '15px'
            }}
          />
        </div>

        {/* ZIP and City */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '14px', marginBottom: '6px', fontWeight: '500' }}>
              {t('billConfig.step5.zip')}
            </label>
            <input
              type="text"
              value={senderZip}
              onChange={(e) => onSenderZipChange(e.target.value)}
              placeholder={t('autoBilling.placeholder.zip')}
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
              {t('billConfig.step5.city')}
            </label>
            <input
              type="text"
              value={senderCity}
              onChange={(e) => onSenderCityChange(e.target.value)}
              placeholder={t('autoBilling.placeholder.city')}
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

        {/* Country */}
        <div>
          <label style={{ display: 'block', fontSize: '14px', marginBottom: '6px', fontWeight: '500' }}>
            {t('billConfig.step5.country')}
          </label>
          <select
            value={senderCountry}
            onChange={(e) => onSenderCountryChange(e.target.value)}
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #ced4da',
              borderRadius: '6px',
              fontSize: '15px'
            }}
          >
            <option value="Switzerland">{t('countries.switzerland')}</option>
            <option value="Germany">{t('countries.germany')}</option>
            <option value="Austria">{t('countries.austria')}</option>
            <option value="France">{t('countries.france')}</option>
            <option value="Italy">{t('countries.italy')}</option>
          </select>
        </div>
      </div>

      {/* Info Box */}
      <div style={{
        marginTop: '24px',
        padding: '16px',
        backgroundColor: '#e7f3ff',
        borderRadius: '8px',
        border: '1px solid #3b82f6'
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          <Info size={20} style={{ color: '#1e40af', flexShrink: 0, marginTop: '2px' }} />
          <div style={{ fontSize: '14px', color: '#1e40af' }}>
            <strong style={{ display: 'block', marginBottom: '4px' }}>
              {t('autoBilling.senderInfoNote.title')}
            </strong>
            <p style={{ margin: 0 }}>
              {t('autoBilling.senderInfoNote.description')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}