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
			is_active INTEGER DEFAULT 1,
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
			notes TEXT,
			last_reading REAL DEFAULT 0,
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
			consumption_kwh REAL DEFAULT 0,
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

		// =====================================================================
		// NEW: Meter Replacements Table
		// =====================================================================
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

		// =====================================================================
		// Shared Meter Configurations
		// =====================================================================
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

		// =====================================================================
		// Custom Line Items
		// =====================================================================
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

		// =====================================================================
		// Shared Meter Custom Splits
		// =====================================================================
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

		// =====================================================================
		// Indexes for existing tables
		// =====================================================================
		`CREATE INDEX IF NOT EXISTS idx_meter_readings_time ON meter_readings(reading_time)`,
		`CREATE INDEX IF NOT EXISTS idx_meter_readings_meter ON meter_readings(meter_id)`,
		`CREATE INDEX IF NOT EXISTS idx_charger_sessions_time ON charger_sessions(session_time)`,
		`CREATE INDEX IF NOT EXISTS idx_charger_sessions_charger ON charger_sessions(charger_id)`,
		`CREATE INDEX IF NOT EXISTS idx_invoices_user ON invoices(user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_invoices_building ON invoices(building_id)`,
		`CREATE INDEX IF NOT EXISTS idx_invoices_pdf_path ON invoices(pdf_path)`,
		`CREATE INDEX IF NOT EXISTS idx_auto_billing_next_run ON auto_billing_configs(next_run)`,

		// =====================================================================
		// Indexes for shared meters and custom items
		// =====================================================================
		`CREATE INDEX IF NOT EXISTS idx_shared_meters_building ON shared_meter_configs(building_id)`,
		`CREATE INDEX IF NOT EXISTS idx_shared_meters_meter ON shared_meter_configs(meter_id)`,
		`CREATE INDEX IF NOT EXISTS idx_custom_items_building ON custom_line_items(building_id)`,
		`CREATE INDEX IF NOT EXISTS idx_custom_items_active ON custom_line_items(is_active)`,
		`CREATE INDEX IF NOT EXISTS idx_custom_splits_config ON shared_meter_custom_splits(config_id)`,
		`CREATE INDEX IF NOT EXISTS idx_custom_splits_user ON shared_meter_custom_splits(user_id)`,
	}

	log.Println("Running database migrations...")

	for i, migration := range migrations {
		_, err := db.Exec(migration)
		if err != nil {
			log.Printf("ERROR: Migration %d failed: %v", i+1, err)
			log.Printf("Failed SQL: %s", migration[:min(len(migration), 100)])
			return err
		}
	}

	// Add meter replacement columns if they don't exist
	if err := addMeterReplacementColumns(db); err != nil {
		log.Printf("Meter replacement columns migration: %v", err)
	}

	// Add apartments_json column to auto_billing_configs
	if err := addApartmentsJsonColumn(db); err != nil {
		log.Printf("Apartments JSON column migration: %v", err)
	}

	// Add language column for multi-language invoices
	if err := addLanguageColumn(db); err != nil {
		log.Printf("Language column migration: %v", err)
	}

	// Additional indexes that may not be in the main migrations array
	newIndexes := []string{
		`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`,
		`CREATE INDEX IF NOT EXISTS idx_users_building ON users(building_id)`,
		`CREATE INDEX IF NOT EXISTS idx_users_user_type ON users(user_type)`,
		`CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active)`,
		`CREATE INDEX IF NOT EXISTS idx_users_apartment_unit ON users(apartment_unit)`,
		`CREATE INDEX IF NOT EXISTS idx_meters_user ON meters(user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_meters_apartment_unit ON meters(apartment_unit)`,
		`CREATE INDEX IF NOT EXISTS idx_meters_building ON meters(building_id)`,
		`CREATE INDEX IF NOT EXISTS idx_meters_shared ON meters(is_shared)`,
	}

	for _, idx := range newIndexes {
		_, err := db.Exec(idx)
		if err != nil {
			log.Printf("Note: Index may already exist: %v", err)
		}
	}

	// Fix email constraint for existing databases
	if err := migrateEmailConstraint(db); err != nil {
		log.Printf("Email constraint migration: %v", err)
	}

	// Create triggers for shared meters and custom items
	if err := createTriggers(db); err != nil {
		log.Printf("Trigger creation: %v", err)
	}

	if err := createDefaultAdmin(db); err != nil {
		return err
	}

	log.Println("Ã¢Å“â€œ Migrations completed successfully")
	log.Println("Ã¢Å“â€œ Shared meter configurations table ready")
	log.Println("Ã¢Å“â€œ Custom line items table ready")
	log.Println("Ã¢Å“â€œ Meter replacements table ready")
	log.Println("Ã¢Å“â€œ Auto billing apartments_json column ready")
	return nil
}

