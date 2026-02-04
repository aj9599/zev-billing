import { useState, useEffect } from 'react';
import * as React from 'react';
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Users, Building, Zap, Car, Sun, Battery, LayoutDashboard, Home, Eye, EyeOff, ChevronDown, ChevronRight, Activity, DollarSign, Wifi, WifiOff, AlertTriangle } from 'lucide-react';
import { api } from '../api/client';
import type { DashboardStats, SelfConsumptionData, SystemHealth, CostOverview } from '../types';
import { useTranslation } from '../i18n';

// ─── Local interfaces ────────────────────────────────────────────────

interface MeterData {
  meter_id: number;
  meter_name: string;
  meter_type: string;
  user_name?: string;
  data: Array<{
    timestamp: string;
    power: number;
    source: string;
  }>;
}

interface BuildingConsumption {
  building_id: number;
  building_name: string;
  meters: MeterData[];
}

// ─── Color palette ───────────────────────────────────────────────────

const APARTMENT_COLORS = [
  '#10b981', '#8b5cf6', '#ec4899', '#06b6d4', '#14b8a6', '#6366f1',
  '#a855f7', '#ef4444', '#84cc16', '#22c55e', '#0ea5e9',
];

const CHARGER_COLORS = [
  '#ff3366', '#ff6b35', '#ff8c42', '#ffa94d', '#ffbd59',
  '#f77f00', '#fcbf49', '#e63946', '#d62828', '#c1121f',
  '#780000', '#9d4edd', '#7209b7', '#560bad', '#3a0ca3',
];

const FIXED_COLORS: Record<string, string> = {
  'solar_meter': '#fbbf24',
  'total_meter': '#3b82f6',
  'default': '#6b7280'
};

const apartmentColorMap = new Map<number, string>();
const chargerColorMap = new Map<string, string>();

// ─── Utility functions ───────────────────────────────────────────────

function getMeterColor(meterType: string, meterId?: number, userName?: string): string {
  if (meterType === 'apartment_meter' && meterId !== undefined) {
    if (!apartmentColorMap.has(meterId)) {
      const colorIndex = apartmentColorMap.size % APARTMENT_COLORS.length;
      apartmentColorMap.set(meterId, APARTMENT_COLORS[colorIndex]);
    }
    return apartmentColorMap.get(meterId)!;
  }

  if (meterType === 'charger' && meterId !== undefined && userName) {
    const key = `${meterId}_${userName}`;
    if (!chargerColorMap.has(key)) {
      const colorIndex = chargerColorMap.size % CHARGER_COLORS.length;
      chargerColorMap.set(key, CHARGER_COLORS[colorIndex]);
    }
    return chargerColorMap.get(key)!;
  }

  return FIXED_COLORS[meterType] || FIXED_COLORS.default;
}

function getMeterDisplayName(meter: MeterData, t: any): string {
  if (meter.meter_type === 'charger') {
    const userName = meter.user_name || t('dashboard.unknownUser');
    const userMatch = userName.match(/^User (\d+)$/);
    const displayUser = userMatch ? `User ${userMatch[1]}` : userName;
    return `${meter.meter_name} - ${displayUser}`;
  }

  if (meter.user_name) {
    return `${meter.meter_name} (${meter.user_name})`;
  }
  return meter.meter_name;
}

function getMeterUniqueKey(meter: MeterData): string {
  if (meter.meter_type === 'charger' && meter.user_name) {
    return `charger_${meter.meter_id}_${meter.user_name}`;
  }
  return `meter_${meter.meter_id}`;
}

function getMeterTypeIcon(meterType: string, t: any): { Icon: any; label: string } {
  switch (meterType) {
    case 'charger':
      return { Icon: Car, label: t('dashboard.meterTypes.charger') };
    case 'solar_meter':
      return { Icon: Sun, label: t('dashboard.meterTypes.solar') };
    case 'apartment_meter':
      return { Icon: Home, label: t('dashboard.meterTypes.apartment') };
    case 'total_meter':
      return { Icon: Zap, label: t('dashboard.meterTypes.total') };
    default:
      return { Icon: Zap, label: meterType.replace('_', ' ') };
  }
}

function roundToNearest15Minutes(timestamp: string): Date {
  const date = new Date(timestamp);
  const minutes = date.getMinutes();

  let roundedMinutes: number;
  if (minutes < 8) {
    roundedMinutes = 0;
  } else if (minutes < 23) {
    roundedMinutes = 15;
  } else if (minutes < 38) {
    roundedMinutes = 30;
  } else if (minutes < 53) {
    roundedMinutes = 45;
  } else {
    const rounded = new Date(date);
    rounded.setHours(rounded.getHours() + 1);
    rounded.setMinutes(0);
    rounded.setSeconds(0);
    rounded.setMilliseconds(0);
    return rounded;
  }

  const rounded = new Date(date);
  rounded.setMinutes(roundedMinutes);
  rounded.setSeconds(0);
  rounded.setMilliseconds(0);

  return rounded;
}

