import { useState } from 'react';
import { Home, Edit2, X, Check } from 'lucide-react';

interface ApartmentChipProps {
  apartment: string;
  floorIdx: number;
  aptIdx: number;
  onDragStart: (e: React.DragEvent, floorIdx: number, aptIdx: number) => void;
  onDragEnd: () => void;
  removeApartment: (floorIdx: number, aptIdx: number) => void;
  updateApartmentName: (floorIdx: number, aptIdx: number, name: string) => void;
  isMobile: boolean;
}

export default function ApartmentChip({
  apartment,
  floorIdx,
  aptIdx,
  onDragStart,
  onDragEnd,
  removeApartment,
  updateApartmentName,
  isMobile
}: ApartmentChipProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

  const startEditing = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditing(true);
    setEditValue(apartment);
  };

  const saveEdit = () => {
    updateApartmentName(floorIdx, aptIdx, editValue.trim() || apartment);
    setEditing(false);
  };

  const cancelEdit = () => {
    setEditing(false);
  };

  return (
    <div
      draggable={!isMobile && !editing}
      onDragStart={(e) => !isMobile && onDragStart(e, floorIdx, aptIdx)}
      onDragEnd={onDragEnd}
      style={{
        padding: isMobile ? '12px' : '14px',
        backgroundColor: '#fef3c7',
        borderRadius: '12px',
        border: '2px solid #fbbf24',
        cursor: isMobile || editing ? 'default' : 'grab',
        transition: 'all 0.2s',
        boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
        userSelect: 'none',
        minWidth: 'fit-content',
        maxWidth: '200px'
      }}
    >
      {editing ? (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
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
              padding: '4px 8px',
              border: '2px solid #f59e0b',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: '600'
            }}
          />
          <button
            onClick={saveEdit}
            style={{
              padding: '4px',
              border: 'none',
              background: 'white',
              borderRadius: '4px',
              cursor: 'pointer',
              display: 'flex'
            }}
          >
            <Check size={12} color="#22c55e" />
          </button>
        </div>
      ) : (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            flex: 1,
            minWidth: 0
          }}>
            <Home size={14} color="#f59e0b" />
            <span style={{
              fontSize: '13px',
              fontWeight: '700',
              color: '#92400e',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              {apartment}
            </span>
          </div>
          <div style={{
            display: 'flex',
            gap: '4px',
            flexShrink: 0
          }}>
            <button
              onClick={startEditing}
              style={{
                padding: '4px',
                border: 'none',
                background: 'rgba(255, 255, 255, 0.6)',
                borderRadius: '4px',
                cursor: 'pointer',
                display: 'flex'
              }}
            >
              <Edit2 size={11} color="#f59e0b" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeApartment(floorIdx, aptIdx);
              }}
              style={{
                padding: '4px',
                border: 'none',
                background: 'rgba(239, 68, 68, 0.2)',
                borderRadius: '4px',
                cursor: 'pointer',
                display: 'flex'
              }}
            >
              <X size={11} color="#ef4444" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}