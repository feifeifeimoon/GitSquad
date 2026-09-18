package service

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/feifeifeimoon/GitSquad/internal/server/store"
	"github.com/feifeifeimoon/GitSquad/internal/server/store/db"
	"github.com/feifeifeimoon/GitSquad/internal/util"
	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// GitHubPullRequestEvent is one pull_request webhook, reduced to the fields the
// relationship needs. Kept as a plain struct so the rules can be exercised
// without constructing a GitHub payload.
type GitHubPullRequestEvent struct {
	Action         string // opened | closed | reopened | ready_for_review | edited | synchronize | ...
	InstallationID int64
	RepoOwner      string
	RepoName       string
	Number         int32
	Title          string
	Body           string
	State          string // open | closed
	Merged         bool
	Draft          bool
	HeadBranch     string
	BaseBranch     string
	Author         string
	HTMLURL        string
	UpdatedAt      time.Time
}

// PullRequestService owns the issue ↔ pull request relationship: the entries
// that create links, the state that flows back onto the issue, and the
// aggregate that decides whether the issue is finished.
//
// The platform is the only writer it trusts. A PR it opened for a task is
// recorded the moment it exists — not when a webhook happens to arrive — and a
// PR discovered later is only linked when the branch convention or an explicit
// closing keyword says it is the issue's work. A PR that merely mentions an
// issue is never linked.
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
// task. It is entry ①: the one link that needs no inference, so it is written
// immediately rather than waiting for a webhook that may be delayed, missing or
// never configured.
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
func (s *PullRequestService) SyncFromWebhook(ctx context.Context, ev GitHubPullRequestEvent) error {
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

	for _, target := range s.linkTargets(ctx, ws.ID, ev) {
		if err := s.linkOne(ctx, ws.ID, ev, target); err != nil {
			return err
		}
	}
	return nil
}

// linkTarget is one issue a PR claims to belong to, and how it was recognised.
type linkTarget struct {
	issueID     uuid.UUID
	issueKey    string
	source      string
	closeIntent bool
}

// linkTargets resolves the issues this PR names. The branch convention wins over
// the body: a branch we created is the issue's line of work even when the author
// never wrote a closing keyword, and a PR body can mention several issues.
func (s *PullRequestService) linkTargets(ctx context.Context, workspaceID uuid.UUID, ev GitHubPullRequestEvent) []linkTarget {
	seen := map[uuid.UUID]bool{}
	var out []linkTarget

	add := func(key, source string) {
		issue, err := s.issueByKey(ctx, workspaceID, key)
		if err != nil {
			if !errors.Is(err, pgx.ErrNoRows) {
				slog.Warn("resolve issue for pull request", "key", key, "error", err)
			}
			return
		}
		if seen[issue.ID] {
			return
		}
		seen[issue.ID] = true
		out = append(out, linkTarget{issueID: issue.ID, issueKey: key, source: source, closeIntent: true})
	}

	if key, ok := parseIssueKeyFromBranch(ev.HeadBranch); ok {
		add(key, "branch")
	}
	for _, key := range parseIssueKeysFromText(ev.Title + "\n" + ev.Body) {
		add(key, "body")
	}
	return out
}

// issueByKey resolves "PREFIX-42" within a workspace. The prefix is the
// workspace's own, so a key that does not match it belongs to some other
// workspace and is not ours to bind.
func (s *PullRequestService) issueByKey(ctx context.Context, workspaceID uuid.UUID, key string) (db.GetIssueByNumberRow, error) {
	num, ok := parseIssueNumber(key)
	if !ok {
		return db.GetIssueByNumberRow{}, pgx.ErrNoRows
	}
	row, err := s.store.GetIssueByNumber(ctx, db.GetIssueByNumberParams{WorkspaceID: workspaceID, Number: num})
	if err != nil {
		return db.GetIssueByNumberRow{}, err
	}
	if !strings.EqualFold(issueKey(row.IssuePrefix, row.Number), key) {
		return db.GetIssueByNumberRow{}, pgx.ErrNoRows
	}
	return row, nil
}

// linkOne writes the link (or refreshes the row) and lets the issue follow.
func (s *PullRequestService) linkOne(ctx context.Context, workspaceID uuid.UUID, ev GitHubPullRequestEvent, target linkTarget) error {
	state := "open"
	switch {
	case ev.Merged:
		state = "merged"
	case ev.State == "closed":
		state = "closed"
	}
	// A suppressed row keeps its tombstone: RecordPullRequest never touches
	// suppressed_at, so an unlinked PR cannot be resurrected by a redelivery,
	// and its state still stays accurate for the history.
	var mergedAt *time.Time
	if ev.Merged && !ev.UpdatedAt.IsZero() {
		t := ev.UpdatedAt
		mergedAt = &t
	}
	updatedAt := ev.UpdatedAt
	row, err := s.store.RecordPullRequest(ctx, db.InsertPullRequestParams{
		WorkspaceID:     workspaceID,
		IssueID:         target.issueID,
		RepoOwner:       ev.RepoOwner,
		RepoName:        ev.RepoName,
		Number:          ev.Number,
		Title:           ev.Title,
		Url:             ev.HTMLURL,
		State:           state,
		Draft:           ev.Draft,
		HeadBranch:      ev.HeadBranch,
		BaseBranch:      ev.BaseBranch,
		Author:          ev.Author,
		Source:          target.source,
		CloseIntent:     target.closeIntent,
		MergedAt:        mergedAt,
		GithubUpdatedAt: &updatedAt,
	})
	if err != nil {
		if util.IsUniqueViolation(err) {
			// Another PR already holds this issue's active slot. Nothing is
			// lost: the PR exists on GitHub, and the issue keeps the PR it was
			// already tracking. Say so rather than silently dropping it.
			s.appendSystemComment(ctx, workspaceID, target.issueID, fmt.Sprintf(
				"检测到另一个开放的 PR #%d 也指向本 issue，但本 issue 已有活跃 PR，请确认哪个是本次的工作线。", ev.Number))
			return nil
		}
		return fmt.Errorf("record pull request: %w", err)
	}

	return s.afterPullRequestChange(ctx, workspaceID, target.issueID, row)
}

// afterPullRequestChange moves the issue to match the PR that just changed.
//
// The status only ever moves forward, and never over a human's terminal call:
// an issue already marked done or cancelled stays where the human put it.
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
// claiming to close the issue, and not unlinked — whichever entry linked it.
// This is display material: the issue page shows it as the current PR.
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

// ContinuablePullRequest returns the PR a new task's work should land on.
//
// Deliberately narrower than ActivePullRequest: only the certain entries (the
// platform opened it, or a human linked it) may decide where code goes. A PR
// matched by the branch convention or a keyword is a guess, and a guess must
// not send an agent's work onto someone else's branch.
func (s *PullRequestService) ContinuablePullRequest(ctx context.Context, issueID uuid.UUID) (db.PullRequest, error) {
	row, err := s.ActivePullRequest(ctx, issueID)
	if err != nil || row.ID == uuid.Nil {
		return db.PullRequest{}, err
	}
	if row.Source != "platform" && row.Source != "manual" {
		return db.PullRequest{}, nil
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
