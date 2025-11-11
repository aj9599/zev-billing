import { X, Download, Calendar, Filter } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from '../i18n';

interface ExportItem {
  id: number;
  name: string;
  building_id: number;
  building_name: string;
}

interface ExportModalProps {
  type: 'meters' | 'chargers';
  items: ExportItem[];
  buildings: { id: number; name: string }[];
  onClose: () => void;
  onExport: (startDate: string, endDate: string, itemId?: number) => Promise<void>;
}

export default function ExportModal({ type, items, buildings, onClose, onExport }: ExportModalProps) {
  const { t } = useTranslation();
  const [dateRange, setDateRange] = useState({
    start_date: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0]
  });
  const [selectedBuildingId, setSelectedBuildingId] = useState<number | undefined>(undefined);
  const [selectedItemId, setSelectedItemId] = useState<number | undefined>(undefined);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await onExport(dateRange.start_date, dateRange.end_date, selectedItemId);
    } finally {
      setIsExporting(false);
    }
  };

  // Filter items by selected building
  const filteredItems = selectedBuildingId
    ? items.filter(item => item.building_id === selectedBuildingId)
    : items;

  // Group items by building for display
  const itemsByBuilding = items.reduce((acc, item) => {
    if (!acc[item.building_id]) {
      acc[item.building_id] = [];
    }
    acc[item.building_id].push(item);
    return acc;
  }, {} as Record<number, ExportItem[]>);

  const getSelectedItemDisplay = () => {
    if (!selectedItemId) {
      const buildingName = selectedBuildingId
        ? buildings.find(b => b.id === selectedBuildingId)?.name
        : t('dashboard.allBuildings').toLowerCase();
      const typeLabel = type === 'meters' ? t('meters.title') : t('chargers.title');
      // Use the combined key that already exists
      return t('export.exportingAllFrom')
        .replace('{type}', typeLabel)
        .replace('{building}', buildingName);
    }
    const item = items.find(i => i.id === selectedItemId);
    return item ? `${item.building_name} - ${item.name}` : '';
  };

  const typeLabel = type === 'meters' ? t('meters.title') : t('chargers.title');

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', zIndex: 2000, padding: '20px'
    }}>
      <div className="modal-content" style={{
        backgroundColor: 'white',
        borderRadius: '16px',
        padding: '32px',
        maxWidth: '600px',
        width: '100%',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '28px',
          paddingBottom: '20px',
          borderBottom: '2px solid #f3f4f6'
        }}>
          <div>
            <h2 style={{
              fontSize: '28px',
              fontWeight: '700',
              color: '#1f2937',
              marginBottom: '6px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <Download size={28} style={{ color: '#28a745' }} />
              {t('export.title')}
            </h2>
            <p style={{ fontSize: '14px', color: '#6b7280', margin: 0 }}>
              {t('export.subtitle').replace('{type}', typeLabel)}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              padding: '8px',
              borderRadius: '8px',
              transition: 'background-color 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <X size={24} color="#6b7280" />
          </button>
        </div>

        {/* Building Filter */}
        <div style={{ marginBottom: '24px' }}>
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '10px',
            fontWeight: '600',
            fontSize: '14px',
            color: '#374151'
          }}>
            <Filter size={16} />
            {t('users.building')}
          </label>
          <select
            value={selectedBuildingId || ''}
            onChange={(e) => {
              const buildingId = e.target.value ? parseInt(e.target.value) : undefined;
              setSelectedBuildingId(buildingId);
              setSelectedItemId(undefined); // Reset item selection when building changes
            }}
            style={{
              width: '100%',
              padding: '12px 14px',
              border: '2px solid #e5e7eb',
              borderRadius: '10px',
              fontSize: '14px',
              backgroundColor: '#f9fafb',
              cursor: 'pointer',
              transition: 'all 0.2s',
              outline: 'none'
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = '#28a745';
              e.currentTarget.style.backgroundColor = 'white';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '#e5e7eb';
              e.currentTarget.style.backgroundColor = '#f9fafb';
            }}
          >
            <option value="">{t('dashboard.allBuildings')}</option>
            {buildings.map(building => (
              <option key={building.id} value={building.id}>
                {building.name}
              </option>
            ))}
          </select>
          <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '6px', marginLeft: '2px' }}>
            {t('export.filterByBuilding').replace('{type}', typeLabel)}
          </p>
        </div>

        {/* Item Selection */}
        <div style={{ marginBottom: '24px' }}>
          <label style={{
            display: 'block',
            marginBottom: '10px',
            fontWeight: '600',
            fontSize: '14px',
            color: '#374151'
          }}>
            {typeLabel}
          </label>
          <select
            value={selectedItemId || ''}
            onChange={(e) => setSelectedItemId(e.target.value ? parseInt(e.target.value) : undefined)}
            style={{
              width: '100%',
              padding: '12px 14px',
              border: '2px solid #e5e7eb',
              borderRadius: '10px',
              fontSize: '14px',
              backgroundColor: '#f9fafb',
              cursor: 'pointer',
              transition: 'all 0.2s',
              outline: 'none'
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = '#28a745';
              e.currentTarget.style.backgroundColor = 'white';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '#e5e7eb';
              e.currentTarget.style.backgroundColor = '#f9fafb';
            }}
          >
            <option value="">
              {t('common.all')} {type === 'meters' ? t('meters.metersCount') : t('chargers.chargersCount')}
              {selectedBuildingId && ` in ${buildings.find(b => b.id === selectedBuildingId)?.name}`}
            </option>

            {/* If no building filter, group by building */}
            {!selectedBuildingId ? (
              Object.entries(itemsByBuilding).map(([buildingId, buildingItems]) => {
                const building = buildings.find(b => b.id === parseInt(buildingId));
                return (
                  <optgroup key={buildingId} label={building?.name || t('common.unknownBuilding')}>
                    {buildingItems.map(item => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </optgroup>
                );
              })
            ) : (
              /* If building filter applied, just show items from that building */
              filteredItems.map(item => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))
            )}
          </select>
          <div style={{
            fontSize: '12px',
            color: '#28a745',
            marginTop: '8px',
            padding: '8px 12px',
            backgroundColor: '#f0fdf4',
            borderRadius: '8px',
            border: '1px solid #bbf7d0'
          }}>
            📊 {getSelectedItemDisplay()}
          </div>
        </div>

        {/* Date Range */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '16px',
          marginBottom: '28px'
        }}>
          <div>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '10px',
              fontWeight: '600',
              fontSize: '14px',
              color: '#374151'
            }}>
              <Calendar size={16} />
              {t('export.startDate')} *
            </label>
            <input
              type="date"
              required
              value={dateRange.start_date}
              onChange={(e) => setDateRange({ ...dateRange, start_date: e.target.value })}
              style={{
                width: '100%',
                padding: '12px 14px',
                border: '2px solid #e5e7eb',
                borderRadius: '10px',
                fontSize: '14px',
                backgroundColor: '#f9fafb',
                cursor: 'pointer',
                transition: 'all 0.2s',
                outline: 'none'
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#28a745';
                e.currentTarget.style.backgroundColor = 'white';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#e5e7eb';
                e.currentTarget.style.backgroundColor = '#f9fafb';
              }}
            />
          </div>

          <div>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '10px',
              fontWeight: '600',
              fontSize: '14px',
              color: '#374151'
            }}>
              <Calendar size={16} />
              {t('export.endDate')} *
            </label>
            <input
              type="date"
              required
              value={dateRange.end_date}
              onChange={(e) => setDateRange({ ...dateRange, end_date: e.target.value })}
              style={{
                width: '100%',
                padding: '12px 14px',
                border: '2px solid #e5e7eb',
                borderRadius: '10px',
                fontSize: '14px',
                backgroundColor: '#f9fafb',
                cursor: 'pointer',
                transition: 'all 0.2s',
                outline: 'none'
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#28a745';
                e.currentTarget.style.backgroundColor = 'white';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#e5e7eb';
                e.currentTarget.style.backgroundColor = '#f9fafb';
              }}
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={handleExport}
            disabled={isExporting}
            style={{
              flex: 1,
              padding: '14px 20px',
              backgroundColor: isExporting ? '#9ca3af' : '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              fontSize: '15px',
              fontWeight: '600',
              cursor: isExporting ? 'not-allowed' : 'pointer',
              opacity: isExporting ? 0.7 : 1,
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              boxShadow: isExporting ? 'none' : '0 2px 4px rgba(40, 167, 69, 0.2)'
            }}
            onMouseEnter={(e) => {
              if (!isExporting) {
                e.currentTarget.style.backgroundColor = '#218838';
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 4px 6px rgba(40, 167, 69, 0.3)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isExporting) {
                e.currentTarget.style.backgroundColor = '#28a745';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 2px 4px rgba(40, 167, 69, 0.2)';
              }
            }}
          >
            <Download size={18} />
            {isExporting ? t('export.exporting') : t('export.exportData')}
          </button>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: '14px 20px',
              backgroundColor: '#f3f4f6',
              color: '#374151',
              border: '2px solid #e5e7eb',
              borderRadius: '10px',
              fontSize: '15px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#e5e7eb';
              e.currentTarget.style.borderColor = '#d1d5db';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#f3f4f6';
              e.currentTarget.style.borderColor = '#e5e7eb';
            }}
          >
            {t('common.cancel')}
          </button>
        </div>

        <style>{`
          @media (max-width: 768px) {
            .modal-content {
              padding: 24px !important;
            }
            .modal-content h2 {
              font-size: 24px !important;
            }
          }
          
          @media (max-width: 480px) {
            .modal-content {
              padding: 20px !important;
            }
            .modal-content h2 {
              font-size: 20px !important;
            }
          }
        `}</style>
      </div>
    </div>
  );
}