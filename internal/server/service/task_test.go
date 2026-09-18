package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/feifeifeimoon/GitSquad/internal/server/database"
	"github.com/feifeifeimoon/GitSquad/internal/server/store"
	"github.com/feifeifeimoon/GitSquad/internal/server/store/db"
	"github.com/feifeifeimoon/GitSquad/internal/util"
	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
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

// openTestStore opens + migrates the integration database, skipping the test
// when GITSQUAD_TEST_DATABASE_URL is unset.
func openTestStore(t *testing.T) (*store.Store, *pgxpool.Pool) {
	t.Helper()
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
	return store.New(pool), pool
}

type taskFixture struct {
	workspace db.Workspace
	daemon    db.Daemon
	agent     db.Agent
	issue     db.Issue
	// installationID is GitHub's numeric installation id (not the row id): the
	// webhook path resolves a workspace from it, so tests need it too.
	installationID int64
}

// seedTaskFixture creates the FK chain a task needs:
// user → installation → repo → workspace → daemon → runtime → agent → issue.
func seedTaskFixture(t *testing.T, ctx context.Context, s *store.Store, pool *pgxpool.Pool) taskFixture {
	t.Helper()
	return seedTaskFixtureOnBranch(t, ctx, s, pool, "main")
}

// seedTaskFixtureOnBranch is seedTaskFixture with the repository's default
// branch under test control: task dispatch used to hardcode "main", so every
// task on a repo whose default is master/trunk/develop failed at checkout.
func seedTaskFixtureOnBranch(t *testing.T, ctx context.Context, s *store.Store, pool *pgxpool.Pool, defaultBranch string) taskFixture {
	t.Helper()

	user, err := s.CreateUser(ctx, db.CreateUserParams{Login: fmt.Sprintf("tk-user-%s", uuid.NewString()[:8])})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	t.Cleanup(func() { _, _ = pool.Exec(ctx, "DELETE FROM users WHERE id = $1", user.ID) })

	ghInstallationID := int64(uuid.New().ID() % 1000000)
	installation, err := s.CreateInstallation(ctx, db.CreateInstallationParams{
		UserID: user.ID, InstallationID: ghInstallationID,
		AccountLogin: "tk-owner", AccountType: "User", RepositorySelection: "selected",
	})
	if err != nil {
		t.Fatalf("create installation: %v", err)
	}
	if err := s.UpsertRepo(ctx, db.UpsertRepoParams{
		InstallationID: installation.ID, GithubRepoID: int64(uuid.New().ID() % 1000000),
		Owner: "tk-owner", Name: "tk-repo", FullName: "tk-owner/tk-repo",
		DefaultBranch: defaultBranch,
	}); err != nil {
		t.Fatalf("upsert repo: %v", err)
	}
	repos, err := s.ListReposByInstallation(ctx, installation.ID)
	if err != nil || len(repos) == 0 {
		t.Fatalf("list repos: %v (n=%d)", err, len(repos))
	}

	workspace, err := s.CreateWorkspace(ctx, db.CreateWorkspaceParams{
		UserID: user.ID, InstallationID: installation.ID, GithubRepoID: repos[0].ID,
		Name: "tk-ws", IssuePrefix: "TKW",
	})
	if err != nil {
		t.Fatalf("create workspace: %v", err)
	}
	daemon, err := s.CreateDaemon(ctx, db.CreateDaemonParams{
		UserID: user.ID, Name: "tk-daemon", Os: "darwin", Arch: "arm64", DaemonVersion: "0.0.1",
	})
	if err != nil {
		t.Fatalf("create daemon: %v", err)
	}
	rt, err := s.UpsertAgentRuntime(ctx, db.UpsertAgentRuntimeParams{
		WorkspaceID: workspace.ID, DaemonID: &daemon.ID, Name: "claude", RuntimeMode: "local", Provider: "claude",
	})
	if err != nil {
		t.Fatalf("upsert runtime: %v", err)
	}
	agent, err := s.CreateAgent(ctx, db.CreateAgentParams{
		WorkspaceID: workspace.ID, Name: "coder", Instructions: "be terse",
		RuntimeID: rt.ID, Enabled: true, CreatedBy: &user.ID,
	})
	if err != nil {
		t.Fatalf("create agent: %v", err)
	}
	issue, err := s.CreateIssue(ctx, db.CreateIssueParams{
		WorkspaceID: workspace.ID, Number: 1, Title: "fix", Status: "backlog",
		CreatorUserID: &user.ID, AssignedAgents: []string{"coder"},
	})
	if err != nil {
		t.Fatalf("create issue: %v", err)
	}

	return taskFixture{workspace: workspace, daemon: daemon, agent: agent, issue: issue, installationID: ghInstallationID}
}

