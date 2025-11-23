import { useState } from 'react';
import { useTranslation } from '../../../../i18n';
import ApartmentPalette from './ApartmentPalette';
import BuildingLayout from './BuildingLayout';
import type { Building as BuildingType } from '../../../../types';

interface LegoApartmentBuilderProps {
  formData: Partial<BuildingType>;
  setFormData: (data: Partial<BuildingType>) => void;
  isMobile: boolean;
}

const DRAG_TYPES = {
  PALETTE_FLOOR: 'palette/floor',
  PALETTE_APT: 'palette/apartment',
  EXISTING_APT: 'existing/apartment',
  EXISTING_FLOOR: 'existing/floor',
};

export default function LegoApartmentBuilder({
  formData,
  setFormData,
  isMobile
}: LegoApartmentBuilderProps) {
  const { t } = useTranslation();
  const [dragType, setDragType] = useState<string | null>(null);
  const [dragData, setDragData] = useState<any>(null);

  const addFloor = () => {
    const floors = formData.floors_config || [];
    const newFloorNumber = floors.length + 1;
    setFormData({
      ...formData,
      floors_config: [
        {
          floor_number: newFloorNumber,
          floor_name: `${t('buildings.floor')} ${newFloorNumber}`,
          apartments: []
        },
        ...floors
      ]
    });
  };

  const removeFloor = (index: number) => {
    const floors = formData.floors_config || [];
    setFormData({
      ...formData,
      floors_config: floors.filter((_, i) => i !== index)
    });
  };

  const updateFloorName = (index: number, name: string) => {
    const floors = [...(formData.floors_config || [])];
    floors[index] = { ...floors[index], floor_name: name };
    setFormData({ ...formData, floors_config: floors });
  };

  const addApartmentToFloor = (floorIndex: number) => {
    const floors = [...(formData.floors_config || [])];
    const newAptName = `Apt ${Math.floor(Math.random() * 90) + 10}`;
    floors[floorIndex].apartments = [...floors[floorIndex].apartments, newAptName];
    setFormData({ ...formData, floors_config: floors });
  };

  const removeApartment = (floorIndex: number, apartmentIndex: number) => {
    const floors = [...(formData.floors_config || [])];
    floors[floorIndex].apartments = floors[floorIndex].apartments.filter(
      (_, i) => i !== apartmentIndex
    );
    setFormData({ ...formData, floors_config: floors });
  };

  const moveApartment = (fromFloorIdx: number, aptIdx: number, toFloorIdx: number) => {
    const floors = [...(formData.floors_config || [])];
    const apt = floors[fromFloorIdx].apartments[aptIdx];
    floors[fromFloorIdx].apartments = floors[fromFloorIdx].apartments.filter(
      (_, i) => i !== aptIdx
    );
    floors[toFloorIdx].apartments = [...floors[toFloorIdx].apartments, apt];
    setFormData({ ...formData, floors_config: floors });
  };

  const updateApartmentName = (floorIndex: number, aptIndex: number, name: string) => {
    const floors = [...(formData.floors_config || [])];
    floors[floorIndex].apartments[aptIndex] = name;
    setFormData({ ...formData, floors_config: floors });
  };

  const reorderFloors = (fromIndex: number, toIndex: number) => {
    const floors = [...(formData.floors_config || [])];
    const [movedFloor] = floors.splice(fromIndex, 1);
    floors.splice(toIndex, 0, movedFloor);
    setFormData({ ...formData, floors_config: floors });
  };

  const onPaletteDragStart = (e: React.DragEvent, type: string) => {
    e.dataTransfer.effectAllowed = 'copy';
    setDragType(type);
  };

  const onFloorDragStart = (e: React.DragEvent, floorIdx: number) => {
    e.dataTransfer.effectAllowed = 'move';
    setDragType(DRAG_TYPES.EXISTING_FLOOR);
    setDragData({ floorIdx });
  };

  const onApartmentDragStart = (e: React.DragEvent, floorIdx: number, aptIdx: number) => {
    e.dataTransfer.effectAllowed = 'move';
    setDragType(DRAG_TYPES.EXISTING_APT);
    setDragData({ floorIdx, aptIdx });
  };

  const onDragEndGlobal = () => {
    setDragType(null);
    setDragData(null);
  };

  const onBuildingDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (dragType === DRAG_TYPES.PALETTE_FLOOR) {
      addFloor();
    }
    onDragEndGlobal();
  };

  const onFloorDrop = (floorIdx: number, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (dragType === DRAG_TYPES.PALETTE_APT) {
      addApartmentToFloor(floorIdx);
    } else if (dragType === DRAG_TYPES.EXISTING_APT && dragData) {
      if (dragData.floorIdx !== floorIdx) {
        moveApartment(dragData.floorIdx, dragData.aptIdx, floorIdx);
      }
    } else if (dragType === DRAG_TYPES.EXISTING_FLOOR && dragData) {
      if (dragData.floorIdx !== floorIdx) {
        reorderFloors(dragData.floorIdx, floorIdx);
      }
    }
    onDragEndGlobal();
  };

  const allowDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  return (
    <div style={{
      marginTop: '24px',
      display: 'grid',
      gridTemplateColumns: isMobile ? '1fr' : '280px 1fr',
      gap: '24px',
      minHeight: isMobile ? 'auto' : '500px'
    }}>
      {/* Palette Sidebar */}
      <ApartmentPalette
        onPaletteDragStart={onPaletteDragStart}
        onDragEnd={onDragEndGlobal}
        onAddFloor={addFloor}
        floorsCount={(formData.floors_config || []).length}
        apartmentsCount={(formData.floors_config || []).reduce(
          (sum, f) => sum + f.apartments.length,
          0
        )}
        isMobile={isMobile}
        dragTypes={DRAG_TYPES}
      />

      {/* Building Area */}
      <BuildingLayout
        floors={formData.floors_config || []}
        dragType={dragType}
        onBuildingDrop={onBuildingDrop}
        onFloorDrop={onFloorDrop}
        onFloorDragStart={onFloorDragStart}
        onApartmentDragStart={onApartmentDragStart}
        onDragEnd={onDragEndGlobal}
        allowDrop={allowDrop}
        removeFloor={removeFloor}
        updateFloorName={updateFloorName}
        addApartmentToFloor={addApartmentToFloor}
        removeApartment={removeApartment}
        updateApartmentName={updateApartmentName}
        isMobile={isMobile}
        dragTypes={DRAG_TYPES}
      />
    </div>
  );
}