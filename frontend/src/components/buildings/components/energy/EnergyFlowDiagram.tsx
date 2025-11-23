import { Sun, Building, Grid, ArrowRight, ArrowLeft, ArrowDown, ArrowUp } from 'lucide-react';
import { useTranslation } from '../../../../i18n';

interface EnergyFlowDiagramProps {
  consumption: {
    actualHouseConsumption: number;
    gridPower: number;
    solarProduction: number;
    solarConsumption: number;
    solarToGrid: number;
    solarToHouse: number;
  };
  hasSolarMeter: boolean;
  isMobile: boolean;
}

export default function EnergyFlowDiagram({
  consumption,
  hasSolarMeter,
  isMobile
}: EnergyFlowDiagramProps) {
  const { t } = useTranslation();
  const {
    actualHouseConsumption,
    gridPower,
    solarProduction,
    solarConsumption,
    solarToGrid,
    solarToHouse
  } = consumption;

  const solarCoverage = actualHouseConsumption > 0
    ? (solarProduction / actualHouseConsumption * 100)
    : 0;
  const isExporting = gridPower < 0;
  const isImporting = gridPower > 0;
  const isSolarProducing = solarProduction > 0;
  const isSolarConsuming = solarConsumption > 0;

  return (
    <div style={{
      display: 'flex',
      flexDirection: isMobile ? 'column' : 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: isMobile ? '20px' : '40px',
      marginBottom: isMobile ? '20px' : '32px',
      minHeight: isMobile ? 'auto' : '200px',
      position: 'relative'
    }}>
      {/* Solar Production */}
      {hasSolarMeter && (
        <>
          <div style={{
            display: 'flex',
            flexDirection: isMobile ? 'row' : 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: isMobile ? '100%' : '120px',
            gap: isMobile ? '16px' : '0'
          }}>
            <div style={{
              width: isMobile ? '80px' : '100px',
              height: isMobile ? '80px' : '100px',
              borderRadius: '50%',
              backgroundColor: '#fef3c7',
              border: '4px solid #f59e0b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: isMobile ? '0' : '12px',
              flexShrink: 0
            }}>
              <Sun size={isMobile ? 32 : 40} color="#f59e0b" />
            </div>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: isMobile ? 'flex-start' : 'center',
              minHeight: isMobile ? 'auto' : '90px',
              justifyContent: 'flex-start',
              flex: 1
            }}>
              <span style={{
                fontSize: isMobile ? '12px' : '14px',
                fontWeight: '600',
                color: '#6b7280',
                marginBottom: '4px'
              }}>
                {t('buildings.energyFlow.solar')}
              </span>
              <span style={{
                fontSize: isMobile ? '20px' : '24px',
                fontWeight: '800',
                color: '#f59e0b'
              }}>
                {isSolarProducing ? solarProduction.toFixed(3) : solarConsumption.toFixed(3)} kW
              </span>
              <div style={{ minHeight: '20px', marginTop: '4px' }}>
                {isSolarProducing && (
                  <span style={{
                    fontSize: isMobile ? '11px' : '12px',
                    color: '#22c55e',
                    fontWeight: '600'
                  }}>
                    {t('buildings.energyFlow.production')}
                  </span>
                )}
                {isSolarConsuming && (
                  <span style={{
                    fontSize: isMobile ? '11px' : '12px',
                    color: '#ef4444',
                    fontWeight: '600'
                  }}>
                    Consuming from Grid
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Arrow from Solar to Building */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            flexDirection: isMobile ? 'row' : 'column',
            gap: '4px',
            marginTop: isMobile ? '0' : '38px'
          }}>
            {isSolarProducing ? (
              <>
                {isMobile ? (
                  <ArrowDown size={28} color="#22c55e" strokeWidth={3} />
                ) : (
                  <ArrowRight size={32} color="#22c55e" strokeWidth={3} />
                )}
                <span style={{
                  fontSize: '11px',
                  fontWeight: '600',
                  color: '#22c55e'
                }}>
                  {solarToHouse.toFixed(2)} kW
                </span>
              </>
            ) : isSolarConsuming ? (
              <>
                {isMobile ? (
                  <ArrowUp size={28} color="#ef4444" strokeWidth={3} />
                ) : (
                  <ArrowLeft size={32} color="#ef4444" strokeWidth={3} />
                )}
                <span style={{
                  fontSize: '11px',
                  fontWeight: '600',
                  color: '#ef4444'
                }}>
                  {solarConsumption.toFixed(2)} kW
                </span>
              </>
            ) : (
              isMobile ? (
                <ArrowDown size={28} color="#e5e7eb" strokeWidth={3} />
              ) : (
                <ArrowRight size={32} color="#e5e7eb" strokeWidth={3} />
              )
            )}
          </div>
        </>
      )}

      {/* Building Consumption */}
      <div style={{
        display: 'flex',
        flexDirection: isMobile ? 'row' : 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        width: isMobile ? '100%' : '140px',
        gap: isMobile ? '16px' : '0'
      }}>
        <div style={{
          width: isMobile ? '100px' : '120px',
          height: isMobile ? '100px' : '120px',
          borderRadius: '50%',
          backgroundColor: '#dbeafe',
          border: '4px solid #3b82f6',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: isMobile ? '0' : '12px',
          flexShrink: 0
        }}>
          <Building size={isMobile ? 40 : 48} color="#3b82f6" />
        </div>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: isMobile ? 'flex-start' : 'center',
          minHeight: isMobile ? 'auto' : '90px',
          justifyContent: 'flex-start',
          flex: 1
        }}>
          <span style={{
            fontSize: isMobile ? '12px' : '14px',
            fontWeight: '600',
            color: '#6b7280',
            marginBottom: '4px'
          }}>
            {t('buildings.energyFlow.consumption')}
          </span>
          <span style={{
            fontSize: isMobile ? '24px' : '28px',
            fontWeight: '800',
            color: '#3b82f6'
          }}>
            {actualHouseConsumption.toFixed(3)} kW
          </span>
          <div style={{
            minHeight: '32px',
            marginTop: '8px',
            display: 'flex',
            alignItems: 'center'
          }}>
            {solarCoverage > 0 && (
              <div style={{
                padding: '4px 12px',
                backgroundColor: '#ecfdf5',
                borderRadius: '12px',
                border: '1px solid #22c55e'
              }}>
                <span style={{
                  fontSize: isMobile ? '11px' : '12px',
                  color: '#22c55e',
                  fontWeight: '700'
                }}>
                  {t('buildings.energyFlow.solarCoverage')}: {solarCoverage.toFixed(1)}%
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Arrow between Building and Grid */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        flexDirection: isMobile ? 'row' : 'column',
        gap: '4px',
        marginTop: isMobile ? '0' : '48px'
      }}>
        {isExporting ? (
          <>
            {isMobile ? (
              <ArrowDown size={28} color="#22c55e" strokeWidth={3} />
            ) : (
              <ArrowRight size={32} color="#22c55e" strokeWidth={3} />
            )}
            <span style={{
              fontSize: '11px',
              fontWeight: '600',
              color: '#22c55e'
            }}>
              {Math.abs(gridPower).toFixed(2)} kW
            </span>
            <span style={{ fontSize: '10px', color: '#22c55e' }}>
              {t('buildings.energyFlow.feedIn')}
            </span>
          </>
        ) : isImporting ? (
          <>
            {isMobile ? (
              <ArrowUp size={28} color="#ef4444" strokeWidth={3} />
            ) : (
              <ArrowLeft size={32} color="#ef4444" strokeWidth={3} />
            )}
            <span style={{
              fontSize: '11px',
              fontWeight: '600',
              color: '#ef4444'
            }}>
              {gridPower.toFixed(2)} kW
            </span>
            <span style={{ fontSize: '10px', color: '#ef4444' }}>
              {t('buildings.energyFlow.gridPower')}
            </span>
          </>
        ) : (
          isMobile ? (
            <ArrowUp size={28} color="#e5e7eb" strokeWidth={3} />
          ) : (
            <ArrowLeft size={32} color="#e5e7eb" strokeWidth={3} />
          )
        )}
      </div>

      {/* Grid */}
      <div style={{
        display: 'flex',
        flexDirection: isMobile ? 'row' : 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: isMobile ? '100%' : '120px',
        gap: isMobile ? '16px' : '0'
      }}>
        <div style={{
          width: isMobile ? '80px' : '100px',
          height: isMobile ? '80px' : '100px',
          borderRadius: '50%',
          backgroundColor: isExporting ? '#ecfdf5' : '#fee2e2',
          border: `4px solid ${isExporting ? '#22c55e' : '#ef4444'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: isMobile ? '0' : '12px',
          flexShrink: 0
        }}>
          <Grid size={isMobile ? 32 : 40} color={isExporting ? '#22c55e' : '#ef4444'} />
        </div>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: isMobile ? 'flex-start' : 'center',
          minHeight: isMobile ? 'auto' : '90px',
          justifyContent: 'flex-start',
          flex: 1
        }}>
          <span style={{
            fontSize: isMobile ? '12px' : '14px',
            fontWeight: '600',
            color: '#6b7280',
            marginBottom: '4px'
          }}>
            {t('buildings.energyFlow.grid')}
          </span>
          <span style={{
            fontSize: isMobile ? '20px' : '24px',
            fontWeight: '800',
            color: isExporting ? '#22c55e' : '#ef4444'
          }}>
            {Math.abs(gridPower).toFixed(3)} kW
          </span>
          <div style={{ minHeight: '20px', marginTop: '4px' }}>
            <span style={{
              fontSize: isMobile ? '11px' : '12px',
              color: isExporting ? '#22c55e' : '#ef4444',
              fontWeight: '600'
            }}>
              {isExporting ? t('buildings.energyFlow.selling') : t('buildings.energyFlow.buying')}
            </span>
          </div>
        </div>
      </div>

      {/* Solar to Grid Arrow (desktop only) */}
      {isExporting && hasSolarMeter && isSolarProducing && solarToGrid > 0 && !isMobile && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          flexDirection: 'column',
          gap: '4px',
          position: 'absolute',
          top: '0',
          left: '50%',
          transform: 'translateX(-50%)'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 12px',
            backgroundColor: 'rgba(34, 197, 94, 0.1)',
            borderRadius: '20px',
            border: '2px dashed #22c55e'
          }}>
            <Sun size={16} color="#f59e0b" />
            <ArrowRight size={20} color="#22c55e" strokeWidth={3} />
            <Grid size={16} color="#22c55e" />
            <span style={{
              fontSize: '11px',
              fontWeight: '600',
              color: '#22c55e',
              marginLeft: '4px'
            }}>
              {solarToGrid.toFixed(2)} kW
            </span>
          </div>
        </div>
      )}
    </div>
  );
}