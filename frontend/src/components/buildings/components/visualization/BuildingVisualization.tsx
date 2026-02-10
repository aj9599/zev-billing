import { Home, Zap, Layers } from 'lucide-react';
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

  const aboveGroundFloors = normalFloors;
  const belowGroundFloors = undergroundFloors;

  const totalApartments = floors.reduce((sum, f) => sum + f.apartments.length, 0);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      width: isMobile ? '100%' : '300px',
      flexShrink: 0
    }}>
      {/* Building card wrapper */}
      <div style={{
        borderRadius: '16px',
        border: '2px solid #e2e8f0',
        overflow: 'hidden',
        boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
        backgroundColor: 'white'
      }}>
        {hasFloors ? (
          <>
            {/* Roof section - always shown for apartment buildings */}
            <RoofSection
              hasSolar={hasSolar}
              atticApartments={atticApartments}
              isMobile={isMobile}
            />

            {/* Above-ground floors */}
            {aboveGroundFloors.length > 0 && (
              <div>
                {[...aboveGroundFloors].reverse().map((floor, idx) => (
                  <FloorSection
                    key={`normal-${idx}`}
                    floor={floor}
                    isLast={idx === aboveGroundFloors.length - 1 && belowGroundFloors.length === 0}
                    isMobile={isMobile}
                  />
                ))}
              </div>
            )}

            {/* Ground level divider */}
            {belowGroundFloors.length > 0 && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '0 12px'
              }}>
                <div style={{ flex: 1, height: '2px', backgroundColor: '#059669', borderRadius: '1px' }} />
                <span style={{
                  fontSize: '9px',
                  fontWeight: '700',
                  color: '#059669',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  whiteSpace: 'nowrap'
                }}>
                  {t('buildings.visualization.groundLevel')}
                </span>
                <div style={{ flex: 1, height: '2px', backgroundColor: '#059669', borderRadius: '1px' }} />
              </div>
            )}

            {/* Underground floors */}
            {belowGroundFloors.length > 0 && (
              <div>
                {belowGroundFloors.map((floor, idx) => (
                  <FloorSection
                    key={`ug-${idx}`}
                    floor={floor}
                    isLast={idx === belowGroundFloors.length - 1}
                    isMobile={isMobile}
                  />
                ))}
              </div>
            )}

            {/* Bottom stats bar */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-around',
              padding: isMobile ? '10px 12px' : '12px 16px',
              backgroundColor: '#f8fafc',
              borderTop: '1px solid #e2e8f0'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <Layers size={12} color="#3b82f6" />
                <span style={{ fontSize: '11px', fontWeight: '700', color: '#1e40af' }}>
                  {floors.length}
                </span>
                <span style={{ fontSize: '10px', color: '#64748b' }}>
                  {t('buildings.apartmentConfig.floors')}
                </span>
              </div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <Home size={12} color="#f59e0b" />
                <span style={{ fontSize: '11px', fontWeight: '700', color: '#92400e' }}>
                  {totalApartments}
                </span>
                <span style={{ fontSize: '10px', color: '#64748b' }}>
                  {t('buildings.apartmentConfig.totalApartments')}
                </span>
              </div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <Zap size={12} color="#3b82f6" />
                <span style={{ fontSize: '11px', fontWeight: '700', color: '#1e40af' }}>
                  {buildingMeters.length}
                </span>
                <span style={{ fontSize: '10px', color: '#64748b' }}>
                  {t('buildings.metersCount')}
                </span>
              </div>
            </div>
          </>
        ) : (
          /* Simple building card for non-apartment buildings */
          <>
            {/* Top area - matches blue normal floor style */}
            <div style={{
              padding: isMobile ? '20px 16px' : '28px 20px',
              backgroundColor: '#f0f9ff',
              borderBottom: '2px solid #e2e8f0',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px'
            }}>
              <div style={{
                width: isMobile ? '48px' : '56px',
                height: isMobile ? '48px' : '56px',
                borderRadius: '16px',
                backgroundColor: '#dbeafe',
                border: '2px solid #93c5fd',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
              }}>
                <Home size={isMobile ? 24 : 28} color="#3b82f6" />
              </div>

              {hasSolar && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 12px',
                  backgroundColor: 'white',
                  borderRadius: '20px',
                  border: '1px solid #fbbf24',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
                }}>
                  <div style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    backgroundColor: '#fbbf24',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 0 10px rgba(251, 191, 36, 0.4)'
                  }}>
                    <Zap size={11} color="#fff" />
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: '700', color: '#d97706' }}>
                    Solar
                  </span>
                </div>
              )}
            </div>

            {/* Stats for simple building */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-around',
              padding: isMobile ? '14px 12px' : '16px',
              backgroundColor: '#f8fafc'
            }}>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px'
              }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  backgroundColor: '#dbeafe',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Zap size={16} color="#3b82f6" />
                </div>
                <span style={{ fontSize: '16px', fontWeight: '800', color: '#1e40af' }}>
                  {buildingMeters.length}
                </span>
                <span style={{ fontSize: '10px', color: '#64748b' }}>
                  {t('buildings.metersCount')}
                </span>
              </div>
              {hasSolar && (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    backgroundColor: '#fef3c7',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Zap size={16} color="#f59e0b" />
                  </div>
                  <span style={{ fontSize: '16px', fontWeight: '800', color: '#92400e' }}>
                    {buildingMeters.filter(m => m.meter_type === 'solar_meter').length}
                  </span>
                  <span style={{ fontSize: '10px', color: '#64748b' }}>
                    Solar
                  </span>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Energy badges below the card */}
      <EnergyBadges
        consumption={consumption.actualHouseConsumption}
        solarProduction={consumption.solarProduction}
        gridPower={consumption.gridPower}
        hasSolar={hasSolar}
        isMobile={isMobile}
      />
    </div>
  );
}
