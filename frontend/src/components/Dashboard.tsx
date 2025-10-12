import { useState, useEffect } from 'react';
import * as React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Users, Building, Zap, Car, Activity, TrendingUp, TrendingDown, Sun, Battery, LayoutDashboard } from 'lucide-react';
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

const FIXED_COLORS: Record<string, string> = {
  'solar_meter': '#fbbf24',
  'total_meter': '#3b82f6',
  'default': '#6b7280'
};

const apartmentColorMap = new Map<number, string>();

function getMeterColor(meterType: string, meterId?: number): string {
  if (meterType === 'apartment_meter' && meterId !== undefined) {
    if (!apartmentColorMap.has(meterId)) {
      const colorIndex = apartmentColorMap.size % APARTMENT_COLORS.length;
      apartmentColorMap.set(meterId, APARTMENT_COLORS[colorIndex]);
    }
    return apartmentColorMap.get(meterId)!;
  }
  return FIXED_COLORS[meterType] || FIXED_COLORS.default;
}

function getMeterDisplayName(meter: MeterData): string {
  if (meter.user_name) {
    return `${meter.meter_name} (${meter.user_name})`;
  }
  return meter.meter_name;
}

export default function Dashboard() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [buildingData, setBuildingData] = useState<BuildingConsumption[]>([]);
  const [period, setPeriod] = useState('24h');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const loadData = React.useCallback(async () => {
    try {
      setError(null);
      const [statsData, buildingConsumption] = await Promise.all([
        api.getDashboardStats(),
        api.getConsumptionByBuilding(period)
      ]);
      setStats(statsData);
      setBuildingData(Array.isArray(buildingConsumption) ? buildingConsumption : []);
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
        <h3 style={{ marginTop: 0 }}>Error loading dashboard</h3>
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
    { icon: Users, label: t('dashboard.totalUsers'), value: stats?.total_users || 0, color: '#007bff' },
    { icon: Building, label: t('dashboard.buildings'), value: stats?.total_buildings || 0, color: '#28a745' },
    { icon: Zap, label: t('dashboard.activeMeters'), value: `${stats?.active_meters}/${stats?.total_meters}`, color: '#ffc107' },
    { icon: Car, label: t('dashboard.activeChargers'), value: `${stats?.active_chargers}/${stats?.total_chargers}`, color: '#6f42c1' },
    { icon: Activity, label: t('dashboard.consumptionToday'), value: `${stats?.today_consumption.toFixed(2)} kWh`, color: '#dc3545' },
    { icon: TrendingUp, label: t('dashboard.consumptionMonth'), value: `${stats?.month_consumption.toFixed(2)} kWh`, color: '#e74c3c' },
    { icon: Sun, label: t('dashboard.solarToday'), value: `${stats?.today_solar.toFixed(2)} kWh`, color: '#f39c12' },
    { icon: TrendingDown, label: t('dashboard.solarMonth'), value: `${stats?.month_solar.toFixed(2)} kWh`, color: '#e67e22' },
    { icon: Battery, label: t('dashboard.chargingToday'), value: `${stats?.today_charging.toFixed(2)} kWh`, color: '#9b59b6' },
    { icon: Zap, label: t('dashboard.chargingMonth'), value: `${stats?.month_charging.toFixed(2)} kWh`, color: '#8e44ad' },
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
              <div style={{ minWidth: 0 }}>
                <div className="stat-label" style={{ fontSize: '14px', color: '#666', marginBottom: '4px' }}>
                  {card.label}
                </div>
                <div className="stat-value" style={{ fontSize: '24px', fontWeight: 'bold' }}>
                  {card.value}
                </div>
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
              readings.forEach(reading => {
                const time = new Date(reading.timestamp).toLocaleTimeString('de-CH', { 
                  hour: '2-digit', 
                  minute: '2-digit' 
                });
                
                if (!timeMap.has(time)) {
                  timeMap.set(time, { time });
                }
                
                const meterKey = `meter_${meter.meter_id}`;
                const current = timeMap.get(time);
                current[meterKey] = reading.power;
              });
            });

            const chartData = Array.from(timeMap.values()).sort((a, b) => {
              return a.time.localeCompare(b.time);
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
                    {meters.map(meter => (
                      <div
                        key={meter.meter_id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '4px 8px',
                          backgroundColor: 'white',
                          borderRadius: '4px',
                          fontSize: '13px'
                        }}
                      >
                        <div
                          style={{
                            width: '12px',
                            height: '12px',
                            borderRadius: '2px',
                            backgroundColor: getMeterColor(meter.meter_type, meter.meter_id),
                            flexShrink: 0
                          }}
                        />
                        <span style={{ fontWeight: '500' }}>
                          {getMeterDisplayName(meter)}
                        </span>
                        <span style={{ color: '#6b7280', fontSize: '12px' }}>
                          ({meter.meter_type.replace('_', ' ')})
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {chartData.length > 0 ? (
                  <div className="chart-container" style={{ width: '100%', height: '400px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis 
                          dataKey="time" 
                          style={{ fontSize: '12px' }}
                          stroke="#6b7280"
                        />
                        <YAxis 
                          label={{ 
                            value: 'Power (W)', 
                            angle: -90, 
                            position: 'insideLeft',
                            style: { fontSize: '12px' }
                          }}
                          style={{ fontSize: '12px' }}
                          stroke="#6b7280"
                        />
                        <Tooltip 
                          contentStyle={{
                            backgroundColor: 'white',
                            border: '1px solid #e5e7eb',
                            borderRadius: '6px'
                          }}
                          formatter={(value: number) => {
                            if (value >= 1000) {
                              return `${(value / 1000).toFixed(2)} kW`;
                            }
                            return `${value.toFixed(0)} W`;
                          }}
                        />
                        <Legend 
                          wrapperStyle={{ fontSize: '12px' }}
                        />
                        {meters.map(meter => (
                          <Line
                            key={meter.meter_id}
                            type="monotone"
                            dataKey={`meter_${meter.meter_id}`}
                            stroke={getMeterColor(meter.meter_type, meter.meter_id)}
                            strokeWidth={2}
                            name={getMeterDisplayName(meter)}
                            dot={false}
                            activeDot={{ r: 4 }}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : meters.length > 0 ? (
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