import { useEffect, useRef } from 'react';
import { useTranslation } from '../../i18n';

interface HealthDataPoint {
  timestamp: number;
  cpu_usage: number;
  memory_percent: number;
  disk_percent: number;
  temperature: number;
}

interface SystemHealthChartsProps {
  healthHistory: HealthDataPoint[];
}

export const SystemHealthCharts = ({ healthHistory }: SystemHealthChartsProps) => {
  const { t } = useTranslation();
  const cpuCanvasRef = useRef<HTMLCanvasElement>(null);
  const memoryCanvasRef = useRef<HTMLCanvasElement>(null);
  const diskCanvasRef = useRef<HTMLCanvasElement>(null);
  const tempCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (healthHistory.length === 0) return;

    drawChart(cpuCanvasRef.current, healthHistory, 'cpu_usage', '#667eea');
    drawChart(memoryCanvasRef.current, healthHistory, 'memory_percent', '#10b981');
    drawChart(diskCanvasRef.current, healthHistory, 'disk_percent', '#f59e0b');
    
    // Only draw temperature if we have temperature data
    const hasTempData = healthHistory.some(d => d.temperature > 0);
    if (hasTempData) {
      drawChart(tempCanvasRef.current, healthHistory, 'temperature', '#ef4444');
    }
  }, [healthHistory, t]);

  const drawChart = (
    canvas: HTMLCanvasElement | null,
    data: HealthDataPoint[],
    key: keyof HealthDataPoint,
    color: string
  ) => {
    if (!canvas || data.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    
    ctx.scale(dpr, dpr);
    
    const width = rect.width;
    const height = rect.height;
    const padding = 40;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Get values
    const values = data.map(d => typeof d[key] === 'number' ? d[key] : 0);
    const maxValue = key === 'temperature' ? 100 : 100; // Max percentage or temp

    // Draw grid lines
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding + (chartHeight / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
      
      // Draw y-axis labels
      ctx.fillStyle = '#9ca3af';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'right';
      const value = maxValue - (maxValue / 4) * i;
      ctx.fillText(value.toFixed(0) + (key === 'temperature' ? '°C' : '%'), padding - 10, y + 4);
    }

    // Draw line chart
    if (values.length > 0) {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      values.forEach((value, index) => {
        const x = padding + (chartWidth / (values.length - 1)) * index;
        const y = padding + chartHeight - (value / maxValue) * chartHeight;
        
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      
      ctx.stroke();

      // Fill area under line
      ctx.lineTo(width - padding, padding + chartHeight);
      ctx.lineTo(padding, padding + chartHeight);
      ctx.closePath();
      
      const gradient = ctx.createLinearGradient(0, padding, 0, height - padding);
      gradient.addColorStop(0, color + '40');
      gradient.addColorStop(1, color + '00');
      ctx.fillStyle = gradient;
      ctx.fill();
    }

    // Draw x-axis time labels
    ctx.fillStyle = '#9ca3af';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    
    const timeSteps = Math.min(6, data.length);
    for (let i = 0; i < timeSteps; i++) {
      const index = Math.floor((data.length - 1) * (i / (timeSteps - 1)));
      const point = data[index];
      const x = padding + (chartWidth / (timeSteps - 1)) * i;
      
      const date = new Date(point.timestamp);
      const timeStr = date.getHours().toString().padStart(2, '0') + ':' + 
                      date.getMinutes().toString().padStart(2, '0');
      ctx.fillText(timeStr, x, height - padding + 20);
    }
  };

  const hasTempData = healthHistory.some(d => d.temperature > 0);
  const gridCols = hasTempData ? 'repeat(auto-fit, minmax(500px, 1fr))' : 'repeat(auto-fit, minmax(500px, 1fr))';

  return (
    <div style={{ marginBottom: '30px', width: '100%' }}>
      <h2 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '16px', color: '#1f2937' }}>
        {t('logs.performance24h')}
      </h2>
      <div style={{
        display: 'grid',
        gridTemplateColumns: gridCols,
        gap: '20px',
        width: '100%'
      }}>
        <div className="chart-container" style={{
          backgroundColor: 'white',
          padding: '24px',
          borderRadius: '16px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          border: '2px solid #667eea'
        }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px', color: '#667eea' }}>
            {t('logs.cpuUsage')}
          </h3>
          <canvas
            ref={cpuCanvasRef}
            style={{ width: '100%', height: '300px' }}
          />
        </div>

        <div className="chart-container" style={{
          backgroundColor: 'white',
          padding: '24px',
          borderRadius: '16px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          border: '2px solid #10b981'
        }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px', color: '#10b981' }}>
            {t('logs.memoryUsage')}
          </h3>
          <canvas
            ref={memoryCanvasRef}
            style={{ width: '100%', height: '300px' }}
          />
        </div>

        <div className="chart-container" style={{
          backgroundColor: 'white',
          padding: '24px',
          borderRadius: '16px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          border: '2px solid #f59e0b'
        }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px', color: '#f59e0b' }}>
            {t('logs.diskUsage')}
          </h3>
          <canvas
            ref={diskCanvasRef}
            style={{ width: '100%', height: '300px' }}
          />
        </div>

        {hasTempData && (
          <div className="chart-container" style={{
            backgroundColor: 'white',
            padding: '24px',
            borderRadius: '16px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            border: '2px solid #ef4444'
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px', color: '#ef4444' }}>
              {t('logs.cpuTemperature')}
            </h3>
            <canvas
              ref={tempCanvasRef}
              style={{ width: '100%', height: '300px' }}
            />
          </div>
        )}
      </div>
    </div>
  );
};