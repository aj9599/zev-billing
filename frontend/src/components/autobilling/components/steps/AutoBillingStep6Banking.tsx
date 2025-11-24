import { Landmark, AlertTriangle } from 'lucide-react';
import { useTranslation } from '../../../i18n';

interface AutoBillingStep6BankingProps {
  bankName: string;
  bankIban: string;
  bankAccountHolder: string;
  onBankNameChange: (value: string) => void;
  onBankIbanChange: (value: string) => void;
  onBankAccountHolderChange: (value: string) => void;
}

export default function AutoBillingStep6Banking({
  bankName,
  bankIban,
  bankAccountHolder,
  onBankNameChange,
  onBankIbanChange,
  onBankAccountHolderChange
}: AutoBillingStep6BankingProps) {
  const { t } = useTranslation();

  const formatIban = (value: string) => {
    // Remove all spaces and convert to uppercase
    const cleaned = value.replace(/\s/g, '').toUpperCase();
    // Add space every 4 characters
    const formatted = cleaned.replace(/(.{4})/g, '$1 ').trim();
    return formatted;
  };

  const handleIbanChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatIban(e.target.value);
    onBankIbanChange(formatted);
  };

  return (
    <div>
      <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '24px' }}>
        {t('billConfig.step5.bankingInfo')}
      </h3>

      <p style={{ color: '#6c757d', marginBottom: '24px', fontSize: '14px' }}>
        {t('autoBilling.bankingDescription')}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
        {/* Bank Name */}
        <div>
          <label style={{ display: 'block', fontSize: '14px', marginBottom: '6px', fontWeight: '500' }}>
            {t('billConfig.step5.bankName')}
          </label>
          <input
            type="text"
            value={bankName}
            onChange={(e) => onBankNameChange(e.target.value)}
            placeholder={t('autoBilling.placeholder.bankName')}
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #ced4da',
              borderRadius: '6px',
              fontSize: '15px'
            }}
          />
        </div>

        {/* IBAN */}
        <div>
          <label style={{ display: 'block', fontSize: '14px', marginBottom: '6px', fontWeight: '500' }}>
            {t('billConfig.step5.iban')} *
          </label>
          <input
            type="text"
            value={bankIban}
            onChange={handleIbanChange}
            placeholder="CH93 0000 0000 0000 0000 0"
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #ced4da',
              borderRadius: '6px',
              fontSize: '15px',
              fontFamily: 'monospace',
              letterSpacing: '1px'
            }}
          />
          <small style={{ fontSize: '12px', color: '#666' }}>
            {t('autoBilling.ibanFormat')}
          </small>
        </div>

        {/* Account Holder */}
        <div>
          <label style={{ display: 'block', fontSize: '14px', marginBottom: '6px', fontWeight: '500' }}>
            {t('billConfig.step5.accountHolder')}
          </label>
          <input
            type="text"
            value={bankAccountHolder}
            onChange={(e) => onBankAccountHolderChange(e.target.value)}
            placeholder={t('autoBilling.placeholder.accountHolder')}
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

      {/* Swiss QR-Bill Info */}
      <div style={{
        marginTop: '24px',
        padding: '16px',
        backgroundColor: '#e8f5e9',
        borderRadius: '8px',
        border: '1px solid #4caf50'
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          <Landmark size={20} style={{ color: '#1b5e20', flexShrink: 0, marginTop: '2px' }} />
          <div style={{ fontSize: '14px', color: '#1b5e20' }}>
            <strong style={{ display: 'block', marginBottom: '4px' }}>
              {t('autoBilling.qrBillInfo.title')}
            </strong>
            <p style={{ margin: 0 }}>
              {t('autoBilling.qrBillInfo.description')}
            </p>
          </div>
        </div>
      </div>

      {/* Warning for missing IBAN */}
      {!bankIban && (
        <div style={{
          marginTop: '16px',
          padding: '12px 16px',
          backgroundColor: '#fff3cd',
          borderRadius: '6px',
          border: '1px solid #ffc107',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <AlertTriangle size={16} style={{ color: '#856404', flexShrink: 0 }} />
          <span style={{ fontSize: '14px', color: '#856404' }}>
            {t('autoBilling.ibanRequired')}
          </span>
        </div>
      )}
    </div>
  );
}