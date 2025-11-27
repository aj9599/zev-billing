package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"github.com/aj9599/zev-billing/backend/crypto"
	"github.com/aj9599/zev-billing/backend/models"
	"github.com/aj9599/zev-billing/backend/services"
	"github.com/gorilla/mux"
	"golang.org/x/crypto/bcrypt"
)

type AppHandler struct {
	db            *sql.DB
	firebaseSync  *services.FirebaseSync
	encryptionKey []byte
}

func NewAppHandler(db *sql.DB, firebaseSync *services.FirebaseSync) *AppHandler {
	// Get encryption key for Firebase config
	encryptionKey, err := crypto.GetEncryptionKey()
	if err != nil {
		log.Printf("Warning: Failed to get encryption key: %v", err)
		log.Println("⚠️  Firebase configuration will not be encrypted!")
	}
	
	return &AppHandler{
		db:            db,
		firebaseSync:  firebaseSync,
		encryptionKey: encryptionKey,
	}
}

// App Settings Handlers

func (h *AppHandler) GetSettings(w http.ResponseWriter, r *http.Request) {
	var settings models.AppSettings
	var lastSync sql.NullString
	var encryptedConfig string
	
	err := h.db.QueryRow(`
		SELECT mobile_app_enabled, firebase_project_id, firebase_config, last_sync
		FROM app_settings
		WHERE id = 1
	`).Scan(&settings.MobileAppEnabled, &settings.FirebaseProjectID, &encryptedConfig, &lastSync)

	if err != nil {
		if err == sql.ErrNoRows {
			// Create default settings if none exist
			_, err = h.db.Exec(`
				INSERT INTO app_settings (id, mobile_app_enabled, firebase_project_id, firebase_config, last_sync)
				VALUES (1, 0, '', '', NULL)
			`)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			settings = models.AppSettings{
				MobileAppEnabled:  false,
				FirebaseProjectID: "",
				FirebaseConfig:    "",
				LastSync:          nil,
			}
		} else {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	} else {
		// Decrypt Firebase config if it exists
		if encryptedConfig != "" && h.encryptionKey != nil {
			decrypted, err := crypto.Decrypt(encryptedConfig, h.encryptionKey)
			if err != nil {
				log.Printf("Warning: Failed to decrypt Firebase config: %v", err)
				// Don't fail the request, just log the error
				settings.FirebaseConfig = ""
			} else {
				settings.FirebaseConfig = decrypted
			}
		} else {
			settings.FirebaseConfig = encryptedConfig
		}
		
		// Convert sql.NullString to *string
		if lastSync.Valid {
			settings.LastSync = &lastSync.String
		} else {
			settings.LastSync = nil
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(settings)
}

func (h *AppHandler) UpdateSettings(w http.ResponseWriter, r *http.Request) {
	var input struct {
		MobileAppEnabled  *bool   `json:"mobile_app_enabled"`
		FirebaseProjectID *string `json:"firebase_project_id"`
		FirebaseConfig    *string `json:"firebase_config"`
	}
	
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Build update query dynamically
	query := "UPDATE app_settings SET updated_at = CURRENT_TIMESTAMP"
	args := []interface{}{}

	if input.MobileAppEnabled != nil {
		query += ", mobile_app_enabled = ?"
		args = append(args, *input.MobileAppEnabled)
	}

	if input.FirebaseProjectID != nil {
		query += ", firebase_project_id = ?"
		args = append(args, *input.FirebaseProjectID)
	}

	if input.FirebaseConfig != nil {
		// Validate Firebase config JSON
		var configMap map[string]interface{}
		if err := json.Unmarshal([]byte(*input.FirebaseConfig), &configMap); err != nil {
			http.Error(w, "Invalid Firebase configuration JSON", http.StatusBadRequest)
			return
		}
		
		// Validate required fields
		if _, ok := configMap["project_id"]; !ok {
			http.Error(w, "Firebase config missing project_id", http.StatusBadRequest)
			return
		}
		if _, ok := configMap["private_key"]; !ok {
			http.Error(w, "Firebase config missing private_key", http.StatusBadRequest)
			return
		}
		if _, ok := configMap["client_email"]; !ok {
			http.Error(w, "Firebase config missing client_email", http.StatusBadRequest)
			return
		}
		
		// Encrypt the Firebase config before storing
		var encryptedConfig string
		if h.encryptionKey != nil {
			encrypted, err := crypto.Encrypt(*input.FirebaseConfig, h.encryptionKey)
			if err != nil {
				log.Printf("Warning: Failed to encrypt Firebase config: %v", err)
				encryptedConfig = *input.FirebaseConfig // Store unencrypted as fallback
			} else {
				encryptedConfig = encrypted
			}
		} else {
			encryptedConfig = *input.FirebaseConfig
		}
		
		query += ", firebase_config = ?"
		args = append(args, encryptedConfig)
	}

	query += " WHERE id = 1"

	_, err := h.db.Exec(query, args...)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Reinitialize Firebase sync after any settings change
	if input.MobileAppEnabled != nil || input.FirebaseConfig != nil || input.FirebaseProjectID != nil {
		log.Println("🔄 Reinitializing Firebase sync after settings update...")
		if err := h.firebaseSync.Initialize(); err != nil {
			log.Printf("⚠️  Warning: Failed to reinitialize Firebase: %v", err)
			// Don't fail the request, just log the warning
		} else {
			log.Println("✅ Firebase sync reinitialized successfully")
		}
	}

	// Log the action
	actionDetails := "App settings updated"
	if input.MobileAppEnabled != nil {
		actionDetails += " - Mobile app: " + strconv.FormatBool(*input.MobileAppEnabled)
	}
	if input.FirebaseConfig != nil {
		actionDetails += " - Firebase config updated"
	}
	h.logAdminAction(r, "App Settings Updated", actionDetails)

	// Return updated settings
	h.GetSettings(w, r)
}

// App Users Handlers

func (h *AppHandler) ListUsers(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(`
		SELECT id, username, description, permissions_json, firebase_uid, device_id, is_active, created_at, updated_at
		FROM app_users
		ORDER BY created_at DESC
	`)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var users []models.AppUser
	for rows.Next() {
		var user models.AppUser
		var permissionsJSON string
		var firebaseUID, deviceID sql.NullString
		
		err := rows.Scan(
			&user.ID, &user.Username, &user.Description, &permissionsJSON,
			&firebaseUID, &deviceID, &user.IsActive,
			&user.CreatedAt, &user.UpdatedAt,
		)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// Handle nullable fields
		if firebaseUID.Valid {
			user.FirebaseUID = firebaseUID.String
		}
		if deviceID.Valid {
			user.DeviceID = deviceID.String
		}

		// Parse permissions JSON
		if err := json.Unmarshal([]byte(permissionsJSON), &user.Permissions); err != nil {
			log.Printf("Error parsing permissions for user %d: %v", user.ID, err)
			user.Permissions = models.AppUserPermissions{}
		}

		users = append(users, user)
	}

	// Ensure we always return an array, even if empty
	if users == nil {
		users = []models.AppUser{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(users)
}

func (h *AppHandler) GetUser(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, err := strconv.Atoi(vars["id"])
	if err != nil {
		http.Error(w, "Invalid user ID", http.StatusBadRequest)
		return
	}

	var user models.AppUser
	var permissionsJSON string
	var firebaseUID, deviceID sql.NullString
	
	err = h.db.QueryRow(`
		SELECT id, username, description, permissions_json, firebase_uid, device_id, is_active, created_at, updated_at
		FROM app_users
		WHERE id = ?
	`, id).Scan(
		&user.ID, &user.Username, &user.Description, &permissionsJSON,
		&firebaseUID, &deviceID, &user.IsActive,
		&user.CreatedAt, &user.UpdatedAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, "User not found", http.StatusNotFound)
		} else {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
		return
	}

	// Handle nullable fields
	if firebaseUID.Valid {
		user.FirebaseUID = firebaseUID.String
	}
	if deviceID.Valid {
		user.DeviceID = deviceID.String
	}

	// Parse permissions JSON
	if err := json.Unmarshal([]byte(permissionsJSON), &user.Permissions); err != nil {
		log.Printf("Error parsing permissions: %v", err)
		user.Permissions = models.AppUserPermissions{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(user)
}

func (h *AppHandler) CreateUser(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Username    string                      `json:"username"`
		Password    string                      `json:"password"`
		Description string                      `json:"description"`
		Permissions models.AppUserPermissions   `json:"permissions"`
		DeviceID    string                      `json:"device_id"` // NEW: Device ID for this user
	}

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Validate required fields
	if input.Username == "" || input.Password == "" {
		http.Error(w, "Username and password are required", http.StatusBadRequest)
		return
	}

	// Validate password strength
	if len(input.Password) < 6 {
		http.Error(w, "Password must be at least 6 characters long", http.StatusBadRequest)
		return
	}

	// Check if username already exists
	var exists int
	err := h.db.QueryRow("SELECT COUNT(*) FROM app_users WHERE username = ?", input.Username).Scan(&exists)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if exists > 0 {
		http.Error(w, "Username already exists", http.StatusBadRequest)
		return
	}

	// Hash password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Marshal permissions to JSON
	permissionsJSON, err := json.Marshal(input.Permissions)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Create user in Firebase Authentication (if Firebase is enabled)
	var firebaseUID string
	if h.firebaseSync.IsEnabled() {
		log.Println("🔐 Creating Firebase Authentication user...")
		uid, err := h.firebaseSync.CreateFirebaseUser(input.Username, input.Password)
		if err != nil {
			log.Printf("❌ Firebase user creation failed: %v", err)
			http.Error(w, fmt.Sprintf("Failed to create Firebase user: %v", err), http.StatusInternalServerError)
			return
		}
		firebaseUID = uid
		log.Printf("✅ Firebase user created with UID: %s", firebaseUID)
	} else {
		log.Println("⚠️  Firebase not enabled - skipping Firebase user creation")
	}

	// Insert into database
	result, err := h.db.Exec(`
		INSERT INTO app_users (username, password_hash, description, permissions_json, firebase_uid, device_id, is_active)
		VALUES (?, ?, ?, ?, ?, ?, 1)
	`, input.Username, string(hashedPassword), input.Description, string(permissionsJSON), firebaseUID, input.DeviceID)

	if err != nil {
		// If database insert fails but Firebase user was created, try to clean up
		if firebaseUID != "" {
			log.Println("🧹 Cleaning up Firebase user after database error...")
			h.firebaseSync.DeleteFirebaseUser(firebaseUID)
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	id, _ := result.LastInsertId()

	// Log the action
	h.logAdminAction(r, "App User Created", "Created app user: "+input.Username)

	// Sync to Firebase if enabled and device_id is set
	if h.firebaseSync.IsEnabled() && input.DeviceID != "" {
		log.Println("🔄 Triggering initial sync for new device...")
		go h.firebaseSync.SyncAllData()
	}

	// Return created user
	var user models.AppUser
	var permissionsJSONStr string
	var fuid, did sql.NullString
	
	err = h.db.QueryRow(`
		SELECT id, username, description, permissions_json, firebase_uid, device_id, is_active, created_at, updated_at
		FROM app_users
		WHERE id = ?
	`, id).Scan(
		&user.ID, &user.Username, &user.Description, &permissionsJSONStr,
		&fuid, &did, &user.IsActive,
		&user.CreatedAt, &user.UpdatedAt,
	)

	if err == nil {
		if fuid.Valid {
			user.FirebaseUID = fuid.String
		}
		if did.Valid {
			user.DeviceID = did.String
		}
		json.Unmarshal([]byte(permissionsJSONStr), &user.Permissions)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(user)
	}
}

func (h *AppHandler) UpdateUser(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, err := strconv.Atoi(vars["id"])
	if err != nil {
		http.Error(w, "Invalid user ID", http.StatusBadRequest)
		return
	}

	var input struct {
		Username    *string                    `json:"username"`
		Password    *string                    `json:"password"`
		Description *string                    `json:"description"`
		Permissions *models.AppUserPermissions `json:"permissions"`
		DeviceID    *string                    `json:"device_id"` // NEW: Allow updating device_id
		IsActive    *bool                      `json:"is_active"`
	}

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Build update query dynamically
	query := "UPDATE app_users SET updated_at = CURRENT_TIMESTAMP"
	args := []interface{}{}

	if input.Username != nil {
		// Check if new username already exists
		var exists int
		err := h.db.QueryRow("SELECT COUNT(*) FROM app_users WHERE username = ? AND id != ?", *input.Username, id).Scan(&exists)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if exists > 0 {
			http.Error(w, "Username already exists", http.StatusBadRequest)
			return
		}
		
		query += ", username = ?"
		args = append(args, *input.Username)
	}

	if input.Password != nil && *input.Password != "" {
		// Validate password strength
		if len(*input.Password) < 6 {
			http.Error(w, "Password must be at least 6 characters long", http.StatusBadRequest)
			return
		}
		
		hashedPassword, err := bcrypt.GenerateFromPassword([]byte(*input.Password), bcrypt.DefaultCost)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		query += ", password_hash = ?"
		args = append(args, string(hashedPassword))

		// Update password in Firebase as well
		var firebaseUID sql.NullString
		h.db.QueryRow("SELECT firebase_uid FROM app_users WHERE id = ?", id).Scan(&firebaseUID)
		if firebaseUID.Valid && firebaseUID.String != "" {
			if err := h.firebaseSync.UpdateFirebasePassword(firebaseUID.String, *input.Password); err != nil {
				log.Printf("Warning: Failed to update Firebase password: %v", err)
			}
		}
	}

	if input.Description != nil {
		query += ", description = ?"
		args = append(args, *input.Description)
	}

	if input.DeviceID != nil {
		query += ", device_id = ?"
		args = append(args, *input.DeviceID)
	}

	if input.Permissions != nil {
		permissionsJSON, err := json.Marshal(input.Permissions)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		query += ", permissions_json = ?"
		args = append(args, string(permissionsJSON))
	}

	if input.IsActive != nil {
		query += ", is_active = ?"
		args = append(args, *input.IsActive)
	}

	query += " WHERE id = ?"
	args = append(args, id)

	_, err = h.db.Exec(query, args...)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Log the action
	h.logAdminAction(r, "App User Updated", "Updated app user ID: "+strconv.Itoa(id))

	// Trigger sync if device_id or permissions changed
	if (input.DeviceID != nil || input.Permissions != nil) && h.firebaseSync.IsEnabled() {
		log.Println("🔄 Triggering sync after user update...")
		go h.firebaseSync.SyncAllData()
	}

	// Return updated user
	var user models.AppUser
	var permissionsJSON string
	var firebaseUID, deviceID sql.NullString
	
	err = h.db.QueryRow(`
		SELECT id, username, description, permissions_json, firebase_uid, device_id, is_active, created_at, updated_at
		FROM app_users
		WHERE id = ?
	`, id).Scan(
		&user.ID, &user.Username, &user.Description, &permissionsJSON,
		&firebaseUID, &deviceID, &user.IsActive,
		&user.CreatedAt, &user.UpdatedAt,
	)

	if err == nil {
		if firebaseUID.Valid {
			user.FirebaseUID = firebaseUID.String
		}
		if deviceID.Valid {
			user.DeviceID = deviceID.String
		}
		json.Unmarshal([]byte(permissionsJSON), &user.Permissions)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(user)
	}
}

func (h *AppHandler) DeleteUser(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, err := strconv.Atoi(vars["id"])
	if err != nil {
		http.Error(w, "Invalid user ID", http.StatusBadRequest)
		return
	}

	// Get Firebase UID before deleting
	var firebaseUID sql.NullString
	h.db.QueryRow("SELECT firebase_uid FROM app_users WHERE id = ?", id).Scan(&firebaseUID)

	// Delete from database
	_, err = h.db.Exec("DELETE FROM app_users WHERE id = ?", id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Delete from Firebase
	if firebaseUID.Valid && firebaseUID.String != "" {
		if err := h.firebaseSync.DeleteFirebaseUser(firebaseUID.String); err != nil {
			log.Printf("Warning: Failed to delete Firebase user: %v", err)
		}
	}

	// Log the action
	h.logAdminAction(r, "App User Deleted", "Deleted app user ID: "+strconv.Itoa(id))

	w.WriteHeader(http.StatusNoContent)
}

// Sync Handler

func (h *AppHandler) SyncToFirebase(w http.ResponseWriter, r *http.Request) {
	err := h.firebaseSync.SyncAllData()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Update last sync time
	_, err = h.db.Exec(`
		UPDATE app_settings
		SET last_sync = CURRENT_TIMESTAMP
		WHERE id = 1
	`)
	if err != nil {
		log.Printf("Warning: Failed to update last sync time: %v", err)
	}

	// Log the action
	h.logAdminAction(r, "Firebase Sync", "Manually triggered Firebase sync")

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status":  "success",
		"message": "Data synchronized to Firebase successfully",
	})
}

// Helper function to log admin actions
func (h *AppHandler) logAdminAction(r *http.Request, action, details string) {
	ipAddress := r.RemoteAddr
	if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
		ipAddress = forwarded
	}

	_, err := h.db.Exec(`
		INSERT INTO admin_logs (action, details, ip_address)
		VALUES (?, ?, ?)
	`, action, details, ipAddress)

	if err != nil {
		log.Printf("Error logging admin action: %v", err)
	}
}