import { useTranslation } from '../../../i18n';

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