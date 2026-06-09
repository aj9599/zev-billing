package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/aj9599/zev-billing/backend/services"
)

type LicenseHandler struct {
	ls *services.LicenseService
}

func NewLicenseHandler(ls *services.LicenseService) *LicenseHandler {
	return &LicenseHandler{ls: ls}
}

// GetStatus returns the current license/trial status, limits and usage.
func (h *LicenseHandler) GetStatus(w http.ResponseWriter, r *http.Request) {
	h.writeJSON(w, http.StatusOK, h.ls.Status())
}

// Activate validates and stores a license key, then returns the new status.
func (h *LicenseHandler) Activate(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Key string `json:"key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}
	if err := h.ls.Activate(req.Key); err != nil {
		h.writeJSON(w, http.StatusBadRequest, map[string]string{
			"error":   "invalid_license",
			"message": err.Error(),
		})
		return
	}
	h.writeJSON(w, http.StatusOK, h.ls.Status())
}

// Deactivate removes the stored license key and returns the new status.
func (h *LicenseHandler) Deactivate(w http.ResponseWriter, r *http.Request) {
	if err := h.ls.Deactivate(); err != nil {
		http.Error(w, "Failed to remove license", http.StatusInternalServerError)
		return
	}
	h.writeJSON(w, http.StatusOK, h.ls.Status())
}

func (h *LicenseHandler) writeJSON(w http.ResponseWriter, status int, body interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
