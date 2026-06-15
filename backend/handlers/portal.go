package handlers

import (
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/aj9599/zev-billing/backend/middleware"
	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/mux"
)

// PortalHandler powers the tenant self-service portal: token-based login plus
// read-only, per-tenant views. Tenants authenticate with an admin-issued access
// code (users.portal_token); on success they get a JWT with role="tenant" whose
// user_id scopes every portal query to their own data.
type PortalHandler struct {
	db        *sql.DB
	jwtSecret string
}

func NewPortalHandler(db *sql.DB, jwtSecret string) *PortalHandler {
	return &PortalHandler{db: db, jwtSecret: jwtSecret}
}

// newPortalToken returns a URL-safe random access code.
func newPortalToken() (string, error) {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func portalUserID(r *http.Request) (int, bool) {
	v := r.Context().Value(middleware.PortalUserIDKey)
	id, ok := v.(int)
	return id, ok
}

// --- Public: tenant login ---

// Login exchanges an access code for a tenant JWT.
func (h *PortalHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}
	code := strings.TrimSpace(req.Code)
	if code == "" {
		http.Error(w, "Access code required", http.StatusBadRequest)
		return
	}

	var id int
	var firstName, lastName string
	var active int
	err := h.db.QueryRow(`
		SELECT id, first_name, last_name, is_active FROM users WHERE portal_token = ?
	`, code).Scan(&id, &firstName, &lastName, &active)
	if err == sql.ErrNoRows || (err == nil && active == 0) {
		http.Error(w, "Invalid access code", http.StatusUnauthorized)
		return
	}
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"user_id": id,
		"role":    "tenant",
		"exp":     time.Now().Add(30 * 24 * time.Hour).Unix(),
	})
	signed, err := token.SignedString([]byte(h.jwtSecret))
	if err != nil {
		http.Error(w, "Failed to generate token", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"token": signed,
		"name":  strings.TrimSpace(firstName + " " + lastName),
	})
}

// --- Admin: token management ---

// GenerateToken (re)issues a user's portal access code and returns it.
func (h *PortalHandler) GenerateToken(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(mux.Vars(r)["id"])
	if err != nil {
		http.Error(w, "Invalid user ID", http.StatusBadRequest)
		return
	}
	tok, err := newPortalToken()
	if err != nil {
		http.Error(w, "Failed to generate token", http.StatusInternalServerError)
		return
	}
	res, err := h.db.Exec(`UPDATE users SET portal_token = ? WHERE id = ?`, tok, id)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"token": tok})
}

// RevokeToken clears a user's portal access code.
func (h *PortalHandler) RevokeToken(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(mux.Vars(r)["id"])
	if err != nil {
		http.Error(w, "Invalid user ID", http.StatusBadRequest)
		return
	}
	if _, err := h.db.Exec(`UPDATE users SET portal_token = NULL WHERE id = ?`, id); err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// GetToken returns a user's current portal access code (empty if none).
func (h *PortalHandler) GetToken(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(mux.Vars(r)["id"])
	if err != nil {
		http.Error(w, "Invalid user ID", http.StatusBadRequest)
		return
	}
	var tok sql.NullString
	err = h.db.QueryRow(`SELECT portal_token FROM users WHERE id = ?`, id).Scan(&tok)
	if err == sql.ErrNoRows {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"token": tok.String})
}

// --- Portal (tenant-scoped, read-only) ---

// Me returns the logged-in tenant's profile.
func (h *PortalHandler) Me(w http.ResponseWriter, r *http.Request) {
	uid, ok := portalUserID(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	var firstName, lastName, email string
	var apartment, buildingName sql.NullString
	err := h.db.QueryRow(`
		SELECT u.first_name, u.last_name, u.email, u.apartment_unit, b.name
		FROM users u LEFT JOIN buildings b ON u.building_id = b.id
		WHERE u.id = ?
	`, uid).Scan(&firstName, &lastName, &email, &apartment, &buildingName)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"name":      strings.TrimSpace(firstName + " " + lastName),
		"email":     email,
		"apartment": apartment.String,
		"building":  buildingName.String,
	})
}

