import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Users, Building, Zap, Car, Activity, TrendingUp } from 'lucide-react';
import { api } from '../api/client';
import type { DashboardStats, ConsumptionData } from '../types';

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [consumption, setConsumption] = useState<ConsumptionData[]>([]);
  const [period, setPeriod] = useState('24h');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [period]);

  const loadData = async () => {
    try {
      const [statsData, consumptionData] = await Promise.all([
        api.getDashboardStats(),
        api.getConsumption(period)
      ]);
      setStats(statsData);
      setConsumption(consumptionData);
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

  const chartData = consumption.map(c => ({
    time: new Date(c.timestamp).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' }),
    power: c.power,
    source: c.source
  }));

  return (
    <div>
      <h1 style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '30px' }}>
        Dashboard
      </h1>

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
        padding: '24px',
        borderRadius: '12px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px'
        }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold' }}>
            Power Consumption
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

        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis label={{ value: 'kWh', angle: -90, position: 'insideLeft' }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="power" stroke="#007bff" strokeWidth={2} name="Power (kWh)" />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ textAlign: 'center', padding: '60px', color: '#999' }}>
            No consumption data available for this period
          </div>
        )}
      </div>
    </div>
  );
}