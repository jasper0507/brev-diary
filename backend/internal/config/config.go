package config

import (
	"os"
	"strconv"
	"time"
)

type Config struct {
	Addr        string
	DatabaseDSN string
	JWTSecret   string
	TokenTTL    time.Duration
}

func Load() Config {
	ttlDays, _ := strconv.Atoi(getenv("TOKEN_TTL_DAYS", "7"))
	return Config{
		Addr:        getenv("API_ADDR", ":8080"),
		DatabaseDSN: getenv("DATABASE_DSN", "root:password@tcp(mysql:3306)/diary?charset=utf8mb4&parseTime=True&loc=Local"),
		JWTSecret:   getenv("JWT_SECRET", "dev-secret-change-me"),
		TokenTTL:    time.Duration(ttlDays) * 24 * time.Hour,
	}
}

func getenv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
