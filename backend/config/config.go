package config

import (
	"os"
	"strconv"
)

// defaultLicensePublicKey is the Ed25519 public key (base64) used to verify
// license keys offline. The matching PRIVATE key is held only by the vendor and
// is used by ./cmd/licensegen to sign keys — it must never ship with the app.
// Override at deploy time with LICENSE_PUBLIC_KEY if you generate your own pair.
const defaultLicensePublicKey = "JDUtLiro2UP0VTNXHwHgBbu75bOb16Cyy53LZ6gss0M="

type Config struct {
	DatabasePath     string
	ServerAddress    string
	ServerPort       int
	JWTSecret        string
	LicensePublicKey string
}

func Load() *Config {
	// Get port from environment, default to 8080
	port := getEnvInt("SERVER_PORT", 8080)

	return &Config{
		DatabasePath:     getEnv("DATABASE_PATH", "./zev-billing.db"),
		ServerAddress:    ":" + strconv.Itoa(port),
		ServerPort:       port,
		JWTSecret:        getEnv("JWT_SECRET", "zev-billing-secret-change-in-production"),
		LicensePublicKey: getEnv("LICENSE_PUBLIC_KEY", defaultLicensePublicKey),
	}
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
