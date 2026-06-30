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

export type FloorType = 'attic' | 'normal' | 'underground';

export interface FloorConfig {
  floor_number: number;
  floor_name: string;
  floor_type: FloorType;
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
  is_mid_certified?: boolean; // NEW: MID-certified (billing-valid) vs. monitoring-only
  is_shared: boolean;
  is_archived: boolean;
  replaced_by_meter_id?: number;
  replaces_meter_id?: number;
  replacement_date?: string;
  replacement_notes?: string;
  sort_order?: number;
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
  /** "mode_based" (bill by charge mode) | "solar_split" (proportional solar share, like a meter) */
  billing_method?: string;
  notes: string;
  is_active: boolean;
  sort_order?: number;
  created_at: string;
  updated_at: string;
}

export interface LicenseLimits {
  buildings: number;  // -1 = unlimited
  users: number;
  meters: number;
  chargers: number;
  devices: number;
  billing: boolean;
}

export interface LicenseUsage {
  buildings: number;
  users: number;
  meters: number;
  chargers: number;
  devices: number;
}

export interface LicenseStatus {
  tier: 'free' | 'trial' | 'pro' | 'custom';
  valid: boolean;
  licensee?: string;
  expires?: string;
  trial_active: boolean;
  trial_days_left: number;
  billing_allowed: boolean;
  limits: LicenseLimits;
  usage: LicenseUsage;
  message?: string;
  message_code?: string;
  // Phase 2 (online activation / device binding)
  online: boolean;
  device_id: string;
  last_validated?: string;
  key_masked?: string;
  key_type?: 'lifetime' | 'limited';
}

