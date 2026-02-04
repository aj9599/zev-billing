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
  language?: string; // Invoice language (de, fr, it, en)
  is_active: boolean;
  rent_start_date?: string; // Rent period start date (required for regular users)
  rent_end_date?: string;   // Rent period end date (default: 2099-01-01)
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
  device_type?: string; // NEW: whatwatt-go, shelly-3em, shelly-em, generic, custom
  loxone_connection_mode?: 'local' | 'remote';
  notes: string;
  last_reading: number;
  last_reading_time?: string;
  last_reading_export?: number; // NEW: Export/return energy
  is_active: boolean;
  is_shared: boolean;
  is_archived: boolean;
  replaced_by_meter_id?: number;
  replaces_meter_id?: number;
  replacement_date?: string;
  replacement_notes?: string;
  created_at: string;
  updated_at: string;
}

export interface MeterReplacement {
  id: number;
  old_meter_id: number;
  new_meter_id: number;
  replacement_date: string;
  old_meter_final_reading: number;
  new_meter_initial_reading: number;
  reading_offset: number;
  notes: string;
  performed_by?: string;
  created_at: string;
}

export interface MeterReplacementRequest {
  old_meter_id: number;
  new_meter_name: string;
  new_meter_type: string;
  new_connection_type: string;
  new_connection_config: string;
  replacement_date: string;
  old_meter_final_reading: number;
  new_meter_initial_reading: number;
  replacement_notes: string;
  copy_settings: boolean;
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
  is_complex: boolean;
  normal_power_price: number;
  solar_power_price: number;
  car_charging_normal_price: number;
  car_charging_priority_price: number;
  vzev_export_price?: number;
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
  pdf_path?: string;
  is_vzev?: boolean;
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

export interface SharedMeterConfig {
  id: number;
  meter_id: number;
  building_id: number;
  meter_name: string;
  split_type: 'equal' | 'by_area' | 'by_units' | 'custom';
  unit_price: number;
  created_at: string;
  updated_at: string;
}

export interface CustomLineItem {
  id: number;
  building_id: number;
  description: string;
  amount: number;
  frequency: 'once' | 'monthly' | 'quarterly' | 'yearly';
  category: 'meter_rent' | 'maintenance' | 'service' | 'other';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ApartmentWithUser {
  building_id: number;
  apartment_unit: string;
  user?: User;
  meter?: Meter;
  has_meter: boolean;
}

export interface GenerateBillsRequest {
  building_ids: number[];
  user_ids: number[];
  apartments?: ApartmentSelection[];
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
  include_shared_meters?: boolean;
  shared_meter_configs?: SharedMeterConfig[];
  custom_line_items?: CustomLineItemSelection[];  // Legacy - kept for backward compatibility
  custom_item_ids?: number[];  // NEW: Array of custom line item IDs to include
  is_vzev?: boolean;
}

export interface ApartmentSelection {
  building_id: number;
  apartment_unit: string;
  user_id?: number;
}

export interface CustomLineItemSelection {
  item_id?: number;
  description: string;
  amount: number;
  category: string;
  is_one_time: boolean;
}

export interface AutoBillingConfig {
  id: number;
  name: string;
  building_ids: number[];
  user_ids: number[];
  apartments?: ApartmentSelection[];    // NEW: Apartment selections
  custom_item_ids?: number[];           // NEW: Array of custom line item IDs
  frequency: 'monthly' | 'quarterly' | 'half_yearly' | 'yearly';
  generation_day: number;
  first_execution_date?: string;
  is_active: boolean;
  is_vzev?: boolean;                    // NEW: vZEV mode flag
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

export interface SelfConsumptionData {
  today_solar_produced: number;
  today_solar_consumed: number;
  today_self_consumption_pct: number;
  month_solar_produced: number;
  month_solar_consumed: number;
  month_self_consumption_pct: number;
}

export interface DeviceHealth {
  id: number;
  name: string;
  type: string;
  meter_type: string;
  building_name: string;
  is_active: boolean;
  last_reading: string | null;
  status: string;
}

export interface SystemHealth {
  devices: DeviceHealth[];
  online_count: number;
  stale_count: number;
  offline_count: number;
}

export interface BuildingCostEstimate {
  building_id: number;
  building_name: string;
  grid_cost: number;
  solar_cost: number;
  charging_cost: number;
  total_cost: number;
  currency: string;
}

export interface CostOverview {
  buildings: BuildingCostEstimate[];
  total_cost: number;
  currency: string;
}

export interface EnergyFlowData {
  period: string;
  solar_produced_kwh: number;
  solar_self_consumed_kwh: number;
  solar_exported_kwh: number;
  total_consumption_kwh: number;
  grid_import_kwh: number;
  ev_charging_kwh: number;
  self_consumption_pct: number;
  per_building?: BuildingEnergyFlow[];
}

export interface BuildingEnergyFlow {
  building_id: number;
  building_name: string;
  solar_produced_kwh: number;
  solar_self_consumed_kwh: number;
  total_consumption_kwh: number;
  grid_import_kwh: number;
  ev_charging_kwh: number;
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