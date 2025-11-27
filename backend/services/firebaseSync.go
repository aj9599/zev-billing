package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"time"

	firebase "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/auth"
	"firebase.google.com/go/v4/db"
	"google.golang.org/api/option"
)

type FirebaseSync struct {
	db          *sql.DB
	firebaseApp *firebase.App
	authClient  *auth.Client
	dbClient    *db.Client
	enabled     bool
}

func NewFirebaseSync(database *sql.DB) *FirebaseSync {
	return &FirebaseSync{
		db:      database,
		enabled: false,
	}
}

// Initialize Firebase with credentials
func (fs *FirebaseSync) Initialize() error {
	// Check if Firebase is enabled
	var enabled bool
	var firebaseConfig string
	err := fs.db.QueryRow(`
		SELECT mobile_app_enabled, firebase_config
		FROM app_settings
		WHERE id = 1
	`).Scan(&enabled, &firebaseConfig)

	if err != nil || !enabled || firebaseConfig == "" {
		log.Println("Firebase sync not enabled or not configured")
		fs.enabled = false
		return nil
	}

	// Parse Firebase config
	var config map[string]interface{}
	if err := json.Unmarshal([]byte(firebaseConfig), &config); err != nil {
		log.Printf("Failed to parse Firebase config: %v", err)
		return err
	}

	// Initialize Firebase app
	ctx := context.Background()
	opt := option.WithCredentialsJSON([]byte(firebaseConfig))
	
	app, err := firebase.NewApp(ctx, nil, opt)
	if err != nil {
		log.Printf("Failed to initialize Firebase app: %v", err)
		return err
	}

	// Get Auth client
	authClient, err := app.Auth(ctx)
	if err != nil {
		log.Printf("Failed to get Firebase Auth client: %v", err)
		return err
	}

	// Get Database client
	dbClient, err := app.Database(ctx)
	if err != nil {
		log.Printf("Failed to get Firebase Database client: %v", err)
		return err
	}

	fs.firebaseApp = app
	fs.authClient = authClient
	fs.dbClient = dbClient
	fs.enabled = true

	log.Println("✅ Firebase sync initialized successfully")
	return nil
}

// CreateFirebaseUser creates a user in Firebase Authentication
func (fs *FirebaseSync) CreateFirebaseUser(username, password string) (string, error) {
	if !fs.enabled {
		return "", nil
	}

	ctx := context.Background()
	params := (&auth.UserToCreate{}).
		Email(username + "@app.local"). // Using app.local domain for app users
		Password(password).
		DisplayName(username)

	user, err := fs.authClient.CreateUser(ctx, params)
	if err != nil {
		return "", err
	}

	log.Printf("Created Firebase user: %s (UID: %s)", username, user.UID)
	return user.UID, nil
}

// UpdateFirebasePassword updates a user's password in Firebase
func (fs *FirebaseSync) UpdateFirebasePassword(uid, newPassword string) error {
	if !fs.enabled {
		return nil
	}

	ctx := context.Background()
	params := (&auth.UserToUpdate{}).Password(newPassword)
	
	_, err := fs.authClient.UpdateUser(ctx, uid, params)
	if err != nil {
		return err
	}

	log.Printf("Updated Firebase user password: %s", uid)
	return nil
}

// DeleteFirebaseUser deletes a user from Firebase Authentication
func (fs *FirebaseSync) DeleteFirebaseUser(uid string) error {
	if !fs.enabled {
		return nil
	}

	ctx := context.Background()
	err := fs.authClient.DeleteUser(ctx, uid)
	if err != nil {
		return err
	}

	log.Printf("Deleted Firebase user: %s", uid)
	return nil
}

