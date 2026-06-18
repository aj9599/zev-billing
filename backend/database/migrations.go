package database

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"

	"golang.org/x/crypto/bcrypt"
)

func RunMigrations(db *sql.DB) error {
	migrations := []string{
		`CREATE TABLE IF NOT EXISTS admin_users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			username TEXT UNIQUE NOT NULL,
			password_hash TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,

		`CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			first_name TEXT NOT NULL,
			last_name TEXT NOT NULL,
			email TEXT NOT NULL,
			phone TEXT,
			address_street TEXT,
			address_city TEXT,
			address_zip TEXT,
			address_country TEXT DEFAULT 'Switzerland',
			bank_name TEXT,
			bank_iban TEXT,
			bank_account_holder TEXT,
			charger_ids TEXT,
			notes TEXT,
			building_id INTEGER,
			apartment_unit TEXT,
			user_type TEXT DEFAULT 'regular',
			managed_buildings TEXT,
			language TEXT DEFAULT 'de',
			is_active INTEGER DEFAULT 1,
			rent_start_date DATE,
			rent_end_date DATE,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (building_id) REFERENCES buildings(id)
		)`,

		`CREATE TABLE IF NOT EXISTS buildings (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			address_street TEXT,
			address_city TEXT,
			address_zip TEXT,
			address_country TEXT DEFAULT 'Switzerland',
			notes TEXT,
			is_group INTEGER DEFAULT 0,
			group_buildings TEXT,
			has_apartments INTEGER DEFAULT 0,
			floors_config TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,

		`CREATE TABLE IF NOT EXISTS building_groups (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			group_id INTEGER NOT NULL,
			building_id INTEGER NOT NULL,
			FOREIGN KEY (group_id) REFERENCES buildings(id),
			FOREIGN KEY (building_id) REFERENCES buildings(id)
		)`,

		`CREATE TABLE IF NOT EXISTS meters (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			meter_type TEXT NOT NULL,
			building_id INTEGER NOT NULL,
			user_id INTEGER,
			apartment_unit TEXT,
			connection_type TEXT NOT NULL,
			connection_config TEXT NOT NULL,
			device_type TEXT DEFAULT 'generic',
			notes TEXT,
			last_reading REAL DEFAULT 0,
			last_reading_export REAL DEFAULT 0,
			last_reading_time DATETIME,
			is_active INTEGER DEFAULT 1,
			is_shared INTEGER DEFAULT 0,
			is_archived INTEGER DEFAULT 0,
			replaced_by_meter_id INTEGER,
			replaces_meter_id INTEGER,
			replacement_date DATETIME,
			replacement_notes TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (building_id) REFERENCES buildings(id),
			FOREIGN KEY (user_id) REFERENCES users(id),
			FOREIGN KEY (replaced_by_meter_id) REFERENCES meters(id),
			FOREIGN KEY (replaces_meter_id) REFERENCES meters(id)
		)`,

		`CREATE TABLE IF NOT EXISTS chargers (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			brand TEXT NOT NULL,
			preset TEXT NOT NULL,
			building_id INTEGER NOT NULL,
			connection_type TEXT NOT NULL,
			connection_config TEXT NOT NULL,
			supports_priority INTEGER DEFAULT 0,
			billing_method TEXT NOT NULL DEFAULT 'mode_based',
			notes TEXT,
			is_active INTEGER DEFAULT 1,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (building_id) REFERENCES buildings(id)
		)`,

		// Singleton row holding the install date (trial start) and the activated
		// license key. Drives free-tier limits / trial / pro gating.
		`CREATE TABLE IF NOT EXISTS app_license (
			id INTEGER PRIMARY KEY CHECK (id = 1),
			install_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			license_key TEXT NOT NULL DEFAULT '',
			activated_at DATETIME,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,

		`CREATE TABLE IF NOT EXISTS meter_readings (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			meter_id INTEGER NOT NULL,
			reading_time DATETIME NOT NULL,
			power_kwh REAL NOT NULL,
			power_kwh_export REAL DEFAULT 0,
			consumption_kwh REAL DEFAULT 0,
			consumption_export REAL DEFAULT 0,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (meter_id) REFERENCES meters(id)
		)`,

		`CREATE TABLE IF NOT EXISTS charger_sessions (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			charger_id INTEGER NOT NULL,
			user_id TEXT,
			session_time DATETIME NOT NULL,
			power_kwh REAL NOT NULL,
			mode TEXT DEFAULT 'normal',
			state TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (charger_id) REFERENCES chargers(id)
		)`,

		// E3/DC per-session charging history. The integrated wallbox exposes only
		// the current/last session over RSCP (no bulk export), so the collector
		// records each session here as it completes (source='device'); older
		// sessions are reconstructed once from the 15-min charger_sessions rows
		// (source='backfill'). session_key is the device session id (or a synthetic
		// 'bf-<unix>' for backfill); the UNIQUE constraint keeps writes idempotent.
		`CREATE TABLE IF NOT EXISTS e3dc_session_history (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			charger_id INTEGER NOT NULL,
			session_key TEXT NOT NULL,
			start_time DATETIME,
			end_time DATETIME,
			total_kwh REAL DEFAULT 0,
			solar_kwh REAL DEFAULT 0,
			grid_kwh REAL DEFAULT 0,
			rfid TEXT,
			source TEXT DEFAULT 'device',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(charger_id, session_key),
			FOREIGN KEY (charger_id) REFERENCES chargers(id) ON DELETE CASCADE
		)`,

		`CREATE INDEX IF NOT EXISTS idx_e3dc_session_history_charger ON e3dc_session_history(charger_id, start_time DESC)`,

		`CREATE TABLE IF NOT EXISTS charger_stats (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			charger_id INTEGER NOT NULL UNIQUE,
			last_session_energy_kwh REAL DEFAULT 0,
			last_session_duration_sec REAL DEFAULT 0,
			last_session_user_id TEXT,
			last_session_end_time DATETIME,
			weekly_energy_kwh REAL DEFAULT 0,
			monthly_energy_kwh REAL DEFAULT 0,
			last_month_energy_kwh REAL DEFAULT 0,
			yearly_energy_kwh REAL DEFAULT 0,
			last_year_energy_kwh REAL DEFAULT 0,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (charger_id) REFERENCES chargers(id) ON DELETE CASCADE
		)`,

		`CREATE INDEX IF NOT EXISTS idx_charger_stats_charger_id ON charger_stats(charger_id)`,

		// Active charger sessions table - stores sessions in progress (survive restarts)
		`CREATE TABLE IF NOT EXISTS active_charger_sessions (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			charger_id INTEGER NOT NULL,
			session_key TEXT NOT NULL UNIQUE,
			charger_name TEXT NOT NULL,
			start_time DATETIME NOT NULL,
			start_energy_kwh REAL NOT NULL,
			user_id TEXT,
			mode TEXT,
			last_lcl_value TEXT,
			readings_json TEXT,
			readings_count INTEGER DEFAULT 0,
			last_update DATETIME DEFAULT CURRENT_TIMESTAMP,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (charger_id) REFERENCES chargers(id) ON DELETE CASCADE
		)`,

		`CREATE INDEX IF NOT EXISTS idx_active_sessions_charger ON active_charger_sessions(charger_id)`,
		`CREATE INDEX IF NOT EXISTS idx_active_sessions_key ON active_charger_sessions(session_key)`,

		`CREATE TABLE IF NOT EXISTS billing_settings (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			building_id INTEGER NOT NULL,
			normal_power_price REAL NOT NULL DEFAULT 0.25,
			solar_power_price REAL NOT NULL DEFAULT 0.15,
			car_charging_normal_price REAL NOT NULL DEFAULT 0.30,
			car_charging_priority_price REAL NOT NULL DEFAULT 0.40,
			is_complex INTEGER DEFAULT 0,
			vzev_export_price REAL DEFAULT 0.18,
			currency TEXT DEFAULT 'CHF',
			valid_from DATE NOT NULL,
			valid_to DATE,
			is_active INTEGER DEFAULT 1,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (building_id) REFERENCES buildings(id)
		)`,

		// Controllable devices: standalone solar-driven device control (EVCC-style).
		// No coupling to billing — driven only by live grid-meter surplus.
		`CREATE TABLE IF NOT EXISTS controllable_devices (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			building_id INTEGER NOT NULL,
			driver TEXT NOT NULL DEFAULT 'shelly',
			connection_config TEXT NOT NULL DEFAULT '{}',
			control_mode TEXT NOT NULL DEFAULT 'auto',
			manual_override_until DATETIME,
			switch_on_threshold_w REAL NOT NULL DEFAULT 1000,
			switch_off_threshold_w REAL NOT NULL DEFAULT 0,
			min_runtime_seconds INTEGER NOT NULL DEFAULT 0,
			min_offtime_seconds INTEGER NOT NULL DEFAULT 0,
			priority INTEGER NOT NULL DEFAULT 100,
			schedule_json TEXT,
			guarantee_hours REAL NOT NULL DEFAULT 0,
			guarantee_by TEXT,
			last_command TEXT,
			last_command_at DATETIME,
			last_state TEXT,
			last_state_at DATETIME,
			is_active INTEGER DEFAULT 1,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (building_id) REFERENCES buildings(id)
		)`,

		`CREATE TABLE IF NOT EXISTS device_switch_events (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			device_id INTEGER NOT NULL,
			command TEXT NOT NULL,
			reason TEXT,
			surplus_w REAL,
			success INTEGER DEFAULT 1,
			error TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (device_id) REFERENCES controllable_devices(id)
		)`,

		`CREATE TABLE IF NOT EXISTS invoices (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			invoice_number TEXT UNIQUE NOT NULL,
			user_id INTEGER NOT NULL,
			building_id INTEGER NOT NULL,
			period_start DATE NOT NULL,
			period_end DATE NOT NULL,
			total_amount REAL NOT NULL,
			currency TEXT DEFAULT 'CHF',
			status TEXT DEFAULT 'draft',
			is_vzev INTEGER DEFAULT 0,
			pdf_path TEXT,
			generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (user_id) REFERENCES users(id),
			FOREIGN KEY (building_id) REFERENCES buildings(id)
		)`,

		`CREATE TABLE IF NOT EXISTS invoice_items (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			invoice_id INTEGER NOT NULL,
			description TEXT NOT NULL,
			quantity REAL NOT NULL,
			unit_price REAL NOT NULL,
			total_price REAL NOT NULL,
			item_type TEXT NOT NULL,
			FOREIGN KEY (invoice_id) REFERENCES invoices(id)
		)`,

		`CREATE TABLE IF NOT EXISTS auto_billing_configs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			building_ids TEXT NOT NULL,
			user_ids TEXT,
			apartments_json TEXT,
			custom_item_ids TEXT DEFAULT '',
			frequency TEXT NOT NULL,
			generation_day INTEGER NOT NULL,
			first_execution_date DATE,
			is_active INTEGER DEFAULT 1,
			is_vzev INTEGER DEFAULT 0,
			billing_mode TEXT DEFAULT 'apartments',
			charger_id INTEGER,
			auto_send_email INTEGER DEFAULT 0,
			last_run DATETIME,
			next_run DATETIME,
			sender_name TEXT,
			sender_address TEXT,
			sender_city TEXT,
			sender_zip TEXT,
			sender_country TEXT DEFAULT 'Switzerland',
			bank_name TEXT,
			bank_iban TEXT,
			bank_account_holder TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,

		`CREATE TABLE IF NOT EXISTS bill_layouts (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			building_id INTEGER NOT NULL UNIQUE,
			title TEXT DEFAULT '',
			intro_text TEXT DEFAULT '',
			footer_text TEXT DEFAULT '',
			primary_color TEXT DEFAULT '#667EEA',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE
		)`,

		`CREATE TABLE IF NOT EXISTS admin_logs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			action TEXT NOT NULL,
			details TEXT,
			user_id INTEGER,
			ip_address TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,

		`CREATE TABLE IF NOT EXISTS meter_replacements (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			old_meter_id INTEGER NOT NULL,
			new_meter_id INTEGER NOT NULL,
			replacement_date DATETIME NOT NULL,
			old_meter_final_reading REAL NOT NULL,
			new_meter_initial_reading REAL NOT NULL,
			reading_offset REAL NOT NULL,
			notes TEXT,
			performed_by TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (old_meter_id) REFERENCES meters(id),
			FOREIGN KEY (new_meter_id) REFERENCES meters(id)
		)`,

		`CREATE TABLE IF NOT EXISTS shared_meter_configs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			meter_id INTEGER NOT NULL,
			building_id INTEGER NOT NULL,
			meter_name TEXT NOT NULL,
			split_type TEXT NOT NULL CHECK(split_type IN ('equal', 'by_area', 'by_units', 'custom')),
			unit_price REAL NOT NULL CHECK(unit_price >= 0),
			pricing_mode TEXT NOT NULL DEFAULT 'single' CHECK(pricing_mode IN ('single', 'solar_grid_custom', 'solar_grid_pricing')),
			solar_price REAL NOT NULL DEFAULT 0 CHECK(solar_price >= 0),
			grid_price REAL NOT NULL DEFAULT 0 CHECK(grid_price >= 0),
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (meter_id) REFERENCES meters(id) ON DELETE CASCADE,
			FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE
		)`,

		`CREATE TABLE IF NOT EXISTS custom_line_items (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			building_id INTEGER NOT NULL,
			description TEXT NOT NULL,
			amount REAL NOT NULL CHECK(amount >= 0),
			frequency TEXT NOT NULL CHECK(frequency IN ('once', 'monthly', 'quarterly', 'yearly')),
			category TEXT NOT NULL CHECK(category IN ('meter_rent', 'maintenance', 'service', 'other')),
			is_active INTEGER DEFAULT 1 CHECK(is_active IN (0, 1)),
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE
		)`,

		`CREATE TABLE IF NOT EXISTS shared_meter_custom_splits (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			config_id INTEGER NOT NULL,
			user_id INTEGER NOT NULL,
			percentage REAL NOT NULL CHECK(percentage > 0 AND percentage <= 100),
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (config_id) REFERENCES shared_meter_configs(id) ON DELETE CASCADE,
			FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
			UNIQUE(config_id, user_id)
		)`,

		`CREATE TABLE IF NOT EXISTS health_history (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			timestamp INTEGER NOT NULL,
			cpu_usage REAL NOT NULL DEFAULT 0,
			memory_percent REAL NOT NULL DEFAULT 0,
			disk_percent REAL NOT NULL DEFAULT 0,
			temperature REAL NOT NULL DEFAULT 0
		)`,

		`CREATE TABLE IF NOT EXISTS email_alert_settings (
			id INTEGER PRIMARY KEY CHECK (id = 1),
			smtp_host TEXT NOT NULL DEFAULT '',
			smtp_port INTEGER NOT NULL DEFAULT 587,
			smtp_user TEXT NOT NULL DEFAULT '',
			smtp_password TEXT NOT NULL DEFAULT '',
			smtp_from TEXT NOT NULL DEFAULT '',
			alert_recipient TEXT NOT NULL DEFAULT '',
			is_enabled INTEGER NOT NULL DEFAULT 0,
			rate_limit_minutes INTEGER NOT NULL DEFAULT 60,
			last_alert_sent DATETIME,
			health_report_enabled INTEGER NOT NULL DEFAULT 0,
			health_report_frequency TEXT NOT NULL DEFAULT 'weekly',
			health_report_day INTEGER NOT NULL DEFAULT 1,
			health_report_hour INTEGER NOT NULL DEFAULT 8,
			last_health_report_sent DATETIME,
			invoice_email_subject TEXT NOT NULL DEFAULT '',
			invoice_email_body TEXT NOT NULL DEFAULT '',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
	}

	for _, migration := range migrations {
		if _, err := db.Exec(migration); err != nil {
			return fmt.Errorf("migration failed: %v", err)
		}
	}

	// Create indexes
	indexes := []string{
		`CREATE INDEX IF NOT EXISTS idx_meter_readings_meter_time ON meter_readings(meter_id, reading_time)`,
		`CREATE INDEX IF NOT EXISTS idx_charger_sessions_charger_time ON charger_sessions(charger_id, session_time)`,
		`CREATE INDEX IF NOT EXISTS idx_users_building ON users(building_id)`,
		`CREATE INDEX IF NOT EXISTS idx_meters_building ON meters(building_id)`,
		`CREATE INDEX IF NOT EXISTS idx_invoices_user ON invoices(user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_invoices_building ON invoices(building_id)`,
		`CREATE INDEX IF NOT EXISTS idx_health_history_timestamp ON health_history(timestamp)`,
	}

	for _, index := range indexes {
		if _, err := db.Exec(index); err != nil {
			log.Printf("Index creation warning: %v", err)
		}
	}

	// Add additional columns that might be missing from older versions
	if err := addGroupBuildingsColumn(db); err != nil {
		return err
	}

	if err := addDeviceTypeColumn(db); err != nil {
		return err
	}

	if err := addExportColumns(db); err != nil {
		return err
	}

	if err := addMidCertifiedColumn(db); err != nil {
		return err
	}

	if err := addVZEVColumns(db); err != nil {
		return err
	}

	if err := addVATColumns(db); err != nil {
		return err
	}

	if err := addSortOrderColumns(db); err != nil {
		return err
	}

	if err := addDeviceControlColumns(db); err != nil {
		return err
	}

	if err := addAutoBillingApartmentsColumn(db); err != nil {
		return err
	}

	// NEW: Add custom_item_ids column for custom item selection in auto billing
	if err := addCustomItemIdsColumn(db); err != nil {
		return err
	}

	// Add billing_mode + charger_id columns so auto-billing can target a whole
	// building or a single charger (matching the manual bill-config flow).
	if err := addAutoBillingScopeColumns(db); err != nil {
		return err
	}

	// Deduplicate charger_sessions and enforce one row per (charger, session_time).
	// Without this, OCMF writes and live snapshots produce overlapping rows that
	// show up as duplicates in the CSV export.
	if err := dedupeAndIndexChargerSessions(db); err != nil {
		return err
	}

	if err := migrateZaptecConfigs(db); err != nil {
		return err
	}

	if err := createTriggers(db); err != nil {
		return err
	}

	if err := ensureEmailAlertSettingsRow(db); err != nil {
		return err
	}

	// Add editable invoice e-mail subject/body columns so the auto-billing
	// e-mail text can be customised from the Email Settings UI.
	if err := addInvoiceEmailTemplateColumns(db); err != nil {
		return err
	}

	// Add per-charger billing_method so chargers without a real charge mode
	// (e.g. Zaptec cloud) can be billed with a proportional solar split instead
	// of dumping all energy into the flat "solar mode" car-charging price.
	if err := addChargerBillingMethodColumn(db); err != nil {
		return err
	}

	// Seed the singleton license row so the trial clock starts on first run.
	if err := ensureAppLicenseRow(db); err != nil {
		return err
	}

	// Phase 2 online activation: per-device binding columns.
	if err := addAppLicenseActivationColumns(db); err != nil {
		return err
	}

	// Tenant self-service portal: per-user access token (admin-issued link/code).
	if err := addPortalTokenColumn(db); err != nil {
		return err
	}

	return createDefaultAdmin(db)
}

