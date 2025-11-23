import { Building as BuildingIcon } from 'lucide-react';
import type { Building } from '../../../types';
import { useTranslation } from '../../../i18n';

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

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
      gap: '16px',
      marginBottom: '30px'
    }}>
      {/* All Buildings Option */}
      <div
        onClick={() => onSelect(null)}
        style={{
          padding: '20px',
          backgroundColor: selectedBuildingId === null ? '#667EEA' : 'white',
          color: selectedBuildingId === null ? 'white' : '#1f2937',
          borderRadius: '12px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          cursor: 'pointer',
          transition: 'all 0.2s',
          border: selectedBuildingId === null ? '2px solid #667EEA' : '2px solid transparent'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
          <BuildingIcon size={24} />
          <h3 style={{ fontSize: '18px', fontWeight: '600', margin: 0 }}>
            {t('billing.allBuildings')}
          </h3>
        </div>
        <p style={{ fontSize: '14px', margin: 0, opacity: 0.9 }}>
          {getAllBuildingsDescription()}
        </p>
      </div>

      {/* Individual Buildings */}
      {filteredBuildings.map(building => (
        <div
          key={building.id}
          onClick={() => onSelect(building.id)}
          style={{
            padding: '20px',
            backgroundColor: selectedBuildingId === building.id ? '#667EEA' : 'white',
            color: selectedBuildingId === building.id ? 'white' : '#1f2937',
            borderRadius: '12px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            cursor: 'pointer',
            transition: 'all 0.2s',
            border: selectedBuildingId === building.id ? '2px solid #667EEA' : '2px solid transparent'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <BuildingIcon size={24} />
            <h3 style={{ fontSize: '18px', fontWeight: '600', margin: 0 }}>
              {building.name}
            </h3>
          </div>
          <p style={{ fontSize: '14px', margin: 0, opacity: 0.9 }}>
            {building.address_street || ''}
          </p>
        </div>
      ))}
    </div>
  );
}