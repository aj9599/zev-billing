import { useTranslation } from '../../../../i18n';

interface ConfigStep2DatesProps {
  startDate: string;
  endDate: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
}

export default function ConfigStep2Dates({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange
}: ConfigStep2DatesProps) {
  const { t } = useTranslation();

  const getDaysBetween = () => {
    if (!startDate || !endDate) return 0;
    const start = new Date(startDate);
    const end = new Date(endDate);
    return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  };

  return (
    <div>
      <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '24px' }}>
        {t('billConfig.step2.titleNew')}
      </h3>

      <div style={{ padding: '20px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
        <label style={{ display: 'block', fontWeight: '600', marginBottom: '12px', fontSize: '15px' }}>
          {t('billConfig.step2.selectPeriod')}
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label style={{
              display: 'block',
              fontSize: '14px',
              marginBottom: '6px',
              color: '#6c757d',
              fontWeight: '500'
            }}>
              {t('billConfig.step2.startDate')}
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => onStartDateChange(e.target.value)}
              style={{
                width: '100%',
                padding: '12px',
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
              color: '#6c757d',
              fontWeight: '500'
            }}>
              {t('billConfig.step2.endDate')}
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => onEndDateChange(e.target.value)}
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #ced4da',
                borderRadius: '6px',
                fontSize: '15px'
              }}
            />
          </div>
        </div>

        {startDate && endDate && (
          <div style={{
            marginTop: '16px',
            padding: '12px',
            backgroundColor: 'white',
            borderRadius: '6px',
            fontSize: '14px'
          }}>
            <strong>{t('billConfig.step2.periodSummary')}:</strong>{' '}
            {new Date(startDate).toLocaleDateString()} - {new Date(endDate).toLocaleDateString()}
            {' '}
            ({getDaysBetween()} {t('billConfig.step2.days')})
          </div>
        )}
      </div>
    </div>
  );
}