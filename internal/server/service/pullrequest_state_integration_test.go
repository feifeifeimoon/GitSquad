package service

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/feifeifeimoon/GitSquad/internal/server/store/db"
	"github.com/google/uuid"
)

// The webhook is a state notifier, not a discovery mechanism: it may only
// update a pull request the platform already knows about. Everything below is
// about that boundary — what it updates, and what it deliberately ignores.

func stateEvent(f taskFixture, number int32, opts func(*GitHubPullRequestEvent)) GitHubPullRequestEvent {
	ev := GitHubPullRequestEvent{
		InstallationID: f.installationID,
		RepoOwner:      "tk-owner",
		RepoName:       "tk-repo",
		Number:         number,
		Title:          "the same change, retitled",
		State:          "open",
		HeadBranch:     "gitsquad/TKW-1/1f2e3d",
		BaseBranch:     "main",
		Author:         "someone",
		UpdatedAt:      time.Now().UTC(),
	}
	if opts != nil {
		opts(&ev)
	}
	return ev
}

// recordPlatformPR seeds the row the platform's own entry ① would have written.
func recordPlatformPR(t *testing.T, f taskFixture, s interface {
	RecordPullRequest(context.Context, db.InsertPullRequestParams) (db.PullRequest, error)
}, number int32) {
	t.Helper()
	if _, err := s.RecordPullRequest(context.Background(), prParams(t, f, int(number), "open", true)); err != nil {
		t.Fatalf("seed pull request: %v", err)
	}
}

// An event for a PR nobody linked is not this server's business: the whole point
// of removing inference is that a webhook can never create a link.
func TestApplyStateIgnoresAnUnboundPullRequest(t *testing.T) {
	s, pool := openTestStore(t)
	ctx := context.Background()
	f := seedTaskFixture(t, ctx, s, pool)
	svc := NewPullRequestService(s)

	before, err := s.GetIssue(ctx, db.GetIssueParams{ID: f.issue.ID, WorkspaceID: f.workspace.ID})
	if err != nil {
		t.Fatalf("get issue: %v", err)
	}

	if err := svc.ApplyState(ctx, stateEvent(f, 101, nil)); err != nil {
		t.Fatalf("ApplyState: %v", err)
	}

	rows, err := s.ListPullRequestsByIssue(ctx, f.issue.ID)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(rows) != 0 {
		t.Errorf("rows = %d, want none: a webhook must not bind", len(rows))
	}
	after, err := s.GetIssue(ctx, db.GetIssueParams{ID: f.issue.ID, WorkspaceID: f.workspace.ID})
	if err != nil {
		t.Fatalf("get issue: %v", err)
	}
	if after.Status != before.Status {
		t.Errorf("issue status = %q, want it untouched (%q)", after.Status, before.Status)
	}
}

// A repository no workspace is bound to is somebody else's event entirely.
func TestApplyStateIgnoresAnUnrelatedRepository(t *testing.T) {
	s, pool := openTestStore(t)
	ctx := context.Background()
	f := seedTaskFixture(t, ctx, s, pool)
	svc := NewPullRequestService(s)

	ev := stateEvent(f, 102, nil)
	ev.RepoName = "not-bound-here"
	if err := svc.ApplyState(ctx, ev); err != nil {
		t.Fatalf("ApplyState: %v", err)
	}
}

// The bound issue follows the PR it is bound to: opened puts it in review,
// merging finishes it once nothing is in flight.
func TestApplyStateMovesTheBoundIssue(t *testing.T) {
	s, pool := openTestStore(t)
	ctx := context.Background()
	f := seedTaskFixture(t, ctx, s, pool)
	svc := NewPullRequestService(s)
	recordPlatformPR(t, f, s, 103)

	if err := svc.ApplyState(ctx, stateEvent(f, 103, nil)); err != nil {
		t.Fatalf("ApplyState opened: %v", err)
	}
	issue, err := s.GetIssue(ctx, db.GetIssueParams{ID: f.issue.ID, WorkspaceID: f.workspace.ID})
	if err != nil {
		t.Fatalf("get issue: %v", err)
	}
	if issue.Status != "in_review" {
		t.Fatalf("issue status = %q, want in_review while the PR is open", issue.Status)
	}

	merged := stateEvent(f, 103, func(ev *GitHubPullRequestEvent) {
		ev.State = "closed"
		ev.Merged = true
		ev.UpdatedAt = time.Now().UTC().Add(time.Second)
	})
	if err := svc.ApplyState(ctx, merged); err != nil {
		t.Fatalf("ApplyState merged: %v", err)
	}
	issue, err = s.GetIssue(ctx, db.GetIssueParams{ID: f.issue.ID, WorkspaceID: f.workspace.ID})
	if err != nil {
		t.Fatalf("get issue: %v", err)
	}
	if issue.Status != "done" {
		t.Errorf("issue status = %q, want done once the closing PR merged", issue.Status)
	}
}

