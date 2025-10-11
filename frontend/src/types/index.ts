export interface User {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address_street: string;
  address_city: string;
  address_zip: string;
  address_country: string;
  bank_name: string;
  bank_iban: string;
  bank_account_holder: string;
  charger_ids: string;
  notes: string;
  building_id?: number;
  created_at: string;
  updated_at: string;
}

export interface Building {
  id: number;
  name: string;
  address_street: string;
  address_city: string;
  address_zip: string;
  address_country: string;
  notes: string;
  is_group: boolean;
  group_buildings?: number[];
  created_at: string;
  updated_at: string;
}

export interface Meter {
  id: number;
  name: string;
  meter_type: string;
  building_id: number;
  user_id?: number;
  connection_type: string;
  connection_config: string;
  notes: string;
  last_reading: number;
  last_reading_time?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Charger {
  id: number;
  name: string;
  brand: string;
  preset: string;
  building_id: number;
  connection_type: string;
  connection_config: string;
  supports_priority: boolean;
  notes: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BillingSettings {
  id: number;
  building_id: number;
  normal_power_price: number;
  solar_power_price: number;
  car_charging_normal_price: number;
  car_charging_priority_price: number;
  currency: string;
  valid_from: string;
  valid_to: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Invoice {
  id: number;
  invoice_number: string;
  user_id: number;
  building_id: number;
  period_start: string;
  period_end: string;
  total_amount: number;
  currency: string;
  status: string;
  items?: InvoiceItem[];
  user?: User;
  generated_at: string;
}

export interface InvoiceItem {
  id: number;
  invoice_id: number;
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  item_type: string;
}

export interface DashboardStats {
  total_users: number;
  total_buildings: number;
  total_meters: number;
  total_chargers: number;
  active_meters: number;
  active_chargers: number;
  today_consumption: number;
  month_consumption: number;
}

export interface ConsumptionData {
  timestamp: string;
  power: number;
  source: string;
}

export interface AdminLog {
  id: number;
  action: string;
  details: string;
  user_id?: number;
  ip_address: string;
  created_at: string;
}