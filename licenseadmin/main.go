// licenseadmin is the operator console for ZEV Billing licenses.
//
// It is a small, password-gated web app (separate from the main billing app and
// its own Go module) that the vendor/operator runs — typically on the same Pi on
// a separate port. It:
//   - mints signed Ed25519 license keys (the same scheme cmd/licensegen uses),
//   - stores/manages them in Firebase Firestore (collection "licenses"),
//   - shows which devices each key is bound to and when they were last seen.
//
// It needs (all via env):
//
//	LICENSEADMIN_PORT       listen port (default 8090)
//	LICENSEADMIN_PASSWORD   operator password (required)
//	FIREBASE_PROJECT_ID     your Firebase project id (required)
//	FIREBASE_CREDENTIALS    path to the service-account JSON (or rely on ADC)
//	LICENSE_PRIVATE_KEY     base64 Ed25519 private key (required, to mint keys)
//
// SECURITY: this process holds the signing private key and full Firestore access.
// Keep it on the operator's machine, behind the operator password, and do NOT
// expose it to the public internet.
package main

import (
	"context"
	"crypto/ed25519"
	"crypto/subtle"
	_ "embed"
	"encoding/base64"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"sort"
	"strings"
	"time"

	"cloud.google.com/go/firestore"
	"google.golang.org/api/iterator"
	"google.golang.org/api/option"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

//go:embed static/index.html
var indexHTML []byte

const collection = "licenses"

type server struct {
	fs       *firestore.Client
	priv     ed25519.PrivateKey
	password string
}

func main() {
	port := envOr("LICENSEADMIN_PORT", "8090")
	password := os.Getenv("LICENSEADMIN_PASSWORD")
	projectID := os.Getenv("FIREBASE_PROJECT_ID")
	credPath := os.Getenv("FIREBASE_CREDENTIALS")
	privB64 := os.Getenv("LICENSE_PRIVATE_KEY")

	if password == "" || projectID == "" || privB64 == "" {
		log.Fatal("LICENSEADMIN_PASSWORD, FIREBASE_PROJECT_ID and LICENSE_PRIVATE_KEY are required")
	}
	privBytes, err := base64.StdEncoding.DecodeString(strings.TrimSpace(privB64))
	if err != nil || len(privBytes) != ed25519.PrivateKeySize {
		log.Fatal("invalid LICENSE_PRIVATE_KEY")
	}

	ctx := context.Background()
	var opts []option.ClientOption
	if credPath != "" {
		opts = append(opts, option.WithCredentialsFile(credPath))
	}
	fs, err := firestore.NewClient(ctx, projectID, opts...)
	if err != nil {
		log.Fatalf("firestore: %v", err)
	}
	defer fs.Close()

	s := &server{fs: fs, priv: ed25519.PrivateKey(privBytes), password: password}

	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write(indexHTML)
	})
	mux.HandleFunc("/api/keys", s.auth(s.handleKeys)) // GET list, POST create
	mux.HandleFunc("/api/keys/", s.auth(s.handleKey)) // /api/keys/{id}[/...]

	addr := ":" + port
	log.Printf("licenseadmin listening on %s (project %s)", addr, projectID)
	log.Fatal(http.ListenAndServe(addr, mux))
}

func envOr(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}

// auth gates API routes behind the operator password (sent as X-Admin-Password).
func (s *server) auth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		got := r.Header.Get("X-Admin-Password")
		if subtle.ConstantTimeCompare([]byte(got), []byte(s.password)) != 1 {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			return
		}
		next(w, r)
	}
}

// ---- license model ----

type deviceInfo struct {
	Hostname    string `json:"hostname"`
	ActivatedAt string `json:"activatedAt"`
	LastSeen    string `json:"lastSeen"`
}

type licenseDoc struct {
	ID             string                `json:"id"`
	Licensee       string                `json:"licensee"`
	Tier           string                `json:"tier"`
	MaxActivations int                   `json:"maxActivations"`
	Revoked        bool                  `json:"revoked"`
	CreatedAt      string                `json:"createdAt"`
	Expires        string                `json:"expires"`
	Key            string                `json:"key,omitempty"`
	Devices        map[string]deviceInfo `json:"devices"`
}

// ---- handlers ----

func (s *server) handleKeys(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		s.listKeys(w, r)
	case http.MethodPost:
		s.createKey(w, r)
	default:
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method_not_allowed"})
	}
}

func (s *server) listKeys(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	iter := s.fs.Collection(collection).Documents(ctx)
	defer iter.Stop()
	var out []licenseDoc
	for {
		doc, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		out = append(out, docToLicense(doc.Ref.ID, doc.Data()))
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt > out[j].CreatedAt })
	writeJSON(w, http.StatusOK, out)
}