// Closing without merging changes no status and says so, so the closure is not
// silent and nobody has to wonder whether the platform noticed.
func TestApplyStateKeepsTheIssueInReviewWhenClosed(t *testing.T) {
	s, pool := openTestStore(t)
	ctx := context.Background()
	f := seedTaskFixture(t, ctx, s, pool)
	svc := NewPullRequestService(s)
	recordPlatformPR(t, f, s, 104)

	if err := svc.ApplyState(ctx, stateEvent(f, 104, nil)); err != nil {
		t.Fatalf("ApplyState opened: %v", err)
	}
	closed := stateEvent(f, 104, func(ev *GitHubPullRequestEvent) {
		ev.State = "closed"
		ev.UpdatedAt = time.Now().UTC().Add(time.Second)
	})
	if err := svc.ApplyState(ctx, closed); err != nil {
		t.Fatalf("ApplyState closed: %v", err)
	}

	issue, err := s.GetIssue(ctx, db.GetIssueParams{ID: f.issue.ID, WorkspaceID: f.workspace.ID})
	if err != nil {
		t.Fatalf("get issue: %v", err)
	}
	if issue.Status != "in_review" {
		t.Errorf("issue status = %q, want the human to decide", issue.Status)
	}
	if !containsSubstr(commentBodies(t, svc, f.issue.ID), "已关闭（未合并）") {
		t.Error("closing a PR without merging left no note on the issue")
	}
	// And the slot is free, so a new line of work can start.
	active, err := svc.ActivePullRequest(ctx, f.issue.ID)
	if err != nil {
		t.Fatalf("ActivePullRequest: %v", err)
	}
	if active.ID != [16]byte{} && active.State == "open" {
		t.Errorf("active = %+v, want none after the PR was closed", active)
	}
}

// A webhook may refresh a row it can see, but it never redefines the link: the
// source a human gave it, and a human's unlink, both survive.
func TestApplyStateKeepsProvenanceAndTheTombstone(t *testing.T) {
	s, pool := openTestStore(t)
	ctx := context.Background()
	f := seedTaskFixture(t, ctx, s, pool)
	svc := NewPullRequestService(s)
	svc.SetFetcher(&stubFetcher{pr: fetchedPR(105)})

	row, err := svc.LinkManual(ctx, f.workspace.ID, f.issue.ID, "105")
	if err != nil {
		t.Fatalf("LinkManual: %v", err)
	}
	if err := svc.Suppress(ctx, f.workspace.ID, f.issue.ID, row.ID); err != nil {
		t.Fatalf("suppress: %v", err)
	}

	merged := stateEvent(f, 105, func(ev *GitHubPullRequestEvent) {
		ev.State = "closed"
		ev.Merged = true
		ev.UpdatedAt = time.Now().UTC().Add(time.Second)
	})
	if err := svc.ApplyState(ctx, merged); err != nil {
		t.Fatalf("ApplyState: %v", err)
	}

	rows, err := s.ListPullRequestsByIssue(ctx, f.issue.ID)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("rows = %d, want the one linked row", len(rows))
	}
	if rows[0].Source != "manual" {
		t.Errorf("source = %q, want the human's link to survive a webhook", rows[0].Source)
	}
	if rows[0].SuppressedAt == nil {
		t.Error("the unlink was forgotten: an unlinked PR must stay unlinked")
	}
	if rows[0].State != "merged" {
		t.Errorf("state = %q, want the history kept accurate (%q)", rows[0].State, "merged")
	}
	issue, err := s.GetIssue(ctx, db.GetIssueParams{ID: f.issue.ID, WorkspaceID: f.workspace.ID})
	if err != nil {
		t.Fatalf("get issue: %v", err)
	}
	if issue.Status == "done" {
		t.Error("an unlinked PR must not drive the issue to done")
	}
}

// commentBodies returns the issue's comment contents, oldest first.
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
