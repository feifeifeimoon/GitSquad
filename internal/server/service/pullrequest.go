package service

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/feifeifeimoon/GitSquad/internal/server/store"
	"github.com/feifeifeimoon/GitSquad/internal/server/store/db"
	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// GitHubPullRequestEvent is one pull_request webhook, reduced to the fields the
// relationship needs. Kept as a plain struct so the rules can be exercised
// without constructing a GitHub payload.
type GitHubPullRequestEvent struct {
	InstallationID int64
	RepoOwner      string
	RepoName       string
	Number         int32
	Title          string
	State          string // open | closed
	Merged         bool
	Draft          bool
	HeadBranch     string
	BaseBranch     string
	Author         string
	HTMLURL        string
	UpdatedAt      time.Time
}

// PullRequestService owns the issue ↔ pull request relationship: the two entries
// that create links, the state that flows back onto the issue, and the aggregate
// that decides whether the issue is finished.
//
// Exactly two things link a PR, and both are statements rather than guesses: the
// platform records the one it just opened for a task, and a human links one by
// hand. Webhooks never bind — they only refresh what is already bound — so a row
// always means someone meant it, and no event ordering can change that.
type PullRequestService struct {
	store     *store.Store
	publisher EventPublisher
	fetcher   PullRequestFetcher
}

func NewPullRequestService(s *store.Store) *PullRequestService {
	return &PullRequestService{store: s}
}

// SetPublisher wires the realtime publisher in; nil disables realtime.
func (s *PullRequestService) SetPublisher(p EventPublisher) { s.publisher = p }

// LinkCreated records the pull request the platform just opened for a finished
// task. It is entry ①: the platform created the PR, so the link is written
// immediately — there is nothing to infer and nothing to wait for.
func (s *PullRequestService) LinkCreated(ctx context.Context, task db.Task, full v1.Task, prNum int, prURL, headBranch, baseBranch string) error {
	if full.Issue.ID == uuid.Nil {
		return errors.New("task context has no issue id")
	}
	_, err := s.store.RecordPullRequest(ctx, db.InsertPullRequestParams{
		WorkspaceID:     task.WorkspaceID,
		IssueID:         full.Issue.ID,
		RepoOwner:       full.Repo.Owner,
		RepoName:        full.Repo.Name,
		Number:          int32(prNum),
		Title:           full.Issue.Key + ": changes by " + full.Agent.Name,
		Url:             prURL,
		State:           "open",
		Draft:           false,
		HeadBranch:      headBranch,
		BaseBranch:      baseBranch,
		Author:          "gitsquad[bot]",
		Source:          "platform",
		CloseIntent:     true, // it exists to close this issue
		GithubUpdatedAt: func() *time.Time { now := time.Now().UTC(); return &now }(),
	})
	if err != nil {
		return fmt.Errorf("record created pull request: %w", err)
	}
	s.publish(v1.AppEventIssueUpdated, task.WorkspaceID, full.Issue.ID)
	return nil
}

// SyncFromWebhook applies one pull_request event: link the PR to whatever
// issues it names, then let the issue status follow the PR state.
//
// It is idempotent and order-tolerant — GitHub redelivers events and does not
// guarantee their order — so it never fails on "nothing to do".
// ApplyState records what GitHub reports about a pull request the platform
// already knows about, and lets the issue follow.
//
// It deliberately cannot bind. A PR is linked when the platform opens it or when
// a human says so — never because an event arrived — so an event for a PR nobody
// linked is somebody else's business and is ignored rather than stored. That is
// what keeps `source` honest: only the two certain entries ever write a row, and
// no event can arrive first and claim one for a guess.
//
// Order tolerance lives in the store: a redelivered or reordered event that is
// older than what is stored does not roll the state back.
func (s *PullRequestService) ApplyState(ctx context.Context, ev GitHubPullRequestEvent) error {
	ws, err := s.store.GetWorkspaceByRepo(ctx, db.GetWorkspaceByRepoParams{
		InstallationID: ev.InstallationID,
		Owner:          ev.RepoOwner,
		Name:           ev.RepoName,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil // a repository no workspace is bound to
		}
		return fmt.Errorf("resolve workspace for repo: %w", err)
	}

	row, err := s.store.GetPullRequestByNumber(ctx, db.GetPullRequestByNumberParams{
		WorkspaceID: ws.ID,
		RepoOwner:   ev.RepoOwner,
		RepoName:    ev.RepoName,
		Number:      ev.Number,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil // never linked: not ours to track
		}
		return fmt.Errorf("find pull request: %w", err)
	}

	updated, err := s.store.RecordPullRequest(ctx, db.InsertPullRequestParams{
		WorkspaceID:     row.WorkspaceID,
		IssueID:         row.IssueID,
		RepoOwner:       ev.RepoOwner,
		RepoName:        ev.RepoName,
		Number:          ev.Number,
		Title:           ev.Title,
		Url:             ev.HTMLURL,
		State:           pullRequestState(ev),
		Draft:           ev.Draft,
		HeadBranch:      ev.HeadBranch,
		BaseBranch:      ev.BaseBranch,
		Author:          ev.Author,
		Source:          row.Source,
		CloseIntent:     row.CloseIntent,
		MergedAt:        mergedAt(ev),
		GithubUpdatedAt: &ev.UpdatedAt,
	})
	if err != nil {
		return fmt.Errorf("record pull request state: %w", err)
	}
	return s.afterPullRequestChange(ctx, row.WorkspaceID, row.IssueID, updated)
}

// pullRequestState reduces an event to the stored vocabulary. A merge is how
// GitHub closes a PR, so it is checked first.
func pullRequestState(ev GitHubPullRequestEvent) string {
	if ev.Merged {
		return "merged"
	}
	if ev.State == "closed" {
		return "closed"
	}
	return "open"
}

