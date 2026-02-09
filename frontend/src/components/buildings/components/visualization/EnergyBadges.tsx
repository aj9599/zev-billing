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
      gap: isMobile ? '4px' : '6px',
      justifyContent: 'center',
      flexWrap: 'wrap',
      padding: isMobile ? '6px 0' : '8px 0'
    }}>
      {/* Consumption badge */}
      {consumption > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: isMobile ? '3px 8px' : '4px 10px',
          backgroundColor: '#dbeafe',
          borderRadius: '12px',
          border: '1px solid #93c5fd'
        }}>
          <Zap size={isMobile ? 10 : 12} color="#3b82f6" />
          <span style={{
            fontSize: isMobile ? '9px' : '11px',
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
          gap: '4px',
          padding: isMobile ? '3px 8px' : '4px 10px',
          backgroundColor: '#fef3c7',
          borderRadius: '12px',
          border: '1px solid #fbbf24'
        }}>
          <Sun size={isMobile ? 10 : 12} color="#d97706" />
          <span style={{
            fontSize: isMobile ? '9px' : '11px',
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
          gap: '4px',
          padding: isMobile ? '3px 8px' : '4px 10px',
          backgroundColor: isExporting ? '#ecfdf5' : '#fee2e2',
          borderRadius: '12px',
          border: `1px solid ${isExporting ? '#6ee7b7' : '#fca5a5'}`
        }}>
          <Grid size={isMobile ? 10 : 12} color={isExporting ? '#059669' : '#dc2626'} />
          <span style={{
            fontSize: isMobile ? '9px' : '11px',
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
