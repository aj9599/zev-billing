import { DollarSign } from 'lucide-react';
import type { Building, CustomLineItem } from '../../../types';
import { useTranslation } from '../../../i18n';

interface ConfigStep4CustomItemsProps {
  buildings: Building[];
  customItems: CustomLineItem[];
  selectedCustomItems: number[];
  onToggle: (itemId: number) => void;
}

export default function ConfigStep4CustomItems({
  buildings,
  customItems,
  selectedCustomItems,
  onToggle
}: ConfigStep4CustomItemsProps) {
  const { t } = useTranslation();

  return (
    <div>
      <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '16px' }}>
        {t('billConfig.step4.title')}
      </h3>
      <p style={{ color: '#6c757d', marginBottom: '24px', fontSize: '14px' }}>
        {t('billConfig.step4.description')}
      </p>

      {customItems.length === 0 ? (
        <div style={{
          padding: '40px',
          textAlign: 'center',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
          color: '#6c757d'
        }}>
          <DollarSign size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
          <p>{t('billConfig.step4.noItems')}</p>
        </div>
      ) : (
        <div style={{
          border: '1px solid #dee2e6',
          borderRadius: '6px',
          backgroundColor: 'white'
        }}>
          {customItems.map(item => {
            const building = buildings.find(b => b.id === item.building_id);
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
                  backgroundColor: selectedCustomItems.includes(item.id) ? '#e7f3ff' : 'white'
                }}
                onMouseOver={(e) => {
                  if (!selectedCustomItems.includes(item.id)) {
                    e.currentTarget.style.backgroundColor = '#f8f9fa';
                  }
                }}
                onMouseOut={(e) => {
                  if (!selectedCustomItems.includes(item.id)) {
                    e.currentTarget.style.backgroundColor = 'white';
                  }
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedCustomItems.includes(item.id)}
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
                  <div style={{ fontSize: '15px', fontWeight: '600', marginBottom: '4px' }}>
                    {item.description}
                  </div>
                  <div style={{ fontSize: '13px', color: '#6c757d' }}>
                    {building?.name} • CHF {item.amount.toFixed(2)} • {item.frequency} • {item.category}
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
        <strong>{t('billConfig.step4.selected')}:</strong> {selectedCustomItems.length} {t('billConfig.step4.items')}
      </div>
    </div>
  );
}