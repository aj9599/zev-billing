import type { Building as BuildingType, Charger } from '../../types';

interface BuildingFilterProps {
  buildings: BuildingType[];
  chargers: Charger[];
  selectedBuildingId: number | null;
  onBuildingSelect: (id: number | null) => void;
  isMobile: boolean;
  t: (key: string) => string;
}

export default function BuildingFilter({
  buildings,
  chargers,
  selectedBuildingId,
  onBuildingSelect,
  isMobile,
  t
}: BuildingFilterProps) {
  const pillStyle = (isActive: boolean): React.CSSProperties => ({
    padding: isMobile ? '8px 14px' : '8px 18px',
    borderRadius: '20px',
    border: isActive ? '1.5px solid #667eea' : '1.5px solid #e5e7eb',
    backgroundColor: isActive ? '#667eea' : 'white',
    color: isActive ? 'white' : '#6b7280',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    whiteSpace: 'nowrap' as const,
    boxShadow: isActive ? '0 2px 8px rgba(102, 126, 234, 0.3)' : '0 1px 3px rgba(0,0,0,0.04)'
  });

  const countBadge = (count: number, isActive: boolean): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '20px',
    height: '20px',
    padding: '0 6px',
    borderRadius: '10px',
    fontSize: '11px',
    fontWeight: '700',
    backgroundColor: isActive ? 'rgba(255,255,255,0.25)' : '#f3f4f6',
    color: isActive ? 'white' : '#9ca3af'
  });

  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: '8px',
      marginBottom: '24px'
    }}>
      {/* All Buildings pill */}
      <button
        onClick={() => onBuildingSelect(null)}
        style={pillStyle(selectedBuildingId === null)}
      >
        {t('dashboard.allBuildings')}
        <span style={countBadge(chargers.length, selectedBuildingId === null)}>
          {chargers.length}
        </span>
      </button>

      {/* Building pills */}
      {buildings.map(building => {
        const count = chargers.filter(c => c.building_id === building.id).length;
        const isActive = selectedBuildingId === building.id;
        return (
          <button
            key={building.id}
            onClick={() => onBuildingSelect(building.id)}
            style={pillStyle(isActive)}
          >
            {building.name}
            <span style={countBadge(count, isActive)}>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
