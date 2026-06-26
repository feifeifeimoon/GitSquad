package config

import "testing"

func TestLoadUsesDefaults(t *testing.T) {
	t.Setenv("GITSQUAD_HTTP_ADDR", "")
	t.Setenv("GITSQUAD_DATABASE_URL", "")
	t.Setenv("GITSQUAD_ENV", "")

	cfg, _ := Load()

	if cfg.HTTPAddr != ":8080" {
		t.Fatalf("HTTPAddr = %q, want :8080", cfg.HTTPAddr)
	}
	if cfg.Environment != "development" {
		t.Fatalf("Environment = %q, want development", cfg.Environment)
	}
	if cfg.DatabaseURL != "" {
		t.Fatalf("DatabaseURL = %q, want empty", cfg.DatabaseURL)
	}
}

func TestLoadReadsEnvironment(t *testing.T) {
	t.Setenv("GITSQUAD_HTTP_ADDR", ":9090")
	t.Setenv("GITSQUAD_DATABASE_URL", "postgres://example")
	t.Setenv("GITSQUAD_ENV", "test")

	cfg, _ := Load()

	if cfg.HTTPAddr != ":9090" {
		t.Fatalf("HTTPAddr = %q, want :9090", cfg.HTTPAddr)
	}
	if cfg.DatabaseURL != "postgres://example" {
		t.Fatalf("DatabaseURL = %q, want postgres://example", cfg.DatabaseURL)
	}
	if cfg.Environment != "test" {
		t.Fatalf("Environment = %q, want test", cfg.Environment)
	}
}
