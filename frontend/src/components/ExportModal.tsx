import { X, Download, Calendar, Filter, Check } from 'lucide-react';
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
  onExport: (startDate: string, endDate: string, itemId?: number, itemIds?: number[]) => Promise<void>;
}

export default function ExportModal({ type, items, buildings, onClose, onExport }: ExportModalProps) {
  const { t } = useTranslation();
  const [dateRange, setDateRange] = useState({
    start_date: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0]
  });
  const [selectedBuildingId, setSelectedBuildingId] = useState<number | undefined>(undefined);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<number>>(new Set());
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      if (selectedItemIds.size === 0) {
        // Export all (or all in building)
        await onExport(dateRange.start_date, dateRange.end_date);
      } else if (selectedItemIds.size === 1) {
        // Single item - use legacy parameter
        await onExport(dateRange.start_date, dateRange.end_date, Array.from(selectedItemIds)[0]);
      } else {
        // Multiple items - use new multi-select parameter
        await onExport(dateRange.start_date, dateRange.end_date, undefined, Array.from(selectedItemIds));
      }
    } finally {
      setIsExporting(false);
    }
  };

  // Filter items by selected building
  const filteredItems = selectedBuildingId
    ? items.filter(item => item.building_id === selectedBuildingId)
    : items;

  // Group items by building for display
  const itemsByBuilding: Record<number, ExportItem[]> = {};
  filteredItems.forEach(item => {
    if (!itemsByBuilding[item.building_id]) {
      itemsByBuilding[item.building_id] = [];
    }
    itemsByBuilding[item.building_id].push(item);
  });

  const toggleItem = (id: number) => {
    const next = new Set(selectedItemIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedItemIds(next);
  };

  const selectAll = () => {
    const allIds = filteredItems.map(i => i.id);
    setSelectedItemIds(new Set(allIds));
  };

  const selectNone = () => {
    setSelectedItemIds(new Set());
  };

  const selectBuilding = (buildingId: number) => {
    const ids = filteredItems.filter(i => i.building_id === buildingId).map(i => i.id);
    const next = new Set(selectedItemIds);
    const allSelected = ids.every(id => next.has(id));
    if (allSelected) {
      ids.forEach(id => next.delete(id));
    } else {
      ids.forEach(id => next.add(id));
    }
    setSelectedItemIds(next);
  };

  const getExportSummary = () => {
    if (selectedItemIds.size === 0) {
      const buildingName = selectedBuildingId
        ? buildings.find(b => b.id === selectedBuildingId)?.name || t('common.unknownBuilding')
        : t('export.allBuildings');
      const typeLabel = type === 'meters' ? t('meters.title') : t('chargers.title');
      return t('export.exportingAllFrom')
        .replace('{type}', typeLabel)
        .replace('{building}', buildingName);
    }
    if (selectedItemIds.size === 1) {
      const item = items.find(i => i.id === Array.from(selectedItemIds)[0]);
      return item ? `${item.building_name} - ${item.name}` : '';
    }
    return `${selectedItemIds.size} ${type === 'meters' ? t('meters.metersCount') : t('chargers.chargersCount')} ${t('export.selected') || 'selected'}`;
  };

  const typeLabel = type === 'meters' ? t('meters.title') : t('chargers.title');

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', zIndex: 2000, padding: '15px',
      backdropFilter: 'blur(4px)'
    }}>
      <div className="modal-content" style={{
        backgroundColor: '#f9fafb',
        borderRadius: '16px',
        padding: 0,
        maxWidth: '640px',
        width: '100%',
        maxHeight: '90vh',
        overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '20px 24px',
          backgroundColor: 'white',
          borderBottom: '1px solid #f0f0f0'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '10px',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Download size={18} color="white" />
            </div>
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#1f2937', margin: 0 }}>
                {t('export.title')}
              </h2>
              <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>
                {t('export.subtitle').replace('{type}', typeLabel)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: '32px', height: '32px', borderRadius: '8px', border: 'none',
              backgroundColor: '#f3f4f6', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#e5e7eb'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#f3f4f6'; }}
          >
            <X size={18} color="#6b7280" />
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ overflow: 'auto', padding: '20px 24px', flex: 1 }}>
          {/* Building Filter */}
          <div style={{
            marginBottom: '16px', padding: '16px',
            backgroundColor: 'white', borderRadius: '10px', border: '1px solid #e5e7eb'
          }}>
            <label style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              marginBottom: '10px', fontWeight: '600', fontSize: '13px', color: '#374151'
            }}>
              <Filter size={14} color="#667eea" />
              {t('users.building')}
            </label>
            <select
              value={selectedBuildingId || ''}
              onChange={(e) => {
                const buildingId = e.target.value ? parseInt(e.target.value) : undefined;
                setSelectedBuildingId(buildingId);
                setSelectedItemIds(new Set()); // Reset selection when building changes
              }}
              style={selectStyle}
              onFocus={focusHandler}
              onBlur={blurHandler}
            >
              <option value="">{t('dashboard.allBuildings')}</option>
              {buildings.map(building => (
                <option key={building.id} value={building.id}>
                  {building.name}
                </option>
              ))}
            </select>
          </div>

          {/* Multi-Select Item List */}
          <div style={{
            marginBottom: '16px', padding: '16px',
            backgroundColor: 'white', borderRadius: '10px', border: '1px solid #e5e7eb'
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: '12px'
            }}>
              <label style={{
                fontWeight: '600', fontSize: '13px', color: '#374151'
              }}>
                {typeLabel}
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={selectAll}
                  style={quickBtnStyle}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f0f0ff'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  {t('export.selectAll') || 'Select All'}
                </button>
                <button
                  type="button"
                  onClick={selectNone}
                  style={quickBtnStyle}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f0f0ff'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  {t('export.selectNone') || 'None'}
                </button>
              </div>
            </div>

            <div style={{
              maxHeight: '240px', overflowY: 'auto', borderRadius: '8px',
              border: '1px solid #e5e7eb', backgroundColor: '#fafafa'
            }}>
              {selectedItemIds.size === 0 && (
                <div style={{
                  padding: '10px 14px', fontSize: '13px', color: '#10b981', fontWeight: '500',
                  backgroundColor: '#f0fdf4', borderBottom: '1px solid #e5e7eb',
                  display: 'flex', alignItems: 'center', gap: '6px'
                }}>
                  <Check size={14} />
                  {t('export.allSelected') || `All ${typeLabel} will be exported`}
                </div>
              )}

              {Object.entries(itemsByBuilding).map(([buildingId, buildingItems]) => {
                const building = buildings.find(b => b.id === parseInt(buildingId));
                const allSelected = buildingItems.every(item => selectedItemIds.has(item.id));
                const someSelected = buildingItems.some(item => selectedItemIds.has(item.id));
                return (
                  <div key={buildingId}>
                    {/* Building group header */}
                    <div
                      onClick={() => selectBuilding(parseInt(buildingId))}
                      style={{
                        padding: '8px 14px',
                        backgroundColor: '#f3f4f6',
                        borderBottom: '1px solid #e5e7eb',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        cursor: 'pointer',
                        transition: 'background-color 0.15s'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#e5e7eb'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#f3f4f6'; }}
                    >
                      <div style={{
                        width: '18px', height: '18px', borderRadius: '4px',
                        border: `2px solid ${allSelected ? '#667eea' : someSelected ? '#667eea80' : '#d1d5db'}`,
                        backgroundColor: allSelected ? '#667eea' : someSelected ? '#667eea40' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.2s', flexShrink: 0
                      }}>
                        {(allSelected || someSelected) && (
                          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                            <path d={allSelected ? "M2 6L5 9L10 3" : "M3 6H9"} stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                      <span style={{ fontSize: '12px', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {building?.name || t('common.unknownBuilding')}
                      </span>
                      <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: '500' }}>
                        ({buildingItems.length})
                      </span>
                    </div>

                    {/* Individual items */}
                    {buildingItems.map(item => {
                      const isSelected = selectedItemIds.has(item.id);
                      return (
                        <div
                          key={item.id}
                          onClick={() => toggleItem(item.id)}
                          style={{
                            padding: '8px 14px 8px 28px',
                            borderBottom: '1px solid #f3f4f6',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            cursor: 'pointer',
                            transition: 'background-color 0.15s',
                            backgroundColor: isSelected ? '#f0f0ff' : 'transparent'
                          }}
                          onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = '#f9fafb'; }}
                          onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent'; else e.currentTarget.style.backgroundColor = '#f0f0ff'; }}
                        >
                          <div style={{
                            width: '18px', height: '18px', borderRadius: '5px',
                            border: `2px solid ${isSelected ? '#667eea' : '#d1d5db'}`,
                            backgroundColor: isSelected ? '#667eea' : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'all 0.2s', flexShrink: 0
                          }}>
                            {isSelected && (
                              <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                                <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </div>
                          <span style={{ fontSize: '13px', color: '#374151' }}>{item.name}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {filteredItems.length === 0 && (
                <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>
                  {t('export.noItems') || 'No items found'}
                </div>
              )}
            </div>

            {/* Selection summary */}
            <div style={{
              fontSize: '12px', color: '#10b981', marginTop: '10px',
              padding: '8px 12px', backgroundColor: '#f0fdf4', borderRadius: '8px',
              border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', gap: '6px'
            }}>
              <Download size={14} />
              {getExportSummary()}
            </div>
          </div>

          {/* Date Range */}
          <div style={{
            padding: '16px',
            backgroundColor: 'white', borderRadius: '10px', border: '1px solid #e5e7eb'
          }}>
            <label style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              marginBottom: '12px', fontWeight: '600', fontSize: '13px', color: '#374151'
            }}>
              <Calendar size={14} color="#f59e0b" />
              {t('export.dateRange') || 'Date Range'}
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: '#6b7280', fontWeight: '500' }}>
                  {t('export.startDate')} *
                </label>
                <input
                  type="date"
                  required
                  value={dateRange.start_date}
                  onChange={(e) => setDateRange({ ...dateRange, start_date: e.target.value })}
                  style={inputStyle}
                  onFocus={focusHandler}
                  onBlur={blurHandler}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: '#6b7280', fontWeight: '500' }}>
                  {t('export.endDate')} *
                </label>
                <input
                  type="date"
                  required
                  value={dateRange.end_date}
                  onChange={(e) => setDateRange({ ...dateRange, end_date: e.target.value })}
                  style={inputStyle}
                  onFocus={focusHandler}
                  onBlur={blurHandler}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer buttons */}
        <div style={{
          display: 'flex', gap: '10px',
          padding: '16px 24px',
          backgroundColor: 'white',
          borderTop: '1px solid #f0f0f0'
        }}>
          <button
            onClick={handleExport}
            disabled={isExporting}
            style={{
              flex: 1, padding: '12px 24px',
              background: isExporting ? '#9ca3af' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: 'white', border: 'none', borderRadius: '10px',
              fontSize: '14px', fontWeight: '600',
              cursor: isExporting ? 'not-allowed' : 'pointer',
              opacity: isExporting ? 0.7 : 1,
              transition: 'all 0.2s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              boxShadow: isExporting ? 'none' : '0 2px 8px rgba(16, 185, 129, 0.3)'
            }}
            onMouseEnter={(e) => {
              if (!isExporting) {
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.4)';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isExporting) {
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(16, 185, 129, 0.3)';
                e.currentTarget.style.transform = 'translateY(0)';
              }
            }}
          >
            <Download size={18} />
            {isExporting ? (t('export.exporting') || 'Exporting...') : t('export.exportData')}
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '12px 24px', backgroundColor: 'white',
              color: '#6b7280', border: '1px solid #e5e7eb', borderRadius: '10px',
              fontSize: '14px', fontWeight: '600', cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f9fafb'; e.currentTarget.style.borderColor = '#d1d5db'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'white'; e.currentTarget.style.borderColor = '#e5e7eb'; }}
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Shared styles ──────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  fontSize: '14px',
  color: '#1f2937',
  backgroundColor: 'white',
  transition: 'border-color 0.2s, box-shadow 0.2s',
  outline: 'none'
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer'
};

const quickBtnStyle: React.CSSProperties = {
  padding: '4px 10px',
  border: 'none',
  backgroundColor: 'transparent',
  color: '#667eea',
  fontSize: '12px',
  fontWeight: '600',
  cursor: 'pointer',
  borderRadius: '6px',
  transition: 'background-color 0.15s'
};

const focusHandler = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
  e.currentTarget.style.borderColor = '#667eea';
  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(102,126,234,0.1)';
};

const blurHandler = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
  e.currentTarget.style.borderColor = '#e5e7eb';
  e.currentTarget.style.boxShadow = 'none';
};
