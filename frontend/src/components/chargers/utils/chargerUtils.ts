import { getPreset } from '../../chargerPresets';
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

  // E3/DC wallbox: 1=disconnected, 2=connected/waiting, 3=charging
  if (charger.connection_type === 'e3dc_api') {
    switch (stateStr) {
      case '1': return t?.('chargers.state.disconnected') || 'Disconnected';
      case '2': return t?.('chargers.state.awaitingStart') || 'Connected';
      case '3': return t?.('chargers.state.charging') || 'Charging';
      default: return t?.('chargers.state.idle') || 'Idle';
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

const parseModeList = (value?: unknown): string[] =>
  String(value ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

// Mirrors the backend (resolveModeMapping + billableCharge): an explicit
// mode_normal / mode_priority in the config wins; otherwise the preset default
// (Weidmüller/Loxone: normal = "2,3", priority = "1,99"). The Loxone Wallbox
// block reports M = 1-5 (user-defined modes) or 99 (manual) — their meaning
// is installation-specific, so never hard-code "1-5 = Solar" here.
export const getModeDisplay = (charger: Charger, modeValue?: string, t?: (key: string) => string): string => {
  const modeStr = modeValue === undefined || modeValue === null ? '' : String(modeValue).trim();
  if (!modeStr) return t?.('chargers.mode.unknown') || 'Unknown';

  let config: Record<string, unknown> = {};
  try {
    config = JSON.parse(charger.connection_config || '{}');
  } catch (e) {
    console.error('Failed to parse charger config:', e);
  }

  const preset = getPreset(charger.preset || 'weidmuller');
  const normalList = parseModeList(config.mode_normal ?? preset.defaultModeMappings.normal);
  const priorityList = parseModeList(config.mode_priority ?? preset.defaultModeMappings.priority);

  const isNormal = normalList.includes(modeStr);
  const isPriority = priorityList.includes(modeStr);
  const showRaw = charger.connection_type === 'loxone_api';
  const suffix = showRaw ? ` (${modeStr})` : '';

  if (isPriority && !isNormal) {
    return (t?.('chargers.mode.priority') || 'Priority') + suffix;
  }
  if (isNormal) {
    return (t?.('chargers.mode.normal') || 'Normal') + suffix;
  }
  // Not mapped: billing treats it as normal, but show it as unmapped so a new
  // Loxone mode is noticed instead of silently looking like "Solar".
  return `${t?.('chargers.mode.unknown') || 'Unknown'} (${modeStr})`;
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