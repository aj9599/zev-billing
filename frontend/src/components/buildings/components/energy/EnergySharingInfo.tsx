import { Sun } from 'lucide-react';
import type { Building } from '../../../../types';

interface EnergySharingInfoProps {
  building: Building;
  buildings: Building[];
  consumption: {
    gridPower: number;
    solarToGrid: number;
  };
  getBuildingConsumption: (buildingId: number) => any;
  isMobile: boolean;
}

export default function EnergySharingInfo({
  building,
  buildings,
  consumption,
  getBuildingConsumption,
  isMobile
}: EnergySharingInfoProps) {
  // Find if this building is in a complex
  const complexes = buildings.filter(b => b.is_group);
  const buildingComplex = complexes.find(c => c.group_buildings?.includes(building.id));

  if (!buildingComplex) return null;

  const isImporting = consumption.gridPower > 0;

  // Calculate energy sharing
  const buildingsInComplex = buildings.filter(b =>
    buildingComplex.group_buildings?.includes(b.id)
  );
  let totalComplexSolarExport = 0;
  const sourceBuildings: { name: string; solar: number }[] = [];

  buildingsInComplex.forEach(b => {
    if (b.id === building.id) return;
    const bConsumption = getBuildingConsumption(b.id);
    if (bConsumption.solarToGrid > 0) {
      totalComplexSolarExport += bConsumption.solarToGrid;
      sourceBuildings.push({
        name: b.name,
        solar: bConsumption.solarToGrid
      });
    }
  });

  if (!isImporting || totalComplexSolarExport === 0) return null;

  const potentialComplexSolar = Math.min(consumption.gridPower, totalComplexSolarExport);
  const gridOnly = consumption.gridPower - potentialComplexSolar;
  const solarPercentage = (potentialComplexSolar / consumption.gridPower) * 100;
  const gridPercentage = (gridOnly / consumption.gridPower) * 100;

  return (
    <div style={{
      backgroundColor: '#f0fdf4',
      border: '2px solid #22c55e',
      borderRadius: '12px',
      padding: isMobile ? '12px' : '16px',
      marginBottom: isMobile ? '16px' : '24px'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '8px'
      }}>
        <Sun size={16} color="#22c55e" />
        <span style={{
          fontSize: isMobile ? '13px' : '14px',
          fontWeight: '700',
          color: '#15803d'
        }}>
          Complex Energy Sharing
        </span>
      </div>
      <div style={{
        fontSize: isMobile ? '12px' : '13px',
        color: '#166534',
        marginBottom: '8px'
      }}>
        This building's grid import could include:
      </div>
      <div style={{
        display: 'flex',
        gap: isMobile ? '8px' : '12px',
        flexWrap: 'wrap'
      }}>
        <div style={{
          flex: 1,
          minWidth: '120px',
          padding: isMobile ? '8px' : '10px',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          <div style={{
            fontSize: isMobile ? '11px' : '12px',
            color: '#166534',
            marginBottom: '4px'
          }}>
            Solar from Complex
          </div>
          <div style={{
            fontSize: isMobile ? '16px' : '18px',
            fontWeight: '800',
            color: '#22c55e'
          }}>
            {solarPercentage.toFixed(0)}%
          </div>
          <div style={{
            fontSize: isMobile ? '10px' : '11px',
            color: '#166534'
          }}>
            ({potentialComplexSolar.toFixed(2)} kW)
          </div>
        </div>
        <div style={{
          flex: 1,
          minWidth: '120px',
          padding: isMobile ? '8px' : '10px',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          <div style={{
            fontSize: isMobile ? '11px' : '12px',
            color: '#991b1b',
            marginBottom: '4px'
          }}>
            From Grid
          </div>
          <div style={{
            fontSize: isMobile ? '16px' : '18px',
            fontWeight: '800',
            color: '#ef4444'
          }}>
            {gridPercentage.toFixed(0)}%
          </div>
          <div style={{
            fontSize: isMobile ? '10px' : '11px',
            color: '#991b1b'
          }}>
            ({gridOnly.toFixed(2)} kW)
          </div>
        </div>
      </div>
      {sourceBuildings.length > 0 && (
        <div style={{
          marginTop: '8px',
          fontSize: isMobile ? '11px' : '12px',
          color: '#166534'
        }}>
          <strong>Solar sources:</strong>{' '}
          {sourceBuildings.map(s => `${s.name} (${s.solar.toFixed(2)} kW)`).join(', ')}
        </div>
      )}
    </div>
  );
}