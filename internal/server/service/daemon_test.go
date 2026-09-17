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
	"github.com/jackc/pgx/v5/pgxpool"
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
		cleanupUserRows(t, ctx, pool, user.ID)
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

// A daemon that is heartbeating is online by definition.
//
// Before the batched flush carried the online assertion, only a brand new
// WebSocket connection could move a daemon from offline back to online. A status
// flag left wrong by a late disconnect therefore stuck for as long as the daemon
// stayed connected: the console showed it offline, task wakes were dropped as
// "not connected", and only the 30s heartbeat pull kept any work moving.
func TestDaemonHeartbeatRestoresOnlineStatus(t *testing.T) {
	s, pool := openTestStore(t)
	ctx := context.Background()
	svc := NewDaemonService(s)

	user, err := s.CreateUser(ctx, db.CreateUserParams{
		Login: fmt.Sprintf("hb-user-%s", uuid.NewString()[:8]),
	})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	t.Cleanup(func() { cleanupUserRows(t, ctx, pool, user.ID) })

	daemon, err := svc.CreateDaemon(ctx, user.ID, "hb-machine", "darwin", "arm64", "0.0.1")
	if err != nil {
		t.Fatalf("create daemon: %v", err)
	}

	readStatus := func() string {
		t.Helper()
		d, err := svc.FindByID(ctx, daemon.ID)
		if err != nil {
			t.Fatalf("FindByID: %v", err)
		}
		return d.Status
	}

	// Stand in for the wrong flag a stale disconnect leaves behind.
	if err := svc.MarkOffline(ctx, daemon.ID); err != nil {
		t.Fatalf("MarkOffline: %v", err)
	}
	if got := readStatus(); got != "offline" {
		t.Fatalf("status after MarkOffline = %q, want offline", got)
	}

	// One batched flush — the write that repeats every 60s while a daemon lives.
	if err := s.DaemonHeartbeat(ctx, daemon.ID); err != nil {
		t.Fatalf("DaemonHeartbeat: %v", err)
	}

	if got := readStatus(); got != v1.DaemonStatusOnline {
		t.Fatalf("status after a heartbeat = %q, want %q — an offline flag must not outlive the next heartbeat",
			got, v1.DaemonStatusOnline)
	}
}

// cleanupUserRows removes a test user and everything it owns.
//
// No foreign key referencing users(id) has ON DELETE CASCADE, so a bare
// `DELETE FROM users` fails as soon as the user owns a daemon, workspace or
// installation — and because the error used to be discarded, the rows leaked on
// every run. Delete in dependency order and report failures.
func cleanupUserRows(t *testing.T, ctx context.Context, pool *pgxpool.Pool, userID uuid.UUID) {
	t.Helper()
	for _, stmt := range []string{
		"DELETE FROM runtimes WHERE daemon_id IN (SELECT id FROM daemons WHERE user_id = $1)",
		"DELETE FROM daemons WHERE user_id = $1",
		"DELETE FROM user_identities WHERE user_id = $1",
		"DELETE FROM users WHERE id = $1",
	} {
		if _, err := pool.Exec(ctx, stmt, userID); err != nil {
			t.Errorf("cleanup %q: %v", stmt, err)
		}
	}
}
