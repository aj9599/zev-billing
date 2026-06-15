import type {
  User, Building, Meter, Charger, BillingSettings,
  Invoice, DashboardStats, ConsumptionData, AdminLog,
  BuildingConsumption, SharedMeterConfig, CustomLineItem,
  GenerateBillsRequest, MeterReplacement, MeterReplacementRequest,
  SelfConsumptionData, SystemHealth, CostOverview, EnergyFlowData, EnergyFlowLiveData,
  EmailAlertSettings, Device, DeviceLiveStatus, DeviceSwitchEvent, LoxoneControl,
  LicenseStatus, SmartMeDevice
} from '../types';

const API_BASE = '/api';

class ApiClient {
  private token: string | null = localStorage.getItem('token');
  private refreshingToken: Promise<void> | null = null;

  // Decode JWT payload to check expiration (no verification needed, just reading claims)
  private getTokenExpiry(): number | null {
    if (!this.token) return null;
    try {
      const parts = this.token.split('.');
      if (parts.length !== 3) return null;
      const payload = JSON.parse(atob(parts[1]));
      return payload.exp || null;
    } catch {
      return null;
    }
  }

  // Check if token expires within the next 24 hours
  private isTokenExpiringSoon(): boolean {
    const exp = this.getTokenExpiry();
    if (!exp) return false;
    const oneDayFromNow = Math.floor(Date.now() / 1000) + 86400;
    return exp < oneDayFromNow;
  }

  // Silently refresh the token if it's expiring soon
  private async ensureFreshToken(): Promise<void> {
    if (!this.token || !this.isTokenExpiringSoon()) return;

    // Prevent multiple concurrent refresh calls
    if (this.refreshingToken) {
      await this.refreshingToken;
      return;
    }

    this.refreshingToken = (async () => {
      try {
        const response = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          this.token = data.token;
          localStorage.setItem('token', data.token);
        }
        // If refresh fails silently, the current token may still be valid
      } catch {
        // Network error during refresh — ignore, retry on next request
      } finally {
        this.refreshingToken = null;
      }
    })();

