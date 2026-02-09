import { Home, Zap } from 'lucide-react';
import { useTranslation } from '../../../../i18n';
import RoofSection from './RoofSection';
import FloorSection from './FloorSection';
import EnergyBadges from './EnergyBadges';
import type { Building, Meter, FloorConfig } from '../../../../types';

interface BuildingVisualizationProps {
  building: Building;
  meters: Meter[];
  consumption: {
    actualHouseConsumption: number;
    solarProduction: number;
    gridPower: number;
  };
  isMobile: boolean;
}

function getFloorsByType(floors: FloorConfig[]) {
  const atticFloors = floors.filter(f => f.floor_type === 'attic');
  const normalFloors = floors.filter(f => !f.floor_type || f.floor_type === 'normal');
  const undergroundFloors = floors.filter(f => f.floor_type === 'underground');
  return { atticFloors, normalFloors, undergroundFloors };
}

export default function BuildingVisualization({
  building,
  meters,
  consumption,
  isMobile
}: BuildingVisualizationProps) {
  const { t } = useTranslation();
  const buildingMeters = meters.filter(m => m.building_id === building.id);
  const hasSolar = buildingMeters.some(m => m.meter_type === 'solar_meter');
  const hasFloors = building.has_apartments && building.floors_config && building.floors_config.length > 0;

  const floors = building.floors_config || [];
  const { atticFloors, normalFloors, undergroundFloors } = getFloorsByType(floors);
  const atticApartments = atticFloors.flatMap(f => f.apartments);

  // Render order: attic in roof, normal top-to-bottom, underground at bottom
  const aboveGroundFloors = normalFloors;
  const belowGroundFloors = undergroundFloors;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      width: isMobile ? '100%' : '280px',
      minHeight: isMobile ? '200px' : '280px',
      position: 'relative',
      flexShrink: 0
    }}>
      {hasFloors ? (
        <>
          {/* Roof */}
          <RoofSection
            hasSolar={hasSolar}
            atticApartments={atticApartments}
            isMobile={isMobile}
          />

          {/* Above-ground floors */}
          {aboveGroundFloors.length > 0 && (
            <div style={{ width: '100%' }}>
              {[...aboveGroundFloors].reverse().map((floor, idx) => (
                <FloorSection
                  key={`normal-${idx}`}
                  floor={floor}
                  isFirst={idx === 0}
                  isLast={idx === aboveGroundFloors.length - 1 && belowGroundFloors.length === 0}
                  isMobile={isMobile}
                />
              ))}
            </div>
          )}

          {/* Ground line */}
          {belowGroundFloors.length > 0 && (
            <div style={{
              width: '90%',
              height: '4px',
              background: 'linear-gradient(90deg, transparent 0%, #059669 10%, #059669 90%, transparent 100%)',
              borderRadius: '2px',
              position: 'relative'
            }}>
              <span style={{
                position: 'absolute',
                top: '-8px',
                left: '50%',
                transform: 'translateX(-50%)',
                fontSize: '8px',
                fontWeight: '600',
                color: '#059669',
                backgroundColor: 'white',
                padding: '0 6px',
                whiteSpace: 'nowrap'
              }}>
                {t('buildings.visualization.groundLevel')}
              </span>
            </div>
          )}

          {/* Underground floors */}
          {belowGroundFloors.length > 0 && (
            <div style={{ width: '100%' }}>
              {belowGroundFloors.map((floor, idx) => (
                <FloorSection
                  key={`ug-${idx}`}
                  floor={floor}
                  isFirst={idx === 0 && aboveGroundFloors.length === 0}
                  isLast={idx === belowGroundFloors.length - 1}
                  isMobile={isMobile}
                />
              ))}
            </div>
          )}

          {/* No above-ground floors but we have underground - still show a mini roof */}
          {aboveGroundFloors.length === 0 && belowGroundFloors.length > 0 && !atticFloors.length && (
            <div style={{
              width: '90%',
              height: '20px',
              backgroundColor: '#92400e',
              borderRadius: '4px 4px 0 0'
            }} />
          )}
        </>
      ) : (
        /* Simple house for non-apartment buildings */
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          width: '100%'
        }}>
          {/* Simple roof */}
          <div style={{
            width: '100%',
            height: isMobile ? '50px' : '70px',
            background: hasSolar
              ? 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 50%, #1e3a5f 100%)'
              : 'linear-gradient(135deg, #92400e 0%, #b45309 50%, #78350f 100%)',
            clipPath: 'polygon(50% 0%, 5% 100%, 95% 100%)',
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            {hasSolar && (
              <div style={{
                position: 'absolute',
                top: isMobile ? '-14px' : '-20px',
                right: isMobile ? '8px' : '16px',
                width: isMobile ? '28px' : '36px',
                height: isMobile ? '28px' : '36px',
                borderRadius: '50%',
                backgroundColor: '#fbbf24',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 16px rgba(251, 191, 36, 0.4)'
              }}>
                <Zap size={isMobile ? 14 : 18} color="#fff" />
              </div>
            )}
          </div>

          {/* House body */}
          <div style={{
            width: '90%',
            padding: isMobile ? '16px 12px' : '24px 16px',
            backgroundColor: '#fefce8',
            borderLeft: '3px solid #d97706',
            borderRight: '3px solid #d97706',
            borderBottom: '4px solid #92400e',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px'
          }}>
            <Home size={isMobile ? 28 : 36} color="#92400e" />
            <div style={{
              display: 'flex',
              gap: '8px',
              alignItems: 'center'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 8px',
                backgroundColor: 'rgba(217, 119, 6, 0.1)',
                borderRadius: '8px'
              }}>
                <Zap size={12} color="#d97706" />
                <span style={{
                  fontSize: isMobile ? '10px' : '12px',
                  fontWeight: '700',
                  color: '#92400e'
                }}>
                  {buildingMeters.length} {t('buildings.metersCount')}
                </span>
              </div>
            </div>

            {/* Door */}
            <div style={{
              width: isMobile ? '24px' : '30px',
              height: isMobile ? '36px' : '44px',
              backgroundColor: '#92400e',
              borderRadius: '4px 4px 0 0',
              position: 'relative',
              marginTop: '4px'
            }}>
              <div style={{
                position: 'absolute',
                right: '4px',
                top: '50%',
                width: '4px',
                height: '4px',
                borderRadius: '50%',
                backgroundColor: '#d97706'
              }} />
            </div>
          </div>
        </div>
      )}

      {/* Energy badges */}
      <EnergyBadges
        consumption={consumption.actualHouseConsumption}
        solarProduction={consumption.solarProduction}
        gridPower={consumption.gridPower}
        hasSolar={hasSolar}
        isMobile={isMobile}
      />

      {/* Pulse animation for sun */}
      <style>{`
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 20px rgba(251, 191, 36, 0.5); }
          50% { box-shadow: 0 0 30px rgba(251, 191, 36, 0.8); }
        }
      `}</style>
    </div>
  );
}
