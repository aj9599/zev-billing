import { useState, useEffect, useRef } from 'react';
import type { SystemHealth, DebugInfo } from '../types';
import { useTranslation } from '../../../i18n';
import { api } from '../../../api/client';

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
  const serverHistoryLoaded = useRef(false);

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

        // Add live point to history
        setHealthHistory(prev => {
          const newPoint: HealthDataPoint = {
            timestamp: Date.now(),
            cpu_usage: data.system_health.cpu_usage || 0,
            memory_percent: data.system_health.memory_percent || 0,
            disk_percent: data.system_health.disk_percent || 0,
            temperature: data.system_health.temperature || 0
          };

          const updated = [...prev, newPoint];

          // Keep only last 24 hours, cap at 500 points
          const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
          return updated.filter(p => p.timestamp > twentyFourHoursAgo).slice(-500);
        });
      }
    } catch (err) {
      console.error(t('logs.debugInfoFailed'), err);
    }
  };

  // Load server-side health history on mount (provides 24h coverage even when browser was closed)
  useEffect(() => {
    if (serverHistoryLoaded.current) return;
    serverHistoryLoaded.current = true;

    const loadServerHistory = async () => {
      try {
        const serverData = await api.getHealthHistory();
        if (serverData && Array.isArray(serverData) && serverData.length > 0) {
          setHealthHistory(prev => {
            // Merge server history with any existing live points
            const merged = [...serverData, ...prev];
            // Deduplicate by keeping unique timestamps (within 10s tolerance)
            const seen = new Set<number>();
            const deduped = merged.filter(p => {
              const bucket = Math.round(p.timestamp / 10000);
              if (seen.has(bucket)) return false;
              seen.add(bucket);
              return true;
            });
            // Sort by timestamp and trim
            deduped.sort((a, b) => a.timestamp - b.timestamp);
            const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
            return deduped.filter(p => p.timestamp > twentyFourHoursAgo).slice(-500);
          });
        }
      } catch (err) {
        console.error('Failed to load server health history:', err);
      }
    };

    loadServerHistory();
  }, []);

  return {
    systemHealth,
    debugInfo,
    healthHistory,
    loadDebugInfo
  };
};