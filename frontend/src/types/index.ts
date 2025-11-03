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
  apartment_unit?: string;
  user_type: 'regular' | 'administration';
  managed_buildings?: number[] | string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FloorConfig {
  floor_number: number;
  floor_name: string;
  apartments: string[];
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
  has_apartments: boolean;
  floors_config?: FloorConfig[];
  created_at: string;
  updated_at: string;
}

export interface Meter {
  id: number;
  name: string;
  meter_type: string;
  building_id: number;
  user_id?: number;
  apartment_unit?: string;
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

export interface AutoBillingConfig {
  id: number;
  name: string;
  building_ids: number[];
  user_ids: number[];
  frequency: 'monthly' | 'quarterly' | 'half_yearly' | 'yearly';
  generation_day: number;
  first_execution_date?: string;
  is_active: boolean;
  last_run?: string;
  next_run?: string;
  sender_name?: string;
  sender_address?: string;
  sender_city?: string;
  sender_zip?: string;
  sender_country?: string;
  bank_name?: string;
  bank_iban?: string;
  bank_account_holder?: string;
  created_at: string;
  updated_at: string;
}

export interface DashboardStats {
  total_users: number;
  regular_users: number;
  admin_users: number;
  active_users: number;
  inactive_users: number;
  total_buildings: number;
  total_complexes: number;
  total_meters: number;
  total_chargers: number;
  active_meters: number;
  active_chargers: number;
  today_consumption: number;
  month_consumption: number;
  today_solar: number;
  month_solar: number;
  today_charging: number;
  month_charging: number;
}

export interface ConsumptionData {
  timestamp: string;
  power: number;
  source: string;
}

export interface MeterData {
  meter_id: number;
  meter_name: string;
  meter_type: string;
  user_name?: string;
  data: ConsumptionData[];
}

export interface BuildingConsumption {
  building_id: number;
  building_name: string;
  meters: MeterData[];
}

export interface AdminLog {
  id: number;
  action: string;
  details: string;
  user_id?: number;
  ip_address: string;
  created_at: string;
}