    await this.refreshingToken;
  }

  private async request(endpoint: string, options: RequestInit = {}) {
    // Silently refresh token if expiring soon (before making the actual request)
    if (endpoint !== '/auth/refresh') {
      await this.ensureFreshToken();
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    if (options.headers) {
      Object.assign(headers, options.headers);
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      this.logout();
      window.location.href = '/login';
    }

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || 'Request failed');
    }

    if (response.status === 204) {
      return null;
    }

    return response.json();
  }

  // Auth
  async login(username: string, password: string) {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      throw new Error('Login failed');
    }

    const data = await response.json();
    this.token = data.token;
    localStorage.setItem('token', data.token);
    return data;
  }

  logout() {
    this.token = null;
    localStorage.removeItem('token');
  }

  async changePassword(old_password: string, new_password: string) {
    return this.request('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ old_password, new_password }),
    });
  }

  // Users
  async getUsers(building_id?: number, include_inactive?: boolean): Promise<User[]> {
    const params = new URLSearchParams();
    if (building_id) params.append('building_id', building_id.toString());
    if (include_inactive) params.append('include_inactive', 'true');
    const query = params.toString() ? `?${params}` : '';
    return this.request(`/users${query}`);
  }

  async getUser(id: number): Promise<User> {
    return this.request(`/users/${id}`);
  }

  async createUser(user: Partial<User>): Promise<User> {
    return this.request('/users', {
      method: 'POST',
      body: JSON.stringify(user),
    });
  }

  async updateUser(id: number, user: Partial<User>): Promise<User> {
    return this.request(`/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(user),
    });
  }

  async deleteUser(id: number) {
    return this.request(`/users/${id}`, { method: 'DELETE' });
  }

  async getAdminUsersForBuildings(buildingIds: string): Promise<User[]> {
    return this.request(`/users/admin-for-buildings?building_ids=${buildingIds}`);
  }

  // Buildings
  async getBuildings(): Promise<Building[]> {
    return this.request('/buildings');
  }

  async getBuilding(id: number): Promise<Building> {
    return this.request(`/buildings/${id}`);
  }

  async createBuilding(building: Partial<Building>): Promise<Building> {
    return this.request('/buildings', {
      method: 'POST',
      body: JSON.stringify(building),
    });
  }

  async updateBuilding(id: number, building: Partial<Building>): Promise<Building> {
    return this.request(`/buildings/${id}`, {
      method: 'PUT',
      body: JSON.stringify(building),
    });
  }

  async deleteBuilding(id: number) {
    return this.request(`/buildings/${id}`, { method: 'DELETE' });
  }

  // Meters
  async getMeters(building_id?: number, include_archived?: boolean): Promise<Meter[]> {
    const params = new URLSearchParams();
    if (building_id) params.append('building_id', building_id.toString());
    if (include_archived) params.append('include_archived', 'true');
    const query = params.toString() ? `?${params}` : '';
    return this.request(`/meters${query}`);
  }

  async getMeter(id: number): Promise<Meter> {
    return this.request(`/meters/${id}`);
  }

  async createMeter(meter: Partial<Meter>): Promise<Meter> {
    return this.request('/meters', {
      method: 'POST',
      body: JSON.stringify(meter),
    });
  }

  async updateMeter(id: number, meter: Partial<Meter>): Promise<Meter> {
    return this.request(`/meters/${id}`, {
      method: 'PUT',
      body: JSON.stringify(meter),
    });
  }

  async deleteMeter(id: number) {
    return this.request(`/meters/${id}`, { method: 'DELETE' });
  }

  // Persist a custom display order for meter cards (ids in display order).
  async reorderMeters(ids: number[]): Promise<{ success: boolean }> {
    return this.request('/meters/reorder', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
  }

  async testSmartMeConnection(config: {
    auth_type: 'basic' | 'apikey' | 'oauth';
    device_id?: string;
    serial?: string;
    username?: string;
    password?: string;
    api_key?: string;
    client_id?: string;
    client_secret?: string;
  }): Promise<{ success: boolean; message: string }> {
    return this.request('/meters/test-smartme', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  }

  // Lists all Smart-me devices for the given credentials so the user can pick a
  // meter by name (like Loxone discovery) instead of entering a UUID.
  async discoverSmartMeDevices(config: {
    auth_type: 'basic' | 'apikey' | 'oauth';
    username?: string;
    password?: string;
    api_key?: string;
    client_id?: string;
    client_secret?: string;
  }): Promise<SmartMeDevice[]> {
    return this.request('/meters/discover-smartme', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  }

  async getMeterDeletionImpact(id: number): Promise<{
    meter_id: number;
    meter_name: string;
    readings_count: number;
    oldest_reading: string;
    newest_reading: string;
    has_data: boolean;
  }> {
    return this.request(`/meters/${id}/deletion-impact`);
  }

  // NEW: Meter Replacement endpoints
  async replaceMeter(request: MeterReplacementRequest): Promise<{
    replacement: MeterReplacement;
    new_meter: Meter;
    old_meter: Meter;
  }> {
    return this.request('/meters/replace', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async getMeterReplacementHistory(meterId: number): Promise<MeterReplacement[]> {
    return this.request(`/meters/${meterId}/replacement-history`);
  }

  async getMeterReplacementChain(meterId: number): Promise<{
    current_meter: Meter;
    predecessor_meters: Meter[];
    successor_meters: Meter[];
    replacements: MeterReplacement[];
  }> {
    return this.request(`/meters/${meterId}/replacement-chain`);
  }

  async getArchivedMeters(building_id?: number): Promise<Meter[]> {
    const query = building_id ? `?building_id=${building_id}` : '';
    return this.request(`/meters/archived${query}`);
  }

  // Chargers
  async getChargers(building_id?: number): Promise<Charger[]> {
    const query = building_id ? `?building_id=${building_id}` : '';
    return this.request(`/chargers${query}`);
  }

  async getCharger(id: number): Promise<Charger> {
    return this.request(`/chargers/${id}`);
  }

  async createCharger(charger: Partial<Charger>): Promise<Charger> {
    return this.request('/chargers', {
      method: 'POST',
      body: JSON.stringify(charger),
    });
  }

  async updateCharger(id: number, charger: Partial<Charger>): Promise<Charger> {
    return this.request(`/chargers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(charger),
    });
  }

  async deleteCharger(id: number) {
    return this.request(`/chargers/${id}`, { method: 'DELETE' });
  }

  // Persist a custom display order for charger cards (ids in display order).
  async reorderChargers(ids: number[]): Promise<{ success: boolean }> {
    return this.request('/chargers/reorder', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
  }

  // Controllable devices (solar-driven on/off control)
  async getDevices(building_id?: number): Promise<Device[]> {
    const query = building_id ? `?building_id=${building_id}` : '';
    return this.request(`/devices${query}`);
  }

  async getDevice(id: number): Promise<Device> {
    return this.request(`/devices/${id}`);
  }

  async createDevice(device: Partial<Device>): Promise<Device> {
    return this.request('/devices', { method: 'POST', body: JSON.stringify(device) });
  }

  async updateDevice(id: number, device: Partial<Device>): Promise<Device> {
    return this.request(`/devices/${id}`, { method: 'PUT', body: JSON.stringify(device) });
  }

  async deleteDevice(id: number) {
    return this.request(`/devices/${id}`, { method: 'DELETE' });
  }

  async controlDevice(id: number, mode: 'auto' | 'on' | 'off', duration_seconds?: number): Promise<{ status: string }> {
    return this.request(`/devices/${id}/control`, {
      method: 'POST',
      body: JSON.stringify({ mode, duration_seconds: duration_seconds ?? 0 }),
    });
  }

  async updateDeviceSchedule(id: number, schedule_json: string | null): Promise<{ status: string }> {
    return this.request(`/devices/${id}/schedule`, {
      method: 'PUT',
      body: JSON.stringify({ schedule_json }),
    });
  }

  async updateDeviceGuarantee(id: number, guarantee_hours: number, guarantee_by: string | null): Promise<{ status: string }> {
    return this.request(`/devices/${id}/guarantee`, {
      method: 'PUT',
      body: JSON.stringify({ guarantee_hours, guarantee_by }),
    });
  }

  async getDeviceLiveStatus(building_id?: number): Promise<DeviceLiveStatus[]> {
    const query = building_id ? `?building_id=${building_id}` : '';
    return this.request(`/devices/status/live${query}`);
  }

  async testDevice(id: number): Promise<{ online: boolean; state: string; error?: string }> {
    return this.request(`/devices/${id}/test`, { method: 'POST' });
  }

  async getDeviceEvents(id: number): Promise<DeviceSwitchEvent[]> {
    return this.request(`/devices/${id}/events`);
  }

  async discoverLoxoneControls(payload: { host: string; username: string; password: string; category?: string }): Promise<LoxoneControl[]> {
    return this.request('/devices/discover', {
      method: 'POST',
      body: JSON.stringify({ driver: 'loxone', ...payload }),
    });
  }

  async getChargerDeletionImpact(id: number): Promise<{
    charger_id: number;
    charger_name: string;
    sessions_count: number;
    oldest_session: string;
    newest_session: string;
    has_data: boolean;
  }> {
    return this.request(`/chargers/${id}/deletion-impact`);
  }

  // NEW: Import charger sessions from CSV
  async importChargerSessionsFromCSV(chargerId: number, file: File): Promise<{
    status: string;
    charger_id: number;
    charger_name: string;
    processed: number;
    imported: number;
    errors: number;
    deleted_count: number;
    first_error?: string;
  }> {
    const formData = new FormData();
    formData.append('csv', file);

    const response = await fetch(`${this.getBaseUrl()}/chargers/${chargerId}/import-sessions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || 'Import failed');
    }

    return response.json();
  }

  // Backfill history from an E3/DC wallbox session export (myE3DC CSV).
  async importE3dcSessionsCSV(chargerId: number, file: File): Promise<{
    status: string;
    sessions_imported: number;
    slots_written: number;
    total_kwh: number;
    skipped: number;
    from: string;
    to: string;
  }> {
    const formData = new FormData();
    formData.append('csv', file);
    const response = await fetch(`${this.getBaseUrl()}/chargers/${chargerId}/import-e3dc-csv`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.token}` },
      body: formData,
    });
    if (!response.ok) {
      throw new Error((await response.text()) || 'Import failed');
    }
    return response.json();
  }

  // NEW: Get sessions for a charger
  async getChargerSessions(chargerId: number, limit: number = 100): Promise<any[]> {
    return this.request(`/chargers/${chargerId}/sessions?limit=${limit}`);
  }

  // E3/DC per-session charging history (device-captured + backfilled).
  async getE3dcSessionHistory(chargerId: number, limit: number = 200): Promise<Array<{
    id: number;
    session_key: string;
    start_time: string;
    end_time: string;
    total_kwh: number;
    solar_kwh: number;
    grid_kwh: number;
    rfid: string;
    source: string;
  }>> {
    return this.request(`/chargers/${chargerId}/e3dc-session-history?limit=${limit}`);
  }

  // Rebuild the reconstructed (backfill) E3/DC history for a date range. Device-
  // captured sessions are never touched; only backfill rows in the window change.
  async rescanE3dcBackfill(chargerId: number, from: string, to: string): Promise<{
    status: string;
    deleted: number;
    inserted: number;
  }> {
    return this.request(`/chargers/${chargerId}/e3dc-backfill-rescan`, {
      method: 'POST',
      body: JSON.stringify({ from, to }),
    });
  }

  // Assign (or clear) the RFID/user for one E3/DC history session. Also updates
  // the underlying 15-min rows so billing attributes the energy. rfid='' clears.
  async assignE3dcSession(chargerId: number, sessionId: number, rfid: string): Promise<{
    status: string;
    sessions_updated: number;
  }> {
    return this.request(`/chargers/${chargerId}/e3dc-session-history/${sessionId}/assign`, {
      method: 'POST',
      body: JSON.stringify({ rfid }),
    });
  }

  // NEW: Delete all sessions for a charger
  async deleteChargerSessions(chargerId: number): Promise<{
    status: string;
    deleted_count: number;
  }> {
    return this.request(`/chargers/${chargerId}/sessions`, { method: 'DELETE' });
  }

  private getBaseUrl(): string {
    return '/api';
  }

  // Billing
  async getBillingSettings(building_id?: number): Promise<BillingSettings | BillingSettings[]> {
    const query = building_id ? `?building_id=${building_id}` : '';
    return this.request(`/billing/settings${query}`);
  }

  async createBillingSettings(settings: Partial<BillingSettings>): Promise<BillingSettings> {
    return this.request('/billing/settings', {
      method: 'POST',
      body: JSON.stringify(settings),
    });
  }

  // License / plan
  async getLicense(): Promise<LicenseStatus> {
    return this.request('/license');
  }

  async activateLicense(key: string): Promise<LicenseStatus> {
    return this.request('/license/activate', {
      method: 'POST',
      body: JSON.stringify({ key }),
    });
  }

  async deactivateLicense(): Promise<LicenseStatus> {
    return this.request('/license/deactivate', {
      method: 'POST',
    });
  }

  async updateBillingSettings(settings: Partial<BillingSettings>): Promise<BillingSettings> {
    return this.request('/billing/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  }

  async deleteBillingSettings(id: number) {
    return this.request(`/billing/settings/${id}`, { method: 'DELETE' });
  }

  async generateBills(data: GenerateBillsRequest): Promise<Invoice[]> {
    return this.request('/billing/generate', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getInvoices(user_id?: number, building_id?: number): Promise<Invoice[]> {
    const params = new URLSearchParams();
    if (user_id) params.append('user_id', user_id.toString());
    if (building_id) params.append('building_id', building_id.toString());
    const query = params.toString() ? `?${params}` : '';
    return this.request(`/billing/invoices${query}`);
  }

  async getInvoice(id: number): Promise<Invoice> {
    return this.request(`/billing/invoices/${id}`);
  }

  async deleteInvoice(id: number) {
    return this.request(`/billing/invoices/${id}`, { method: 'DELETE' });
  }

  async downloadInvoicePDF(id: number): Promise<string> {
    return `${API_BASE}/billing/invoices/${id}/pdf`;
  }

  // Shared Meters
  async getSharedMeterConfigs(building_id?: number): Promise<SharedMeterConfig[]> {
    const query = building_id ? `?building_id=${building_id}` : '';
    return this.request(`/shared-meters${query}`);
  }

  async getSharedMeterConfig(id: number): Promise<SharedMeterConfig> {
    return this.request(`/shared-meters/${id}`);
  }

  async createSharedMeterConfig(config: Partial<SharedMeterConfig>): Promise<SharedMeterConfig> {
    return this.request('/shared-meters', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  }

  async updateSharedMeterConfig(id: number, config: Partial<SharedMeterConfig>): Promise<SharedMeterConfig> {
    return this.request(`/shared-meters/${id}`, {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  }

  async deleteSharedMeterConfig(id: number) {
    return this.request(`/shared-meters/${id}`, { method: 'DELETE' });
  }

  // Custom Line Items
  async getCustomLineItems(building_id?: number): Promise<CustomLineItem[]> {
    const query = building_id ? `?building_id=${building_id}` : '';
    return this.request(`/custom-line-items${query}`);
  }

  async getCustomLineItem(id: number): Promise<CustomLineItem> {
    return this.request(`/custom-line-items/${id}`);
  }

  async createCustomLineItem(item: Partial<CustomLineItem>): Promise<CustomLineItem> {
    return this.request('/custom-line-items', {
      method: 'POST',
      body: JSON.stringify(item),
    });
  }

  async updateCustomLineItem(id: number, item: Partial<CustomLineItem>): Promise<CustomLineItem> {
    return this.request(`/custom-line-items/${id}`, {
      method: 'PUT',
      body: JSON.stringify(item),
    });
  }

  async deleteCustomLineItem(id: number) {
    return this.request(`/custom-line-items/${id}`, { method: 'DELETE' });
  }

  // Auto Billing
  async getAutoBillingConfigs(): Promise<any[]> {
    return this.request('/billing/auto-configs');
  }

  async getAutoBillingConfig(id: number): Promise<any> {
    return this.request(`/billing/auto-configs/${id}`);
  }

  async createAutoBillingConfig(config: any): Promise<any> {
    return this.request('/billing/auto-configs', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  }

  async updateAutoBillingConfig(id: number, config: any): Promise<any> {
    return this.request(`/billing/auto-configs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  }

  async deleteAutoBillingConfig(id: number) {
    return this.request(`/billing/auto-configs/${id}`, { method: 'DELETE' });
  }

  // Manually run an auto-billing config now (test run). Generates the bill
  // for the period that the next scheduled run would cover, produces the
  // PDF, and (when the config has auto_send_email enabled) e-mails it via
  // the configured SMTP. Does not advance the scheduled next_run.
  async runAutoBillingConfigNow(id: number): Promise<{
    status: string;
    result?: {
      config_id: number;
      config_name: string;
      period_start: string;
      period_end: string;
      invoices_generated: number;
      pdfs_generated: number;
      emails_sent: number;
      emails_failed: number;
      email_requested: boolean;
      smtp_configured: boolean;
      first_invoice_id: number;
      invoice_ids: number[];
      warnings: string[] | null;
    };
    message?: string;
  }> {
    return this.request(`/billing/auto-configs/${id}/run-now`, { method: 'POST' });
  }

  // Backfill charger_sessions from the Zaptec chargehistory API for a date range.
  // Safe to re-run thanks to the unique index on (charger_id, session_time).
  async syncZaptecHistory(chargerId: number, from: string, to: string): Promise<{
    charger_id: number;
    charger_name: string;
    from: string;
    to: string;
    fetched: number;
    ocmf_parsed: number;
    fallback: number;
    skipped: number;
    errors: number;
    error?: string;
  }> {
    return this.request(`/chargers/${chargerId}/sync-zaptec-history`, {
      method: 'POST',
      body: JSON.stringify({ from, to }),
    });
  }

  // Bill layout (per building, main invoice page only)
  async getBillLayout(buildingId: number): Promise<{
    building_id: number;
    title: string;
    intro_text: string;
    footer_text: string;
    primary_color: string;
  }> {
    return this.request(`/billing/layouts/${buildingId}`);
  }

  async updateBillLayout(buildingId: number, layout: {
    title: string;
    intro_text: string;
    footer_text: string;
    primary_color: string;
  }): Promise<any> {
    return this.request(`/billing/layouts/${buildingId}`, {
      method: 'PUT',
      body: JSON.stringify(layout),
    });
  }

  // Dashboard
  async getDashboardStats(): Promise<DashboardStats> {
    return this.request('/dashboard/stats');
  }

  async getConsumption(period: string = '24h'): Promise<ConsumptionData[]> {
    return this.request(`/dashboard/consumption?period=${period}`);
  }

  async getConsumptionByBuilding(period: string = '24h'): Promise<BuildingConsumption[]> {
    return this.request(`/dashboard/consumption-by-building?period=${period}`);
  }

  async getSelfConsumption(): Promise<SelfConsumptionData> {
    return this.request('/dashboard/self-consumption');
  }

  async getSystemHealth(): Promise<SystemHealth> {
    return this.request('/dashboard/system-health');
  }

  async getCostOverview(): Promise<CostOverview> {
    return this.request('/dashboard/cost-overview');
  }

  async getEnergyFlow(period: string = 'today', buildingId: number = 0): Promise<EnergyFlowData> {
    return this.request(`/dashboard/energy-flow?period=${period}&building_id=${buildingId}`);
  }

  async getEnergyFlowLive(buildingId: number = 0): Promise<EnergyFlowLiveData> {
    return this.request(`/dashboard/energy-flow-live?building_id=${buildingId}`);
  }

  async getLogs(limit: number = 100, since?: string): Promise<AdminLog[]> {
    if (since) {
      return this.request(`/dashboard/logs?since=${encodeURIComponent(since)}`);
    }
    return this.request(`/dashboard/logs?limit=${limit}`);
  }

  // Debug/System
  async getDebugStatus(): Promise<any> {
    return this.request('/debug/status');
  }

  async getHealthHistory(): Promise<{ timestamp: number; cpu_usage: number; memory_percent: number; disk_percent: number; temperature: number }[]> {
    return this.request('/debug/health-history');
  }

  // Backup methods
  async createBackup(): Promise<{ status: string; backup_name: string; backup_path: string }> {
    return this.request('/system/backup', { method: 'POST' });
  }

  downloadBackup(fileName: string): string {
    return `${API_BASE}/system/backup/download?file=${encodeURIComponent(fileName)}`;
  }

  async restoreBackup(file: File): Promise<{ status: string; message: string }> {
    const formData = new FormData();
    formData.append('backup', file);

    const response = await fetch(`${API_BASE}/system/backup/restore`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || 'Restore failed');
    }

    return response.json();
  }

  async listBackups(): Promise<Array<{ name: string; size: number; modified: string; auto: boolean }>> {
    return this.request('/system/backups');
  }

  async getBackupStatus(): Promise<{
    hour: number;
    retention: number;
    last_run: string | null;
    last_name: string;
    last_error: string;
    next_run: string;
    directory: string;
  }> {
    return this.request('/system/backup/status');
  }

  async runBackupNow(): Promise<{ last_name: string; last_error: string }> {
    return this.request('/system/backup/run', { method: 'POST' });
  }

  // Download a backup file with auth, triggering a browser save.
  async downloadBackupFile(fileName: string): Promise<void> {
    const response = await fetch(`${API_BASE}/system/backup/download?file=${encodeURIComponent(fileName)}`, {
      headers: { 'Authorization': `Bearer ${this.token}` },
    });
    if (!response.ok) throw new Error('Download failed');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // Update methods
  async checkForUpdates(): Promise<{
    updates_available: boolean;
    current_commit: string;
    remote_commit: string;
    commit_log: string;
  }> {
    return this.request('/system/update/check');
  }

  async applyUpdate(): Promise<{ phase: string; message: string }> {
    return this.request('/system/update/apply', { method: 'POST' });
  }

  async getUpdateStatus(): Promise<{ phase: string; message: string; progress: number; error: string }> {
    return this.request('/system/update/status');
  }

  // NEW: Factory Reset method
  async factoryReset(): Promise<{
    status: string;
    message: string;
    backup_name: string;
    backup_path: string
  }> {
    return this.request('/system/factory-reset', { method: 'POST' });
  }

  // Email Alert Settings
  async getEmailAlertSettings(): Promise<EmailAlertSettings> {
    return this.request('/settings/email-alerts');
  }

  async updateEmailAlertSettings(settings: Partial<EmailAlertSettings>): Promise<{ message: string }> {
    return this.request('/settings/email-alerts', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  }

  async testEmailAlert(): Promise<{ status: string; message: string }> {
    return this.request('/settings/email-alerts/test', { method: 'POST' });
  }

  async testHealthReport(): Promise<{ status: string; message: string }> {
    return this.request('/settings/email-alerts/test-health', { method: 'POST' });
  }

  // --- Admin: tenant portal access tokens ---
  async getUserPortalToken(userId: number): Promise<{ token: string }> {
    return this.request(`/users/${userId}/portal-token`);
  }

  async generateUserPortalToken(userId: number): Promise<{ token: string }> {
    return this.request(`/users/${userId}/portal-token`, { method: 'POST' });
  }

  async revokeUserPortalToken(userId: number): Promise<{ status: string }> {
    return this.request(`/users/${userId}/portal-token`, { method: 'DELETE' });
  }

  // --- Tenant portal (uses a separate 'portal_token', not the admin token) ---
  async portalLogin(code: string): Promise<{ token: string; name: string }> {
    const res = await fetch(`${API_BASE}/portal/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (!res.ok) throw new Error((await res.text()) || 'Login failed');
    return res.json();
  }

  private async portalRequest(path: string): Promise<any> {
    const token = localStorage.getItem('portal_token');
    const res = await fetch(`${API_BASE}/portal${path}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (res.status === 401 || res.status === 403) throw new Error('unauthorized');
    if (!res.ok) throw new Error((await res.text()) || 'Request failed');
    return res.json();
  }

  async portalMe(): Promise<{ name: string; email: string; apartment: string; building: string }> {
    return this.portalRequest('/me');
  }

  async portalInvoices(): Promise<Array<{
    id: number; invoice_number: string; period_start: string; period_end: string;
    total_amount: number; currency: string; status: string; has_pdf: boolean;
  }>> {
    return this.portalRequest('/invoices');
  }

  async portalCharging(): Promise<Array<{
    start_time: string; end_time: string; total_kwh: number; solar_kwh: number; grid_kwh: number;
  }>> {
    return this.portalRequest('/charging');
  }

  async portalDownloadInvoice(id: number, invoiceNumber: string): Promise<void> {
    const token = localStorage.getItem('portal_token');
    const res = await fetch(`${API_BASE}/portal/invoices/${id}/pdf`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Download failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${invoiceNumber}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
}

export const api = new ApiClient();