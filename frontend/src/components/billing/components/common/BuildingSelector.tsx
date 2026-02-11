import { Building as BuildingIcon, Layers } from 'lucide-react';
import type { Building } from '../../../../types';
import { useTranslation } from '../../../../i18n';

interface BuildingSelectorProps {
  buildings: Building[];
  selectedBuildingId: number | null;
  onSelect: (id: number | null) => void;
  searchQuery: string;
  currentView: 'invoices' | 'shared-meters' | 'custom-items';
}

export default function BuildingSelector({
  buildings,
  selectedBuildingId,
  onSelect,
  searchQuery,
  currentView
}: BuildingSelectorProps) {
  const { t } = useTranslation();

  const filteredBuildings = buildings.filter(b =>
    b.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getAllBuildingsDescription = () => {
    switch (currentView) {
      case 'invoices':
        return t('billing.allBuildingsDesc');
      case 'shared-meters':
        return t('billing.allBuildingsDescSharedMeters');
      case 'custom-items':
        return t('billing.allBuildingsDescCustomItems');
      default:
        return t('billing.allBuildingsDesc');
    }
  };

  const isSelected = (id: number | null) => selectedBuildingId === id;

  return (
    <div style={{
      display: 'flex',
      gap: '10px',
      flexWrap: 'wrap',
      marginBottom: '24px'
    }}>
      {/* All Buildings Pill */}
      <button
        onClick={() => onSelect(null)}
        style={{
          padding: '8px 18px',
          background: isSelected(null) ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'white',
          color: isSelected(null) ? 'white' : '#374151',
          borderRadius: '20px',
          border: isSelected(null) ? 'none' : '1px solid #e5e7eb',
          cursor: 'pointer',
          transition: 'all 0.2s',
          fontSize: '13px',
          fontWeight: isSelected(null) ? '600' : '500',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          boxShadow: isSelected(null) ? '0 2px 8px rgba(102, 126, 234, 0.3)' : '0 1px 3px rgba(0,0,0,0.06)'
        }}
      >
        <Layers size={14} />
        {t('billing.allBuildings')}
        <span style={{
          backgroundColor: isSelected(null) ? 'rgba(255,255,255,0.25)' : '#f3f4f6',
          color: isSelected(null) ? 'white' : '#6b7280',
          padding: '1px 8px',
          borderRadius: '10px',
          fontSize: '11px',
          fontWeight: '700'
        }}>
          {buildings.length}
        </span>
      </button>

      {/* Individual Building Pills */}
      {filteredBuildings.map(building => (
        <button
          key={building.id}
          onClick={() => onSelect(building.id)}
          style={{
            padding: '8px 18px',
            background: isSelected(building.id) ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'white',
            color: isSelected(building.id) ? 'white' : '#374151',
            borderRadius: '20px',
            border: isSelected(building.id) ? 'none' : '1px solid #e5e7eb',
            cursor: 'pointer',
            transition: 'all 0.2s',
            fontSize: '13px',
            fontWeight: isSelected(building.id) ? '600' : '500',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: isSelected(building.id) ? '0 2px 8px rgba(102, 126, 234, 0.3)' : '0 1px 3px rgba(0,0,0,0.06)'
          }}
        >
          <BuildingIcon size={14} />
          {building.name}
        </button>
      ))}
    </div>
  );
}
