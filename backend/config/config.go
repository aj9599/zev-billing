package config

import (
	"log"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	DatabasePath           string
	ServerAddress          string
	ServerPort             int
	JWTSecret              string
	FirebaseEncryptionKey  string
	LogLevel               string
}

func Load() *Config {
	// Get port from environment variable
	// Priority: SERVER_PORT > PORT > default 8080
	port := getEnvInt("SERVER_PORT", getEnvInt("PORT", 8080))
	
	// Get Firebase encryption key (required for production)
	firebaseKey := os.Getenv("FIREBASE_ENCRYPTION_KEY")
	if firebaseKey == "" {
		log.Println("⚠️  WARNING: FIREBASE_ENCRYPTION_KEY not set!")
		log.Println("⚠️  Firebase credentials will not be encrypted.")
		log.Println("⚠️  This is acceptable for development but NOT for production.")
		log.Println("⚠️  Generate a key with: go run tools/generate_encryption_key.go")
	}
	
	// Get JWT secret (warn if using default)
	jwtSecret := getEnv("JWT_SECRET", "zev-billing-secret-change-in-production")
	if jwtSecret == "zev-billing-secret-change-in-production" {
		log.Println("⚠️  WARNING: Using default JWT_SECRET!")
		log.Println("⚠️  Set JWT_SECRET environment variable for production.")
	}
	
	config := &Config{
		DatabasePath:          getEnv("DATABASE_PATH", getEnv("DB_PATH", "./zev-billing.db")),
		ServerAddress:         ":" + strconv.Itoa(port),
		ServerPort:            port,
		JWTSecret:             jwtSecret,
		FirebaseEncryptionKey: firebaseKey,
		LogLevel:              getEnv("LOG_LEVEL", "info"),
	}
	
	// Log loaded configuration (without secrets)
	log.Printf("📋 Configuration loaded:")
	log.Printf("   Database: %s", config.DatabasePath)
	log.Printf("   Server Port: %d", config.ServerPort)
	log.Printf("   Log Level: %s", config.LogLevel)
	log.Printf("   Firebase Encryption: %s", boolToStatus(firebaseKey != ""))
	log.Printf("   JWT Secret: %s", boolToStatus(jwtSecret != "zev-billing-secret-change-in-production"))
	
	return config
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

func boolToStatus(b bool) string {
	if b {
		return "✅ Set"
	}
	return "❌ Not Set"
}

// GetPort returns the server port from environment or default
// Useful for platforms like Heroku, Cloud Run, etc. that set PORT
func GetPort() int {
	return getEnvInt("SERVER_PORT", getEnvInt("PORT", 8080))
}

// IsDevelopment checks if we're in development mode
func IsDevelopment() bool {
	env := strings.ToLower(getEnv("ENVIRONMENT", getEnv("ENV", "development")))
	return env == "development" || env == "dev"
}

// IsProduction checks if we're in production mode
func IsProduction() bool {
	env := strings.ToLower(getEnv("ENVIRONMENT", getEnv("ENV", "development")))
	return env == "production" || env == "prod"
}