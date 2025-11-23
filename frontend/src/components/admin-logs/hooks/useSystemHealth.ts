import { useState } from 'react';
import type { SystemHealth, DebugInfo } from '../types';
import { useTranslation } from '../../../i18n';

export const useSystemHealth = () => {
  const { t } = useTranslation();
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);

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
      }
    } catch (err) {
      console.error(t('logs.debugInfoFailed'), err);
    }
  };

  return {
    systemHealth,
    debugInfo,
    loadDebugInfo
  };
};