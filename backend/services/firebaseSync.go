package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/aj9599/zev-billing/backend/crypto"
	firebase "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/auth"
	"firebase.google.com/go/v4/db"
	"google.golang.org/api/option"
)

type FirebaseSync struct {
	db             *sql.DB
	firebaseApp    *firebase.App
	authClient     *auth.Client
	dbClient       *db.Client
	enabled        bool
	encryptionKey  []byte
	projectID      string
}

func NewFirebaseSync(database *sql.DB) *FirebaseSync {
	// Get encryption key
	encryptionKey, err := crypto.GetEncryptionKey()
	if err != nil {
		log.Printf("Warning: Failed to get encryption key: %v", err)
	}
	
	sync := &FirebaseSync{
		db:            database,
		enabled:       false,
		encryptionKey: encryptionKey,
	}
	
	// Try to initialize on creation
	if err := sync.Initialize(); err != nil {
		log.Printf("Firebase sync not initialized: %v", err)
	}
	
	return sync
}

// Initialize Firebase with credentials from database
func (fs *FirebaseSync) Initialize() error {
	// Check if Firebase is enabled
	var enabled bool
	var firebaseProjectID string
	var encryptedConfig string
	
	err := fs.db.QueryRow(`
		SELECT mobile_app_enabled, firebase_project_id, firebase_config
		FROM app_settings
		WHERE id = 1
	`).Scan(&enabled, &firebaseProjectID, &encryptedConfig)

	if err != nil {
		if err == sql.ErrNoRows {
			log.Println("No app settings found - Firebase sync disabled")
			fs.enabled = false
			return nil
		}
		return fmt.Errorf("failed to query app settings: %v", err)
	}

	if !enabled || encryptedConfig == "" {
		log.Println("Firebase sync not enabled or not configured")
		fs.enabled = false
		return nil
	}

	// Decrypt Firebase config
	var firebaseConfig string
	if fs.encryptionKey != nil {
		decrypted, err := crypto.Decrypt(encryptedConfig, fs.encryptionKey)
		if err != nil {
			log.Printf("Failed to decrypt Firebase config: %v", err)
			return fmt.Errorf("failed to decrypt Firebase config: %v", err)
		}
		firebaseConfig = decrypted
	} else {
		firebaseConfig = encryptedConfig
	}

	// Validate Firebase config
	if firebaseConfig == "" {
		log.Println("Firebase config is empty")
		fs.enabled = false
		return nil
	}

	// Parse Firebase config to validate
	var config map[string]interface{}
	if err := json.Unmarshal([]byte(firebaseConfig), &config); err != nil {
		return fmt.Errorf("failed to parse Firebase config: %v", err)
	}

	// Validate required fields
	if _, ok := config["project_id"]; !ok {
		return fmt.Errorf("Firebase config missing project_id")
	}
	if _, ok := config["private_key"]; !ok {
		return fmt.Errorf("Firebase config missing private_key")
	}
	if _, ok := config["client_email"]; !ok {
		return fmt.Errorf("Firebase config missing client_email")
	}

	// Get database URL from config or construct it
	databaseURL, ok := config["database_url"].(string)
	if !ok || databaseURL == "" {
		projectID, _ := config["project_id"].(string)
		databaseURL = fmt.Sprintf("https://%s-default-rtdb.firebaseio.com", projectID)
	}

	// Initialize Firebase app
	ctx := context.Background()
	opt := option.WithCredentialsJSON([]byte(firebaseConfig))
	
	conf := &firebase.Config{
		DatabaseURL: databaseURL,
	}
	
	app, err := firebase.NewApp(ctx, conf, opt)
	if err != nil {
		return fmt.Errorf("failed to initialize Firebase app: %v", err)
	}

	// Get Auth client
	authClient, err := app.Auth(ctx)
	if err != nil {
		return fmt.Errorf("failed to get Firebase Auth client: %v", err)
	}

	// Get Database client
	dbClient, err := app.Database(ctx)
	if err != nil {
		return fmt.Errorf("failed to get Firebase Database client: %v", err)
	}

	fs.firebaseApp = app
	fs.authClient = authClient
	fs.dbClient = dbClient
	fs.enabled = true
	fs.projectID = firebaseProjectID

	log.Printf("✅ Firebase sync initialized successfully (Project: %s)", firebaseProjectID)
	return nil
}

