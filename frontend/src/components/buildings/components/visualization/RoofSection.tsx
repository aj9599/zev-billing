import { Sun, Triangle } from 'lucide-react';
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
      background: hasSolar
        ? 'linear-gradient(135deg, #1e3a5f 0%, #1e40af 100%)'
        : 'linear-gradient(135deg, #78350f 0%, #92400e 100%)',
      borderRadius: '16px 16px 0 0',
      position: 'relative',
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
          <Triangle size={isMobile ? 14 : 16} color="rgba(255,255,255,0.8)" />
          <span style={{
            fontSize: isMobile ? '11px' : '12px',
            fontWeight: '600',
            color: 'rgba(255,255,255,0.9)',
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
            backgroundColor: 'rgba(251, 191, 36, 0.2)',
            borderRadius: '20px',
            border: '1px solid rgba(251, 191, 36, 0.4)'
          }}>
            <div style={{
              width: isMobile ? '20px' : '24px',
              height: isMobile ? '20px' : '24px',
              borderRadius: '50%',
              backgroundColor: '#fbbf24',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 12px rgba(251, 191, 36, 0.6)',
              animation: 'sunPulse 3s ease-in-out infinite'
            }}>
              <Sun size={isMobile ? 12 : 14} color="#fff" />
            </div>
            <span style={{
              fontSize: isMobile ? '10px' : '11px',
              fontWeight: '700',
              color: '#fbbf24'
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
          padding: '4px'
        }}>
          {Array.from({ length: isMobile ? 8 : 12 }).map((_, i) => (
            <div key={i} style={{
              height: isMobile ? '8px' : '10px',
              backgroundColor: 'rgba(96, 165, 250, 0.4)',
              borderRadius: '2px',
              border: '1px solid rgba(147, 197, 253, 0.3)'
            }} />
          ))}
        </div>
      )}

      {/* Attic apartments */}
      {hasAttic && (
        <div style={{
          display: 'flex',
          gap: '6px',
          flexWrap: 'wrap'
        }}>
          {atticApartments.slice(0, isMobile ? 3 : 5).map((apt, i) => (
            <div key={i} style={{
              padding: '4px 10px',
              backgroundColor: 'rgba(255, 255, 255, 0.15)',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              fontSize: isMobile ? '10px' : '11px',
              fontWeight: '600',
              color: 'rgba(255, 255, 255, 0.9)',
              whiteSpace: 'nowrap'
            }}>
              {apt}
            </div>
          ))}
          {atticApartments.length > (isMobile ? 3 : 5) && (
            <div style={{
              padding: '4px 10px',
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              borderRadius: '8px',
              fontSize: isMobile ? '10px' : '11px',
              color: 'rgba(255, 255, 255, 0.6)'
            }}>
              +{atticApartments.length - (isMobile ? 3 : 5)}
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes sunPulse {
          0%, 100% { box-shadow: 0 0 12px rgba(251, 191, 36, 0.6); }
          50% { box-shadow: 0 0 20px rgba(251, 191, 36, 0.9); }
        }
      `}</style>
    </div>
  );
}
