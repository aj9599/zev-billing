package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"github.com/aj9599/zev-billing/backend/models"
	"github.com/aj9599/zev-billing/backend/services"
	"github.com/gorilla/mux"
	"golang.org/x/crypto/bcrypt"
)

type AppHandler struct {
	db            *sql.DB
	firebaseSync  *services.FirebaseSync
}

func NewAppHandler(db *sql.DB, firebaseSync *services.FirebaseSync) *AppHandler {
	return &AppHandler{
		db:           db,
		firebaseSync: firebaseSync,
	}
}

// App Settings Handlers

func (h *AppHandler) GetSettings(w http.ResponseWriter, r *http.Request) {
	var settings models.AppSettings
	err := h.db.QueryRow(`
		SELECT mobile_app_enabled, firebase_project_id, firebase_config, last_sync
		FROM app_settings
		WHERE id = 1
	`).Scan(&settings.MobileAppEnabled, &settings.FirebaseProjectID, &settings.FirebaseConfig, &settings.LastSync)

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
			}
		} else {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(settings)
}

func (h *AppHandler) UpdateSettings(w http.ResponseWriter, r *http.Request) {
	var settings models.AppSettings
	if err := json.NewDecoder(r.Body).Decode(&settings); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	_, err := h.db.Exec(`
		UPDATE app_settings
		SET mobile_app_enabled = ?, firebase_project_id = ?, firebase_config = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = 1
	`, settings.MobileAppEnabled, settings.FirebaseProjectID, settings.FirebaseConfig)

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Log the action
	h.logAdminAction(r, "App Settings Updated", "Mobile app enabled: "+strconv.FormatBool(settings.MobileAppEnabled))

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
		err := rows.Scan(
			&user.ID, &user.Username, &user.Description, &permissionsJSON,
			&user.FirebaseUID, &user.DeviceID, &user.IsActive,
			&user.CreatedAt, &user.UpdatedAt,
		)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// Parse permissions JSON
		if err := json.Unmarshal([]byte(permissionsJSON), &user.Permissions); err != nil {
			log.Printf("Error parsing permissions for user %d: %v", user.ID, err)
			user.Permissions = models.AppUserPermissions{}
		}

		users = append(users, user)
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
	err = h.db.QueryRow(`
		SELECT id, username, description, permissions_json, firebase_uid, device_id, is_active, created_at, updated_at
		FROM app_users
		WHERE id = ?
	`, id).Scan(
		&user.ID, &user.Username, &user.Description, &permissionsJSON,
		&user.FirebaseUID, &user.DeviceID, &user.IsActive,
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

	// Create user in Firebase Authentication
	firebaseUID, err := h.firebaseSync.CreateFirebaseUser(input.Username, input.Password)
	if err != nil {
		log.Printf("Warning: Failed to create Firebase user: %v", err)
		// Continue anyway - we'll sync later
		firebaseUID = ""
	}

	// Insert into database
	result, err := h.db.Exec(`
		INSERT INTO app_users (username, password_hash, description, permissions_json, firebase_uid, is_active)
		VALUES (?, ?, ?, ?, ?, 1)
	`, input.Username, string(hashedPassword), input.Description, string(permissionsJSON), firebaseUID)

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	id, _ := result.LastInsertId()

	// Log the action
	h.logAdminAction(r, "App User Created", "Created app user: "+input.Username)

	// Return created user
	var user models.AppUser
	err = h.db.QueryRow(`
		SELECT id, username, description, permissions_json, firebase_uid, device_id, is_active, created_at, updated_at
		FROM app_users
		WHERE id = ?
	`, id).Scan(
		&user.ID, &user.Username, &user.Description, &permissionsJSON,
		&user.FirebaseUID, &user.DeviceID, &user.IsActive,
		&user.CreatedAt, &user.UpdatedAt,
	)

	if err == nil {
		json.Unmarshal([]byte(permissionsJSON), &user.Permissions)
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
		query += ", username = ?"
		args = append(args, *input.Username)
	}

	if input.Password != nil && *input.Password != "" {
		hashedPassword, err := bcrypt.GenerateFromPassword([]byte(*input.Password), bcrypt.DefaultCost)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		query += ", password_hash = ?"
		args = append(args, string(hashedPassword))

		// Update password in Firebase as well
		var firebaseUID string
		h.db.QueryRow("SELECT firebase_uid FROM app_users WHERE id = ?", id).Scan(&firebaseUID)
		if firebaseUID != "" {
			if err := h.firebaseSync.UpdateFirebasePassword(firebaseUID, *input.Password); err != nil {
				log.Printf("Warning: Failed to update Firebase password: %v", err)
			}
		}
	}

	if input.Description != nil {
		query += ", description = ?"
		args = append(args, *input.Description)
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

	// Return updated user
	var user models.AppUser
	var permissionsJSON string
	err = h.db.QueryRow(`
		SELECT id, username, description, permissions_json, firebase_uid, device_id, is_active, created_at, updated_at
		FROM app_users
		WHERE id = ?
	`, id).Scan(
		&user.ID, &user.Username, &user.Description, &permissionsJSON,
		&user.FirebaseUID, &user.DeviceID, &user.IsActive,
		&user.CreatedAt, &user.UpdatedAt,
	)

	if err == nil {
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
	var firebaseUID string
	h.db.QueryRow("SELECT firebase_uid FROM app_users WHERE id = ?", id).Scan(&firebaseUID)

	// Delete from database
	_, err = h.db.Exec("DELETE FROM app_users WHERE id = ?", id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Delete from Firebase
	if firebaseUID != "" {
		if err := h.firebaseSync.DeleteFirebaseUser(firebaseUID); err != nil {
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