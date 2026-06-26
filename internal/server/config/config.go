package config

import (
	"fmt"
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	HTTPAddr    string
	DatabaseURL string
	Environment string

	// Google OAuth
	GoogleClientID     string
	GoogleClientSecret string
	GoogleCallbackURL  string

	// JWT
	JWTSecret string

	// Frontend URL for OAuth redirect callback
	FrontendURL string
}

func Load() (Config, error) {
	_ = godotenv.Load()

	cfg := Config{
		HTTPAddr:    getEnv("GITSQUAD_HTTP_ADDR", ":8080"),
		DatabaseURL: os.Getenv("GITSQUAD_DATABASE_URL"),
		Environment: getEnv("GITSQUAD_ENV", "development"),

		GoogleClientID:     os.Getenv("GITSQUAD_GOOGLE_CLIENT_ID"),
		GoogleClientSecret: os.Getenv("GITSQUAD_GOOGLE_CLIENT_SECRET"),
		GoogleCallbackURL:  getEnv("GITSQUAD_GOOGLE_CALLBACK_URL", "http://localhost:8080/api/v1/auth/google/callback"),
		JWTSecret:          getEnv("GITSQUAD_JWT_SECRET", "gitsquad-dev-secret"),
		FrontendURL:        getEnv("GITSQUAD_FRONTEND_URL", "http://localhost:3000"),
	}

	if err := cfg.validate(); err != nil {
		return Config{}, err
	}

	return cfg, nil
}

func (c Config) validate() error {
	if c.DatabaseURL == "" {
		return fmt.Errorf("GITSQUAD_DATABASE_URL is required")
	}
	if c.GoogleClientID == "" {
		return fmt.Errorf("GITSQUAD_GOOGLE_CLIENT_ID is required")
	}
	if c.GoogleClientSecret == "" {
		return fmt.Errorf("GITSQUAD_GOOGLE_CLIENT_SECRET is required")
	}
	return nil
}

func getEnv(key string, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}
