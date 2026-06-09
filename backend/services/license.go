package services

import (
	"bytes"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"strings"
	"time"
)

// trialDays is the length of the full-feature trial that starts on first install.
const trialDays = 30

// freeLimits caps the free plan (-1 means unlimited). Billing is disabled.
var freeLimits = LicenseLimits{
	Buildings: 1,
	Users:     2,
	Meters:    2,
	Chargers:  1,
	Devices:   1,
	Billing:   false,
}

// unlimitedLimits is granted during the trial and to pro licenses.
var unlimitedLimits = LicenseLimits{
	Buildings: -1, Users: -1, Meters: -1, Chargers: -1, Devices: -1, Billing: true,
}

// LicenseLimits describes the maximum number of each entity (-1 = unlimited)
// and whether bill generation is allowed.
type LicenseLimits struct {
	Buildings int  `json:"buildings"`
	Users     int  `json:"users"`
	Meters    int  `json:"meters"`
	Chargers  int  `json:"chargers"`
	Devices   int  `json:"devices"`
	Billing   bool `json:"billing"`
}

// LicenseUsage is the current count of each entity.
type LicenseUsage struct {
	Buildings int `json:"buildings"`
	Users     int `json:"users"`
	Meters    int `json:"meters"`
	Chargers  int `json:"chargers"`
	Devices   int `json:"devices"`
}

// LicenseStatus is the full picture returned to the UI and used for gating.
type LicenseStatus struct {
	Tier           string        `json:"tier"` // "free" | "trial" | "pro"
	Valid          bool          `json:"valid"`
	Licensee       string        `json:"licensee,omitempty"`
	Expires        string        `json:"expires,omitempty"`
	TrialActive    bool          `json:"trial_active"`
	TrialDaysLeft  int           `json:"trial_days_left"`
	BillingAllowed bool          `json:"billing_allowed"`
	Limits         LicenseLimits `json:"limits"`
	Usage          LicenseUsage  `json:"usage"`
	Message        string        `json:"message,omitempty"`

	// Phase 2 (online activation) fields.
	Online        bool   `json:"online"`         // online activation is configured
	DeviceID      string `json:"device_id"`      // this install's device fingerprint
	LastValidated string `json:"last_validated"` // RFC3339 of last successful refresh

	// Key presentation (for the License page).
	KeyMasked string `json:"key_masked,omitempty"` // e.g. "ZEV-…a1b2c3"
	KeyType   string `json:"key_type,omitempty"`   // "lifetime" | "limited"
}

// licensePayload is the signed content encoded inside a vendor license key.
type licensePayload struct {
	ID       string `json:"id"`
	Licensee string `json:"licensee"`
	Tier     string `json:"tier"`
	Issued   string `json:"issued"`
	Expires  string `json:"expires"` // RFC3339 / YYYY-MM-DD, or "" for perpetual
}

// receiptPayload is the signed, device-bound activation receipt returned by the
// online activation server (Firebase). Verified offline with the same public key.
type receiptPayload struct {
	Type     string `json:"type"` // "receipt"
	KeyID    string `json:"key_id"`
	DeviceID string `json:"device_id"`
	Licensee string `json:"licensee"`
	Tier     string `json:"tier"`
	Issued   string `json:"issued"`
	Expires  string `json:"expires"` // RFC3339 — receipt lifetime (refresh before this)
}

// LicenseService verifies license keys / activation receipts offline (Ed25519)
// and, when an activation URL is configured, performs online device-bound
// activation against the Firebase Cloud Function.
type LicenseService struct {
	db            *sql.DB
	pubKey        ed25519.PublicKey
	activationURL string
	httpClient    *http.Client
}

// NewLicenseService builds the service. activationURL == "" keeps offline (Phase 1)
// behaviour; a non-empty URL enables online activation + device binding.
func NewLicenseService(db *sql.DB, publicKeyB64, activationURL string) *LicenseService {
	var pub ed25519.PublicKey
	if b, err := base64.StdEncoding.DecodeString(strings.TrimSpace(publicKeyB64)); err == nil && len(b) == ed25519.PublicKeySize {
		pub = ed25519.PublicKey(b)
	} else {
		log.Printf("[LICENSE] WARNING: invalid/empty LICENSE_PUBLIC_KEY — key activation will not work")
	}
	return &LicenseService{
		db:            db,
		pubKey:        pub,
		activationURL: strings.TrimSpace(activationURL),
		httpClient:    &http.Client{Timeout: 12 * time.Second},
	}
}

// online reports whether online activation is configured.
func (ls *LicenseService) online() bool { return ls.activationURL != "" }

