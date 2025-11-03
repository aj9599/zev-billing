package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
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

// IMPROVED: Get administration users for specific buildings (including complex admins)
func (h *UserHandler) GetAdminUsersForBuildings(w http.ResponseWriter, r *http.Request) {
	buildingIDsParam := r.URL.Query().Get("building_ids")
	if buildingIDsParam == "" {
		json.NewEncoder(w).Encode([]models.User{})
		return
	}

	log.Printf("GetAdminUsersForBuildings called with building_ids: %s", buildingIDsParam)

	// Parse building IDs
	buildingIDStrs := strings.Split(buildingIDsParam, ",")
	requestedBuildingIDs := make([]int, 0)
	for _, idStr := range buildingIDStrs {
		if id, err := strconv.Atoi(strings.TrimSpace(idStr)); err == nil {
			requestedBuildingIDs = append(requestedBuildingIDs, id)
		}
	}

	if len(requestedBuildingIDs) == 0 {
		json.NewEncoder(w).Encode([]models.User{})
		return
	}

	log.Printf("Parsed %d building IDs: %v", len(requestedBuildingIDs), requestedBuildingIDs)

	// STEP 1: Check if any of these buildings belong to a complex (building group)
	// We need to find all complexes that contain any of the requested buildings
	allRelevantBuildingIDs := make(map[int]bool)
	for _, bid := range requestedBuildingIDs {
		allRelevantBuildingIDs[bid] = true
	}

	// Query building_groups to find complexes that contain these buildings
	placeholders := make([]string, len(requestedBuildingIDs))
	args := make([]interface{}, len(requestedBuildingIDs))
	for i, id := range requestedBuildingIDs {
		placeholders[i] = "?"
		args[i] = id
	}

	complexQuery := fmt.Sprintf(`
		SELECT DISTINCT group_id FROM building_groups 
		WHERE building_id IN (%s)
	`, strings.Join(placeholders, ","))

	log.Printf("Checking for complexes with query: %s, args: %v", complexQuery, args)

	rows, err := h.db.Query(complexQuery, args...)
	if err != nil {
		log.Printf("Error querying building groups: %v", err)
	} else {
		defer rows.Close()
		complexIDs := []int{}
		for rows.Next() {
			var groupID int
			if err := rows.Scan(&groupID); err == nil {
				complexIDs = append(complexIDs, groupID)
				allRelevantBuildingIDs[groupID] = true
			}
		}
		if len(complexIDs) > 0 {
			log.Printf("Found %d complex(es) containing these buildings: %v", len(complexIDs), complexIDs)
		} else {
			log.Printf("No complexes found for these buildings")
		}
	}

	log.Printf("Total relevant building IDs (including complexes): %v", allRelevantBuildingIDs)

	// STEP 2: Get all administration users
	adminRows, err := h.db.Query(`
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
	defer adminRows.Close()

	matchingUsers := []models.User{}
	adminCount := 0

	for adminRows.Next() {
		var u models.User
		var managedBuildings sql.NullString

		err := adminRows.Scan(
			&u.ID, &u.FirstName, &u.LastName, &u.Email, &u.Phone,
			&u.AddressStreet, &u.AddressCity, &u.AddressZip, &u.AddressCountry,
			&u.BankName, &u.BankIBAN, &u.BankAccountHolder, &managedBuildings,
		)
		if err != nil {
			log.Printf("Error scanning admin user: %v", err)
			continue
		}

		adminCount++
		u.UserType = "administration"

		if managedBuildings.Valid && managedBuildings.String != "" {
			u.ManagedBuildings = managedBuildings.String

			// Parse managed buildings JSON array
			var managedBuildingIDs []int
			if err := json.Unmarshal([]byte(u.ManagedBuildings), &managedBuildingIDs); err != nil {
				log.Printf("Error parsing managed_buildings JSON for user %d: %v", u.ID, err)
				continue
			}

			// Check if any of the managed buildings match our relevant building IDs
			// (includes both requested buildings AND their parent complexes)
			for _, managedID := range managedBuildingIDs {
				if allRelevantBuildingIDs[managedID] {
					log.Printf("✓ Admin user %s %s (ID: %d) manages building/complex %d", 
						u.FirstName, u.LastName, u.ID, managedID)
					matchingUsers = append(matchingUsers, u)
					break
				}
			}
		} else {
			log.Printf("Admin user %s %s (ID: %d) has no managed buildings", u.FirstName, u.LastName, u.ID)
		}
	}

	log.Printf("Checked %d admin users, found %d matching", adminCount, len(matchingUsers))

	if len(matchingUsers) > 0 {
		log.Printf("Returning %d admin user(s) with banking details", len(matchingUsers))
		for _, u := range matchingUsers {
			log.Printf("  - %s %s (%s), IBAN: %s", u.FirstName, u.LastName, u.Email, 
				func() string {
					if u.BankIBAN != "" {
						return "present"
					}
					return "missing"
				}())
		}
	} else {
		log.Printf("No matching admin users found for buildings: %v", requestedBuildingIDs)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(matchingUsers)
}