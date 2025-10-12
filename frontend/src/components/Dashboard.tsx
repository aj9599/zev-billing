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

const METER_COLORS: Record<string, string> = {
  'apartment_meter': '#10b981',
  'heating_meter': '#f59e0b',
  'solar_meter': '#fbbf24',
  'total_meter': '#3b82f6',
  'water_meter': '#06b6d4',
  'gas_meter': '#8b5cf6',
  'default': '#6b7280'
};

function getMeterColor(meterType: string): string {
  return METER_COLORS[meterType] || METER_COLORS.default;
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
    <div>
      <div style={{ marginBottom: '30px' }}>
        <h1 style={{ 
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
          <LayoutDashboard size={36} style={{ color: '#667eea' }} />
          {t('dashboard.title')}
        </h1>
        <p style={{ color: '#6b7280', fontSize: '16px' }}>
          {t('dashboard.subtitle')}
        </p>
      </div>

      <div style={{
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
                justifyContent: 'center'
              }}>
                <Icon size={24} color={card.color} />
              </div>
              <div>
                <div style={{ fontSize: '14px', color: '#666', marginBottom: '4px' }}>
                  {card.label}
                </div>
                <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
                  {card.value}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{
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
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <input
            type="text"
            placeholder={t('dashboard.searchBuildings')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
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
                  padding: '60px',
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
                  <div style={{
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
                            backgroundColor: getMeterColor(meter.meter_type)
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
                  <ResponsiveContainer width="100%" height={400}>
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
                          stroke={getMeterColor(meter.meter_type)}
                          strokeWidth={2}
                          name={getMeterDisplayName(meter)}
                          dot={false}
                          activeDot={{ r: 4 }}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                ) : meters.length > 0 ? (
                  <div style={{ 
                    textAlign: 'center', 
                    padding: '60px', 
                    color: '#9ca3af' 
                  }}>
                    {t('dashboard.noConsumptionData')}
                    <br />
                    <small>{t('dashboard.metersConfigured')}</small>
                  </div>
                ) : (
                  <div style={{ 
                    textAlign: 'center', 
                    padding: '60px', 
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
          padding: '60px',
          borderRadius: '12px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          textAlign: 'center',
          color: '#9ca3af'
        }}>
          <h3 style={{ marginTop: 0, color: '#6b7280' }}>{t('dashboard.noBuildings')}</h3>
          <p>{t('dashboard.createBuildings')}</p>
        </div>
      )}
    </div>
  );
}