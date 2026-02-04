import { useState, useEffect } from 'react';
import * as React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Users, Building, Zap, Car, Activity, TrendingUp, TrendingDown, Sun, Battery, LayoutDashboard, Home, Eye, EyeOff } from 'lucide-react';
import { api } from '../api/client';
import type { DashboardStats } from '../types';
import { useTranslation } from '../i18n';

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

  // Match backend rounding logic exactly
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
    // Round up to next hour
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
  
  if (period === '24h') {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const time = date.toLocaleTimeString('de-CH', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    return `${day}.${month} ${time}`;
  }
  
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const time = date.toLocaleTimeString('de-CH', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  return `${day}.${month} ${time}`;
}

// Custom tooltip to show absolute values for solar
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div style={{
        backgroundColor: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: '6px',
        padding: '10px',
        fontSize: '12px'
      }}>
        <p style={{ fontWeight: 'bold', marginBottom: '5px' }}>{label}</p>
        {payload.map((entry: any, index: number) => {
          const value = Math.abs(entry.value);
          const displayValue = value >= 1000 
            ? `${(value / 1000).toFixed(2)} kW` 
            : `${value.toFixed(0)} W`;
          
          // Check if this is solar (negative value means export/generation)
          const isSolar = entry.value < 0;
          const prefix = isSolar ? '☀ ' : '';
          
          return (
            <p key={index} style={{ color: entry.color, margin: '3px 0' }}>
              {prefix}{entry.name}: {displayValue}
            </p>
          );
        })}
      </div>
    );
  }
  return null;
};

