import { Building, Zap, Car, Sun, Battery, BatteryCharging } from 'lucide-react';
import { useTranslation } from '../../i18n';

// Shared energy-flow "hub" diagram: Solar on top, Grid ↔ Building ↔ EV in the
// middle, Battery on the bottom — with direction-aware connectors. Used on both
// the dashboard and the building page so they look identical. The caller supplies
// already-normalised values (kW or kWh) and a matching formatter.
interface EnergyFlowHubProps {
  isMobile: boolean;
  formatValue: (v: number) => string;
  solar: number;
  hasSolar: boolean;
  consumption: number;
  gridMain: number;
  isImporting: boolean;
  hasGrid: boolean;
  ev: number;
  hasEv: boolean;
  gridImport?: number;
  gridExport?: number;
  hasBattery?: boolean;
  batteryCharge?: number;
  batteryDischarge?: number;
  batterySoc?: number;
}

export default function EnergyFlowHub({
  isMobile,
  formatValue,
  solar,
  hasSolar,
  consumption,
  gridMain,
  isImporting,
  hasGrid,
  ev,
  hasEv,
  gridImport = 0,
  gridExport = 0,
  hasBattery = false,
  batteryCharge = 0,
  batteryDischarge = 0,
  batterySoc,
}: EnergyFlowHubProps) {
  const { t } = useTranslation();

  const gridLabel = isImporting ? t('dashboard.energyFlowGridImport') : t('dashboard.energyFlowGridExport');

  const batteryMainVal = Math.max(batteryCharge, batteryDischarge);
  const batteryCharging = batteryCharge > batteryDischarge + 0.001;
  const batteryDischarging = batteryDischarge > batteryCharge + 0.001;
  const hasBatteryFlow = batteryMainVal > 0.001;
  const batteryColor = batteryCharging ? '#10b981' : '#14b8a6';
  const batteryLabel = batteryCharging
    ? t('dashboard.energyFlowBatteryCharging')
    : batteryDischarging
      ? t('dashboard.energyFlowBatteryDischarging')
      : t('dashboard.energyFlowBatteryIdle');
  const batterySocText = typeof batterySoc === 'number' && batterySoc > 0 ? ` · ${Math.round(batterySoc)}%` : '';

  return (
    <>
      {/* ── Desktop layout ── */}
      <div style={{ padding: '10px 0 0', display: isMobile ? 'none' : 'block' }}>
        {/* Solar at top */}
        <div style={{ textAlign: 'center', opacity: hasSolar ? 1 : 0.3, transition: 'opacity 0.3s' }}>
          <div style={{
            width: '68px', height: '68px', borderRadius: '50%',
            background: hasSolar ? 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)' : 'linear-gradient(135deg, #e5e7eb 0%, #d1d5db 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 8px',
            boxShadow: hasSolar ? '0 4px 14px rgba(245,158,11,0.3)' : 'none',
            transition: 'all 0.3s'
          }}>
            <Sun size={30} color="white" />
          </div>
          <div style={{ fontSize: '13px', fontWeight: '600', color: '#374151' }}>{t('dashboard.energyFlowSolar')}</div>
          <div style={{ fontSize: '16px', fontWeight: '700', color: hasSolar ? '#f59e0b' : '#9ca3af' }}>{formatValue(solar)}</div>
        </div>

        {/* Vertical connector: Solar -> Building */}
        <div style={{ width: '3px', height: '32px', margin: '0 auto', background: hasSolar ? 'linear-gradient(180deg, #fbbf24, #3b82f6)' : '#e5e7eb', position: 'relative', transition: 'background 0.3s' }}>
          {hasSolar && (
            <div style={{ position: 'absolute', bottom: '-5px', left: '-4px', width: 0, height: 0, borderLeft: '5.5px solid transparent', borderRight: '5.5px solid transparent', borderTop: '8px solid #3b82f6' }} />
          )}
        </div>

        {/* Middle row: Grid ←→ Building → EV */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0', width: '100%', maxWidth: '600px', margin: '0 auto' }}>
          {/* Grid */}
          <div style={{ textAlign: 'center', minWidth: '90px', flex: '0 0 auto', opacity: hasGrid ? 1 : 0.3, transition: 'opacity 0.3s' }}>
            <div style={{
              width: '56px', height: '56px', borderRadius: '50%',
              background: hasGrid ? (isImporting ? 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)') : 'linear-gradient(135deg, #e5e7eb 0%, #d1d5db 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 6px',
              boxShadow: hasGrid ? '0 4px 12px rgba(107,114,128,0.25)' : 'none', transition: 'all 0.3s'
            }}>
              <Zap size={24} color="white" />
            </div>
            <div style={{ fontSize: '12px', fontWeight: '600', color: '#374151' }}>{t('dashboard.energyFlowGrid')}</div>
            <div style={{ fontSize: '14px', fontWeight: '700', color: hasGrid ? (isImporting ? '#6b7280' : '#10b981') : '#9ca3af' }}>{formatValue(gridMain)}</div>
            <div style={{ fontSize: '10px', fontWeight: '600', color: isImporting ? '#9ca3af' : '#6ee7b7', marginTop: '2px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{gridLabel}</div>
          </div>

          {/* Connector Grid ↔ Building */}
          <div style={{ flex: '1', maxWidth: '90px', minWidth: '30px', height: '3px', background: hasGrid ? (isImporting ? 'linear-gradient(90deg, #6b7280, #3b82f6)' : 'linear-gradient(90deg, #3b82f6, #10b981)') : '#e5e7eb', position: 'relative', transition: 'background 0.3s' }}>
            {hasGrid && isImporting && <div style={{ position: 'absolute', right: '-6px', top: '-4px', width: 0, height: 0, borderTop: '5.5px solid transparent', borderBottom: '5.5px solid transparent', borderLeft: '8px solid #3b82f6' }} />}
            {hasGrid && !isImporting && <div style={{ position: 'absolute', left: '-6px', top: '-4px', width: 0, height: 0, borderTop: '5.5px solid transparent', borderBottom: '5.5px solid transparent', borderRight: '8px solid #10b981' }} />}
          </div>

          {/* Building hub */}
          <div style={{ textAlign: 'center', minWidth: '100px', flex: '0 0 auto' }}>
            <div style={{
              width: '72px', height: '72px', borderRadius: '50%',
              background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px',
              boxShadow: '0 4px 14px rgba(59,130,246,0.3)', border: '3px solid rgba(59,130,246,0.15)'
            }}>
              <Building size={32} color="white" />
            </div>
            <div style={{ fontSize: '13px', fontWeight: '600', color: '#374151' }}>{t('dashboard.energyFlowBuilding')}</div>
            <div style={{ fontSize: '17px', fontWeight: '800', color: '#3b82f6' }}>{formatValue(consumption)}</div>
          </div>

          {/* Connector Building -> EV */}
          <div style={{ flex: '1', maxWidth: '90px', minWidth: '30px', height: '3px', background: hasEv ? 'linear-gradient(90deg, #3b82f6, #8b5cf6)' : '#e5e7eb', position: 'relative', transition: 'background 0.3s' }}>
            {hasEv && <div style={{ position: 'absolute', right: '-6px', top: '-4px', width: 0, height: 0, borderTop: '5.5px solid transparent', borderBottom: '5.5px solid transparent', borderLeft: '8px solid #8b5cf6' }} />}
          </div>

          {/* EV */}
          <div style={{ textAlign: 'center', minWidth: '90px', flex: '0 0 auto', opacity: hasEv ? 1 : 0.3, transition: 'opacity 0.3s' }}>
            <div style={{
              width: '56px', height: '56px', borderRadius: '50%',
              background: hasEv ? 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)' : 'linear-gradient(135deg, #e5e7eb 0%, #d1d5db 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 6px',
              boxShadow: hasEv ? '0 4px 12px rgba(139,92,246,0.3)' : 'none', transition: 'all 0.3s'
            }}>
              <Car size={24} color="white" />
            </div>
            <div style={{ fontSize: '12px', fontWeight: '600', color: '#374151' }}>{t('dashboard.energyFlowCharging')}</div>
            <div style={{ fontSize: '14px', fontWeight: '700', color: hasEv ? '#8b5cf6' : '#9ca3af' }}>{formatValue(ev)}</div>
          </div>
        </div>

        {/* Battery below the hub */}
        {hasBattery && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{
              width: '3px', height: '32px', margin: '0 auto',
              background: hasBatteryFlow ? (batteryCharging ? 'linear-gradient(180deg, #3b82f6, #10b981)' : 'linear-gradient(180deg, #14b8a6, #3b82f6)') : '#e5e7eb',
              position: 'relative', transition: 'background 0.3s'
            }}>
              {hasBatteryFlow && batteryCharging && <div style={{ position: 'absolute', bottom: '-5px', left: '-4px', width: 0, height: 0, borderLeft: '5.5px solid transparent', borderRight: '5.5px solid transparent', borderTop: '8px solid #10b981' }} />}
              {hasBatteryFlow && batteryDischarging && <div style={{ position: 'absolute', top: '-5px', left: '-4px', width: 0, height: 0, borderLeft: '5.5px solid transparent', borderRight: '5.5px solid transparent', borderBottom: '8px solid #14b8a6' }} />}
            </div>
            <div style={{ textAlign: 'center', opacity: hasBatteryFlow ? 1 : 0.45, transition: 'opacity 0.3s' }}>
              <div style={{
                width: '60px', height: '60px', borderRadius: '50%',
                background: hasBatteryFlow ? (batteryCharging ? 'linear-gradient(135deg, #34d399 0%, #10b981 100%)' : 'linear-gradient(135deg, #2dd4bf 0%, #14b8a6 100%)') : 'linear-gradient(135deg, #e5e7eb 0%, #d1d5db 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 6px',
                boxShadow: hasBatteryFlow ? '0 4px 12px rgba(20,184,166,0.3)' : 'none', transition: 'all 0.3s'
              }}>
                {batteryCharging ? <BatteryCharging size={26} color="white" /> : <Battery size={26} color="white" />}
              </div>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#374151' }}>{t('dashboard.energyFlowBattery')}</div>
              <div style={{ fontSize: '14px', fontWeight: '700', color: hasBatteryFlow ? batteryColor : '#9ca3af' }}>{formatValue(batteryMainVal)}</div>
              <div style={{ fontSize: '10px', fontWeight: '600', color: '#9ca3af', marginTop: '2px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{batteryLabel}{batterySocText}</div>
            </div>
          </div>
        )}

        {/* Secondary info: both import AND export */}
        {gridImport > 0.01 && gridExport > 0.01 && (
          <div style={{ marginTop: '12px', padding: '6px 16px', backgroundColor: '#f9fafb', borderRadius: '8px', fontSize: '12px', color: '#6b7280', display: 'flex', gap: '16px', justifyContent: 'center' }}>
            <span>{t('dashboard.energyFlowGridImport')}: <strong style={{ color: '#4b5563' }}>{formatValue(gridImport)}</strong></span>
            <span style={{ color: '#d1d5db' }}>|</span>
            <span>{t('dashboard.energyFlowGridExport')}: <strong style={{ color: '#10b981' }}>{formatValue(gridExport)}</strong></span>
          </div>
        )}
      </div>

      {/* ── Mobile layout ── */}
      <div style={{ padding: '10px 0 0', display: isMobile ? 'block' : 'none' }}>
        {/* Solar */}
        <div style={{ textAlign: 'center', opacity: hasSolar ? 1 : 0.3 }}>
          <div style={{
            width: '60px', height: '60px', borderRadius: '50%',
            background: hasSolar ? 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)' : 'linear-gradient(135deg, #e5e7eb 0%, #d1d5db 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 6px',
            boxShadow: hasSolar ? '0 4px 12px rgba(245,158,11,0.3)' : 'none'
          }}>
            <Sun size={26} color="white" />
          </div>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#374151' }}>{t('dashboard.energyFlowSolar')}</div>
          <div style={{ fontSize: '15px', fontWeight: '700', color: hasSolar ? '#f59e0b' : '#9ca3af' }}>{formatValue(solar)}</div>
        </div>

        <div style={{ width: '3px', height: '24px', margin: '0 auto', background: hasSolar ? 'linear-gradient(180deg, #fbbf24, #3b82f6)' : '#e5e7eb', position: 'relative' }}>
          {hasSolar && <div style={{ position: 'absolute', bottom: '-4px', left: '-3.5px', width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '7px solid #3b82f6' }} />}
        </div>

        {/* Building */}
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '68px', height: '68px', borderRadius: '50%',
            background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 6px',
            boxShadow: '0 4px 14px rgba(59,130,246,0.3)', border: '3px solid rgba(59,130,246,0.15)'
          }}>
            <Building size={28} color="white" />
          </div>
          <div style={{ fontSize: '13px', fontWeight: '600', color: '#374151' }}>{t('dashboard.energyFlowBuilding')}</div>
          <div style={{ fontSize: '16px', fontWeight: '800', color: '#3b82f6' }}>{formatValue(consumption)}</div>
        </div>

        {/* Grid + EV row */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '32px', marginTop: '4px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: hasGrid ? 1 : 0.3 }}>
            <div style={{ width: '3px', height: '20px', background: hasGrid ? (isImporting ? 'linear-gradient(180deg, #3b82f6, #6b7280)' : 'linear-gradient(180deg, #3b82f6, #10b981)') : '#e5e7eb', position: 'relative' }}>
              {hasGrid && isImporting && <div style={{ position: 'absolute', top: '-4px', left: '-3.5px', width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderBottom: '7px solid #3b82f6' }} />}
              {hasGrid && !isImporting && <div style={{ position: 'absolute', bottom: '-4px', left: '-3.5px', width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '7px solid #10b981' }} />}
            </div>
            <div style={{
              width: '50px', height: '50px', borderRadius: '50%',
              background: hasGrid ? (isImporting ? 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)') : 'linear-gradient(135deg, #e5e7eb 0%, #d1d5db 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 4px',
              boxShadow: hasGrid ? '0 3px 10px rgba(107,114,128,0.25)' : 'none'
            }}>
              <Zap size={20} color="white" />
            </div>
            <div style={{ fontSize: '11px', fontWeight: '600', color: '#374151' }}>{t('dashboard.energyFlowGrid')}</div>
            <div style={{ fontSize: '13px', fontWeight: '700', color: hasGrid ? (isImporting ? '#6b7280' : '#10b981') : '#9ca3af' }}>{formatValue(gridMain)}</div>
            <div style={{ fontSize: '9px', fontWeight: '600', color: isImporting ? '#9ca3af' : '#6ee7b7', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{gridLabel}</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: hasEv ? 1 : 0.3 }}>
            <div style={{ width: '3px', height: '20px', background: hasEv ? 'linear-gradient(180deg, #3b82f6, #8b5cf6)' : '#e5e7eb', position: 'relative' }}>
              {hasEv && <div style={{ position: 'absolute', bottom: '-4px', left: '-3.5px', width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '7px solid #8b5cf6' }} />}
            </div>
            <div style={{
              width: '50px', height: '50px', borderRadius: '50%',
              background: hasEv ? 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)' : 'linear-gradient(135deg, #e5e7eb 0%, #d1d5db 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 4px',
              boxShadow: hasEv ? '0 3px 10px rgba(139,92,246,0.3)' : 'none'
            }}>
              <Car size={20} color="white" />
            </div>
            <div style={{ fontSize: '11px', fontWeight: '600', color: '#374151' }}>{t('dashboard.energyFlowCharging')}</div>
            <div style={{ fontSize: '13px', fontWeight: '700', color: hasEv ? '#8b5cf6' : '#9ca3af' }}>{formatValue(ev)}</div>
          </div>
        </div>

        {/* Battery (mobile) */}
        {hasBattery && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '8px' }}>
            <div style={{ width: '3px', height: '20px', background: hasBatteryFlow ? (batteryCharging ? 'linear-gradient(180deg, #3b82f6, #10b981)' : 'linear-gradient(180deg, #14b8a6, #3b82f6)') : '#e5e7eb', position: 'relative' }}>
              {hasBatteryFlow && batteryCharging && <div style={{ position: 'absolute', bottom: '-4px', left: '-3.5px', width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '7px solid #10b981' }} />}
              {hasBatteryFlow && batteryDischarging && <div style={{ position: 'absolute', top: '-4px', left: '-3.5px', width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderBottom: '7px solid #14b8a6' }} />}
            </div>
            <div style={{ textAlign: 'center', opacity: hasBatteryFlow ? 1 : 0.45 }}>
              <div style={{
                width: '50px', height: '50px', borderRadius: '50%',
                background: hasBatteryFlow ? (batteryCharging ? 'linear-gradient(135deg, #34d399 0%, #10b981 100%)' : 'linear-gradient(135deg, #2dd4bf 0%, #14b8a6 100%)') : 'linear-gradient(135deg, #e5e7eb 0%, #d1d5db 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '4px auto 4px',
                boxShadow: hasBatteryFlow ? '0 3px 10px rgba(20,184,166,0.3)' : 'none'
              }}>
                {batteryCharging ? <BatteryCharging size={20} color="white" /> : <Battery size={20} color="white" />}
              </div>
              <div style={{ fontSize: '11px', fontWeight: '600', color: '#374151' }}>{t('dashboard.energyFlowBattery')}</div>
              <div style={{ fontSize: '13px', fontWeight: '700', color: hasBatteryFlow ? batteryColor : '#9ca3af' }}>{formatValue(batteryMainVal)}</div>
              <div style={{ fontSize: '9px', fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{batteryLabel}{batterySocText}</div>
            </div>
          </div>
        )}

        {/* Secondary info */}
        {gridImport > 0.01 && gridExport > 0.01 && (
          <div style={{ marginTop: '12px', padding: '6px 12px', backgroundColor: '#f9fafb', borderRadius: '8px', fontSize: '11px', color: '#6b7280', display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <span>{t('dashboard.energyFlowGridImport')}: <strong style={{ color: '#4b5563' }}>{formatValue(gridImport)}</strong></span>
            <span style={{ color: '#d1d5db' }}>|</span>
            <span>{t('dashboard.energyFlowGridExport')}: <strong style={{ color: '#10b981' }}>{formatValue(gridExport)}</strong></span>
          </div>
        )}
      </div>
    </>
  );
}
