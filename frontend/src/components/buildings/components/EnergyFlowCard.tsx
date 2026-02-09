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
      backgroundColor: 'white',
      borderRadius: isMobile ? '12px' : '16px',
      padding: isMobile ? '16px' : '32px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
      border: '2px solid #f0f0f0',
      marginBottom: '16px',
      position: 'relative'
    }}>
      {/* Edit/Delete buttons */}
      <div style={{
        position: 'absolute',
        top: isMobile ? '8px' : '16px',
        right: isMobile ? '8px' : '16px',
        display: 'flex',
        gap: '8px',
        zIndex: 10
      }}>
        <button
          onClick={() => onEdit(building)}
          style={{
            width: isMobile ? '40px' : '36px',
            height: isMobile ? '40px' : '36px',
            borderRadius: '50%',
            border: 'none',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            color: '#3b82f6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.2)';
            e.currentTarget.style.transform = 'scale(1.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
          title={t('common.edit')}
        >
          <Edit2 size={16} />
        </button>
        <button
          onClick={handleDelete}
          style={{
            width: isMobile ? '40px' : '36px',
            height: isMobile ? '40px' : '36px',
            borderRadius: '50%',
            border: 'none',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            color: '#ef4444',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.2)';
            e.currentTarget.style.transform = 'scale(1.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
          title={t('common.delete')}
        >
          <Trash2 size={16} />
        </button>
      </div>

      {/* Header with building name */}
      <div style={{
        marginBottom: isMobile ? '20px' : '28px',
        textAlign: 'center',
        paddingRight: isMobile ? '90px' : '100px'
      }}>
        <h3 style={{
          fontSize: isMobile ? '18px' : '24px',
          fontWeight: '700',
          margin: 0,
          color: '#1f2937',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: isMobile ? '8px' : '12px',
          flexWrap: 'wrap'
        }}>
          <Home size={isMobile ? 22 : 28} color="#667eea" />
          <span style={{ wordBreak: 'break-word' }}>{building.name}</span>
          {building.has_apartments && (
            <span style={{
              fontSize: '11px',
              padding: '4px 10px',
              backgroundColor: '#dbeafe',
              color: '#1e40af',
              borderRadius: '6px',
              fontWeight: '600',
              marginLeft: '8px'
            }}>
              {t('buildings.apartmentBuilding')}
            </span>
          )}
        </h3>
        {(building.address_street || building.address_city) && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            marginTop: '8px',
            flexWrap: 'wrap'
          }}>
            <MapPin size={14} color="#9ca3af" />
            <p style={{
              fontSize: isMobile ? '12px' : '14px',
              color: '#6b7280',
              margin: 0,
              textAlign: 'center'
            }}>
              {building.address_street && <>{building.address_street}, </>}
              {building.address_zip && building.address_city && `${building.address_zip} ${building.address_city}`}
            </p>
          </div>
        )}
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
        marginBottom: isMobile ? '20px' : '32px'
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
