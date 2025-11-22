package config

import (
	"os"
)

type Config struct {
	DatabasePath  string
	ServerAddress string
	JWTSecret     string
}

func Load() *Config {
	return &Config{
		DatabasePath:  getEnv("DATABASE_PATH", "./zev-billing.db"),
		ServerAddress: getEnv("SERVER_ADDRESS", ":8081"),//8081
		JWTSecret:     getEnv("JWT_SECRET", "zev-billing-secret-change-in-production"),
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}