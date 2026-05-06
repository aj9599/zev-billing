package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"github.com/gorilla/mux"
)

// BillLayoutHandler exposes per-building customisations for the invoice's main
// page (title, accent colour, optional intro/footer text). The QR-bill page
// remains untouched to stay compliant with the Swiss QR-bill standard.
type BillLayoutHandler struct {
	db *sql.DB
}

func NewBillLayoutHandler(db *sql.DB) *BillLayoutHandler {
	return &BillLayoutHandler{db: db}
}

// Get returns the bill layout for a building or empty defaults when none exists.
func (h *BillLayoutHandler) Get(w http.ResponseWriter, r *http.Request) {
	buildingID, err := strconv.Atoi(mux.Vars(r)["building_id"])
	if err != nil {
		http.Error(w, "Invalid building_id", http.StatusBadRequest)
		return
	}

	var (
		title, intro, footer, color string
	)
	err = h.db.QueryRow(`
		SELECT COALESCE(title, ''), COALESCE(intro_text, ''),
		       COALESCE(footer_text, ''), COALESCE(primary_color, '#667EEA')
		FROM bill_layouts WHERE building_id = ?
	`, buildingID).Scan(&title, &intro, &footer, &color)

	if err != nil && err != sql.ErrNoRows {
		log.Printf("ERROR: Failed to load bill layout for building %d: %v", buildingID, err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	if color == "" {
		color = "#667EEA"
	}

	resp := map[string]interface{}{
		"building_id":   buildingID,
		"title":         title,
		"intro_text":    intro,
		"footer_text":   footer,
		"primary_color": color,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// Upsert stores or updates the bill layout for a building.
func (h *BillLayoutHandler) Upsert(w http.ResponseWriter, r *http.Request) {
	buildingID, err := strconv.Atoi(mux.Vars(r)["building_id"])
	if err != nil {
		http.Error(w, "Invalid building_id", http.StatusBadRequest)
		return
	}

	var req struct {
		Title        string `json:"title"`
		IntroText    string `json:"intro_text"`
		FooterText   string `json:"footer_text"`
		PrimaryColor string `json:"primary_color"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}
	if req.PrimaryColor == "" {
		req.PrimaryColor = "#667EEA"
	}

	_, err = h.db.Exec(`
		INSERT INTO bill_layouts (building_id, title, intro_text, footer_text, primary_color, updated_at)
		VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(building_id) DO UPDATE SET
			title = excluded.title,
			intro_text = excluded.intro_text,
			footer_text = excluded.footer_text,
			primary_color = excluded.primary_color,
			updated_at = CURRENT_TIMESTAMP
	`, buildingID, req.Title, req.IntroText, req.FooterText, req.PrimaryColor)

	if err != nil {
		log.Printf("ERROR: Failed to save bill layout for building %d: %v", buildingID, err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	resp := map[string]interface{}{
		"building_id":   buildingID,
		"title":         req.Title,
		"intro_text":    req.IntroText,
		"footer_text":   req.FooterText,
		"primary_color": req.PrimaryColor,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}