export interface Device {
  id: number;
  name: string;
  building_id: number;
  driver: string;             // 'shelly' | 'loxone'
  connection_config: string;  // JSON string
  control_mode: string;       // 'auto' | 'on' | 'off'
  manual_override_until?: string | null;
  switch_on_threshold_w: number;
  switch_off_threshold_w: number;
  min_runtime_seconds: number;
  min_offtime_seconds: number;
  priority: number;
  schedule_json?: string | null;
  guarantee_hours: number;
  guarantee_by?: string | null;
  last_command?: string | null;
  last_command_at?: string | null;
  last_state?: string | null;
  last_state_at?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DeviceLiveStatus {
  device_id: number;
  online: boolean;
  state: string;       // 'on' | 'off' | 'offline' | 'unknown'
  mode: string;        // 'auto' | 'on' | 'off'
  desired_on?: boolean;       // what the controller wants (auto: ON/OFF)
  has_signal: boolean;
  surplus_live: boolean;      // true = instantaneous, false = estimated
  building_surplus_w: number;
  runtime_today_min: number;  // accumulated ON minutes today
  power_w?: number;           // live power (PM devices)
  energy_wh?: number;         // lifetime energy counter (PM devices)
  stage_level?: number;       // active stage (staged devices; 0 = all off)
  stage_count?: number;       // total configured stages (staged devices)
  reason?: string;            // why the device is in its current state
  last_error?: string;
  updated_at?: string;
}

export interface LoxoneControl {
  name: string;
  uuid: string;
  state_uuid?: string;
  room: string;
  type: string;
}

// A device returned by Smart-me discovery (GET /Devices), trimmed for the picker.
export interface SmartMeDevice {
  id: string;
  name: string;
  serial: number;
  device_energy_type: number;
  counter_reading: number;
  unit: string;
}

export interface DeviceSwitchEvent {
  id: number;
  device_id: number;
  command: string;
  reason: string;
  surplus_w: number;
  success: boolean;
  error?: string;
  created_at: string;
}

export interface BillingSettings {
  id: number;
  building_id: number;
  is_complex: boolean;
  normal_power_price: number;
  solar_power_price: number;
  battery_power_price?: number;
  battery_charging_price?: number;
  car_charging_normal_price: number;
  car_charging_priority_price: number;
  vzev_export_price?: number;
  vat_included?: boolean;
  vat_rate?: number;
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
  payment_status?: 'unpaid' | 'partial' | 'paid';
  paid_amount?: number;
  paid_at?: string | null;
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

export type SharedMeterPricingMode = 'single' | 'solar_grid_custom' | 'solar_grid_pricing';

export interface SharedMeterConfig {
  id: number;
  meter_id: number;
  building_id: number;
  meter_name: string;
  split_type: 'equal' | 'by_area' | 'by_units' | 'custom';
  unit_price: number;
  // How the meter's kWh are priced before being split among units:
  //   single             – flat unit_price per kWh
  //   solar_grid_custom   – proportional solar/grid split priced with solar_price/grid_price
  //   solar_grid_pricing  – proportional solar/grid split priced from the building pricing config
  pricing_mode: SharedMeterPricingMode;
  solar_price: number;
  grid_price: number;
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

export type BillingMode = 'apartments' | 'building' | 'charger';
// Which cost blocks land on the invoice — works for every building type.
export type BillContent = 'both' | 'meters' | 'chargers';

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
  // Billing mode — driven by the building's apartment-management flag.
  // 'apartments' (default) keeps the existing per-apartment flow.
  // 'building'  bills the whole building to one user (chargers matched by id, no RFID required).
  // 'charger'   bills only one specific charger to one user.
  billing_mode?: BillingMode;
  // What to put on the invoice — meters only, chargers only, or both.
  // Independent of building type; defaults to 'both'.
  bill_content?: BillContent;
  charger_id?: number;
}

// A tenant whose bill was deliberately not created (e.g. a would-be CHF 0.00 invoice).
export interface SkippedBill {
  user_id: number;
  user_name: string;
  building_id: number;
  reason: string;
}

export interface GenerateBillsResult {
  invoices: Invoice[];
  skipped: SkippedBill[];
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

export interface MeterDataHealth {
  id: number;
  name: string;
  building_name: string;
  last_reading: string | null;
  age_minutes: number; // -1 when there is no reading at all
  status: 'fresh' | 'stale' | 'missing';
  anomaly_count: number;
  last_anomaly_value?: number;
  last_anomaly_time?: string | null;
}

export interface DataHealth {
  meters: MeterDataHealth[];
  total_meters: number;
  stale_count: number;
  missing_count: number;
  anomaly_meter_count: number;
  total_anomalies: number;
  window_days: number;
  spike_threshold: number;
  generated_at: string;
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
  has_battery?: boolean;
  battery_charged_kwh?: number;
  battery_discharged_kwh?: number;
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
  has_battery?: boolean;
  battery_charged_kwh?: number;
  battery_discharged_kwh?: number;
}

// Live energy flow - real-time power data (kW instead of kWh)
export interface EnergyFlowLiveData {
  period: string;
  solar_power_kw: number;
  consumption_power_kw: number;
  grid_power_kw: number;
  ev_charging_power_kw: number;
  self_consumption_pct: number;
  is_exporting: boolean;
  timestamp: string;
  has_battery?: boolean;
  battery_charge_power_kw?: number;
  battery_discharge_power_kw?: number;
  battery_soc_pct?: number;
  per_building?: BuildingEnergyFlowLive[];
}

// Per-meter live reading used by the virtual-meter config UI.
export interface MeterLiveReading {
  meter_id: number;
  meter_name: string;
  meter_type: string;
  building_id: number;
  connection_type: string;
  current_power_w: number;
  current_power_exp_w: number;
  has_live_power: boolean;
  total_import_kwh: number;
  total_export_kwh: number;
  is_online: boolean;
  last_update: string;
  // Signed power: + = consumption/import, − = production/feed-in (battery
  // normalised so charging is + and discharging −).
  signed_power_w: number;
}

export interface BuildingEnergyFlowLive {
  building_id: number;
  building_name: string;
  solar_power_kw: number;
  consumption_power_kw: number;
  grid_power_kw: number;
  ev_charging_power_kw: number;
  has_battery?: boolean;
  battery_charge_power_kw?: number;
  battery_discharge_power_kw?: number;
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

export interface EmailAlertSettings {
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_password: string;
  smtp_from: string;
  alert_recipient: string;
  is_enabled: boolean;
  rate_limit_minutes: number;
  last_alert_sent?: string;
  health_report_enabled: boolean;
  health_report_frequency: string;
  health_report_day: number;
  health_report_hour: number;
  last_health_report_sent?: string;
  invoice_email_subject?: string;
  invoice_email_body?: string;
}