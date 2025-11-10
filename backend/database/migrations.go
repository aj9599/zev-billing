package database

import (
	"database/sql"
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
			frequency TEXT NOT NULL,
			generation_day INTEGER NOT NULL,
			first_execution_date DATE,
			is_active INTEGER DEFAULT 1,
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
			notes TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (config_id) REFERENCES shared_meter_configs(id) ON DELETE CASCADE,
			FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
			UNIQUE(config_id, user_id)
		)`,

		// Indexes for performance
		`CREATE INDEX IF NOT EXISTS idx_meter_readings_time ON meter_readings(reading_time)`,
		`CREATE INDEX IF NOT EXISTS idx_meter_readings_meter ON meter_readings(meter_id)`,
		`CREATE INDEX IF NOT EXISTS idx_charger_sessions_time ON charger_sessions(session_time)`,
		`CREATE INDEX IF NOT EXISTS idx_charger_sessions_charger ON charger_sessions(charger_id)`,
		`CREATE INDEX IF NOT EXISTS idx_invoices_user ON invoices(user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_invoices_building ON invoices(building_id)`,
		`CREATE INDEX IF NOT EXISTS idx_invoices_pdf_path ON invoices(pdf_path)`,
		`CREATE INDEX IF NOT EXISTS idx_auto_billing_next_run ON auto_billing_configs(next_run)`,
		`CREATE INDEX IF NOT EXISTS idx_shared_meters_building ON shared_meter_configs(building_id)`,
		`CREATE INDEX IF NOT EXISTS idx_shared_meters_meter ON shared_meter_configs(meter_id)`,
		`CREATE INDEX IF NOT EXISTS idx_custom_items_building ON custom_line_items(building_id)`,
		`CREATE INDEX IF NOT EXISTS idx_custom_items_active ON custom_line_items(is_active)`,
		`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`,
		`CREATE INDEX IF NOT EXISTS idx_users_building ON users(building_id)`,
		`CREATE INDEX IF NOT EXISTS idx_users_user_type ON users(user_type)`,
		`CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active)`,
		`CREATE INDEX IF NOT EXISTS idx_users_apartment_unit ON users(apartment_unit)`,
		`CREATE INDEX IF NOT EXISTS idx_users_rent_dates ON users(rent_start_date, rent_end_date)`,
		`CREATE INDEX IF NOT EXISTS idx_meters_device_type ON meters(device_type)`,
		`CREATE INDEX IF NOT EXISTS idx_meter_readings_export ON meter_readings(power_kwh_export)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_type ON users(email, user_type)`,
	}

	// Execute all migrations
	for i, migration := range migrations {
		if _, err := db.Exec(migration); err != nil {
			// Log but don't fail on already-exists errors
			if !contains(err.Error(), "already exists") && !contains(err.Error(), "duplicate") {
				log.Printf("Migration %d warning: %v", i+1, err)
			}
		}
	}

	log.Println("âœ… Base tables and indexes created/verified")

	// Run additional migrations for new columns
	if err := addMQTTDeviceTypeColumn(db); err != nil {
		log.Printf("âš ï¸  MQTT device type migration: %v", err)
	}

	if err := addExportColumns(db); err != nil {
		log.Printf("âš ï¸  Export columns migration: %v", err)
	}

	if err := addVZEVColumns(db); err != nil {
		log.Printf("⚠️  vZEV columns migration: %v", err)
	}

	// Create triggers
	if err := createTriggers(db); err != nil {
		log.Printf("Note: Triggers creation: %v", err)
	}

	// Create default admin
	if err := createDefaultAdmin(db); err != nil {
		return fmt.Errorf("failed to create default admin: %v", err)
	}

	log.Println("âœ… All migrations completed successfully")
	return nil
}

// NEW: Add MQTT device type column to meters table
func addMQTTDeviceTypeColumn(db *sql.DB) error {
	// Check if column already exists
	var sql string
	err := db.QueryRow(`
		SELECT sql FROM sqlite_master 
		WHERE type='table' AND name='meters'
	`).Scan(&sql)

	if err != nil {
		return err
	}

	// If column doesn't exist, add it
	if !contains(sql, "device_type") {
		log.Println("Adding device_type column to meters table...")
		_, err := db.Exec(`ALTER TABLE meters ADD COLUMN device_type TEXT DEFAULT 'generic'`)
		if err != nil {
			if contains(err.Error(), "duplicate column") {
				log.Println("âœ… device_type column already exists")
				return nil
			}
			return fmt.Errorf("failed to add device_type column: %v", err)
		}
		log.Println("âœ… device_type column added successfully")

		// Update existing MQTT meters to generic type
		_, err = db.Exec(`UPDATE meters SET device_type = 'generic' WHERE connection_type = 'mqtt' AND (device_type IS NULL OR device_type = '')`)
		if err != nil {
			log.Printf("Warning: Failed to update existing meters: %v", err)
		}
	} else {
		log.Println("âœ… device_type column already exists")
	}

	return nil
}

// NEW: Add export energy columns
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
				log.Println("âœ… last_reading_export column already exists")
			} else {
				return fmt.Errorf("failed to add last_reading_export column: %v", err)
			}
		} else {
			log.Println("âœ… last_reading_export column added successfully")
		}
	} else {
		log.Println("âœ… last_reading_export column already exists")
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
				log.Println("âœ… power_kwh_export column already exists")
			} else {
				return fmt.Errorf("failed to add power_kwh_export column: %v", err)
			}
		} else {
			log.Println("âœ… power_kwh_export column added successfully")
		}
	} else {
		log.Println("âœ… power_kwh_export column already exists")
	}

	// Add consumption_export to meter_readings table
	if !contains(readingsSql, "consumption_export") {
		log.Println("Adding consumption_export column to meter_readings table...")
		_, err := db.Exec(`ALTER TABLE meter_readings ADD COLUMN consumption_export REAL DEFAULT 0`)
		if err != nil {
			if contains(err.Error(), "duplicate column") {
				log.Println("âœ… consumption_export column already exists")
			} else {
				return fmt.Errorf("failed to add consumption_export column: %v", err)
			}
		} else {
			log.Println("âœ… consumption_export column added successfully")
		}
	} else {
		log.Println("âœ… consumption_export column already exists")
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

		log.Println("âœ… Default admin user created")
		log.Println("   Username: admin")
		log.Println("   Password: admin123")
		log.Println("   âš ï¸  IMPORTANT: Change the default password immediately!")
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
				log.Println("✅ is_complex column already exists")
			} else {
				return fmt.Errorf("failed to add is_complex column: %v", err)
			}
		} else {
			log.Println("✅ is_complex column added successfully")
		}
	} else {
		log.Println("✅ is_complex column already exists")
	}

	// Add vzev_export_price to billing_settings table
	if !contains(billingSettingsSql, "vzev_export_price") {
		log.Println("Adding vzev_export_price column to billing_settings table...")
		_, err := db.Exec(`ALTER TABLE billing_settings ADD COLUMN vzev_export_price REAL DEFAULT 0.18`)
		if err != nil {
			if contains(err.Error(), "duplicate column") {
				log.Println("✅ vzev_export_price column already exists")
			} else {
				return fmt.Errorf("failed to add vzev_export_price column: %v", err)
			}
		} else {
			log.Println("✅ vzev_export_price column added successfully")
		}
	} else {
		log.Println("✅ vzev_export_price column already exists")
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
				log.Println("✅ is_vzev column already exists")
			} else {
				return fmt.Errorf("failed to add is_vzev column: %v", err)
			}
		} else {
			log.Println("✅ is_vzev column added successfully")
		}
	} else {
		log.Println("✅ is_vzev column already exists")
	}

	return nil
}