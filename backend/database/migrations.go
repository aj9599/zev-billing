package database

import (
	"database/sql"
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
			connection_type TEXT NOT NULL,
			connection_config TEXT NOT NULL,
			notes TEXT,
			last_reading REAL DEFAULT 0,
			last_reading_time DATETIME,
			is_active INTEGER DEFAULT 1,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (building_id) REFERENCES buildings(id),
			FOREIGN KEY (user_id) REFERENCES users(id)
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

		`CREATE INDEX IF NOT EXISTS idx_meter_readings_time ON meter_readings(reading_time)`,
		`CREATE INDEX IF NOT EXISTS idx_meter_readings_meter ON meter_readings(meter_id)`,
		`CREATE INDEX IF NOT EXISTS idx_charger_sessions_time ON charger_sessions(session_time)`,
		`CREATE INDEX IF NOT EXISTS idx_charger_sessions_charger ON charger_sessions(charger_id)`,
		`CREATE INDEX IF NOT EXISTS idx_invoices_user ON invoices(user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_invoices_building ON invoices(building_id)`,
		`CREATE INDEX IF NOT EXISTS idx_auto_billing_next_run ON auto_billing_configs(next_run)`,
	}

	for _, migration := range migrations {
		if _, err := db.Exec(migration); err != nil {
			return err
		}
	}

	// Add new columns to existing tables
	addColumns := []string{
		`ALTER TABLE meter_readings ADD COLUMN consumption_kwh REAL DEFAULT 0`,
		`ALTER TABLE users ADD COLUMN user_type TEXT DEFAULT 'regular'`,
		`ALTER TABLE users ADD COLUMN managed_buildings TEXT`,
		`ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1`,
		`ALTER TABLE users ADD COLUMN apartment_unit TEXT`,
		`ALTER TABLE buildings ADD COLUMN has_apartments INTEGER DEFAULT 0`,
		`ALTER TABLE buildings ADD COLUMN floors_config TEXT`,
		`ALTER TABLE auto_billing_configs ADD COLUMN first_execution_date DATE`,
	}

	for _, stmt := range addColumns {
		_, err := db.Exec(stmt)
		if err != nil {
			log.Printf("Note: Column may already exist: %v", err)
		}
	}

	// Create indexes for new columns AFTER adding the columns
	newIndexes := []string{
		`CREATE INDEX IF NOT EXISTS idx_users_building ON users(building_id)`,
		`CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active)`,
		`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`,
		`CREATE INDEX IF NOT EXISTS idx_users_user_type ON users(user_type)`,
		`CREATE INDEX IF NOT EXISTS idx_users_apartment_unit ON users(apartment_unit)`,
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
		// Don't return error here as it might be already migrated
	}

	if err := createDefaultAdmin(db); err != nil {
		return err
	}

	log.Println("Migrations completed successfully")
	return nil
}

func migrateEmailConstraint(db *sql.DB) error {
	// Check if users table exists and has UNIQUE constraint on email
	var sql string
	err := db.QueryRow(`
		SELECT sql FROM sqlite_master 
		WHERE type='table' AND name='users'
	`).Scan(&sql)
	
	if err != nil {
		return err
	}

	// Check if the table still has UNIQUE constraint on email
	// If it contains "email TEXT UNIQUE" or "email TEXT NOT NULL UNIQUE", we need to migrate
	hasUniqueConstraint := false
	if len(sql) > 0 {
		// Simple check - if the schema contains "email TEXT UNIQUE" or similar
		if containsEmailUnique(sql) {
			hasUniqueConstraint = true
		}
	}

	if !hasUniqueConstraint {
		log.Println("Email constraint already migrated or doesn't exist")
		
		// Even if already migrated, ensure the compound unique index exists
		_, err := db.Exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_type ON users(email, user_type)`)
		if err != nil {
			log.Printf("Note: Compound index may already exist: %v", err)
		} else {
			log.Println("✓ Compound unique index (email, user_type) created")
		}
		
		return nil
	}

	log.Println("🔄 Migrating users table to remove email UNIQUE constraint...")

	// Begin transaction
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Step 1: Create new users table without UNIQUE constraint on email
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

	// Step 2: Copy all data
	_, err = tx.Exec(`
		INSERT INTO users_new 
		SELECT * FROM users
	`)
	if err != nil {
		return err
	}

	// Step 3: Drop old table
	_, err = tx.Exec(`DROP TABLE users`)
	if err != nil {
		return err
	}

	// Step 4: Rename new table
	_, err = tx.Exec(`ALTER TABLE users_new RENAME TO users`)
	if err != nil {
		return err
	}

	// Step 5: Recreate indexes
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

	// Commit transaction
	if err := tx.Commit(); err != nil {
		return err
	}

	log.Println("✓ Email constraint migration completed successfully")
	log.Println("✓ Administrators and regular users can now share the same email")
	
	return nil
}

func containsEmailUnique(sql string) bool {
	// Check for various forms of UNIQUE constraint on email
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
		log.Println("⚠️  IMPORTANT: Change the default password immediately!")
	}

	return nil
}