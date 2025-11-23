import { useState, useEffect } from 'react';
import type { SystemHealth, DebugInfo } from '../types';
import { useTranslation } from '../../../i18n';

interface HealthDataPoint {
  timestamp: number;
  cpu_usage: number;
  memory_percent: number;
  disk_percent: number;
  temperature: number;
}

export const useSystemHealth = () => {
  const { t } = useTranslation();
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [healthHistory, setHealthHistory] = useState<HealthDataPoint[]>([]);

  const loadDebugInfo = async () => {
    try {
      const response = await fetch('/api/debug/status', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json();
      setDebugInfo(data);
      
      if (data.system_health) {
        setSystemHealth(data.system_health);
        
        // Add to history (keep last 24 hours of data, one point every 5 seconds = 17280 points max)
        setHealthHistory(prev => {
          const newPoint: HealthDataPoint = {
            timestamp: Date.now(),
            cpu_usage: data.system_health.cpu_usage || 0,
            memory_percent: data.system_health.memory_percent || 0,
            disk_percent: data.system_health.disk_percent || 0,
            temperature: data.system_health.temperature || 0
          };
          
          const updated = [...prev, newPoint];
          
          // Keep only last 24 hours (288 points at 5-minute intervals)
          const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
          return updated.filter(p => p.timestamp > twentyFourHoursAgo).slice(-288);
        });
      }
    } catch (err) {
      console.error(t('logs.debugInfoFailed'), err);
    }
  };

  // Load initial history from localStorage if available
  useEffect(() => {
    const stored = localStorage.getItem('healthHistory');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
        setHealthHistory(parsed.filter((p: HealthDataPoint) => p.timestamp > twentyFourHoursAgo));
      } catch (err) {
        console.error('Failed to load health history:', err);
      }
    }
  }, []);

  // Save history to localStorage whenever it updates
  useEffect(() => {
    if (healthHistory.length > 0) {
      localStorage.setItem('healthHistory', JSON.stringify(healthHistory));
    }
  }, [healthHistory]);

  return {
    systemHealth,
    debugInfo,
    healthHistory,
    loadDebugInfo
  };
};