function formatTimeForPeriod(date: Date, period: string): string {
  if (period === '1h') {
    return date.toLocaleTimeString('de-CH', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const time = date.toLocaleTimeString('de-CH', {
    hour: '2-digit',
    minute: '2-digit'
  });
  return `${day}.${month} ${time}`;
}

function formatKwh(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)} MWh`;
  return `${value.toFixed(1)} kWh`;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '-';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '<1 min';
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

// ─── Custom tooltip ──────────────────────────────────────────────────

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div style={{
        backgroundColor: 'rgba(255,255,255,0.96)',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        padding: '12px',
        fontSize: '12px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        backdropFilter: 'blur(8px)'
      }}>
        <p style={{ fontWeight: '600', marginBottom: '6px', color: '#374151' }}>{label}</p>
        {payload.map((entry: any, index: number) => {
          const value = Math.abs(entry.value);
          const displayValue = value >= 1000
            ? `${(value / 1000).toFixed(2)} kW`
            : `${value.toFixed(0)} W`;
          const isSolar = entry.value < 0;
          return (
            <p key={index} style={{ color: entry.color, margin: '3px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: entry.color, display: 'inline-block', flexShrink: 0 }} />
              {isSolar ? '~ ' : ''}{entry.name}: <strong>{displayValue}</strong>
            </p>
          );
        })}
      </div>
    );
  }
  return null;
};

// ─── Main component ──────────────────────────────────────────────────

export default function Dashboard() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [selfConsumption, setSelfConsumption] = useState<SelfConsumptionData | null>(null);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [costOverview, setCostOverview] = useState<CostOverview | null>(null);
  const [buildingData, setBuildingData] = useState<BuildingConsumption[]>([]);
  const [period, setPeriod] = useState('24h');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedBuildings, setExpandedBuildings] = useState<Set<number>>(new Set());
  const [healthExpanded, setHealthExpanded] = useState(false);

  const [visibleMetersByBuilding, setVisibleMetersByBuilding] = useState<Map<number, Set<string>>>(new Map());
  const visibilityInitialized = React.useRef(false);
  const buildingsInitialized = React.useRef(false);

  const loadData = React.useCallback(async () => {
    try {
      setError(null);
      const [statsData, buildingConsumption, selfConsData, healthData, costData] = await Promise.all([
        api.getDashboardStats(),
        api.getConsumptionByBuilding(period),
        api.getSelfConsumption().catch(() => null),
        api.getSystemHealth().catch(() => null),
        api.getCostOverview().catch(() => null),
      ]);
      setStats(statsData);
      setSelfConsumption(selfConsData);
      setSystemHealth(healthData);
      setCostOverview(costData);

      const buildings = Array.isArray(buildingConsumption) ? buildingConsumption : [];
      setBuildingData(buildings);

      // Auto-expand first building on initial load
      if (!buildingsInitialized.current && buildings.length > 0) {
        setExpandedBuildings(new Set([buildings[0].building_id]));
        buildingsInitialized.current = true;
      }

      if (!visibilityInitialized.current) {
        const initialVisibility = new Map<number, Set<string>>();
        buildings.forEach(building => {
          const visibleSet = new Set<string>();
          building.meters?.forEach(meter => {
            visibleSet.add(getMeterUniqueKey(meter));
          });
          initialVisibility.set(building.building_id, visibleSet);
        });
        setVisibleMetersByBuilding(initialVisibility);
        visibilityInitialized.current = true;
      }

    } catch (err) {
      console.error('Failed to load dashboard data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
      setBuildingData([]);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 60000);
    return () => clearInterval(interval);
  }, [loadData]);

  const toggleMeterVisibility = (buildingId: number, meterKey: string) => {
    setVisibleMetersByBuilding(prev => {
      const newMap = new Map(prev);
      const buildingVisible = new Set(newMap.get(buildingId) || new Set<string>());
      if (buildingVisible.has(meterKey)) {
        buildingVisible.delete(meterKey);
      } else {
        buildingVisible.add(meterKey);
      }
      newMap.set(buildingId, buildingVisible);
      return newMap;
    });
  };

  const isMeterVisible = (buildingId: number, meterKey: string): boolean => {
    const buildingVisible = visibleMetersByBuilding.get(buildingId);
    return buildingVisible ? buildingVisible.has(meterKey) : true;
  };

  const toggleBuildingExpanded = (buildingId: number) => {
    setExpandedBuildings(prev => {
      const next = new Set(prev);
      if (next.has(buildingId)) {
        next.delete(buildingId);
      } else {
        next.add(buildingId);
      }
      return next;
    });
  };

  // ─── Loading state ───────────────────────────────────────────────
  if (loading) {
    return (
      <div className="dashboard-container">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Shimmer loading skeleton */}
          <div className="shimmer" style={{ height: '60px', borderRadius: '12px', background: '#f0f0f0' }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            {[1,2,3,4].map(i => (
              <div key={i} className="shimmer" style={{ height: '120px', borderRadius: '12px', background: '#f0f0f0' }} />
            ))}
          </div>
          <div className="shimmer" style={{ height: '200px', borderRadius: '12px', background: '#f0f0f0' }} />
        </div>
      </div>
    );
  }

  // ─── Error state ─────────────────────────────────────────────────
  if (error) {
    return (
      <div className="dashboard-container">
        <div style={{
          padding: '30px',
          backgroundColor: '#fef2f2',
          borderRadius: '12px',
          border: '1px solid #fecaca',
          color: '#991b1b',
          marginBottom: '20px'
        }}>
          <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={20} />
            {t('dashboard.errorLoading')}
          </h3>
          <p style={{ color: '#b91c1c' }}>{error}</p>
          <button
            onClick={() => { setLoading(true); loadData(); }}
            style={{
              padding: '10px 20px',
              backgroundColor: '#667eea',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '14px'
            }}
          >
            {t('logs.refresh')}
          </button>
        </div>
      </div>
    );
  }

  // Self-consumption quality label
  const selfConsPct = selfConsumption?.today_self_consumption_pct ?? 0;
  const selfConsLabel = selfConsPct >= 60 ? t('dashboard.selfConsumptionGood') : selfConsPct >= 30 ? t('dashboard.selfConsumptionAverage') : t('dashboard.selfConsumptionLow');
  const selfConsColor = selfConsPct >= 60 ? '#22c55e' : selfConsPct >= 30 ? '#f59e0b' : '#ef4444';

  // Health issue count
  const healthIssues = (systemHealth?.stale_count ?? 0) + (systemHealth?.offline_count ?? 0);

  return (
    <div className="dashboard-container">

      {/* ─── Header ───────────────────────────────────────────────── */}
      <div className="dashboard-header" style={{ marginBottom: '28px' }}>
        <h1 className="dashboard-title" style={{
          fontSize: '32px',
          fontWeight: '800',
          marginBottom: '6px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text'
        }}>
          <LayoutDashboard className="dashboard-icon" size={32} style={{ color: '#667eea' }} />
          {t('dashboard.title')}
        </h1>
        <p className="dashboard-subtitle" style={{ color: '#6b7280', fontSize: '15px', margin: 0 }}>
          {t('dashboard.subtitle')}
        </p>
      </div>

      {/* ─── Hero Stat Cards (4 main metrics) ─────────────────────── */}
      <div className="hero-stats" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }}>
        {/* Grid Consumption */}
        <div className="hero-card fade-in" style={{
          ...heroCardStyle,
          borderLeft: '4px solid #3b82f6'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '13px', color: '#6b7280', fontWeight: '500', marginBottom: '6px' }}>
                {t('dashboard.gridConsumption')}
              </div>
              <div style={{ fontSize: '28px', fontWeight: '800', color: '#1f2937', lineHeight: 1.1 }}>
                {formatKwh(stats?.today_consumption ?? 0)}
              </div>
              <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '6px' }}>
                {t('dashboard.consumptionMonth')}: {formatKwh(stats?.month_consumption ?? 0)}
              </div>
            </div>
            <div style={{ ...heroIconStyle, backgroundColor: '#3b82f620' }}>
              <Zap size={22} color="#3b82f6" />
            </div>
          </div>
        </div>

        {/* Solar Production */}
        <div className="hero-card fade-in" style={{
          ...heroCardStyle,
          borderLeft: '4px solid #f59e0b',
          animationDelay: '0.05s'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '13px', color: '#6b7280', fontWeight: '500', marginBottom: '6px' }}>
                {t('dashboard.solarToday')}
              </div>
              <div style={{ fontSize: '28px', fontWeight: '800', color: '#1f2937', lineHeight: 1.1 }}>
                {formatKwh(stats?.today_solar ?? 0)}
              </div>
              <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '6px' }}>
                {t('dashboard.solarMonth')}: {formatKwh(stats?.month_solar ?? 0)}
              </div>
            </div>
            <div style={{ ...heroIconStyle, backgroundColor: '#f59e0b20' }}>
              <Sun size={22} color="#f59e0b" />
            </div>
          </div>
        </div>

        {/* Self-Consumption Rate */}
        <div className="hero-card fade-in" style={{
          ...heroCardStyle,
          borderLeft: `4px solid ${selfConsColor}`,
          animationDelay: '0.1s'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '13px', color: '#6b7280', fontWeight: '500', marginBottom: '6px' }}>
                {t('dashboard.selfConsumptionRate')}
              </div>
              <div style={{ fontSize: '28px', fontWeight: '800', color: '#1f2937', lineHeight: 1.1 }}>
                {selfConsPct.toFixed(0)}%
              </div>
              <div style={{ fontSize: '12px', color: selfConsColor, marginTop: '6px', fontWeight: '600' }}>
                {selfConsLabel}
                {selfConsumption && (
                  <span style={{ color: '#9ca3af', fontWeight: '400', marginLeft: '6px' }}>
                    ({t('dashboard.selfConsumptionMonth')}: {(selfConsumption.month_self_consumption_pct ?? 0).toFixed(0)}%)
                  </span>
                )}
              </div>
            </div>
            <div style={{ ...heroIconStyle, backgroundColor: selfConsColor + '20' }}>
              <Activity size={22} color={selfConsColor} />
            </div>
          </div>
        </div>

        {/* EV Charging */}
        <div className="hero-card fade-in" style={{
          ...heroCardStyle,
          borderLeft: '4px solid #8b5cf6',
          animationDelay: '0.15s'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '13px', color: '#6b7280', fontWeight: '500', marginBottom: '6px' }}>
                {t('dashboard.chargingToday')}
              </div>
              <div style={{ fontSize: '28px', fontWeight: '800', color: '#1f2937', lineHeight: 1.1 }}>
                {formatKwh(stats?.today_charging ?? 0)}
              </div>
              <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '6px' }}>
                {t('dashboard.chargingMonth')}: {formatKwh(stats?.month_charging ?? 0)}
              </div>
            </div>
            <div style={{ ...heroIconStyle, backgroundColor: '#8b5cf620' }}>
              <Car size={22} color="#8b5cf6" />
            </div>
          </div>
        </div>
      </div>

      {/* ─── Energy Flow Diagram ──────────────────────────────────── */}
      <div className="fade-in" style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        padding: '24px',
        marginBottom: '24px',
        animationDelay: '0.2s'
      }}>
        <h2 style={{ fontSize: '16px', fontWeight: '700', margin: '0 0 20px 0', color: '#374151' }}>
          {t('dashboard.energyFlow')}
        </h2>
        <div className="energy-flow" style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0',
          flexWrap: 'wrap',
          padding: '10px 0'
        }}>
          {/* Solar Node */}
          <div style={{ textAlign: 'center', minWidth: '100px' }}>
            <div style={{
              width: '64px', height: '64px', borderRadius: '50%',
              background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 8px', boxShadow: '0 4px 12px rgba(245,158,11,0.3)'
            }}>
              <Sun size={28} color="white" />
            </div>
            <div style={{ fontSize: '13px', fontWeight: '600', color: '#374151' }}>{t('dashboard.energyFlowSolar')}</div>
            <div style={{ fontSize: '15px', fontWeight: '700', color: '#f59e0b' }}>
              {formatKwh(selfConsumption?.today_solar_produced ?? stats?.today_solar ?? 0)}
            </div>
          </div>

          {/* Arrow Solar -> Building */}
          <div className="flow-arrow" style={{
            flex: '1',
            maxWidth: '120px',
            minWidth: '40px',
            height: '3px',
            background: 'linear-gradient(90deg, #fbbf24, #3b82f6)',
            margin: '0 -4px',
            position: 'relative',
            marginBottom: '30px'
          }}>
            <div style={{
              position: 'absolute', right: '-6px', top: '-4px',
              width: 0, height: 0,
              borderTop: '5px solid transparent',
              borderBottom: '5px solid transparent',
              borderLeft: '8px solid #3b82f6'
            }} />
            <div style={{
              position: 'absolute', top: '8px', left: '50%', transform: 'translateX(-50%)',
              fontSize: '11px', color: '#6b7280', whiteSpace: 'nowrap', fontWeight: '500'
            }}>
              {t('dashboard.energyFlowSelfUse')}
            </div>
          </div>

          {/* Building Node */}
          <div style={{ textAlign: 'center', minWidth: '100px' }}>
            <div style={{
              width: '64px', height: '64px', borderRadius: '50%',
              background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 8px', boxShadow: '0 4px 12px rgba(59,130,246,0.3)'
            }}>
              <Building size={28} color="white" />
            </div>
            <div style={{ fontSize: '13px', fontWeight: '600', color: '#374151' }}>{t('dashboard.energyFlowBuilding')}</div>
            <div style={{ fontSize: '15px', fontWeight: '700', color: '#3b82f6' }}>
              {formatKwh(stats?.today_consumption ?? 0)}
            </div>
          </div>

          {/* Arrow Building -> Grid */}
          <div className="flow-arrow" style={{
            flex: '1',
            maxWidth: '120px',
            minWidth: '40px',
            height: '3px',
            background: 'linear-gradient(90deg, #3b82f6, #6b7280)',
            margin: '0 -4px',
            position: 'relative',
            marginBottom: '30px'
          }}>
            <div style={{
              position: 'absolute', right: '-6px', top: '-4px',
              width: 0, height: 0,
              borderTop: '5px solid transparent',
              borderBottom: '5px solid transparent',
              borderLeft: '8px solid #6b7280'
            }} />
            <div style={{
              position: 'absolute', top: '8px', left: '50%', transform: 'translateX(-50%)',
              fontSize: '11px', color: '#6b7280', whiteSpace: 'nowrap', fontWeight: '500'
            }}>
              {t('dashboard.energyFlowExport')}
            </div>
          </div>

          {/* Grid Node */}
          <div style={{ textAlign: 'center', minWidth: '100px' }}>
            <div style={{
              width: '64px', height: '64px', borderRadius: '50%',
              background: 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 8px', boxShadow: '0 4px 12px rgba(107,114,128,0.3)'
            }}>
              <Zap size={28} color="white" />
            </div>
            <div style={{ fontSize: '13px', fontWeight: '600', color: '#374151' }}>{t('dashboard.energyFlowGrid')}</div>
            <div style={{ fontSize: '15px', fontWeight: '700', color: '#6b7280' }}>
              {formatKwh(Math.max(0, (selfConsumption?.today_solar_produced ?? 0) - (selfConsumption?.today_solar_consumed ?? 0)))}
            </div>
          </div>
        </div>

        {/* EV Charging branch below building */}
        {(stats?.today_charging ?? 0) > 0 && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '8px' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: '3px', height: '20px', backgroundColor: '#8b5cf6', margin: '0 auto' }} />
              <div style={{
                width: '48px', height: '48px', borderRadius: '50%',
                background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 6px', boxShadow: '0 4px 12px rgba(139,92,246,0.3)'
              }}>
                <Car size={22} color="white" />
              </div>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#374151' }}>{t('dashboard.energyFlowCharging')}</div>
              <div style={{ fontSize: '14px', fontWeight: '700', color: '#8b5cf6' }}>
                {formatKwh(stats?.today_charging ?? 0)}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── Middle Row: System Health + Cost Overview ─────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }}>
        {/* System Health */}
        {systemHealth && (
          <div className="fade-in" style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            padding: '20px',
            animationDelay: '0.25s'
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: healthExpanded ? '16px' : '0',
              cursor: healthIssues > 0 ? 'pointer' : 'default'
            }}
              onClick={() => healthIssues > 0 && setHealthExpanded(!healthExpanded)}
            >
              <h2 style={{ fontSize: '16px', fontWeight: '700', margin: 0, color: '#374151', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Wifi size={18} color={healthIssues === 0 ? '#22c55e' : '#f59e0b'} />
                {t('dashboard.systemHealth')}
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', color: '#22c55e', fontWeight: '600' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#22c55e', display: 'inline-block' }} />
                  {systemHealth.online_count}
                </span>
                {systemHealth.stale_count > 0 && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', color: '#f59e0b', fontWeight: '600' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#f59e0b', display: 'inline-block' }} />
                    {systemHealth.stale_count}
                  </span>
                )}
                {systemHealth.offline_count > 0 && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', color: '#ef4444', fontWeight: '600' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444', display: 'inline-block', animation: 'pulse-dot 2s infinite' }} />
                    {systemHealth.offline_count}
                  </span>
                )}
                {healthIssues > 0 && (
                  healthExpanded ? <ChevronDown size={16} color="#6b7280" /> : <ChevronRight size={16} color="#6b7280" />
                )}
              </div>
            </div>

            {healthIssues === 0 && (
              <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '8px' }}>
                {t('dashboard.allDevicesOnline')}
              </div>
            )}

            {healthExpanded && healthIssues > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {systemHealth.devices
                  .filter(d => d.status !== 'online')
                  .map(device => (
                    <div key={`${device.type}-${device.id}`} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 12px', backgroundColor: '#f9fafb', borderRadius: '8px',
                      fontSize: '13px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {device.status === 'offline' ? (
                          <WifiOff size={14} color="#ef4444" />
                        ) : (
                          <AlertTriangle size={14} color="#f59e0b" />
                        )}
                        <span style={{ fontWeight: '500' }}>{device.name}</span>
                        <span style={{ color: '#9ca3af', fontSize: '12px' }}>{device.building_name}</span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                        {device.last_reading ? `${timeAgo(device.last_reading)} ${t('dashboard.ago')}` : '-'}
                      </div>
                    </div>
                  ))
                }
              </div>
            )}
          </div>
        )}

        {/* Cost Overview */}
        {costOverview && costOverview.buildings.length > 0 && (
          <div className="fade-in" style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            padding: '20px',
            animationDelay: '0.3s'
          }}>
            <h2 style={{ fontSize: '16px', fontWeight: '700', margin: '0 0 4px 0', color: '#374151', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <DollarSign size={18} color="#667eea" />
              {t('dashboard.costOverview')}
            </h2>
            <p style={{ fontSize: '12px', color: '#9ca3af', margin: '0 0 16px 0' }}>{t('dashboard.costOverviewSubtitle')}</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {costOverview.buildings.map(b => {
                const maxCost = Math.max(...costOverview.buildings.map(x => x.total_cost), 1);
                const barWidth = (b.total_cost / maxCost) * 100;
                return (
                  <div key={b.building_id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '500', color: '#374151' }}>{b.building_name}</span>
                      <span style={{ fontSize: '14px', fontWeight: '700', color: '#1f2937' }}>
                        {b.currency} {b.total_cost.toFixed(2)}
                      </span>
                    </div>
                    <div style={{ height: '8px', backgroundColor: '#f3f4f6', borderRadius: '4px', overflow: 'hidden', display: 'flex' }}>
                      {b.grid_cost > 0 && (
                        <div style={{ width: `${(b.grid_cost / b.total_cost) * barWidth}%`, backgroundColor: '#3b82f6', transition: 'width 0.6s ease' }} />
                      )}
                      {b.solar_cost > 0 && (
                        <div style={{ width: `${(b.solar_cost / b.total_cost) * barWidth}%`, backgroundColor: '#f59e0b', transition: 'width 0.6s ease' }} />
                      )}
                      {b.charging_cost > 0 && (
                        <div style={{ width: `${(b.charging_cost / b.total_cost) * barWidth}%`, backgroundColor: '#8b5cf6', transition: 'width 0.6s ease' }} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Cost legend + total */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #f3f4f6' }}>
              <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: '#6b7280' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: '#3b82f6', display: 'inline-block' }} />
                  {t('dashboard.gridCost')}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: '#f59e0b', display: 'inline-block' }} />
                  {t('dashboard.solarCost')}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: '#8b5cf6', display: 'inline-block' }} />
                  {t('dashboard.chargingCost')}
                </span>
              </div>
              <div style={{ fontSize: '15px', fontWeight: '700', color: '#1f2937' }}>
                {t('dashboard.totalCost')}: {costOverview.currency} {costOverview.total_cost.toFixed(2)}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── System Overview (condensed counts) ───────────────────── */}
      <div className="fade-in" style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        padding: '16px 24px',
        marginBottom: '24px',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '24px',
        alignItems: 'center',
        animationDelay: '0.35s'
      }}>
        <span style={{ fontSize: '14px', fontWeight: '700', color: '#374151' }}>{t('dashboard.systemOverview')}</span>
        <div className="system-overview-items" style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', flex: 1 }}>
          <OverviewItem icon={Users} label={t('dashboard.totalUsers')} value={stats?.total_users ?? 0} color="#3b82f6" />
          <OverviewItem icon={Building} label={t('dashboard.buildings')} value={stats?.total_buildings ?? 0} color="#22c55e" />
          <OverviewItem icon={Zap} label={t('dashboard.activeMeters')} value={`${stats?.active_meters ?? 0}/${stats?.total_meters ?? 0}`} color="#f59e0b" />
          <OverviewItem icon={Car} label={t('dashboard.activeChargers')} value={`${stats?.active_chargers ?? 0}/${stats?.total_chargers ?? 0}`} color="#8b5cf6" />
          <OverviewItem icon={Battery} label={t('dashboard.consumptionMonth')} value={formatKwh(stats?.month_consumption ?? 0)} color="#ef4444" />
        </div>
      </div>

      {/* ─── Building Consumption Section ──────────────────────────── */}
      <div className="consumption-controls" style={{
        backgroundColor: 'white',
        padding: '16px 20px',
        borderRadius: '12px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        marginBottom: '16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <h2 style={{ fontSize: '16px', fontWeight: '700', margin: 0, color: '#374151' }}>
          {t('dashboard.consumptionByBuilding')}
        </h2>
        <div className="controls-group" style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder={t('dashboard.searchBuildings')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
            style={{
              padding: '7px 12px',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '13px',
              minWidth: '180px',
              outline: 'none',
              transition: 'border-color 0.2s'
            }}
          />
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="period-select"
            style={{
              padding: '7px 12px',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '13px',
              outline: 'none',
              backgroundColor: 'white',
              cursor: 'pointer'
            }}
          >
            <option value="1h">{t('dashboard.lastHour')}</option>
            <option value="24h">{t('dashboard.last24Hours')}</option>
            <option value="7d">{t('dashboard.last7Days')}</option>
            <option value="30d">{t('dashboard.last30Days')}</option>
          </select>
        </div>
      </div>

      {buildingData.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {(() => {
            const filteredBuildings = buildingData.filter(building =>
              building.building_name.toLowerCase().includes(searchQuery.toLowerCase())
            );

            if (filteredBuildings.length === 0 && searchQuery) {
              return (
                <div style={{
                  backgroundColor: 'white',
                  padding: '48px 20px',
                  borderRadius: '12px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                  textAlign: 'center',
                  color: '#9ca3af'
                }}>
                  <h3 style={{ marginTop: 0, color: '#6b7280' }}>{t('dashboard.noBuildings')}</h3>
                  <p>{t('dashboard.noBuildingsMatch').replace('{query}', searchQuery)}</p>
                  <button
                    onClick={() => setSearchQuery('')}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#667eea',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: '600',
                      marginTop: '8px'
                    }}
                  >
                    {t('dashboard.clearSearch')}
                  </button>
                </div>
              );
            }

            return (
              <>
                {searchQuery && (
                  <div style={{
                    padding: '10px 14px',
                    backgroundColor: '#f0f9ff',
                    borderRadius: '8px',
                    fontSize: '13px',
                    color: '#0369a1',
                    border: '1px solid #bae6fd'
                  }}>
                    {t('dashboard.showingBuildings')
                      .replace('{count}', filteredBuildings.length.toString())
                      .replace('{total}', buildingData.length.toString())}
                  </div>
                )}
                {filteredBuildings.map((building) => {
                  const isExpanded = expandedBuildings.has(building.building_id);
                  const timeMap = new Map<string, any>();
                  const meters = building.meters || [];

                  meters.forEach(meter => {
                    const readings = meter.data || [];
                    const isSolar = meter.meter_type === 'solar_meter';
                    const isCharger = meter.meter_type === 'charger';

                    readings.forEach(reading => {
                      const roundedDate = roundToNearest15Minutes(reading.timestamp);
                      const timestampKey = roundedDate.toISOString();
                      const displayTime = formatTimeForPeriod(roundedDate, period);

                      if (!timeMap.has(timestampKey)) {
                        timeMap.set(timestampKey, {
                          time: displayTime,
                          timestamp: timestampKey,
                          sortKey: roundedDate.getTime()
                        });
                      }

                      const meterKey = getMeterUniqueKey(meter);
                      const current = timeMap.get(timestampKey);

                      if (isCharger || isSolar || reading.power !== 0) {
                        current[meterKey] = reading.power;
                      }
                    });
                  });

                  const chartData = Array.from(timeMap.values()).sort((a, b) => a.sortKey - b.sortKey);

                  return (
                    <div
                      key={building.building_id}
                      className="building-card"
                      style={{
                        backgroundColor: 'white',
                        borderRadius: '12px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                        overflow: 'hidden',
                        transition: 'box-shadow 0.2s ease'
                      }}
                    >
                      {/* Collapsible header */}
                      <div
                        onClick={() => toggleBuildingExpanded(building.building_id)}
                        style={{
                          padding: '16px 24px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          cursor: 'pointer',
                          userSelect: 'none',
                          borderBottom: isExpanded ? '1px solid #f3f4f6' : 'none',
                          transition: 'background-color 0.15s ease'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#fafafa'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          {isExpanded ? (
                            <ChevronDown size={18} color="#6b7280" />
                          ) : (
                            <ChevronRight size={18} color="#6b7280" />
                          )}
                          <h3 style={{
                            fontSize: '16px',
                            fontWeight: '600',
                            margin: 0,
                            color: '#1f2937'
                          }}>
                            {building.building_name}
                          </h3>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#9ca3af' }}>
                          <span>{meters.length} {meters.length === 1 ? 'meter' : 'meters'}</span>
                          {chartData.length > 0 && <span>{chartData.length} pts</span>}
                        </div>
                      </div>

                      {/* Expanded content */}
                      {isExpanded && (
                        <div style={{ padding: '20px 24px' }}>
                          {meters.length > 0 && (
                            <div className="meter-legend" style={{
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: '8px',
                              marginBottom: '16px',
                              padding: '10px',
                              backgroundColor: '#f9fafb',
                              borderRadius: '8px'
                            }}>
                              {meters.map(meter => {
                                const uniqueKey = getMeterUniqueKey(meter);
                                const isCharger = meter.meter_type === 'charger';
                                const isSolar = meter.meter_type === 'solar_meter';
                                const { Icon: TypeIcon, label: typeLabel } = getMeterTypeIcon(meter.meter_type, t);
                                const color = getMeterColor(meter.meter_type, meter.meter_id, meter.user_name);
                                const isVisible = isMeterVisible(building.building_id, uniqueKey);

                                return (
                                  <div
                                    key={uniqueKey}
                                    onClick={() => toggleMeterVisibility(building.building_id, uniqueKey)}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '6px',
                                      padding: '5px 10px',
                                      backgroundColor: 'white',
                                      borderRadius: '6px',
                                      fontSize: '12px',
                                      border: (isCharger || isSolar) ? `2px solid ${color}30` : '1px solid #e5e7eb',
                                      cursor: 'pointer',
                                      transition: 'all 0.15s ease',
                                      opacity: isVisible ? 1 : 0.4,
                                      textDecoration: isVisible ? 'none' : 'line-through',
                                      userSelect: 'none'
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.transform = 'translateY(-1px)';
                                      e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.transform = 'translateY(0)';
                                      e.currentTarget.style.boxShadow = 'none';
                                    }}
                                  >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                      {isVisible ? (
                                        <Eye size={12} color={color} style={{ flexShrink: 0 }} />
                                      ) : (
                                        <EyeOff size={12} color="#9ca3af" style={{ flexShrink: 0 }} />
                                      )}
                                      <div style={{
                                        width: '10px', height: '10px', borderRadius: '2px',
                                        backgroundColor: isVisible ? color : '#d1d5db', flexShrink: 0,
                                        border: (isCharger || isSolar) ? `1.5px solid ${isVisible ? color : '#9ca3af'}` : 'none'
                                      }} />
                                    </div>
                                    <span style={{
                                      fontWeight: (isCharger || isSolar) ? '600' : '500',
                                      color: isVisible ? '#1f2937' : '#9ca3af'
                                    }}>
                                      {getMeterDisplayName(meter, t)}
                                    </span>
                                    <span style={{
                                      color: isVisible ? '#6b7280' : '#9ca3af',
                                      fontSize: '11px',
                                      display: 'flex', alignItems: 'center', gap: '3px'
                                    }}>
                                      <TypeIcon size={11} />
                                      {typeLabel}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {chartData.length > 0 ? (() => {
                            const visibleKeys = meters
                              .filter(m => isMeterVisible(building.building_id, getMeterUniqueKey(m)))
                              .map(m => getMeterUniqueKey(m));

                            let yMin = 0;
                            let yMax = 0;
                            chartData.forEach(point => {
                              visibleKeys.forEach(key => {
                                const val = point[key];
                                if (typeof val === 'number') {
                                  if (val < yMin) yMin = val;
                                  if (val > yMax) yMax = val;
                                }
                              });
                            });

                            const padding = Math.max((yMax - yMin) * 0.1, 100);
                            const domainMin = Math.floor((yMin - padding) / 100) * 100;
                            const domainMax = Math.ceil((yMax + padding) / 100) * 100;

                            // Separate meters into area-renderable (apartment, solar, total) and line-only (charger)
                            const areaMeters = meters.filter(m => m.meter_type !== 'charger');
                            const lineMeters = meters.filter(m => m.meter_type === 'charger');

                            // Use AreaChart if no chargers, else LineChart
                            const useArea = lineMeters.length === 0;

                            return (
                              <div className="chart-container" style={{ width: '100%', height: '380px' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                  {useArea ? (
                                    <AreaChart data={chartData}>
                                      <defs>
                                        {areaMeters.map(meter => {
                                          const uniqueKey = getMeterUniqueKey(meter);
                                          const color = getMeterColor(meter.meter_type, meter.meter_id, meter.user_name);
                                          return (
                                            <linearGradient key={`grad-${uniqueKey}`} id={`grad-${uniqueKey}`} x1="0" y1="0" x2="0" y2="1">
                                              <stop offset="5%" stopColor={color} stopOpacity={0.2}/>
                                              <stop offset="95%" stopColor={color} stopOpacity={0.02}/>
                                            </linearGradient>
                                          );
                                        })}
                                      </defs>
                                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                      <XAxis dataKey="time" style={{ fontSize: '11px' }} stroke="#9ca3af"
                                        angle={period !== '1h' ? -45 : 0}
                                        textAnchor={period !== '1h' ? 'end' : 'middle'}
                                        height={period !== '1h' ? 70 : 30}
                                      />
                                      <YAxis domain={[domainMin, domainMax]}
                                        label={{ value: t('dashboard.powerUnit'), angle: -90, position: 'insideLeft', style: { fontSize: '11px' } }}
                                        style={{ fontSize: '11px' }} stroke="#9ca3af"
                                      />
                                      <ReferenceLine y={0} stroke="#d1d5db" strokeDasharray="3 3" />
                                      <Tooltip content={<CustomTooltip />} />
                                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                                      {areaMeters.map(meter => {
                                        const uniqueKey = getMeterUniqueKey(meter);
                                        const color = getMeterColor(meter.meter_type, meter.meter_id, meter.user_name);
                                        const isVisible = isMeterVisible(building.building_id, uniqueKey);
                                        if (!isVisible) return null;
                                        return (
                                          <Area
                                            key={uniqueKey}
                                            type="monotone"
                                            dataKey={uniqueKey}
                                            stroke={color}
                                            strokeWidth={2}
                                            fill={`url(#grad-${uniqueKey})`}
                                            name={getMeterDisplayName(meter, t)}
                                            dot={false}
                                            activeDot={{ r: 4, strokeWidth: 2 }}
                                            connectNulls
                                          />
                                        );
                                      })}
                                    </AreaChart>
                                  ) : (
                                    <LineChart data={chartData}>
                                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                      <XAxis dataKey="time" style={{ fontSize: '11px' }} stroke="#9ca3af"
                                        angle={period !== '1h' ? -45 : 0}
                                        textAnchor={period !== '1h' ? 'end' : 'middle'}
                                        height={period !== '1h' ? 70 : 30}
                                      />
                                      <YAxis domain={[domainMin, domainMax]}
                                        label={{ value: t('dashboard.powerUnit'), angle: -90, position: 'insideLeft', style: { fontSize: '11px' } }}
                                        style={{ fontSize: '11px' }} stroke="#9ca3af"
                                      />
                                      <ReferenceLine y={0} stroke="#d1d5db" strokeDasharray="3 3" />
                                      <Tooltip content={<CustomTooltip />} />
                                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                                      {meters.map(meter => {
                                        const uniqueKey = getMeterUniqueKey(meter);
                                        const isCharger = meter.meter_type === 'charger';
                                        const isSolar = meter.meter_type === 'solar_meter';
                                        const isBaseline = meter.user_name?.includes('(Baseline)');
                                        const color = getMeterColor(meter.meter_type, meter.meter_id, meter.user_name);
                                        const isVisible = isMeterVisible(building.building_id, uniqueKey);
                                        if (!isVisible) return null;
                                        return (
                                          <Line
                                            key={uniqueKey}
                                            type="monotone"
                                            dataKey={uniqueKey}
                                            stroke={color}
                                            strokeWidth={(isCharger || isSolar) ? 3 : 2}
                                            strokeDasharray={isCharger ? '8 4' : undefined}
                                            name={getMeterDisplayName(meter, t)}
                                            dot={false}
                                            activeDot={{ r: (isCharger || isSolar) ? 6 : 4 }}
                                            connectNulls={isBaseline ? false : true}
                                          />
                                        );
                                      })}
                                    </LineChart>
                                  )}
                                </ResponsiveContainer>
                              </div>
                            );
                          })() : meters.length > 0 ? (
                            <div style={{ textAlign: 'center', padding: '48px 20px', color: '#9ca3af' }}>
                              {t('dashboard.noConsumptionData')}<br />
                              <small>{t('dashboard.metersConfigured')}</small>
                            </div>
                          ) : (
                            <div style={{ textAlign: 'center', padding: '48px 20px', color: '#9ca3af' }}>
                              {t('dashboard.noMetersConfigured')}<br />
                              <small>{t('dashboard.addMeters')}</small>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            );
          })()}
        </div>
      ) : (
        <div style={{
          backgroundColor: 'white',
          padding: '48px 20px',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          textAlign: 'center',
          color: '#9ca3af'
        }}>
          <h3 style={{ marginTop: 0, color: '#6b7280' }}>{t('dashboard.noBuildings')}</h3>
          <p>{t('dashboard.createBuildings')}</p>
        </div>
      )}

      {/* ─── Styles ─────────────────────────────────────────────────── */}
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes shimmerAnim {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }

        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }

        .fade-in {
          animation: fadeSlideIn 0.4s ease-out both;
        }

        .shimmer {
          background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%) !important;
          background-size: 200% 100% !important;
          animation: shimmerAnim 1.5s infinite;
        }

        .hero-card {
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .hero-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 16px rgba(0,0,0,0.08) !important;
        }

        .search-input:focus {
          border-color: #667eea !important;
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }

        .period-select:focus {
          border-color: #667eea !important;
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }

        @media (max-width: 768px) {
          .dashboard-title {
            font-size: 24px !important;
          }
          .dashboard-icon {
            width: 24px !important;
            height: 24px !important;
          }
          .dashboard-subtitle {
            font-size: 13px !important;
          }
          .hero-stats {
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 12px !important;
          }
          .hero-card {
            padding: 16px !important;
          }
          .hero-card .hero-value {
            font-size: 22px !important;
          }
          .energy-flow {
            flex-direction: column !important;
            gap: 8px !important;
          }
          .flow-arrow {
            width: 3px !important;
            height: 30px !important;
            max-width: none !important;
            min-width: auto !important;
            margin: 0 auto !important;
          }
          .flow-arrow > div:first-child {
            /* arrow tip - adjust for vertical */
            right: auto !important;
            bottom: -6px !important;
            top: auto !important;
            left: -4px !important;
            border-left: 5px solid transparent !important;
            border-right: 5px solid transparent !important;
            border-top: 8px solid #6b7280 !important;
            border-bottom: none !important;
          }
          .flow-arrow > div:last-child {
            top: 50% !important;
            left: 16px !important;
            transform: translateY(-50%) !important;
          }
          .consumption-controls {
            flex-direction: column;
            align-items: stretch !important;
            padding: 12px !important;
          }
          .controls-group {
            width: 100%;
            flex-direction: column;
          }
          .search-input,
          .period-select {
            width: 100% !important;
            min-width: auto !important;
          }
          .building-card {
            border-radius: 10px !important;
          }
          .meter-legend {
            padding: 8px !important;
            gap: 6px !important;
          }
          .chart-container {
            height: 280px !important;
          }
          .system-overview-items {
            gap: 12px !important;
          }
        }

        @media (max-width: 480px) {
          .dashboard-title {
            font-size: 20px !important;
            gap: 8px !important;
          }
          .dashboard-icon {
            width: 20px !important;
            height: 20px !important;
          }
          .hero-stats {
            grid-template-columns: 1fr !important;
          }
          .chart-container {
            height: 240px !important;
          }
        }
      `}</style>
    </div>
  );
}

// ─── Small helper components ───────────────────────────────────────

function OverviewItem({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <Icon size={16} color={color} />
      <span style={{ fontSize: '13px', color: '#6b7280' }}>{label}:</span>
      <span style={{ fontSize: '13px', fontWeight: '700', color: '#1f2937' }}>{value}</span>
    </div>
  );
}

// ─── Style constants ───────────────────────────────────────────────

const heroCardStyle: React.CSSProperties = {
  backgroundColor: 'white',
  padding: '20px',
  borderRadius: '12px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
};

const heroIconStyle: React.CSSProperties = {
  width: '44px',
  height: '44px',
  borderRadius: '10px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};
