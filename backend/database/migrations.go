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
			email TEXT UNIQUE NOT NULL,
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
			user_type TEXT DEFAULT 'regular',
			managed_buildings TEXT,
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

	// Add consumption_kwh column if it doesn't exist
	_, err := db.Exec(`ALTER TABLE meter_readings ADD COLUMN consumption_kwh REAL DEFAULT 0`)
	if err != nil {
		log.Printf("Note: consumption_kwh column may already exist: %v", err)
	}

	// Add user_type column if it doesn't exist
	_, err = db.Exec(`ALTER TABLE users ADD COLUMN user_type TEXT DEFAULT 'regular'`)
	if err != nil {
		log.Printf("Note: user_type column may already exist: %v", err)
	}

	// Add managed_buildings column if it doesn't exist
	_, err = db.Exec(`ALTER TABLE users ADD COLUMN managed_buildings TEXT`)
	if err != nil {
		log.Printf("Note: managed_buildings column may already exist: %v", err)
	}

	if err := createDefaultAdmin(db); err != nil {
		return err
	}

	log.Println("Migrations completed successfully")
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

		log.Println("Default admin user created (username: admin, password: admin123)")
		log.Println("⚠️  IMPORTANT: Change the default password immediately!")
	}

	return nil
}