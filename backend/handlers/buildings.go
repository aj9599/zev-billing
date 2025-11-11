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
		       address_country, notes, COALESCE(is_group, 0), 
		       COALESCE(has_apartments, 0), COALESCE(floors_config, ''), 
		       COALESCE(group_buildings, ''), 
		       created_at, updated_at
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
		var floorsConfigStr string
		var groupBuildingsStr string

		err := rows.Scan(
			&b.ID, &b.Name, &b.AddressStreet, &b.AddressCity, &b.AddressZip,
			&b.AddressCountry, &b.Notes, &b.IsGroup, &b.HasApartments, 
			&floorsConfigStr, &groupBuildingsStr, &b.CreatedAt, &b.UpdatedAt,
		)
		if err != nil {
			log.Printf("Error scanning building: %v", err)
			continue
		}

		// Parse group_buildings from JSON column first (faster)
		b.GroupBuildings = []int{}
		if b.IsGroup && groupBuildingsStr != "" {
			if err := json.Unmarshal([]byte(groupBuildingsStr), &b.GroupBuildings); err != nil {
				log.Printf("Error parsing group_buildings JSON for building %d: %v", b.ID, err)
				// Fall back to building_groups table if JSON parse fails
				groupRows, err := h.db.Query("SELECT building_id FROM building_groups WHERE group_id = ?", b.ID)
				if err == nil {
					for groupRows.Next() {
						var buildingID int
						if err := groupRows.Scan(&buildingID); err == nil {
							b.GroupBuildings = append(b.GroupBuildings, buildingID)
						}
					}
					groupRows.Close()
				}
			}
		}

		// Parse floors configuration
		if floorsConfigStr != "" && b.HasApartments {
			var floorsConfig []models.FloorConfig
			if err := json.Unmarshal([]byte(floorsConfigStr), &floorsConfig); err == nil {
				b.FloorsConfig = floorsConfig
			} else {
				log.Printf("Error parsing floors config for building %d: %v", b.ID, err)
				b.FloorsConfig = []models.FloorConfig{}
			}
		} else {
			b.FloorsConfig = []models.FloorConfig{}
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
	var floorsConfigStr string
	var groupBuildingsStr string

	err = h.db.QueryRow(`
		SELECT id, name, address_street, address_city, address_zip, 
		       address_country, notes, COALESCE(is_group, 0), 
		       COALESCE(has_apartments, 0), COALESCE(floors_config, ''), 
		       COALESCE(group_buildings, ''),
		       created_at, updated_at
		FROM buildings WHERE id = ?
	`, id).Scan(
		&b.ID, &b.Name, &b.AddressStreet, &b.AddressCity, &b.AddressZip,
		&b.AddressCountry, &b.Notes, &b.IsGroup, &b.HasApartments,
		&floorsConfigStr, &groupBuildingsStr, &b.CreatedAt, &b.UpdatedAt,
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

	// Parse floors configuration
	if floorsConfigStr != "" && b.HasApartments {
		var floorsConfig []models.FloorConfig
		if err := json.Unmarshal([]byte(floorsConfigStr), &floorsConfig); err == nil {
			b.FloorsConfig = floorsConfig
		} else {
			log.Printf("Error parsing floors config: %v", err)
			b.FloorsConfig = []models.FloorConfig{}
		}
	} else {
		b.FloorsConfig = []models.FloorConfig{}
	}

	b.GroupBuildings = []int{}

	// Parse group_buildings from JSON column first (faster)
	if b.IsGroup && groupBuildingsStr != "" {
		if err := json.Unmarshal([]byte(groupBuildingsStr), &b.GroupBuildings); err != nil {
			log.Printf("Error parsing group_buildings JSON: %v", err)
			// Fall back to building_groups table if JSON parse fails
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

	log.Printf("Creating building: %s, is_group: %v, has_apartments: %v", b.Name, b.IsGroup, b.HasApartments)

	isGroupVal := 0
	if b.IsGroup {
		isGroupVal = 1
	}

	hasApartmentsVal := 0
	if b.HasApartments {
		hasApartmentsVal = 1
	}

	if b.AddressCountry == "" {
		b.AddressCountry = "Switzerland"
	}

	// Serialize floors configuration
	var floorsConfigStr string
	if b.HasApartments && len(b.FloorsConfig) > 0 {
		floorsJSON, err := json.Marshal(b.FloorsConfig)
		if err != nil {
			log.Printf("Error marshaling floors config: %v", err)
		} else {
			floorsConfigStr = string(floorsJSON)
		}
	}

	var groupBuildingsJSON string
	if b.IsGroup && len(b.GroupBuildings) > 0 {
		jsonBytes, err := json.Marshal(b.GroupBuildings)
		if err != nil {
			log.Printf("Error marshaling group_buildings: %v", err)
		} else {
			groupBuildingsJSON = string(jsonBytes)
		}
	}

	result, err := h.db.Exec(`
		INSERT INTO buildings (
			name, address_street, address_city, address_zip, 
			address_country, notes, is_group, has_apartments, floors_config, group_buildings
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, b.Name, b.AddressStreet, b.AddressCity, b.AddressZip,
		b.AddressCountry, b.Notes, isGroupVal, hasApartmentsVal, floorsConfigStr, groupBuildingsJSON)

	if err != nil {
		log.Printf("Error creating building: %v", err)
		http.Error(w, "Failed to create building", http.StatusInternalServerError)
		return
	}

	id, _ := result.LastInsertId()
	b.ID = int(id)
	b.IsGroup = isGroupVal == 1
	b.HasApartments = hasApartmentsVal == 1

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

	hasApartmentsVal := 0
	if b.HasApartments {
		hasApartmentsVal = 1
	}

	// Serialize floors configuration
	var floorsConfigStr string
	if b.HasApartments && len(b.FloorsConfig) > 0 {
		floorsJSON, err := json.Marshal(b.FloorsConfig)
		if err != nil {
			log.Printf("Error marshaling floors config: %v", err)
		} else {
			floorsConfigStr = string(floorsJSON)
		}
	}

	var groupBuildingsJSON string
	if b.IsGroup && len(b.GroupBuildings) > 0 {
		jsonBytes, err := json.Marshal(b.GroupBuildings)
		if err != nil {
			log.Printf("Error marshaling group_buildings: %v", err)
		} else {
			groupBuildingsJSON = string(jsonBytes)
		}
	}

	_, err = h.db.Exec(`
		UPDATE buildings SET
			name = ?, address_street = ?, address_city = ?, address_zip = ?,
			address_country = ?, notes = ?, is_group = ?, has_apartments = ?, 
			floors_config = ?, group_buildings = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, b.Name, b.AddressStreet, b.AddressCity, b.AddressZip,
		b.AddressCountry, b.Notes, isGroupVal, hasApartmentsVal, 
		floorsConfigStr, groupBuildingsJSON, id)

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
	b.HasApartments = hasApartmentsVal == 1
	if b.GroupBuildings == nil {
		b.GroupBuildings = []int{}
	}
	if b.FloorsConfig == nil {
		b.FloorsConfig = []models.FloorConfig{}
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

	// Delete building group associations first
	_, err = h.db.Exec("DELETE FROM building_groups WHERE group_id = ? OR building_id = ?", id, id)
	if err != nil {
		log.Printf("Error deleting building group associations: %v", err)
	}

	// Delete the building
	_, err = h.db.Exec("DELETE FROM buildings WHERE id = ?", id)
	if err != nil {
		log.Printf("Error deleting building: %v", err)
		http.Error(w, "Failed to delete building", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}