package handlers

import (
	"crypto/subtle"
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/aj9599/zev-billing/backend/services/zaptec"
)

// ChargerRelease is the release gate endpoint for Loxone (and Solhus):
//
//	GET /webhook/charger-release?charger_id=1&key=SECRET          → status
//	GET /webhook/charger-release?charger_id=1&key=SECRET&user=1   → release for user 1 (private)
//	GET /webhook/charger-release?charger_id=1&key=SECRET&user=2   → release for user 2 (business)
//	GET /webhook/charger-release?charger_id=1&key=SECRET&user=9   → acknowledge reminders
//
// user=0 (or empty) only returns the status, so a Loxone virtual output that
// falls back to 0 is harmless. The response is flat JSON, e.g.
// {"waiting":1,"remind":0,"released":0,"user":0,...}, parsable in a Loxone
// virtual HTTP input with  \i"waiting":\i\v  and  \i"remind":\i\v .
func (h *WebhookHandler) ChargerRelease(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	if r.Method == http.MethodPost {
		_ = r.ParseForm()
		q = r.Form
	}
	chargerID, err := strconv.Atoi(q.Get("charger_id"))
	if err != nil {
		http.Error(w, "charger_id is required", http.StatusBadRequest)
		return
	}

	var name, configJSON, connType string
	err = h.db.QueryRow(`SELECT name, connection_config, connection_type FROM chargers WHERE id = ? AND is_active = 1`, chargerID).
		Scan(&name, &configJSON, &connType)
	if err == sql.ErrNoRows {
		http.Error(w, "charger not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}
	if connType != "zaptec_api" {
		http.Error(w, "release gate is only available for Zaptec chargers", http.StatusBadRequest)
		return
	}
	var config zaptec.ConnectionConfig
	if err := json.Unmarshal([]byte(configJSON), &config); err != nil {
		http.Error(w, "invalid charger config", http.StatusInternalServerError)
		return
	}
	if config.ReleaseKey == "" {
		http.Error(w, "release key not configured for this charger", http.StatusForbidden)
		return
	}
	if subtle.ConstantTimeCompare([]byte(q.Get("key")), []byte(config.ReleaseKey)) != 1 {
		http.Error(w, "invalid key", http.StatusUnauthorized)
		return
	}

	source := strings.TrimSpace(q.Get("source"))
	if source == "" {
		source = "loxone"
	}

	status := http.StatusOK
	var st *zaptec.ReleaseState
	userStr := strings.TrimSpace(q.Get("user"))
	value := 0
	if userStr != "" {
		value, err = strconv.Atoi(strings.SplitN(userStr, ".", 2)[0]) // Loxone may send "1.000"
		if err != nil {
			http.Error(w, "user must be 1, 2 or 9", http.StatusBadRequest)
			return
		}
	}
	switch value {
	case 0:
		st, err = zaptec.LoadReleaseState(h.db, chargerID)
	case 9:
		st, err = zaptec.AckReminder(h.db, chargerID)
		if err == nil {
			log.Printf("Release: [%s] reminders acknowledged (%s)", name, source)
		}
	case 1, 2:
		token := config.ReleaseTokenFor(value)
		if token == "" {
			http.Error(w, "no user token configured for this value", http.StatusBadRequest)
			return
		}
		st, err = zaptec.ReleaseCharger(h.db, chargerID, value, token, source)
		if err != nil && st != nil {
			status = http.StatusConflict // e.g. no car connected
			log.Printf("Release: [%s] release for %s refused: %v", name, token, err)
			err = nil
		} else if err == nil {
			log.Printf("Release: [%s] released for %s (value %d, %s)", name, token, value, source)
			h.db.Exec(`INSERT INTO admin_logs (action, details, ip_address) VALUES (?, ?, ?)`,
				"Charger Released", name+": "+token+" via "+source, r.RemoteAddr)
		}
	default:
		http.Error(w, "user must be 1, 2 or 9", http.StatusBadRequest)
		return
	}
	if err != nil {
		http.Error(w, "release state error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if config.ReleaseRequired {
		st.Enabled = 1
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(st)
}
