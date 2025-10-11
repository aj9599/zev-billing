import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Users, Building, Zap, Car, Activity, TrendingUp } from 'lucide-react';
import { api } from '../api/client';
import type { DashboardStats } from '../types';

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

// Color mapping for different meter types
const METER_COLORS: Record<string, string> = {
  'apartment_meter': '#10b981',    // Green
  'heating_meter': '#f59e0b',      // Orange
  'solar_meter': '#fbbf24',        // Yellow
  'total_meter': '#3b82f6',        // Blue
  'water_meter': '#06b6d4',        // Cyan
  'gas_meter': '#8b5cf6',          // Purple
  'default': '#6b7280'             // Gray
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
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [buildingData, setBuildingData] = useState<BuildingConsumption[]>([]);
  const [period, setPeriod] = useState('24h');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 60000);
    return () => clearInterval(interval);
  }, [period]);

  const loadData = async () => {
    try {
      const [statsData, buildingConsumption] = await Promise.all([
        api.getDashboardStats(),
        api.getConsumptionByBuilding(period)
      ]);
      setStats(statsData);
      setBuildingData(buildingConsumption);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div style={{ padding: '20px' }}>Loading...</div>;
  }

  const statCards = [
    { icon: Users, label: 'Total Users', value: stats?.total_users || 0, color: '#007bff' },
    { icon: Building, label: 'Buildings', value: stats?.total_buildings || 0, color: '#28a745' },
    { icon: Zap, label: 'Active Meters', value: `${stats?.active_meters}/${stats?.total_meters}`, color: '#ffc107' },
    { icon: Car, label: 'Active Chargers', value: `${stats?.active_chargers}/${stats?.total_chargers}`, color: '#6f42c1' },
    { icon: Activity, label: 'Today', value: `${stats?.today_consumption.toFixed(2)} kWh`, color: '#fd7e14' },
    { icon: TrendingUp, label: 'This Month', value: `${stats?.month_consumption.toFixed(2)} kWh`, color: '#20c997' },
  ];

  return (
    <div>
      <div style={{ marginBottom: '30px' }}>
        <h1 style={{ 
          fontSize: '36px', 
          fontWeight: '800', 
          marginBottom: '8px',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text'
        }}>
          Dashboard
        </h1>
        <p style={{ color: '#6b7280', fontSize: '16px' }}>
          Real-time overview of your energy management system
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

      {/* Period Selector */}
      <div style={{
        backgroundColor: 'white',
        padding: '20px',
        borderRadius: '12px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        marginBottom: '20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <h2 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>
          Consumption by Building
        </h2>
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
          <option value="1h">Last Hour</option>
          <option value="24h">Last 24 Hours</option>
          <option value="7d">Last 7 Days</option>
          <option value="30d">Last 30 Days</option>
        </select>
      </div>

      {/* Building Consumption Charts */}
      {buildingData.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
          {buildingData.map((building) => {
            // Prepare chart data - merge all meter readings by timestamp
            const timeMap = new Map<string, any>();
            
            building.meters.forEach(meter => {
              meter.data.forEach(reading => {
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

                {/* Legend */}
                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '12px',
                  marginBottom: '20px',
                  padding: '12px',
                  backgroundColor: '#f9fafb',
                  borderRadius: '8px'
                }}>
                  {building.meters.map(meter => (
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
                          value: 'kWh', 
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
                      />
                      <Legend 
                        wrapperStyle={{ fontSize: '12px' }}
                      />
                      {building.meters.map(meter => (
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
                ) : (
                  <div style={{ 
                    textAlign: 'center', 
                    padding: '60px', 
                    color: '#9ca3af' 
                  }}>
                    No consumption data available for this building in the selected period
                  </div>
                )}
              </div>
            );
          })}
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
          No consumption data available
        </div>
      )}
    </div>
  );
}