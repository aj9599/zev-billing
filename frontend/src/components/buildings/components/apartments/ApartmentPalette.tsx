import { Layers, Home, Triangle, ArrowDownCircle } from 'lucide-react';
import { useTranslation } from '../../../../i18n';
import type { FloorType } from '../../../../types';

interface ApartmentPaletteProps {
  onPaletteDragStart: (e: React.DragEvent, type: string, floorType?: FloorType) => void;
  onDragEnd: () => void;
  onAddFloor: (floorType: FloorType) => void;
  floorsCount: number;
  apartmentsCount: number;
  isMobile: boolean;
  dragTypes: {
    PALETTE_FLOOR: string;
    PALETTE_APT: string;
  };
}

const FLOOR_ITEMS: { type: FloorType; icon: typeof Layers; color: string; bgColor: string }[] = [
  { type: 'attic', icon: Triangle, color: '#d97706', bgColor: '#fef3c7' },
  { type: 'normal', icon: Layers, color: '#3b82f6', bgColor: '#dbeafe' },
  { type: 'underground', icon: ArrowDownCircle, color: '#6b7280', bgColor: '#f3f4f6' },
];

export default function ApartmentPalette({
  onPaletteDragStart,
  onDragEnd,
  onAddFloor,
  floorsCount,
  apartmentsCount,
  isMobile,
  dragTypes
}: ApartmentPaletteProps) {
  const { t } = useTranslation();

  const floorTypeLabels: Record<FloorType, string> = {
    attic: t('buildings.apartmentConfig.attic'),
    normal: t('buildings.apartmentConfig.normalFloor'),
    underground: t('buildings.apartmentConfig.underground'),
  };

  const floorTypeDragLabels: Record<FloorType, string> = {
    attic: t('buildings.apartmentConfig.dragAttic'),
    normal: t('buildings.apartmentConfig.dragNormal'),
    underground: t('buildings.apartmentConfig.dragUnderground'),
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: isMobile ? 'row' : 'column',
      gap: isMobile ? '8px' : '12px',
      order: isMobile ? 2 : 1,
      flexWrap: isMobile ? 'wrap' : 'nowrap'
    }}>
      {/* Floor Type Palette Items */}
      {FLOOR_ITEMS.map(({ type, icon: Icon, color, bgColor }) => (
        <div
          key={type}
          draggable={!isMobile}
          onDragStart={(e) => !isMobile && onPaletteDragStart(e, dragTypes.PALETTE_FLOOR, type)}
          onDragEnd={onDragEnd}
          onClick={() => isMobile && onAddFloor(type)}
          style={{
            cursor: isMobile ? 'pointer' : 'grab',
            padding: isMobile ? '12px' : '16px',
            backgroundColor: 'white',
            borderRadius: '12px',
            border: `2px solid ${color}20`,
            boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
            transition: 'all 0.2s',
            userSelect: 'none',
            flex: isMobile ? '1 1 30%' : 'none',
            minWidth: isMobile ? '90px' : 'auto'
          }}
          onMouseDown={(e) => !isMobile && (e.currentTarget.style.cursor = 'grabbing')}
          onMouseUp={(e) => !isMobile && (e.currentTarget.style.cursor = 'grab')}
        >
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            flexDirection: isMobile ? 'column' : 'row'
          }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              backgroundColor: bgColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <Icon size={20} color={color} />
            </div>
            <div style={{ flex: 1, textAlign: isMobile ? 'center' : 'left' }}>
              <div style={{
                fontWeight: '700',
                fontSize: isMobile ? '12px' : '14px',
                color: '#1f2937'
              }}>
                {floorTypeLabels[type]}
              </div>
              {!isMobile && (
                <div style={{ fontSize: '11px', color: '#6b7280' }}>
                  {floorTypeDragLabels[type]}
                </div>
              )}
            </div>
          </div>
        </div>
      ))}

      {/* Apartment Palette */}
      <div
        draggable={!isMobile}
        onDragStart={(e) => !isMobile && onPaletteDragStart(e, dragTypes.PALETTE_APT)}
        onDragEnd={onDragEnd}
        style={{
          cursor: isMobile ? 'default' : 'grab',
          padding: isMobile ? '12px' : '16px',
          backgroundColor: 'white',
          borderRadius: '12px',
          border: '2px solid rgba(251, 191, 36, 0.13)',
          boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
          transition: 'all 0.2s',
          userSelect: 'none',
          flex: isMobile ? '1 1 30%' : 'none',
          minWidth: isMobile ? '90px' : 'auto'
        }}
        onMouseDown={(e) => !isMobile && (e.currentTarget.style.cursor = 'grabbing')}
        onMouseUp={(e) => !isMobile && (e.currentTarget.style.cursor = 'grab')}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          flexDirection: isMobile ? 'column' : 'row'
        }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            backgroundColor: '#fef3c7',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <Home size={20} color="#f59e0b" />
          </div>
          <div style={{ flex: 1, textAlign: isMobile ? 'center' : 'left' }}>
            <div style={{
              fontWeight: '700',
              fontSize: isMobile ? '12px' : '14px',
              color: '#1f2937'
            }}>
              {t('buildings.apartmentConfig.paletteApartment')}
            </div>
            {!isMobile && (
              <div style={{ fontSize: '11px', color: '#6b7280' }}>
                {t('buildings.apartmentConfig.dragToFloor')}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats - desktop only */}
      {!isMobile && (
        <div style={{
          padding: '16px',
          backgroundColor: 'white',
          borderRadius: '12px',
          border: '2px dashed #e5e7eb'
        }}>
          <div style={{
            fontSize: '13px',
            fontWeight: '600',
            color: '#6b7280',
            marginBottom: '12px'
          }}>
            {t('buildings.apartmentConfig.buildingStats')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <span style={{ fontSize: '12px', color: '#6b7280' }}>
                {t('buildings.apartmentConfig.floorsLabel')}
              </span>
              <span style={{
                fontSize: '16px',
                fontWeight: '700',
                color: '#3b82f6'
              }}>
                {floorsCount}
              </span>
            </div>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <span style={{ fontSize: '12px', color: '#6b7280' }}>
                {t('buildings.apartmentConfig.apartmentsLabel')}
              </span>
              <span style={{
                fontSize: '16px',
                fontWeight: '700',
                color: '#f59e0b'
              }}>
                {apartmentsCount}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Instructions - desktop only */}
      {!isMobile && (
        <div style={{
          padding: '16px',
          backgroundColor: '#fffbeb',
          borderRadius: '12px',
          border: '1px solid #fef3c7'
        }}>
          <div style={{
            fontSize: '11px',
            color: '#92400e',
            lineHeight: '1.6'
          }}>
            <strong>{t('buildings.apartmentConfig.tips')}</strong><br />
            {t('buildings.apartmentConfig.tip1')}<br />
            {t('buildings.apartmentConfig.tip2')}<br />
            {t('buildings.apartmentConfig.tip3')}<br />
            {t('buildings.apartmentConfig.tip4')}<br />
            {t('buildings.apartmentConfig.tip5')}
          </div>
        </div>
      )}
    </div>
  );
}
