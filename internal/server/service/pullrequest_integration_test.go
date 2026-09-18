package service

import (
	"context"
	"testing"
	"time"

	"github.com/feifeifeimoon/GitSquad/internal/server/store/db"
	"github.com/feifeifeimoon/GitSquad/internal/util"
	"github.com/google/uuid"
)

// prParams builds an upsert for one PR, defaulting to the shape entry ① writes.
func prParams(t *testing.T, f taskFixture, number int, state string, closeIntent bool) db.InsertPullRequestParams {
	t.Helper()
	return db.InsertPullRequestParams{
		WorkspaceID:     f.workspace.ID,
		IssueID:         f.issue.ID,
		RepoOwner:       "tk-owner",
		RepoName:        "tk-repo",
		Number:          int32(number),
		Title:           "a change",
		Url:             "https://github.com/tk-owner/tk-repo/pull/" + itoa(number),
		State:           state,
		HeadBranch:      "gitsquad/TKW-1/task-" + itoa(number),
		BaseBranch:      "main",
		Author:          "gitsquad[bot]",
		Source:          "platform",
		CloseIntent:     closeIntent,
		GithubUpdatedAt: pgTime(t),
	}
}

func itoa(n int) string {
	return string(rune('0' + n%10))
}

func pgTime(t *testing.T) *time.Time {
	t.Helper()
	now := time.Now().UTC().Truncate(time.Second)
	return &now
}

// One active closing PR per issue: a second one is rejected by the partial
// unique index, and the slot frees up again once the first is merged.
func TestOneActiveClosingPullRequestPerIssue(t *testing.T) {
	s, pool := openTestStore(t)
	ctx := context.Background()
	f := seedTaskFixture(t, ctx, s, pool)

	first, err := s.RecordPullRequest(ctx, prParams(t, f, 1, "open", true))
	if err != nil {
		t.Fatalf("upsert first: %v", err)
	}

	if _, err := s.RecordPullRequest(ctx, prParams(t, f, 2, "open", true)); err == nil {
		t.Fatal("second active closing PR was accepted, want a unique violation")
	} else if !util.IsUniqueViolation(err) {
		t.Fatalf("second insert error = %v, want a unique violation", err)
	}

	// Merging the first releases the slot.
	if _, err := s.RecordPullRequest(ctx, db.InsertPullRequestParams{
		WorkspaceID: f.workspace.ID, IssueID: f.issue.ID,
		RepoOwner: "tk-owner", RepoName: "tk-repo", Number: 1,
		State: "merged", CloseIntent: true, HeadBranch: first.HeadBranch,
		Source: "platform", GithubUpdatedAt: pgTime(t),
	}); err != nil {
		t.Fatalf("mark merged: %v", err)
	}
	if _, err := s.RecordPullRequest(ctx, prParams(t, f, 2, "open", true)); err != nil {
		t.Fatalf("upsert after merge: %v", err)
	}
}

// A PR that merely references the issue (no closing intent) is stored but does
// not occupy the active slot.
func TestReferencingPullRequestDoesNotTakeTheSlot(t *testing.T) {
	s, pool := openTestStore(t)
	ctx := context.Background()
	f := seedTaskFixture(t, ctx, s, pool)

	if _, err := s.RecordPullRequest(ctx, prParams(t, f, 1, "open", false)); err != nil {
		t.Fatalf("upsert reference: %v", err)
	}
	if _, err := s.RecordPullRequest(ctx, prParams(t, f, 2, "open", true)); err != nil {
		t.Fatalf("closing PR should still fit: %v", err)
	}

	active, err := s.GetActivePullRequest(ctx, f.issue.ID)
	if err != nil {
		t.Fatalf("GetActivePullRequest: %v", err)
	}
	if active.Number != 2 {
		t.Errorf("active PR = #%d, want the closing one (#2)", active.Number)
	}
}