// SyncAllData synchronizes all data from SQL to Firebase Realtime Database
func (fs *FirebaseSync) SyncAllData() error {
	if !fs.enabled {
		return nil
	}

	log.Println("🔄 Starting Firebase data sync...")

	ctx := context.Background()

	// Sync Users
	if err := fs.syncUsers(ctx); err != nil {
		log.Printf("Error syncing users: %v", err)
	}

	// Sync Buildings
	if err := fs.syncBuildings(ctx); err != nil {
		log.Printf("Error syncing buildings: %v", err)
	}

	// Sync Meters
	if err := fs.syncMeters(ctx); err != nil {
		log.Printf("Error syncing meters: %v", err)
	}

	// Sync Chargers
	if err := fs.syncChargers(ctx); err != nil {
		log.Printf("Error syncing chargers: %v", err)
	}

	// Sync Invoices
	if err := fs.syncInvoices(ctx); err != nil {
		log.Printf("Error syncing invoices: %v", err)
	}

	// Sync App Users with Device Mappings
	if err := fs.syncAppUsers(ctx); err != nil {
		log.Printf("Error syncing app users: %v", err)
	}

	log.Println("✅ Firebase data sync completed")
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

	for rows.Next() {
		var id int
		var firstName, lastName, email, phone, apartmentUnit, userType string
		var buildingID *int
		var isActive bool

		err := rows.Scan(&id, &firstName, &lastName, &email, &phone, &buildingID, 
			&apartmentUnit, &userType, &isActive)
		if err != nil {
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

		usersData[string(rune(id))] = userData
	}

	return ref.Set(ctx, usersData)
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

	for rows.Next() {
		var id int
		var name, street, city, zip, country, floorsConfig string
		var hasApartments bool

		err := rows.Scan(&id, &name, &street, &city, &zip, &country, &hasApartments, &floorsConfig)
		if err != nil {
			continue
		}

		buildingData := map[string]interface{}{
			"id":             id,
			"name":           name,
			"address_street": street,
			"address_city":   city,
			"address_zip":    zip,
			"address_country": country,
			"has_apartments": hasApartments,
		}

		if floorsConfig != "" {
			var floors []interface{}
			json.Unmarshal([]byte(floorsConfig), &floors)
			buildingData["floors_config"] = floors
		}

		buildingsData[string(rune(id))] = buildingData
	}

	return ref.Set(ctx, buildingsData)
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

		metersData[string(rune(id))] = meterData
	}

	return ref.Set(ctx, metersData)
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

	for rows.Next() {
		var id, buildingID int
		var name, brand string
		var supportsPriority, isActive bool

		err := rows.Scan(&id, &name, &brand, &buildingID, &supportsPriority, &isActive)
		if err != nil {
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

		chargersData[string(rune(id))] = chargerData
	}

	return ref.Set(ctx, chargersData)
}

// syncInvoices syncs recent invoices to Firebase
func (fs *FirebaseSync) syncInvoices(ctx context.Context) error {
	// Only sync invoices from last 6 months
	sixMonthsAgo := time.Now().AddDate(0, -6, 0)

	rows, err := fs.db.Query(`
		SELECT id, invoice_number, user_id, building_id, period_start, period_end,
		       total_amount, currency, status, pdf_path, generated_at
		FROM invoices
		WHERE generated_at > ?
		ORDER BY generated_at DESC
	`, sixMonthsAgo)
	if err != nil {
		return err
	}
	defer rows.Close()

	ref := fs.dbClient.NewRef("invoices")
	invoicesData := make(map[string]interface{})

	for rows.Next() {
		var id, userID, buildingID int
		var invoiceNumber, periodStart, periodEnd, currency, status, pdfPath string
		var totalAmount float64
		var generatedAt time.Time

		err := rows.Scan(&id, &invoiceNumber, &userID, &buildingID, &periodStart, &periodEnd,
			&totalAmount, &currency, &status, &pdfPath, &generatedAt)
		if err != nil {
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
			"pdf_path":       pdfPath,
			"generated_at":   generatedAt.Unix(),
		}

		invoicesData[string(rune(id))] = invoiceData
	}

	return ref.Set(ctx, invoicesData)
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

	for rows.Next() {
		var id int
		var username, firebaseUID, deviceID, permissionsJSON string
		var isActive bool

		err := rows.Scan(&id, &username, &firebaseUID, &deviceID, &permissionsJSON, &isActive)
		if err != nil {
			continue
		}

		var permissions map[string]bool
		json.Unmarshal([]byte(permissionsJSON), &permissions)

		userData := map[string]interface{}{
			"id":          id,
			"username":    username,
			"device_id":   deviceID,
			"permissions": permissions,
			"is_active":   isActive,
		}

		// Use Firebase UID as key if available, otherwise use ID
		key := firebaseUID
		if key == "" {
			key = string(rune(id))
		}

		usersData[key] = userData
	}

	return ref.Set(ctx, usersData)
}

// StartPeriodicSync starts a goroutine that syncs data every 15 minutes
func (fs *FirebaseSync) StartPeriodicSync() {
	if !fs.enabled {
		return
	}

	go func() {
		ticker := time.NewTicker(15 * time.Minute)
		defer ticker.Stop()

		for range ticker.C {
			log.Println("🔄 Starting periodic Firebase sync...")
			if err := fs.SyncAllData(); err != nil {
				log.Printf("Periodic sync error: %v", err)
			}
		}
	}()

	log.Println("✅ Firebase periodic sync started (15-minute intervals)")
}