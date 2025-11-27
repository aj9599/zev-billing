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
			notes TEXT,
			is_active INTEGER DEFAULT 1,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (building_id) REFERENCES buildings(id)
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

		`CREATE TABLE IF NOT EXISTS charger_readings (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			charger_id INTEGER NOT NULL,
			timestamp DATETIME NOT NULL,
			energy_kwh REAL NOT NULL,
			user_id TEXT,
			session_id TEXT,
			reading_type TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (charger_id) REFERENCES chargers(id)
		)`,

		`CREATE INDEX IF NOT EXISTS idx_charger_readings_charger_id ON charger_readings(charger_id)`,
		`CREATE INDEX IF NOT EXISTS idx_charger_readings_session_id ON charger_readings(session_id)`,
		`CREATE INDEX IF NOT EXISTS idx_charger_readings_timestamp ON charger_readings(timestamp)`,

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

		`CREATE TABLE IF NOT EXISTS app_settings (
			id INTEGER PRIMARY KEY CHECK (id = 1),
			mobile_app_enabled INTEGER DEFAULT 0,
			firebase_project_id TEXT DEFAULT '',
			firebase_config TEXT DEFAULT '',
			last_sync DATETIME,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,

		`CREATE TABLE IF NOT EXISTS app_users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			username TEXT UNIQUE NOT NULL,
			password_hash TEXT NOT NULL,
			description TEXT,
			permissions_json TEXT NOT NULL DEFAULT '{"meters":false,"chargers":false,"users":false,"buildings":false,"bills":false}',
			firebase_uid TEXT UNIQUE,
			device_id TEXT,
			is_active INTEGER DEFAULT 1,
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

	if err := addVZEVColumns(db); err != nil {
		return err
	}

	if err := addAutoBillingApartmentsColumn(db); err != nil {
		return err
	}

	// NEW: Add custom_item_ids column for custom item selection in auto billing
	if err := addCustomItemIdsColumn(db); err != nil {
		return err
	}

	if err := migrateZaptecConfigs(db); err != nil {
		return err
	}

	if err := createTriggers(db); err != nil {
		return err
	}

	if err := initializeAppSettings(db); err != nil {
		return err
	}

	return createDefaultAdmin(db)
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

func initializeAppSettings(db *sql.DB) error {
	var count int
	err := db.QueryRow("SELECT COUNT(*) FROM app_settings").Scan(&count)
	if err != nil {
		return err
	}

	if count == 0 {
		_, err = db.Exec(`
			INSERT INTO app_settings (id, mobile_app_enabled, firebase_project_id, firebase_config)
			VALUES (1, 0, '', '')
		`)
		if err != nil {
			return err
		}
		log.Println("✅ Default app settings created")
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
