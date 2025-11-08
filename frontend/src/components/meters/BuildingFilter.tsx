import { Building } from 'lucide-react';
import { useTranslation } from '../../i18n';
import type { Building as BuildingType, Meter } from '../../types';

interface BuildingFilterProps {
    buildings: BuildingType[];
    meters: Meter[];
    selectedBuildingId: number | null;
    onSelectBuilding: (id: number | null) => void;
}

export default function BuildingFilter({
    buildings,
    meters,
    selectedBuildingId,
    onSelectBuilding
}: BuildingFilterProps) {
    const { t } = useTranslation();

    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
            gap: '16px',
            marginBottom: '30px'
        }}>
            <div
                onClick={() => onSelectBuilding(null)}
                style={{
                    padding: '20px',
                    backgroundColor: selectedBuildingId === null ? '#667eea' : 'white',
                    color: selectedBuildingId === null ? 'white' : '#1f2937',
                    borderRadius: '12px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    border: selectedBuildingId === null ? '2px solid #667eea' : '2px solid transparent'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                    <Building size={24} />
                    <h3 style={{ fontSize: '18px', fontWeight: '600', margin: 0 }}>
                        {t('dashboard.allBuildings')}
                    </h3>
                </div>
                <p style={{ fontSize: '14px', margin: 0, opacity: 0.9 }}>
                    {meters.length} {t('meters.metersCount')}
                </p>
            </div>

            {buildings.map(building => {
                const buildingMeters = meters.filter(m => m.building_id === building.id);
                return (
                    <div
                        key={building.id}
                        onClick={() => onSelectBuilding(building.id)}
                        style={{
                            padding: '20px',
                            backgroundColor: selectedBuildingId === building.id ? '#667eea' : 'white',
                            color: selectedBuildingId === building.id ? 'white' : '#1f2937',
                            borderRadius: '12px',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            border: selectedBuildingId === building.id ? '2px solid #667eea' : '2px solid transparent'
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                            <Building size={24} />
                            <h3 style={{ fontSize: '18px', fontWeight: '600', margin: 0 }}>
                                {building.name}
                            </h3>
                        </div>
                        <p style={{ fontSize: '14px', margin: 0, opacity: 0.9 }}>
                            {buildingMeters.length} {t('meters.metersCount')}
                        </p>
                    </div>
                );
            })}
        </div>
    );
}