func (s *server) createKey(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Licensee       string `json:"licensee"`
		Days           int    `json:"days"`
		MaxActivations int    `json:"max_activations"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad_request"})
		return
	}
	if strings.TrimSpace(req.Licensee) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "licensee_required"})
		return
	}
	if req.MaxActivations < 1 {
		req.MaxActivations = 1
	}

	now := time.Now().UTC()
	id := "lic_" + now.Format("20060102150405")
	expires := ""
	if req.Days > 0 {
		expires = now.AddDate(0, 0, req.Days).Format(time.RFC3339)
	}
	key := s.signKey(id, req.Licensee, "pro", now, expires)

	doc := map[string]interface{}{
		"licensee":       req.Licensee,
		"tier":           "pro",
		"maxActivations": req.MaxActivations,
		"revoked":        false,
		"createdAt":      now.Format(time.RFC3339),
		"expires":        expires,
		"key":            key,
		"devices":        map[string]interface{}{},
	}
	if _, err := s.fs.Collection(collection).Doc(id).Set(r.Context(), doc); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"id": id, "key": key})
}

// handleKey dispatches /api/keys/{id}, /api/keys/{id}/revoke,
// /api/keys/{id}/max, /api/keys/{id}/devices/{deviceId}.
func (s *server) handleKey(w http.ResponseWriter, r *http.Request) {
	rest := strings.TrimPrefix(r.URL.Path, "/api/keys/")
	parts := strings.Split(rest, "/")
	if len(parts) == 0 || parts[0] == "" {
		http.NotFound(w, r)
		return
	}
	id := parts[0]
	ref := s.fs.Collection(collection).Doc(id)
	ctx := r.Context()

	// DELETE /api/keys/{id}
	if len(parts) == 1 && r.Method == http.MethodDelete {
		if _, err := ref.Delete(ctx); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
		return
	}

	// POST /api/keys/{id}/revoke  { "revoked": bool }
	if len(parts) == 2 && parts[1] == "revoke" && r.Method == http.MethodPost {
		var body struct {
			Revoked bool `json:"revoked"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		if err := updateDoc(ctx, ref, []firestore.Update{{Path: "revoked", Value: body.Revoked}}); err != nil {
			writeJSON(w, statusFor(err), map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
		return
	}

	// POST /api/keys/{id}/max  { "max": n }
	if len(parts) == 2 && parts[1] == "max" && r.Method == http.MethodPost {
		var body struct {
			Max int `json:"max"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body.Max < 1 {
			body.Max = 1
		}
		if err := updateDoc(ctx, ref, []firestore.Update{{Path: "maxActivations", Value: body.Max}}); err != nil {
			writeJSON(w, statusFor(err), map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
		return
	}

	// DELETE /api/keys/{id}/devices/{deviceId}
	if len(parts) == 3 && parts[1] == "devices" && r.Method == http.MethodDelete {
		deviceID := parts[2]
		if err := updateDoc(ctx, ref, []firestore.Update{{FieldPath: []string{"devices", deviceID}, Value: firestore.Delete}}); err != nil {
			writeJSON(w, statusFor(err), map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
		return
	}

	http.NotFound(w, r)
}

func updateDoc(ctx context.Context, ref *firestore.DocumentRef, updates []firestore.Update) error {
	_, err := ref.Update(ctx, updates)
	return err
}

func statusFor(err error) int {
	if status.Code(err) == codes.NotFound {
		return http.StatusNotFound
	}
	return http.StatusInternalServerError
}

// signKey mints a signed license key identical in format to cmd/licensegen.
func (s *server) signKey(id, licensee, tier string, issued time.Time, expires string) string {
	payload := map[string]string{
		"id":       id,
		"licensee": licensee,
		"tier":     tier,
		"issued":   issued.Format(time.RFC3339),
		"expires":  expires,
	}
	pb, _ := json.Marshal(payload)
	sig := ed25519.Sign(s.priv, pb)
	return "ZEV-" + base64.RawURLEncoding.EncodeToString(pb) + "." + base64.RawURLEncoding.EncodeToString(sig)
}

func docToLicense(id string, data map[string]interface{}) licenseDoc {
	d := licenseDoc{ID: id, Devices: map[string]deviceInfo{}}
	d.Licensee, _ = data["licensee"].(string)
	d.Tier, _ = data["tier"].(string)
	d.Revoked, _ = data["revoked"].(bool)
	d.CreatedAt, _ = data["createdAt"].(string)
	d.Expires, _ = data["expires"].(string)
	d.Key, _ = data["key"].(string)
	if m, ok := data["maxActivations"].(int64); ok {
		d.MaxActivations = int(m)
	} else if f, ok := data["maxActivations"].(float64); ok {
		d.MaxActivations = int(f)
	}
	if devs, ok := data["devices"].(map[string]interface{}); ok {
		for k, v := range devs {
			if m, ok := v.(map[string]interface{}); ok {
				di := deviceInfo{}
				di.Hostname, _ = m["hostname"].(string)
				di.ActivatedAt, _ = m["activatedAt"].(string)
				di.LastSeen, _ = m["lastSeen"].(string)
				d.Devices[k] = di
			}
		}
	}
	return d
}

func writeJSON(w http.ResponseWriter, status int, body interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
