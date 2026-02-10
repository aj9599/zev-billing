import { Zap, Sun, Grid } from 'lucide-react';

interface EnergyBadgesProps {
  consumption: number;
  solarProduction: number;
  gridPower: number;
  hasSolar: boolean;
  isMobile: boolean;
}

export default function EnergyBadges({
  consumption,
  solarProduction,
  gridPower,
  hasSolar,
  isMobile
}: EnergyBadgesProps) {
  const isExporting = gridPower < 0;
  const hasData = consumption > 0 || solarProduction > 0 || Math.abs(gridPower) > 0;

  if (!hasData) return null;

  return (
    <div style={{
      display: 'flex',
      gap: isMobile ? '6px' : '8px',
      justifyContent: 'center',
      flexWrap: 'wrap',
      padding: isMobile ? '10px 0 4px' : '12px 0 4px'
    }}>
      {/* Consumption badge */}
      {consumption > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          padding: isMobile ? '5px 10px' : '6px 12px',
          backgroundColor: '#dbeafe',
          borderRadius: '20px',
          border: '1px solid #93c5fd',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
        }}>
          <Zap size={isMobile ? 11 : 13} color="#3b82f6" />
          <span style={{
            fontSize: isMobile ? '10px' : '12px',
            fontWeight: '700',
            color: '#1e40af'
          }}>
            {consumption.toFixed(2)} kW
          </span>
        </div>
      )}

      {/* Solar badge */}
      {hasSolar && solarProduction > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          padding: isMobile ? '5px 10px' : '6px 12px',
          backgroundColor: '#fef3c7',
          borderRadius: '20px',
          border: '1px solid #fbbf24',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
        }}>
          <Sun size={isMobile ? 11 : 13} color="#d97706" />
          <span style={{
            fontSize: isMobile ? '10px' : '12px',
            fontWeight: '700',
            color: '#92400e'
          }}>
            {solarProduction.toFixed(2)} kW
          </span>
        </div>
      )}

      {/* Grid badge */}
      {Math.abs(gridPower) > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          padding: isMobile ? '5px 10px' : '6px 12px',
          backgroundColor: isExporting ? '#ecfdf5' : '#fee2e2',
          borderRadius: '20px',
          border: `1px solid ${isExporting ? '#6ee7b7' : '#fca5a5'}`,
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
        }}>
          <Grid size={isMobile ? 11 : 13} color={isExporting ? '#059669' : '#dc2626'} />
          <span style={{
            fontSize: isMobile ? '10px' : '12px',
            fontWeight: '700',
            color: isExporting ? '#065f46' : '#991b1b'
          }}>
            {isExporting ? '-' : '+'}{Math.abs(gridPower).toFixed(2)} kW
          </span>
        </div>
      )}
    </div>
  );
}
