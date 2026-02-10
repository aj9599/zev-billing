import { Sun, Triangle, Home } from 'lucide-react';
import { useTranslation } from '../../../../i18n';

interface RoofSectionProps {
  hasSolar: boolean;
  atticApartments: string[];
  isMobile: boolean;
}

export default function RoofSection({ hasSolar, atticApartments, isMobile }: RoofSectionProps) {
  const { t } = useTranslation();
  const hasAttic = atticApartments.length > 0;

  return (
    <div style={{
      width: '100%',
      padding: isMobile ? '12px' : '16px',
      backgroundColor: '#fffbeb',
      borderBottom: '2px solid #f59e0b',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px'
    }}>
      {/* Roof header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <div style={{
            width: '28px',
            height: '28px',
            borderRadius: '8px',
            backgroundColor: '#fef3c7',
            border: '1px solid #fbbf24',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Triangle size={14} color="#d97706" />
          </div>
          <span style={{
            fontSize: isMobile ? '11px' : '12px',
            fontWeight: '700',
            color: '#92400e',
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}>
            {hasAttic ? t('buildings.apartmentConfig.attic') : (hasSolar ? t('buildings.visualization.solarRoof') : t('buildings.visualization.roof'))}
          </span>
        </div>

        {/* Sun badge */}
        {hasSolar && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 10px',
            backgroundColor: 'white',
            borderRadius: '20px',
            border: '1px solid #fbbf24',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
          }}>
            <div style={{
              width: isMobile ? '20px' : '24px',
              height: isMobile ? '20px' : '24px',
              borderRadius: '50%',
              backgroundColor: '#fbbf24',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 12px rgba(251, 191, 36, 0.5)',
              animation: 'sunPulse 3s ease-in-out infinite'
            }}>
              <Sun size={isMobile ? 12 : 14} color="#fff" />
            </div>
            <span style={{
              fontSize: isMobile ? '10px' : '11px',
              fontWeight: '700',
              color: '#d97706'
            }}>
              Solar
            </span>
          </div>
        )}
      </div>

      {/* Solar panel grid */}
      {hasSolar && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${isMobile ? 4 : 6}, 1fr)`,
          gap: '3px',
          padding: '6px',
          backgroundColor: 'rgba(217, 119, 6, 0.08)',
          borderRadius: '8px',
          border: '1px dashed #fbbf24'
        }}>
          {Array.from({ length: isMobile ? 8 : 12 }).map((_, i) => (
            <div key={i} style={{
              height: isMobile ? '8px' : '10px',
              backgroundColor: '#3b82f6',
              borderRadius: '2px',
              opacity: 0.3
            }} />
          ))}
        </div>
      )}

      {/* Attic apartments as chips (same style as builder) */}
      {hasAttic && (
        <div style={{
          display: 'flex',
          gap: '6px',
          flexWrap: 'wrap'
        }}>
          {atticApartments.slice(0, isMobile ? 3 : 5).map((apt, i) => (
            <div key={i} style={{
              padding: '4px 10px',
              backgroundColor: '#fef3c7',
              borderRadius: '8px',
              border: '1px solid #fbbf24',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
            }}>
              <Home size={isMobile ? 9 : 10} color="#92400e" />
              <span style={{
                fontSize: isMobile ? '10px' : '11px',
                fontWeight: '700',
                color: '#92400e',
                whiteSpace: 'nowrap'
              }}>
                {apt}
              </span>
            </div>
          ))}
          {atticApartments.length > (isMobile ? 3 : 5) && (
            <div style={{
              padding: '4px 10px',
              backgroundColor: '#fef3c780',
              borderRadius: '8px',
              fontSize: isMobile ? '10px' : '11px',
              color: '#92400e',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center'
            }}>
              +{atticApartments.length - (isMobile ? 3 : 5)}
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes sunPulse {
          0%, 100% { box-shadow: 0 0 12px rgba(251, 191, 36, 0.5); }
          50% { box-shadow: 0 0 20px rgba(251, 191, 36, 0.8); }
        }
      `}</style>
    </div>
  );
}
