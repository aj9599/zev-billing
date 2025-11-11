import type {
  User, Building, Meter, Charger, BillingSettings,
  Invoice, DashboardStats, ConsumptionData, AdminLog,
  BuildingConsumption, SharedMeterConfig, CustomLineItem,
  GenerateBillsRequest, MeterReplacement, MeterReplacementRequest
} from '../types';

const API_BASE = '/api';

class ApiClient {
  private token: string | null = localStorage.getItem('token');

  private async request(endpoint: string, options: RequestInit = {}) {
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

  async getLogs(limit: number = 100): Promise<AdminLog[]> {
    return this.request(`/dashboard/logs?limit=${limit}`);
  }

  // Debug/System
  async getDebugStatus(): Promise<any> {
    return this.request('/debug/status');
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

  // Update methods
  async checkForUpdates(): Promise<{
    updates_available: boolean;
    current_commit: string;
    remote_commit: string;
    commit_log: string;
  }> {
    return this.request('/system/update/check');
  }

  async applyUpdate(): Promise<{ status: string; message: string }> {
    return this.request('/system/update/apply', { method: 'POST' });
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
}

export const api = new ApiClient();