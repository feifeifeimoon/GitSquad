package config

import (
	"fmt"
	"log"
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	HTTPAddr    string
	DatabaseURL string
	Environment string

	// GitHub OAuth
	GitHubClientID     string
	GitHubClientSecret string
	GitHubCallbackURL  string

	// JWT
	JWTSecret string

	// Frontend URL for OAuth redirect callback
	FrontendURL string
}

func Load() Config {
	// Load .env file if present; ignore error (file is optional).
	_ = godotenv.Load()

	cfg := Config{
		HTTPAddr:    getEnv("GITSQUAD_HTTP_ADDR", ":8080"),
		DatabaseURL: os.Getenv("GITSQUAD_DATABASE_URL"),
		Environment: getEnv("GITSQUAD_ENV", "development"),

		GitHubClientID:     os.Getenv("GITSQUAD_GITHUB_CLIENT_ID"),
		GitHubClientSecret: os.Getenv("GITSQUAD_GITHUB_CLIENT_SECRET"),
		GitHubCallbackURL:  getEnv("GITSQUAD_GITHUB_CALLBACK_URL", "http://localhost:8080/api/v1/auth/github/callback"),
		JWTSecret:          getEnv("GITSQUAD_JWT_SECRET", "gitsquad-dev-secret"),
		FrontendURL:        getEnv("GITSQUAD_FRONTEND_URL", "http://localhost:3000"),
	}

	if err := cfg.validate(); err != nil {
		log.Fatalf("invalid config: %v", err)
	}

	return cfg
}

func (c Config) validate() error {
	if c.DatabaseURL == "" {
		return fmt.Errorf("GITSQUAD_DATABASE_URL is required")
	}
	if c.GitHubClientID == "" {
		return fmt.Errorf("GITSQUAD_GITHUB_CLIENT_ID is required")
	}
	if c.GitHubClientSecret == "" {
		return fmt.Errorf("GITSQUAD_GITHUB_CLIENT_SECRET is required")
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