// verifySigned validates a "<payload>.<sig>" token against the public key and
// returns the raw payload bytes. Shared by license keys and activation receipts.
func (ls *LicenseService) verifySigned(token string) ([]byte, error) {
	token = strings.TrimSpace(token)
	token = strings.TrimPrefix(token, "ZEV-")
	if token == "" {
		return nil, fmt.Errorf("empty token")
	}
	parts := strings.SplitN(token, ".", 2)
	if len(parts) != 2 {
		return nil, fmt.Errorf("malformed token")
	}
	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return nil, fmt.Errorf("bad payload encoding")
	}
	sig, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, fmt.Errorf("bad signature encoding")
	}
	if len(ls.pubKey) != ed25519.PublicKeySize {
		return nil, fmt.Errorf("server is missing a valid public key")
	}
	if !ed25519.Verify(ls.pubKey, payloadBytes, sig) {
		return nil, fmt.Errorf("invalid signature")
	}
	return payloadBytes, nil
}

// maskKey shows just enough of a key to recognise it (prefix + last 6 chars).
func maskKey(k string) string {
	k = strings.TrimSpace(k)
	if len(k) <= 12 {
		return k
	}
	prefix := ""
	if strings.HasPrefix(k, "ZEV-") {
		prefix = "ZEV-"
	}
	return prefix + "…" + k[len(k)-6:]
}

// primaryMAC returns the MAC of the first up, non-loopback interface (best effort).
func primaryMAC() string {
	ifaces, err := net.Interfaces()
	if err != nil {
		return ""
	}
	for _, i := range ifaces {
		if i.Flags&net.FlagLoopback != 0 || i.Flags&net.FlagUp == 0 {
			continue
		}
		if mac := i.HardwareAddr.String(); mac != "" {
			return mac
		}
	}
	return ""
}

func parseExpiry(s string) (time.Time, bool) {
	if s == "" {
		return time.Time{}, false
	}
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t, true
	}
	if t, err := time.Parse("2006-01-02", s); err == nil {
		return t, true
	}
	return time.Time{}, false
}

// verifyKey checks a vendor license key's signature and expiry.
func (ls *LicenseService) verifyKey(key string) (*licensePayload, error) {
	payloadBytes, err := ls.verifySigned(key)
	if err != nil {
		return nil, err
	}
	var p licensePayload
	if err := json.Unmarshal(payloadBytes, &p); err != nil {
		return nil, fmt.Errorf("bad payload")
	}
	if exp, ok := parseExpiry(p.Expires); ok && time.Now().After(exp) {
		return &p, fmt.Errorf("license expired on %s", exp.Format("2006-01-02"))
	}
	return &p, nil
}

// verifyReceipt checks an activation receipt's signature, expiry and that it is
// bound to this device.
func (ls *LicenseService) verifyReceipt(token, deviceID string) (*receiptPayload, error) {
	payloadBytes, err := ls.verifySigned(token)
	if err != nil {
		return nil, err
	}
	var p receiptPayload
	if err := json.Unmarshal(payloadBytes, &p); err != nil {
		return nil, fmt.Errorf("bad receipt")
	}
	if p.Type != "receipt" {
		return nil, fmt.Errorf("not a receipt")
	}
	if p.DeviceID != deviceID {
		return &p, fmt.Errorf("receipt is bound to a different device")
	}
	if exp, ok := parseExpiry(p.Expires); ok && time.Now().After(exp) {
		return &p, fmt.Errorf("activation expired on %s — reconnect to refresh", exp.Format("2006-01-02"))
	}
	return &p, nil
}

func (ls *LicenseService) readRow() (installDate time.Time, key, deviceID, receipt string, lastValidated sql.NullTime) {
	installDate = time.Now()
	var inst sql.NullTime
	var k, dev, rec sql.NullString
	err := ls.db.QueryRow(`SELECT install_date, license_key, COALESCE(device_id,''), COALESCE(activation_receipt,''), last_validated FROM app_license WHERE id = 1`).
		Scan(&inst, &k, &dev, &rec, &lastValidated)
	if err == nil {
		if inst.Valid {
			installDate = inst.Time
		}
		key = k.String
		deviceID = dev.String
		receipt = rec.String
	}
	return installDate, key, deviceID, receipt, lastValidated
}

// DeviceID returns a stable per-install fingerprint, generating and persisting
// one on first use. Prefers the OS machine-id (hashed), falls back to random.
func (ls *LicenseService) DeviceID() string {
	_, _, dev, _, _ := ls.readRow()
	if dev != "" {
		return dev
	}
	dev = computeDeviceID()
	_, _ = ls.db.Exec(`UPDATE app_license SET device_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1`, dev)
	return dev
}

