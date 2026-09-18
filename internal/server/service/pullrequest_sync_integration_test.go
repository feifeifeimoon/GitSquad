package service

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/feifeifeimoon/GitSquad/internal/server/store/db"
	"github.com/google/uuid"
)

func prEvent(f taskFixture, number int, action string) GitHubPullRequestEvent {
	return GitHubPullRequestEvent{
		Action:         action,
		InstallationID: f.installationID,
		RepoOwner:      "tk-owner",
		RepoName:       "tk-repo",
		Number:         int32(number),
		Title:          "fix the thing",
		State:          "open",
		HeadBranch:     "gitsquad/TKW-1/1f2e3d",
		BaseBranch:     "main",
		Author:         "someone",
		HTMLURL:        "https://github.com/tk-owner/tk-repo/pull/1",
		UpdatedAt:      time.Now().UTC(),
	}
}

// commentBodies returns the issue's comment contents, newest last.
func commentBodies(t *testing.T, s *PullRequestService, issueID uuid.UUID) []string {
	t.Helper()
	rows, err := s.store.ListCommentsByIssue(context.Background(), issueID)
	if err != nil {
		t.Fatalf("list comments: %v", err)
	}
	out := make([]string, 0, len(rows))
	for _, c := range rows {
		out = append(out, c.Content)
	}
	return out
}

func containsSubstr(items []string, sub string) bool {
	for _, s := range items {
		if strings.Contains(s, sub) {
			return true
		}
	}
	return false
}

// The branch convention is enough to link a PR nobody wrote a keyword into, and
// that link moves the issue to in_review.
func TestSyncLinksByBranchConventionAndMovesTheIssue(t *testing.T) {
	s, pool := openTestStore(t)
	ctx := context.Background()
	f := seedTaskFixture(t, ctx, s, pool)
	svc := NewPullRequestService(s)

	if err := svc.SyncFromWebhook(ctx, prEvent(f, 1, "opened")); err != nil {
		t.Fatalf("SyncFromWebhook: %v", err)
	}

	active, err := svc.ActivePullRequest(ctx, f.issue.ID)
	if err != nil {
		t.Fatalf("ActivePullRequest: %v", err)
	}
	if active.Number != 1 || active.HeadBranch != "gitsquad/TKW-1/1f2e3d" {
		t.Errorf("active = %+v, want the linked PR on the platform branch", active)
	}
	if active.Source != "branch" {
		t.Errorf("source = %q, want the branch convention to be recorded", active.Source)
	}
	issue, err := s.GetIssue(ctx, db.GetIssueParams{ID: f.issue.ID, WorkspaceID: f.workspace.ID})
	if err != nil {
		t.Fatalf("get issue: %v", err)
	}
	if issue.Status != "in_review" {
		t.Errorf("issue status = %q, want in_review once a PR is open", issue.Status)
	}
}

// A PR that only mentions the issue is not linked at all.
func TestSyncIgnoresABareMention(t *testing.T) {
	s, pool := openTestStore(t)
	ctx := context.Background()
	f := seedTaskFixture(t, ctx, s, pool)
	svc := NewPullRequestService(s)

	ev := prEvent(f, 2, "opened")
	ev.HeadBranch = "someone/fix-unrelated"
	ev.Body = "这个 PR 跟 TKW-1 无关"
	if err := svc.SyncFromWebhook(ctx, ev); err != nil {
		t.Fatalf("SyncFromWebhook: %v", err)
	}

	rows, err := s.ListPullRequestsByIssue(ctx, f.issue.ID)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(rows) != 0 {
		t.Errorf("rows = %d, want none: a passing reference must not link", len(rows))
	}
}

