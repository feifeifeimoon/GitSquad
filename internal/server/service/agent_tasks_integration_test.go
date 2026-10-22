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

// TestListAgentTasksIntegration covers the detail page's Recent runs: the order
// it promises, the workspace boundary it must enforce, and the failure reason
// that makes a failed row worth looking at.
//
// Skipped unless GITSQUAD_TEST_DATABASE_URL is set, like the rest.
func TestListAgentTasksIntegration(t *testing.T) {
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
	issueSvc := NewIssueService(s, nil)

	user, err := s.CreateUser(ctx, db.CreateUserParams{
		Login: fmt.Sprintf("tasks-user-%s", uuid.NewString()[:8]),
	})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	t.Cleanup(func() { cleanupUserRows(t, ctx, pool, user.ID) })

	ws := createWorkspaceForTest(ctx, t, s, user.ID, "AGT", fmt.Sprintf("agt-%s", uuid.NewString()[:8]))
	daemon, err := NewDaemonService(s).CreateDaemon(ctx, user.ID, "tasks-machine", "darwin", "arm64", "1.0.0")
	if err != nil {
		t.Fatalf("create daemon: %v", err)
	}
	agent, err := agentSvc.CreateAgent(ctx, ws.ID, user.ID, v1.CreateAgentRequest{
		Name: "planner", DaemonID: daemon.ID.String(), Provider: "claude",
	})
	if err != nil {
		t.Fatalf("create agent: %v", err)
	}
	issue, err := issueSvc.CreateIssue(ctx, ws.ID, user.ID, user.Login, IssueCreate{Title: "Fix the parser"})
	if err != nil {
		t.Fatalf("create issue: %v", err)
	}

	// Three runs, with explicit times so "newest first" is a contract rather
	// than a tie-break between rows created in the same microsecond.
	seed := func(age time.Duration, status, failureReason string) uuid.UUID {
		t.Helper()
		task, err := s.CreateTask(ctx, db.CreateTaskParams{
			WorkspaceID: ws.ID,
			Kind:        "issue",
			IssueID:     &issue.ID,
			AgentID:     agent.ID,
			Provider:    "claude",
			Context:     []byte(`{}`),
		})
		if err != nil {
			t.Fatalf("create task: %v", err)
		}
		if _, err := pool.Exec(ctx,
			`UPDATE tasks SET status = $2, failure_reason = $3, created_at = now() - $4::interval,
			        started_at = now() - $4::interval, completed_at = now() - $4::interval + interval '2 minutes'
			 WHERE id = $1`,
			task.ID, status, failureReason, age.String(),
		); err != nil {
			t.Fatalf("shape task: %v", err)
		}
		return task.ID
	}

	newest := seed(1*time.Hour, "failed", "provider_network")
	middle := seed(2*time.Hour, "completed", "")
	oldest := seed(3*time.Hour, "completed", "")

	tasks, err := agentSvc.ListAgentTasks(ctx, ws.ID, agent.ID, 20)
	if err != nil {
		t.Fatalf("ListAgentTasks: %v", err)
	}
	if len(tasks) != 3 {
		t.Fatalf("tasks = %d, want 3", len(tasks))
	}
	if got := []uuid.UUID{tasks[0].ID, tasks[1].ID, tasks[2].ID}; got[0] != newest || got[1] != middle || got[2] != oldest {
		t.Errorf("order = %v, want newest first", got)
	}

	// The key is composed from the workspace prefix, and the failure reason
	// survives — a failed row with no reason is the thing the detail page would
	// have to leave blank.
	if tasks[0].IssueKey != fmt.Sprintf("%s-%d", ws.IssuePrefix, issue.Number) {
		t.Errorf("issue key = %q", tasks[0].IssueKey)
	}
	if tasks[0].IssueTitle != "Fix the parser" {
		t.Errorf("issue title = %q", tasks[0].IssueTitle)
	}
	if tasks[0].FailureReason != "provider_network" {
		t.Errorf("failure reason = %q, want provider_network", tasks[0].FailureReason)
	}
	if tasks[1].FailureReason != "" {
		t.Errorf("a completed task carries a failure reason: %q", tasks[1].FailureReason)
	}
	if tasks[0].CompletedAt == nil || tasks[0].StartedAt == nil {
		t.Error("a finished run must carry both timestamps")
	}

	// limit is honoured, and a missing one falls back to the default rather
	// than returning nothing.
	one, err := agentSvc.ListAgentTasks(ctx, ws.ID, agent.ID, 1)
	if err != nil {
		t.Fatalf("ListAgentTasks(limit 1): %v", err)
	}
	if len(one) != 1 || one[0].ID != newest {
		t.Errorf("limit 1 returned %v", one)
	}
	all, err := agentSvc.ListAgentTasks(ctx, ws.ID, agent.ID, 0)
	if err != nil {
		t.Fatalf("ListAgentTasks(limit 0): %v", err)
	}
	if len(all) != 3 {
		t.Errorf("default limit returned %d tasks, want 3", len(all))
	}

	// Another workspace's agent is not readable through this workspace's id:
	// the workspace boundary is the agent lookup, not the task query.
	other := createWorkspaceForTest(ctx, t, s, user.ID, "OTH", fmt.Sprintf("oth-%s", uuid.NewString()[:8]))
	otherAgent, err := agentSvc.CreateAgent(ctx, other.ID, user.ID, v1.CreateAgentRequest{
		Name: "planner", DaemonID: daemon.ID.String(), Provider: "claude",
	})
	if err != nil {
		t.Fatalf("create other agent: %v", err)
	}
	if _, err := agentSvc.ListAgentTasks(ctx, ws.ID, otherAgent.ID, 20); !errors.Is(err, ErrAgentNotFound) {
		t.Errorf("cross-workspace read = %v, want ErrAgentNotFound", err)
	}
}