func computeDeviceID() string {
	for _, path := range []string{"/etc/machine-id", "/var/lib/dbus/machine-id"} {
		if b, err := os.ReadFile(path); err == nil {
			if id := strings.TrimSpace(string(b)); id != "" {
				sum := sha256.Sum256([]byte("zev-billing:" + id))
				return hex.EncodeToString(sum[:16])
			}
		}
	}
	// Fallback: random, persisted by the caller.
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return fmt.Sprintf("dev-%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(b)
}

func (ls *LicenseService) usage() LicenseUsage {
	count := func(table string) int {
		var n int
		_ = ls.db.QueryRow("SELECT COUNT(*) FROM " + table).Scan(&n)
		return n
	}
	return LicenseUsage{
		Buildings: count("buildings"),
		Users:     count("users"),
		Meters:    count("meters"),
		Chargers:  count("chargers"),
		Devices:   count("controllable_devices"),
	}
}

// Status computes the current license state, effective limits and usage.
func (ls *LicenseService) Status() LicenseStatus {
	installDate, key, deviceID, receipt, lastValidated := ls.readRow()
	usage := ls.usage()

	base := func(st LicenseStatus) LicenseStatus {
		st.Online = ls.online()
		st.DeviceID = deviceID
		if lastValidated.Valid {
			st.LastValidated = lastValidated.Time.Format(time.RFC3339)
		}
		if key != "" {
			st.KeyMasked = maskKey(key)
			exp := st.Expires
			if exp == "" {
				if p, _ := ls.verifyKey(key); p != nil {
					exp = p.Expires
				}
			}
			if exp == "" {
				st.KeyType = "lifetime"
			} else {
				st.KeyType = "limited"
			}
		}
		return st
	}

	if ls.online() {
		// Pro requires a valid, device-bound activation receipt.
		if receipt != "" {
			if rp, err := ls.verifyReceipt(receipt, deviceID); err == nil {
				return base(LicenseStatus{
					Tier: "pro", Valid: true, Licensee: rp.Licensee, Expires: rp.Expires,
					BillingAllowed: true, Limits: unlimitedLimits, Usage: usage,
				})
			} else {
				st := ls.trialOrFree(installDate, usage)
				st.Message = err.Error()
				return base(st)
			}
		}
		if key != "" {
			st := ls.trialOrFree(installDate, usage)
			st.Message = "Awaiting activation — connect to the internet to activate this device."
			return base(st)
		}
		return base(ls.trialOrFree(installDate, usage))
	}

	// Offline (Phase 1): a valid signed key is enough.
	if key != "" {
		if p, err := ls.verifyKey(key); err == nil {
			return base(LicenseStatus{
				Tier: "pro", Valid: true, Licensee: p.Licensee, Expires: p.Expires,
				BillingAllowed: true, Limits: unlimitedLimits, Usage: usage,
			})
		} else {
			st := ls.trialOrFree(installDate, usage)
			st.Message = err.Error()
			return base(st)
		}
	}
	return base(ls.trialOrFree(installDate, usage))
}

func (ls *LicenseService) trialOrFree(installDate time.Time, usage LicenseUsage) LicenseStatus {
	trialEnd := installDate.AddDate(0, 0, trialDays)
	if time.Now().Before(trialEnd) {
		daysLeft := int(time.Until(trialEnd).Hours()/24) + 1
		if daysLeft < 0 {
			daysLeft = 0
		}
		return LicenseStatus{
			Tier: "trial", TrialActive: true, TrialDaysLeft: daysLeft,
			BillingAllowed: true, Limits: unlimitedLimits, Usage: usage,
		}
	}
	return LicenseStatus{
		Tier: "free", BillingAllowed: false, Limits: freeLimits, Usage: usage,
	}
}

func (s LicenseStatus) limitFor(entity string) (limit, used int, ok bool) {
	switch entity {
	case "buildings":
		return s.Limits.Buildings, s.Usage.Buildings, true
	case "users":
		return s.Limits.Users, s.Usage.Users, true
	case "meters":
		return s.Limits.Meters, s.Usage.Meters, true
	case "chargers":
		return s.Limits.Chargers, s.Usage.Chargers, true
	case "devices":
		return s.Limits.Devices, s.Usage.Devices, true
	}
	return 0, 0, false
}

// CanCreate reports whether another entity of this type may be created, plus the
// applicable limit and current tier (for error messages).
func (ls *LicenseService) CanCreate(entity string) (allowed bool, limit int, tier string) {
	st := ls.Status()
	lim, used, ok := st.limitFor(entity)
	if !ok || lim < 0 {
		return true, -1, st.Tier
	}
	return used < lim, lim, st.Tier
}

// CanBill reports whether bill generation is currently permitted.
func (ls *LicenseService) CanBill() bool {
	return ls.Status().BillingAllowed
}

// activateResult is the parsed response from the activation server.
type activateResult struct {
	receipt  string
	rejected bool   // server definitively refused (revoked / limit / invalid)
	message  string // server-supplied reason
}

// callActivate POSTs the key + device to the activation server and returns the
// signed receipt. rejected=true means the server refused (do not retry blindly);
// a non-nil error with rejected=false is a transient/network failure.
func (ls *LicenseService) callActivate(key, deviceID string) (activateResult, error) {
	hostname, _ := os.Hostname()
	body, _ := json.Marshal(map[string]string{
		"key":       strings.TrimSpace(key),
		"device_id": deviceID,
		"hostname":  hostname,
		"mac":       primaryMAC(),
	})
	req, err := http.NewRequest(http.MethodPost, ls.activationURL, bytes.NewReader(body))
	if err != nil {
		return activateResult{}, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := ls.httpClient.Do(req)
	if err != nil {
		return activateResult{}, err // transient
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<16))

	var parsed struct {
		Receipt string `json:"receipt"`
		Error   string `json:"error"`
		Message string `json:"message"`
	}
	_ = json.Unmarshal(raw, &parsed)

	if resp.StatusCode == http.StatusOK && parsed.Receipt != "" {
		return activateResult{receipt: parsed.Receipt}, nil
	}
	// 4xx → definitive rejection; 5xx / unexpected → transient.
	if resp.StatusCode >= 400 && resp.StatusCode < 500 {
		msg := parsed.Message
		if msg == "" {
			msg = parsed.Error
		}
		if msg == "" {
			msg = "activation refused"
		}
		return activateResult{rejected: true, message: msg}, fmt.Errorf("%s", msg)
	}
	return activateResult{}, fmt.Errorf("activation server error (HTTP %d)", resp.StatusCode)
}

// Activate verifies/stores a license. In online mode it performs device-bound
// activation against the server and stores the returned receipt; offline it just
// verifies and stores the signed key (Phase 1).
func (ls *LicenseService) Activate(key string) error {
	key = strings.TrimSpace(key)
	if _, err := ls.verifyKey(key); err != nil {
		return err
	}

	if !ls.online() {
		_, err := ls.db.Exec(
			`UPDATE app_license SET license_key = ?, activation_receipt = '', activated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = 1`,
			key)
		return err
	}

	deviceID := ls.DeviceID()
	res, err := ls.callActivate(key, deviceID)
	if err != nil {
		if res.rejected {
			return fmt.Errorf("%s", res.message)
		}
		return fmt.Errorf("could not reach the activation server — check your internet connection")
	}
	rp, err := ls.verifyReceipt(res.receipt, deviceID)
	if err != nil {
		return fmt.Errorf("activation server returned an invalid receipt: %v", err)
	}
	_ = rp
	_, err = ls.db.Exec(
		`UPDATE app_license SET license_key = ?, activation_receipt = ?, activated_at = CURRENT_TIMESTAMP, last_validated = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = 1`,
		key, res.receipt)
	return err
}

// Deactivate removes the stored license key and receipt from this install.
func (ls *LicenseService) Deactivate() error {
	_, err := ls.db.Exec(`UPDATE app_license SET license_key = '', activation_receipt = '', activated_at = NULL, last_validated = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = 1`)
	return err
}

// refresh re-activates against the server to obtain a fresh receipt (online mode).
// A definitive rejection (revoked / limit) clears the receipt so the plan drops;
// transient failures keep the existing receipt so brief outages don't lock out.
func (ls *LicenseService) refresh() {
	_, key, _, receipt, _ := ls.readRow()
	if key == "" {
		return
	}
	deviceID := ls.DeviceID()
	res, err := ls.callActivate(key, deviceID)
	if err != nil {
		if res.rejected {
			log.Printf("[LICENSE] activation revoked/refused on refresh: %s", res.message)
			_, _ = ls.db.Exec(`UPDATE app_license SET activation_receipt = '', updated_at = CURRENT_TIMESTAMP WHERE id = 1`)
		}
		return // transient: keep current receipt
	}
	if _, err := ls.verifyReceipt(res.receipt, deviceID); err != nil {
		return
	}
	_, _ = ls.db.Exec(`UPDATE app_license SET activation_receipt = ?, last_validated = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = 1`, res.receipt)
	_ = receipt
}

// StartRefresher periodically refreshes the activation receipt while online
// activation is configured. No-op in offline mode.
func (ls *LicenseService) StartRefresher() {
	if !ls.online() {
		return
	}
	// Initial refresh shortly after boot, then hourly. The hourly check-in renews
	// the receipt, refreshes lastSeen (powers the operator console's online dot),
	// and picks up any server-side revocation within ~1h.
	time.Sleep(20 * time.Second)
	ls.refresh()
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()
	for range ticker.C {
		ls.refresh()
	}
}
