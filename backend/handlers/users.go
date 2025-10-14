package handlers

import (
	"database/sql"
	"encoding/json"
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

	query := `
		SELECT id, first_name, last_name, email, phone, 
		       address_street, address_city, address_zip, address_country,
		       bank_name, bank_iban, bank_account_holder, charger_ids, 
		       notes, building_id, user_type, managed_buildings, created_at, updated_at
		FROM users
	`

	var rows *sql.Rows
	var err error

	if buildingID != "" {
		query += " WHERE building_id = ?"
		rows, err = h.db.Query(query, buildingID)
	} else {
		rows, err = h.db.Query(query)
	}

	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	users := []models.User{}
	for rows.Next() {
		var u models.User
		var userType sql.NullString
		var managedBuildings sql.NullString

		err := rows.Scan(
			&u.ID, &u.FirstName, &u.LastName, &u.Email, &u.Phone,
			&u.AddressStreet, &u.AddressCity, &u.AddressZip, &u.AddressCountry,
			&u.BankName, &u.BankIBAN, &u.BankAccountHolder, &u.ChargerIDs,
			&u.Notes, &u.BuildingID, &userType, &managedBuildings, &u.CreatedAt, &u.UpdatedAt,
		)
		if err != nil {
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

	err = h.db.QueryRow(`
		SELECT id, first_name, last_name, email, phone, 
		       address_street, address_city, address_zip, address_country,
		       bank_name, bank_iban, bank_account_holder, charger_ids, 
		       notes, building_id, user_type, managed_buildings, created_at, updated_at
		FROM users WHERE id = ?
	`, id).Scan(
		&u.ID, &u.FirstName, &u.LastName, &u.Email, &u.Phone,
		&u.AddressStreet, &u.AddressCity, &u.AddressZip, &u.AddressCountry,
		&u.BankName, &u.BankIBAN, &u.BankAccountHolder, &u.ChargerIDs,
		&u.Notes, &u.BuildingID, &userType, &managedBuildings, &u.CreatedAt, &u.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}
	if err != nil {
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

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(u)
}

func (h *UserHandler) Create(w http.ResponseWriter, r *http.Request) {
	var u models.User
	if err := json.NewDecoder(r.Body).Decode(&u); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	if u.UserType == "" {
		u.UserType = "regular"
	}

	result, err := h.db.Exec(`
		INSERT INTO users (
			first_name, last_name, email, phone,
			address_street, address_city, address_zip, address_country,
			bank_name, bank_iban, bank_account_holder, charger_ids,
			notes, building_id, user_type, managed_buildings
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, u.FirstName, u.LastName, u.Email, u.Phone,
		u.AddressStreet, u.AddressCity, u.AddressZip, u.AddressCountry,
		u.BankName, u.BankIBAN, u.BankAccountHolder, u.ChargerIDs,
		u.Notes, u.BuildingID, u.UserType, u.ManagedBuildings)

	if err != nil {
		http.Error(w, "Failed to create user", http.StatusInternalServerError)
		return
	}

	id, _ := result.LastInsertId()
	u.ID = int(id)

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
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	if u.UserType == "" {
		u.UserType = "regular"
	}

	_, err = h.db.Exec(`
		UPDATE users SET
			first_name = ?, last_name = ?, email = ?, phone = ?,
			address_street = ?, address_city = ?, address_zip = ?, address_country = ?,
			bank_name = ?, bank_iban = ?, bank_account_holder = ?, charger_ids = ?,
			notes = ?, building_id = ?, user_type = ?, managed_buildings = ?, 
			updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, u.FirstName, u.LastName, u.Email, u.Phone,
		u.AddressStreet, u.AddressCity, u.AddressZip, u.AddressCountry,
		u.BankName, u.BankIBAN, u.BankAccountHolder, u.ChargerIDs,
		u.Notes, u.BuildingID, u.UserType, u.ManagedBuildings, id)

	if err != nil {
		http.Error(w, "Failed to update user", http.StatusInternalServerError)
		return
	}

	u.ID = id
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
		http.Error(w, "Failed to delete user", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// NEW: Get administration users for specific buildings
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
		WHERE user_type = 'administration'
	`)

	if err != nil {
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