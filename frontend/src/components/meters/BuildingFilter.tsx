import { Building } from 'lucide-react';
import { useTranslation } from '../../i18n';
import type { Building as BuildingType, Meter } from '../../types';

interface BuildingFilterProps {
    buildings: BuildingType[];
    meters: Meter[];
    selectedBuildingId: number | null;
    onSelectBuilding: (id: number | null) => void;
    isMobile: boolean;
}

export default function BuildingFilter({
    buildings,
    meters,
    selectedBuildingId,
    onSelectBuilding,
    isMobile
}: BuildingFilterProps) {
    const { t } = useTranslation();

    return (
        <div style={{
            display: 'flex',
            gap: '8px',
            marginBottom: '20px',
            flexWrap: 'wrap'
        }}>
            {/* All buildings pill */}
            <button
                onClick={() => onSelectBuilding(null)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: isMobile ? '6px 12px' : '8px 16px',
                    backgroundColor: selectedBuildingId === null ? '#667eea' : 'white',
                    color: selectedBuildingId === null ? 'white' : '#374151',
                    borderRadius: '20px',
                    border: selectedBuildingId === null ? '1px solid #667eea' : '1px solid #e5e7eb',
                    boxShadow: selectedBuildingId === null ? '0 2px 8px rgba(102, 126, 234, 0.3)' : '0 1px 3px rgba(0,0,0,0.06)',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: '600',
                    transition: 'all 0.2s',
                    whiteSpace: 'nowrap'
                }}
            >
                <Building size={14} />
                {t('dashboard.allBuildings')}
                <span style={{
                    fontSize: '11px',
                    fontWeight: '700',
                    padding: '1px 6px',
                    borderRadius: '10px',
                    backgroundColor: selectedBuildingId === null ? 'rgba(255,255,255,0.2)' : '#f3f4f6'
                }}>
                    {meters.length}
                </span>
            </button>

            {buildings.map(building => {
                const buildingMeters = meters.filter(m => m.building_id === building.id);
                const isSelected = selectedBuildingId === building.id;
                return (
                    <button
                        key={building.id}
                        onClick={() => onSelectBuilding(building.id)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: isMobile ? '6px 12px' : '8px 16px',
                            backgroundColor: isSelected ? '#667eea' : 'white',
                            color: isSelected ? 'white' : '#374151',
                            borderRadius: '20px',
                            border: isSelected ? '1px solid #667eea' : '1px solid #e5e7eb',
                            boxShadow: isSelected ? '0 2px 8px rgba(102, 126, 234, 0.3)' : '0 1px 3px rgba(0,0,0,0.06)',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: '600',
                            transition: 'all 0.2s',
                            whiteSpace: 'nowrap'
                        }}
                    >
                        {building.name}
                        <span style={{
                            fontSize: '11px',
                            fontWeight: '700',
                            padding: '1px 6px',
                            borderRadius: '10px',
                            backgroundColor: isSelected ? 'rgba(255,255,255,0.2)' : '#f3f4f6'
                        }}>
                            {buildingMeters.length}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