// CreateFirebaseUser creates a user in Firebase Authentication
func (fs *FirebaseSync) CreateFirebaseUser(username, password string) (string, error) {
	if !fs.enabled {
		log.Println("Firebase sync not enabled - skipping user creation")
		return "", nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Create email from username (use your domain)
	email := username + "@zev-app.local"

	params := (&auth.UserToCreate{}).
		Email(email).
		Password(password).
		DisplayName(username)

	user, err := fs.authClient.CreateUser(ctx, params)
	if err != nil {
		return "", fmt.Errorf("failed to create Firebase user: %v", err)
	}

	log.Printf("✅ Created Firebase user: %s (UID: %s)", username, user.UID)
	return user.UID, nil
}

// UpdateFirebasePassword updates a user's password in Firebase
func (fs *FirebaseSync) UpdateFirebasePassword(uid, newPassword string) error {
	if !fs.enabled {
		return nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	params := (&auth.UserToUpdate{}).Password(newPassword)
	
	_, err := fs.authClient.UpdateUser(ctx, uid, params)
	if err != nil {
		return fmt.Errorf("failed to update Firebase password: %v", err)
	}

	log.Printf("✅ Updated Firebase user password: %s", uid)
	return nil
}

// DeleteFirebaseUser deletes a user from Firebase Authentication
func (fs *FirebaseSync) DeleteFirebaseUser(uid string) error {
	if !fs.enabled {
		return nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	err := fs.authClient.DeleteUser(ctx, uid)
	if err != nil {
		return fmt.Errorf("failed to delete Firebase user: %v", err)
	}

	log.Printf("✅ Deleted Firebase user: %s", uid)
	return nil
}

// SyncAllData synchronizes all data from SQL to Firebase Realtime Database
func (fs *FirebaseSync) SyncAllData() error {
	if !fs.enabled {
		return fmt.Errorf("Firebase sync is not enabled or configured")
	}

	log.Println("🔄 Starting Firebase data sync...")
	startTime := time.Now()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	errors := []error{}

	// Sync Users
	if err := fs.syncUsers(ctx); err != nil {
		log.Printf("❌ Error syncing users: %v", err)
		errors = append(errors, err)
	} else {
		log.Println("✅ Users synced")
	}

	// Sync Buildings
	if err := fs.syncBuildings(ctx); err != nil {
		log.Printf("❌ Error syncing buildings: %v", err)
		errors = append(errors, err)
	} else {
		log.Println("✅ Buildings synced")
	}

	// Sync Meters
	if err := fs.syncMeters(ctx); err != nil {
		log.Printf("❌ Error syncing meters: %v", err)
		errors = append(errors, err)
	} else {
		log.Println("✅ Meters synced")
	}

	// Sync Chargers
	if err := fs.syncChargers(ctx); err != nil {
		log.Printf("❌ Error syncing chargers: %v", err)
		errors = append(errors, err)
	} else {
		log.Println("✅ Chargers synced")
	}

	// Sync Invoices
	if err := fs.syncInvoices(ctx); err != nil {
		log.Printf("❌ Error syncing invoices: %v", err)
		errors = append(errors, err)
	} else {
		log.Println("✅ Invoices synced")
	}

	// Sync App Users with permissions
	if err := fs.syncAppUsers(ctx); err != nil {
		log.Printf("❌ Error syncing app users: %v", err)
		errors = append(errors, err)
	} else {
		log.Println("✅ App users synced")
	}

	duration := time.Since(startTime)
	
	if len(errors) > 0 {
		log.Printf("⚠️  Firebase sync completed with %d errors in %v", len(errors), duration)
		return fmt.Errorf("sync completed with %d errors", len(errors))
	}

	log.Printf("✅ Firebase data sync completed successfully in %v", duration)
	return nil
}

// syncUsers syncs users to Firebase
func (fs *FirebaseSync) syncUsers(ctx context.Context) error {
	rows, err := fs.db.Query(`
		SELECT id, first_name, last_name, email, phone, building_id, apartment_unit, 
		       user_type, is_active
		FROM users
		WHERE is_active = 1
	`)
	if err != nil {
		return err
	}
	defer rows.Close()

	ref := fs.dbClient.NewRef("users")
	usersData := make(map[string]interface{})

	count := 0
	for rows.Next() {
		var id int
		var firstName, lastName, email, phone, apartmentUnit, userType string
		var buildingID *int
		var isActive bool

		err := rows.Scan(&id, &firstName, &lastName, &email, &phone, &buildingID, 
			&apartmentUnit, &userType, &isActive)
		if err != nil {
			log.Printf("Warning: Failed to scan user row: %v", err)
			continue
		}

		userData := map[string]interface{}{
			"id":             id,
			"first_name":     firstName,
			"last_name":      lastName,
			"email":          email,
			"phone":          phone,
			"apartment_unit": apartmentUnit,
			"user_type":      userType,
			"is_active":      isActive,
		}

		if buildingID != nil {
			userData["building_id"] = *buildingID
		}

		usersData[fmt.Sprintf("%d", id)] = userData
		count++
	}

	if err := ref.Set(ctx, usersData); err != nil {
		return fmt.Errorf("failed to sync users: %v", err)
	}

	log.Printf("  Synced %d users", count)
	return nil
}

// syncBuildings syncs buildings to Firebase
func (fs *FirebaseSync) syncBuildings(ctx context.Context) error {
	rows, err := fs.db.Query(`
		SELECT id, name, address_street, address_city, address_zip, address_country,
		       has_apartments, floors_config
		FROM buildings
	`)
	if err != nil {
		return err
	}
	defer rows.Close()

	ref := fs.dbClient.NewRef("buildings")
	buildingsData := make(map[string]interface{})

	count := 0
	for rows.Next() {
		var id int
		var name, street, city, zip, country string
		var floorsConfig sql.NullString
		var hasApartments bool

		err := rows.Scan(&id, &name, &street, &city, &zip, &country, &hasApartments, &floorsConfig)
		if err != nil {
			log.Printf("Warning: Failed to scan building row: %v", err)
			continue
		}

		buildingData := map[string]interface{}{
			"id":              id,
			"name":            name,
			"address_street":  street,
			"address_city":    city,
			"address_zip":     zip,
			"address_country": country,
			"has_apartments":  hasApartments,
		}

		if floorsConfig.Valid && floorsConfig.String != "" {
			var floors []interface{}
			if err := json.Unmarshal([]byte(floorsConfig.String), &floors); err == nil {
				buildingData["floors_config"] = floors
			}
		}

		buildingsData[fmt.Sprintf("%d", id)] = buildingData
		count++
	}

	if err := ref.Set(ctx, buildingsData); err != nil {
		return fmt.Errorf("failed to sync buildings: %v", err)
	}

	log.Printf("  Synced %d buildings", count)
	return nil
}

// syncMeters syncs meters to Firebase
func (fs *FirebaseSync) syncMeters(ctx context.Context) error {
	rows, err := fs.db.Query(`
		SELECT id, name, meter_type, building_id, user_id, apartment_unit,
		       last_reading, last_reading_time, is_active
		FROM meters
		WHERE is_active = 1 AND is_archived = 0
	`)
	if err != nil {
		return err
	}
	defer rows.Close()

	ref := fs.dbClient.NewRef("meters")
	metersData := make(map[string]interface{})

	count := 0
	for rows.Next() {
		var id, buildingID int
		var name, meterType, apartmentUnit string
		var userID *int
		var lastReading float64
		var lastReadingTime *time.Time
		var isActive bool

		err := rows.Scan(&id, &name, &meterType, &buildingID, &userID, &apartmentUnit,
			&lastReading, &lastReadingTime, &isActive)
		if err != nil {
			log.Printf("Warning: Failed to scan meter row: %v", err)
			continue
		}

		meterData := map[string]interface{}{
			"id":             id,
			"name":           name,
			"meter_type":     meterType,
			"building_id":    buildingID,
			"apartment_unit": apartmentUnit,
			"last_reading":   lastReading,
			"is_active":      isActive,
		}

		if userID != nil {
			meterData["user_id"] = *userID
		}

		if lastReadingTime != nil {
			meterData["last_reading_time"] = lastReadingTime.Unix()
		}

		metersData[fmt.Sprintf("%d", id)] = meterData
		count++
	}

	if err := ref.Set(ctx, metersData); err != nil {
		return fmt.Errorf("failed to sync meters: %v", err)
	}

	log.Printf("  Synced %d meters", count)
	return nil
}

// syncChargers syncs chargers to Firebase
func (fs *FirebaseSync) syncChargers(ctx context.Context) error {
	rows, err := fs.db.Query(`
		SELECT id, name, brand, building_id, supports_priority, is_active
		FROM chargers
		WHERE is_active = 1
	`)
	if err != nil {
		return err
	}
	defer rows.Close()

	ref := fs.dbClient.NewRef("chargers")
	chargersData := make(map[string]interface{})

	count := 0
	for rows.Next() {
		var id, buildingID int
		var name, brand string
		var supportsPriority, isActive bool

		err := rows.Scan(&id, &name, &brand, &buildingID, &supportsPriority, &isActive)
		if err != nil {
			log.Printf("Warning: Failed to scan charger row: %v", err)
			continue
		}

		chargerData := map[string]interface{}{
			"id":                id,
			"name":              name,
			"brand":             brand,
			"building_id":       buildingID,
			"supports_priority": supportsPriority,
			"is_active":         isActive,
		}

		chargersData[fmt.Sprintf("%d", id)] = chargerData
		count++
	}

	if err := ref.Set(ctx, chargersData); err != nil {
		return fmt.Errorf("failed to sync chargers: %v", err)
	}

	log.Printf("  Synced %d chargers", count)
	return nil
}

// syncInvoices syncs recent invoices to Firebase
func (fs *FirebaseSync) syncInvoices(ctx context.Context) error {
	// Only sync invoices from last 12 months
	twelveMonthsAgo := time.Now().AddDate(0, -12, 0)

	rows, err := fs.db.Query(`
		SELECT id, invoice_number, user_id, building_id, period_start, period_end,
		       total_amount, currency, status, pdf_path, generated_at
		FROM invoices
		WHERE generated_at > ?
		ORDER BY generated_at DESC
		LIMIT 1000
	`, twelveMonthsAgo)
	if err != nil {
		return err
	}
	defer rows.Close()

	ref := fs.dbClient.NewRef("invoices")
	invoicesData := make(map[string]interface{})

	count := 0
	for rows.Next() {
		var id, userID, buildingID int
		var invoiceNumber, periodStart, periodEnd, currency, status string
		var pdfPath sql.NullString
		var totalAmount float64
		var generatedAt time.Time

		err := rows.Scan(&id, &invoiceNumber, &userID, &buildingID, &periodStart, &periodEnd,
			&totalAmount, &currency, &status, &pdfPath, &generatedAt)
		if err != nil {
			log.Printf("Warning: Failed to scan invoice row: %v", err)
			continue
		}

		invoiceData := map[string]interface{}{
			"id":             id,
			"invoice_number": invoiceNumber,
			"user_id":        userID,
			"building_id":    buildingID,
			"period_start":   periodStart,
			"period_end":     periodEnd,
			"total_amount":   totalAmount,
			"currency":       currency,
			"status":         status,
			"generated_at":   generatedAt.Unix(),
		}

		if pdfPath.Valid {
			invoiceData["pdf_path"] = pdfPath.String
		}

		invoicesData[fmt.Sprintf("%d", id)] = invoiceData
		count++
	}

	if err := ref.Set(ctx, invoicesData); err != nil {
		return fmt.Errorf("failed to sync invoices: %v", err)
	}

	log.Printf("  Synced %d invoices", count)
	return nil
}

// syncAppUsers syncs app users and their permissions to Firebase
func (fs *FirebaseSync) syncAppUsers(ctx context.Context) error {
	rows, err := fs.db.Query(`
		SELECT id, username, firebase_uid, device_id, permissions_json, is_active
		FROM app_users
		WHERE is_active = 1
	`)
	if err != nil {
		return err
	}
	defer rows.Close()

	ref := fs.dbClient.NewRef("app_users")
	usersData := make(map[string]interface{})

	count := 0
	for rows.Next() {
		var id int
		var username, permissionsJSON string
		var firebaseUID, deviceID sql.NullString
		var isActive bool

		err := rows.Scan(&id, &username, &firebaseUID, &deviceID, &permissionsJSON, &isActive)
		if err != nil {
			log.Printf("Warning: Failed to scan app user row: %v", err)
			continue
		}

		var permissions map[string]bool
		if err := json.Unmarshal([]byte(permissionsJSON), &permissions); err != nil {
			log.Printf("Warning: Failed to parse permissions for user %d: %v", id, err)
			permissions = make(map[string]bool)
		}

		userData := map[string]interface{}{
			"id":          id,
			"username":    username,
			"permissions": permissions,
			"is_active":   isActive,
		}

		if deviceID.Valid {
			userData["device_id"] = deviceID.String
		}

		// Use Firebase UID as key if available, otherwise use ID
		key := fmt.Sprintf("%d", id)
		if firebaseUID.Valid && firebaseUID.String != "" {
			key = firebaseUID.String
		}

		usersData[key] = userData
		count++
	}

	if err := ref.Set(ctx, usersData); err != nil {
		return fmt.Errorf("failed to sync app users: %v", err)
	}

	log.Printf("  Synced %d app users", count)
	return nil
}

// StartPeriodicSync starts a goroutine that syncs data every 15 minutes
func (fs *FirebaseSync) StartPeriodicSync() {
	if !fs.enabled {
		log.Println("Firebase periodic sync not started - sync is disabled")
		return
	}

	go func() {
		ticker := time.NewTicker(15 * time.Minute)
		defer ticker.Stop()

		log.Println("✅ Firebase periodic sync started (15-minute intervals)")

		for range ticker.C {
			log.Println("🔄 Starting periodic Firebase sync...")
			if err := fs.SyncAllData(); err != nil {
				log.Printf("❌ Periodic sync error: %v", err)
			}
		}
	}()
}

// IsEnabled returns whether Firebase sync is enabled
func (fs *FirebaseSync) IsEnabled() bool {
	return fs.enabled
}

// GetProjectID returns the Firebase project ID
func (fs *FirebaseSync) GetProjectID() string {
	return fs.projectID
}