package service

import (
	"context"
	"errors"
	"testing"

	"github.com/feifeifeimoon/GitSquad/internal/server/store/db"
	"github.com/feifeifeimoon/GitSquad/internal/util"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// The ledger is what makes "one review at a time per PR" true even under
// duplicate webhooks: an in-flight row is the lock, and a task subject can be a
// PR with no issue.
func TestReviewLedgerIntegration(t *testing.T) {
	s, pool := openTestStore(t)
	ctx := context.Background()
	f := seedTaskFixture(t, ctx, s, pool)

	pr, err := s.RecordRepoPullRequest(ctx, db.InsertRepoPullRequestParams{
		WorkspaceID: f.workspace.ID, RepoOwner: "tk-owner", RepoName: "tk-repo",
		Number: 91, Title: "review me", State: "open", HeadSha: "sha-one",
		GithubUpdatedAt: pgTime(t),
	})
	if err != nil {
		t.Fatalf("seed PR: %v", err)
	}

	first, err := s.CreatePRReview(ctx, db.CreatePRReviewParams{
		WorkspaceID: f.workspace.ID, PullRequestID: pr.ID,
		AgentID: &f.agent.ID, HeadSha: "sha-one", TriggerKind: "auto",
	})
	if err != nil {
		t.Fatalf("create review: %v", err)
	}
	if _, err := s.CreatePRReview(ctx, db.CreatePRReviewParams{
		WorkspaceID: f.workspace.ID, PullRequestID: pr.ID,
		AgentID: &f.agent.ID, HeadSha: "sha-one", TriggerKind: "auto",
	}); !util.IsUniqueViolation(err) {
		t.Fatalf("second in-flight review: got %v, want a unique violation", err)
	}

	task, err := s.CreateTask(ctx, db.CreateTaskParams{
		WorkspaceID: f.workspace.ID, PullRequestID: &pr.ID, Kind: "review",
		AgentID: f.agent.ID, AssignedDaemonID: &f.daemon.ID,
		Provider: "claude", Context: []byte(`{}`),
	})
	if err != nil {
		t.Fatalf("create review task: %v", err)
	}
	if task.IssueID != nil {
		t.Fatalf("review task issue_id = %v, want nil", task.IssueID)
	}

	if _, err := s.CreateTask(ctx, db.CreateTaskParams{
		WorkspaceID: f.workspace.ID, Kind: "issue", AgentID: f.agent.ID,
		AssignedDaemonID: &f.daemon.ID, Provider: "claude", Context: []byte(`{}`),
	}); err == nil {
		t.Fatal("issue task without an issue subject was accepted")
	} else {
		var pgErr *pgconn.PgError
		if !errors.As(err, &pgErr) || pgErr.Code != "23514" {
			t.Fatalf("subject check error = %v, want check violation 23514", err)
		}
	}

	if err := s.SetPRReviewTask(ctx, db.SetPRReviewTaskParams{ID: first.ID, TaskID: &task.ID}); err != nil {
		t.Fatalf("set review task: %v", err)
	}
	if _, err := s.MarkReviewRunning(ctx, task.ID); err != nil {
		t.Fatalf("mark running: %v", err)
	}
	if _, err := s.MarkReviewRunning(ctx, task.ID); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("second running transition: got %v, want pgx.ErrNoRows", err)
	}
}
