package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"github.com/aj9599/zev-billing/backend/models"
	"github.com/gorilla/mux"
)

type BuildingHandler struct {
	db *sql.DB
}

func NewBuildingHandler(db *sql.DB) *BuildingHandler {
	return &BuildingHandler{db: db}
}

func (h *BuildingHandler) List(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(`
		SELECT id, name, address_street, address_city, address_zip, 
		       address_country, notes, COALESCE(is_group, 0), created_at, updated_at
		FROM buildings
		ORDER BY name
	`)
	if err != nil {
		log.Printf("Error listing buildings: %v", err)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]interface{}{})
		return
	}
	defer rows.Close()

	buildings := []models.Building{}
	for rows.Next() {
		var b models.Building
		err := rows.Scan(
			&b.ID, &b.Name, &b.AddressStreet, &b.AddressCity, &b.AddressZip,
			&b.AddressCountry, &b.Notes, &b.IsGroup, &b.CreatedAt, &b.UpdatedAt,
		)
		if err != nil {
			log.Printf("Error scanning building: %v", err)
			continue
		}

		if b.IsGroup {
			b.GroupBuildings = []int{}
			groupRows, err := h.db.Query("SELECT building_id FROM building_groups WHERE group_id = ?", b.ID)
			if err == nil {
				defer groupRows.Close()
				for groupRows.Next() {
					var buildingID int
					if err := groupRows.Scan(&buildingID); err == nil {
						b.GroupBuildings = append(b.GroupBuildings, buildingID)
					}
				}
			}
		} else {
			b.GroupBuildings = []int{}
		}

		buildings = append(buildings, b)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(buildings)
}

func (h *BuildingHandler) Get(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, err := strconv.Atoi(vars["id"])
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	var b models.Building
	err = h.db.QueryRow(`
		SELECT id, name, address_street, address_city, address_zip, 
		       address_country, notes, COALESCE(is_group, 0), created_at, updated_at
		FROM buildings WHERE id = ?
	`, id).Scan(
		&b.ID, &b.Name, &b.AddressStreet, &b.AddressCity, &b.AddressZip,
		&b.AddressCountry, &b.Notes, &b.IsGroup, &b.CreatedAt, &b.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		http.Error(w, "Building not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Printf("Error getting building: %v", err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	b.GroupBuildings = []int{}

	if b.IsGroup {
		rows, err := h.db.Query("SELECT building_id FROM building_groups WHERE group_id = ?", b.ID)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var buildingID int
				if err := rows.Scan(&buildingID); err == nil {
					b.GroupBuildings = append(b.GroupBuildings, buildingID)
				}
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(b)
}

func (h *BuildingHandler) Create(w http.ResponseWriter, r *http.Request) {
	var b models.Building
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		log.Printf("Error decoding building: %v", err)
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	log.Printf("Creating building: %s, is_group: %v", b.Name, b.IsGroup)

	isGroupVal := 0
	if b.IsGroup {
		isGroupVal = 1
	}

	if b.AddressCountry == "" {
		b.AddressCountry = "Switzerland"
	}

	result, err := h.db.Exec(`
		INSERT INTO buildings (
			name, address_street, address_city, address_zip, 
			address_country, notes, is_group
		) VALUES (?, ?, ?, ?, ?, ?, ?)
	`, b.Name, b.AddressStreet, b.AddressCity, b.AddressZip,
		b.AddressCountry, b.Notes, isGroupVal)

	if err != nil {
		log.Printf("Error creating building: %v", err)
		http.Error(w, "Failed to create building", http.StatusInternalServerError)
		return
	}

	id, _ := result.LastInsertId()
	b.ID = int(id)
	b.IsGroup = isGroupVal == 1

	if b.GroupBuildings == nil {
		b.GroupBuildings = []int{}
	}

	if b.IsGroup && len(b.GroupBuildings) > 0 {
		for _, buildingID := range b.GroupBuildings {
			_, err := h.db.Exec("INSERT INTO building_groups (group_id, building_id) VALUES (?, ?)", b.ID, buildingID)
			if err != nil {
				log.Printf("Error adding building to group: %v", err)
			}
		}
	}

	log.Printf("Successfully created building ID: %d", b.ID)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(b)
}

func (h *BuildingHandler) Update(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, err := strconv.Atoi(vars["id"])
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	var b models.Building
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		log.Printf("Error decoding building: %v", err)
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	isGroupVal := 0
	if b.IsGroup {
		isGroupVal = 1
	}

	_, err = h.db.Exec(`
		UPDATE buildings SET
			name = ?, address_street = ?, address_city = ?, address_zip = ?,
			address_country = ?, notes = ?, is_group = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, b.Name, b.AddressStreet, b.AddressCity, b.AddressZip,
		b.AddressCountry, b.Notes, isGroupVal, id)

	if err != nil {
		log.Printf("Error updating building: %v", err)
		http.Error(w, "Failed to update building", http.StatusInternalServerError)
		return
	}

	if b.IsGroup {
		h.db.Exec("DELETE FROM building_groups WHERE group_id = ?", id)
		if b.GroupBuildings != nil {
			for _, buildingID := range b.GroupBuildings {
				h.db.Exec("INSERT INTO building_groups (group_id, building_id) VALUES (?, ?)", id, buildingID)
			}
		}
	} else {
		h.db.Exec("DELETE FROM building_groups WHERE group_id = ?", id)
	}

	b.ID = id
	b.IsGroup = isGroupVal == 1
	if b.GroupBuildings == nil {
		b.GroupBuildings = []int{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(b)
}

func (h *BuildingHandler) Delete(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, err := strconv.Atoi(vars["id"])
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	h.db.Exec("DELETE FROM building_groups WHERE group_id = ? OR building_id = ?", id, id)

	_, err = h.db.Exec("DELETE FROM buildings WHERE id = ?", id)
	if err != nil {
		log.Printf("Error deleting building: %v", err)
		http.Error(w, "Failed to delete building", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}