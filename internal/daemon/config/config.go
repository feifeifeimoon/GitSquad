package config

import "os"

type Config struct {
	APIURL  string
	Token   string
	WorkDir string
}

func Load() Config {
	return Config{
		APIURL:  getEnv("GITSQUAD_API_URL", "http://localhost:8080"),
		Token:   os.Getenv("GITSQUAD_DAEMON_TOKEN"),
		WorkDir: getEnv("GITSQUAD_DAEMON_WORK_DIR", ".gitsquad/workspaces"),
	}
}

func getEnv(key string, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}
