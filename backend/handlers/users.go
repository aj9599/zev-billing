package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/aj9599/zev-billing/backend/models"
	"github.com/gorilla/mux"
)

type UserHandler struct {
	db *sql.DB
}

func NewUserHandler(db *sql.DB) *UserHandler {
	return &UserHandler{db: db}
}

func (h *UserHandler) List(w http.ResponseWriter, r *http.Request) {
	buildingID := r.URL.Query().Get("building_id")
	includeInactive := r.URL.Query().Get("include_inactive") == "true"

	query := `
		SELECT id, first_name, last_name, email, phone, 
		       address_street, address_city, address_zip, address_country,
		       bank_name, bank_iban, bank_account_holder, charger_ids, 
		       notes, building_id, apartment_unit, user_type, managed_buildings, 
		       COALESCE(is_active, 1), created_at, updated_at
		FROM users
	`

	var conditions []string
	var args []interface{}

	if buildingID != "" {
		conditions = append(conditions, "building_id = ?")
		args = append(args, buildingID)
	}

	if !includeInactive {
		conditions = append(conditions, "COALESCE(is_active, 1) = 1")
	}

	if len(conditions) > 0 {
		query += " WHERE " + strings.Join(conditions, " AND ")
	}

	query += " ORDER BY last_name, first_name"

	rows, err := h.db.Query(query, args...)
	if err != nil {
		log.Printf("Error listing users: %v", err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	users := []models.User{}
	for rows.Next() {
		var u models.User
		var userType sql.NullString
		var managedBuildings sql.NullString
		var apartmentUnit sql.NullString
		var isActive sql.NullInt64

		err := rows.Scan(
			&u.ID, &u.FirstName, &u.LastName, &u.Email, &u.Phone,
			&u.AddressStreet, &u.AddressCity, &u.AddressZip, &u.AddressCountry,
			&u.BankName, &u.BankIBAN, &u.BankAccountHolder, &u.ChargerIDs,
			&u.Notes, &u.BuildingID, &apartmentUnit, &userType, &managedBuildings, 
			&isActive, &u.CreatedAt, &u.UpdatedAt,
		)
		if err != nil {
			log.Printf("Error scanning user: %v", err)
			continue
		}

		if userType.Valid {
			u.UserType = userType.String
		} else {
			u.UserType = "regular"
		}

		if managedBuildings.Valid {
			u.ManagedBuildings = managedBuildings.String
		}

		if apartmentUnit.Valid {
			u.ApartmentUnit = apartmentUnit.String
		}

		u.IsActive = isActive.Valid && isActive.Int64 == 1

		users = append(users, u)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(users)
}

func (h *UserHandler) Get(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, err := strconv.Atoi(vars["id"])
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	var u models.User
	var userType sql.NullString
	var managedBuildings sql.NullString
	var apartmentUnit sql.NullString
	var isActive sql.NullInt64

	err = h.db.QueryRow(`
		SELECT id, first_name, last_name, email, phone, 
		       address_street, address_city, address_zip, address_country,
		       bank_name, bank_iban, bank_account_holder, charger_ids, 
		       notes, building_id, apartment_unit, user_type, managed_buildings, 
		       COALESCE(is_active, 1), created_at, updated_at
		FROM users WHERE id = ?
	`, id).Scan(
		&u.ID, &u.FirstName, &u.LastName, &u.Email, &u.Phone,
		&u.AddressStreet, &u.AddressCity, &u.AddressZip, &u.AddressCountry,
		&u.BankName, &u.BankIBAN, &u.BankAccountHolder, &u.ChargerIDs,
		&u.Notes, &u.BuildingID, &apartmentUnit, &userType, &managedBuildings, 
		&isActive, &u.CreatedAt, &u.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Printf("Error getting user: %v", err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	if userType.Valid {
		u.UserType = userType.String
	} else {
		u.UserType = "regular"
	}

	if managedBuildings.Valid {
		u.ManagedBuildings = managedBuildings.String
	}

	if apartmentUnit.Valid {
		u.ApartmentUnit = apartmentUnit.String
	}

	u.IsActive = isActive.Valid && isActive.Int64 == 1

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(u)
}

func (h *UserHandler) Create(w http.ResponseWriter, r *http.Request) {
	var u models.User
	if err := json.NewDecoder(r.Body).Decode(&u); err != nil {
		log.Printf("Error decoding user: %v", err)
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	if u.UserType == "" {
		u.UserType = "regular"
	}

	// Default to active if not specified
	isActiveVal := 1
	if !u.IsActive {
		isActiveVal = 0
	}

	// Check if email already exists with the same user_type
	var existingUserID int
	err := h.db.QueryRow(`
		SELECT id FROM users 
		WHERE email = ? AND user_type = ?
	`, u.Email, u.UserType).Scan(&existingUserID)
	
	if err != sql.ErrNoRows {
		if err == nil {
			http.Error(w, "A user with this email and user type already exists", http.StatusBadRequest)
			return
		}
		log.Printf("Error checking email uniqueness: %v", err)
	}

	// Check if apartment is already occupied (if apartment_unit is provided)
	if u.ApartmentUnit != "" && u.BuildingID != nil {
		var existingUserID int
		err := h.db.QueryRow(`
			SELECT id FROM users 
			WHERE building_id = ? AND apartment_unit = ? AND is_active = 1 AND id != ?
		`, u.BuildingID, u.ApartmentUnit, 0).Scan(&existingUserID)
		
		if err != sql.ErrNoRows {
			if err == nil {
				http.Error(w, "This apartment is already occupied by an active user", http.StatusBadRequest)
				return
			}
			log.Printf("Error checking apartment occupancy: %v", err)
		}
	}

	result, err := h.db.Exec(`
		INSERT INTO users (
			first_name, last_name, email, phone,
			address_street, address_city, address_zip, address_country,
			bank_name, bank_iban, bank_account_holder, charger_ids,
			notes, building_id, apartment_unit, user_type, managed_buildings, is_active
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, u.FirstName, u.LastName, u.Email, u.Phone,
		u.AddressStreet, u.AddressCity, u.AddressZip, u.AddressCountry,
		u.BankName, u.BankIBAN, u.BankAccountHolder, u.ChargerIDs,
		u.Notes, u.BuildingID, u.ApartmentUnit, u.UserType, u.ManagedBuildings, isActiveVal)

	if err != nil {
		log.Printf("Error creating user: %v", err)
		http.Error(w, "Failed to create user", http.StatusInternalServerError)
		return
	}

	id, _ := result.LastInsertId()
	u.ID = int(id)
	u.IsActive = isActiveVal == 1

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(u)
}

func (h *UserHandler) Update(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, err := strconv.Atoi(vars["id"])
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	var u models.User
	if err := json.NewDecoder(r.Body).Decode(&u); err != nil {
		log.Printf("Error decoding user update: %v", err)
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	if u.UserType == "" {
		u.UserType = "regular"
	}

	isActiveVal := 0
	if u.IsActive {
		isActiveVal = 1
	}

	// Check if email already exists with the same user_type (excluding current user)
	var existingUserID int
	err = h.db.QueryRow(`
		SELECT id FROM users 
		WHERE email = ? AND user_type = ? AND id != ?
	`, u.Email, u.UserType, id).Scan(&existingUserID)
	
	if err != sql.ErrNoRows {
		if err == nil {
			http.Error(w, "A user with this email and user type already exists", http.StatusBadRequest)
			return
		}
		log.Printf("Error checking email uniqueness: %v", err)
	}

	// Check if apartment is already occupied (if apartment_unit is provided)
	if u.ApartmentUnit != "" && u.BuildingID != nil {
		var existingUserID int
		err := h.db.QueryRow(`
			SELECT id FROM users 
			WHERE building_id = ? AND apartment_unit = ? AND is_active = 1 AND id != ?
		`, u.BuildingID, u.ApartmentUnit, id).Scan(&existingUserID)
		
		if err != sql.ErrNoRows {
			if err == nil {
				http.Error(w, "This apartment is already occupied by an active user", http.StatusBadRequest)
				return
			}
			log.Printf("Error checking apartment occupancy: %v", err)
		}
	}

	_, err = h.db.Exec(`
		UPDATE users SET
			first_name = ?, last_name = ?, email = ?, phone = ?,
			address_street = ?, address_city = ?, address_zip = ?, address_country = ?,
			bank_name = ?, bank_iban = ?, bank_account_holder = ?, charger_ids = ?,
			notes = ?, building_id = ?, apartment_unit = ?, user_type = ?, 
			managed_buildings = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, u.FirstName, u.LastName, u.Email, u.Phone,
		u.AddressStreet, u.AddressCity, u.AddressZip, u.AddressCountry,
		u.BankName, u.BankIBAN, u.BankAccountHolder, u.ChargerIDs,
		u.Notes, u.BuildingID, u.ApartmentUnit, u.UserType, 
		u.ManagedBuildings, isActiveVal, id)

	if err != nil {
		log.Printf("Error updating user ID %d: %v", id, err)
		http.Error(w, "Failed to update user: "+err.Error(), http.StatusInternalServerError)
		return
	}

	u.ID = id
	u.IsActive = isActiveVal == 1

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(u)
}

func (h *UserHandler) Delete(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, err := strconv.Atoi(vars["id"])
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	_, err = h.db.Exec("DELETE FROM users WHERE id = ?", id)
	if err != nil {
		log.Printf("Error deleting user: %v", err)
		http.Error(w, "Failed to delete user", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// Get administration users for specific buildings
func (h *UserHandler) GetAdminUsersForBuildings(w http.ResponseWriter, r *http.Request) {
	buildingIDsParam := r.URL.Query().Get("building_ids")
	if buildingIDsParam == "" {
		json.NewEncoder(w).Encode([]models.User{})
		return
	}

	// Parse building IDs
	buildingIDStrs := strings.Split(buildingIDsParam, ",")
	buildingIDs := make([]int, 0)
	for _, idStr := range buildingIDStrs {
		if id, err := strconv.Atoi(strings.TrimSpace(idStr)); err == nil {
			buildingIDs = append(buildingIDs, id)
		}
	}

	if len(buildingIDs) == 0 {
		json.NewEncoder(w).Encode([]models.User{})
		return
	}

	// Get all administration users
	rows, err := h.db.Query(`
		SELECT id, first_name, last_name, email, phone,
		       address_street, address_city, address_zip, address_country,
		       bank_name, bank_iban, bank_account_holder,
		       managed_buildings
		FROM users
		WHERE user_type = 'administration' AND COALESCE(is_active, 1) = 1
	`)

	if err != nil {
		log.Printf("Error getting admin users: %v", err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	matchingUsers := []models.User{}
	for rows.Next() {
		var u models.User
		var managedBuildings sql.NullString

		err := rows.Scan(
			&u.ID, &u.FirstName, &u.LastName, &u.Email, &u.Phone,
			&u.AddressStreet, &u.AddressCity, &u.AddressZip, &u.AddressCountry,
			&u.BankName, &u.BankIBAN, &u.BankAccountHolder, &managedBuildings,
		)
		if err != nil {
			log.Printf("Error scanning admin user: %v", err)
			continue
		}

		if managedBuildings.Valid {
			u.ManagedBuildings = managedBuildings.String

			// Parse managed buildings JSON array
			var managedBuildingIDs []int
			if err := json.Unmarshal([]byte(u.ManagedBuildings), &managedBuildingIDs); err == nil {
				// Check if any of the requested buildings match
				for _, requestedID := range buildingIDs {
					for _, managedID := range managedBuildingIDs {
						if requestedID == managedID {
							matchingUsers = append(matchingUsers, u)
							goto nextUser
						}
					}
				}
			}
		}
	nextUser:
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(matchingUsers)
}