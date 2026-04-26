package config

import (
	"strings"
	"testing"
	"time"
)

func TestProductionRejectsWeakJWTSecret(t *testing.T) {
	cfg := Config{AppEnv: "production", JWTSecret: "dev-secret-change-me", TokenTTL: 7 * 24 * time.Hour}
	if err := cfg.Validate(); err == nil || !strings.Contains(err.Error(), "JWT_SECRET") {
		t.Fatalf("expected weak secret error, got %v", err)
	}
}

func TestDevelopmentAllowsDefaultJWTSecret(t *testing.T) {
	cfg := Config{AppEnv: "development", JWTSecret: "dev-secret-change-me", TokenTTL: 7 * 24 * time.Hour}
	if err := cfg.Validate(); err != nil {
		t.Fatalf("expected default dev secret to be allowed, got %v", err)
	}
}

func TestRejectsNonPositiveTokenTTL(t *testing.T) {
	cfg := Config{AppEnv: "development", JWTSecret: "secret", TokenTTL: 0}
	if err := cfg.Validate(); err == nil || !strings.Contains(err.Error(), "TOKEN_TTL_DAYS") {
		t.Fatalf("expected ttl error, got %v", err)
	}
}