// Re-delivering the same event must update the row, not create a second one,
// and an older event must not overwrite a newer state.
func TestUpsertPullRequestIsIdempotentAndOrdered(t *testing.T) {
	s, pool := openTestStore(t)
	ctx := context.Background()
	f := seedTaskFixture(t, ctx, s, pool)

	first := prParams(t, f, 7, "open", true)
	if _, err := s.RecordPullRequest(ctx, first); err != nil {
		t.Fatalf("upsert: %v", err)
	}
	newer := time.Now().UTC().Add(time.Minute).Truncate(time.Second)
	merged, err := s.RecordPullRequest(ctx, db.InsertPullRequestParams{
		WorkspaceID: f.workspace.ID, IssueID: f.issue.ID,
		RepoOwner: "tk-owner", RepoName: "tk-repo", Number: 7,
		State: "merged", CloseIntent: true, HeadBranch: first.HeadBranch,
		Source: "platform", GithubUpdatedAt: &newer,
	})
	if err != nil {
		t.Fatalf("upsert merged: %v", err)
	}
	if merged.State != "merged" {
		t.Fatalf("state = %q, want merged", merged.State)
	}

	// A stale event (older than what is stored) must not roll the state back.
	stale := time.Now().UTC().Add(-time.Hour).Truncate(time.Second)
	staleRow, err := s.RecordPullRequest(ctx, db.InsertPullRequestParams{
		WorkspaceID: f.workspace.ID, IssueID: f.issue.ID,
		RepoOwner: "tk-owner", RepoName: "tk-repo", Number: 7,
		State: "open", CloseIntent: true, HeadBranch: first.HeadBranch,
		Source: "platform", GithubUpdatedAt: &stale,
	})
	if err != nil {
		t.Fatalf("upsert stale: %v", err)
	}
	if staleRow.State != "merged" {
		t.Errorf("state = %q, want the newer merged state to survive", staleRow.State)
	}

	rows, err := s.ListPullRequestsByIssue(ctx, f.issue.ID)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(rows) != 1 {
		t.Errorf("rows = %d, want 1 (upsert, not a second row)", len(rows))
	}
}

// Suppression is a tombstone: the row stays, it stops occupying the active
// slot, and re-linking it needs that slot back — which is what makes an
// explicit unlink stick instead of being undone by the next inference.
func TestSuppressPullRequestFreesTheSlot(t *testing.T) {
	s, pool := openTestStore(t)
	ctx := context.Background()
	f := seedTaskFixture(t, ctx, s, pool)

	row, err := s.RecordPullRequest(ctx, prParams(t, f, 3, "open", true))
	if err != nil {
		t.Fatalf("upsert: %v", err)
	}
	if err := s.SuppressPullRequest(ctx, row.ID); err != nil {
		t.Fatalf("suppress: %v", err)
	}
	if _, err := s.GetActivePullRequest(ctx, f.issue.ID); err == nil {
		t.Error("a suppressed PR still counts as active")
	}
	if _, err := s.RecordPullRequest(ctx, prParams(t, f, 4, "open", true)); err != nil {
		t.Fatalf("the slot should be free after suppression: %v", err)
	}

	// Re-linking #3 while #4 holds the slot would put two active closing PRs on
	// the issue. The database refuses, which is the rule: deal with the
	// occupant first (close it, or unlink it).
	if err := s.UnsuppressPullRequest(ctx, row.ID); err == nil {
		t.Fatal("re-link was accepted while another PR holds the slot")
	} else if !util.IsUniqueViolation(err) {
		t.Fatalf("re-link error = %v, want a unique violation", err)
	}

	other, err := s.GetActivePullRequest(ctx, f.issue.ID)
	if err != nil {
		t.Fatalf("GetActivePullRequest: %v", err)
	}
	if err := s.SuppressPullRequest(ctx, other.ID); err != nil {
		t.Fatalf("suppress occupant: %v", err)
	}
	if err := s.UnsuppressPullRequest(ctx, row.ID); err != nil {
		t.Fatalf("re-link after clearing the slot: %v", err)
	}
	rows, err := s.ListPullRequestsByIssue(ctx, f.issue.ID)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(rows) != 2 {
		t.Errorf("rows = %d, want 2 (the tombstone keeps its history)", len(rows))
	}
	_ = uuid.Nil
}
