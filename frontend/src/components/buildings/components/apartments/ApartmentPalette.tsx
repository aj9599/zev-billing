import { Layers, Home } from 'lucide-react';
import { useTranslation } from '../../../../i18n';

interface ApartmentPaletteProps {
  onPaletteDragStart: (e: React.DragEvent, type: string) => void;
  onDragEnd: () => void;
  onAddFloor: () => void;
  floorsCount: number;
  apartmentsCount: number;
  isMobile: boolean;
  dragTypes: {
    PALETTE_FLOOR: string;
    PALETTE_APT: string;
  };
}

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

  return (
    <div style={{
      display: 'flex',
      flexDirection: isMobile ? 'row' : 'column',
      gap: '16px',
      order: isMobile ? 2 : 1
    }}>
      {/* Floor Palette */}
      <div
        draggable={!isMobile}
        onDragStart={(e) => !isMobile && onPaletteDragStart(e, dragTypes.PALETTE_FLOOR)}
        onDragEnd={onDragEnd}
        onClick={() => isMobile && onAddFloor()}
        style={{
          cursor: isMobile ? 'pointer' : 'grab',
          padding: isMobile ? '16px' : '20px',
          backgroundColor: 'white',
          borderRadius: '12px',
          border: '2px solid #e5e7eb',
          boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
          transition: 'all 0.2s',
          userSelect: 'none',
          flex: isMobile ? 1 : 'none'
        }}
        onMouseDown={(e) => !isMobile && (e.currentTarget.style.cursor = 'grabbing')}
        onMouseUp={(e) => !isMobile && (e.currentTarget.style.cursor = 'grab')}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '8px',
          flexDirection: isMobile ? 'column' : 'row'
        }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '8px',
            backgroundColor: '#dbeafe',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Layers size={24} color="#3b82f6" />
          </div>
          <div style={{ flex: 1, textAlign: isMobile ? 'center' : 'left' }}>
            <div style={{
              fontWeight: '700',
              fontSize: isMobile ? '14px' : '16px',
              color: '#1f2937'
            }}>
              {t('buildings.apartmentConfig.paletteFloor')}
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>
              {isMobile
                ? t('buildings.apartmentConfig.tapToAdd')
                : t('buildings.apartmentConfig.dragToBuilding')}
            </div>
          </div>
        </div>
      </div>

      {/* Apartment Palette */}
      <div
        draggable={!isMobile}
        onDragStart={(e) => !isMobile && onPaletteDragStart(e, dragTypes.PALETTE_APT)}
        onDragEnd={onDragEnd}
        style={{
          cursor: isMobile ? 'default' : 'grab',
          padding: isMobile ? '16px' : '20px',
          backgroundColor: 'white',
          borderRadius: '12px',
          border: '2px solid #e5e7eb',
          boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
          transition: 'all 0.2s',
          userSelect: 'none',
          flex: isMobile ? 1 : 'none'
        }}
        onMouseDown={(e) => !isMobile && (e.currentTarget.style.cursor = 'grabbing')}
        onMouseUp={(e) => !isMobile && (e.currentTarget.style.cursor = 'grab')}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '8px',
          flexDirection: isMobile ? 'column' : 'row'
        }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '8px',
            backgroundColor: '#fef3c7',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Home size={24} color="#f59e0b" />
          </div>
          <div style={{ flex: 1, textAlign: isMobile ? 'center' : 'left' }}>
            <div style={{
              fontWeight: '700',
              fontSize: isMobile ? '14px' : '16px',
              color: '#1f2937'
            }}>
              {t('buildings.apartmentConfig.paletteApartment')}
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>
              {isMobile
                ? t('buildings.apartmentConfig.useFloorButton')
                : t('buildings.apartmentConfig.dragToFloor')}
            </div>
          </div>
        </div>
      </div>

      {/* Stats - hide on mobile in palette area */}
      {!isMobile && (
        <>
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

          {/* Instructions */}
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
        </>
      )}
    </div>
  );
}