func (f taskFixture) contextJSON() []byte {
	return []byte(`{"agent":{"name":"coder"},"repo":{"owner":"tk-owner","name":"tk-repo","default_branch":"main"},"issue":{"key":"TKW-1","title":"fix"}}`)
}

func (f taskFixture) createTask(t *testing.T, ctx context.Context, s *store.Store) db.Task {
	t.Helper()
	task, err := s.CreateTask(ctx, db.CreateTaskParams{
		WorkspaceID: f.workspace.ID, IssueID: f.issue.ID, AgentID: f.agent.ID,
		AssignedDaemonID: &f.daemon.ID, Provider: "claude", Context: f.contextJSON(),
	})
	if err != nil {
		t.Fatalf("create task: %v", err)
	}
	return task
}

// TestTaskLifecycleQueries exercises the task state machine (queued →
// dispatched → running → failed) and task_messages against a real Postgres.
func TestTaskLifecycleQueries(t *testing.T) {
	s, pool := openTestStore(t)
	ctx := context.Background()
	f := seedTaskFixture(t, ctx, s, pool)

	// 1. CreateTask (queued).
	task := f.createTask(t, ctx, s)
	if task.Status != "queued" {
		t.Fatalf("status = %q, want queued", task.Status)
	}

	// 2. ClaimNextTask (dispatched).
	claimed, err := s.ClaimNextTask(ctx, &f.daemon.ID)
	if err != nil {
		t.Fatalf("ClaimNextTask: %v", err)
	}
	if claimed.ID != task.ID || claimed.Status != "dispatched" || claimed.DispatchedAt == nil {
		t.Fatalf("claimed = %+v, want dispatched", claimed)
	}
	if _, err := s.ClaimNextTask(ctx, &f.daemon.ID); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("second ClaimNextTask err = %v, want pgx.ErrNoRows", err)
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

	// 6. FailTasksOfSilentDaemons releases in-flight work — but only from a daemon
	// that has actually stopped checking in. Losing the socket is not evidence
	// that the daemon stopped working, so the gate is the heartbeat, not the
	// socket, and this pins both directions of it.
	const grace = 300 * time.Second
	task2 := f.createTask(t, ctx, s)
	if _, err := s.ClaimNextTask(ctx, &f.daemon.ID); err != nil {
		t.Fatalf("claim task2: %v", err)
	}

	failed, err := s.FailTasksOfSilentDaemons(ctx, grace.Seconds())
	if err != nil {
		t.Fatalf("FailTasksOfSilentDaemons: %v", err)
	}
	if len(failed) != 0 {
		t.Fatalf("a daemon that is still reporting in must keep its work, got %d failed", len(failed))
	}

	// Backdate the heartbeat past the grace; the same call must now take it.
	if _, err := pool.Exec(ctx,
		"UPDATE daemons SET last_seen_at = now() - interval '10 minutes' WHERE id = $1",
		f.daemon.ID,
	); err != nil {
		t.Fatalf("backdate heartbeat: %v", err)
	}

	failed, err = s.FailTasksOfSilentDaemons(ctx, grace.Seconds())
	if err != nil || len(failed) != 1 {
		t.Fatalf("FailTasksOfSilentDaemons: %v (n=%d)", err, len(failed))
	}
	if failed[0].ID != task2.ID || *failed[0].FailureReason != "runtime_offline" {
		t.Fatalf("failed task = %+v", failed[0])
	}

	// 7. RevertTaskToQueued hands a claimed-but-unrunnable task back.
	task3 := f.createTask(t, ctx, s)
	claimed3, err := s.ClaimNextTask(ctx, &f.daemon.ID)
	if err != nil || claimed3.ID != task3.ID || claimed3.Status != "dispatched" {
		t.Fatalf("claim task3 = %+v (err=%v)", claimed3, err)
	}
	reverted, err := s.RevertTaskToQueued(ctx, task3.ID)
	if err != nil || reverted.Status != "queued" || reverted.DispatchedAt != nil {
		t.Fatalf("RevertTaskToQueued = %+v (err=%v)", reverted, err)
	}
}

