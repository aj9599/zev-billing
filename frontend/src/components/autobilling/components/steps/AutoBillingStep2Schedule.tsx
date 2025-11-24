import { Lightbulb } from 'lucide-react';
import { useTranslation } from '../../../../i18n';

interface AutoBillingStep2ScheduleProps {
  name: string;
  frequency: 'monthly' | 'quarterly' | 'half_yearly' | 'yearly';
  generationDay: number;
  firstExecutionDate: string;
  onNameChange: (value: string) => void;
  onFrequencyChange: (value: 'monthly' | 'quarterly' | 'half_yearly' | 'yearly') => void;
  onGenerationDayChange: (value: number) => void;
  onFirstExecutionDateChange: (value: string) => void;
}

export default function AutoBillingStep2Schedule({
  name,
  frequency,
  generationDay,
  firstExecutionDate,
  onNameChange,
  onFrequencyChange,
  onGenerationDayChange,
  onFirstExecutionDateChange
}: AutoBillingStep2ScheduleProps) {
  const { t } = useTranslation();

  return (
    <div>
      <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '24px' }}>
        {t('autoBilling.configName')}
      </h3>

      {/* Configuration Name */}
      <div style={{ padding: '20px', backgroundColor: '#f8f9fa', borderRadius: '8px', marginBottom: '24px' }}>
        <label style={{ display: 'block', fontWeight: '600', marginBottom: '12px', fontSize: '15px' }}>
          {t('autoBilling.configName')} *
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          style={{
            width: '100%',
            padding: '12px',
            border: '1px solid #ced4da',
            borderRadius: '6px',
            fontSize: '15px'
          }}
          placeholder={t('autoBilling.configNamePlaceholder')}
        />
      </div>

      {/* Billing Schedule */}
      <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '16px' }}>
        {t('autoBilling.modal.billingSchedule')}
      </h3>

      <div style={{ padding: '20px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
          {/* Frequency */}
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
              {t('autoBilling.frequency')} *
            </label>
            <select
              value={frequency}
              onChange={(e) => onFrequencyChange(e.target.value as any)}
              style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}
            >
              <option value="monthly">{t('autoBilling.frequency.monthly')}</option>
              <option value="quarterly">{t('autoBilling.frequency.quarterly')}</option>
              <option value="half_yearly">{t('autoBilling.frequency.half_yearly')}</option>
              <option value="yearly">{t('autoBilling.frequency.yearly')}</option>
            </select>
          </div>

          {/* Generation Day */}
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
              {t('autoBilling.generationDay')} *
            </label>
            <input
              type="number"
              min="1"
              max="28"
              value={generationDay}
              onChange={(e) => onGenerationDayChange(parseInt(e.target.value))}
              style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}
            />
            <small style={{ fontSize: '12px', color: '#666' }}>{t('autoBilling.generationDayHelp')}</small>
          </div>
        </div>

        {/* First Execution Date */}
        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
            {t('autoBilling.firstExecutionDate')}
          </label>
          <input
            type="date"
            value={firstExecutionDate}
            onChange={(e) => onFirstExecutionDateChange(e.target.value)}
            style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}
          />
          <small style={{ fontSize: '12px', color: '#666' }}>{t('autoBilling.firstExecutionDateHelp')}</small>
        </div>
      </div>

      {/* Info Box */}
      <div style={{
        marginTop: '20px',
        padding: '16px',
        backgroundColor: '#fff3cd',
        borderRadius: '8px',
        border: '1px solid #ffc107'
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          <Lightbulb size={20} style={{ color: '#856404', flexShrink: 0, marginTop: '2px' }} />
          <div style={{ fontSize: '14px', color: '#856404' }}>
            <strong style={{ display: 'block', marginBottom: '4px' }}>
              {t('autoBilling.scheduleInfo.title')}
            </strong>
            <ul style={{ margin: 0, paddingLeft: '16px', lineHeight: '1.6' }}>
              <li>{t('autoBilling.scheduleInfo.monthly')}</li>
              <li>{t('autoBilling.scheduleInfo.quarterly')}</li>
              <li>{t('autoBilling.scheduleInfo.half_yearly')}</li>
              <li>{t('autoBilling.scheduleInfo.yearly')}</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}