// =====================================================================
// NEW: Add meter replacement columns to existing meters table
// =====================================================================
func addMeterReplacementColumns(db *sql.DB) error {
	// Check if columns already exist
	var sql string
	err := db.QueryRow(`
		SELECT sql FROM sqlite_master 
		WHERE type='table' AND name='meters'
	`).Scan(&sql)

	if err != nil {
		return err
	}

	columns := []struct {
		name       string
		definition string
	}{
		{"is_archived", "INTEGER DEFAULT 0"},
		{"replaced_by_meter_id", "INTEGER"},
		{"replaces_meter_id", "INTEGER"},
		{"replacement_date", "DATETIME"},
		{"replacement_notes", "TEXT"},
	}

	for _, col := range columns {
		if !contains(sql, col.name) {
			log.Printf("Adding column %s to meters table...", col.name)
			_, err := db.Exec(fmt.Sprintf("ALTER TABLE meters ADD COLUMN %s %s", col.name, col.definition))
			if err != nil {
				if contains(err.Error(), "duplicate column") {
					log.Printf("Ã¢Å“â€œ Column %s already exists", col.name)
					continue
				}
				log.Printf("WARNING: Failed to add column %s: %v", col.name, err)
			} else {
				log.Printf("Ã¢Å“â€œ Column %s added successfully", col.name)
			}
		}
	}

	// Create indexes for meter replacement columns
	log.Println("Creating indexes for meter replacement columns...")
	indexes := []string{
		`CREATE INDEX IF NOT EXISTS idx_meters_archived ON meters(is_archived)`,
		`CREATE INDEX IF NOT EXISTS idx_meters_replaced_by ON meters(replaced_by_meter_id)`,
		`CREATE INDEX IF NOT EXISTS idx_meters_replaces ON meters(replaces_meter_id)`,
		`CREATE INDEX IF NOT EXISTS idx_meter_replacements_old ON meter_replacements(old_meter_id)`,
		`CREATE INDEX IF NOT EXISTS idx_meter_replacements_new ON meter_replacements(new_meter_id)`,
		`CREATE INDEX IF NOT EXISTS idx_meter_replacements_date ON meter_replacements(replacement_date)`,
	}

	for _, idx := range indexes {
		if _, err := db.Exec(idx); err != nil {
			log.Printf("Note: Index may already exist: %v", err)
		}
	}
	log.Println("Meter replacement indexes created")

	return nil
}

// =====================================================================
// Add apartments_json column for apartment-based auto billing
// =====================================================================
func addApartmentsJsonColumn(db *sql.DB) error {
	var sql string
	err := db.QueryRow(`
		SELECT sql FROM sqlite_master 
		WHERE type='table' AND name='auto_billing_configs'
	`).Scan(&sql)

	if err != nil {
		return err
	}

	if contains(sql, "apartments_json") {
		log.Println("Ã¢Å“â€œ apartments_json column already exists")
		return nil
	}

	log.Println("Ã°Å¸â€œâ€ž Adding apartments_json column to auto_billing_configs table...")

	_, err = db.Exec(`ALTER TABLE auto_billing_configs ADD COLUMN apartments_json TEXT`)
	if err != nil {
		if contains(err.Error(), "duplicate column") {
			log.Println("Ã¢Å“â€œ apartments_json column already exists")
			return nil
		}
		return err
	}

	_, err = db.Exec(`UPDATE auto_billing_configs SET apartments_json = '[]' WHERE apartments_json IS NULL`)
	if err != nil {
		log.Printf("WARNING: Failed to set default apartments_json values: %v", err)
	}

	log.Println("Ã¢Å“â€œ apartments_json column added successfully")
	return nil
}

