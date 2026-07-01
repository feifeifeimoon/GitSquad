package daemon

import (
	"testing"

	daemonconfig "github.com/feifeifeimoon/GitSquad/internal/daemon/config"
)

func TestNew(t *testing.T) {
	cfg := daemonconfig.Config{
		APIURL: "http://localhost:8080",
		Token:  "test-token",
	}

	d := New(cfg)

	if d == nil {
		t.Fatal("New() returned nil")
	}
	if d.cfg.APIURL != "http://localhost:8080" {
		t.Fatalf("cfg.APIURL = %q, want http://localhost:8080", d.cfg.APIURL)
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
