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

  // DEBUG: Log everything on mount and when healthHistory changes
  useEffect(() => {
    console.log('=== SystemHealthCharts Debug ===');
    console.log('healthHistory received:', healthHistory);
    console.log('healthHistory type:', typeof healthHistory);
    console.log('healthHistory is array?', Array.isArray(healthHistory));
    console.log('healthHistory length:', healthHistory?.length);
    
    if (healthHistory && healthHistory.length > 0) {
      console.log('First data point:', healthHistory[0]);
      console.log('Last data point:', healthHistory[healthHistory.length - 1]);
      
      // Check values
      const cpuValues = healthHistory.map(d => d.cpu_usage);
      const memoryValues = healthHistory.map(d => d.memory_percent);
      const diskValues = healthHistory.map(d => d.disk_percent);
      const tempValues = healthHistory.map(d => d.temperature);
      
      console.log('CPU values:', cpuValues.slice(0, 5), '...');
      console.log('Memory values:', memoryValues.slice(0, 5), '...');
      console.log('Disk values:', diskValues.slice(0, 5), '...');
      console.log('Temperature values:', tempValues.slice(0, 5), '...');
      
      console.log('Any CPU > 0?', cpuValues.some(v => v > 0));
      console.log('Any Memory > 0?', memoryValues.some(v => v > 0));
      console.log('Any Disk > 0?', diskValues.some(v => v > 0));
      console.log('Any Temperature > 0?', tempValues.some(v => v > 0));
    }
  }, [healthHistory]);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    // Validate healthHistory exists and is an array
    if (!healthHistory || !Array.isArray(healthHistory)) {
      console.error('❌ healthHistory is not an array:', healthHistory);
      return;
    }
    
    if (healthHistory.length === 0) {
      console.warn('⚠️ healthHistory is empty - no data to display');
      return;
    }

    // Filter out any invalid data points
    const validHistory = healthHistory.filter(d => 
      d && 
      typeof d === 'object' && 
      typeof d.timestamp === 'number' &&
      typeof d.cpu_usage === 'number' &&
      typeof d.memory_percent === 'number' &&
      typeof d.disk_percent === 'number'
    );

    console.log('✓ Valid data points:', validHistory.length, 'out of', healthHistory.length);

    if (validHistory.length === 0) {
      console.error('❌ No valid data points after filtering');
      return;
    }

    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      console.log('🎨 Starting to draw charts...');
      drawChart(cpuCanvasRef.current, validHistory, 'cpu_usage', '#667eea');
      drawChart(memoryCanvasRef.current, validHistory, 'memory_percent', '#10b981');
      drawChart(diskCanvasRef.current, validHistory, 'disk_percent', '#f59e0b');
      
      // Only draw temperature if we have temperature data
      const hasTempData = validHistory.some(d => d.temperature > 0);
      console.log('🌡️ Temperature data available?', hasTempData);
      if (hasTempData) {
        drawChart(tempCanvasRef.current, validHistory, 'temperature', '#ef4444');
      } else {
        console.warn('⚠️ No temperature data (all values are 0)');
      }
    });
  }, [healthHistory, isMobile]);

  const drawChart = (
    canvas: HTMLCanvasElement | null,
    data: HealthDataPoint[],
    key: keyof HealthDataPoint,
    color: string
  ) => {
    console.log(`📊 Drawing ${key} chart...`);
    
    if (!canvas) {
      console.error(`❌ Canvas is null for ${key}`);
      return;
    }
    
    if (data.length === 0) {
      console.error(`❌ No data for ${key}`);
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.error(`❌ Could not get 2d context for ${key}`);
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    console.log(`  Canvas rect for ${key}:`, rect);
    
    // Use fixed height like the old working version
    const height = isMobile ? 250 : 300;
    
    canvas.width = rect.width * dpr;
    canvas.height = height * dpr;
    
    canvas.style.width = rect.width + 'px';
    canvas.style.height = height + 'px';
    
    ctx.scale(dpr, dpr);
    
    const width = rect.width;
    const padding = isMobile ? 35 : 40;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    console.log(`  Drawing area for ${key}: ${chartWidth}x${chartHeight}`);

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Get values - filter to remove invalid data
    const values = data
      .filter(d => d && typeof d === 'object' && typeof d[key] === 'number')
      .map(d => d[key] as number);
    
    console.log(`  Values for ${key}:`, values.slice(0, 10), '... (showing first 10)');
    console.log(`  Min: ${Math.min(...values)}, Max: ${Math.max(...values)}, Avg: ${(values.reduce((a,b) => a+b, 0) / values.length).toFixed(1)}`);
    
    if (values.length === 0) {
      console.error(`❌ No values extracted for ${key}`);
      return;
    }
    
    const maxValue = key === 'temperature' ? 100 : 100;

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
      ctx.font = isMobile ? '10px sans-serif' : '12px sans-serif';
      ctx.textAlign = 'right';
      const value = maxValue - (maxValue / 4) * i;
      ctx.fillText(value.toFixed(0) + (key === 'temperature' ? '°C' : '%'), padding - 10, y + 4);
    }

    console.log(`  ✓ Grid lines drawn for ${key}`);

    // Draw line chart
    if (values.length > 0) {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      let pointsDrawn = 0;
      values.forEach((value, index) => {
        const x = padding + (chartWidth / (values.length - 1)) * index;
        const y = padding + chartHeight - (value / maxValue) * chartHeight;
        
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
        pointsDrawn++;
      });
      
      console.log(`  ✓ Line path created with ${pointsDrawn} points for ${key}`);
      ctx.stroke();
      console.log(`  ✓ Line drawn for ${key}`);

      // Fill area under line
      ctx.lineTo(width - padding, padding + chartHeight);
      ctx.lineTo(padding, padding + chartHeight);
      ctx.closePath();
      
      const gradient = ctx.createLinearGradient(0, padding, 0, height - padding);
      gradient.addColorStop(0, color + '40');
      gradient.addColorStop(1, color + '00');
      ctx.fillStyle = gradient;
      ctx.fill();
      
      console.log(`  ✓ Gradient fill applied for ${key}`);
    }

    // Draw x-axis time labels
    ctx.fillStyle = '#9ca3af';
    ctx.font = isMobile ? '10px sans-serif' : '12px sans-serif';
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
          ctx.fillText(timeStr, x, height - padding + 20);
        }
      }
      console.log(`  ✓ Time labels drawn for ${key}`);
    }
    
    console.log(`✅ Successfully completed drawing ${key} chart`);
  };

  const hasTempData = healthHistory && Array.isArray(healthHistory) && 
                      healthHistory.some(d => d && d.temperature > 0);

  // Show debug info if no data
  if (!healthHistory || healthHistory.length === 0) {
    return (
      <div style={{ 
        marginBottom: '30px', 
        padding: '40px', 
        backgroundColor: '#fee2e2',
        borderRadius: '12px',
        border: '2px solid #dc2626'
      }}>
        <h2 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '16px', color: '#991b1b' }}>
          ⚠️ No Chart Data Available
        </h2>
        <p style={{ color: '#7f1d1d', marginBottom: '12px' }}>
          The health history is empty. Check browser console for details.
        </p>
        <p style={{ color: '#7f1d1d', fontSize: '14px' }}>
          Open DevTools Console (F12) to see debug information.
        </p>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: isMobile ? '20px' : '30px', width: '100%' }}>
      <h2 style={{ 
        fontSize: isMobile ? '18px' : '20px', 
        fontWeight: '700', 
        marginBottom: isMobile ? '12px' : '16px', 
        color: '#1f2937' 
      }}>
        {t('logs.performance24h')} ({healthHistory.length} data points)
      </h2>
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(450px, 1fr))',
        gap: isMobile ? '16px' : '20px',
        width: '100%'
      }}>
        <div className="chart-container" style={{
          backgroundColor: 'white',
          padding: isMobile ? '16px' : '24px',
          borderRadius: isMobile ? '12px' : '16px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          border: '2px solid #667eea'
        }}>
          <h3 style={{ 
            fontSize: isMobile ? '14px' : '16px', 
            fontWeight: '600', 
            marginBottom: isMobile ? '12px' : '16px', 
            color: '#667eea' 
          }}>
            {t('logs.cpuUsage')}
          </h3>
          <canvas
            ref={cpuCanvasRef}
            style={{ width: '100%', height: isMobile ? '250px' : '300px', display: 'block' }}
          />
        </div>

        <div className="chart-container" style={{
          backgroundColor: 'white',
          padding: isMobile ? '16px' : '24px',
          borderRadius: isMobile ? '12px' : '16px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          border: '2px solid #10b981'
        }}>
          <h3 style={{ 
            fontSize: isMobile ? '14px' : '16px', 
            fontWeight: '600', 
            marginBottom: isMobile ? '12px' : '16px', 
            color: '#10b981' 
          }}>
            {t('logs.memoryUsage')}
          </h3>
          <canvas
            ref={memoryCanvasRef}
            style={{ width: '100%', height: isMobile ? '250px' : '300px', display: 'block' }}
          />
        </div>

        <div className="chart-container" style={{
          backgroundColor: 'white',
          padding: isMobile ? '16px' : '24px',
          borderRadius: isMobile ? '12px' : '16px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          border: '2px solid #f59e0b'
        }}>
          <h3 style={{ 
            fontSize: isMobile ? '14px' : '16px', 
            fontWeight: '600', 
            marginBottom: isMobile ? '12px' : '16px', 
            color: '#f59e0b' 
          }}>
            {t('logs.diskUsage')}
          </h3>
          <canvas
            ref={diskCanvasRef}
            style={{ width: '100%', height: isMobile ? '250px' : '300px', display: 'block' }}
          />
        </div>

        {hasTempData && (
          <div className="chart-container" style={{
            backgroundColor: 'white',
            padding: isMobile ? '16px' : '24px',
            borderRadius: isMobile ? '12px' : '16px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            border: '2px solid #ef4444'
          }}>
            <h3 style={{ 
              fontSize: isMobile ? '14px' : '16px', 
              fontWeight: '600', 
              marginBottom: isMobile ? '12px' : '16px', 
              color: '#ef4444' 
            }}>
              {t('logs.cpuTemperature')}
            </h3>
            <canvas
              ref={tempCanvasRef}
              style={{ width: '100%', height: isMobile ? '250px' : '300px', display: 'block' }}
            />
          </div>
        )}
      </div>
    </div>
  );
};