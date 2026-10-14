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

// TestListAllIssuesIntegration covers the console's one cross-workspace read:
// the board you get in the All Workspaces scope.
//
// Three properties matter and each has its own section below — it spans every
// workspace the caller owns, it says which workspace each issue came from, and
// it does not leak another user's work. The last one is the reason this is an
// integration test rather than a unit test with a fake store: the scoping is in
// the SQL, so a fake would only be asserting that the fake was written.
//
// Skipped unless GITSQUAD_TEST_DATABASE_URL is set, like the rest.
func TestListAllIssuesIntegration(t *testing.T) {
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
	issueSvc := NewIssueService(s)
	agentSvc := NewAgentService(s)
	daemonSvc := NewDaemonService(s)

	user, err := s.CreateUser(ctx, db.CreateUserParams{
		Login: fmt.Sprintf("all-user-%s", uuid.NewString()[:8]),
	})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	t.Cleanup(func() { cleanupUserRows(t, ctx, pool, user.ID) })

	alpha := createWorkspaceForTest(ctx, t, s, user.ID, "ALP", fmt.Sprintf("alp-%s", uuid.NewString()[:8]))
	beta := createWorkspaceForTest(ctx, t, s, user.ID, "BET", fmt.Sprintf("bet-%s", uuid.NewString()[:8]))
	archived := createWorkspaceForTest(ctx, t, s, user.ID, "ARC", fmt.Sprintf("arc-%s", uuid.NewString()[:8]))
	if err := s.UpdateWorkspaceStatus(ctx, db.UpdateWorkspaceStatusParams{
		ID: archived.ID, Status: "archived",
	}); err != nil {
		t.Fatalf("archive workspace: %v", err)
	}

	// One agent on the alpha issue, so the board's per-card agents have to
	// resolve across workspaces too — the second read this endpoint makes.
	daemon, err := daemonSvc.CreateDaemon(ctx, user.ID, "all-daemon", "darwin", "arm64", "1.0.0")
	if err != nil {
		t.Fatalf("create daemon: %v", err)
	}
	planner, err := agentSvc.CreateAgent(ctx, alpha.ID, user.ID, v1.CreateAgentRequest{
		Name: "planner", DaemonID: daemon.ID.String(), Provider: "claude",
	})
	if err != nil {
		t.Fatalf("create agent: %v", err)
	}

	alphaIssue, err := issueSvc.CreateIssue(ctx, alpha.ID, user.ID, user.Login, IssueCreate{
		Title:    "Alpha one",
		AgentIDs: []uuid.UUID{planner.ID},
	})
	if err != nil {
		t.Fatalf("create alpha issue: %v", err)
	}
	if _, err := issueSvc.CreateIssue(ctx, beta.ID, user.ID, user.Login, IssueCreate{
		Title: "Beta one",
	}); err != nil {
		t.Fatalf("create beta issue: %v", err)
	}
	if _, err := issueSvc.CreateIssue(ctx, archived.ID, user.ID, user.Login, IssueCreate{
		Title: "Archived one",
	}); err != nil {
		t.Fatalf("create archived issue: %v", err)
	}

	// Someone else's workspace, with an issue in it.
	stranger, err := s.CreateUser(ctx, db.CreateUserParams{
		Login: fmt.Sprintf("all-stranger-%s", uuid.NewString()[:8]),
	})
	if err != nil {
		t.Fatalf("create stranger: %v", err)
	}
	t.Cleanup(func() { cleanupUserRows(t, ctx, pool, stranger.ID) })
	strangerWS := createWorkspaceForTest(ctx, t, s, stranger.ID, "STR", fmt.Sprintf("str-%s", uuid.NewString()[:8]))
	if _, err := issueSvc.CreateIssue(ctx, strangerWS.ID, stranger.ID, stranger.Login, IssueCreate{
		Title: "Not yours",
	}); err != nil {
		t.Fatalf("create stranger issue: %v", err)
	}

	list, err := issueSvc.ListAllIssues(ctx, user.ID)
	if err != nil {
		t.Fatalf("list all issues: %v", err)
	}

	// 1. Both of mine, neither the archived one nor the stranger's.
	byKey := map[string]v1.Issue{}
	for _, issue := range list {
		byKey[issue.IssueKey] = issue
	}
	if len(list) != 2 {
		t.Fatalf("list len = %d (%v), want 2: alpha and beta only", len(list), keysOf(byKey))
	}

	// 2. The key is per workspace, so the board cannot be read by key alone —
	//    each row has to say where it came from. Both are "…-1".
	got, ok := byKey["ALP-1"]
	if !ok {
		t.Fatalf("no ALP-1 in %v", keysOf(byKey))
	}
	if got.WorkspaceSlug != alpha.Slug || got.WorkspaceName != alpha.Name {
		t.Errorf("ALP-1 workspace = %q/%q, want %q/%q",
			got.WorkspaceSlug, got.WorkspaceName, alpha.Slug, alpha.Name)
	}
	other, ok := byKey["BET-1"]
	if !ok {
		t.Fatalf("no BET-1 in %v", keysOf(byKey))
	}
	if other.WorkspaceSlug != beta.Slug {
		t.Errorf("BET-1 workspace = %q, want %q", other.WorkspaceSlug, beta.Slug)
	}

	// 3. The agents rode along, resolved per issue, across the workspace read.
	if len(got.Agents) != 1 || got.Agents[0].Name != "planner" {
		t.Errorf("ALP-1 agents = %v, want [planner]", got.Agents)
	}
	if len(other.Agents) != 0 {
		t.Errorf("BET-1 agents = %v, want none", other.Agents)
	}

	// 4. The workspace-scoped list is unchanged: same issues, and no workspace
	//    fields — a board inside one workspace has nothing to disambiguate, and
	//    the card draws its chip off these being absent.
	scoped, err := issueSvc.ListIssues(ctx, alpha.ID)
	if err != nil {
		t.Fatalf("list alpha issues: %v", err)
	}
	if len(scoped) != 1 {
		t.Fatalf("scoped list len = %d, want 1", len(scoped))
	}
	if scoped[0].WorkspaceSlug != "" || scoped[0].WorkspaceName != "" {
		t.Errorf("the scoped list carries workspace fields: %q/%q",
			scoped[0].WorkspaceSlug, scoped[0].WorkspaceName)
	}
	if scoped[0].ID != alphaIssue.ID {
		t.Errorf("scoped list returned the wrong issue: %v", scoped[0].ID)
	}
}

func keysOf(byKey map[string]v1.Issue) []string {
	out := make([]string, 0, len(byKey))
	for k := range byKey {
		out = append(out, k)
	}
	return out
}
