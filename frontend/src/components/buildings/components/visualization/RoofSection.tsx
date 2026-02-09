import { Sun } from 'lucide-react';

interface RoofSectionProps {
  hasSolar: boolean;
  atticApartments: string[];
  isMobile: boolean;
}

export default function RoofSection({ hasSolar, atticApartments, isMobile }: RoofSectionProps) {
  const roofHeight = isMobile ? 60 : 80;
  const hasAttic = atticApartments.length > 0;

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {/* Sun icon - only if solar */}
      {hasSolar && (
        <div style={{
          position: 'absolute',
          top: isMobile ? '-18px' : '-24px',
          right: isMobile ? '8px' : '16px',
          zIndex: 2
        }}>
          <div style={{
            width: isMobile ? '36px' : '48px',
            height: isMobile ? '36px' : '48px',
            borderRadius: '50%',
            backgroundColor: '#fbbf24',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 20px rgba(251, 191, 36, 0.5)',
            animation: 'pulse 3s ease-in-out infinite'
          }}>
            <Sun size={isMobile ? 20 : 28} color="#fff" />
          </div>
        </div>
      )}

      {/* Roof triangle */}
      <div style={{
        width: '100%',
        height: `${roofHeight}px`,
        background: hasSolar
          ? 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 50%, #1e3a5f 100%)'
          : 'linear-gradient(135deg, #92400e 0%, #b45309 50%, #78350f 100%)',
        clipPath: 'polygon(50% 0%, 5% 100%, 95% 100%)',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        {/* Solar panels grid */}
        {hasSolar && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${isMobile ? 3 : 4}, 1fr)`,
            gap: '2px',
            padding: `${isMobile ? 20 : 28}px ${isMobile ? 24 : 36}px 8px`,
            width: '60%'
          }}>
            {Array.from({ length: isMobile ? 6 : 8 }).map((_, i) => (
              <div key={i} style={{
                height: isMobile ? '8px' : '10px',
                backgroundColor: 'rgba(96, 165, 250, 0.7)',
                borderRadius: '1px',
                border: '1px solid rgba(147, 197, 253, 0.5)'
              }} />
            ))}
          </div>
        )}
      </div>

      {/* Attic floor content */}
      {hasAttic && (
        <div style={{
          position: 'absolute',
          bottom: '4px',
          left: '20%',
          right: '20%',
          display: 'flex',
          justifyContent: 'center',
          gap: '4px',
          flexWrap: 'wrap'
        }}>
          {atticApartments.slice(0, isMobile ? 2 : 4).map((apt, i) => (
            <div key={i} style={{
              padding: '2px 6px',
              backgroundColor: 'rgba(255, 255, 255, 0.85)',
              borderRadius: '3px',
              fontSize: '9px',
              fontWeight: '600',
              color: '#1f2937',
              whiteSpace: 'nowrap'
            }}>
              {apt}
            </div>
          ))}
          {atticApartments.length > (isMobile ? 2 : 4) && (
            <div style={{
              padding: '2px 6px',
              backgroundColor: 'rgba(255, 255, 255, 0.6)',
              borderRadius: '3px',
              fontSize: '9px',
              color: '#6b7280'
            }}>
              +{atticApartments.length - (isMobile ? 2 : 4)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
