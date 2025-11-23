import { useState } from 'react';
import { Layers, Edit2, Trash2, Plus, Check, X, GripVertical } from 'lucide-react';
import { useTranslation } from '../../../../i18n';
import ApartmentChip from './ApartmentChip';
import type { FloorConfig } from '../../../../types';

interface FloorCardProps {
  floor: FloorConfig;
  floorIdx: number;
  dragType: string | null;
  onFloorDragStart: (e: React.DragEvent, floorIdx: number) => void;
  onApartmentDragStart: (e: React.DragEvent, floorIdx: number, aptIdx: number) => void;
  onDragEnd: () => void;
  onFloorDrop: (floorIdx: number, e: React.DragEvent) => void;
  allowDrop: (e: React.DragEvent) => void;
  removeFloor: (index: number) => void;
  updateFloorName: (index: number, name: string) => void;
  addApartmentToFloor: (floorIndex: number) => void;
  removeApartment: (floorIndex: number, apartmentIndex: number) => void;
  updateApartmentName: (floorIndex: number, aptIndex: number, name: string) => void;
  isMobile: boolean;
  dragTypes: {
    PALETTE_APT: string;
    EXISTING_FLOOR: string;
  };
}

export default function FloorCard({
  floor,
  floorIdx,
  dragType,
  onFloorDragStart,
  onApartmentDragStart,
  onDragEnd,
  onFloorDrop,
  allowDrop,
  removeFloor,
  updateFloorName,
  addApartmentToFloor,
  removeApartment,
  updateApartmentName,
  isMobile,
  dragTypes
}: FloorCardProps) {
  const { t } = useTranslation();
  const [editingFloor, setEditingFloor] = useState(false);
  const [editValue, setEditValue] = useState('');

  const startEditing = () => {
    setEditingFloor(true);
    setEditValue(floor.floor_name);
  };

  const saveEdit = () => {
    updateFloorName(floorIdx, editValue.trim() || floor.floor_name);
    setEditingFloor(false);
  };

  const cancelEdit = () => {
    setEditingFloor(false);
  };

  return (
    <div
      draggable={!isMobile}
      onDragStart={(e) => !isMobile && onFloorDragStart(e, floorIdx)}
      onDragEnd={onDragEnd}
      onDragOver={allowDrop}
      onDrop={(e) => onFloorDrop(floorIdx, e)}
      style={{
        padding: isMobile ? '16px' : '20px',
        backgroundColor: dragType ? '#f0f9ff' : '#f8fafc',
        borderRadius: '16px',
        border: `2px solid ${
          dragType === dragTypes.PALETTE_APT || dragType === dragTypes.EXISTING_FLOOR
            ? '#3b82f6'
            : '#e2e8f0'
        }`,
        boxShadow: '0 4px 6px rgba(0,0,0,0.05)',
        transition: 'all 0.2s',
        cursor: isMobile ? 'default' : 'move'
      }}
    >
      {/* Floor Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px',
        paddingBottom: '12px',
        borderBottom: '2px solid #e2e8f0',
        flexWrap: 'wrap',
        gap: '8px'
      }}>
        {editingFloor ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flex: 1,
            minWidth: '200px'
          }}>
            <input
              autoFocus
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  saveEdit();
                } else if (e.key === 'Escape') {
                  cancelEdit();
                }
              }}
              style={{
                flex: 1,
                padding: '8px 12px',
                border: '2px solid #3b82f6',
                borderRadius: '8px',
                fontSize: '15px',
                fontWeight: '600'
              }}
            />
            <button
              onClick={saveEdit}
              style={{
                padding: '8px',
                border: 'none',
                background: '#22c55e',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <Check size={16} color="white" />
            </button>
            <button
              onClick={cancelEdit}
              style={{
                padding: '8px',
                border: 'none',
                background: '#ef4444',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <X size={16} color="white" />
            </button>
          </div>
        ) : (
          <>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              flex: 1,
              minWidth: '150px'
            }}>
              {!isMobile && (
                <GripVertical size={20} color="#9ca3af" style={{ cursor: 'grab' }} />
              )}
              <Layers size={18} color="#3b82f6" />
              <span style={{
                fontSize: isMobile ? '14px' : '16px',
                fontWeight: '700',
                color: '#1f2937',
                wordBreak: 'break-word'
              }}>
                {floor.floor_name}
              </span>
              <button
                onClick={startEditing}
                style={{
                  padding: '6px',
                  border: 'none',
                  background: 'rgba(59, 130, 246, 0.1)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <Edit2 size={14} color="#3b82f6" />
              </button>
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              {isMobile && (
                <button
                  onClick={() => addApartmentToFloor(floorIdx)}
                  style={{
                    padding: '8px 12px',
                    border: 'none',
                    background: '#f59e0b',
                    color: 'white',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '12px',
                    fontWeight: '600'
                  }}
                >
                  <Plus size={14} />
                  {t('buildings.apartmentConfig.addApt')}
                </button>
              )}
              <div style={{
                padding: '4px 12px',
                backgroundColor: '#f3f4f6',
                borderRadius: '12px',
                fontSize: '12px',
                fontWeight: '600',
                color: '#6b7280'
              }}>
                {floor.apartments.length} {t('buildings.apartmentConfig.unitsLabel')}
              </div>
              <button
                onClick={() => removeFloor(floorIdx)}
                style={{
                  padding: '8px',
                  border: 'none',
                  background: 'rgba(239, 68, 68, 0.1)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <Trash2 size={16} color="#ef4444" />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Apartments Grid */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        {floor.apartments.map((apt, aptIdx) => (
          <ApartmentChip
            key={aptIdx}
            apartment={apt}
            floorIdx={floorIdx}
            aptIdx={aptIdx}
            onDragStart={onApartmentDragStart}
            onDragEnd={onDragEnd}
            removeApartment={removeApartment}
            updateApartmentName={updateApartmentName}
            isMobile={isMobile}
          />
        ))}
        {floor.apartments.length === 0 && (
          <div style={{
            width: '100%',
            padding: isMobile ? '16px' : '20px',
            textAlign: 'center',
            color: '#94a3b8',
            fontSize: '13px',
            fontStyle: 'italic',
            backgroundColor: '#f8fafc',
            borderRadius: '8px',
            border: '2px dashed #e2e8f0'
          }}>
            {isMobile
              ? t('buildings.apartmentConfig.tapAddApt')
              : t('buildings.apartmentConfig.dragHereHint')}
          </div>
        )}
      </div>
    </div>
  );
}