package services

import (
	"crypto/ed25519"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
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
}

// licensePayload is the signed content encoded inside a license key.
type licensePayload struct {
	ID       string `json:"id"`
	Licensee string `json:"licensee"`
	Tier     string `json:"tier"`
	Issued   string `json:"issued"`
	Expires  string `json:"expires"` // RFC3339 / YYYY-MM-DD, or "" for perpetual
}

// LicenseService verifies license keys offline (Ed25519) and computes the
// effective tier/limits from the singleton app_license row.
type LicenseService struct {
	db     *sql.DB
	pubKey ed25519.PublicKey
}

// NewLicenseService builds the service from a base64-encoded Ed25519 public key.
func NewLicenseService(db *sql.DB, publicKeyB64 string) *LicenseService {
	var pub ed25519.PublicKey
	if b, err := base64.StdEncoding.DecodeString(strings.TrimSpace(publicKeyB64)); err == nil && len(b) == ed25519.PublicKeySize {
		pub = ed25519.PublicKey(b)
	} else {
		log.Printf("[LICENSE] WARNING: invalid/empty LICENSE_PUBLIC_KEY — key activation will not work")
	}
	return &LicenseService{db: db, pubKey: pub}
}

// verifyKey checks a key's signature and expiry, returning the decoded payload.
// A non-nil payload with a non-nil error means the key parsed but is expired.
func (ls *LicenseService) verifyKey(key string) (*licensePayload, error) {
	key = strings.TrimSpace(key)
	key = strings.TrimPrefix(key, "ZEV-")
	if key == "" {
		return nil, fmt.Errorf("empty key")
	}
	parts := strings.SplitN(key, ".", 2)
	if len(parts) != 2 {
		return nil, fmt.Errorf("malformed key")
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
	var p licensePayload
	if err := json.Unmarshal(payloadBytes, &p); err != nil {
		return nil, fmt.Errorf("bad payload")
	}
	if p.Expires != "" {
		exp, perr := time.Parse(time.RFC3339, p.Expires)
		if perr != nil {
			exp, perr = time.Parse("2006-01-02", p.Expires)
		}
		if perr == nil && time.Now().After(exp) {
			return &p, fmt.Errorf("license expired on %s", exp.Format("2006-01-02"))
		}
	}
	return &p, nil
}

func (ls *LicenseService) readRow() (installDate time.Time, key string) {
	installDate = time.Now()
	var inst sql.NullTime
	var k sql.NullString
	if err := ls.db.QueryRow(`SELECT install_date, license_key FROM app_license WHERE id = 1`).Scan(&inst, &k); err == nil {
		if inst.Valid {
			installDate = inst.Time
		}
		if k.Valid {
			key = k.String
		}
	}
	return installDate, key
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
	installDate, key := ls.readRow()
	usage := ls.usage()

	if key != "" {
		if p, err := ls.verifyKey(key); err == nil {
			return LicenseStatus{
				Tier: "pro", Valid: true, Licensee: p.Licensee, Expires: p.Expires,
				BillingAllowed: true, Limits: unlimitedLimits, Usage: usage,
			}
		} else {
			// Stored key no longer valid (expired/revoked) — fall back, but say why.
			st := ls.trialOrFree(installDate, usage)
			st.Message = err.Error()
			return st
		}
	}
	return ls.trialOrFree(installDate, usage)
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

// Activate verifies a license key and stores it.
func (ls *LicenseService) Activate(key string) error {
	if _, err := ls.verifyKey(key); err != nil {
		return err
	}
	_, err := ls.db.Exec(
		`UPDATE app_license SET license_key = ?, activated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = 1`,
		strings.TrimSpace(key))
	return err
}

// Deactivate removes the stored license key.
func (ls *LicenseService) Deactivate() error {
	_, err := ls.db.Exec(`UPDATE app_license SET license_key = '', activated_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = 1`)
	return err
}
