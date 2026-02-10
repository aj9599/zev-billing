import { Edit2, Trash2, MapPin, Home } from 'lucide-react';
import { useTranslation } from '../../../i18n';
import { api } from '../../../api/client';
import { useBuildingConsumption } from '../hooks/useBuildingConsumption';
import { getBuildingMeters, getBuildingChargers, hasSolarMeter } from '../utils/buildingUtils';
import EnergyFlowDiagram from './energy/EnergyFlowDiagram';
import EnergySharingInfo from './energy/EnergySharingInfo';
import EnergyStatsGrid from './energy/EnergyStatsGrid';
import BuildingVisualization from './visualization/BuildingVisualization';
import type { Building, Meter, Charger, BuildingConsumption } from '../../../types';

interface EnergyFlowCardProps {
  building: Building;
  buildings: Building[];
  meters: Meter[];
  chargers: Charger[];
  consumptionData: BuildingConsumption[];
  onEdit: (building: Building) => void;
  onDelete: () => void;
  isMobile: boolean;
}

export default function EnergyFlowCard({
  building,
  buildings,
  meters,
  chargers,
  consumptionData,
  onEdit,
  onDelete,
  isMobile
}: EnergyFlowCardProps) {
  const { t } = useTranslation();
  const { getBuildingConsumption } = useBuildingConsumption(consumptionData);
  const consumption = getBuildingConsumption(building.id);

  const buildingMeters = getBuildingMeters(building.id, meters);
  const buildingChargers = getBuildingChargers(building.id, chargers);
  const activeCharger = consumption.charging > 0 && buildingChargers.length > 0
    ? buildingChargers[0]
    : null;

  const handleDelete = async () => {
    if (confirm(t('buildings.deleteConfirm'))) {
      try {
        await api.deleteBuilding(building.id);
        onDelete();
      } catch (err) {
        alert(t('buildings.deleteFailed'));
      }
    }
  };

  return (
    <div style={{
      padding: isMobile ? '16px' : '24px',
      position: 'relative'
    }}>
      {/* Action buttons - top right */}
      <div style={{
        position: 'absolute',
        top: isMobile ? '12px' : '16px',
        right: isMobile ? '12px' : '16px',
        display: 'flex',
        gap: '6px',
        zIndex: 10
      }}>
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(building); }}
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: 'rgba(59, 130, 246, 0.08)',
            color: '#3b82f6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.08)';
          }}
          title={t('common.edit')}
        >
          <Edit2 size={14} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); handleDelete(); }}
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: 'rgba(239, 68, 68, 0.08)',
            color: '#ef4444',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.08)';
          }}
          title={t('common.delete')}
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Energy Sharing Info (if in complex) */}
      <EnergySharingInfo
        building={building}
        buildings={buildings}
        consumption={consumption}
        getBuildingConsumption={getBuildingConsumption}
        isMobile={isMobile}
      />

      {/* Main content: Building Visualization + Energy Flow Diagram */}
      <div style={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        gap: isMobile ? '20px' : '32px',
        alignItems: isMobile ? 'center' : 'flex-start',
        justifyContent: 'center',
        marginBottom: isMobile ? '16px' : '24px'
      }}>
        {/* Building Visualization */}
        <BuildingVisualization
          building={building}
          meters={meters}
          consumption={consumption}
          isMobile={isMobile}
        />

        {/* Energy Flow Diagram */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <EnergyFlowDiagram
            consumption={consumption}
            hasSolarMeter={hasSolarMeter(building.id, meters)}
            isMobile={isMobile}
          />
        </div>
      </div>

      {/* Stats Row */}
      <EnergyStatsGrid
        building={building}
        metersCount={buildingMeters.length}
        chargersCount={buildingChargers.length}
        charging={consumption.charging}
        activeCharger={activeCharger}
        isMobile={isMobile}
      />
    </div>
  );
}
