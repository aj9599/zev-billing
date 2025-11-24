import { DollarSign, Dot, ClipboardList } from 'lucide-react';
import type { Building, CustomLineItem } from '../../../types';
import { useTranslation } from '../../../i18n';

interface AutoBillingStep4CustomItemsProps {
  buildings: Building[];
  selectedBuildingIds: number[];
  customItems: CustomLineItem[];
  selectedCustomItems: number[];
  onToggle: (itemId: number) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}

export default function AutoBillingStep4CustomItems({
  buildings,
  selectedBuildingIds,
  customItems,
  selectedCustomItems,
  onToggle,
  onSelectAll,
  onDeselectAll
}: AutoBillingStep4CustomItemsProps) {
  const { t } = useTranslation();

  // Filter custom items by selected buildings and active status
  const filteredCustomItems = customItems.filter(item =>
    selectedBuildingIds.includes(item.building_id) && item.is_active
  );

  const getFrequencyLabel = (frequency: string) => {
    switch (frequency) {
      case 'once':
        return t('autoBilling.itemFrequency.once');
      case 'monthly':
        return t('autoBilling.itemFrequency.monthly');
      case 'quarterly':
        return t('autoBilling.itemFrequency.quarterly');
      case 'yearly':
        return t('autoBilling.itemFrequency.yearly');
      default:
        return frequency;
    }
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'meter_rent':
        return t('autoBilling.itemCategory.meterRent');
      case 'maintenance':
        return t('autoBilling.itemCategory.maintenance');
      case 'service':
        return t('autoBilling.itemCategory.service');
      case 'other':
        return t('autoBilling.itemCategory.other');
      default:
        return category;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'meter_rent':
        return '#3b82f6';
      case 'maintenance':
        return '#f59e0b';
      case 'service':
        return '#10b981';
      case 'other':
        return '#6b7280';
      default:
        return '#6b7280';
    }
  };

  return (
    <div>
      <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '16px' }}>
        {t('autoBilling.step4.title')}
      </h3>
      <p style={{ color: '#6c757d', marginBottom: '24px', fontSize: '14px' }}>
        {t('autoBilling.step4.description')}
      </p>

      {filteredCustomItems.length === 0 ? (
        <div style={{
          padding: '40px',
          textAlign: 'center',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
          color: '#6c757d'
        }}>
          <DollarSign size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
          <p style={{ margin: 0, fontSize: '15px' }}>{t('autoBilling.step4.noItems')}</p>
          <p style={{ margin: '8px 0 0 0', fontSize: '13px' }}>
            {t('autoBilling.step4.noItemsHint')}
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
            {filteredCustomItems.map(item => {
              const building = buildings.find(b => b.id === item.building_id);
              const isSelected = selectedCustomItems.includes(item.id);

              return (
                <label
                  key={item.id}
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
                    onChange={() => onToggle(item.id)}
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
                      <DollarSign size={16} style={{ color: '#667EEA' }} />
                      <span style={{ fontSize: '15px', fontWeight: '600' }}>
                        {item.description}
                      </span>
                      <span style={{
                        padding: '2px 6px',
                        backgroundColor: getCategoryColor(item.category),
                        color: 'white',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontWeight: '600'
                      }}>
                        {getCategoryLabel(item.category)}
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
                      CHF {item.amount.toFixed(2)}
                      <Dot size={16} style={{ color: '#6c757d' }} />
                      {getFrequencyLabel(item.frequency)}
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
        backgroundColor: selectedCustomItems.length > 0 ? '#e7f3ff' : '#f8f9fa',
        borderRadius: '6px',
        fontSize: '14px',
        color: selectedCustomItems.length > 0 ? '#004a99' : '#6c757d'
      }}>
        <strong>{t('autoBilling.step4.selected')}:</strong> {selectedCustomItems.length} {t('autoBilling.step4.items')}
        {selectedCustomItems.length === 0 && (
          <span style={{ marginLeft: '8px', fontStyle: 'italic' }}>
            ({t('autoBilling.step4.optional')})
          </span>
        )}
      </div>

      {/* Info Box */}
      <div style={{
        marginTop: '16px',
        padding: '16px',
        backgroundColor: '#e8f5e9',
        borderRadius: '8px',
        border: '1px solid #4caf50'
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          <ClipboardList size={20} style={{ color: '#1b5e20', flexShrink: 0, marginTop: '2px' }} />
          <div style={{ fontSize: '14px', color: '#1b5e20' }}>
            <strong style={{ display: 'block', marginBottom: '4px' }}>
              {t('autoBilling.step4.infoTitle')}
            </strong>
            <p style={{ margin: 0 }}>
              {t('autoBilling.step4.infoDescription')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}