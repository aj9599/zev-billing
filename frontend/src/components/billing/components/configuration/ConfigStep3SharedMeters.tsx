import { Zap } from 'lucide-react';
import type { Building, SharedMeterConfig } from '../../../../types';
import { useTranslation } from '../../../../i18n';

interface ConfigStep3SharedMetersProps {
  buildings: Building[];
  sharedMeters: SharedMeterConfig[];
  selectedSharedMeters: number[];
  onToggle: (meterId: number) => void;
}

export default function ConfigStep3SharedMeters({
  buildings,
  sharedMeters,
  selectedSharedMeters,
  onToggle
}: ConfigStep3SharedMetersProps) {
  const { t } = useTranslation();

  return (
    <div>
      <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '16px' }}>
        {t('billConfig.step3.title')}
      </h3>
      <p style={{ color: '#6c757d', marginBottom: '24px', fontSize: '14px' }}>
        {t('billConfig.step3.description')}
      </p>

      {sharedMeters.length === 0 ? (
        <div style={{
          padding: '40px',
          textAlign: 'center',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
          color: '#6c757d'
        }}>
          <Zap size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
          <p>{t('billConfig.step3.noMeters')}</p>
        </div>
      ) : (
        <div style={{
          border: '1px solid #dee2e6',
          borderRadius: '6px',
          backgroundColor: 'white'
        }}>
          {sharedMeters.map(meter => {
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
                  transition: 'background-color 0.2s',
                  backgroundColor: selectedSharedMeters.includes(meter.id) ? '#e7f3ff' : 'white'
                }}
                onMouseOver={(e) => {
                  if (!selectedSharedMeters.includes(meter.id)) {
                    e.currentTarget.style.backgroundColor = '#f8f9fa';
                  }
                }}
                onMouseOut={(e) => {
                  if (!selectedSharedMeters.includes(meter.id)) {
                    e.currentTarget.style.backgroundColor = 'white';
                  }
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedSharedMeters.includes(meter.id)}
                  onChange={() => onToggle(meter.id)}
                  style={{
                    marginRight: '12px',
                    marginTop: '2px',
                    cursor: 'pointer',
                    width: '18px',
                    height: '18px'
                  }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '15px', fontWeight: '600', marginBottom: '4px' }}>
                    {meter.meter_name}
                  </div>
                  <div style={{ fontSize: '13px', color: '#6c757d' }}>
                    {building?.name} • {meter.split_type} {t('billConfig.step3.split')} • CHF {meter.unit_price.toFixed(3)}/kWh
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
        <strong>{t('billConfig.step3.selected')}:</strong> {selectedSharedMeters.length} {t('billConfig.step3.meters')}
      </div>
    </div>
  );
}