// Merging the issue's PR completes the issue; a human's terminal call is never
// overridden.
func TestSyncMergedCompletesTheIssueButNotOverAHumanCall(t *testing.T) {
	s, pool := openTestStore(t)
	ctx := context.Background()
	f := seedTaskFixture(t, ctx, s, pool)
	svc := NewPullRequestService(s)

	if err := svc.SyncFromWebhook(ctx, prEvent(f, 3, "opened")); err != nil {
		t.Fatalf("opened: %v", err)
	}
	merged := prEvent(f, 3, "closed")
	merged.State = "closed"
	merged.Merged = true
	merged.UpdatedAt = time.Now().UTC().Add(time.Second)
	if err := svc.SyncFromWebhook(ctx, merged); err != nil {
		t.Fatalf("merged: %v", err)
	}
	issue, err := s.GetIssue(ctx, db.GetIssueParams{ID: f.issue.ID, WorkspaceID: f.workspace.ID})
	if err != nil {
		t.Fatalf("get issue: %v", err)
	}
	if issue.Status != "done" {
		t.Fatalf("issue status = %q, want done after the closing PR merged", issue.Status)
	}

	// A later event must not move an issue a human already put somewhere final.
	if _, err := s.UpdateIssueStatus(ctx, db.UpdateIssueStatusParams{
		ID: f.issue.ID, WorkspaceID: f.workspace.ID, Status: "cancelled",
	}); err != nil {
		t.Fatalf("cancel: %v", err)
	}
	second := prEvent(f, 4, "opened")
	second.UpdatedAt = time.Now().UTC().Add(2 * time.Second)
	if err := svc.SyncFromWebhook(ctx, second); err != nil {
		t.Fatalf("second opened: %v", err)
	}
	after, err := s.GetIssue(ctx, db.GetIssueParams{ID: f.issue.ID, WorkspaceID: f.workspace.ID})
	if err != nil {
		t.Fatalf("get issue: %v", err)
	}
	if after.Status != "cancelled" {
		t.Errorf("issue status = %q, want the human's cancelled to survive", after.Status)
	}
}

// Closing without merging changes no status and says so on the issue, so the
// closure is not silent and nobody wonders whether the platform noticed.
func TestSyncClosedKeepsTheIssueInReviewAndComments(t *testing.T) {
	s, pool := openTestStore(t)
	ctx := context.Background()
	f := seedTaskFixture(t, ctx, s, pool)
	svc := NewPullRequestService(s)

	if err := svc.SyncFromWebhook(ctx, prEvent(f, 5, "opened")); err != nil {
		t.Fatalf("opened: %v", err)
	}
	closed := prEvent(f, 5, "closed")
	closed.State = "closed"
	closed.UpdatedAt = time.Now().UTC().Add(time.Second)
	if err := svc.SyncFromWebhook(ctx, closed); err != nil {
		t.Fatalf("closed: %v", err)
	}

	issue, err := s.GetIssue(ctx, db.GetIssueParams{ID: f.issue.ID, WorkspaceID: f.workspace.ID})
	if err != nil {
		t.Fatalf("get issue: %v", err)
	}
	if issue.Status != "in_review" {
		t.Errorf("issue status = %q, want the human to decide (in_review)", issue.Status)
	}
	if !containsSubstr(commentBodies(t, svc, f.issue.ID), "已关闭（未合并）") {
		t.Error("closing a PR without merging left no note on the issue")
	}

	// Once closed the slot is free, so a new line of work can start.
	if active, err := svc.ActivePullRequest(ctx, f.issue.ID); err != nil || active.ID != uuid.Nil {
		t.Errorf("active = %+v (err=%v), want none after the PR was closed", active, err)
	}
}

// A second open closing PR cannot take the slot; the issue keeps the PR it has
// and says what happened instead of dropping the event.
func TestSyncReportsAnOccupiedSlot(t *testing.T) {
	s, pool := openTestStore(t)
	ctx := context.Background()
	f := seedTaskFixture(t, ctx, s, pool)
	svc := NewPullRequestService(s)

	if err := svc.SyncFromWebhook(ctx, prEvent(f, 6, "opened")); err != nil {
		t.Fatalf("first: %v", err)
	}
	second := prEvent(f, 7, "opened")
	second.UpdatedAt = time.Now().UTC().Add(time.Second)
	if err := svc.SyncFromWebhook(ctx, second); err != nil {
		t.Fatalf("second: %v", err)
	}

	if !containsSubstr(commentBodies(t, svc, f.issue.ID), "请确认哪个是本次的工作线") {
		t.Error("the occupied slot was not reported on the issue")
	}
	active, err := svc.ActivePullRequest(ctx, f.issue.ID)
	if err != nil {
		t.Fatalf("ActivePullRequest: %v", err)
	}
	if active.Number != 6 {
		t.Errorf("active = #%d, want the first PR to keep the slot", active.Number)
	}
}

