import { categorizeAction, type LogCategory } from '../LogIcon';

export const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  export const getHealthColor = (percent: number): string => {
    if (percent >= 90) return '#dc3545';
    if (percent >= 75) return '#ffc107';
    return '#10b981';
  };

  export const getTempColor = (temp: number): string => {
    if (temp >= 80) return '#dc3545';
    if (temp >= 70) return '#ffc107';
    return '#10b981';
  };

  const rowBgColors: Record<LogCategory, string> = {
    error:      '#fef2f2',
    success:    '#f0fdf4',
    connection: '#ecfdf5',
    disconnect: '#fffbeb',
    reconnect:  '#fff7ed',
    auth:       '#f5f3ff',
    dns:        '#eef2ff',
    billing:    '#f0f9ff',
    security:   '#fdf2f8',
    collection: '#f0fdfa',
    info:       '#ffffff',
  };

  const borderColors: Record<LogCategory, string> = {
    error:      '#dc3545',
    success:    '#28a745',
    connection: '#10b981',
    disconnect: '#f59e0b',
    reconnect:  '#f97316',
    auth:       '#8b5cf6',
    dns:        '#6366f1',
    billing:    '#0ea5e9',
    security:   '#ec4899',
    collection: '#14b8a6',
    info:       '#6b7280',
  };

  export const getLogColor = (action: string): string => {
    const category = categorizeAction(action);
    return rowBgColors[category];
  };

  export const getLogBorderColor = (action: string): string => {
    const category = categorizeAction(action);
    return borderColors[category];
  };
