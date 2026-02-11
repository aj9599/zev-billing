import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '../../i18n';
import { Activity } from 'lucide-react';

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
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  // Track window resize for responsive canvas redraw
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
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

    const mobile = window.innerWidth <= 768;
    drawChart(cpuCanvasRef.current, validHistory, 'cpu_usage', '#667eea', mobile);
    drawChart(memoryCanvasRef.current, validHistory, 'memory_percent', '#10b981', mobile);
    drawChart(diskCanvasRef.current, validHistory, 'disk_percent', '#f59e0b', mobile);

    // Only draw temperature if we have temperature data
    const hasTempData = validHistory.some(d => d.temperature > 0);
    if (hasTempData) {
      drawChart(tempCanvasRef.current, validHistory, 'temperature', '#ef4444', mobile);
    }
  }, [healthHistory, t, isMobile]);

  const drawChart = (
    canvas: HTMLCanvasElement | null,
    data: HealthDataPoint[],
    key: keyof HealthDataPoint,
    color: string,
    mobile: boolean
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
    const paddingLeft = mobile ? 32 : 40;
    const paddingRight = mobile ? 12 : 40;
    const paddingTop = mobile ? 10 : 40;
    const paddingBottom = mobile ? 28 : 40;
    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Get values - filter to remove invalid data
    const values = data
      .filter(d => d && typeof d === 'object' && typeof d[key] === 'number')
      .map(d => d[key] as number);

    if (values.length === 0) return;

    const maxValue = 100;
    const fontSize = mobile ? 10 : 12;

    // Draw grid lines
    ctx.strokeStyle = '#f3f4f6';
    ctx.lineWidth = 1;
    const gridLines = mobile ? 3 : 4;
    for (let i = 0; i <= gridLines; i++) {
      const y = paddingTop + (chartHeight / gridLines) * i;
      ctx.beginPath();
      ctx.moveTo(paddingLeft, y);
      ctx.lineTo(width - paddingRight, y);
      ctx.stroke();

      // Draw y-axis labels
      ctx.fillStyle = '#9ca3af';
      ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
      ctx.textAlign = 'right';
      const value = maxValue - (maxValue / gridLines) * i;
      ctx.fillText(value.toFixed(0) + (key === 'temperature' ? '°' : '%'), paddingLeft - 6, y + 4);
    }

    // Draw line chart
    if (values.length > 0) {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = mobile ? 1.5 : 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      values.forEach((value, index) => {
        const x = paddingLeft + (chartWidth / Math.max(values.length - 1, 1)) * index;
        const y = paddingTop + chartHeight - (value / maxValue) * chartHeight;

        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });

      ctx.stroke();

      // Fill area under line
      ctx.lineTo(width - paddingRight, paddingTop + chartHeight);
      ctx.lineTo(paddingLeft, paddingTop + chartHeight);
      ctx.closePath();

      const gradient = ctx.createLinearGradient(0, paddingTop, 0, height - paddingBottom);
      gradient.addColorStop(0, color + '30');
      gradient.addColorStop(1, color + '05');
      ctx.fillStyle = gradient;
      ctx.fill();
    }

    // Draw x-axis time labels
    ctx.fillStyle = '#9ca3af';
    ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.textAlign = 'center';

    const validData = data.filter(d => d && typeof d === 'object' && d.timestamp);

    if (validData.length > 0) {
      const timeSteps = mobile ? Math.min(4, validData.length) : Math.min(6, validData.length);
      for (let i = 0; i < timeSteps; i++) {
        const index = Math.floor((validData.length - 1) * (i / Math.max(timeSteps - 1, 1)));
        const point = validData[index];

        if (point && point.timestamp) {
          const x = paddingLeft + (chartWidth / Math.max(timeSteps - 1, 1)) * i;

          const date = new Date(point.timestamp);
          const timeStr = date.getHours().toString().padStart(2, '0') + ':' +
                          date.getMinutes().toString().padStart(2, '0');
          ctx.fillText(timeStr, x, height - paddingBottom + (mobile ? 14 : 20));
        }
      }
    }
  };

  // Validate healthHistory before checking for temperature data
  const hasTempData = healthHistory && Array.isArray(healthHistory) &&
                      healthHistory.some(d => d && d.temperature > 0);

  const canvasHeight = isMobile ? '180px' : '300px';
  const chartPadding = isMobile ? '14px' : '20px';

  const chartColors: Record<string, { border: string; bg: string; label: string }> = {
    cpu: { border: '#667eea', bg: '#667eea08', label: t('logs.cpuUsage') },
    memory: { border: '#10b981', bg: '#10b98108', label: t('logs.memoryUsage') },
    disk: { border: '#f59e0b', bg: '#f59e0b08', label: t('logs.diskUsage') },
    temp: { border: '#ef4444', bg: '#ef444408', label: t('logs.cpuTemperature') }
  };

  const renderChartCard = (
    chartKey: string,
    canvasRef: React.RefObject<HTMLCanvasElement | null>,
    index: number
  ) => {
    const colors = chartColors[chartKey];
    return (
      <div
        className="shc-chart-card"
        style={{
          backgroundColor: 'white',
          borderRadius: '14px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          overflow: 'hidden',
          animation: `shc-fadeSlideIn 0.4s ease-out ${index * 0.08}s both`
        }}
      >
        {/* Color indicator bar */}
        <div style={{
          height: '3px',
          background: `linear-gradient(90deg, ${colors.border}, ${colors.border}88)`
        }} />

        {/* Chart header */}
        <div style={{
          padding: `${isMobile ? '12px 14px 0' : '16px 20px 0'}`,
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <div style={{
            width: '28px',
            height: '28px',
            borderRadius: '8px',
            backgroundColor: colors.bg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <div style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: colors.border
            }} />
          </div>
          <h3 style={{
            fontSize: isMobile ? '13px' : '14px',
            fontWeight: '600',
            margin: 0,
            color: '#374151'
          }}>
            {colors.label}
          </h3>
        </div>

        {/* Canvas */}
        <div style={{ padding: chartPadding }}>
          <canvas
            ref={canvasRef}
            style={{ width: '100%', height: canvasHeight }}
          />
        </div>
      </div>
    );
  };

  return (
    <div style={{ marginBottom: '30px', width: '100%' }}>
      {/* Section header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        marginBottom: '16px'
      }}>
        <div style={{
          width: '32px',
          height: '32px',
          borderRadius: '10px',
          backgroundColor: '#667eea12',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <Activity size={16} style={{ color: '#667eea' }} />
        </div>
        <h2 style={{
          fontSize: '18px',
          fontWeight: '700',
          margin: 0,
          color: '#1f2937'
        }}>
          {t('logs.performance24h')}
        </h2>
      </div>

      {/* Charts grid */}
      <div className="health-charts-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 500px), 1fr))',
        gap: isMobile ? '12px' : '16px',
        width: '100%'
      }}>
        {renderChartCard('cpu', cpuCanvasRef, 0)}
        {renderChartCard('memory', memoryCanvasRef, 1)}
        {renderChartCard('disk', diskCanvasRef, 2)}
        {hasTempData && renderChartCard('temp', tempCanvasRef, 3)}
      </div>

      <style>{`
        @keyframes shc-fadeSlideIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .shc-chart-card:hover {
          box-shadow: 0 4px 12px rgba(0,0,0,0.08);
        }
      `}</style>
    </div>
  );
};