// An unlinked PR stays unlinked: redelivery of its webhook must not resurrect it.
func TestSyncDoesNotResurrectASuppressedLink(t *testing.T) {
	s, pool := openTestStore(t)
	ctx := context.Background()
	f := seedTaskFixture(t, ctx, s, pool)
	svc := NewPullRequestService(s)

	if err := svc.SyncFromWebhook(ctx, prEvent(f, 8, "opened")); err != nil {
		t.Fatalf("opened: %v", err)
	}
	active, err := svc.ActivePullRequest(ctx, f.issue.ID)
	if err != nil {
		t.Fatalf("ActivePullRequest: %v", err)
	}
	if err := svc.Suppress(ctx, f.workspace.ID, f.issue.ID, active.ID); err != nil {
		t.Fatalf("suppress: %v", err)
	}

	again := prEvent(f, 8, "opened")
	again.UpdatedAt = time.Now().UTC().Add(2 * time.Second)
	if err := svc.SyncFromWebhook(ctx, again); err != nil {
		t.Fatalf("redelivery: %v", err)
	}
	if got, err := svc.ActivePullRequest(ctx, f.issue.ID); err != nil || got.ID != uuid.Nil {
		t.Errorf("active = %+v (err=%v), want the unlink to hold", got, err)
	}
}

// An inferred link is display material: the issue page shows it, but it must not
// decide which branch a new task's work lands on. Only a certain entry can.
func TestContinuablePullRequestIgnoresInferredLinks(t *testing.T) {
	s, pool := openTestStore(t)
	ctx := context.Background()
	f := seedTaskFixture(t, ctx, s, pool)
	svc := NewPullRequestService(s)

	if err := svc.SyncFromWebhook(ctx, prEvent(f, 9, "opened")); err != nil {
		t.Fatalf("sync: %v", err)
	}
	shown, err := svc.ActivePullRequest(ctx, f.issue.ID)
	if err != nil {
		t.Fatalf("ActivePullRequest: %v", err)
	}
	if shown.Number != 9 {
		t.Fatalf("the issue page should show the linked PR, got #%d", shown.Number)
	}
	if got, err := svc.ContinuablePullRequest(ctx, f.issue.ID); err != nil || got.ID != uuid.Nil {
		t.Fatalf("continuable = %+v (err=%v), want none for a branch-inferred link", got, err)
	}

	// Unlinking it frees the active slot for the platform's own PR, which does
	// count as a line of work.
	if err := svc.Suppress(ctx, f.workspace.ID, f.issue.ID, shown.ID); err != nil {
		t.Fatalf("suppress: %v", err)
	}
	if _, err := s.RecordPullRequest(ctx, db.InsertPullRequestParams{
		WorkspaceID: f.workspace.ID, IssueID: f.issue.ID,
		RepoOwner: "tk-owner", RepoName: "tk-repo", Number: 10,
		State: "open", CloseIntent: true, Source: "platform",
		HeadBranch: "gitsquad/TKW-1/other", GithubUpdatedAt: pgTime(t),
	}); err != nil {
		t.Fatalf("record platform PR: %v", err)
	}
	got, err := svc.ContinuablePullRequest(ctx, f.issue.ID)
	if err != nil {
		t.Fatalf("ContinuablePullRequest: %v", err)
	}
	if got.Number != 10 {
		t.Errorf("continuable = #%d, want the platform's PR", got.Number)
	}
}
