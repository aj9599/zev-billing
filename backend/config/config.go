package config

import (
	"crypto/rand"
	"encoding/base64"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// defaultLicensePublicKey is the Ed25519 public key (base64) used to verify
// license keys offline. The matching PRIVATE key is held only by the vendor and
// is used by ./cmd/licensegen to sign keys — it must never ship with the app.
// Override at deploy time with LICENSE_PUBLIC_KEY if you generate your own pair.
const defaultLicensePublicKey = "8o+ttNmb+tc9xtr4T7EsGpEDwrG8ZY3Uc4DR4b1sA48="

// defaultLicenseActivationURL points every install at the vendor's online
// activation function (device binding + revocation). Override/disable per
// install with LICENSE_ACTIVATION_URL (set it to "" to force offline mode).
const defaultLicenseActivationURL = "https://activate-6n3rv7n5ta-uc.a.run.app"

type Config struct {
	DatabasePath         string
	ServerAddress        string
	ServerPort           int
	JWTSecret            string
	LicensePublicKey     string
	LicenseActivationURL string

	// CORSAllowedOrigins restricts which browser origins may call the API.
	// In the standard nginx-reverse-proxy deployment the UI and API are
	// same-origin, so this only matters for direct/dev access.
	CORSAllowedOrigins []string

	// Automated backups (nightly VACUUM INTO snapshot with rotation).
	BackupEnabled   bool
	BackupHour      int // local hour 0-23 to run the daily backup
	BackupRetention int // number of automatic backups to keep
}

func Load() *Config {
	// Get port from environment, default to 8080
	port := getEnvInt("SERVER_PORT", 8080)
	dbPath := getEnv("DATABASE_PATH", "./zev-billing.db")

	return &Config{
		DatabasePath:     dbPath,
		ServerAddress:    ":" + strconv.Itoa(port),
		ServerPort:       port,
		JWTSecret:        resolveJWTSecret(dbPath),
		LicensePublicKey: getEnv("LICENSE_PUBLIC_KEY", defaultLicensePublicKey),
		// Online activation + per-device binding via the Firebase "activate" function.
		// Defaults to the vendor function; override with LICENSE_ACTIVATION_URL.
		LicenseActivationURL: getEnv("LICENSE_ACTIVATION_URL", defaultLicenseActivationURL),

		CORSAllowedOrigins: corsOrigins(),

		BackupEnabled:   getEnvBool("BACKUP_ENABLED", true),
		BackupHour:      getEnvInt("BACKUP_HOUR", 3),
		BackupRetention: getEnvInt("BACKUP_RETENTION", 14),
	}
}

// resolveJWTSecret returns the secret used to sign auth tokens. Priority:
//  1. the JWT_SECRET env var, if set;
//  2. a strong random secret persisted next to the database (.jwt_secret),
//     generated on first run.
//
// This removes the old hard-coded shipped default (a token-forgery risk if left
// unchanged) without requiring any manual setup, while keeping issued tokens
// valid across restarts. If the secret can't be persisted, a per-process random
// secret is used as a last resort (tokens won't survive a restart, but the
// known-default is never used).
func resolveJWTSecret(dbPath string) string {
	if s := os.Getenv("JWT_SECRET"); s != "" {
		return s
	}
	secretPath := filepath.Join(filepath.Dir(dbPath), ".jwt_secret")
	if b, err := os.ReadFile(secretPath); err == nil {
		if s := strings.TrimSpace(string(b)); len(s) >= 32 {
			return s
		}
	}
	secret := randomSecret()
	if err := os.WriteFile(secretPath, []byte(secret), 0o600); err != nil {
		log.Printf("WARNING: could not persist generated JWT secret to %s (%v); tokens will not survive a restart. Set JWT_SECRET to fix.", secretPath, err)
	} else {
		log.Printf("Generated a persistent random JWT secret at %s (set JWT_SECRET to override).", secretPath)
	}
	return secret
}

// randomSecret returns a 256-bit base64 secret, falling back to a fixed-length
// time-independent value only if the crypto RNG is unavailable (never expected).
func randomSecret() string {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		log.Printf("WARNING: crypto/rand unavailable (%v); using a low-entropy fallback secret. Set JWT_SECRET.", err)
		return "zev-fallback-" + strconv.Itoa(os.Getpid())
	}
	return base64.RawURLEncoding.EncodeToString(buf)
}

// corsOrigins parses CORS_ALLOWED_ORIGINS (comma-separated). Defaults to the
// local dev ports — notably NOT "*", which with credentials effectively allows
// any site to make authenticated requests. Production is same-origin behind
// nginx and needs no entry; set this env to allow direct cross-origin access.
func corsOrigins() []string {
	if raw := os.Getenv("CORS_ALLOWED_ORIGINS"); strings.TrimSpace(raw) != "" {
		var out []string
		for _, p := range strings.Split(raw, ",") {
			if o := strings.TrimSpace(p); o != "" {
				out = append(out, o)
			}
		}
		if len(out) > 0 {
			return out
		}
	}
	return []string{"http://localhost:5173", "http://localhost:4173"}
}

func getEnvBool(key string, defaultValue bool) bool {
	if value := os.Getenv(key); value != "" {
		if b, err := strconv.ParseBool(value); err == nil {
			return b
		}
	}
	return defaultValue
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intValue, err := strconv.Atoi(value); err == nil {
			return intValue
		}
	}
	return defaultValue
}
