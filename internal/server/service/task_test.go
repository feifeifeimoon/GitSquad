package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"testing"

	"github.com/feifeifeimoon/GitSquad/internal/server/database"
	"github.com/feifeifeimoon/GitSquad/internal/server/store"
	"github.com/feifeifeimoon/GitSquad/internal/server/store/db"
	"github.com/feifeifeimoon/GitSquad/internal/util"
	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func TestTaskContextRoundTrip(t *testing.T) {
	in := v1.Task{
		WorkspaceID: uuid.New(),
		Issue: v1.TaskIssueContext{
			Key:         "GTS-1",
			Title:       "fix",
			Description: "desc",
			Comments:    []v1.TaskComment{{AuthorName: "a", Type: "comment", Content: "c"}},
		},
		Repo:  v1.TaskRepoContext{Owner: "o", Name: "n", DefaultBranch: "main"},
		Agent: v1.TaskAgentContext{Name: "coder", Provider: "claude"},
	}
	raw, err := json.Marshal(in)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	out, err := taskContext(db.Task{Context: raw})
	if err != nil {
		t.Fatalf("taskContext: %v", err)
	}
	if out.Issue.Key != "GTS-1" || out.Agent.Name != "coder" || out.Repo.Owner != "o" {
		t.Errorf("round trip = %+v", out)
	}
}

