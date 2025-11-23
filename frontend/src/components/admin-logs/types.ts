export interface SystemHealth {
    cpu_usage: number;
    memory_used: number;
    memory_total: number;
    memory_percent: number;
    disk_used: number;
    disk_total: number;
    disk_percent: number;
    temperature: number;
    uptime: string;
  }
  
  export interface UpdateInfo {
    updates_available: boolean;
    current_commit: string;
    remote_commit: string;
    commit_log: string;
  }
  
  export interface DebugInfo {
    system_health?: SystemHealth;
    active_meters?: number;
    total_meters?: number;
    active_chargers?: number;
    total_chargers?: number;
    last_collection?: string;
    next_collection_minutes?: number;
    udp_listeners?: number[];
    recent_errors?: number;
  }