// Invoices lists the tenant's invoices, newest first.
func (h *PortalHandler) Invoices(w http.ResponseWriter, r *http.Request) {
	uid, ok := portalUserID(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	rows, err := h.db.Query(`
		SELECT id, invoice_number, period_start, period_end, total_amount, currency, status,
		       COALESCE(pdf_path, '') <> '' AS has_pdf
		FROM invoices WHERE user_id = ? ORDER BY period_start DESC
	`, uid)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type Invoice struct {
		ID            int     `json:"id"`
		InvoiceNumber string  `json:"invoice_number"`
		PeriodStart   string  `json:"period_start"`
		PeriodEnd     string  `json:"period_end"`
		TotalAmount   float64 `json:"total_amount"`
		Currency      string  `json:"currency"`
		Status        string  `json:"status"`
		HasPDF        bool    `json:"has_pdf"`
	}
	invoices := []Invoice{}
	for rows.Next() {
		var inv Invoice
		if err := rows.Scan(&inv.ID, &inv.InvoiceNumber, &inv.PeriodStart, &inv.PeriodEnd,
			&inv.TotalAmount, &inv.Currency, &inv.Status, &inv.HasPDF); err != nil {
			continue
		}
		invoices = append(invoices, inv)
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(invoices)
}

// InvoicePDF serves one of the tenant's invoice PDFs, after verifying ownership.
func (h *PortalHandler) InvoicePDF(w http.ResponseWriter, r *http.Request) {
	uid, ok := portalUserID(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	invoiceID, err := strconv.Atoi(mux.Vars(r)["id"])
	if err != nil {
		http.Error(w, "Invalid invoice ID", http.StatusBadRequest)
		return
	}

	var invoiceNumber string
	var pdfPath sql.NullString
	var ownerID int
	err = h.db.QueryRow(`SELECT invoice_number, pdf_path, user_id FROM invoices WHERE id = ?`, invoiceID).
		Scan(&invoiceNumber, &pdfPath, &ownerID)
	if err == sql.ErrNoRows || (err == nil && ownerID != uid) {
		// Same response whether it doesn't exist or isn't theirs.
		http.Error(w, "Invoice not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	filePath := resolveInvoicePDFPath(pdfPath, invoiceNumber)
	if filePath == "" {
		http.Error(w, "PDF not available", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", fmt.Sprintf("inline; filename=%s.pdf", invoiceNumber))
	http.ServeFile(w, r, filePath)
}

// resolveInvoicePDFPath mirrors the admin DownloadPDF lookup: absolute path, or
// search the known invoice directories by filename. Returns "" if not found.
func resolveInvoicePDFPath(pdfPath sql.NullString, invoiceNumber string) string {
	var filePath, filename string
	if pdfPath.Valid && pdfPath.String != "" {
		if filepath.IsAbs(pdfPath.String) {
			filePath = pdfPath.String
		} else {
			filename = pdfPath.String
		}
	} else {
		filename = fmt.Sprintf("%s.pdf", invoiceNumber)
	}
	if filePath == "" && filename != "" {
		dirs := []string{
			"/home/pi/zev-billing/backend/invoices",
			"/home/pi/zev-billing/invoices",
			"./invoices",
			"./backend/invoices",
		}
		for _, dir := range dirs {
			testPath := filepath.Join(dir, filename)
			if _, err := os.Stat(testPath); err == nil {
				return testPath
			}
		}
		return ""
	}
	if filePath != "" {
		if _, err := os.Stat(filePath); err == nil {
			return filePath
		}
	}
	return ""
}

// Charging lists the tenant's charging sessions, matched by the RFID cards on
// their profile (users.charger_ids), newest first.
func (h *PortalHandler) Charging(w http.ResponseWriter, r *http.Request) {
	uid, ok := portalUserID(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var cardsRaw sql.NullString
	if err := h.db.QueryRow(`SELECT charger_ids FROM users WHERE id = ?`, uid).Scan(&cardsRaw); err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	var cards []string
	for _, c := range strings.Split(cardsRaw.String, ",") {
		if c = strings.TrimSpace(c); c != "" {
			cards = append(cards, c)
		}
	}

	type Session struct {
		StartTime string  `json:"start_time"`
		EndTime   string  `json:"end_time"`
		TotalKWh  float64 `json:"total_kwh"`
		SolarKWh  float64 `json:"solar_kwh"`
		GridKWh   float64 `json:"grid_kwh"`
	}
	sessions := []Session{}
	if len(cards) > 0 {
		ph := make([]string, len(cards))
		args := make([]interface{}, len(cards))
		for i, c := range cards {
			ph[i] = "?"
			args[i] = c
		}
		q := fmt.Sprintf(`
			SELECT start_time, end_time, total_kwh, solar_kwh, grid_kwh
			FROM e3dc_session_history
			WHERE rfid IN (%s)
			ORDER BY start_time DESC LIMIT 500
		`, strings.Join(ph, ","))
		rows, err := h.db.Query(q, args...)
		if err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		for rows.Next() {
			var s Session
			if err := rows.Scan(&s.StartTime, &s.EndTime, &s.TotalKWh, &s.SolarKWh, &s.GridKWh); err != nil {
				continue
			}
			sessions = append(sessions, s)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(sessions)
}