// TestTaskServiceDispatchWakesDaemon verifies that queuing work nudges the
// target daemon immediately instead of leaving it to find the task on its next
// heartbeat (up to 30s later).
func TestTaskServiceDispatchWakesDaemon(t *testing.T) {
	s, pool := openTestStore(t)
	ctx := context.Background()
	f := seedTaskFixture(t, ctx, s, pool)

	waker := &fakeWaker{}
	svc := NewTaskService(s, nil)
	svc.SetWaker(waker)

	if err := svc.Dispatch(ctx, f.workspace.ID, f.issue.ID, "coder"); err != nil {
		t.Fatalf("Dispatch: %v", err)
	}
	if len(waker.woken) != 1 || waker.woken[0] != f.daemon.ID {
		t.Fatalf("waker calls = %v, want [%s]", waker.woken, f.daemon.ID)
	}
	if pending, err := s.HasPendingForDaemon(ctx, &f.daemon.ID); err != nil || !pending {
		t.Fatalf("HasPendingForDaemon = %v (err=%v), want true", pending, err)
	}

	// A second mention of the same agent coalesces, and still wakes the daemon.
	if err := svc.Dispatch(ctx, f.workspace.ID, f.issue.ID, "coder"); err != nil {
		t.Fatalf("second Dispatch: %v", err)
	}
	if len(waker.woken) != 2 {
		t.Fatalf("waker calls = %d, want 2 (coalesced dispatch still wakes)", len(waker.woken))
	}
}

type fakeWaker struct{ woken []uuid.UUID }

func (f *fakeWaker) Wake(id uuid.UUID) { f.woken = append(f.woken, id) }

// fakeGitHub records what the task lifecycle asked GitHub to do.
type fakeGitHub struct {
	token   string
	prCalls []prCall
}

type prCall struct{ head, base string }

func (f *fakeGitHub) GetInstallationToken(context.Context, int64) (string, time.Time, error) {
	return f.token, time.Now().Add(time.Hour), nil
}

func (f *fakeGitHub) CreatePullRequest(_ context.Context, _ uuid.UUID, _, _, head, base, _, _ string) (int, error) {
	f.prCalls = append(f.prCalls, prCall{head: head, base: base})
	return 7, nil
}

// The pull request's base is the branch the daemon actually used, not the value
// snapshotted at dispatch: a repository that renamed its default branch between
// the two would otherwise get a PR against a branch that does not exist.
func TestHandleCompletedUsesReportedBaseBranch(t *testing.T) {
	s, pool := openTestStore(t)
	ctx := context.Background()
	f := seedTaskFixture(t, ctx, s, pool)
	task := f.createTask(t, ctx, s)
	if _, err := s.ClaimNextTask(ctx, &f.daemon.ID); err != nil {
		t.Fatalf("claim: %v", err)
	}

	gh := &fakeGitHub{token: "ghs_token"}
	svc := NewTaskService(s, gh)

	if err := svc.Report(ctx, f.daemon.ID, task.ID, v1.TaskReport{Status: v1.TaskReportStarted}); err != nil {
		t.Fatalf("report started: %v", err)
	}
	if err := svc.Report(ctx, f.daemon.ID, task.ID, v1.TaskReport{
		Status: v1.TaskReportSucceeded,
		Summary: &v1.TaskSummary{
			Output:     "done",
			Branch:     "gitsquad/TKW-1/task-1",
			BaseBranch: "trunk",
		},
	}); err != nil {
		t.Fatalf("report succeeded: %v", err)
	}

	if len(gh.prCalls) != 1 {
		t.Fatalf("CreatePullRequest calls = %d, want 1", len(gh.prCalls))
	}
	if gh.prCalls[0].base != "trunk" {
		t.Errorf("PR base = %q, want the branch the daemon reported (trunk)", gh.prCalls[0].base)
	}
	if gh.prCalls[0].head != "gitsquad/TKW-1/task-1" {
		t.Errorf("PR head = %q, want the task branch", gh.prCalls[0].head)
	}
}

