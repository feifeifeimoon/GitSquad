package config

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestLoadUsesDefaults(t *testing.T) {
	t.Setenv("GITSQUAD_API_URL", "")
	t.Setenv("GITSQUAD_DAEMON_TOKEN", "")
	t.Setenv("GITSQUAD_DAEMON_WORK_DIR", "")

	cfg := Load()

	if cfg.APIURL != "http://localhost:8080" {
		t.Fatalf("APIURL = %q, want http://localhost:8080", cfg.APIURL)
	}

	home, _ := os.UserHomeDir()
	expectedWorkDir := filepath.Join(home, ".gitsquad", "workspaces")
	if cfg.WorkDir != expectedWorkDir {
		t.Fatalf("WorkDir = %q, want %q", cfg.WorkDir, expectedWorkDir)
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

func TestLoadDurationDefaults(t *testing.T) {
	t.Setenv("GITSQUAD_API_URL", "")
	t.Setenv("GITSQUAD_DAEMON_TOKEN", "")

	cfg := Load()

	if cfg.HeartbeatInterval != 30*time.Second {
		t.Fatalf("HeartbeatInterval = %v, want 30s", cfg.HeartbeatInterval)
	}
	if cfg.VersionCmdTimeout != 5*time.Second {
		t.Fatalf("VersionCmdTimeout = %v, want 5s", cfg.VersionCmdTimeout)
	}
	if cfg.PollInterval != 2*time.Second {
		t.Fatalf("PollInterval = %v, want 2s", cfg.PollInterval)
	}
}
