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
  
  export const getLogColor = (action: string): string => {
    if (action.toLowerCase().includes('error') || action.toLowerCase().includes('failed')) {
      return '#fef2f2';
    } else if (action.toLowerCase().includes('success') || action.toLowerCase().includes('collected')) {
      return '#f0fdf4';
    }
    return '#fff';
  };