// addPortalTokenColumn adds users.portal_token, the secret an admin issues so a
// tenant can log into the read-only self-service portal. A partial unique index
// keeps tokens unique while allowing many users to have none (NULL).
func addPortalTokenColumn(db *sql.DB) error {
	var usersSQL string
	err := db.QueryRow(`SELECT sql FROM sqlite_master WHERE type='table' AND name='users'`).Scan(&usersSQL)
	if err == sql.ErrNoRows {
		return nil
	}
	if err != nil {
		return err
	}
	if !contains(usersSQL, "portal_token") {
		if _, err := db.Exec(`ALTER TABLE users ADD COLUMN portal_token TEXT`); err != nil {
			if !contains(err.Error(), "duplicate column") {
				return fmt.Errorf("failed to add portal_token column: %v", err)
			}
		}
		log.Println("✓ users.portal_token column added")
	}
	if _, err := db.Exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_portal_token ON users(portal_token) WHERE portal_token IS NOT NULL`); err != nil {
		log.Printf("portal_token index warning: %v", err)
	}
	return nil
}

// addAppLicenseActivationColumns adds the columns used by online (Firebase)
// activation: a stable device id, the signed activation receipt, and the last
// time the receipt was refreshed against the activation server.
func addAppLicenseActivationColumns(db *sql.DB) error {
	var tableSQL string
	if err := db.QueryRow(`SELECT sql FROM sqlite_master WHERE type='table' AND name='app_license'`).Scan(&tableSQL); err != nil {
		if err == sql.ErrNoRows {
			return nil
		}
		return err
	}
	cols := []struct{ name, def string }{
		{"device_id", "TEXT NOT NULL DEFAULT ''"},
		{"activation_receipt", "TEXT NOT NULL DEFAULT ''"},
		{"last_validated", "DATETIME"},
	}
	for _, c := range cols {
		if contains(tableSQL, c.name) {
			continue
		}
		if _, err := db.Exec(fmt.Sprintf("ALTER TABLE app_license ADD COLUMN %s %s", c.name, c.def)); err != nil {
			if !contains(err.Error(), "duplicate column") {
				return fmt.Errorf("failed to add app_license.%s: %v", c.name, err)
			}
		} else {
			log.Printf("✓ app_license.%s column added", c.name)
		}
	}
	return nil
}

// ensureAppLicenseRow creates the singleton app_license row (id=1) on first run.
// install_date defaults to now, which starts the free trial.
func ensureAppLicenseRow(db *sql.DB) error {
	var count int
	if err := db.QueryRow("SELECT COUNT(*) FROM app_license").Scan(&count); err != nil {
		return err
	}
	if count == 0 {
		if _, err := db.Exec(`INSERT INTO app_license (id) VALUES (1)`); err != nil {
			return fmt.Errorf("failed to seed app_license: %v", err)
		}
		log.Println("app_license default row created (trial started)")
	}
	return nil
}

// addChargerBillingMethodColumn adds chargers.billing_method.
//   - "mode_based"  (default): bill by session charge mode (normal vs priority).
//   - "solar_split": treat the charger like a meter — its consumption joins the
//     building consumption pool and receives a proportional share of solar.
//
// Existing Zaptec API chargers are backfilled to "solar_split" since they never
// report a usable charge mode.
func addChargerBillingMethodColumn(db *sql.DB) error {
	var chargersSql string
	err := db.QueryRow(`SELECT sql FROM sqlite_master WHERE type='table' AND name='chargers'`).Scan(&chargersSql)
	if err != nil {
		// Table not created yet (fresh DB handled by CREATE TABLE above) — nothing to do.
		if err == sql.ErrNoRows {
			return nil
		}
		return err
	}

	if !contains(chargersSql, "billing_method") {
		log.Println("Adding billing_method column to chargers table...")
		if _, err := db.Exec(`ALTER TABLE chargers ADD COLUMN billing_method TEXT NOT NULL DEFAULT 'mode_based'`); err != nil {
			if contains(err.Error(), "duplicate column") {
				log.Println("✓ billing_method column already exists")
			} else {
				return fmt.Errorf("failed to add billing_method column: %v", err)
			}
		} else {
			log.Println("✓ billing_method column added successfully")
		}

		// Backfill: Zaptec cloud chargers have no charge mode, so the only sensible
		// existing behaviour is the new proportional solar split.
		if res, err := db.Exec(`UPDATE chargers SET billing_method = 'solar_split' WHERE connection_type = 'zaptec_api'`); err != nil {
			return fmt.Errorf("failed to backfill billing_method for Zaptec chargers: %v", err)
		} else if n, _ := res.RowsAffected(); n > 0 {
			log.Printf("✓ Backfilled %d Zaptec charger(s) to billing_method='solar_split'", n)
		}
	} else {
		log.Println("✓ billing_method column already exists")
	}

	return nil
}

// NEW: Add group_buildings column to buildings table
func addGroupBuildingsColumn(db *sql.DB) error {
	var buildingsSql string
	err := db.QueryRow(`
		SELECT sql FROM sqlite_master 
		WHERE type='table' AND name='buildings'
	`).Scan(&buildingsSql)

	if err != nil {
		return err
	}

	if !contains(buildingsSql, "group_buildings") {
		log.Println("Adding group_buildings column to buildings table...")
		_, err := db.Exec(`ALTER TABLE buildings ADD COLUMN group_buildings TEXT`)
		if err != nil {
			if contains(err.Error(), "duplicate column") {
				log.Println("✓ group_buildings column already exists")
			} else {
				return fmt.Errorf("failed to add group_buildings column: %v", err)
			}
		} else {
			log.Println("✓ group_buildings column added successfully")
		}
	} else {
		log.Println("✓ group_buildings column already exists")
	}

	return nil
}

// Add apartments_json and is_vzev columns to auto_billing_configs
func addAutoBillingApartmentsColumn(db *sql.DB) error {
	// Check auto_billing_configs table
	var autoBillingConfigsSql string
	err := db.QueryRow(`
		SELECT sql FROM sqlite_master 
		WHERE type='table' AND name='auto_billing_configs'
	`).Scan(&autoBillingConfigsSql)

	if err != nil {
		return err
	}

	// Add apartments_json column
	if !contains(autoBillingConfigsSql, "apartments_json") {
		log.Println("Adding apartments_json column to auto_billing_configs table...")
		_, err := db.Exec(`ALTER TABLE auto_billing_configs ADD COLUMN apartments_json TEXT`)
		if err != nil {
			if contains(err.Error(), "duplicate column") {
				log.Println("✓ apartments_json column already exists")
			} else {
				return fmt.Errorf("failed to add apartments_json column: %v", err)
			}
		} else {
			log.Println("✓ apartments_json column added successfully")
		}
	} else {
		log.Println("✓ apartments_json column already exists")
	}

	// Add is_vzev column
	if !contains(autoBillingConfigsSql, "is_vzev") {
		log.Println("Adding is_vzev column to auto_billing_configs table...")
		_, err := db.Exec(`ALTER TABLE auto_billing_configs ADD COLUMN is_vzev INTEGER DEFAULT 0`)
		if err != nil {
			if contains(err.Error(), "duplicate column") {
				log.Println("✓ is_vzev column already exists")
			} else {
				return fmt.Errorf("failed to add is_vzev column: %v", err)
			}
		} else {
			log.Println("✓ is_vzev column added successfully")
		}
	} else {
		log.Println("✓ is_vzev column already exists")
	}

	return nil
}

// NEW: Add custom_item_ids column to auto_billing_configs for custom item selection
func addCustomItemIdsColumn(db *sql.DB) error {
	// Check auto_billing_configs table
	var autoBillingConfigsSql string
	err := db.QueryRow(`
		SELECT sql FROM sqlite_master 
		WHERE type='table' AND name='auto_billing_configs'
	`).Scan(&autoBillingConfigsSql)

	if err != nil {
		return err
	}

	// Add custom_item_ids column
	if !contains(autoBillingConfigsSql, "custom_item_ids") {
		log.Println("Adding custom_item_ids column to auto_billing_configs table...")
		_, err := db.Exec(`ALTER TABLE auto_billing_configs ADD COLUMN custom_item_ids TEXT DEFAULT ''`)
		if err != nil {
			if contains(err.Error(), "duplicate column") {
				log.Println("✓ custom_item_ids column already exists")
			} else {
				return fmt.Errorf("failed to add custom_item_ids column: %v", err)
			}
		} else {
			log.Println("✓ custom_item_ids column added successfully")
		}
	} else {
		log.Println("✓ custom_item_ids column already exists")
	}

	return nil
}

// dedupeAndIndexChargerSessions removes duplicate rows that share the same
// (charger_id, session_time) and then creates a UNIQUE INDEX so future
// "INSERT OR IGNORE" / "INSERT OR REPLACE" statements actually deduplicate.
// Live 15-min snapshots and post-session OCMF writes used to coexist as
// near-duplicate rows because the table had no constraint.
func dedupeAndIndexChargerSessions(db *sql.DB) error {
	// Skip cleanly if the unique index already exists.
	var existingIndex string
	err := db.QueryRow(`
		SELECT name FROM sqlite_master
		WHERE type='index' AND name='idx_charger_sessions_charger_time_unique'
	`).Scan(&existingIndex)
	if err == nil && existingIndex != "" {
		return nil
	}

	log.Println("Deduplicating charger_sessions rows…")
	res, err := db.Exec(`
		DELETE FROM charger_sessions
		WHERE id NOT IN (
			SELECT MAX(id) FROM charger_sessions
			GROUP BY charger_id, session_time
		)
	`)
	if err != nil {
		return fmt.Errorf("failed to dedupe charger_sessions: %v", err)
	}
	if removed, _ := res.RowsAffected(); removed > 0 {
		log.Printf("✓ Removed %d duplicate charger_sessions rows", removed)
	}

	if _, err := db.Exec(`
		CREATE UNIQUE INDEX IF NOT EXISTS idx_charger_sessions_charger_time_unique
		ON charger_sessions(charger_id, session_time)
	`); err != nil {
		return fmt.Errorf("failed to create unique index on charger_sessions: %v", err)
	}
	log.Println("✓ Unique index on charger_sessions(charger_id, session_time) ready")
	return nil
}

// addAutoBillingScopeColumns adds billing_mode and charger_id columns to auto_billing_configs.
func addAutoBillingScopeColumns(db *sql.DB) error {
	var autoBillingConfigsSql string
	err := db.QueryRow(`
		SELECT sql FROM sqlite_master
		WHERE type='table' AND name='auto_billing_configs'
	`).Scan(&autoBillingConfigsSql)

	if err != nil {
		return err
	}

	if !contains(autoBillingConfigsSql, "billing_mode") {
		log.Println("Adding billing_mode column to auto_billing_configs table...")
		if _, err := db.Exec(`ALTER TABLE auto_billing_configs ADD COLUMN billing_mode TEXT DEFAULT 'apartments'`); err != nil {
			if !contains(err.Error(), "duplicate column") {
				return fmt.Errorf("failed to add billing_mode column: %v", err)
			}
		}
		log.Println("✓ billing_mode column added successfully")
	} else {
		log.Println("✓ billing_mode column already exists")
	}

	if !contains(autoBillingConfigsSql, "charger_id") {
		log.Println("Adding charger_id column to auto_billing_configs table...")
		if _, err := db.Exec(`ALTER TABLE auto_billing_configs ADD COLUMN charger_id INTEGER`); err != nil {
			if !contains(err.Error(), "duplicate column") {
				return fmt.Errorf("failed to add charger_id column: %v", err)
			}
		}
		log.Println("✓ charger_id column added successfully")
	} else {
		log.Println("✓ charger_id column already exists")
	}

	if !contains(autoBillingConfigsSql, "auto_send_email") {
		log.Println("Adding auto_send_email column to auto_billing_configs table...")
		if _, err := db.Exec(`ALTER TABLE auto_billing_configs ADD COLUMN auto_send_email INTEGER DEFAULT 0`); err != nil {
			if !contains(err.Error(), "duplicate column") {
				return fmt.Errorf("failed to add auto_send_email column: %v", err)
			}
		}
		log.Println("✓ auto_send_email column added successfully")
	} else {
		log.Println("✓ auto_send_email column already exists")
	}

	return nil
}

// addDeviceTypeColumn adds device_type column to meters table
func addDeviceTypeColumn(db *sql.DB) error {
	// Check if device_type column exists in meters table
	var metersSql string
	err := db.QueryRow(`
		SELECT sql FROM sqlite_master 
		WHERE type='table' AND name='meters'
	`).Scan(&metersSql)

	if err != nil {
		return err
	}

	// Add device_type if it doesn't exist
	if !contains(metersSql, "device_type") {
		log.Println("Adding device_type column to meters table...")
		_, err := db.Exec(`ALTER TABLE meters ADD COLUMN device_type TEXT DEFAULT 'generic'`)
		if err != nil {
			if contains(err.Error(), "duplicate column") {
				log.Println("✓ device_type column already exists")
				return nil
			}
			return fmt.Errorf("failed to add device_type column: %v", err)
		}
		log.Println("✓ device_type column added successfully")

		// Update existing MQTT meters to generic type
		_, err = db.Exec(`UPDATE meters SET device_type = 'generic' WHERE connection_type = 'mqtt' AND (device_type IS NULL OR device_type = '')`)
		if err != nil {
			log.Printf("Warning: Failed to update existing meters: %v", err)
		}
	} else {
		log.Println("✓ device_type column already exists")
	}

	return nil
}

// addMidCertifiedColumn adds the is_mid_certified flag to the meters table.
// Defaults to 1 (true) so all pre-existing meters remain billing-valid and keep
// rendering as "billing" (green) — only newly flagged meters become non-MID.
func addMidCertifiedColumn(db *sql.DB) error {
	var metersSql string
	err := db.QueryRow(`
		SELECT sql FROM sqlite_master
		WHERE type='table' AND name='meters'
	`).Scan(&metersSql)
	if err != nil {
		return err
	}

	if contains(metersSql, "is_mid_certified") {
		log.Println("✓ is_mid_certified column already exists")
		return nil
	}

	log.Println("Adding is_mid_certified column to meters table...")
	if _, err := db.Exec(`ALTER TABLE meters ADD COLUMN is_mid_certified INTEGER DEFAULT 1`); err != nil {
		if contains(err.Error(), "duplicate column") {
			log.Println("✓ is_mid_certified column already exists")
			return nil
		}
		return fmt.Errorf("failed to add is_mid_certified column: %v", err)
	}
	log.Println("✓ is_mid_certified column added successfully")
	return nil
}

// Add export energy columns
func addExportColumns(db *sql.DB) error {
	// Check meters table
	var metersSql string
	err := db.QueryRow(`
		SELECT sql FROM sqlite_master 
		WHERE type='table' AND name='meters'
	`).Scan(&metersSql)

	if err != nil {
		return err
	}

	// Add last_reading_export to meters table
	if !contains(metersSql, "last_reading_export") {
		log.Println("Adding last_reading_export column to meters table...")
		_, err := db.Exec(`ALTER TABLE meters ADD COLUMN last_reading_export REAL DEFAULT 0`)
		if err != nil {
			if contains(err.Error(), "duplicate column") {
				log.Println("✓ last_reading_export column already exists")
			} else {
				return fmt.Errorf("failed to add last_reading_export column: %v", err)
			}
		} else {
			log.Println("✓ last_reading_export column added successfully")
		}
	} else {
		log.Println("✓ last_reading_export column already exists")
	}

	// Check meter_readings table
	var readingsSql string
	err = db.QueryRow(`
		SELECT sql FROM sqlite_master 
		WHERE type='table' AND name='meter_readings'
	`).Scan(&readingsSql)

	if err != nil {
		return err
	}

	// Add power_kwh_export to meter_readings table
	if !contains(readingsSql, "power_kwh_export") {
		log.Println("Adding power_kwh_export column to meter_readings table...")
		_, err := db.Exec(`ALTER TABLE meter_readings ADD COLUMN power_kwh_export REAL DEFAULT 0`)
		if err != nil {
			if contains(err.Error(), "duplicate column") {
				log.Println("✓ power_kwh_export column already exists")
			} else {
				return fmt.Errorf("failed to add power_kwh_export column: %v", err)
			}
		} else {
			log.Println("✓ power_kwh_export column added successfully")
		}
	} else {
		log.Println("✓ power_kwh_export column already exists")
	}

	// Add consumption_export to meter_readings table
	if !contains(readingsSql, "consumption_export") {
		log.Println("Adding consumption_export column to meter_readings table...")
		_, err := db.Exec(`ALTER TABLE meter_readings ADD COLUMN consumption_export REAL DEFAULT 0`)
		if err != nil {
			if contains(err.Error(), "duplicate column") {
				log.Println("✓ consumption_export column already exists")
			} else {
				return fmt.Errorf("failed to add consumption_export column: %v", err)
			}
		} else {
			log.Println("✓ consumption_export column added successfully")
		}
	} else {
		log.Println("✓ consumption_export column already exists")
	}

	// Split-meter (shared meter) pricing modes: let a shared meter be billed by a
	// flat price (single), a solar/grid split with its own prices (solar_grid_custom),
	// or a solar/grid split using the building's pricing config (solar_grid_pricing).
	var sharedConfigsSql string
	err = db.QueryRow(`
		SELECT COALESCE((SELECT sql FROM sqlite_master WHERE type='table' AND name='shared_meter_configs'), '')
	`).Scan(&sharedConfigsSql)
	if err != nil {
		return err
	}
	if sharedConfigsSql != "" {
		sharedMeterColumns := []struct{ name, ddl string }{
			{"pricing_mode", "ALTER TABLE shared_meter_configs ADD COLUMN pricing_mode TEXT NOT NULL DEFAULT 'single'"},
			{"solar_price", "ALTER TABLE shared_meter_configs ADD COLUMN solar_price REAL NOT NULL DEFAULT 0"},
			{"grid_price", "ALTER TABLE shared_meter_configs ADD COLUMN grid_price REAL NOT NULL DEFAULT 0"},
		}
		for _, col := range sharedMeterColumns {
			if contains(sharedConfigsSql, col.name) {
				log.Printf("✓ shared_meter_configs.%s column already exists", col.name)
				continue
			}
			log.Printf("Adding %s column to shared_meter_configs table...", col.name)
			if _, err := db.Exec(col.ddl); err != nil {
				if contains(err.Error(), "duplicate column") {
					log.Printf("✓ shared_meter_configs.%s column already exists", col.name)
				} else {
					return fmt.Errorf("failed to add %s column: %v", col.name, err)
				}
			} else {
				log.Printf("✓ shared_meter_configs.%s column added successfully", col.name)
			}
		}
	}

	// Backfill apartment-meter ↔ tenant links. An apartment meter can be assigned to
	// a tenant two ways: directly via meters.user_id, or implicitly via a matching
	// apartment_unit. The UI shows the implicit link, but billing attributes
	// consumption strictly by meters.user_id — so a meter created (and given an
	// apartment_unit) BEFORE its tenant existed stays user_id = NULL and produces a
	// CHF 0.00 bill even though the meter card shows it as assigned. Heal those rows
	// by pointing user_id at the active tenant occupying the same apartment.
	res, err := db.Exec(`
		UPDATE meters
		SET user_id = (
			SELECT u.id FROM users u
			WHERE u.building_id = meters.building_id
			  AND u.apartment_unit = meters.apartment_unit
			  AND u.is_active = 1
			ORDER BY u.id LIMIT 1
		)
		WHERE meter_type = 'apartment_meter'
		  AND user_id IS NULL
		  AND apartment_unit IS NOT NULL
		  AND apartment_unit != ''
		  AND EXISTS (
			SELECT 1 FROM users u2
			WHERE u2.building_id = meters.building_id
			  AND u2.apartment_unit = meters.apartment_unit
			  AND u2.is_active = 1
		  )
	`)
	if err != nil {
		return fmt.Errorf("failed to backfill apartment meter user links: %v", err)
	}
	if n, _ := res.RowsAffected(); n > 0 {
		log.Printf("✓ Linked %d apartment meter(s) to their tenant by apartment unit", n)
	}

	return nil
}

func createTriggers(db *sql.DB) error {
	triggers := []string{
		`CREATE TRIGGER IF NOT EXISTS update_shared_meters_timestamp 
		AFTER UPDATE ON shared_meter_configs
		FOR EACH ROW
		BEGIN
			UPDATE shared_meter_configs 
			SET updated_at = CURRENT_TIMESTAMP 
			WHERE id = NEW.id;
		END`,

		`CREATE TRIGGER IF NOT EXISTS update_custom_items_timestamp 
		AFTER UPDATE ON custom_line_items
		FOR EACH ROW
		BEGIN
			UPDATE custom_line_items 
			SET updated_at = CURRENT_TIMESTAMP 
			WHERE id = NEW.id;
		END`,

		`CREATE TRIGGER IF NOT EXISTS update_custom_splits_timestamp 
		AFTER UPDATE ON shared_meter_custom_splits
		FOR EACH ROW
		BEGIN
			UPDATE shared_meter_custom_splits 
			SET updated_at = CURRENT_TIMESTAMP 
			WHERE id = NEW.id;
		END`,
	}

	for _, trigger := range triggers {
		if _, err := db.Exec(trigger); err != nil {
			// Triggers may already exist, don't fail
			if !contains(err.Error(), "already exists") {
				log.Printf("Note: Trigger warning: %v", err)
			}
		}
	}

	return nil
}

// Helper function to check if string contains substring
func contains(s, substr string) bool {
	return len(s) >= len(substr) && containsHelper(s, substr)
}

func containsHelper(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

// addInvoiceEmailTemplateColumns adds the invoice_email_subject and
// invoice_email_body columns to email_alert_settings on databases created
// before the editable-template feature existed.
func addInvoiceEmailTemplateColumns(db *sql.DB) error {
	var settingsSql string
	err := db.QueryRow(`
		SELECT sql FROM sqlite_master
		WHERE type='table' AND name='email_alert_settings'
	`).Scan(&settingsSql)
	if err != nil {
		return err
	}

	if !contains(settingsSql, "invoice_email_subject") {
		log.Println("Adding invoice_email_subject column to email_alert_settings table...")
		if _, err := db.Exec(`ALTER TABLE email_alert_settings ADD COLUMN invoice_email_subject TEXT NOT NULL DEFAULT ''`); err != nil {
			if !contains(err.Error(), "duplicate column") {
				return fmt.Errorf("failed to add invoice_email_subject column: %v", err)
			}
		}
	}

	if !contains(settingsSql, "invoice_email_body") {
		log.Println("Adding invoice_email_body column to email_alert_settings table...")
		if _, err := db.Exec(`ALTER TABLE email_alert_settings ADD COLUMN invoice_email_body TEXT NOT NULL DEFAULT ''`); err != nil {
			if !contains(err.Error(), "duplicate column") {
				return fmt.Errorf("failed to add invoice_email_body column: %v", err)
			}
		}
	}

	return nil
}

func ensureEmailAlertSettingsRow(db *sql.DB) error {
	var count int
	err := db.QueryRow("SELECT COUNT(*) FROM email_alert_settings").Scan(&count)
	if err != nil {
		return err
	}
	if count == 0 {
		_, err = db.Exec(`INSERT INTO email_alert_settings (id) VALUES (1)`)
		if err != nil {
			return fmt.Errorf("failed to seed email_alert_settings: %v", err)
		}
		log.Println("email_alert_settings default row created")
	}
	return nil
}

func createDefaultAdmin(db *sql.DB) error {
	var count int
	err := db.QueryRow("SELECT COUNT(*) FROM admin_users").Scan(&count)
	if err != nil {
		return err
	}

	if count == 0 {
		hashedPassword, err := bcrypt.GenerateFromPassword([]byte("admin123"), bcrypt.DefaultCost)
		if err != nil {
			return err
		}

		_, err = db.Exec(`
			INSERT INTO admin_users (username, password_hash)
			VALUES (?, ?)
		`, "admin", string(hashedPassword))

		if err != nil {
			return err
		}

		log.Println("✓ Default admin user created")
		log.Println("   Username: admin")
		log.Println("   Password: admin123")
		log.Println("   ⚠️  IMPORTANT: Change the default password immediately!")
	}

	return nil
}

// addVZEVColumns adds vZEV support columns to billing_settings and invoices tables
func addVZEVColumns(db *sql.DB) error {
	// Check billing_settings table
	var billingSettingsSql string
	err := db.QueryRow(`
		SELECT sql FROM sqlite_master 
		WHERE type='table' AND name='billing_settings'
	`).Scan(&billingSettingsSql)

	if err != nil {
		return err
	}

	// Add is_complex to billing_settings table
	if !contains(billingSettingsSql, "is_complex") {
		log.Println("Adding is_complex column to billing_settings table...")
		_, err := db.Exec(`ALTER TABLE billing_settings ADD COLUMN is_complex INTEGER DEFAULT 0`)
		if err != nil {
			if contains(err.Error(), "duplicate column") {
				log.Println("✓ is_complex column already exists")
			} else {
				return fmt.Errorf("failed to add is_complex column: %v", err)
			}
		} else {
			log.Println("✓ is_complex column added successfully")
		}
	} else {
		log.Println("✓ is_complex column already exists")
	}

	// Add vzev_export_price to billing_settings table
	if !contains(billingSettingsSql, "vzev_export_price") {
		log.Println("Adding vzev_export_price column to billing_settings table...")
		_, err := db.Exec(`ALTER TABLE billing_settings ADD COLUMN vzev_export_price REAL DEFAULT 0.18`)
		if err != nil {
			if contains(err.Error(), "duplicate column") {
				log.Println("✓ vzev_export_price column already exists")
			} else {
				return fmt.Errorf("failed to add vzev_export_price column: %v", err)
			}
		} else {
			log.Println("✓ vzev_export_price column added successfully")
		}
	} else {
		log.Println("✓ vzev_export_price column already exists")
	}

	// Check invoices table
	var invoicesSql string
	err = db.QueryRow(`
		SELECT sql FROM sqlite_master 
		WHERE type='table' AND name='invoices'
	`).Scan(&invoicesSql)

	if err != nil {
		return err
	}

	// Add is_vzev to invoices table
	if !contains(invoicesSql, "is_vzev") {
		log.Println("Adding is_vzev column to invoices table...")
		_, err := db.Exec(`ALTER TABLE invoices ADD COLUMN is_vzev INTEGER DEFAULT 0`)
		if err != nil {
			if contains(err.Error(), "duplicate column") {
				log.Println("✓ is_vzev column already exists")
			} else {
				return fmt.Errorf("failed to add is_vzev column: %v", err)
			}
		} else {
			log.Println("✓ is_vzev column added successfully")
		}
	} else {
		log.Println("✓ is_vzev column already exists")
	}

	return nil
}

// addDeviceControlColumns adds the runtime-guarantee columns to controllable_devices
// for existing databases (the table is created with them for fresh installs).
func addDeviceControlColumns(db *sql.DB) error {
	// controllable_devices may not exist yet on a brand-new DB until the base
	// schema runs — but RunMigrations creates tables first, so it's present here.
	var tableSql string
	if err := db.QueryRow(`SELECT sql FROM sqlite_master WHERE type='table' AND name='controllable_devices'`).Scan(&tableSql); err != nil {
		if err == sql.ErrNoRows {
			return nil
		}
		return err
	}
	add := func(column, def string) error {
		if contains(tableSql, column) {
			return nil
		}
		if _, err := db.Exec(fmt.Sprintf("ALTER TABLE controllable_devices ADD COLUMN %s %s", column, def)); err != nil {
			if contains(err.Error(), "duplicate column") {
				return nil
			}
			return fmt.Errorf("failed to add %s to controllable_devices: %v", column, err)
		}
		log.Printf("✓ %s column added to controllable_devices", column)
		return nil
	}
	if err := add("guarantee_hours", "REAL NOT NULL DEFAULT 0"); err != nil {
		return err
	}
	if err := add("guarantee_by", "TEXT"); err != nil {
		return err
	}
	return nil
}

// addVATColumns adds VAT (MwSt.) support columns to billing_settings and invoices tables.
// billing_settings holds the per-building configuration; invoices store the resolved VAT
// breakdown at generation time so PDFs/views can render it without recomputation.
func addVATColumns(db *sql.DB) error {
	addColumn := func(table, column, definition string) error {
		var tableSql string
		err := db.QueryRow(`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`, table).Scan(&tableSql)
		if err != nil {
			return err
		}
		if contains(tableSql, column) {
			log.Printf("✓ %s column already exists on %s", column, table)
			return nil
		}
		log.Printf("Adding %s column to %s table...", column, table)
		if _, err := db.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s %s", table, column, definition)); err != nil {
			if contains(err.Error(), "duplicate column") {
				log.Printf("✓ %s column already exists on %s", column, table)
				return nil
			}
			return fmt.Errorf("failed to add %s column to %s: %v", column, table, err)
		}
		log.Printf("✓ %s column added to %s", column, table)
		return nil
	}

	// billing_settings: per-building VAT configuration.
	if err := addColumn("billing_settings", "vat_included", "INTEGER DEFAULT 0"); err != nil {
		return err
	}
	if err := addColumn("billing_settings", "vat_rate", "REAL DEFAULT 0"); err != nil {
		return err
	}

	// invoices: resolved VAT breakdown captured at generation time.
	if err := addColumn("invoices", "vat_included", "INTEGER DEFAULT 0"); err != nil {
		return err
	}
	if err := addColumn("invoices", "vat_rate", "REAL DEFAULT 0"); err != nil {
		return err
	}
	if err := addColumn("invoices", "vat_amount", "REAL DEFAULT 0"); err != nil {
		return err
	}
	if err := addColumn("invoices", "net_amount", "REAL DEFAULT 0"); err != nil {
		return err
	}

	return nil
}

// addSortOrderColumns adds a user-controlled display order to meters and chargers
// so the cards can be drag-reordered on their pages. Existing rows are seeded with
// sort_order = id so the current (insertion) order is preserved as the initial
// custom order.
func addSortOrderColumns(db *sql.DB) error {
	for _, table := range []string{"meters", "chargers"} {
		var tableSql string
		if err := db.QueryRow(`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`, table).Scan(&tableSql); err != nil {
			return err
		}
		if contains(tableSql, "sort_order") {
			log.Printf("✓ sort_order column already exists on %s", table)
			continue
		}
		log.Printf("Adding sort_order column to %s table...", table)
		if _, err := db.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0", table)); err != nil {
			if contains(err.Error(), "duplicate column") {
				log.Printf("✓ sort_order column already exists on %s", table)
				continue
			}
			return fmt.Errorf("failed to add sort_order column to %s: %v", table, err)
		}
		// Seed with id so the existing order is preserved as the initial custom order.
		if _, err := db.Exec(fmt.Sprintf("UPDATE %s SET sort_order = id", table)); err != nil {
			log.Printf("Warning: failed to seed sort_order on %s: %v", table, err)
		}
		log.Printf("✓ sort_order column added to %s", table)
	}
	return nil
}

// migrateZaptecConfigs migrates old Zaptec configuration format to new format
func migrateZaptecConfigs(db *sql.DB) error {
	log.Println("Checking for Zaptec chargers that need configuration migration...")

	// Get all Zaptec chargers
	rows, err := db.Query(`
		SELECT id, name, connection_config 
		FROM chargers 
		WHERE connection_type = 'zaptec_api'
	`)
	if err != nil {
		log.Printf("Warning: Failed to query Zaptec chargers for migration: %v", err)
		return nil // Don't fail migrations if we can't query
	}
	defer rows.Close()

	type ChargerConfig struct {
		ID     int
		Name   string
		Config string
	}

	var chargers []ChargerConfig
	for rows.Next() {
		var c ChargerConfig
		if err := rows.Scan(&c.ID, &c.Name, &c.Config); err != nil {
			continue
		}
		chargers = append(chargers, c)
	}

	if len(chargers) == 0 {
		log.Println("✅ No Zaptec chargers found - skipping migration")
		return nil
	}

	log.Printf("Found %d Zaptec charger(s) to check for migration", len(chargers))

	migratedCount := 0
	for _, charger := range chargers {
		// Parse the JSON config
		var config map[string]interface{}
		if err := json.Unmarshal([]byte(charger.Config), &config); err != nil {
			log.Printf("Warning: Failed to parse config for charger '%s' (ID: %d): %v", charger.Name, charger.ID, err)
			continue
		}

		// Check if this config needs migration (has old field names)
		needsMigration := false
		hasOldFormat := false
		hasNewFormat := false

		// Check for old format
		if _, hasOldUsername := config["username"]; hasOldUsername {
			hasOldFormat = true
		}
		if _, hasOldPassword := config["password"]; hasOldPassword {
			hasOldFormat = true
		}
		if _, hasOldChargerId := config["charger_id"]; hasOldChargerId {
			hasOldFormat = true
		}

		// Check for new format
		if _, hasNewUsername := config["zaptec_username"]; hasNewUsername {
			hasNewFormat = true
		}
		if _, hasNewPassword := config["zaptec_password"]; hasNewPassword {
			hasNewFormat = true
		}
		if _, hasNewChargerId := config["zaptec_charger_id"]; hasNewChargerId {
			hasNewFormat = true
		}

		// Only migrate if we have old format and not new format
		needsMigration = hasOldFormat && !hasNewFormat

		// Skip if already migrated
		if !needsMigration {
			continue
		}

		log.Printf("Migrating Zaptec charger: %s (ID: %d)", charger.Name, charger.ID)

		// Create new config with correct field names
		newConfig := make(map[string]interface{})

		// Migrate username
		if username, ok := config["username"].(string); ok {
			newConfig["zaptec_username"] = username
		} else if username, ok := config["zaptec_username"].(string); ok {
			newConfig["zaptec_username"] = username
		}

		// Migrate password
		if password, ok := config["password"].(string); ok {
			newConfig["zaptec_password"] = password
		} else if password, ok := config["zaptec_password"].(string); ok {
			newConfig["zaptec_password"] = password
		}

		// Migrate charger_id
		if chargerId, ok := config["charger_id"].(string); ok {
			newConfig["zaptec_charger_id"] = chargerId
		} else if chargerId, ok := config["zaptec_charger_id"].(string); ok {
			newConfig["zaptec_charger_id"] = chargerId
		}

		// Migrate installation_id
		if installationId, ok := config["installation_id"].(string); ok {
			newConfig["zaptec_installation_id"] = installationId
		} else if installationId, ok := config["zaptec_installation_id"].(string); ok {
			newConfig["zaptec_installation_id"] = installationId
		}

		// Add state mappings (use existing or defaults)
		if stateCableLocked, ok := config["state_cable_locked"].(string); ok {
			newConfig["state_cable_locked"] = stateCableLocked
		} else {
			newConfig["state_cable_locked"] = "65"
		}

		if stateWaitingAuth, ok := config["state_waiting_auth"].(string); ok {
			newConfig["state_waiting_auth"] = stateWaitingAuth
		} else {
			newConfig["state_waiting_auth"] = "66"
		}

		if stateCharging, ok := config["state_charging"].(string); ok {
			newConfig["state_charging"] = stateCharging
		} else {
			newConfig["state_charging"] = "67"
		}

		if stateIdle, ok := config["state_idle"].(string); ok {
			newConfig["state_idle"] = stateIdle
		} else {
			newConfig["state_idle"] = "50"
		}

		// Add mode mappings (use existing or defaults)
		if modeNormal, ok := config["mode_normal"].(string); ok {
			newConfig["mode_normal"] = modeNormal
		} else {
			newConfig["mode_normal"] = "1"
		}

		if modePriority, ok := config["mode_priority"].(string); ok {
			newConfig["mode_priority"] = modePriority
		} else {
			newConfig["mode_priority"] = "2"
		}

		// Check if we have the required fields
		if newConfig["zaptec_username"] == nil || newConfig["zaptec_username"] == "" {
			log.Printf("⚠️  Warning: Charger '%s' (ID: %d) is missing username - you'll need to reconfigure it", charger.Name, charger.ID)
		}
		if newConfig["zaptec_password"] == nil || newConfig["zaptec_password"] == "" {
			log.Printf("⚠️  Warning: Charger '%s' (ID: %d) is missing password - you'll need to reconfigure it", charger.Name, charger.ID)
		}
		if newConfig["zaptec_charger_id"] == nil || newConfig["zaptec_charger_id"] == "" {
			log.Printf("⚠️  Warning: Charger '%s' (ID: %d) is missing charger ID - you'll need to reconfigure it", charger.Name, charger.ID)
		}

		// Marshal new config back to JSON
		newConfigJSON, err := json.Marshal(newConfig)
		if err != nil {
			log.Printf("Warning: Failed to marshal new config for charger '%s' (ID: %d): %v", charger.Name, charger.ID, err)
			continue
		}

		// Update the database
		_, err = db.Exec(`
			UPDATE chargers 
			SET connection_config = ?,
			    updated_at = CURRENT_TIMESTAMP
			WHERE id = ?
		`, string(newConfigJSON), charger.ID)

		if err != nil {
			log.Printf("Warning: Failed to update config for charger '%s' (ID: %d): %v", charger.Name, charger.ID, err)
			continue
		}

		migratedCount++
		log.Printf("✅ Successfully migrated charger '%s' (ID: %d)", charger.Name, charger.ID)
	}

	if migratedCount > 0 {
		log.Printf("✅ Zaptec migration complete: %d charger(s) migrated", migratedCount)
	} else {
		log.Println("✅ No Zaptec chargers needed migration")
	}

	return nil
}