export default function Dashboard() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [buildingData, setBuildingData] = useState<BuildingConsumption[]>([]);
  const [period, setPeriod] = useState('24h');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Track visible meters for each building
  const [visibleMetersByBuilding, setVisibleMetersByBuilding] = useState<Map<number, Set<string>>>(new Map());
  const visibilityInitialized = React.useRef(false);

  const loadData = React.useCallback(async () => {
    try {
      setError(null);
      const [statsData, buildingConsumption] = await Promise.all([
        api.getDashboardStats(),
        api.getConsumptionByBuilding(period)
      ]);
      setStats(statsData);
      
      setBuildingData(Array.isArray(buildingConsumption) ? buildingConsumption : []);
      
      // Only initialize visibility on first load, preserve user toggles on refresh
      if (!visibilityInitialized.current) {
        const initialVisibility = new Map<number, Set<string>>();
        if (Array.isArray(buildingConsumption)) {
          buildingConsumption.forEach(building => {
            const visibleSet = new Set<string>();
            building.meters?.forEach(meter => {
              visibleSet.add(getMeterUniqueKey(meter));
            });
            initialVisibility.set(building.building_id, visibleSet);
          });
        }
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

  // Toggle meter visibility
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

  // Check if meter is visible
  const isMeterVisible = (buildingId: number, meterKey: string): boolean => {
    const buildingVisible = visibleMetersByBuilding.get(buildingId);
    return buildingVisible ? buildingVisible.has(meterKey) : true;
  };

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        minHeight: '400px',
        fontSize: '18px',
        color: '#666'
      }}>
        {t('common.loading')}
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        padding: '30px',
        backgroundColor: '#fee',
        borderRadius: '8px',
        color: '#c00',
        marginBottom: '20px'
      }}>
        <h3 style={{ marginTop: 0 }}>{t('dashboard.errorLoading')}</h3>
        <p>{error}</p>
        <button 
          onClick={() => { setLoading(true); loadData(); }}
          style={{
            padding: '10px 20px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          {t('logs.refresh')}
        </button>
      </div>
    );
  }

  const statCards = [
    { 
      icon: Users, 
      label: t('dashboard.totalUsers'), 
      value: stats?.total_users || 0,
      subValue: `${stats?.regular_users || 0} / ${stats?.admin_users || 0}`,
      subLabel: t('dashboard.residentsAdmin'),
      color: '#007bff' 
    },
    { 
      icon: Building, 
      label: t('dashboard.buildings'), 
      value: stats?.total_buildings || 0,
      subValue: stats?.total_complexes ? `${stats.total_complexes} ${stats.total_complexes === 1 ? t('dashboard.complex') : t('dashboard.complexes')}` : undefined,
      color: '#28a745' 
    },
    { 
      icon: Zap, 
      label: t('dashboard.activeMeters'), 
      value: `${stats?.active_meters}/${stats?.total_meters}`, 
      color: '#ffc107' 
    },
    { 
      icon: Car, 
      label: t('dashboard.activeChargers'), 
      value: `${stats?.active_chargers}/${stats?.total_chargers}`, 
      color: '#6f42c1' 
    },
    { 
      icon: Activity, 
      label: t('dashboard.consumptionToday'), 
      value: `${stats?.today_consumption.toFixed(2)} kWh`, 
      color: '#dc3545' 
    },
    { 
      icon: TrendingUp, 
      label: t('dashboard.consumptionMonth'), 
      value: `${stats?.month_consumption.toFixed(2)} kWh`, 
      color: '#e74c3c' 
    },
    { 
      icon: Sun, 
      label: t('dashboard.solarToday'), 
      value: `${stats?.today_solar.toFixed(2)} kWh`, 
      color: '#f39c12' 
    },
    { 
      icon: TrendingDown, 
      label: t('dashboard.solarMonth'), 
      value: `${stats?.month_solar.toFixed(2)} kWh`, 
      color: '#e67e22' 
    },
    { 
      icon: Battery, 
      label: t('dashboard.chargingToday'), 
      value: `${stats?.today_charging.toFixed(2)} kWh`, 
      color: '#9b59b6' 
    },
    { 
      icon: Zap, 
      label: t('dashboard.chargingMonth'), 
      value: `${stats?.month_charging.toFixed(2)} kWh`, 
      color: '#8e44ad' 
    },
  ];

  return (
    <div className="dashboard-container">
      <div className="dashboard-header" style={{ marginBottom: '30px' }}>
        <h1 className="dashboard-title" style={{ 
            fontSize: '36px', 
            fontWeight: '800', 
            marginBottom: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
        }}>
          <LayoutDashboard className="dashboard-icon" size={36} style={{ color: '#667eea' }} />
          {t('dashboard.title')}
        </h1>
        <p className="dashboard-subtitle" style={{ color: '#6b7280', fontSize: '16px' }}>
          {t('dashboard.subtitle')}
        </p>
      </div>

      <div className="stats-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '20px',
        marginBottom: '30px'
      }}>
        {statCards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <div
              key={idx}
              className="stat-card"
              style={{
                backgroundColor: 'white',
                padding: '24px',
                borderRadius: '12px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                display: 'flex',
                alignItems: 'center',
                gap: '16px'
              }}
            >
              <div style={{
                width: '50px',
                height: '50px',
                borderRadius: '10px',
                backgroundColor: card.color + '20',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <Icon size={24} color={card.color} />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="stat-label" style={{ fontSize: '14px', color: '#666', marginBottom: '4px' }}>
                  {card.label}
                </div>
                <div className="stat-value" style={{ fontSize: '24px', fontWeight: 'bold' }}>
                  {card.value}
                </div>
                {card.subValue && (
                  <div style={{ 
                    fontSize: '12px', 
                    color: '#9ca3af', 
                    marginTop: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    {card.subLabel && <span style={{ fontSize: '11px' }}>{card.subLabel}:</span>}
                    <span style={{ fontWeight: '600', color: '#6b7280' }}>{card.subValue}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="consumption-controls" style={{
        backgroundColor: 'white',
        padding: '20px',
        borderRadius: '12px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        marginBottom: '20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '15px'
      }}>
        <h2 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>
          {t('dashboard.consumptionByBuilding')}
        </h2>
        <div className="controls-group" style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder={t('dashboard.searchBuildings')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
            style={{
              padding: '8px 12px',
              border: '1px solid #ddd',
              borderRadius: '6px',
              fontSize: '14px',
              minWidth: '200px'
            }}
          />
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="period-select"
            style={{
              padding: '8px 12px',
              border: '1px solid #ddd',
              borderRadius: '6px',
              fontSize: '14px'
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
          {(() => {
            const filteredBuildings = buildingData.filter(building => 
              building.building_name.toLowerCase().includes(searchQuery.toLowerCase())
            );

            if (filteredBuildings.length === 0 && searchQuery) {
              return (
                <div style={{
                  backgroundColor: 'white',
                  padding: '60px 20px',
                  borderRadius: '12px',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
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
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      marginTop: '10px'
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
                    padding: '12px 16px',
                    backgroundColor: '#f0f9ff',
                    borderRadius: '8px',
                    fontSize: '14px',
                    color: '#0369a1',
                    border: '1px solid #bae6fd'
                  }}>
                    {t('dashboard.showingBuildings')
                      .replace('{count}', filteredBuildings.length.toString())
                      .replace('{total}', buildingData.length.toString())}
                  </div>
                )}
                {filteredBuildings.map((building) => {
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
                
                // For all meter types, use the power value directly
                // Solar export is already negative from backend
                if (isCharger || isSolar || reading.power !== 0) {
                  current[meterKey] = reading.power;
                }
              });
            });

            const chartData = Array.from(timeMap.values()).sort((a, b) => {
              return a.sortKey - b.sortKey;
            });
            
            return (
              <div
                key={building.building_id}
                className="building-card"
                style={{
                  backgroundColor: 'white',
                  padding: '24px',
                  borderRadius: '12px',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}
              >
                <h3 style={{ 
                  fontSize: '20px', 
                  fontWeight: 'bold', 
                  marginBottom: '20px',
                  color: '#1f2937'
                }}>
                  {building.building_name}
                </h3>

                {meters.length > 0 && (
                  <div className="meter-legend" style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '12px',
                    marginBottom: '20px',
                    padding: '12px',
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
                            padding: '6px 10px',
                            backgroundColor: 'white',
                            borderRadius: '6px',
                            fontSize: '13px',
                            border: (isCharger || isSolar) ? `2px solid ${color}30` : '1px solid #e5e7eb',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            opacity: isVisible ? 1 : 0.5,
                            textDecoration: isVisible ? 'none' : 'line-through',
                            userSelect: 'none'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-1px)';
                            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = 'none';
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {isVisible ? (
                              <Eye size={14} color={color} style={{ flexShrink: 0 }} />
                            ) : (
                              <EyeOff size={14} color="#9ca3af" style={{ flexShrink: 0 }} />
                            )}
                            <div
                              style={{
                                width: '12px',
                                height: '12px',
                                borderRadius: '2px',
                                backgroundColor: isVisible ? color : '#d1d5db',
                                flexShrink: 0,
                                border: (isCharger || isSolar) ? `2px solid ${isVisible ? color : '#9ca3af'}` : 'none'
                              }}
                            />
                          </div>
                          <span style={{ 
                            fontWeight: (isCharger || isSolar) ? '600' : '500',
                            color: isVisible ? '#1f2937' : '#9ca3af'
                          }}>
                            {getMeterDisplayName(meter, t)}
                          </span>
                          <span style={{ 
                            color: isVisible ? '#6b7280' : '#9ca3af', 
                            fontSize: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}>
                            <TypeIcon size={12} />
                            {typeLabel}
                          </span>
                          {meter.data.length > 0 && (
                            <span style={{
                              color: isVisible ? '#10b981' : '#9ca3af',
                              fontSize: '11px',
                              fontWeight: '600',
                              marginLeft: '4px'
                            }}>
                              {meter.data.length} {t('dashboard.dataPoints')}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {chartData.length > 0 ? (() => {
                  // Calculate Y-axis domain based on visible meters only
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

                  // Add 10% padding
                  const padding = Math.max((yMax - yMin) * 0.1, 100);
                  const domainMin = Math.floor((yMin - padding) / 100) * 100;
                  const domainMax = Math.ceil((yMax + padding) / 100) * 100;

                  return (
                  <div className="chart-container" style={{ width: '100%', height: '400px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis
                          dataKey="time"
                          style={{ fontSize: '12px' }}
                          stroke="#6b7280"
                          angle={period === '24h' || period === '7d' || period === '30d' ? -45 : 0}
                          textAnchor={period === '24h' || period === '7d' || period === '30d' ? 'end' : 'middle'}
                          height={period === '24h' || period === '7d' || period === '30d' ? 80 : 30}
                        />
                        <YAxis
                          domain={[domainMin, domainMax]}
                          label={{
                            value: t('dashboard.powerUnit'),
                            angle: -90,
                            position: 'insideLeft',
                            style: { fontSize: '12px' }
                          }}
                          style={{ fontSize: '12px' }}
                          stroke="#6b7280"
                        />
                        <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="3 3" />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend 
                          wrapperStyle={{ fontSize: '12px' }}
                        />
                        {meters.map(meter => {
                          const uniqueKey = getMeterUniqueKey(meter);
                          const isCharger = meter.meter_type === 'charger';
                          const isSolar = meter.meter_type === 'solar_meter';
                          const isBaseline = meter.user_name?.includes('(Baseline)');
                          const color = getMeterColor(meter.meter_type, meter.meter_id, meter.user_name);
                          const isVisible = isMeterVisible(building.building_id, uniqueKey);
                          
                          // Only render visible lines
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
                    </ResponsiveContainer>
                  </div>
                  );
                })() : meters.length > 0 ? (
                  <div style={{ 
                    textAlign: 'center', 
                    padding: '60px 20px', 
                    color: '#9ca3af' 
                  }}>
                    {t('dashboard.noConsumptionData')}
                    <br />
                    <small>{t('dashboard.metersConfigured')}</small>
                  </div>
                ) : (
                  <div style={{ 
                    textAlign: 'center', 
                    padding: '60px 20px', 
                    color: '#9ca3af' 
                  }}>
                    {t('dashboard.noMetersConfigured')}
                    <br />
                    <small>{t('dashboard.addMeters')}</small>
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
          padding: '60px 20px',
          borderRadius: '12px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          textAlign: 'center',
          color: '#9ca3af'
        }}>
          <h3 style={{ marginTop: 0, color: '#6b7280' }}>{t('dashboard.noBuildings')}</h3>
          <p>{t('dashboard.createBuildings')}</p>
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .dashboard-title {
            font-size: 24px !important;
          }

          .dashboard-icon {
            width: 24px !important;
            height: 24px !important;
          }

          .dashboard-subtitle {
            font-size: 14px !important;
          }

          .stats-grid {
            grid-template-columns: 1fr !important;
            gap: 15px !important;
          }

          .stat-card {
            padding: 16px !important;
          }

          .stat-value {
            font-size: 20px !important;
          }

          .consumption-controls {
            flex-direction: column;
            align-items: stretch !important;
            padding: 15px !important;
          }

          .consumption-controls h2 {
            font-size: 18px !important;
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
            padding: 16px !important;
          }

          .building-card h3 {
            font-size: 18px !important;
          }

          .meter-legend {
            padding: 8px !important;
            gap: 8px !important;
          }

          .chart-container {
            height: 300px !important;
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

          .stat-card {
            padding: 12px !important;
            gap: 12px !important;
          }

          .stat-card > div:first-child {
            width: 40px !important;
            height: 40px !important;
          }

          .stat-card > div:first-child svg {
            width: 20px !important;
            height: 20px !important;
          }

          .stat-label {
            font-size: 12px !important;
          }

          .stat-value {
            font-size: 18px !important;
          }

          .chart-container {
            height: 250px !important;
          }
        }
      `}</style>
    </div>
  );
}