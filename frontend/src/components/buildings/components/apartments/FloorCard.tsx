import { useState } from 'react';
import { Layers, Edit2, Trash2, Plus, Check, X, GripVertical, Triangle, ArrowDownCircle } from 'lucide-react';
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
  isDragged?: boolean;
}

const FLOOR_TYPE_STYLES = {
  attic: {
    bg: '#fffbeb',
    border: '#f59e0b',
    activeBg: '#fef3c7',
    iconColor: '#d97706',
    Icon: Triangle,
    badgeColor: '#92400e',
    badgeBg: '#fef3c7'
  },
  normal: {
    bg: '#f8fafc',
    border: '#e2e8f0',
    activeBg: '#f0f9ff',
    iconColor: '#3b82f6',
    Icon: Layers,
    badgeColor: '#1e40af',
    badgeBg: '#dbeafe'
  },
  underground: {
    bg: '#f3f4f6',
    border: '#d1d5db',
    activeBg: '#e5e7eb',
    iconColor: '#6b7280',
    Icon: ArrowDownCircle,
    badgeColor: '#374151',
    badgeBg: '#e5e7eb'
  }
};

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
  dragTypes,
  isDragged = false
}: FloorCardProps) {
  const { t } = useTranslation();
  const [editingFloor, setEditingFloor] = useState(false);
  const [editValue, setEditValue] = useState('');

  const floorType = floor.floor_type || 'normal';
  const styles = FLOOR_TYPE_STYLES[floorType] || FLOOR_TYPE_STYLES.normal;
  const FloorIcon = styles.Icon;

  // Only accept apartment drops on the floor card, not floor reorder drops
  const isApartmentDrop = dragType === dragTypes.PALETTE_APT || (dragType !== dragTypes.EXISTING_FLOOR && dragType !== null);
  const isFloorDrag = dragType === dragTypes.EXISTING_FLOOR;

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

  const floorTypeLabel = floorType === 'attic'
    ? t('buildings.apartmentConfig.attic')
    : floorType === 'underground'
      ? t('buildings.apartmentConfig.underground')
      : '';

  return (
    <div
      draggable={!isMobile}
      onDragStart={(e) => !isMobile && onFloorDragStart(e, floorIdx)}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        // Only allow apartment drops on the floor card itself
        if (!isFloorDrag) {
          allowDrop(e);
        }
      }}
      onDrop={(e) => {
        // Only handle apartment drops here; floor reorder is handled by FloorDropZone
        if (!isFloorDrag) {
          onFloorDrop(floorIdx, e);
        }
      }}
      style={{
        padding: isMobile ? '16px' : '20px',
        backgroundColor: isDragged ? '#e5e7eb' : (isApartmentDrop ? styles.activeBg : styles.bg),
        borderRadius: floorType === 'attic' ? '16px 16px 8px 8px' : floorType === 'underground' ? '8px 8px 16px 16px' : '16px',
        border: `2px solid ${
          isDragged ? '#667eea' : (
            isApartmentDrop ? styles.iconColor : styles.border
          )
        }`,
        boxShadow: isDragged ? '0 0 0 2px #667eea40' : '0 4px 6px rgba(0,0,0,0.05)',
        transition: 'all 0.2s',
        cursor: isMobile ? 'default' : 'grab',
        opacity: isDragged ? 0.5 : 1
      }}
    >
      {/* Floor Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px',
        paddingBottom: '12px',
        borderBottom: `2px solid ${styles.border}`,
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
                border: `2px solid ${styles.iconColor}`,
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
                <GripVertical size={20} color="#9ca3af" style={{ cursor: 'grab', flexShrink: 0 }} />
              )}
              <FloorIcon size={18} color={styles.iconColor} />
              <span style={{
                fontSize: isMobile ? '14px' : '16px',
                fontWeight: '700',
                color: '#1f2937',
                wordBreak: 'break-word'
              }}>
                {floor.floor_name}
              </span>
              {floorTypeLabel && (
                <span style={{
                  fontSize: '10px',
                  padding: '2px 8px',
                  backgroundColor: styles.badgeBg,
                  color: styles.badgeColor,
                  borderRadius: '4px',
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  {floorTypeLabel}
                </span>
              )}
              <button
                onClick={startEditing}
                style={{
                  padding: '6px',
                  border: 'none',
                  background: `${styles.iconColor}15`,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <Edit2 size={14} color={styles.iconColor} />
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
                backgroundColor: styles.badgeBg,
                borderRadius: '12px',
                fontSize: '12px',
                fontWeight: '600',
                color: styles.badgeColor
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
            backgroundColor: styles.bg,
            borderRadius: '8px',
            border: `2px dashed ${styles.border}`
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
