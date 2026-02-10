import { useState } from 'react';
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
  onFloorReorder: (fromIndex: number, toIndex: number) => void;
  draggedFloorIdx: number | null;
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

function FloorDropZone({
  isActive,
  onDragOver,
  onDrop,
  isMobile
}: {
  isActive: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  isMobile: boolean;
}) {
  const [isHovered, setIsHovered] = useState(false);

  if (!isActive || isMobile) return null;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        setIsHovered(true);
        onDragOver(e);
      }}
      onDragLeave={() => setIsHovered(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsHovered(false);
        onDrop(e);
      }}
      style={{
        height: isHovered ? '8px' : '4px',
        margin: '2px 0',
        borderRadius: '4px',
        backgroundColor: isHovered ? '#667eea' : 'transparent',
        border: `2px dashed ${isHovered ? '#667eea' : '#667eea50'}`,
        transition: 'all 0.15s ease',
        position: 'relative'
      }}
    >
      {isHovered && (
        <div style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          backgroundColor: '#667eea',
          color: 'white',
          padding: '2px 10px',
          borderRadius: '10px',
          fontSize: '10px',
          fontWeight: '700',
          whiteSpace: 'nowrap',
          zIndex: 10,
          pointerEvents: 'none'
        }}>
          ↕
        </div>
      )}
    </div>
  );
}

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
  dragTypes,
  onFloorReorder,
  draggedFloorIdx
}: BuildingLayoutProps) {
  const { t } = useTranslation();
  const isDraggingFloor = dragType === dragTypes.EXISTING_FLOOR;

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
            gap: isDraggingFloor ? '0px' : (isMobile ? '16px' : '20px')
          }}>
            {floors.map((floor, floorIdx) => (
              <div key={floorIdx} style={{ position: 'relative' }}>
                {/* Drop zone ABOVE this floor (since column-reverse, this appears below visually) */}
                <FloorDropZone
                  isActive={isDraggingFloor && draggedFloorIdx !== null && draggedFloorIdx !== floorIdx && draggedFloorIdx !== floorIdx - 1}
                  onDragOver={(e) => { e.preventDefault(); }}
                  onDrop={() => {
                    if (draggedFloorIdx !== null) {
                      onFloorReorder(draggedFloorIdx, floorIdx);
                    }
                  }}
                  isMobile={isMobile}
                />
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
                  isDragged={draggedFloorIdx === floorIdx}
                />
                {/* Drop zone BELOW the last floor (at the top of the building visually) */}
                {floorIdx === floors.length - 1 && (
                  <FloorDropZone
                    isActive={isDraggingFloor && draggedFloorIdx !== null && draggedFloorIdx !== floors.length - 1}
                    onDragOver={(e) => { e.preventDefault(); }}
                    onDrop={() => {
                      if (draggedFloorIdx !== null) {
                        onFloorReorder(draggedFloorIdx, floors.length - 1);
                      }
                    }}
                    isMobile={isMobile}
                  />
                )}
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
