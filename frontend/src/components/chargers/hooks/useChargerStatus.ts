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
  // Loxone enhanced live data (matches backend JSON tags)
  last_session_energy?: number;
  last_session_duration_sec?: number;
  weekly_energy?: number;
  monthly_energy?: number;
  last_month_energy?: number;
  yearly_energy?: number;
  last_year_energy?: number;
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

export interface GenericChargerConnectionStatus {
  [chargerId: number]: {
    charger_name: string;
    is_connected: boolean;
    last_update: string;
  };
}

export const useChargerStatus = () => {
  const [liveData, setLiveData] = useState<Record<number, LiveChargerData>>({});
  const [loxoneStatus, setLoxoneStatus] = useState<LoxoneConnectionStatus>({});
  const [zaptecStatus, setZaptecStatus] = useState<ZaptecConnectionStatus>({});
  const [udpChargerStatus, setUdpChargerStatus] = useState<GenericChargerConnectionStatus>({});
  const [mqttChargerStatus, setMqttChargerStatus] = useState<GenericChargerConnectionStatus>({});
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
          }
          if (debugData.udp_charger_connections) {
            // Convert string-keyed to number-keyed
            const parsed: GenericChargerConnectionStatus = {};
            for (const [key, value] of Object.entries(debugData.udp_charger_connections)) {
              parsed[parseInt(key)] = value as GenericChargerConnectionStatus[number];
            }
            setUdpChargerStatus(parsed);
          }
          if (debugData.mqtt_charger_connections) {
            const parsed: GenericChargerConnectionStatus = {};
            for (const [key, value] of Object.entries(debugData.mqtt_charger_connections)) {
              parsed[parseInt(key)] = value as GenericChargerConnectionStatus[number];
            }
            setMqttChargerStatus(parsed);
          }
        } else if (debugResponse.status === 401) {
          // Token expired or invalid - ignore silently as the auth layer will handle it
          console.warn('[useChargerStatus] Debug status failed: 401 (token will be refreshed)');
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
        } else if (liveResponse.status === 401) {
          // Token expired or invalid - ignore silently
          console.warn('[useChargerStatus] Live data failed: 401 (token will be refreshed)');
        } else if (liveResponse.status === 400) {
          // 400 Bad Request - log but don't show error to user
          const errorText = await liveResponse.text();
          console.error('[useChargerStatus] Live data request error (400):', errorText);
          console.warn('[useChargerStatus] Skipping live data due to 400 error');
          // Don't set error state - just continue
        } else {
          // Other HTTP errors
          const errorText = await liveResponse.text();
          console.error('[useChargerStatus] Live data failed:', liveResponse.status, errorText);
          // Only set error for non-400 errors that are significant
          if (liveResponse.status >= 500) {
            setError(`Live data fetch failed: ${liveResponse.status}`);
          }
        }
      } catch (liveError) {
        console.error('[useChargerStatus] Live data request failed:', liveError);
        console.warn('[useChargerStatus] Continuing without live data');
        // Don't set error state - just log it
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
    udpChargerStatus,
    mqttChargerStatus,
    error,
    fetchStatusData
  };
};