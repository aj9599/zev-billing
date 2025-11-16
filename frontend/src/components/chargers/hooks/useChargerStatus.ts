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
    state_description?: string;
    token_expires?: string;
    live_session?: LiveSessionData;
  };
}

export const useChargerStatus = () => {
  const [liveData, setLiveData] = useState<Record<number, LiveChargerData>>({});
  const [loxoneStatus, setLoxoneStatus] = useState<LoxoneConnectionStatus>({});
  const [zaptecStatus, setZaptecStatus] = useState<ZaptecConnectionStatus>({});

  const fetchStatusData = async () => {
    try {
      // Fetch debug status
      const debugData = await fetch('/api/debug/status', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      }).then(res => res.json());

      if (debugData.loxone_charger_connections) {
        setLoxoneStatus(debugData.loxone_charger_connections);
      }
      if (debugData.zaptec_charger_connections) {
        setZaptecStatus(debugData.zaptec_charger_connections);
      }

      // Fetch live data
      const liveResponse = await fetch('/api/chargers/live-data', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (liveResponse.ok) {
        const data = await liveResponse.json();
        const dataMap: Record<number, LiveChargerData> = {};
        data.forEach((item: LiveChargerData) => {
          dataMap[item.charger_id] = item;
        });
        setLiveData(dataMap);
      }
    } catch (error) {
      console.error('Failed to fetch charger status:', error);
    }
  };

  return {
    liveData,
    loxoneStatus,
    zaptecStatus,
    fetchStatusData
  };
};