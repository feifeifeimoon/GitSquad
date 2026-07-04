package daemon

import (
	"testing"

	daemonconfig "github.com/feifeifeimoon/GitSquad/internal/daemon/config"
	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
)

func TestNew(t *testing.T) {
	d := New()

	if d == nil {
		t.Fatal("New() returned nil")
	}
	if d.cfg.APIURL == "" {
		t.Fatal("cfg.APIURL is empty")
	}
	if d.client == nil {
		t.Fatal("client is nil")
	}
	if d.registry == nil {
		t.Fatal("registry is nil")
	}
	if d.lastRuntime == nil {
		t.Fatal("lastRuntime is nil")
	}
}

func TestNewWithConfig(t *testing.T) {
	cfg := daemonconfig.Config{
		APIURL: "http://localhost:8080",
		Token:  "test-token",
	}

	d := &Daemon{
		cfg:         cfg,
		client:      nil, // not set — tests that direct construction works
		registry:    DefaultRegistry(),
		lastRuntime: make([]v1.Runtime, 0),
	}

	if d.cfg.APIURL != "http://localhost:8080" {
		t.Fatalf("cfg.APIURL = %q, want http://localhost:8080", d.cfg.APIURL)
	}
	if d.registry == nil {
		t.Fatal("registry is nil")
	}
}
