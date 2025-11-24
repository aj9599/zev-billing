import { AlertTriangle, CheckCircle } from 'lucide-react';
import { useTranslation } from '../../../../i18n';
import type { Building } from '../../../../types';

interface AutoBillingStep7ReviewProps {
  name: string;
  isVZEVMode: boolean;
  frequency: 'monthly' | 'quarterly' | 'half_yearly' | 'yearly';
  generationDay: number;
  firstExecutionDate: string;
  buildingIds: number[];
  buildings: Building[];
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
}

export default function AutoBillingStep7Review({
  name,
  isVZEVMode,
  frequency,
  generationDay,
  firstExecutionDate,
  buildingIds,
  buildings,
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
  bankAccountHolder
}: AutoBillingStep7ReviewProps) {
  const { t } = useTranslation();

  const getFrequencyLabel = (freq: string) => {
    return t(`autoBilling.frequency.${freq}`);
  };

  const getBuildingNames = () => {
    return buildingIds
      .map(id => buildings.find(b => b.id === id)?.name)
      .filter(Boolean)
      .join(', ');
  };

  return (
    <div>
      <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '24px' }}>
        {t('autoBilling.modal.reviewConfiguration')}
      </h3>

      {/* Configuration Summary */}
      <div style={{
        marginBottom: '24px',
        padding: '20px',
        backgroundColor: '#f8f9fa',
        borderRadius: '8px'
      }}>
        <h4 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px', color: '#667EEA' }}>
          {t('autoBilling.modal.configurationSummary')}
        </h4>
        <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px', lineHeight: '1.8' }}>
          <li>
            <strong>{t('autoBilling.configName')}:</strong> {name}
          </li>
          <li>
            <strong>{t('autoBilling.mode')}:</strong>{' '}
            {isVZEVMode ? t('autoBilling.virtualAllocation') : t('autoBilling.directSharing')}
          </li>
          <li>
            <strong>{t('billConfig.step5.buildings')}:</strong> {buildingIds.length}
            <span style={{ color: '#6c757d', marginLeft: '8px' }}>
              ({getBuildingNames()})
            </span>
          </li>
          <li>
            <strong>{t('billConfig.step5.apartments')}:</strong> {apartmentCount}
          </li>
          <li>
            <strong>{t('billConfig.step5.users')}:</strong> {userCount}
          </li>
          <li>
            <strong>{t('autoBilling.frequency')}:</strong> {getFrequencyLabel(frequency)}
          </li>
          <li>
            <strong>{t('autoBilling.generationDay')}:</strong> {t('autoBilling.day')} {generationDay}
          </li>
          {firstExecutionDate && (
            <li>
              <strong>{t('autoBilling.firstExecutionDate')}:</strong>{' '}
              {new Date(firstExecutionDate).toLocaleDateString('de-CH')}
            </li>
          )}
        </ul>
      </div>

      {/* Billing Items Summary */}
      <div style={{
        marginBottom: '24px',
        padding: '20px',
        backgroundColor: '#e7f3ff',
        borderRadius: '8px'
      }}>
        <h4 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px', color: '#1e40af' }}>
          {t('autoBilling.review.billingItems')}
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div style={{
            padding: '12px',
            backgroundColor: 'white',
            borderRadius: '6px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '24px', fontWeight: '700', color: '#667EEA' }}>
              {sharedMeterCount}
            </div>
            <div style={{ fontSize: '13px', color: '#6c757d' }}>
              {t('autoBilling.review.sharedMeters')}
            </div>
          </div>
          <div style={{
            padding: '12px',
            backgroundColor: 'white',
            borderRadius: '6px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '24px', fontWeight: '700', color: '#667EEA' }}>
              {customItemCount}
            </div>
            <div style={{ fontSize: '13px', color: '#6c757d' }}>
              {t('autoBilling.review.customItems')}
            </div>
          </div>
        </div>
      </div>

      {/* Sender Information */}
      {senderName && (
        <div style={{
          marginBottom: '16px',
          padding: '16px',
          backgroundColor: '#f0fdf4',
          borderRadius: '8px',
          border: '1px solid #86efac'
        }}>
          <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#166534' }}>
            {t('billConfig.step5.senderInfo')}
          </h4>
          <p style={{ margin: 0, fontSize: '13px', lineHeight: '1.6', color: '#15803d' }}>
            {senderName}<br />
            {senderAddress && `${senderAddress}`}
            {(senderAddress && (senderZip || senderCity)) && <br />}
            {senderZip} {senderCity}
          </p>
        </div>
      )}

      {/* Banking Information */}
      {bankIban && (
        <div style={{
          padding: '16px',
          backgroundColor: '#f0fdf4',
          borderRadius: '8px',
          border: '1px solid #86efac'
        }}>
          <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#166534' }}>
            {t('billConfig.step5.bankingInfo')}
          </h4>
          <p style={{ margin: 0, fontSize: '13px', lineHeight: '1.6', color: '#15803d' }}>
            {bankName && <>{bankName}<br /></>}
            <span style={{ fontFamily: 'monospace' }}>{bankIban}</span>
            {bankAccountHolder && <><br />{bankAccountHolder}</>}
          </p>
        </div>
      )}

      {/* Validation Warnings */}
      {(!senderName || !bankIban) && (
        <div style={{
          marginTop: '20px',
          padding: '16px',
          backgroundColor: '#fff3cd',
          borderRadius: '8px',
          border: '1px solid #ffc107'
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            <AlertTriangle size={20} style={{ color: '#856404', flexShrink: 0, marginTop: '2px' }} />
            <div style={{ fontSize: '14px', color: '#856404' }}>
              <strong style={{ display: 'block', marginBottom: '4px' }}>
                {t('autoBilling.missingRequiredFields')}
              </strong>
              <ul style={{ margin: 0, paddingLeft: '16px' }}>
                {!senderName && <li>{t('billConfig.step5.senderInfo')} - {t('billConfig.step5.name')}</li>}
                {!bankIban && <li>{t('billConfig.step5.bankingInfo')} - {t('billConfig.step5.iban')}</li>}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Ready Indicator */}
      {senderName && bankIban && (
        <div style={{
          marginTop: '20px',
          padding: '16px',
          backgroundColor: '#d4edda',
          borderRadius: '8px',
          border: '1px solid #28a745',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <CheckCircle size={24} style={{ color: '#155724', flexShrink: 0 }} />
          <div style={{ fontSize: '14px', color: '#155724' }}>
            <strong>{t('autoBilling.readyToCreate')}</strong>
            <p style={{ margin: '4px 0 0 0' }}>
              {t('autoBilling.readyToCreateDescription')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}