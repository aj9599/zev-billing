import type { FloorConfig, FloorType } from '../../../../types';

interface FloorSectionProps {
  floor: FloorConfig;
  isFirst: boolean;
  isLast: boolean;
  isMobile: boolean;
}

const FLOOR_COLORS: Record<FloorType | string, { wall: string; windowBg: string; windowBorder: string; windowGlow: string; text: string }> = {
  normal: {
    wall: '#fefce8',
    windowBg: '#fffbeb',
    windowBorder: '#d97706',
    windowGlow: 'rgba(251, 191, 36, 0.3)',
    text: '#92400e'
  },
  underground: {
    wall: '#6b7280',
    windowBg: '#9ca3af',
    windowBorder: '#4b5563',
    windowGlow: 'rgba(107, 114, 128, 0.2)',
    text: '#e5e7eb'
  }
};

export default function FloorSection({ floor, isFirst, isLast, isMobile }: FloorSectionProps) {
  const floorType = (floor.floor_type || 'normal') as string;
  const colors = FLOOR_COLORS[floorType] || FLOOR_COLORS.normal;
  const isUnderground = floorType === 'underground';
  const floorHeight = isMobile ? 48 : 60;

  return (
    <div style={{
      width: '90%',
      margin: '0 auto',
      height: `${floorHeight}px`,
      backgroundColor: colors.wall,
      borderLeft: `3px solid ${isUnderground ? '#4b5563' : '#d97706'}`,
      borderRight: `3px solid ${isUnderground ? '#4b5563' : '#d97706'}`,
      borderTop: isFirst ? `2px solid ${isUnderground ? '#4b5563' : '#d97706'}` : 'none',
      borderBottom: isLast ? `3px solid ${isUnderground ? '#374151' : '#92400e'}` : `1px solid ${isUnderground ? '#4b556340' : '#d9770640'}`,
      display: 'flex',
      alignItems: 'center',
      padding: isMobile ? '4px 8px' : '6px 12px',
      gap: isMobile ? '4px' : '8px',
      position: 'relative',
      ...(isUnderground ? {
        backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(75, 85, 99, 0.1) 5px, rgba(75, 85, 99, 0.1) 6px)'
      } : {})
    }}>
      {/* Floor label */}
      <div style={{
        fontSize: isMobile ? '8px' : '10px',
        fontWeight: '700',
        color: colors.text,
        minWidth: isMobile ? '28px' : '40px',
        textAlign: 'center',
        opacity: 0.8,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
      }}>
        {floor.floor_name.length > 8 ? floor.floor_name.substring(0, 6) + '..' : floor.floor_name}
      </div>

      {/* Apartment windows */}
      <div style={{
        display: 'flex',
        gap: isMobile ? '3px' : '5px',
        flex: 1,
        flexWrap: 'wrap',
        justifyContent: 'center',
        overflow: 'hidden'
      }}>
        {floor.apartments.slice(0, isMobile ? 4 : 6).map((apt, i) => (
          <div key={i} style={{
            width: isMobile ? '28px' : '36px',
            height: isMobile ? '28px' : '36px',
            backgroundColor: colors.windowBg,
            border: `2px solid ${colors.windowBorder}`,
            borderRadius: '3px 3px 0 0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `inset 0 0 8px ${colors.windowGlow}`,
            position: 'relative'
          }}>
            <span style={{
              fontSize: isMobile ? '6px' : '7px',
              fontWeight: '600',
              color: colors.text,
              textAlign: 'center',
              lineHeight: 1.1,
              overflow: 'hidden',
              maxWidth: '100%'
            }}>
              {apt.replace('Apt ', '')}
            </span>
            {/* Window cross */}
            <div style={{
              position: 'absolute',
              top: '50%',
              left: 0,
              right: 0,
              height: '1px',
              backgroundColor: `${colors.windowBorder}40`
            }} />
            <div style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: '50%',
              width: '1px',
              backgroundColor: `${colors.windowBorder}40`
            }} />
          </div>
        ))}
        {floor.apartments.length > (isMobile ? 4 : 6) && (
          <div style={{
            width: isMobile ? '28px' : '36px',
            height: isMobile ? '28px' : '36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: isMobile ? '8px' : '9px',
            color: colors.text,
            fontWeight: '600'
          }}>
            +{floor.apartments.length - (isMobile ? 4 : 6)}
          </div>
        )}
        {floor.apartments.length === 0 && (
          <div style={{
            fontSize: isMobile ? '8px' : '9px',
            color: `${colors.text}80`,
            fontStyle: 'italic'
          }}>
            ---
          </div>
        )}
      </div>
    </div>
  );
}
