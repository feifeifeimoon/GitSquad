package service

import (
	"context"
	"errors"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/feifeifeimoon/GitSquad/internal/server/database"
	"github.com/feifeifeimoon/GitSquad/internal/server/store"
	"github.com/feifeifeimoon/GitSquad/internal/server/store/db"
	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
	"github.com/google/uuid"
)

// TestDaemonDetailAndAgentStatusIntegration exercises the data path behind the
// daemon detail page and the agent status column against a real Postgres:
// per-runtime versions, agents bound to a runtime across workspaces, and the
// workload counts / in-flight issue the UI derives status from. Skipped unless
// GITSQUAD_TEST_DATABASE_URL is set.
func TestDaemonDetailAndAgentStatusIntegration(t *testing.T) {
	dsn := os.Getenv("GITSQUAD_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("GITSQUAD_TEST_DATABASE_URL not set; skipping integration test")
	}

	ctx := context.Background()
	pool, err := database.Open(ctx, dsn)
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	// t.Cleanup, not defer: the row deletes registered below run through this
	// pool, and t.Cleanup is LIFO, so a defer here would close it first.
	t.Cleanup(pool.Close)
	if err := database.Migrate(ctx, pool); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	s := store.New(pool)
	daemonSvc := NewDaemonService(s)
	agentSvc := NewAgentService(s)
	issueSvc := NewIssueService(s, nil)

	user, err := s.CreateUser(ctx, db.CreateUserParams{
		Login:     fmt.Sprintf("dd-user-%s", uuid.NewString()[:8]),
		AvatarUrl: nil,
	})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, "DELETE FROM workspaces WHERE user_id = $1", user.ID)
		_, _ = pool.Exec(ctx, "DELETE FROM github_repos WHERE installation_id IN (SELECT id FROM github_installations WHERE user_id = $1)", user.ID)
		_, _ = pool.Exec(ctx, "DELETE FROM github_installations WHERE user_id = $1", user.ID)
		_, _ = pool.Exec(ctx, "DELETE FROM runtimes WHERE daemon_id IN (SELECT id FROM daemons WHERE user_id = $1)", user.ID)
		_, _ = pool.Exec(ctx, "DELETE FROM daemons WHERE user_id = $1", user.ID)
		_, _ = pool.Exec(ctx, "DELETE FROM users WHERE id = $1", user.ID)
	})

	ws := createWorkspaceForTest(ctx, t, s, user.ID, "ITD", fmt.Sprintf("itd-%s", uuid.NewString()[:8]))

	daemon, err := daemonSvc.CreateDaemon(ctx, user.ID, "it-machine", "darwin", "arm64", "1.0.0")
	if err != nil {
		t.Fatalf("create daemon: %v", err)
	}
	// A reported runtime carries the CLI version the daemon detected; an error
	// runtime carries why it is unusable.
	if err := daemonSvc.ReplaceRuntimes(ctx, daemon.ID, []v1.Runtime{
		{Kind: "claude", ExecutablePath: "/usr/bin/claude", Version: "2.1.5", MaxConcurrency: 2, Status: "available"},
		{Kind: "codex", ExecutablePath: "/usr/bin/codex", Version: "0.99.0", MaxConcurrency: 1, Status: "error", Diagnostics: "below min version"},
	}); err != nil {
		t.Fatalf("ReplaceRuntimes: %v", err)
	}

	runtimes, err := daemonSvc.ListRuntimes(ctx, daemon.ID)
	if err != nil {
		t.Fatalf("ListRuntimes: %v", err)
	}
	if len(runtimes) != 2 {
		t.Fatalf("ListRuntimes n = %d, want 2", len(runtimes))
	}
	byKind := map[string]v1.Runtime{}
	for _, rt := range runtimes {
		byKind[rt.Kind] = rt
	}
	if got := byKind["claude"].Version; got != "2.1.5" {
		t.Errorf("claude version = %q, want 2.1.5", got)
	}
	if got := byKind["claude"].MaxConcurrency; got != 2 {
		t.Errorf("claude max_concurrency = %d, want 2", got)
	}
	if got := byKind["codex"].Diagnostics; got != "below min version" {
		t.Errorf("codex diagnostics = %q, want it preserved", got)
	}

	agent, err := agentSvc.CreateAgent(ctx, ws.ID, user.ID, v1.CreateAgentRequest{
		Name: "coder", DaemonID: daemon.ID.String(), Provider: "claude",
	})
	if err != nil {
		t.Fatalf("CreateAgent: %v", err)
	}

	// Idle: a live-looking daemon with nothing queued.
	listed, err := agentSvc.ListAgents(ctx, ws.ID)
	if err != nil || len(listed) != 1 {
		t.Fatalf("ListAgents: %v (n=%d)", err, len(listed))
	}
	if listed[0].RunningCount != 0 || listed[0].QueuedCount != 0 || listed[0].TotalRuns != 0 {
		t.Errorf("idle agent workload = %d/%d/%d, want 0/0/0",
			listed[0].RunningCount, listed[0].QueuedCount, listed[0].TotalRuns)
	}
	if listed[0].CurrentTask != nil {
		t.Errorf("idle agent current task = %+v, want nil", listed[0].CurrentTask)
	}

	issue, err := issueSvc.CreateIssue(ctx, ws.ID, user.ID, user.Login, "Fix the thing", "", "")
	if err != nil {
		t.Fatalf("CreateIssue: %v", err)
	}
	if _, err := s.CreateTask(ctx, db.CreateTaskParams{
		WorkspaceID:      ws.ID,
		IssueID:          issue.ID,
		AgentID:          agent.ID,
		AssignedDaemonID: &daemon.ID,
		Provider:         "claude",
		Context:          []byte(`{}`),
	}); err != nil {
		t.Fatalf("CreateTask: %v", err)
	}
	// A claimed task sits in 'dispatched' until the daemon reports "started";
	// it is already running on that machine, so the UI counts it as running.
	if _, err := s.ClaimNextTask(ctx, &daemon.ID); err != nil {
		t.Fatalf("ClaimNextTask: %v", err)
	}

	listed, err = agentSvc.ListAgents(ctx, ws.ID)
	if err != nil {
		t.Fatalf("ListAgents after claim: %v", err)
	}
	if listed[0].RunningCount != 1 {
		t.Errorf("running_count = %d, want 1 (dispatched counts as running)", listed[0].RunningCount)
	}
	if listed[0].CurrentTask == nil {
		t.Fatalf("current task = nil, want the claimed issue")
	}
	if want := "ITD-" + fmt.Sprint(issue.Number); listed[0].CurrentTask.IssueKey != want {
		t.Errorf("current task key = %q, want %q", listed[0].CurrentTask.IssueKey, want)
	}
	if listed[0].CurrentTask.IssueTitle != "Fix the thing" {
		t.Errorf("current task title = %q, want %q", listed[0].CurrentTask.IssueTitle, "Fix the thing")
	}

	// The daemon page's query carries the workspace the agent lives in, so the
	// row can link back to it.
	bound, err := agentSvc.ListAgentsByDaemon(ctx, daemon.ID, user.ID)
	if err != nil {
		t.Fatalf("ListAgentsByDaemon: %v", err)
	}
	if len(bound) != 1 {
		t.Fatalf("ListAgentsByDaemon n = %d, want 1", len(bound))
	}
	if bound[0].Provider != "claude" {
		t.Errorf("provider = %q, want claude (the runtime it is grouped under)", bound[0].Provider)
	}
	if bound[0].WorkspaceSlug != ws.Slug || bound[0].WorkspaceName != ws.Name {
		t.Errorf("workspace = %q/%q, want %q/%q",
			bound[0].WorkspaceSlug, bound[0].WorkspaceName, ws.Slug, ws.Name)
	}
	if bound[0].CurrentTask == nil || bound[0].RunningCount != 1 {
		t.Errorf("daemon-bound agent lost its workload: %+v", bound[0])
	}

	// Another user must not see this daemon's agents.
	if other, err := agentSvc.ListAgentsByDaemon(ctx, daemon.ID, uuid.New()); err != nil {
		t.Errorf("ListAgentsByDaemon for a stranger: %v", err)
	} else if len(other) != 0 {
		t.Errorf("ListAgentsByDaemon leaked %d agents to a non-owner", len(other))
	}

	testDaemonRename(ctx, t, s, daemonSvc, user.ID, daemon.ID)
}

