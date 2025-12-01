import type { Charger } from '../../../types';

export const getStateDisplay = (charger: Charger, stateValue?: string, t?: (key: string) => string): string => {
  if (!stateValue) return t?.('chargers.state.unknown') || 'Unknown';

  const stateStr = String(stateValue).trim();

  // 🔧 FIX: Add Loxone charger state handling
  // Loxone uses same state values as Zaptec: 1=Disconnected, 3=Charging, 5=Complete
  if (charger.connection_type === 'loxone_api') {
    switch (stateStr) {
      case '0': return t?.('chargers.state.unknown') || 'Unknown';
      case '1': return t?.('chargers.state.disconnected') || 'Disconnected';
      case '3': return t?.('chargers.state.charging') || 'Charging';
      case '5': return t?.('chargers.state.completed') || 'Completed';
      default: return t?.('chargers.state.unknown') || 'Unknown';
    }
  }

  // For Zaptec chargers, use native API state values (0, 1, 2, 3, 5)
  if (charger.connection_type === 'zaptec_api') {
    switch (stateStr) {
      case '0': return t?.('chargers.state.unknown') || 'Unknown';
      case '1': return t?.('chargers.state.disconnected') || 'Disconnected';
      case '2': return t?.('chargers.state.awaitingStart') || 'Awaiting Start';
      case '3': return t?.('chargers.state.charging') || 'Charging';
      case '5': return t?.('chargers.state.completed') || 'Completed';
      default: return t?.('chargers.state.unknown') || 'Unknown';
    }
  }

  // For Weidmüller chargers, check the UUID mode from config
  try {
    const config = JSON.parse(charger.connection_config);
    
    // For single-block mode (simplified: 0=idle/disconnected, 1=charging)
    if (config.loxone_uuid_mode === 'single') {
      switch (stateStr) {
        case '0': return t?.('chargers.state.idle') || 'Idle';
        case '1': return t?.('chargers.state.charging') || 'Charging';
        default: return t?.('chargers.state.unknown') || 'Unknown';
      }
    }

    // For multi-UUID mode (original Weidmüller), use config-based mapping
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
  if (!modeValue) return t?.('chargers.mode.normal') || 'Normal';

  const modeStr = String(modeValue).trim();

  // 🔧 FIX: Add Loxone mode handling (M values: 1-5=Solar, 99=Priority)
  if (charger.connection_type === 'loxone_api') {
    const modeNum = parseInt(modeStr);
    if (modeNum >= 1 && modeNum <= 5) {
      return t?.('chargers.mode.solar') || `Solar Mode ${modeNum}`;
    }
    if (modeNum === 99) {
      return t?.('chargers.mode.priority') || 'Priority Charging';
    }
    return t?.('chargers.mode.normal') || 'Normal';
  }

  // For Weidmüller chargers, check the UUID mode from config
  try {
    const config = JSON.parse(charger.connection_config);
    
    // For single-block mode (M values: 1-5=Solar, 99=Priority, other=Normal)
    if (config.loxone_uuid_mode === 'single') {
      const modeNum = parseInt(modeStr);
      if (modeNum >= 1 && modeNum <= 5) {
        return t?.('chargers.mode.solar') || 'Solar';
      }
      if (modeNum === 99) {
        return t?.('chargers.mode.priority') || 'Priority';
      }
      return t?.('chargers.mode.normal') || 'Normal';
    }

    // For multi-UUID mode, use config-based mapping
    if (modeStr === String(config.mode_normal).trim()) {
      return t?.('chargers.mode.normal') || 'Normal';
    }
    if (modeStr === String(config.mode_priority).trim()) {
      return t?.('chargers.mode.priority') || 'Priority';
    }
  } catch (e) {
    console.error('Failed to parse charger config:', e);
  }

  // Default to Normal mode
  return t?.('chargers.mode.normal') || 'Normal';
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