func mergedAt(ev GitHubPullRequestEvent) *time.Time {
	if !ev.Merged || ev.UpdatedAt.IsZero() {
		return nil
	}
	t := ev.UpdatedAt
	return &t
}
func (s *PullRequestService) afterPullRequestChange(ctx context.Context, workspaceID, issueID uuid.UUID, row db.PullRequest) error {
	issue, err := s.store.GetIssue(ctx, db.GetIssueParams{ID: issueID, WorkspaceID: workspaceID})
	if err != nil {
		return fmt.Errorf("get issue: %w", err)
	}
	if issue.Status == v1.IssueStatusDone || issue.Status == v1.IssueStatusCancelled {
		return nil
	}

	switch row.State {
	case "open":
		if row.SuppressedAt != nil || !row.CloseIntent {
			return nil // a reference, not the issue's work
		}
		if issue.Status == v1.IssueStatusInReview {
			return nil
		}
		return s.setIssueStatus(ctx, workspaceID, issueID, v1.IssueStatusInReview)

	case "merged":
		done, err := s.issueIsFinished(ctx, issueID)
		if err != nil {
			return err
		}
		if !done {
			return nil
		}
		return s.setIssueStatus(ctx, workspaceID, issueID, v1.IssueStatusDone)

	case "closed":
		// Deliberately no status change: a closed PR is a decision for the
		// human, and the issue stays where it is (in_review) until they make
		// it. Say so, so the closure is not silent.
		if row.SuppressedAt == nil && row.CloseIntent {
			s.appendSystemComment(ctx, workspaceID, issueID, fmt.Sprintf(
				"PR #%d 已关闭（未合并），本 issue 状态未变，等你决定下一步；再次 @agent 会开一条新的工作线。", row.Number))
		}
		return nil
	}
	return nil
}

// issueIsFinished applies the aggregate rule: nothing in flight, and something
// merged that claimed to close the issue. Recomputing it (rather than reacting
// to a single event) keeps the answer the same no matter which event arrived.
func (s *PullRequestService) issueIsFinished(ctx context.Context, issueID uuid.UUID) (bool, error) {
	counts, err := s.store.CountOpenClosingPullRequests(ctx, issueID)
	if err != nil {
		return false, fmt.Errorf("count pull requests: %w", err)
	}
	return counts.OpenCount == 0 && counts.MergedClosingCount > 0, nil
}

func (s *PullRequestService) setIssueStatus(ctx context.Context, workspaceID, issueID uuid.UUID, status string) error {
	if _, err := s.store.UpdateIssueStatus(ctx, db.UpdateIssueStatusParams{
		ID:          issueID,
		WorkspaceID: workspaceID,
		Status:      status,
	}); err != nil {
		return fmt.Errorf("update issue status: %w", err)
	}
	s.publish(v1.AppEventIssueUpdated, workspaceID, issueID)
	return nil
}

// ActivePullRequest returns the PR the issue is currently tracking — open,
// claiming to close the issue, and not unlinked — which is both what the issue
// page shows and what a new task continues. Only the two certain entries write
// rows (the platform opening a PR, a human linking one), so there is no inferred
// link to keep out.
func (s *PullRequestService) ActivePullRequest(ctx context.Context, issueID uuid.UUID) (db.PullRequest, error) {
	row, err := s.store.GetActivePullRequest(ctx, issueID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return db.PullRequest{}, nil
		}
		return db.PullRequest{}, err
	}
	return row, nil
}

// Suppress is entry ④'s unlink: a tombstone, so no automatic entry links the PR
// back, and the active slot frees up.
func (s *PullRequestService) Suppress(ctx context.Context, workspaceID, issueID, prID uuid.UUID) error {
	row, err := s.store.GetPullRequest(ctx, prID)
	if err != nil {
		return fmt.Errorf("get pull request: %w", err)
	}
	if row.IssueID != issueID || row.WorkspaceID != workspaceID {
		return errors.New("pull request does not belong to this issue")
	}
	if err := s.store.SuppressPullRequest(ctx, prID); err != nil {
		return fmt.Errorf("suppress pull request: %w", err)
	}
	s.publish(v1.AppEventIssueUpdated, workspaceID, issueID)
	return nil
}

// Unsuppress re-links a PR a human had unlinked. It needs the active slot back,
// so it fails with a conflict when another PR holds it — the caller reports
// that as "deal with the current PR first" rather than a server error.
func (s *PullRequestService) Unsuppress(ctx context.Context, workspaceID, issueID, prID uuid.UUID) error {
	row, err := s.store.GetPullRequest(ctx, prID)
	if err != nil {
		return fmt.Errorf("get pull request: %w", err)
	}
	if row.IssueID != issueID || row.WorkspaceID != workspaceID {
		return errors.New("pull request does not belong to this issue")
	}
	if err := s.store.UnsuppressPullRequest(ctx, prID); err != nil {
		return err
	}
	s.publish(v1.AppEventIssueUpdated, workspaceID, issueID)
	return nil
}

func (s *PullRequestService) publish(eventType string, workspaceID, issueID uuid.UUID) {
	if s.publisher == nil {
		return
	}
	s.publisher.Publish(v1.AppEvent{Type: eventType, WorkspaceID: workspaceID, IssueID: issueID})
}

func (s *PullRequestService) appendSystemComment(ctx context.Context, workspaceID, issueID uuid.UUID, content string) {
	if err := appendIssueComment(ctx, s.store, s.publisher, workspaceID, issueID, "system", "system", content); err != nil {
		// A missing comment must not fail the sync: the state change is the
		// point, and the next event will say the same thing again.
		slog.Warn("append pull request comment", "issue", issueID, "error", err)
	}
}
