import type { Charger } from '../../../types';

export const getStateDisplay = (charger: Charger, stateValue?: string, t?: (key: string) => string): string => {
  if (!stateValue) return t?.('chargers.state.unknown') || 'Unknown';

  const stateStr = String(stateValue).trim();

  // For Zaptec chargers, use native API state values (0, 1, 2, 3, 5)
  if (charger.connection_type === 'zaptec_api') {
    switch (stateStr) {
      case '0': // Unknown
        return t?.('chargers.state.unknown') || 'Unknown';
      case '1': // Disconnected
        return t?.('chargers.state.disconnected') || 'Disconnected';
      case '2': // Connected_Requesting (waiting for authorization)
        return t?.('chargers.state.awaitingStart') || 'Awaiting Start';
      case '3': // Connected_Charging
        return t?.('chargers.state.charging') || 'Charging';
      case '5': // Connected_Finished
        return t?.('chargers.state.completed') || 'Completed';
      default:
        return t?.('chargers.state.unknown') || 'Unknown';
    }
  }

  // For Weidmüller and other chargers, use config-based mapping (4 states)
  try {
    const config = JSON.parse(charger.connection_config);
    
    if (stateStr === String(config.state_cable_locked).trim()) {
      return t?.('chargers.state.cableLocked') || 'Cable Locked';
    }
    if (stateStr === String(config.state_waiting_auth).trim()) {
      return t?.('chargers.state.waitingAuth') || 'Waiting Auth';
    }
    if (stateStr === String(config.state_charging).trim()) {
      return t?.('chargers.state.charging') || 'Charging';
    }
    if (stateStr === String(config.state_idle).trim()) {
      return t?.('chargers.state.idle') || 'Idle';
    }
  } catch (e) {
    console.error('Failed to parse charger config:', e);
  }

  return t?.('chargers.state.unknown') || 'Unknown';
};

export const getModeDisplay = (charger: Charger, modeValue?: string, t?: (key: string) => string): string => {
  if (!modeValue) return t?.('chargers.mode.unknown') || 'Unknown';

  try {
    const config = JSON.parse(charger.connection_config);
    const modeStr = String(modeValue).trim();
    
    if (modeStr === String(config.mode_normal).trim()) {
      return t?.('chargers.mode.normal') || 'Normal';
    }
    if (modeStr === String(config.mode_priority).trim()) {
      return t?.('chargers.mode.priority') || 'Priority';
    }
  } catch (e) {
    console.error('Failed to parse charger config:', e);
  }

  return t?.('chargers.mode.unknown') || 'Unknown';
};

export const groupChargersByBuilding = (chargers: Charger[]): Record<number, Charger[]> => {
  return chargers.reduce((acc, charger) => {
    if (!acc[charger.building_id]) {
      acc[charger.building_id] = [];
    }
    acc[charger.building_id].push(charger);
    return acc;
  }, {} as Record<number, Charger[]>);
};