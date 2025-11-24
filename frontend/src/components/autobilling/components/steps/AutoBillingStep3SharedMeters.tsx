import { Zap, Dot, Lightbulb } from 'lucide-react';
import type { Building, SharedMeterConfig } from '../../../types';
import { useTranslation } from '../../../i18n';

interface AutoBillingStep3SharedMetersProps {
  buildings: Building[];
  selectedBuildingIds: number[];
  sharedMeters: SharedMeterConfig[];
  selectedSharedMeters: number[];
  onToggle: (meterId: number) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}

export default function AutoBillingStep3SharedMeters({
  buildings,
  selectedBuildingIds,
  sharedMeters,
  selectedSharedMeters,
  onToggle,
  onSelectAll,
  onDeselectAll
}: AutoBillingStep3SharedMetersProps) {
  const { t } = useTranslation();

  // Filter shared meters by selected buildings
  const filteredSharedMeters = sharedMeters.filter(meter =>
    selectedBuildingIds.includes(meter.building_id)
  );

  const getSplitTypeLabel = (splitType: string) => {
    switch (splitType) {
      case 'equal':
        return t('autoBilling.splitType.equal');
      case 'by_area':
        return t('autoBilling.splitType.byArea');
      case 'by_units':
        return t('autoBilling.splitType.byUnits');
      case 'custom':
        return t('autoBilling.splitType.custom');
      default:
        return splitType;
    }
  };

  return (
    <div>
      <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '16px' }}>
        {t('autoBilling.step3.title')}
      </h3>
      <p style={{ color: '#6c757d', marginBottom: '24px', fontSize: '14px' }}>
        {t('autoBilling.step3.description')}
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
          <p style={{ margin: 0, fontSize: '15px' }}>{t('autoBilling.step3.noMeters')}</p>
          <p style={{ margin: '8px 0 0 0', fontSize: '13px' }}>
            {t('autoBilling.step3.noMetersHint')}
          </p>
        </div>
      ) : (
        <>
          {/* Action buttons */}
          <div style={{ 
            display: 'flex', 
            gap: '8px', 
            marginBottom: '16px',
            justifyContent: 'flex-end'
          }}>
            <button
              onClick={onSelectAll}
              style={{
                padding: '6px 12px',
                backgroundColor: '#667EEA',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                fontSize: '13px',
                cursor: 'pointer',
                fontWeight: '500'
              }}
            >
              {t('common.selectAll')}
            </button>
            <button
              onClick={onDeselectAll}
              style={{
                padding: '6px 12px',
                backgroundColor: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                fontSize: '13px',
                cursor: 'pointer',
                fontWeight: '500'
              }}
            >
              {t('common.deselectAll')}
            </button>
          </div>

          <div style={{
            border: '1px solid #dee2e6',
            borderRadius: '6px',
            backgroundColor: 'white',
            maxHeight: '400px',
            overflowY: 'auto'
          }}>
            {filteredSharedMeters.map(meter => {
              const building = buildings.find(b => b.id === meter.building_id);
              const isSelected = selectedSharedMeters.includes(meter.id);

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
                    backgroundColor: isSelected ? '#e7f3ff' : 'white'
                  }}
                  onMouseOver={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.backgroundColor = '#f8f9fa';
                    }
                  }}
                  onMouseOut={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.backgroundColor = 'white';
                    }
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
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
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '8px',
                      marginBottom: '4px' 
                    }}>
                      <Zap size={16} style={{ color: '#667EEA' }} />
                      <span style={{ fontSize: '15px', fontWeight: '600' }}>
                        {meter.meter_name}
                      </span>
                    </div>
                    <div style={{ 
                      fontSize: '13px', 
                      color: '#6c757d', 
                      paddingLeft: '24px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '2px'
                    }}>
                      {building?.name}
                      <Dot size={16} style={{ color: '#6c757d' }} />
                      {getSplitTypeLabel(meter.split_type)}
                      <Dot size={16} style={{ color: '#6c757d' }} />
                      CHF {meter.unit_price.toFixed(3)}/kWh
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </>
      )}

      {/* Selection Summary */}
      <div style={{
        marginTop: '20px',
        padding: '16px',
        backgroundColor: selectedSharedMeters.length > 0 ? '#e7f3ff' : '#f8f9fa',
        borderRadius: '6px',
        fontSize: '14px',
        color: selectedSharedMeters.length > 0 ? '#004a99' : '#6c757d'
      }}>
        <strong>{t('autoBilling.step3.selected')}:</strong> {selectedSharedMeters.length} {t('autoBilling.step3.meters')}
        {selectedSharedMeters.length === 0 && (
          <span style={{ marginLeft: '8px', fontStyle: 'italic' }}>
            ({t('autoBilling.step3.optional')})
          </span>
        )}
      </div>

      {/* Info Box */}
      <div style={{
        marginTop: '16px',
        padding: '16px',
        backgroundColor: '#fff3cd',
        borderRadius: '8px',
        border: '1px solid #ffc107'
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          <Lightbulb size={20} style={{ color: '#856404', flexShrink: 0, marginTop: '2px' }} />
          <div style={{ fontSize: '14px', color: '#856404' }}>
            <strong style={{ display: 'block', marginBottom: '4px' }}>
              {t('autoBilling.step3.infoTitle')}
            </strong>
            <p style={{ margin: 0 }}>
              {t('autoBilling.step3.infoDescription')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}