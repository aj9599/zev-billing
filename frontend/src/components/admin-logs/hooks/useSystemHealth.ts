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
        
        // Add to history
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
          const filtered = updated.filter(p => p.timestamp > twentyFourHoursAgo).slice(-288);
          
          // Save to localStorage
          try {
            localStorage.setItem('healthHistory', JSON.stringify(filtered));
          } catch (err) {
            console.error('Failed to save health history:', err);
          }
          
          return filtered;
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
        const validHistory = parsed.filter((p: HealthDataPoint) => 
          p && 
          typeof p === 'object' &&
          typeof p.timestamp === 'number' && 
          p.timestamp > twentyFourHoursAgo &&
          typeof p.cpu_usage === 'number' &&
          typeof p.memory_percent === 'number' &&
          typeof p.disk_percent === 'number'
        );
        
        if (validHistory.length > 0) {
          console.log('Loaded health history from localStorage:', validHistory.length, 'points');
          setHealthHistory(validHistory);
        } else {
          console.log('No valid health history in localStorage, will build from scratch');
        }
      } catch (err) {
        console.error('Failed to load health history from localStorage:', err);
        localStorage.removeItem('healthHistory'); // Clear corrupted data
      }
    } else {
      console.log('No health history in localStorage, starting fresh');
    }
  }, []);

  return {
    systemHealth,
    debugInfo,
    healthHistory,
    loadDebugInfo
  };
};