import { Layers, ArrowDownCircle, Home } from 'lucide-react';
import type { FloorConfig, FloorType } from '../../../../types';

interface FloorSectionProps {
  floor: FloorConfig;
  isLast: boolean;
  isMobile: boolean;
}

const FLOOR_STYLES: Record<FloorType | string, {
  bg: string;
  border: string;
  iconColor: string;
  labelColor: string;
  aptBg: string;
  aptBorder: string;
  aptText: string;
  Icon: typeof Layers;
}> = {
  normal: {
    bg: '#f8fafc',
    border: '#e2e8f0',
    iconColor: '#3b82f6',
    labelColor: '#64748b',
    aptBg: '#fef3c7',
    aptBorder: '#fbbf24',
    aptText: '#92400e',
    Icon: Layers
  },
  underground: {
    bg: '#f3f4f6',
    border: '#d1d5db',
    iconColor: '#6b7280',
    labelColor: '#4b5563',
    aptBg: '#e5e7eb',
    aptBorder: '#9ca3af',
    aptText: '#374151',
    Icon: ArrowDownCircle
  }
};

export default function FloorSection({ floor, isLast, isMobile }: FloorSectionProps) {
  const floorType = (floor.floor_type || 'normal') as string;
  const styles = FLOOR_STYLES[floorType] || FLOOR_STYLES.normal;
  const FloorIcon = styles.Icon;

  return (
    <div style={{
      width: '100%',
      padding: isMobile ? '10px 12px' : '12px 16px',
      backgroundColor: styles.bg,
      borderLeft: `2px solid ${styles.border}`,
      borderRight: `2px solid ${styles.border}`,
      borderBottom: `1px solid ${styles.border}`,
      borderRadius: isLast ? '0 0 12px 12px' : '0',
      ...(isLast ? { borderBottom: `2px solid ${styles.border}` } : {}),
      display: 'flex',
      alignItems: 'center',
      gap: isMobile ? '8px' : '12px'
    }}>
      {/* Floor icon + label */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        minWidth: isMobile ? '60px' : '80px',
        flexShrink: 0
      }}>
        <FloorIcon size={isMobile ? 12 : 14} color={styles.iconColor} />
        <span style={{
          fontSize: isMobile ? '10px' : '11px',
          fontWeight: '600',
          color: styles.labelColor,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: isMobile ? '50px' : '70px'
        }}>
          {floor.floor_name}
        </span>
      </div>

      {/* Apartment chips */}
      <div style={{
        display: 'flex',
        gap: isMobile ? '4px' : '6px',
        flex: 1,
        flexWrap: 'wrap',
        overflow: 'hidden'
      }}>
        {floor.apartments.slice(0, isMobile ? 3 : 5).map((apt, i) => (
          <div key={i} style={{
            padding: isMobile ? '3px 8px' : '4px 10px',
            backgroundColor: styles.aptBg,
            borderRadius: '8px',
            border: `1px solid ${styles.aptBorder}`,
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
          }}>
            <Home size={isMobile ? 9 : 10} color={styles.aptText} />
            <span style={{
              fontSize: isMobile ? '9px' : '10px',
              fontWeight: '700',
              color: styles.aptText,
              whiteSpace: 'nowrap'
            }}>
              {apt}
            </span>
          </div>
        ))}
        {floor.apartments.length > (isMobile ? 3 : 5) && (
          <div style={{
            padding: isMobile ? '3px 8px' : '4px 10px',
            backgroundColor: `${styles.aptBg}80`,
            borderRadius: '8px',
            fontSize: isMobile ? '9px' : '10px',
            color: styles.labelColor,
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center'
          }}>
            +{floor.apartments.length - (isMobile ? 3 : 5)}
          </div>
        )}
        {floor.apartments.length === 0 && (
          <span style={{
            fontSize: isMobile ? '9px' : '10px',
            color: '#94a3b8',
            fontStyle: 'italic'
          }}>
            ---
          </span>
        )}
      </div>

      {/* Apartment count badge */}
      <div style={{
        padding: '2px 8px',
        backgroundColor: styles.aptBg,
        borderRadius: '10px',
        fontSize: isMobile ? '9px' : '10px',
        fontWeight: '700',
        color: styles.aptText,
        whiteSpace: 'nowrap',
        flexShrink: 0
      }}>
        {floor.apartments.length}
      </div>
    </div>
  );
}