// testDaemonRename covers the rename rules: trim, no-op, uniqueness per user,
// and ownership.
func testDaemonRename(ctx context.Context, t *testing.T, s *store.Store, svc *DaemonService, userID, daemonID uuid.UUID) {
	t.Helper()

	renamed, err := svc.RenameDaemon(ctx, userID, daemonID, "  My laptop  ")
	if err != nil {
		t.Fatalf("RenameDaemon: %v", err)
	}
	if renamed.Name != "My laptop" {
		t.Errorf("name = %q, want the trimmed %q", renamed.Name, "My laptop")
	}
	// Round-trip through the database, not just the returned value.
	reloaded, err := svc.FindByID(ctx, daemonID)
	if err != nil || reloaded.Name != "My laptop" {
		t.Errorf("FindByID name = %q (err %v), want My laptop", reloaded.Name, err)
	}

	// Renaming to the current name is a no-op, not a conflict.
	if _, err := svc.RenameDaemon(ctx, userID, daemonID, "My laptop"); err != nil {
		t.Errorf("idempotent rename: %v", err)
	}

	if _, err := svc.RenameDaemon(ctx, userID, daemonID, "   "); !errors.Is(err, ErrInvalidDaemonName) {
		t.Errorf("blank name err = %v, want ErrInvalidDaemonName", err)
	}
	// Names are unique per user because pairing reuses a daemon row by name.
	if _, err := svc.RenameDaemon(ctx, userID, daemonID, string(make([]byte, 65))); !errors.Is(err, ErrInvalidDaemonName) {
		t.Errorf("overlong name err = %v, want ErrInvalidDaemonName", err)
	}

	other, err := svc.CreateDaemon(ctx, userID, "other-machine", "linux", "amd64", "1.0.0")
	if err != nil {
		t.Fatalf("create second daemon: %v", err)
	}
	if _, err := svc.RenameDaemon(ctx, userID, daemonID, "other-machine"); !errors.Is(err, ErrDaemonNameTaken) {
		t.Errorf("duplicate name err = %v, want ErrDaemonNameTaken", err)
	}
	if _, err := svc.RenameDaemon(ctx, uuid.New(), other.ID, "whatever"); !errors.Is(err, ErrDaemonNotFound) {
		t.Errorf("non-owner rename err = %v, want ErrDaemonNotFound", err)
	}
}

