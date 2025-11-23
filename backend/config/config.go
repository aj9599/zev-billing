package config

import (
	"os"
	"strconv"
)

type Config struct {
	DatabasePath  string
	ServerAddress string
	ServerPort    int
	JWTSecret     string
}

func Load() *Config {
	// Get port from environment, default to 8080
	port := getEnvInt("SERVER_PORT", 8080)
	
	return &Config{
		DatabasePath:  getEnv("DATABASE_PATH", "./zev-billing.db"),
		ServerAddress: ":" + strconv.Itoa(port),
		ServerPort:    port,
		JWTSecret:     getEnv("JWT_SECRET", "zev-billing-secret-change-in-production"),
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