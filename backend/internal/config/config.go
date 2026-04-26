package config

import (
	"errors"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Addr        string
	DatabaseDSN string
	JWTSecret   string
	TokenTTL    time.Duration
	AppEnv      string
}

func Load() Config {
	ttlDays, _ := strconv.Atoi(getenv("TOKEN_TTL_DAYS", "7"))
	return Config{
		Addr:        getenv("API_ADDR", ":8080"),
		DatabaseDSN: getenv("DATABASE_DSN", "root:password@tcp(mysql:3306)/diary?charset=utf8mb4&parseTime=True&loc=Local"),
		JWTSecret:   getenv("JWT_SECRET", "dev-secret-change-me"),
		TokenTTL:    time.Duration(ttlDays) * 24 * time.Hour,
		AppEnv:      getenv("APP_ENV", "development"),
	}
}

func (c Config) Validate() error {
	if c.TokenTTL <= 0 {
		return errors.New("TOKEN_TTL_DAYS must be greater than 0")
	}
	if strings.EqualFold(c.AppEnv, "production") && isWeakSecret(c.JWTSecret) {
		return errors.New("JWT_SECRET must be changed to a strong value in production")
	}
	return nil
}

func isWeakSecret(secret string) bool {
	return secret == "" || secret == "dev-secret-change-me" || len(secret) < 32
}

func getenv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
