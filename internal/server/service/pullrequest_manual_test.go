package service

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/feifeifeimoon/GitSquad/internal/server/store/db"
)

// stubFetcher stands in for GitHub: the manual link is entry ④, the one a
// browser test cannot reach without a real installation, so its rules are pinned
// here instead.
type stubFetcher struct {
	pr      FetchedPullRequest
	err     error
	calls   int
	askedNo int32
}

func (f *stubFetcher) FetchPullRequest(_ context.Context, _ uuid.UUID, _, _ string, number int32) (FetchedPullRequest, error) {
	f.calls++
	f.askedNo = number
	return f.pr, f.err
}

func fetchedPR(number int32) FetchedPullRequest {
	return FetchedPullRequest{
		Number:     number,
		Title:      "a change someone else opened",
		URL:        "https://github.com/tk-owner/tk-repo/pull/" + itoa(int(number)),
		State:      "open",
		HeadBranch: "someone/fix-the-thing",
		BaseBranch: "main",
		Author:     "someone",
		UpdatedAt:  time.Now().UTC(),
	}
}

// The whole of entry ④: a human pastes a URL, the platform reads the PR it did
// not create, and the issue adopts it as its live line of work.
func TestLinkManualRecordsAndAdoptsThePullRequest(t *testing.T) {
	s, pool := openTestStore(t)
	ctx := context.Background()
	f := seedTaskFixture(t, ctx, s, pool)

	fetcher := &stubFetcher{pr: fetchedPR(77)}
	svc := NewPullRequestService(s)
	svc.SetFetcher(fetcher)

	row, err := svc.LinkManual(ctx, f.workspace.ID, f.issue.ID, "https://github.com/tk-owner/tk-repo/pull/77")
	if err != nil {
		t.Fatalf("LinkManual: %v", err)
	}
	if fetcher.askedNo != 77 {
		t.Errorf("fetched #%d, want the number from the URL", fetcher.askedNo)
	}
	if row.Source != "manual" || !row.CloseIntent {
		t.Errorf("row = %+v, want a manual link that claims to close the issue", row)
	}
	if row.HeadBranch != "someone/fix-the-thing" {
		t.Errorf("head branch = %q, want the one GitHub reported", row.HeadBranch)
	}

	// A human asserting the relationship is certainty, so it is the issue's
	// live line of work for the next task.
	active, err := svc.ActivePullRequest(ctx, f.issue.ID)
	if err != nil {
		t.Fatalf("ActivePullRequest: %v", err)
	}
	if active.Number != 77 {
		t.Errorf("active = #%d, want the manually linked PR", active.Number)
	}

	issue, err := s.GetIssue(ctx, db.GetIssueParams{ID: f.issue.ID, WorkspaceID: f.workspace.ID})
	if err != nil {
		t.Fatalf("get issue: %v", err)
	}
	if issue.Status != "in_review" {
		t.Errorf("issue status = %q, want in_review once the PR is linked", issue.Status)
	}
}

// A bare number means "the workspace's repository", which is the only one this
// workspace tracks. A URL naming a different repository is not its work.
func TestLinkManualRejectsAnotherRepository(t *testing.T) {
	s, pool := openTestStore(t)
	ctx := context.Background()
	f := seedTaskFixture(t, ctx, s, pool)

	fetcher := &stubFetcher{pr: fetchedPR(78)}
	svc := NewPullRequestService(s)
	svc.SetFetcher(fetcher)

	if _, err := svc.LinkManual(ctx, f.workspace.ID, f.issue.ID, "https://github.com/someone-else/other-repo/pull/78"); err == nil {
		t.Fatal("LinkManual accepted a pull request from another repository")
	} else if !strings.Contains(err.Error(), "someone-else/other-repo") {
		t.Errorf("error = %v, want it to name the repository it refused", err)
	}
	if fetcher.calls != 0 {
		t.Error("refused a foreign repository only after calling GitHub")
	}

	rows, err := s.ListPullRequestsByIssue(ctx, f.issue.ID)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(rows) != 0 {
		t.Errorf("rows = %d, want none", len(rows))
	}
}

// One active PR per issue: linking a second one is a decision for the human, so
// it comes back as ErrPullRequestSlotTaken rather than a database error.
func TestLinkManualRefusesASecondActivePullRequest(t *testing.T) {
	s, pool := openTestStore(t)
	ctx := context.Background()
	f := seedTaskFixture(t, ctx, s, pool)

	if _, err := s.RecordPullRequest(ctx, prParams(t, f, 79, "open", true)); err != nil {
		t.Fatalf("seed active PR: %v", err)
	}

	fetcher := &stubFetcher{pr: fetchedPR(80)}
	svc := NewPullRequestService(s)
	svc.SetFetcher(fetcher)

	if _, err := svc.LinkManual(ctx, f.workspace.ID, f.issue.ID, "80"); err == nil {
		t.Fatal("LinkManual accepted a second active pull request")
	} else if !errors.Is(err, ErrPullRequestSlotTaken) {
		t.Errorf("error = %v, want ErrPullRequestSlotTaken", err)
	}
}

// Without a fetcher the entry is unavailable rather than silently useless.
func TestLinkManualWithoutAFetcher(t *testing.T) {
	s, pool := openTestStore(t)
	ctx := context.Background()
	f := seedTaskFixture(t, ctx, s, pool)

	svc := NewPullRequestService(s)
	if _, err := svc.LinkManual(ctx, f.workspace.ID, f.issue.ID, "81"); err == nil {
		t.Fatal("LinkManual succeeded with no way to read GitHub")
	}
}
