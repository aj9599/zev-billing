import { Building } from 'lucide-react';
import { useTranslation } from '../../../../i18n';
import FloorCard from './FloorCard';
import type { FloorConfig } from '../../../../types';

interface BuildingLayoutProps {
  floors: FloorConfig[];
  dragType: string | null;
  onBuildingDrop: (e: React.DragEvent) => void;
  onFloorDrop: (floorIdx: number, e: React.DragEvent) => void;
  onFloorDragStart: (e: React.DragEvent, floorIdx: number) => void;
  onApartmentDragStart: (e: React.DragEvent, floorIdx: number, aptIdx: number) => void;
  onDragEnd: () => void;
  allowDrop: (e: React.DragEvent) => void;
  removeFloor: (index: number) => void;
  updateFloorName: (index: number, name: string) => void;
  addApartmentToFloor: (floorIndex: number) => void;
  removeApartment: (floorIndex: number, apartmentIndex: number) => void;
  updateApartmentName: (floorIndex: number, aptIndex: number, name: string) => void;
  isMobile: boolean;
  dragTypes: {
    PALETTE_FLOOR: string;
    PALETTE_APT: string;
    EXISTING_FLOOR: string;
  };
}

const StudRow = ({ isMobile }: { isMobile: boolean }) => (
  <div style={{
    display: 'flex',
    gap: '6px',
    justifyContent: 'center',
    marginBottom: '4px'
  }}>
    {Array.from({ length: isMobile ? 6 : 8 }).map((_, i) => (
      <div
        key={i}
        style={{
          width: isMobile ? '8px' : '10px',
          height: isMobile ? '8px' : '10px',
          borderRadius: '50%',
          backgroundColor: 'rgba(255, 255, 255, 0.6)',
          border: '1px solid rgba(0, 0, 0, 0.1)',
          boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.1)'
        }}
      />
    ))}
  </div>
);

export default function BuildingLayout({
  floors,
  dragType,
  onBuildingDrop,
  onFloorDrop,
  onFloorDragStart,
  onApartmentDragStart,
  onDragEnd,
  allowDrop,
  removeFloor,
  updateFloorName,
  addApartmentToFloor,
  removeApartment,
  updateApartmentName,
  isMobile,
  dragTypes
}: BuildingLayoutProps) {
  const { t } = useTranslation();

  return (
    <div
      style={{
        backgroundColor: 'white',
        borderRadius: '16px',
        border: `3px dashed ${
          dragType === dragTypes.PALETTE_FLOOR ? '#22c55e' : '#e5e7eb'
        }`,
        padding: isMobile ? '16px' : '24px',
        minHeight: isMobile ? '300px' : '500px',
        position: 'relative',
        transition: 'all 0.3s',
        order: isMobile ? 1 : 2
      }}
      onDragOver={allowDrop}
      onDrop={onBuildingDrop}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        marginBottom: isMobile ? '16px' : '24px',
        paddingBottom: '16px',
        borderBottom: '2px solid #f3f4f6',
        flexWrap: 'wrap'
      }}>
        <Building size={20} color="#667eea" />
        <h3 style={{
          fontSize: isMobile ? '16px' : '20px',
          fontWeight: '700',
          color: '#1f2937',
          margin: 0
        }}>
          {t('buildings.apartmentConfig.buildingLayout')}
        </h3>
        {/* Mobile stats */}
        {isMobile && (
          <div style={{
            display: 'flex',
            gap: '12px',
            marginLeft: 'auto',
            fontSize: '12px'
          }}>
            <span style={{ color: '#3b82f6', fontWeight: '700' }}>
              {floors.length} {t('buildings.apartmentConfig.floorsLabel')}
            </span>
            <span style={{ color: '#f59e0b', fontWeight: '700' }}>
              {floors.reduce((sum, f) => sum + f.apartments.length, 0)}{' '}
              {t('buildings.apartmentConfig.apartmentsLabel')}
            </span>
          </div>
        )}
      </div>

      {floors.length === 0 ? (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: isMobile ? '250px' : '400px',
          gap: '16px'
        }}>
          <Building size={isMobile ? 48 : 64} color="#cbd5e1" />
          <p style={{
            fontSize: isMobile ? '14px' : '16px',
            color: '#64748b',
            textAlign: 'center',
            padding: '0 20px'
          }}>
            {t('buildings.apartmentConfig.noFloors')}
          </p>
          <p style={{
            fontSize: isMobile ? '12px' : '14px',
            color: '#94a3b8',
            textAlign: 'center',
            padding: '0 20px'
          }}>
            {isMobile
              ? t('buildings.apartmentConfig.tapAbove')
              : t('buildings.apartmentConfig.clickAddFloor')}
          </p>
        </div>
      ) : (
        <div style={{
          maxHeight: isMobile ? '500px' : '600px',
          overflowY: 'auto',
          paddingRight: isMobile ? '4px' : '8px'
        }}>
          <div style={{
            display: 'flex',
            flexDirection: 'column-reverse',
            gap: isMobile ? '16px' : '20px'
          }}>
            {floors.map((floor, floorIdx) => (
              <div key={floorIdx} style={{ position: 'relative' }}>
                <StudRow isMobile={isMobile} />
                <FloorCard
                  floor={floor}
                  floorIdx={floorIdx}
                  dragType={dragType}
                  onFloorDragStart={onFloorDragStart}
                  onApartmentDragStart={onApartmentDragStart}
                  onDragEnd={onDragEnd}
                  onFloorDrop={onFloorDrop}
                  allowDrop={allowDrop}
                  removeFloor={removeFloor}
                  updateFloorName={updateFloorName}
                  addApartmentToFloor={addApartmentToFloor}
                  removeApartment={removeApartment}
                  updateApartmentName={updateApartmentName}
                  isMobile={isMobile}
                  dragTypes={dragTypes}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Drop Hint Overlay */}
      {dragType === dragTypes.PALETTE_FLOOR && !isMobile && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          padding: '16px 32px',
          backgroundColor: 'rgba(34, 197, 94, 0.9)',
          color: 'white',
          borderRadius: '12px',
          fontSize: '16px',
          fontWeight: '700',
          boxShadow: '0 8px 16px rgba(0,0,0,0.2)',
          pointerEvents: 'none',
          zIndex: 100
        }}>
          {t('buildings.apartmentConfig.releaseToAdd')}
        </div>
      )}
    </div>
  );
}