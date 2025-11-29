import { useState, useEffect } from 'react';
import { api } from '../../../api/client';
import type { SystemHealth, DebugInfo } from '../types';
import { useTranslation } from '../../../i18n';

interface HealthDataPoint {
  timestamp: number;
  cpu_usage: number;
  memory_percent: number;
  disk_percent: number;
  temperature: number;
}

// Generate initial placeholder data so charts show immediately
const generateInitialData = (currentData?: SystemHealth): HealthDataPoint[] => {
  const now = Date.now();
  const points: HealthDataPoint[] = [];
  
  console.log('🎨 Generating initial health data with current values:', currentData);
  
  // Generate 30 points spanning the last 2.5 hours
  for (let i = 29; i >= 0; i--) {
    const timestamp = now - (i * 5 * 60 * 1000); // 5-minute intervals
    points.push({
      timestamp,
      cpu_usage: currentData?.cpu_usage || 0,
      memory_percent: currentData?.memory_percent || 0,
      disk_percent: currentData?.disk_percent || 0,
      temperature: currentData?.temperature || 0
    });
  }
  
  console.log('✅ Generated', points.length, 'initial data points');
  return points;
};

export const useSystemHealth = () => {
  const { t } = useTranslation();
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [healthHistory, setHealthHistory] = useState<HealthDataPoint[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);

  const loadDebugInfo = async () => {
    try {
      console.log('📡 Fetching debug status from API...');
      
      // Use the API client from client.ts
      const data = await api.getDebugStatus();
      
      console.log('✅ API Response received:', data);
      console.log('   System Health:', data.system_health);
      
      setDebugInfo(data);
      
      if (data.system_health) {
        setSystemHealth(data.system_health);
        
        console.log('💾 System health data:', {
          cpu: data.system_health.cpu_usage,
          memory: data.system_health.memory_percent,
          disk: data.system_health.disk_percent,
          temp: data.system_health.temperature
        });
        
        // Initialize with dummy data on first load if history is empty
        if (!isInitialized && healthHistory.length === 0) {
          const initialData = generateInitialData(data.system_health);
          setHealthHistory(initialData);
          setIsInitialized(true);
          
          // Save to localStorage
          try {
            localStorage.setItem('healthHistory', JSON.stringify(initialData));
            console.log('✅ Saved initial data to localStorage');
          } catch (err) {
            console.error('❌ Failed to save to localStorage:', err);
          }
          return;
        }
        
        // Add to history (normal operation after initialization)
        setHealthHistory(prev => {
          const newPoint: HealthDataPoint = {
            timestamp: Date.now(),
            cpu_usage: data.system_health.cpu_usage || 0,
            memory_percent: data.system_health.memory_percent || 0,
            disk_percent: data.system_health.disk_percent || 0,
            temperature: data.system_health.temperature || 0
          };
          
          console.log('➕ Adding new data point:', newPoint);
          
          const updated = [...prev, newPoint];
          
          // Keep only last 24 hours (288 points at 5-minute intervals)
          const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
          const filtered = updated.filter(p => p.timestamp > twentyFourHoursAgo).slice(-288);
          
          // Save to localStorage
          try {
            localStorage.setItem('healthHistory', JSON.stringify(filtered));
          } catch (err) {
            console.error('❌ Failed to save to localStorage:', err);
          }
          
          return filtered;
        });
        
        setIsInitialized(true);
      } else {
        console.warn('⚠️ No system_health in API response');
      }
    } catch (err) {
      console.error('❌ Failed to load debug info:', err);
      console.error('   Error details:', err);
    }
  };

  // Load initial history from localStorage if available
  useEffect(() => {
    console.log('🔍 Checking localStorage for existing health history...');
    
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
          console.log('✅ Loaded', validHistory.length, 'points from localStorage');
          setHealthHistory(validHistory);
          setIsInitialized(true);
        } else {
          console.log('⚠️ No valid health history in localStorage');
        }
      } catch (err) {
        console.error('❌ Failed to parse localStorage data:', err);
        localStorage.removeItem('healthHistory'); // Clear corrupted data
      }
    } else {
      console.log('ℹ️ No health history in localStorage (first visit or cleared)');
    }
  }, []);

  return {
    systemHealth,
    debugInfo,
    healthHistory,
    loadDebugInfo
  };
};