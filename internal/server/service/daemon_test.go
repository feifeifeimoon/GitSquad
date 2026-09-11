package service

import (
	"context"
	"fmt"
	"os"
	"testing"

	"github.com/feifeifeimoon/GitSquad/internal/server/database"
	"github.com/feifeifeimoon/GitSquad/internal/server/store"
	"github.com/feifeifeimoon/GitSquad/internal/server/store/db"
	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
	"github.com/google/uuid"
)

func TestRuntimeStatus(t *testing.T) {
	if got := runtimeStatus(""); got != "available" {
		t.Errorf("runtimeStatus(\"\") = %q, want available", got)
	}
	if got := runtimeStatus("error"); got != "error" {
		t.Errorf("runtimeStatus(\"error\") = %q, want error", got)
	}
	if got := runtimeStatus("available"); got != "available" {
		t.Errorf("runtimeStatus(\"available\") = %q, want available", got)
	}
}

// TestDaemonServiceReplaceRuntimes verifies that status/diagnostics reported
// by the daemon are persisted (not hardcoded to available/nil). Skipped
// unless GITSQUAD_TEST_DATABASE_URL is set.
func TestDaemonServiceReplaceRuntimes(t *testing.T) {
	dsn := os.Getenv("GITSQUAD_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("GITSQUAD_TEST_DATABASE_URL not set; skipping integration test")
	}

	ctx := context.Background()
	pool, err := database.Open(ctx, dsn)
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer pool.Close()
	if err := database.Migrate(ctx, pool); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	s := store.New(pool)
	svc := NewDaemonService(s)

	user, err := s.CreateUser(ctx, db.CreateUserParams{Login: fmt.Sprintf("dm-user-%s", uuid.NewString()[:8])})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, "DELETE FROM users WHERE id = $1", user.ID)
	})

	daemon, err := svc.CreateDaemon(ctx, user.ID, "it-machine", "darwin", "arm64", "0.0.1")
	if err != nil {
		t.Fatalf("create daemon: %v", err)
	}

	err = svc.ReplaceRuntimes(ctx, daemon.ID, []v1.Runtime{
		{Kind: "claude", ExecutablePath: "/usr/bin/claude", Version: "2.1.5", MaxConcurrency: 1, Status: "available"},
		{Kind: "codex", ExecutablePath: "/usr/bin/codex", Version: "0.99.0", MaxConcurrency: 1, Status: "error", Diagnostics: "below min version"},
	})
	if err != nil {
		t.Fatalf("ReplaceRuntimes: %v", err)
	}

	daemons, err := svc.FindByUserID(ctx, user.ID)
	if err != nil || len(daemons) != 1 {
		t.Fatalf("FindByUserID: %v (n=%d)", err, len(daemons))
	}
	byKind := map[string]v1.Runtime{}
	for _, rt := range daemons[0].Runtimes {
		byKind[rt.Kind] = rt
	}

	if got := byKind["claude"].Status; got != "available" {
		t.Errorf("claude status = %q, want available", got)
	}
	if got := byKind["codex"].Status; got != "error" {
		t.Errorf("codex status = %q, want error", got)
	}
	if got := byKind["codex"].Diagnostics; got != "below min version" {
		t.Errorf("codex diagnostics = %q, want below min version", got)
	}
}
