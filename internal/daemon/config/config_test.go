package config

import "testing"

func TestLoadUsesDefaults(t *testing.T) {
	t.Setenv("GITSQUAD_API_URL", "")
	t.Setenv("GITSQUAD_DAEMON_TOKEN", "")
	t.Setenv("GITSQUAD_DAEMON_WORK_DIR", "")

	cfg := Load()

	if cfg.APIURL != "http://localhost:8080" {
		t.Fatalf("APIURL = %q, want http://localhost:8080", cfg.APIURL)
	}
	if cfg.WorkDir != ".gitsquad/workspaces" {
		t.Fatalf("WorkDir = %q, want .gitsquad/workspaces", cfg.WorkDir)
	}
	if cfg.Token != "" {
		t.Fatalf("Token = %q, want empty", cfg.Token)
	}
}

func TestLoadReadsEnvironment(t *testing.T) {
	t.Setenv("GITSQUAD_API_URL", "https://api.example.com")
	t.Setenv("GITSQUAD_DAEMON_TOKEN", "secret")
	t.Setenv("GITSQUAD_DAEMON_WORK_DIR", "D:/tmp/gitsquad")

	cfg := Load()

	if cfg.APIURL != "https://api.example.com" {
		t.Fatalf("APIURL = %q, want https://api.example.com", cfg.APIURL)
	}
	if cfg.Token != "secret" {
		t.Fatalf("Token = %q, want secret", cfg.Token)
	}
	if cfg.WorkDir != "D:/tmp/gitsquad" {
		t.Fatalf("WorkDir = %q, want D:/tmp/gitsquad", cfg.WorkDir)
	}
}
