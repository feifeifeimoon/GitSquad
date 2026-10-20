package service

import (
	"context"
	"testing"
	"time"

	"github.com/feifeifeimoon/GitSquad/internal/server/store"
	"github.com/feifeifeimoon/GitSquad/internal/server/store/db"
	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
)

func seedReviewTask(t *testing.T, s *store.Store, f taskFixture, number int32) (db.PrReview, db.Task) {
	t.Helper()
	ctx := context.Background()
	pr, err := s.RecordRepoPullRequest(ctx, db.InsertRepoPullRequestParams{
		WorkspaceID: f.workspace.ID, RepoOwner: "tk-owner", RepoName: "tk-repo",
		Number: number, Title: "review me", State: "open", HeadSha: "sha-review",
		GithubUpdatedAt: pgTime(t),
	})
	if err != nil {
		t.Fatalf("seed review PR: %v", err)
	}
	review, err := s.CreatePRReview(ctx, db.CreatePRReviewParams{
		WorkspaceID: f.workspace.ID, PullRequestID: pr.ID, AgentID: &f.agent.ID,
		HeadSha: "sha-review", TriggerKind: "auto",
	})
	if err != nil {
		t.Fatalf("seed review: %v", err)
	}
	task, err := s.CreateTask(ctx, db.CreateTaskParams{
		WorkspaceID: f.workspace.ID, PullRequestID: &pr.ID, Kind: "review",
		AgentID: f.agent.ID, AssignedDaemonID: &f.daemon.ID, Provider: "claude",
		Context: []byte(`{}`),
	})
	if err != nil {
		t.Fatalf("seed review task: %v", err)
	}
	if err := s.SetPRReviewTask(ctx, db.SetPRReviewTaskParams{ID: review.ID, TaskID: &task.ID}); err != nil {
		t.Fatalf("attach review task: %v", err)
	}
	return review, task
}

func TestReportReviewLifecycle(t *testing.T) {
	s, pool := openTestStore(t)
	ctx := context.Background()
	f := seedTaskFixture(t, ctx, s, pool)
	review, task := seedReviewTask(t, s, f, 71)

	taskSvc := NewTaskService(s, nil)
	reviewSvc := NewReviewService(s, taskSvc, "gitsquad")
	taskSvc.SetReviews(reviewSvc)

	if _, err := pool.Exec(ctx, `UPDATE tasks SET status = 'dispatched' WHERE id = $1`, task.ID); err != nil {
		t.Fatalf("dispatch task: %v", err)
	}
	if err := taskSvc.Report(ctx, f.daemon.ID, task.ID, v1.TaskReport{Status: v1.TaskReportStarted}); err != nil {
		t.Fatalf("report started: %v", err)
	}
	running, err := s.GetPRReview(ctx, review.ID)
	if err != nil {
		t.Fatalf("get review: %v", err)
	}
	if running.Status != "running" {
		t.Fatalf("review status = %q, want running", running.Status)
	}

	// No GitHub writer is wired in this test, so a successful daemon report
	// must close the ledger as failed rather than leave it in-flight.
	if err := taskSvc.Report(ctx, f.daemon.ID, task.ID, v1.TaskReport{
		Status: v1.TaskReportSucceeded,
		Summary: &v1.TaskSummary{
			Output: "summary",
			Review: &v1.ReviewResult{Summary: "summary", HeadSHA: "sha-review"},
		},
	}); err != nil {
		t.Fatalf("report succeeded: %v", err)
	}
	failed, err := s.GetPRReview(ctx, review.ID)
	if err != nil {
		t.Fatalf("get review after completion: %v", err)
	}
	if failed.Status != "failed" {
		t.Fatalf("review status = %q, want failed without a writer", failed.Status)
	}
	completedTask, err := s.GetTask(ctx, task.ID)
	if err != nil {
		t.Fatalf("get task: %v", err)
	}
	if completedTask.Status != "completed" {
		t.Fatalf("task status = %q, want completed", completedTask.Status)
	}
}

func TestFailSilentDaemonMarksReviewFailed(t *testing.T) {
	s, pool := openTestStore(t)
	ctx := context.Background()
	f := seedTaskFixture(t, ctx, s, pool)
	review, task := seedReviewTask(t, s, f, 72)

	taskSvc := NewTaskService(s, nil)
	taskSvc.SetReviews(NewReviewService(s, taskSvc, "gitsquad"))
	if _, err := pool.Exec(ctx, `UPDATE tasks SET status = 'dispatched' WHERE id = $1`, task.ID); err != nil {
		t.Fatalf("dispatch task: %v", err)
	}
	if _, err := pool.Exec(ctx, `UPDATE daemons SET last_seen_at = now() - interval '1 hour' WHERE id = $1`, f.daemon.ID); err != nil {
		t.Fatalf("age daemon: %v", err)
	}
	if err := taskSvc.FailSilentDaemonTasks(ctx, time.Minute); err != nil {
		t.Fatalf("fail silent daemon tasks: %v", err)
	}

	failed, err := s.GetPRReview(ctx, review.ID)
	if err != nil {
		t.Fatalf("get review: %v", err)
	}
	if failed.Status != "failed" || failed.Error != "runtime_offline" {
		t.Fatalf("review = %+v, want failed/runtime_offline", failed)
	}
	failedTask, err := s.GetTask(ctx, task.ID)
	if err != nil {
		t.Fatalf("get task: %v", err)
	}
	if failedTask.Status != "failed" {
		t.Fatalf("task status = %q, want failed", failedTask.Status)
	}
}

func TestReconcileReviewStatesReleasesTerminalTask(t *testing.T) {
	s, pool := openTestStore(t)
	ctx := context.Background()
	f := seedTaskFixture(t, ctx, s, pool)
	review, task := seedReviewTask(t, s, f, 73)

	if _, err := pool.Exec(ctx, `UPDATE tasks SET status = 'completed' WHERE id = $1`, task.ID); err != nil {
		t.Fatalf("complete task: %v", err)
	}
	if _, err := pool.Exec(ctx, `UPDATE pr_reviews SET updated_at = now() - interval '10 minutes' WHERE id = $1`, review.ID); err != nil {
		t.Fatalf("age review: %v", err)
	}
	if _, err := s.ReconcileReviewStates(ctx); err != nil {
		t.Fatalf("reconcile: %v", err)
	}
	failed, err := s.GetPRReview(ctx, review.ID)
	if err != nil {
		t.Fatalf("get review: %v", err)
	}
	if failed.Status != "failed" || failed.Error != "orphaned" {
		t.Fatalf("review = %+v, want failed/orphaned", failed)
	}
}
