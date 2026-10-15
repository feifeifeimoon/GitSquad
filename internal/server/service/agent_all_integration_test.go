package service

import (
	"context"
	"fmt"
	"os"
	"slices"
	"testing"

	"github.com/feifeifeimoon/GitSquad/internal/server/database"
	"github.com/feifeifeimoon/GitSquad/internal/server/store"
	"github.com/feifeifeimoon/GitSquad/internal/server/store/db"
	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
	"github.com/google/uuid"
)

// TestListAllAgentsIntegration covers the All Workspaces roster: the second
// cross-workspace read, and the one where the workspace column matters most —
// "planner" is a name people reuse.
//
// Skipped unless GITSQUAD_TEST_DATABASE_URL is set, like the rest.
func TestListAllAgentsIntegration(t *testing.T) {
	dsn := os.Getenv("GITSQUAD_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("GITSQUAD_TEST_DATABASE_URL not set; skipping integration test")
	}

	ctx := context.Background()
	pool, err := database.Open(ctx, dsn)
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(pool.Close)
	if err := database.Migrate(ctx, pool); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	s := store.New(pool)
	agentSvc := NewAgentService(s)
	daemonSvc := NewDaemonService(s)

	user, err := s.CreateUser(ctx, db.CreateUserParams{
		Login: fmt.Sprintf("agents-user-%s", uuid.NewString()[:8]),
	})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	t.Cleanup(func() { cleanupUserRows(t, ctx, pool, user.ID) })

	alpha := createWorkspaceForTest(ctx, t, s, user.ID, "ALA", fmt.Sprintf("ala-%s", uuid.NewString()[:8]))
	beta := createWorkspaceForTest(ctx, t, s, user.ID, "BEA", fmt.Sprintf("bea-%s", uuid.NewString()[:8]))
	archived := createWorkspaceForTest(ctx, t, s, user.ID, "ARA", fmt.Sprintf("ara-%s", uuid.NewString()[:8]))
	if err := s.UpdateWorkspaceStatus(ctx, db.UpdateWorkspaceStatusParams{
		ID: archived.ID, Status: "archived",
	}); err != nil {
		t.Fatalf("archive workspace: %v", err)
	}

	// One machine backing runtimes in both workspaces, which is the situation
	// the whole page exists for.
	daemon, err := daemonSvc.CreateDaemon(ctx, user.ID, "agents-daemon", "darwin", "arm64", "1.0.0")
	if err != nil {
		t.Fatalf("create daemon: %v", err)
	}

	// The same name in two workspaces, on purpose: it is what the workspace
	// column is for, and it is allowed — names are unique per workspace.
	newAgent := func(workspaceID uuid.UUID, name string) *v1.Agent {
		t.Helper()
		agent, err := agentSvc.CreateAgent(ctx, workspaceID, user.ID, v1.CreateAgentRequest{
			Name: name, DaemonID: daemon.ID.String(), Provider: "claude",
		})
		if err != nil {
			t.Fatalf("create agent %s: %v", name, err)
		}
		return agent
	}
	newAgent(alpha.ID, "planner")
	newAgent(alpha.ID, "reviewer")
	newAgent(beta.ID, "planner")
	newAgent(archived.ID, "ghost")

	// Someone else's workspace, with an agent of their own.
	stranger, err := s.CreateUser(ctx, db.CreateUserParams{
		Login: fmt.Sprintf("agents-stranger-%s", uuid.NewString()[:8]),
	})
	if err != nil {
		t.Fatalf("create stranger: %v", err)
	}
	t.Cleanup(func() { cleanupUserRows(t, ctx, pool, stranger.ID) })
	strangerWS := createWorkspaceForTest(ctx, t, s, stranger.ID, "STA", fmt.Sprintf("sta-%s", uuid.NewString()[:8]))
	strangerDaemon, err := daemonSvc.CreateDaemon(ctx, stranger.ID, "stranger-daemon", "linux", "amd64", "1.0.0")
	if err != nil {
		t.Fatalf("create stranger daemon: %v", err)
	}
	if _, err := agentSvc.CreateAgent(ctx, strangerWS.ID, stranger.ID, v1.CreateAgentRequest{
		Name: "not-yours", DaemonID: strangerDaemon.ID.String(), Provider: "codex",
	}); err != nil {
		t.Fatalf("create stranger agent: %v", err)
	}

	list, err := agentSvc.ListAllAgents(ctx, user.ID)
	if err != nil {
		t.Fatalf("list all agents: %v", err)
	}

	// 1. Mine only: three across two workspaces, not the archived one, not the
	//    stranger's.
	if len(list) != 3 {
		t.Fatalf("list len = %d, want 3", len(list))
	}
	for _, agent := range list {
		if agent.Name == "ghost" || agent.Name == "not-yours" {
			t.Errorf("leaked an agent that is not mine: %q", agent.Name)
		}
	}

	// 2. Ordered by workspace, then name — a roster reads better grouped.
	got := make([]string, len(list))
	for i, agent := range list {
		got[i] = agent.WorkspaceName + "/" + agent.Name
	}
	// The order the page shows is the order the query promises. Only the inside
	// of a group is asserted: the two workspaces this test seeds are both named
	// "Integration Workspace" (the helper hardcodes it), so which of them comes
	// first is an unspecified tie-break rather than a contract.
	var alphaOrder []string
	for _, agent := range list {
		if agent.WorkspaceSlug == alpha.Slug {
			alphaOrder = append(alphaOrder, agent.Name)
		}
	}
	if !slices.Equal(alphaOrder, []string{"planner", "reviewer"}) {
		t.Errorf("agents in %s came back %v, want [planner reviewer]", alpha.Slug, alphaOrder)
	}
	// The two workspaces were created with the same name by the helper, so the
	// slug is what tells them apart below.
	byName := map[string]v1.Agent{}
	for _, agent := range list {
		byName[agent.WorkspaceSlug+"/"+agent.Name] = agent
	}
	alphaPlanner, ok := byName[alpha.Slug+"/planner"]
	if !ok {
		t.Fatalf("no planner in %s (got %v)", alpha.Slug, got)
	}
	if alphaPlanner.WorkspaceName != alpha.Name {
		t.Errorf("planner workspace = %q, want %q", alphaPlanner.WorkspaceName, alpha.Name)
	}
	betaPlanner, ok := byName[beta.Slug+"/planner"]
	if !ok {
		t.Fatalf("no planner in %s (got %v)", beta.Slug, got)
	}
	// The two rows are different agents that happen to share a name.
	if alphaPlanner.ID == betaPlanner.ID {
		t.Error("the two planners are the same row")
	}

	// 3. The runtime rode along, so a row can say what it runs on.
	if alphaPlanner.Runtime == nil || alphaPlanner.Runtime.DaemonName != daemon.Name {
		t.Errorf("planner runtime = %+v, want daemon %q", alphaPlanner.Runtime, daemon.Name)
	}

	// 4. The workspace-scoped list is unchanged: no workspace fields, and the
	//    table there draws no workspace column off their absence.
	scoped, err := agentSvc.ListAgents(ctx, alpha.ID)
	if err != nil {
		t.Fatalf("list alpha agents: %v", err)
	}
	if len(scoped) != 2 {
		t.Fatalf("scoped list len = %d, want 2", len(scoped))
	}
	for _, agent := range scoped {
		if agent.WorkspaceSlug != "" || agent.WorkspaceName != "" {
			t.Errorf("the scoped list carries workspace fields: %q/%q",
				agent.WorkspaceSlug, agent.WorkspaceName)
		}
	}
}
