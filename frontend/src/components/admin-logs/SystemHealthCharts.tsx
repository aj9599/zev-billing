import { useEffect, useRef, useState } from 'react';
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
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const cpuCanvasRef = useRef<HTMLCanvasElement>(null);
  const memoryCanvasRef = useRef<HTMLCanvasElement>(null);
  const diskCanvasRef = useRef<HTMLCanvasElement>(null);
  const tempCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    // Validate healthHistory exists and is an array
    if (!healthHistory || !Array.isArray(healthHistory) || healthHistory.length === 0) return;

    // Filter out any invalid data points
    const validHistory = healthHistory.filter(d => 
      d && 
      typeof d === 'object' && 
      typeof d.timestamp === 'number' &&
      typeof d.cpu_usage === 'number' &&
      typeof d.memory_percent === 'number' &&
      typeof d.disk_percent === 'number'
    );

    if (validHistory.length === 0) return;

    drawChart(cpuCanvasRef.current, validHistory, 'cpu_usage', '#667eea');
    drawChart(memoryCanvasRef.current, validHistory, 'memory_percent', '#10b981');
    drawChart(diskCanvasRef.current, validHistory, 'disk_percent', '#f59e0b');
    
    // Only draw temperature if we have temperature data
    const hasTempData = validHistory.some(d => d.temperature > 0);
    if (hasTempData) {
      drawChart(tempCanvasRef.current, validHistory, 'temperature', '#ef4444');
    }
  }, [healthHistory, isMobile]);

  const drawChart = (
    canvas: HTMLCanvasElement | null,
    data: HealthDataPoint[],
    key: keyof HealthDataPoint,
    color: string
  ) => {
    if (!canvas || data.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Get container dimensions
    const container = canvas.parentElement;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    
    // Set canvas size based on container
    const displayWidth = rect.width;
    const displayHeight = Math.min(300, isMobile ? 200 : 300);
    
    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;
    
    canvas.style.width = displayWidth + 'px';
    canvas.style.height = displayHeight + 'px';
    
    ctx.scale(dpr, dpr);
    
    const width = displayWidth;
    const height = displayHeight;
    
    // Responsive padding
    const padding = isMobile ? 35 : 40;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Get values - filter to remove invalid data
    const values = data
      .filter(d => d && typeof d === 'object' && typeof d[key] === 'number')
      .map(d => d[key] as number);
    
    if (values.length === 0) return;
    
    const maxValue = key === 'temperature' ? 100 : 100;

    // Draw grid lines
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    const gridLines = isMobile ? 4 : 4;
    for (let i = 0; i <= gridLines; i++) {
      const y = padding + (chartHeight / gridLines) * i;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
      
      // Draw y-axis labels
      ctx.fillStyle = '#9ca3af';
      ctx.font = isMobile ? '10px sans-serif' : '12px sans-serif';
      ctx.textAlign = 'right';
      const value = maxValue - (maxValue / gridLines) * i;
      ctx.fillText(value.toFixed(0) + (key === 'temperature' ? '°C' : '%'), padding - 5, y + 3);
    }

    // Draw line chart
    if (values.length > 0) {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = isMobile ? 1.5 : 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      values.forEach((value, index) => {
        const x = padding + (chartWidth / Math.max(values.length - 1, 1)) * index;
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
    ctx.font = isMobile ? '9px sans-serif' : '12px sans-serif';
    ctx.textAlign = 'center';
    
    const validData = data.filter(d => d && typeof d === 'object' && d.timestamp);
    
    if (validData.length > 0) {
      const timeSteps = isMobile ? 4 : 6;
      const actualSteps = Math.min(timeSteps, validData.length);
      
      for (let i = 0; i < actualSteps; i++) {
        const index = Math.floor((validData.length - 1) * (i / Math.max(actualSteps - 1, 1)));
        const point = validData[index];
        
        if (point && point.timestamp) {
          const x = padding + (chartWidth / Math.max(actualSteps - 1, 1)) * i;
          
          const date = new Date(point.timestamp);
          const timeStr = date.getHours().toString().padStart(2, '0') + ':' + 
                          date.getMinutes().toString().padStart(2, '0');
          ctx.fillText(timeStr, x, height - padding + (isMobile ? 15 : 20));
        }
      }
    }
  };

  const hasTempData = healthHistory && Array.isArray(healthHistory) && 
                      healthHistory.some(d => d && d.temperature > 0);

  return (
    <div style={{ marginBottom: isMobile ? '20px' : '30px', width: '100%' }}>
      <h2 style={{ 
        fontSize: isMobile ? '18px' : '20px', 
        fontWeight: '700', 
        marginBottom: '12px', 
        color: '#1f2937',
        paddingLeft: '4px'
      }}>
        {t('logs.performance24h')}
      </h2>
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: isMobile ? '12px' : '20px',
        width: '100%'
      }}>
        <div className="chart-container" style={{
          backgroundColor: 'white',
          padding: isMobile ? '16px' : '24px',
          borderRadius: '12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          border: '2px solid #667eea'
        }}>
          <h3 style={{ 
            fontSize: isMobile ? '14px' : '16px', 
            fontWeight: '600', 
            marginBottom: '12px', 
            color: '#667eea' 
          }}>
            {t('logs.cpuUsage')}
          </h3>
          <canvas
            ref={cpuCanvasRef}
            style={{ width: '100%', display: 'block' }}
          />
        </div>

        <div className="chart-container" style={{
          backgroundColor: 'white',
          padding: isMobile ? '16px' : '24px',
          borderRadius: '12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          border: '2px solid #10b981'
        }}>
          <h3 style={{ 
            fontSize: isMobile ? '14px' : '16px', 
            fontWeight: '600', 
            marginBottom: '12px', 
            color: '#10b981' 
          }}>
            {t('logs.memoryUsage')}
          </h3>
          <canvas
            ref={memoryCanvasRef}
            style={{ width: '100%', display: 'block' }}
          />
        </div>

        <div className="chart-container" style={{
          backgroundColor: 'white',
          padding: isMobile ? '16px' : '24px',
          borderRadius: '12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          border: '2px solid #f59e0b'
        }}>
          <h3 style={{ 
            fontSize: isMobile ? '14px' : '16px', 
            fontWeight: '600', 
            marginBottom: '12px', 
            color: '#f59e0b' 
          }}>
            {t('logs.diskUsage')}
          </h3>
          <canvas
            ref={diskCanvasRef}
            style={{ width: '100%', display: 'block' }}
          />
        </div>

        {hasTempData && (
          <div className="chart-container" style={{
            backgroundColor: 'white',
            padding: isMobile ? '16px' : '24px',
            borderRadius: '12px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            border: '2px solid #ef4444'
          }}>
            <h3 style={{ 
              fontSize: isMobile ? '14px' : '16px', 
              fontWeight: '600', 
              marginBottom: '12px', 
              color: '#ef4444' 
            }}>
              {t('logs.cpuTemperature')}
            </h3>
            <canvas
              ref={tempCanvasRef}
              style={{ width: '100%', display: 'block' }}
            />
          </div>
        )}
      </div>
    </div>
  );
};