// Dispatch must carry the repository's real default branch: the daemon resets
// the checkout to it and diffs against it, so a hardcoded "main" fails every
// task on a repo that calls its default something else.
func TestDispatchCarriesTheRepositoryDefaultBranch(t *testing.T) {
	s, pool := openTestStore(t)
	ctx := context.Background()
	f := seedTaskFixtureOnBranch(t, ctx, s, pool, "trunk")

	svc := NewTaskService(s, nil)
	svc.SetWaker(&fakeWaker{})
	if err := svc.Dispatch(ctx, f.workspace.ID, f.issue.ID, "coder"); err != nil {
		t.Fatalf("Dispatch: %v", err)
	}

	claimed, err := s.ClaimNextTask(ctx, &f.daemon.ID)
	if err != nil {
		t.Fatalf("claim: %v", err)
	}
	full, err := taskContext(claimed)
	if err != nil {
		t.Fatalf("taskContext: %v", err)
	}
	if full.Repo.DefaultBranch != "trunk" {
		t.Errorf("task default branch = %q, want the repo's own \"trunk\"", full.Repo.DefaultBranch)
	}
}

// TestTaskServicePostsAgentOutput pins the artifact contract: a finished task's
// agent output becomes an issue comment — the deliverable for analysis / design
// work — and the issue waits for a human even though no code changed.
//
// The GitHub service is nil on purpose: this path must not touch the repo.
func TestTaskServicePostsAgentOutput(t *testing.T) {
	s, pool := openTestStore(t)
	ctx := context.Background()
	f := seedTaskFixture(t, ctx, s, pool)
	task := f.createTask(t, ctx, s)
	if _, err := s.ClaimNextTask(ctx, &f.daemon.ID); err != nil {
		t.Fatalf("claim: %v", err)
	}

	svc := NewTaskService(s, nil)

	if err := svc.Report(ctx, f.daemon.ID, task.ID, v1.TaskReport{Status: v1.TaskReportStarted}); err != nil {
		t.Fatalf("report started: %v", err)
	}

	const analysis = "Root cause is a nil deref in the login handler."
	if err := svc.Report(ctx, f.daemon.ID, task.ID, v1.TaskReport{
		Status:  v1.TaskReportSucceeded,
		Summary: &v1.TaskSummary{Output: analysis},
	}); err != nil {
		t.Fatalf("report succeeded: %v", err)
	}

	comments, err := s.ListCommentsByIssue(ctx, f.issue.ID)
	if err != nil {
		t.Fatalf("list comments: %v", err)
	}
	var postedAsAgent bool
	for _, c := range comments {
		if strings.Contains(c.Content, analysis) {
			postedAsAgent = c.AuthorType == "agent" && c.AuthorName == "coder"
		}
	}
	if !postedAsAgent {
		t.Fatalf("agent output was not posted as an agent comment: %+v", comments)
	}

	fresh, err := s.GetTask(ctx, task.ID)
	if err != nil || fresh.Status != "completed" {
		t.Fatalf("task = %+v (err=%v), want completed", fresh, err)
	}
	issueRow, err := s.GetIssue(ctx, db.GetIssueParams{ID: f.issue.ID, WorkspaceID: f.workspace.ID})
	if err != nil || issueRow.Status != "in_review" {
		t.Fatalf("issue status = %q (err=%v), want in_review", issueRow.Status, err)
	}
}
