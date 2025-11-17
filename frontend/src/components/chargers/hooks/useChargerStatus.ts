import { useState } from 'react';

export interface LiveChargerData {
  charger_id: number;
  charger_name: string;
  connection_type: string;
  power_kwh: number;
  state: string;
  mode: string;
  last_update: string;
  // Zaptec-specific enhanced data
  total_energy?: number;
  session_energy?: number;
  is_online?: boolean;
  current_power_kw?: number;
  voltage?: number;
  current?: number;
  state_description?: string;
  live_session?: LiveSessionData;
}

export interface LiveSessionData {
  session_id: string;
  energy: number;
  start_time: string;
  duration: string;
  user_name: string;
  is_active: boolean;
  power_kw: number;
}

export interface LoxoneConnectionStatus {
  [chargerId: number]: {
    charger_name: string;
    host: string;
    is_connected: boolean;
    last_reading: number;
    last_update: string;
    last_error?: string;
  };
}

export interface ZaptecConnectionStatus {
  [chargerId: number]: {
    charger_name: string;
    charger_id: string;
    is_connected: boolean;
    is_online: boolean;
    last_reading: number;
    last_update: string;
    current_power_kw?: number;
    session_energy?: number;
    state_description?: string;
    token_expires?: string;
    live_session?: LiveSessionData;
  };
}

export const useChargerStatus = () => {
  const [liveData, setLiveData] = useState<Record<number, LiveChargerData>>({});
  const [loxoneStatus, setLoxoneStatus] = useState<LoxoneConnectionStatus>({});
  const [zaptecStatus, setZaptecStatus] = useState<ZaptecConnectionStatus>({});
  const [error, setError] = useState<string | null>(null);

  const fetchStatusData = async () => {
    try {
      setError(null);

      // Fetch debug status first (contains Zaptec and Loxone status)
      try {
        const debugResponse = await fetch('/api/debug/status', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });

        if (debugResponse.ok) {
          const debugData = await debugResponse.json();

          if (debugData.loxone_charger_connections) {
            setLoxoneStatus(debugData.loxone_charger_connections);
          }
          if (debugData.zaptec_charger_connections) {
            setZaptecStatus(debugData.zaptec_charger_connections);
            console.log('[useChargerStatus] Zaptec status:', debugData.zaptec_charger_connections);
          }
        } else {
          console.warn('[useChargerStatus] Debug status failed:', debugResponse.status);
        }
      } catch (debugError) {
        console.warn('[useChargerStatus] Debug status request failed:', debugError);
        // Continue to fetch live data even if debug fails
      }

      // Fetch live data
      try {
        const liveResponse = await fetch('/api/chargers/live-data', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });

        if (liveResponse.ok) {
          const data = await liveResponse.json();
          const dataMap: Record<number, LiveChargerData> = {};
          
          if (Array.isArray(data)) {
            data.forEach((item: LiveChargerData) => {
              dataMap[item.charger_id] = item;
              console.log('[useChargerStatus] Live data for charger', item.charger_id, ':', item);
            });
            setLiveData(dataMap);
          } else {
            console.error('[useChargerStatus] Live data is not an array:', data);
            setError('Invalid live data format');
          }
        } else if (liveResponse.status === 400) {
          // 400 Bad Request - likely an invalid parameter or endpoint issue
          const errorText = await liveResponse.text();
          console.error('[useChargerStatus] Live data request error (400):', errorText);
          
          // Don't set error state for 400 - just log it and continue
          // This prevents the error from being displayed to the user
          console.warn('[useChargerStatus] Skipping live data due to 400 error');
        } else {
          const errorText = await liveResponse.text();
          console.error('[useChargerStatus] Live data failed:', liveResponse.status, errorText);
          // Only set error for non-400 errors
          if (liveResponse.status !== 400) {
            setError(`Live data fetch failed: ${liveResponse.status} ${errorText}`);
          }
        }
      } catch (liveError) {
        console.error('[useChargerStatus] Live data request failed:', liveError);
        // Don't set error state - just log it
        console.warn('[useChargerStatus] Continuing without live data');
      }
    } catch (error) {
      console.error('[useChargerStatus] Failed to fetch charger status:', error);
      setError(error instanceof Error ? error.message : 'Unknown error');
    }
  };

  return {
    liveData,
    loxoneStatus,
    zaptecStatus,
    error,
    fetchStatusData
  };
};