// TestTaskLifecycleQueries exercises the task state machine (queued →
// dispatched → running → failed) and task_messages against a real Postgres.
// Skipped unless GITSQUAD_TEST_DATABASE_URL is set.
func TestTaskLifecycleQueries(t *testing.T) {
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

	// Seed: user → installation → repo → workspace → daemon → agent_runtime → agent → issue.
	user, _ := s.CreateUser(ctx, db.CreateUserParams{Login: fmt.Sprintf("tk-user-%s", uuid.NewString()[:8])})
	t.Cleanup(func() { _, _ = pool.Exec(ctx, "DELETE FROM users WHERE id = $1", user.ID) })

	installation, _ := s.CreateInstallation(ctx, db.CreateInstallationParams{
		UserID: user.ID, InstallationID: int64(uuid.New().ID() % 1000000),
		AccountLogin: "tk-owner", AccountType: "User", RepositorySelection: "selected",
	})
	_ = installation

	if err := s.UpsertRepo(ctx, db.UpsertRepoParams{
		InstallationID: installation.ID, GithubRepoID: int64(uuid.New().ID() % 1000000),
		Owner: "tk-owner", Name: "tk-repo", FullName: "tk-owner/tk-repo", Private: false,
	}); err != nil {
		t.Fatalf("upsert repo: %v", err)
	}
	repos, err := s.ListReposByInstallation(ctx, installation.ID)
	if err != nil || len(repos) == 0 {
		t.Fatalf("list repos: %v (n=%d)", err, len(repos))
	}
	repo := repos[0]

	workspace, _ := s.CreateWorkspace(ctx, db.CreateWorkspaceParams{
		UserID: user.ID, InstallationID: installation.ID, GithubRepoID: repo.ID,
		Name: "tk-ws", IssuePrefix: "TKW",
	})

	daemon, _ := s.CreateDaemon(ctx, db.CreateDaemonParams{
		UserID: user.ID, Name: "tk-daemon", Os: "darwin", Arch: "arm64", DaemonVersion: "0.0.1",
	})

	rt, _ := s.UpsertAgentRuntime(ctx, db.UpsertAgentRuntimeParams{
		WorkspaceID: workspace.ID, DaemonID: &daemon.ID, Name: "claude", RuntimeMode: "local", Provider: "claude",
	})

	agent, _ := s.CreateAgent(ctx, db.CreateAgentParams{
		WorkspaceID: workspace.ID, Name: "coder", Instructions: "be terse",
		RuntimeID: rt.ID, Enabled: true, CreatedBy: &user.ID,
	})

	issue, _ := s.CreateIssue(ctx, db.CreateIssueParams{
		WorkspaceID: workspace.ID, Number: 1, Title: "fix", Status: "backlog",
		CreatorUserID: &user.ID, AssignedAgents: []string{"coder"},
	})

	// 1. CreateTask (queued).
	task, err := s.CreateTask(ctx, db.CreateTaskParams{
		WorkspaceID: workspace.ID, IssueID: issue.ID, AgentID: agent.ID,
		AssignedDaemonID: &daemon.ID, Provider: "claude", Model: "", Context: []byte(`{"repo":{"owner":"tk-owner"}}`),
	})
	if err != nil {
		t.Fatalf("CreateTask: %v", err)
	}
	if task.Status != "queued" {
		t.Fatalf("status = %q, want queued", task.Status)
	}

	// 2. ClaimNextTask (dispatched).
	claimed, err := s.ClaimNextTask(ctx, &daemon.ID)
	if err != nil {
		t.Fatalf("ClaimNextTask: %v", err)
	}
	if claimed.ID != task.ID || claimed.Status != "dispatched" || claimed.DispatchedAt == nil {
		t.Fatalf("claimed = %+v, want dispatched", claimed)
	}
	// A second claim finds nothing.
	if _, err := s.ClaimNextTask(ctx, &daemon.ID); err == nil {
		t.Fatal("second ClaimNextTask should return no rows")
	}

	// 3. MarkTaskRunning. A replay must be a no-op (compare-and-set gate).
	if _, err := s.MarkTaskRunning(ctx, task.ID); err != nil {
		t.Fatalf("MarkTaskRunning: %v", err)
	}
	if _, err := s.MarkTaskRunning(ctx, task.ID); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("second MarkTaskRunning err = %v, want pgx.ErrNoRows", err)
	}

	// 4. InsertTaskMessage + ListTaskMessages.
	if _, err := s.InsertTaskMessage(ctx, db.InsertTaskMessageParams{
		TaskID: task.ID, Seq: 1, Type: "text", Content: util.OrNil("working"),
	}); err != nil {
		t.Fatalf("InsertTaskMessage: %v", err)
	}
	msgs, err := s.ListTaskMessages(ctx, db.ListTaskMessagesParams{TaskID: task.ID, Seq: 0})
	if err != nil || len(msgs) != 1 {
		t.Fatalf("ListTaskMessages: %v (n=%d)", err, len(msgs))
	}

	// 5. MarkTaskFailed, then a replayed terminal report must find no row.
	if _, err := s.MarkTaskFailed(ctx, db.MarkTaskFailedParams{
		ID: task.ID, Error: "boom", FailureReason: util.Ptr("agent_error"),
	}); err != nil {
		t.Fatalf("MarkTaskFailed: %v", err)
	}
	if _, err := s.MarkTaskFailed(ctx, db.MarkTaskFailedParams{
		ID: task.ID, Error: "again", FailureReason: util.Ptr("agent_error"),
	}); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("second MarkTaskFailed err = %v, want pgx.ErrNoRows", err)
	}

	// 6. FailDaemonTasks marks in-flight tasks failed (runtime_offline).
	task2, _ := s.CreateTask(ctx, db.CreateTaskParams{
		WorkspaceID: workspace.ID, IssueID: issue.ID, AgentID: agent.ID,
		AssignedDaemonID: &daemon.ID, Provider: "claude", Context: []byte(`{}`),
	})
	_, _ = s.ClaimNextTask(ctx, &daemon.ID) // task2 → dispatched
	failed, err := s.FailDaemonTasks(ctx, &daemon.ID)
	if err != nil || len(failed) != 1 {
		t.Fatalf("FailDaemonTasks: %v (n=%d)", err, len(failed))
	}
	if failed[0].ID != task2.ID || *failed[0].FailureReason != "runtime_offline" {
		t.Fatalf("failed task = %+v", failed[0])
	}

	// 7. RevertTaskToQueued hands a claimed-but-unrunnable task back.
	task3, _ := s.CreateTask(ctx, db.CreateTaskParams{
		WorkspaceID: workspace.ID, IssueID: issue.ID, AgentID: agent.ID,
		AssignedDaemonID: &daemon.ID, Provider: "claude", Context: []byte(`{}`),
	})
	claimed3, err := s.ClaimNextTask(ctx, &daemon.ID)
	if err != nil || claimed3.ID != task3.ID || claimed3.Status != "dispatched" {
		t.Fatalf("claim task3 = %+v (err=%v)", claimed3, err)
	}
	reverted, err := s.RevertTaskToQueued(ctx, task3.ID)
	if err != nil || reverted.Status != "queued" || reverted.DispatchedAt != nil {
		t.Fatalf("RevertTaskToQueued = %+v (err=%v)", reverted, err)
	}
}
