import { useEffect, useRef, useState, useCallback } from 'react';
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

interface ChartLayout {
  paddingLeft: number;
  paddingRight: number;
  paddingTop: number;
  paddingBottom: number;
  chartWidth: number;
  chartHeight: number;
  width: number;
  height: number;
}

interface HoverInfo {
  chartKey: string;
  dataIndex: number;
  x: number;
  y: number;
  value: number;
  timestamp: number;
}

const DATA_KEY_MAP: Record<string, keyof HealthDataPoint> = {
  cpu: 'cpu_usage',
  memory: 'memory_percent',
  disk: 'disk_percent',
  temp: 'temperature'
};

const CHART_COLORS: Record<string, string> = {
  cpu: '#667eea',
  memory: '#10b981',
  disk: '#f59e0b',
  temp: '#ef4444'
};

export const SystemHealthCharts = ({ healthHistory }: SystemHealthChartsProps) => {
  const { t } = useTranslation();

  // Main chart canvases
  const cpuCanvasRef = useRef<HTMLCanvasElement>(null);
  const memoryCanvasRef = useRef<HTMLCanvasElement>(null);
  const diskCanvasRef = useRef<HTMLCanvasElement>(null);
  const tempCanvasRef = useRef<HTMLCanvasElement>(null);

  // Overlay canvases (for hover crosshair/dot — avoids redrawing the base chart)
  const cpuOverlayRef = useRef<HTMLCanvasElement>(null);
  const memoryOverlayRef = useRef<HTMLCanvasElement>(null);
  const diskOverlayRef = useRef<HTMLCanvasElement>(null);
  const tempOverlayRef = useRef<HTMLCanvasElement>(null);

  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);
  const layoutsRef = useRef<Record<string, ChartLayout>>({});
  const validHistoryRef = useRef<HealthDataPoint[]>([]);

  const overlayRefs: Record<string, React.RefObject<HTMLCanvasElement>> = {
    cpu: cpuOverlayRef,
    memory: memoryOverlayRef,
    disk: diskOverlayRef,
    temp: tempOverlayRef
  };

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Draw base charts when data changes
  useEffect(() => {
    if (!healthHistory || !Array.isArray(healthHistory) || healthHistory.length === 0) return;

    const validHistory = healthHistory.filter(d =>
      d && typeof d === 'object' &&
      typeof d.timestamp === 'number' &&
      typeof d.cpu_usage === 'number' &&
      typeof d.memory_percent === 'number' &&
      typeof d.disk_percent === 'number'
    );
    if (validHistory.length === 0) return;
    validHistoryRef.current = validHistory;

    const mobile = window.innerWidth <= 768;
    drawChart(cpuCanvasRef.current, validHistory, 'cpu_usage', '#667eea', mobile, 'cpu');
    drawChart(memoryCanvasRef.current, validHistory, 'memory_percent', '#10b981', mobile, 'memory');
    drawChart(diskCanvasRef.current, validHistory, 'disk_percent', '#f59e0b', mobile, 'disk');

    if (validHistory.some(d => d.temperature > 0)) {
      drawChart(tempCanvasRef.current, validHistory, 'temperature', '#ef4444', mobile, 'temp');
    }
  }, [healthHistory, t, isMobile]);

  // Draw hover overlay on the overlay canvas (lightweight — no base chart redraw)
  useEffect(() => {
    const mobile = window.innerWidth <= 768;
    const data = validHistoryRef.current;

    // Clear all overlay canvases
    Object.values(overlayRefs).forEach(ref => {
      const c = ref.current;
      if (!c) return;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      const rect = c.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      c.width = rect.width * dpr;
      c.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, rect.width, rect.height);
    });

    if (!hoverInfo || !data.length) return;

    const overlayCanvas = overlayRefs[hoverInfo.chartKey]?.current;
    if (!overlayCanvas) return;

    const color = CHART_COLORS[hoverInfo.chartKey] || '#667eea';
    const key = DATA_KEY_MAP[hoverInfo.chartKey];
    drawHoverOverlay(overlayCanvas, data, key, color, mobile, hoverInfo.dataIndex);
  }, [hoverInfo]);

  const drawChart = (
    canvas: HTMLCanvasElement | null,
    data: HealthDataPoint[],
    key: keyof HealthDataPoint,
    color: string,
    mobile: boolean,
    chartKey: string
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

    layoutsRef.current[chartKey] = { paddingLeft, paddingRight, paddingTop, paddingBottom, chartWidth, chartHeight, width, height };

    ctx.clearRect(0, 0, width, height);

    const values = data
      .filter(d => d && typeof d === 'object' && typeof d[key] === 'number')
      .map(d => d[key] as number);
    if (values.length === 0) return;

    const maxValue = 100;
    const fontSize = mobile ? 10 : 12;

    // Grid lines
    ctx.strokeStyle = '#f3f4f6';
    ctx.lineWidth = 1;
    const gridLines = mobile ? 3 : 4;
    for (let i = 0; i <= gridLines; i++) {
      const y = paddingTop + (chartHeight / gridLines) * i;
      ctx.beginPath();
      ctx.moveTo(paddingLeft, y);
      ctx.lineTo(width - paddingRight, y);
      ctx.stroke();

      ctx.fillStyle = '#9ca3af';
      ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
      ctx.textAlign = 'right';
      const val = maxValue - (maxValue / gridLines) * i;
      ctx.fillText(val.toFixed(0) + (key === 'temperature' ? '°' : '%'), paddingLeft - 6, y + 4);
    }

    // Line chart
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = mobile ? 1.5 : 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    values.forEach((value, index) => {
      const x = paddingLeft + (chartWidth / Math.max(values.length - 1, 1)) * index;
      const y = paddingTop + chartHeight - (value / maxValue) * chartHeight;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Gradient fill
    ctx.lineTo(width - paddingRight, paddingTop + chartHeight);
    ctx.lineTo(paddingLeft, paddingTop + chartHeight);
    ctx.closePath();
    const gradient = ctx.createLinearGradient(0, paddingTop, 0, height - paddingBottom);
    gradient.addColorStop(0, color + '30');
    gradient.addColorStop(1, color + '05');
    ctx.fillStyle = gradient;
    ctx.fill();

    // X-axis time labels
    ctx.fillStyle = '#9ca3af';
    ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.textAlign = 'center';
    const validData = data.filter(d => d && typeof d === 'object' && d.timestamp);
    if (validData.length > 0) {
      const timeSteps = mobile ? Math.min(4, validData.length) : Math.min(6, validData.length);
      for (let i = 0; i < timeSteps; i++) {
        const idx = Math.floor((validData.length - 1) * (i / Math.max(timeSteps - 1, 1)));
        const point = validData[idx];
        if (point?.timestamp) {
          const x = paddingLeft + (chartWidth / Math.max(timeSteps - 1, 1)) * i;
          const date = new Date(point.timestamp);
          const timeStr = date.getHours().toString().padStart(2, '0') + ':' +
                          date.getMinutes().toString().padStart(2, '0');
          ctx.fillText(timeStr, x, height - paddingBottom + (mobile ? 14 : 20));
        }
      }
    }
  };

  const drawHoverOverlay = (
    canvas: HTMLCanvasElement,
    data: HealthDataPoint[],
    key: keyof HealthDataPoint,
    color: string,
    mobile: boolean,
    dataIndex: number
  ) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const paddingLeft = mobile ? 32 : 40;
    const paddingRight = mobile ? 12 : 40;
    const paddingTop = mobile ? 10 : 40;
    const rect = canvas.getBoundingClientRect();
    const chartWidth = rect.width - paddingLeft - paddingRight;
    const chartHeight = rect.height - paddingTop - (mobile ? 28 : 40);

    const values = data
      .filter(d => d && typeof d === 'object' && typeof d[key] === 'number')
      .map(d => d[key] as number);
    if (dataIndex < 0 || dataIndex >= values.length) return;

    const value = values[dataIndex];
    const x = paddingLeft + (chartWidth / Math.max(values.length - 1, 1)) * dataIndex;
    const y = paddingTop + chartHeight - (value / 100) * chartHeight;

    // Vertical crosshair line (dashed)
    ctx.beginPath();
    ctx.strokeStyle = color + '40';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.moveTo(x, paddingTop);
    ctx.lineTo(x, paddingTop + chartHeight);
    ctx.stroke();
    ctx.setLineDash([]);

    // White outer circle
    ctx.beginPath();
    ctx.fillStyle = 'white';
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();

    // Colored inner dot
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Glow ring
    ctx.beginPath();
    ctx.strokeStyle = color + '30';
    ctx.lineWidth = 2;
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.stroke();
  };

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>, chartKey: string) => {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const layout = layoutsRef.current[chartKey];
    if (!layout) return;

    const data = validHistoryRef.current;
    if (!data.length) return;

    const key = DATA_KEY_MAP[chartKey];
    const values = data
      .filter(d => d && typeof d === 'object' && typeof d[key] === 'number')
      .map(d => d[key] as number);
    if (!values.length) return;

    const relX = mouseX - layout.paddingLeft;
    const ratio = relX / layout.chartWidth;
    const dataIndex = Math.round(ratio * (values.length - 1));

    if (dataIndex < 0 || dataIndex >= values.length || dataIndex >= data.length) {
      setHoverInfo(null);
      return;
    }

    const value = values[dataIndex];
    const pointX = layout.paddingLeft + (layout.chartWidth / Math.max(values.length - 1, 1)) * dataIndex;
    const pointY = layout.paddingTop + layout.chartHeight - (value / 100) * layout.chartHeight;

    setHoverInfo({
      chartKey,
      dataIndex,
      x: pointX,
      y: pointY,
      value,
      timestamp: data[dataIndex].timestamp
    });
  }, []);

  const handleCanvasMouseLeave = useCallback(() => {
    setHoverInfo(null);
  }, []);

  const hasTempData = healthHistory && Array.isArray(healthHistory) &&
                      healthHistory.some(d => d && d.temperature > 0);

  const canvasHeight = isMobile ? '180px' : '300px';
  const chartPadding = isMobile ? '14px' : '20px';

  const chartColorsMeta: Record<string, { border: string; bg: string; label: string; unit: string }> = {
    cpu: { border: '#667eea', bg: '#667eea08', label: t('logs.cpuUsage'), unit: '%' },
    memory: { border: '#10b981', bg: '#10b98108', label: t('logs.memoryUsage'), unit: '%' },
    disk: { border: '#f59e0b', bg: '#f59e0b08', label: t('logs.diskUsage'), unit: '%' },
    temp: { border: '#ef4444', bg: '#ef444408', label: t('logs.cpuTemperature'), unit: '°C' }
  };

  const formatTooltipTime = (ts: number) => {
    const d = new Date(ts);
    return d.getHours().toString().padStart(2, '0') + ':' +
           d.getMinutes().toString().padStart(2, '0');
  };

  const renderChartCard = (
    chartKey: string,
    canvasRef: React.RefObject<HTMLCanvasElement>,
    overlayRef: React.RefObject<HTMLCanvasElement>,
    index: number
  ) => {
    const colors = chartColorsMeta[chartKey];
    const isHovered = hoverInfo?.chartKey === chartKey;
    const layout = layoutsRef.current[chartKey];

    let tooltipLeft = 0;
    let tooltipTop = 0;
    let tooltipAlign: 'left' | 'right' = 'right';
    if (isHovered && hoverInfo && layout) {
      tooltipLeft = hoverInfo.x;
      tooltipTop = hoverInfo.y;
      if (tooltipLeft > layout.width * 0.7) tooltipAlign = 'left';
    }

    return (
      <div
        key={chartKey}
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
          padding: isMobile ? '12px 14px 0' : '16px 20px 0',
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

        {/* Canvas area with overlay */}
        <div style={{ padding: chartPadding, position: 'relative' }}>
          {/* Base chart canvas */}
          <canvas
            ref={canvasRef}
            style={{ width: '100%', height: canvasHeight, display: 'block' }}
          />
          {/* Transparent overlay canvas for hover effects */}
          <canvas
            ref={overlayRef}
            style={{
              position: 'absolute',
              top: chartPadding,
              left: chartPadding,
              width: `calc(100% - ${chartPadding} - ${chartPadding})`,
              height: canvasHeight,
              cursor: 'crosshair',
              pointerEvents: 'auto'
            }}
            onMouseMove={(e) => handleCanvasMouseMove(e, chartKey)}
            onMouseLeave={handleCanvasMouseLeave}
          />

          {/* Tooltip */}
          {isHovered && hoverInfo && (
            <div style={{
              position: 'absolute',
              left: `calc(${chartPadding} + ${tooltipLeft}px + ${tooltipAlign === 'right' ? '12px' : '0px'})`,
              top: `calc(${chartPadding} + ${tooltipTop}px - 20px)`,
              transform: tooltipAlign === 'left' ? 'translateX(calc(-100% - 12px))' : 'none',
              backgroundColor: 'white',
              border: `1px solid ${colors.border}30`,
              borderRadius: '10px',
              padding: '8px 12px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
              pointerEvents: 'none',
              zIndex: 10,
              whiteSpace: 'nowrap',
              minWidth: '80px'
            }}>
              <div style={{
                fontSize: '11px',
                color: '#9ca3af',
                marginBottom: '2px',
                fontWeight: '500'
              }}>
                {formatTooltipTime(hoverInfo.timestamp)}
              </div>
              <div style={{
                fontSize: '16px',
                fontWeight: '700',
                color: colors.border
              }}>
                {hoverInfo.value.toFixed(1)}{colors.unit}
              </div>
            </div>
          )}
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
        {renderChartCard('cpu', cpuCanvasRef, cpuOverlayRef, 0)}
        {renderChartCard('memory', memoryCanvasRef, memoryOverlayRef, 1)}
        {renderChartCard('disk', diskCanvasRef, diskOverlayRef, 2)}
        {hasTempData && renderChartCard('temp', tempCanvasRef, tempOverlayRef, 3)}
      </div>

      <style>{`
        @keyframes shc-fadeSlideIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .shc-chart-card {
          transition: box-shadow 0.2s ease;
        }
        .shc-chart-card:hover {
          box-shadow: 0 4px 12px rgba(0,0,0,0.08) !important;
        }
      `}</style>
    </div>
  );
};