// createWorkspaceForTest seeds the GitHub rows a workspace needs. The real
// creation path requires a GitHub App installation.
func createWorkspaceForTest(ctx context.Context, t *testing.T, s *store.Store, userID uuid.UUID, prefix, slug string) db.Workspace {
	t.Helper()

	installation, err := s.CreateInstallation(ctx, db.CreateInstallationParams{
		UserID:              userID,
		InstallationID:      time.Now().UnixNano(),
		AccountLogin:        "it-owner",
		AccountType:         "User",
		RepositorySelection: "selected",
	})
	if err != nil {
		t.Fatalf("create installation: %v", err)
	}
	if err := s.UpsertRepo(ctx, db.UpsertRepoParams{
		InstallationID: installation.ID,
		GithubRepoID:   time.Now().UnixNano(),
		Owner:          "it-owner",
		Name:           "it-repo",
		FullName:       "it-owner/it-repo",
		Private:        false,
	}); err != nil {
		t.Fatalf("upsert repo: %v", err)
	}
	repos, err := s.ListReposByInstallation(ctx, installation.ID)
	if err != nil || len(repos) == 0 {
		t.Fatalf("list repos: %v (n=%d)", err, len(repos))
	}

	ws, err := s.CreateWorkspace(ctx, db.CreateWorkspaceParams{
		UserID:         userID,
		InstallationID: installation.ID,
		GithubRepoID:   repos[0].ID,
		Name:           "Integration Workspace",
		IssuePrefix:    prefix,
		Slug:           slug,
	})
	if err != nil {
		t.Fatalf("create workspace: %v", err)
	}
	return ws
}
