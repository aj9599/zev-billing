import type {
  User, Building, Meter, Charger, BillingSettings,
  Invoice, DashboardStats, ConsumptionData, AdminLog,
  BuildingConsumption
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
  async getUsers(building_id?: number): Promise<User[]> {
    const query = building_id ? `?building_id=${building_id}` : '';
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
  async getMeters(building_id?: number): Promise<Meter[]> {
    const query = building_id ? `?building_id=${building_id}` : '';
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

  async generateBills(data: {
    building_ids: number[];
    user_ids: number[];
    start_date: string;
    end_date: string;
    sender_name?: string;
    sender_address?: string;
    sender_city?: string;
    sender_zip?: string;
    sender_country?: string;
    bank_name?: string;
    bank_iban?: string;
    bank_account_holder?: string;
  }): Promise<Invoice[]> {
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
}

export const api = new ApiClient();