// =====================================================================
// Add language column for multi-language invoice support
// =====================================================================
func addLanguageColumn(db *sql.DB) error {
	var sql string
	err := db.QueryRow(`
		SELECT sql FROM sqlite_master 
		WHERE type='table' AND name='users'
	`).Scan(&sql)

	if err != nil {
		return err
	}

	if contains(sql, "language") {
		log.Println("✓ language column already exists")
		return nil
	}

	log.Println("📝 Adding language column to users table...")

	_, err = db.Exec(`ALTER TABLE users ADD COLUMN language TEXT DEFAULT 'de'`)
	if err != nil {
		if contains(err.Error(), "duplicate column") {
			log.Println("✓ language column already exists")
			return nil
		}
		return fmt.Errorf("failed to add language column: %v", err)
	}

	log.Println("✓ language column added successfully (default: 'de' for German)")
	return nil
}

// =====================================================================
// Create triggers for automatic timestamp updates
// =====================================================================
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
			log.Printf("Note: Trigger may already exist or failed: %v", err)
		}
	}

	return nil
}

func migrateEmailConstraint(db *sql.DB) error {
	var sql string
	err := db.QueryRow(`
		SELECT sql FROM sqlite_master 
		WHERE type='table' AND name='users'
	`).Scan(&sql)

	if err != nil {
		return err
	}

	hasUniqueConstraint := false
	if len(sql) > 0 {
		if containsEmailUnique(sql) {
			hasUniqueConstraint = true
		}
	}

	if !hasUniqueConstraint {
		log.Println("Email constraint already migrated or doesn't exist")

		_, err := db.Exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_type ON users(email, user_type)`)
		if err != nil {
			log.Printf("Note: Compound index may already exist: %v", err)
		} else {
			log.Println("Ã¢Å“â€œ Compound unique index (email, user_type) created")
		}

		return nil
	}

	log.Println("Ã°Å¸â€œâ€ž Migrating users table to remove email UNIQUE constraint...")

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	_, err = tx.Exec(`
		CREATE TABLE users_new (
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
			is_active INTEGER DEFAULT 1,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (building_id) REFERENCES buildings(id)
		)
	`)
	if err != nil {
		return err
	}

	_, err = tx.Exec(`INSERT INTO users_new SELECT * FROM users`)
	if err != nil {
		return err
	}

	_, err = tx.Exec(`DROP TABLE users`)
	if err != nil {
		return err
	}

	_, err = tx.Exec(`ALTER TABLE users_new RENAME TO users`)
	if err != nil {
		return err
	}

	indexes := []string{
		`CREATE INDEX idx_users_email ON users(email)`,
		`CREATE INDEX idx_users_building ON users(building_id)`,
		`CREATE INDEX idx_users_user_type ON users(user_type)`,
		`CREATE INDEX idx_users_active ON users(is_active)`,
		`CREATE INDEX idx_users_apartment_unit ON users(apartment_unit)`,
		`CREATE UNIQUE INDEX idx_users_email_type ON users(email, user_type)`,
	}

	for _, idx := range indexes {
		_, err = tx.Exec(idx)
		if err != nil {
			log.Printf("Index creation note: %v", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return err
	}

	log.Println("Ã¢Å“â€œ Email constraint migration completed successfully")
	return nil
}

func containsEmailUnique(sql string) bool {
	patterns := []string{
		"email TEXT UNIQUE",
		"email TEXT NOT NULL UNIQUE",
		"UNIQUE(email)",
	}

	for _, pattern := range patterns {
		if contains(sql, pattern) {
			return true
		}
	}

	return false
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > len(substr) && containsHelper(s, substr))
}

func containsHelper(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
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

		log.Println("Default admin user created (username: admin, password: admin123)")
		log.Println("Ã¢Å¡Â Ã¯Â¸Â  IMPORTANT: Change the default password immediately!")
	}

	return nil
}