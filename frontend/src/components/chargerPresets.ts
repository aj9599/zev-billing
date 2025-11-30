// chargerPresets.ts
// ============================================================================
// CHARGER PRESET CONFIGURATION SYSTEM
// ============================================================================
// Add new charger presets here. Each preset defines default state/mode mappings
// and configuration options for a specific charger brand.
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
  supportsPriority: boolean; // Whether this charger brand supports priority charging
  defaultStateMappings: PresetStateMapping;
  defaultModeMappings: PresetModeMapping;
  stateOptions: Array<{ value: string; label: string }>;
  modeOptions: Array<{ value: string; label: string }>;
}

// ============================================================================
// WeidmÃ¼ller Preset
// ============================================================================
export const WEIDMULLER_PRESET: PresetConfig = {
  name: 'weidmuller',
  label: 'Weidmüller',
  description: 'Weidmüller AC Smart chargers with Loxone API (supports both single and multi-UUID modes)',
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
  ]
};

// ============================================================================
// Zaptec Preset
// ============================================================================
export const ZAPTEC_PRESET: PresetConfig = {
  name: 'zaptec',
  label: 'Zaptec',
  description: 'Zaptec Go/Pro chargers via cloud API with automatic state mapping',
  supportsPriority: false, // Zaptec uses load balancing instead of priority mode
  defaultStateMappings: {
    cable_locked: '65',
    waiting_auth: '66',
    charging: '67',
    idle: '50'
  },
  defaultModeMappings: {
    normal: '1',
    priority: '1' // Same as normal since Zaptec doesn't support priority mode
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
  ]
};

// ============================================================================
// Add future presets here
// ============================================================================
// Example ABB Preset (uncomment and configure when needed):
/*
export const ABB_PRESET: PresetConfig = {
  name: 'abb',
  label: 'ABB',
  description: 'ABB Terra AC chargers',
  supportsPriority: false,
  defaultStateMappings: {
    cable_locked: '10',
    waiting_auth: '20',
    charging: '30',
    idle: '40'
  },
  defaultModeMappings: {
    normal: '0',
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
  ]
};
*/

// ============================================================================
// Preset Registry
// ============================================================================
// Add new presets to this registry to make them available in the UI
export const CHARGER_PRESETS: Record<string, PresetConfig> = {
  weidmuller: WEIDMULLER_PRESET,
  zaptec: ZAPTEC_PRESET,
  // abb: ABB_PRESET,  // Uncomment when implementing
};

// Helper function to get preset by name with fallback
export const getPreset = (presetName: string): PresetConfig => {
  return CHARGER_PRESETS[presetName] || WEIDMULLER_PRESET;
};