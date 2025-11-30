// chargerPresets.ts
// ============================================================================
// CHARGER PRESET CONFIGURATION SYSTEM
// ============================================================================
// Presets define the BRAND of charger (WeidmÃ¼ller, Zaptec, etc.)
// Connection Type determines HOW to connect (Loxone Multi-UUID, Single-Block, etc.)
// ============================================================================

export interface PresetStateMapping {
  cable_locked: string;
  waiting_auth: string;
  charging: string;
  idle: string;
}

export interface PresetModeMapping {
  normal: string;
  priority: string;
}

export interface PresetConfig {
  name: string;
  label: string;
  description: string;
  supportsPriority: boolean;
  defaultStateMappings: PresetStateMapping;
  defaultModeMappings: PresetModeMapping;
  stateOptions: Array<{ value: string; label: string }>;
  modeOptions: Array<{ value: string; label: string }>;
  supportedConnectionTypes: string[]; // Which connection types work with this brand
}

// ============================================================================
// WeidmÃ¼ller Preset (supports multiple connection types)
// ============================================================================
export const WEIDMULLER_PRESET: PresetConfig = {
  name: 'weidmuller',
  label: 'WeidmÃ¼ller',
  description: 'WeidmÃ¼ller AC Smart chargers',
  supportsPriority: true,
  defaultStateMappings: {
    cable_locked: '65',
    waiting_auth: '66',
    charging: '67',
    idle: '50'
  },
  defaultModeMappings: {
    normal: '1',
    priority: '2'
  },
  stateOptions: [
    { value: 'cable_locked', label: 'Cable Locked' },
    { value: 'waiting_auth', label: 'Waiting for Authentication' },
    { value: 'charging', label: 'Charging' },
    { value: 'idle', label: 'Idle' }
  ],
  modeOptions: [
    { value: 'normal', label: 'Normal Charging' },
    { value: 'priority', label: 'Priority Charging' }
  ],
  supportedConnectionTypes: [
    'loxone_api_single',
    'loxone_api_multi',
    'modbus_tcp',
    'udp',
    'http'
  ]
};

// ============================================================================
// Zaptec Preset
// ============================================================================
export const ZAPTEC_PRESET: PresetConfig = {
  name: 'zaptec',
  label: 'Zaptec',
  description: 'Zaptec Go/Pro chargers',
  supportsPriority: false,
  defaultStateMappings: {
    cable_locked: '65',
    waiting_auth: '66',
    charging: '67',
    idle: '50'
  },
  defaultModeMappings: {
    normal: '1',
    priority: '1'
  },
  stateOptions: [
    { value: 'cable_locked', label: 'Cable Locked' },
    { value: 'waiting_auth', label: 'Waiting for Authentication' },
    { value: 'charging', label: 'Charging' },
    { value: 'idle', label: 'Idle' }
  ],
  modeOptions: [
    { value: 'normal', label: 'Normal Charging' },
    { value: 'priority', label: 'Priority Charging' }
  ],
  supportedConnectionTypes: ['zaptec_api']
};

// ============================================================================
// Preset Registry
// ============================================================================
export const CHARGER_PRESETS: Record<string, PresetConfig> = {
  weidmuller: WEIDMULLER_PRESET,
  zaptec: ZAPTEC_PRESET,
};

// Helper function to get preset by name with fallback
export const getPreset = (presetName: string): PresetConfig => {
  return CHARGER_PRESETS[presetName] || WEIDMULLER_PRESET;
};

// ============================================================================
// Connection Type Definitions
// ============================================================================
export interface ConnectionTypeOption {
  value: string;
  label: string;
  description: string;
  requiresBlockUUID?: boolean;
  requiresUUIDs?: boolean;
  requiresIP?: boolean;
  requiresCredentials?: boolean;
}

export const CONNECTION_TYPES: Record<string, ConnectionTypeOption> = {
  loxone_api_single: {
    value: 'loxone_api_single',
    label: 'Loxone API (Single-Block UUID)',
    description: 'One UUID returns all charger data - Recommended for WeidmÃ¼ller',
    requiresBlockUUID: true,
    requiresCredentials: true
  },
  loxone_api_multi: {
    value: 'loxone_api_multi',
    label: 'Loxone API (Multi-UUID)',
    description: 'Four separate UUIDs for power, state, user, mode - Legacy mode',
    requiresUUIDs: true,
    requiresCredentials: true
  },
  zaptec_api: {
    value: 'zaptec_api',
    label: 'Zaptec Cloud API',
    description: 'Connect via Zaptec cloud service',
    requiresCredentials: true
  },
  modbus_tcp: {
    value: 'modbus_tcp',
    label: 'Modbus TCP',
    description: 'Direct Modbus TCP connection',
    requiresIP: true
  },
  udp: {
    value: 'udp',
    label: 'UDP Listener',
    description: 'Receive UDP broadcasts from charger',
  },
  http: {
    value: 'http',
    label: 'HTTP REST API',
    description: 'HTTP endpoints for charger data',
  }
};

// Get connection types available for a preset
export const getAvailableConnectionTypes = (presetName: string): ConnectionTypeOption[] => {
  const preset = getPreset(presetName);
  return preset.supportedConnectionTypes.map(type => CONNECTION_TYPES[type]).filter(Boolean);
};