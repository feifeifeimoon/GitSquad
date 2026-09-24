package service

import (
	"context"
	"errors"
	"fmt"
	"os"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/feifeifeimoon/GitSquad/internal/server/database"
	"github.com/feifeifeimoon/GitSquad/internal/server/store"
	"github.com/feifeifeimoon/GitSquad/internal/server/store/db"
	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
	"github.com/google/uuid"
)

// TestIssueServiceIntegration exercises the full issue blackboard flow
// against a real Postgres instance. It is skipped unless
// GITSQUAD_TEST_DATABASE_URL is set, so `go test ./...` stays green in CI
// without a database.
func TestIssueServiceIntegration(t *testing.T) {
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

	// Seed a user, GitHub installation, repo and workspace owned by the user.
	user, err := s.CreateUser(ctx, db.CreateUserParams{
		Login:     fmt.Sprintf("it-user-%s", uuid.NewString()[:8]),
		AvatarUrl: nil,
	})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	t.Cleanup(func() { cleanupUserRows(t, ctx, pool, user.ID) })

	installation, err := s.CreateInstallation(ctx, db.CreateInstallationParams{
		UserID:              user.ID,
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

	workspace, err := s.CreateWorkspace(ctx, db.CreateWorkspaceParams{
		UserID:         user.ID,
		InstallationID: installation.ID,
		GithubRepoID:   repos[0].ID,
		Name:           "Integration Workspace",
		IssuePrefix:    "ITW",
	})
	if err != nil {
		t.Fatalf("create workspace: %v", err)
	}

	svc := NewIssueService(s)

	// 1. Create with an unmatched @mention → numbering + system hint.
	issue, err := svc.CreateIssue(ctx, workspace.ID, user.ID, user.Login, IssueCreate{
		Title:       "Fix the thing",
		Description: "please @coder handle this",
	})
	if err != nil {
		t.Fatalf("create issue: %v", err)
	}
	if issue.Status != "backlog" {
		t.Fatalf("issue status = %q, want backlog", issue.Status)
	}
	if issue.IssueKey != "ITW-1" {
		t.Fatalf("issue key = %q, want ITW-1", issue.IssueKey)
	}
	if issue.CreatorName != user.Login {
		t.Fatalf("creator name = %q, want %q", issue.CreatorName, user.Login)
	}

	// 2. Second issue increments the number.
	issue2, err := svc.CreateIssue(ctx, workspace.ID, user.ID, user.Login, IssueCreate{Title: "Second"})
	if err != nil {
		t.Fatalf("create issue 2: %v", err)
	}
	if issue2.IssueKey != "ITW-2" {
		t.Fatalf("issue 2 key = %q, want ITW-2", issue2.IssueKey)
	}

	// 3. List returns both.
	list, err := svc.ListIssues(ctx, workspace.ID)
	if err != nil {
		t.Fatalf("list issues: %v", err)
	}
	if len(list) != 2 {
		t.Fatalf("list len = %d, want 2", len(list))
	}

	// 4. Detail includes the system hint for the unmatched mention.
	detail, err := svc.GetIssue(ctx, workspace.ID, issue.ID)
	if err != nil {
		t.Fatalf("get issue: %v", err)
	}
	if len(detail.Comments) != 1 {
		t.Fatalf("comments len = %d, want 1", len(detail.Comments))
	}
	if detail.Comments[0].Type != "system" {
		t.Fatalf("comment type = %q, want system", detail.Comments[0].Type)
	}

	// 5. Status change appends a status_change comment.
	status := "in_progress"
	updated, err := svc.UpdateIssue(ctx, workspace.ID, issue.ID, user.Login, IssueUpdate{Status: &status})
	if err != nil {
		t.Fatalf("update issue: %v", err)
	}
	if updated.Status != "in_progress" {
		t.Fatalf("updated status = %q, want in_progress", updated.Status)
	}
	if updated.CommentsCount != 2 {
		t.Fatalf("updated comments_count = %d, want 2 (system hint + status_change)", updated.CommentsCount)
	}

	detail, err = svc.GetIssue(ctx, workspace.ID, issue.ID)
	if err != nil {
		t.Fatalf("get issue after update: %v", err)
	}
	var sawStatusChange bool
	for _, c := range detail.Comments {
		if c.Type == "status_change" {
			sawStatusChange = true
		}
	}
	if !sawStatusChange {
		t.Fatalf("expected a status_change comment, got %+v", detail.Comments)
	}

	// 6. Comment with unmatched mention also appends a hint; empty is rejected.
	if _, err := svc.AddComment(ctx, workspace.ID, issue.ID, user.ID, user.Login, "   "); err != ErrEmptyComment {
		t.Fatalf("empty comment err = %v, want ErrEmptyComment", err)
	}
	if _, err := svc.AddComment(ctx, workspace.ID, issue.ID, user.ID, user.Login, "nice work @ghost"); err != nil {
		t.Fatalf("add comment: %v", err)
	}

	// 7. Invalid status is rejected.
	bad := "open"
	if _, err := svc.UpdateIssue(ctx, workspace.ID, issue.ID, user.Login, IssueUpdate{Status: &bad}); err != ErrInvalidStatus {
		t.Fatalf("invalid status err = %v, want ErrInvalidStatus", err)
	}
}

// TestIssueAssignmentIntegration covers the agent side of assignment against a
// real Postgres: the roster is where ids come from, a request replaces the whole
// set, a deleted agent cascades out of every issue, and the per-issue state
// follows the task queue rather than the agent's newest task anywhere. Skipped
// unless GITSQUAD_TEST_DATABASE_URL is set.
func TestIssueAssignmentIntegration(t *testing.T) {
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
	daemonSvc := NewDaemonService(s)
	agentSvc := NewAgentService(s)
	issueSvc := NewIssueService(s)

	user, err := s.CreateUser(ctx, db.CreateUserParams{
		Login: fmt.Sprintf("ia-user-%s", uuid.NewString()[:8]),
	})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	t.Cleanup(func() { cleanupUserRows(t, ctx, pool, user.ID) })

	ws := createWorkspaceForTest(ctx, t, s, user.ID, "ITA", fmt.Sprintf("ita-%s", uuid.NewString()[:8]))

	daemon, err := daemonSvc.CreateDaemon(ctx, user.ID, "it-assign", "darwin", "arm64", "1.0.0")
	if err != nil {
		t.Fatalf("create daemon: %v", err)
	}
	if err := daemonSvc.ReplaceRuntimes(ctx, daemon.ID, []v1.Runtime{
		{Kind: "claude", ExecutablePath: "/usr/bin/claude", Version: "2.1.5", MaxConcurrency: 2, Status: "available"},
	}); err != nil {
		t.Fatalf("ReplaceRuntimes: %v", err)
	}

	newAgent := func(name string) *v1.Agent {
		t.Helper()
		a, err := agentSvc.CreateAgent(ctx, ws.ID, user.ID, v1.CreateAgentRequest{
			Name: name, DaemonID: daemon.ID.String(), Provider: "claude",
		})
		if err != nil {
			t.Fatalf("create agent %s: %v", name, err)
		}
		return a
	}
	planner := newAgent("planner")
	reviewer := newAgent("reviewer")
	// Disabled on purpose: enabled gates whether an agent can run, not whether
	// it can be assigned. The picker greys it out; the API still accepts it.
	ghost := newAgent("ghost")
	off := false
	if _, err := agentSvc.UpdateAgent(ctx, ws.ID, ghost.ID, v1.UpdateAgentRequest{Enabled: &off}); err != nil {
		t.Fatalf("disable ghost: %v", err)
	}

	agentsOf := func(issueID uuid.UUID) []v1.IssueAgent {
		t.Helper()
		detail, err := issueSvc.GetIssue(ctx, ws.ID, issueID)
		if err != nil {
			t.Fatalf("get issue: %v", err)
		}
		return detail.Agents
	}
	names := func(agents []v1.IssueAgent) []string {
		out := make([]string, len(agents))
		for i, a := range agents {
			out[i] = a.Name
		}
		return out
	}

	// 1. An explicit assignment is stored in roster order, whatever order the
	//    caller sent, and starts idle (nothing is queued for a new issue).
	issue, err := issueSvc.CreateIssue(ctx, ws.ID, user.ID, user.Login, IssueCreate{
		Title:    "Assign me",
		AgentIDs: []uuid.UUID{reviewer.ID, planner.ID},
	})
	if err != nil {
		t.Fatalf("create issue: %v", err)
	}
	if got := names(issue.Agents); !reflect.DeepEqual(got, []string{"planner", "reviewer"}) {
		t.Fatalf("created agents = %v, want [planner reviewer] (roster order)", got)
	}
	for _, a := range issue.Agents {
		if a.State != v1.AgentStateIdle {
			t.Errorf("agent %s state = %q, want idle", a.Name, a.State)
		}
	}

	// 2. A mention in the description assigns as well — that is the existing
	//    behaviour, now landing in the join table.
	mentioned, err := issueSvc.CreateIssue(ctx, ws.ID, user.ID, user.Login, IssueCreate{
		Title:       "Mention",
		Description: "@planner take a look",
	})
	if err != nil {
		t.Fatalf("create mentioned issue: %v", err)
	}
	if got := names(mentioned.Agents); !reflect.DeepEqual(got, []string{"planner"}) {
		t.Fatalf("mentioned agents = %v, want [planner]", got)
	}

	// 3. An update replaces the whole set, and the feed records the change with
	//    both sides named.
	one := []uuid.UUID{reviewer.ID}
	updated, err := issueSvc.UpdateIssue(ctx, ws.ID, issue.ID, user.Login, IssueUpdate{AgentIDs: &one})
	if err != nil {
		t.Fatalf("replace assignment: %v", err)
	}
	if got := names(updated.Agents); !reflect.DeepEqual(got, []string{"reviewer"}) {
		t.Fatalf("replaced agents = %v, want [reviewer]", got)
	}
	assignmentNotes := func() []string {
		t.Helper()
		detail, err := issueSvc.GetIssue(ctx, ws.ID, issue.ID)
		if err != nil {
			t.Fatalf("get issue: %v", err)
		}
		var notes []string
		for _, c := range detail.Comments {
			if c.Type == "agents_change" {
				notes = append(notes, c.Content)
			}
		}
		return notes
	}
	notes := assignmentNotes()
	if len(notes) != 1 {
		t.Fatalf("agents_change comments = %d, want 1 (%v)", len(notes), notes)
	}
	if !strings.Contains(notes[0], "@planner、@reviewer → @reviewer") {
		t.Errorf("note = %q, want both sides named", notes[0])
	}

	// 4. Re-sending the same set writes nothing — the diff is a set, not a slice.
	if _, err := issueSvc.UpdateIssue(ctx, ws.ID, issue.ID, user.Login, IssueUpdate{AgentIDs: &one}); err != nil {
		t.Fatalf("resend same set: %v", err)
	}
	if notes := assignmentNotes(); len(notes) != 1 {
		t.Fatalf("agents_change comments = %d after a no-op resend, want 1", len(notes))
	}

	// 5. An empty list clears the assignment, and the feed says so.
	clear := []uuid.UUID{}
	cleared, err := issueSvc.UpdateIssue(ctx, ws.ID, issue.ID, user.Login, IssueUpdate{AgentIDs: &clear})
	if err != nil {
		t.Fatalf("clear assignment: %v", err)
	}
	if len(cleared.Agents) != 0 {
		t.Fatalf("cleared agents = %v, want none", names(cleared.Agents))
	}
	if notes := assignmentNotes(); len(notes) != 2 || !strings.Contains(notes[1], "@reviewer → 无") {
		t.Fatalf("notes after clearing = %v, want the second to read @reviewer → 无", notes)
	}

	// 6. A disabled agent can still be assigned, and a status-only edit leaves
	//    the assignment alone.
	disabled := []uuid.UUID{ghost.ID}
	if _, err := issueSvc.UpdateIssue(ctx, ws.ID, issue.ID, user.Login, IssueUpdate{AgentIDs: &disabled}); err != nil {
		t.Fatalf("assign disabled agent: %v", err)
	}
	status := "todo"
	afterStatus, err := issueSvc.UpdateIssue(ctx, ws.ID, issue.ID, user.Login, IssueUpdate{Status: &status})
	if err != nil {
		t.Fatalf("status-only update: %v", err)
	}
	if got := names(afterStatus.Agents); !reflect.DeepEqual(got, []string{"ghost"}) {
		t.Fatalf("agents after a status edit = %v, want [ghost] untouched", got)
	}

	// 7. Unknown ids, and ids from another workspace, are refused.
	unknown := []uuid.UUID{uuid.New()}
	if _, err := issueSvc.UpdateIssue(ctx, ws.ID, issue.ID, user.Login, IssueUpdate{AgentIDs: &unknown}); !errors.Is(err, ErrUnknownAgent) {
		t.Fatalf("unknown agent err = %v, want ErrUnknownAgent", err)
	}
	otherWS := createWorkspaceForTest(ctx, t, s, user.ID, "ITB", fmt.Sprintf("itb-%s", uuid.NewString()[:8]))
	foreign, err := agentSvc.CreateAgent(ctx, otherWS.ID, user.ID, v1.CreateAgentRequest{
		Name: "foreign", DaemonID: daemon.ID.String(), Provider: "claude",
	})
	if err != nil {
		t.Fatalf("create foreign agent: %v", err)
	}
	foreignIDs := []uuid.UUID{foreign.ID}
	if _, err := issueSvc.UpdateIssue(ctx, ws.ID, issue.ID, user.Login, IssueUpdate{AgentIDs: &foreignIDs}); !errors.Is(err, ErrUnknownAgent) {
		t.Fatalf("foreign agent err = %v, want ErrUnknownAgent", err)
	}

	// 8. State follows this issue's queue: queued while a task waits, running
	//    once a daemon claims it.
	only := []uuid.UUID{planner.ID}
	if _, err := issueSvc.UpdateIssue(ctx, ws.ID, issue.ID, user.Login, IssueUpdate{AgentIDs: &only}); err != nil {
		t.Fatalf("assign planner: %v", err)
	}
	if _, err := s.CreateTask(ctx, db.CreateTaskParams{
		WorkspaceID:      ws.ID,
		IssueID:          issue.ID,
		AgentID:          planner.ID,
		AssignedDaemonID: &daemon.ID,
		Provider:         "claude",
		Context:          []byte(`{}`),
	}); err != nil {
		t.Fatalf("CreateTask: %v", err)
	}
	if got := agentsOf(issue.ID); got[0].State != v1.AgentStateQueued {
		t.Fatalf("state with a queued task = %q, want queued", got[0].State)
	}
	if _, err := s.ClaimNextTask(ctx, &daemon.ID); err != nil {
		t.Fatalf("ClaimNextTask: %v", err)
	}
	if got := agentsOf(issue.ID); got[0].State != v1.AgentStateRunning {
		t.Fatalf("state with a dispatched task = %q, want running", got[0].State)
	}
	// The other issue's assignment is untouched: state is per (issue, agent).
	if got := agentsOf(mentioned.ID); got[0].State != v1.AgentStateIdle {
		t.Fatalf("other issue state = %q, want idle", got[0].State)
	}

	// 9. Deleting an agent takes its assignment with it, and the issue still
	//    reads — no dangling name, no 500.
	if err := agentSvc.DeleteAgent(ctx, ws.ID, planner.ID); err != nil {
		t.Fatalf("delete agent: %v", err)
	}
	if got := agentsOf(issue.ID); len(got) != 0 {
		t.Fatalf("agents after deleting the agent = %v, want none", names(got))
	}
}

// TestIssueAssigneeIntegration covers the human side of assignment against a
// real Postgres: one accountable person, defaulted to the creator, clearable
// and settable, refused when the user is not a member of the workspace. Skipped
// unless GITSQUAD_TEST_DATABASE_URL is set.
func TestIssueAssigneeIntegration(t *testing.T) {
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
	svc := NewIssueService(s)

	user, err := s.CreateUser(ctx, db.CreateUserParams{
		Login: fmt.Sprintf("as-user-%s", uuid.NewString()[:8]),
	})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	t.Cleanup(func() { cleanupUserRows(t, ctx, pool, user.ID) })

	ws := createWorkspaceForTest(ctx, t, s, user.ID, "ITA2", fmt.Sprintf("ita2-%s", uuid.NewString()[:8]))

	// 1. A new issue is owned by its creator: an issue is never born ownerless,
	//    and the response carries the identity, not just the id.
	issue, err := svc.CreateIssue(ctx, ws.ID, user.ID, user.Login, IssueCreate{Title: "Owned on arrival"})
	if err != nil {
		t.Fatalf("create issue: %v", err)
	}
	if issue.Assignee == nil || issue.Assignee.ID != user.ID {
		t.Fatalf("assignee = %+v, want the creator %s", issue.Assignee, user.ID)
	}
	if issue.Assignee.Login != user.Login {
		t.Fatalf("assignee login = %q, want %q", issue.Assignee.Login, user.Login)
	}

	// 2. Unassigning is a real state, and the feed says so. The empty string is
	//    the clear signal — a UUID never is one.
	cleared, err := svc.UpdateIssue(ctx, ws.ID, issue.ID, user.Login, IssueUpdate{AssigneeID: ptr("")})
	if err != nil {
		t.Fatalf("clear assignee: %v", err)
	}
	if cleared.Assignee != nil {
		t.Fatalf("assignee after clearing = %+v, want nil", cleared.Assignee)
	}
	detail, err := svc.GetIssue(ctx, ws.ID, issue.ID)
	if err != nil {
		t.Fatalf("get issue: %v", err)
	}
	var sawAssigneeChange bool
	for _, c := range detail.Comments {
		if c.Type == "assignee_change" {
			sawAssigneeChange = true
			if !strings.Contains(c.Content, user.Login+" → 未指派") {
				t.Errorf("assignee note = %q, want it to name both sides", c.Content)
			}
		}
	}
	if !sawAssigneeChange {
		t.Fatalf("expected an assignee_change comment, got %+v", detail.Comments)
	}

	// 3. Setting it back works, and a re-set to the same person writes nothing.
	back := user.ID.String()
	if _, err := svc.UpdateIssue(ctx, ws.ID, issue.ID, user.Login, IssueUpdate{AssigneeID: &back}); err != nil {
		t.Fatalf("set assignee: %v", err)
	}
	if _, err := svc.UpdateIssue(ctx, ws.ID, issue.ID, user.Login, IssueUpdate{AssigneeID: &back}); err != nil {
		t.Fatalf("re-set assignee: %v", err)
	}
	detail, err = svc.GetIssue(ctx, ws.ID, issue.ID)
	if err != nil {
		t.Fatalf("get issue: %v", err)
	}
	changes := 0
	for _, c := range detail.Comments {
		if c.Type == "assignee_change" {
			changes++
		}
	}
	if changes != 2 {
		t.Fatalf("assignee_change comments = %d, want 2 (clear, set; the re-set is a no-op)", changes)
	}

	// 4. A status-only edit leaves the assignee alone.
	status := "in_review"
	afterStatus, err := svc.UpdateIssue(ctx, ws.ID, issue.ID, user.Login, IssueUpdate{Status: &status})
	if err != nil {
		t.Fatalf("status-only update: %v", err)
	}
	if afterStatus.Assignee == nil || afterStatus.Assignee.ID != user.ID {
		t.Fatalf("assignee after a status edit = %+v, want it untouched", afterStatus.Assignee)
	}

	// 5. A user who is not a member of the workspace is refused — and so is
	//    something that is not an id at all.
	stranger, err := s.CreateUser(ctx, db.CreateUserParams{
		Login: fmt.Sprintf("as-stranger-%s", uuid.NewString()[:8]),
	})
	if err != nil {
		t.Fatalf("create stranger: %v", err)
	}
	t.Cleanup(func() { cleanupUserRows(t, ctx, pool, stranger.ID) })
	strangerID := stranger.ID.String()
	if _, err := svc.UpdateIssue(ctx, ws.ID, issue.ID, user.Login, IssueUpdate{AssigneeID: &strangerID}); !errors.Is(err, ErrUnknownMember) {
		t.Fatalf("non-member err = %v, want ErrUnknownMember", err)
	}
	junk := "not-a-uuid"
	if _, err := svc.UpdateIssue(ctx, ws.ID, issue.ID, user.Login, IssueUpdate{AssigneeID: &junk}); !errors.Is(err, ErrUnknownMember) {
		t.Fatalf("malformed assignee err = %v, want ErrUnknownMember", err)
	}

	// 6. The roster endpoint's backing query returns the workspace's one member.
	members, err := svc.members(ctx, ws.ID)
	if err != nil {
		t.Fatalf("members: %v", err)
	}
	if len(members) != 1 || members[0].ID != user.ID {
		t.Fatalf("members = %+v, want just %s", members, user.Login)
	}
}

// ptr is a one-line address-of for the string fields the update tests set.
func ptr(s string) *string { return &s }

// TestMigrateAssignmentShape pins the shape migrations 047-049 leave behind.
// Every statement in migration.go re-executes on each boot, so the checks run
// against a second Migrate: what is asserted is what survives a restart.
func TestMigrateAssignmentShape(t *testing.T) {
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

	for i := 0; i < 2; i++ {
		if err := database.Migrate(ctx, pool); err != nil {
			t.Fatalf("migrate (run %d): %v", i+1, err)
		}
	}

	// The assignment table exists, keyed on the pair, with both foreign keys.
	var table *string
	if err := pool.QueryRow(ctx, `SELECT to_regclass('public.issue_agents')::text`).Scan(&table); err != nil {
		t.Fatalf("regclass issue_agents: %v", err)
	}
	if table == nil {
		t.Fatal("issue_agents is missing after Migrate")
	}

	var constraints int
	if err := pool.QueryRow(ctx, `
		SELECT count(*)::int FROM pg_constraint
		WHERE conrelid = 'issue_agents'::regclass AND contype IN ('p','f')`).Scan(&constraints); err != nil {
		t.Fatalf("count constraints: %v", err)
	}
	if constraints != 3 { // PRIMARY KEY (issue_id, agent_id) + two FOREIGN KEYs
		t.Fatalf("issue_agents constraints = %d, want 3 (one primary, two foreign)", constraints)
	}

	// The assignment columns are on issues: the single assignee, and the array
	// that used to hold agent names is gone rather than left as a dead column.
	var assigneeCols, arrayCols int
	if err := pool.QueryRow(ctx, `
		SELECT count(*)::int FROM information_schema.columns
		WHERE table_name = 'issues' AND column_name = 'assignee_user_id'`).Scan(&assigneeCols); err != nil {
		t.Fatalf("count assignee column: %v", err)
	}
	if assigneeCols != 1 {
		t.Fatal("issues.assignee_user_id is missing after Migrate")
	}
	if err := pool.QueryRow(ctx, `
		SELECT count(*)::int FROM information_schema.columns
		WHERE table_name = 'issues' AND column_name = 'assigned_agents'`).Scan(&arrayCols); err != nil {
		t.Fatalf("count dropped column: %v", err)
	}
	if arrayCols != 0 {
		t.Fatal("issues.assigned_agents still exists; the array was replaced, not deprecated")
	}

	// Both new comment kinds are accepted by the feed's check constraint.
	for _, kind := range []string{"agents_change", "assignee_change"} {
		var def string
		if err := pool.QueryRow(ctx, `
			SELECT pg_get_constraintdef(oid) FROM pg_constraint
			WHERE conname = 'issue_comments_type_check'`).Scan(&def); err != nil {
			t.Fatalf("read comment check: %v", err)
		}
		if !strings.Contains(def, kind) {
			t.Fatalf("issue_comments_type_check does not allow %q: %s", kind, def)
		}
	}
}
