package config

import "os"

type Config struct {
	HTTPAddr    string
	DatabaseURL string
	Environment string
}

func Load() Config {
	return Config{
		HTTPAddr:    getEnv("GITSQUAD_HTTP_ADDR", ":8080"),
		DatabaseURL: os.Getenv("GITSQUAD_DATABASE_URL"),
		Environment: getEnv("GITSQUAD_ENV", "development"),
	}
}

func getEnv(key string, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}
