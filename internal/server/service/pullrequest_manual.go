package service

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/feifeifeimoon/GitSquad/internal/server/store/db"
	"github.com/feifeifeimoon/GitSquad/internal/util"
	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
	"github.com/google/uuid"
)

// ErrPullRequestSlotTaken is returned when linking would give an issue a second
// active pull request. The caller reports it as a conflict: the human has to
// deal with the PR that holds the slot first.
var ErrPullRequestSlotTaken = errors.New("the issue already has an active pull request")

// FetchedPullRequest is what a manual link needs to know about a PR this
// platform did not create. A plain struct so the rules can be tested without
// reaching GitHub.
type FetchedPullRequest struct {
	Number     int32
	Title      string
	URL        string
	State      string // open | merged | closed
	Draft      bool
	HeadBranch string
	BaseBranch string
	Author     string
	MergedAt   *time.Time
	UpdatedAt  time.Time
}

// PullRequestFetcher reads one pull request from the hosting provider. It is the
// only thing a manual link needs from GitHub, so it is the only thing this
// service depends on — and the only thing a test has to fake.
type PullRequestFetcher interface {
	FetchPullRequest(ctx context.Context, installationDBID uuid.UUID, owner, repo string, number int32) (FetchedPullRequest, error)
}

// SetFetcher wires the provider reader in; nil disables manual linking (the
// other three entries still work, since they never need to ask GitHub anything).
func (s *PullRequestService) SetFetcher(f PullRequestFetcher) { s.fetcher = f }

// githubPullRequestURLRe matches the canonical PR URL, which is what a human
// copies out of their browser.
var githubPullRequestURLRe = regexp.MustCompile(`^https?://github\.com/([^/]+)/([^/]+)/pull/(\d+)/?$`)

// parsePullRequestRef accepts what a human would paste: a full PR URL, or just
// the number when it is unambiguous (the workspace is bound to one repo).
func parsePullRequestRef(ref string) (owner, repo string, number int32, err error) {
	ref = strings.TrimSpace(ref)
	if m := githubPullRequestURLRe.FindStringSubmatch(ref); m != nil {
		n, convErr := strconv.ParseInt(m[3], 10, 32)
		if convErr != nil {
			return "", "", 0, fmt.Errorf("parse pull request number: %w", convErr)
		}
		return m[1], m[2], int32(n), nil
	}
	if n, convErr := strconv.ParseInt(strings.TrimPrefix(ref, "#"), 10, 32); convErr == nil && n > 0 {
		return "", "", int32(n), nil
	}
	return "", "", 0, errors.New("expected a pull request URL or number")
}

// LinkManual is entry ④'s link: a human saying "this is the issue's work".
// Because a human asserted it, it is treated as certain — it takes the active
// slot and counts for the branch a new task continues.
func (s *PullRequestService) LinkManual(ctx context.Context, workspaceID, issueID uuid.UUID, ref string) (db.PullRequest, error) {
	if s.fetcher == nil {
		return db.PullRequest{}, errors.New("manual linking is not configured")
	}
	owner, repo, number, err := parsePullRequestRef(ref)
	if err != nil {
		return db.PullRequest{}, err
	}
	ws, err := s.store.GetWorkspaceWithRepo(ctx, workspaceID)
	if err != nil {
		return db.PullRequest{}, fmt.Errorf("get workspace: %w", err)
	}
	if owner == "" {
		owner, repo = ws.RepoOwner, ws.RepoName
	}
	if owner != ws.RepoOwner || repo != ws.RepoName {
		// One workspace tracks one repository; a PR elsewhere is not its work.
		return db.PullRequest{}, fmt.Errorf("that pull request belongs to %s/%s, not to this workspace", owner, repo)
	}

	pr, err := s.fetcher.FetchPullRequest(ctx, ws.InstallationID, owner, repo, number)
	if err != nil {
		return db.PullRequest{}, fmt.Errorf("fetch pull request: %w", err)
	}

	updatedAt := pr.UpdatedAt
	row, err := s.store.RecordPullRequest(ctx, db.InsertPullRequestParams{
		WorkspaceID:     workspaceID,
		IssueID:         issueID,
		RepoOwner:       owner,
		RepoName:        repo,
		Number:          pr.Number,
		Title:           pr.Title,
		Url:             pr.URL,
		State:           pr.State,
		Draft:           pr.Draft,
		HeadBranch:      pr.HeadBranch,
		BaseBranch:      pr.BaseBranch,
		Author:          pr.Author,
		Source:          "manual",
		CloseIntent:     true,
		MergedAt:        pr.MergedAt,
		GithubUpdatedAt: &updatedAt,
	})
	if err != nil {
		if util.IsUniqueViolation(err) {
			return db.PullRequest{}, ErrPullRequestSlotTaken
		}
		return db.PullRequest{}, fmt.Errorf("record pull request: %w", err)
	}

	if err := s.afterPullRequestChange(ctx, workspaceID, issueID, row); err != nil {
		return db.PullRequest{}, err
	}
	return row, nil
}

// Restore re-links a PR a human had unlinked, which needs the active slot back:
// it fails with ErrPullRequestSlotTaken when another PR holds it.
func (s *PullRequestService) Restore(ctx context.Context, workspaceID, issueID, prID uuid.UUID) error {
	err := s.Unsuppress(ctx, workspaceID, issueID, prID)
	if err != nil && util.IsUniqueViolation(err) {
		return ErrPullRequestSlotTaken
	}
	return err
}

// PullRequestByID returns one row, scoped to the issue it belongs to.
func (s *PullRequestService) PullRequestByID(ctx context.Context, workspaceID, issueID, prID uuid.UUID) (db.PullRequest, error) {
	row, err := s.store.GetPullRequest(ctx, prID)
	if err != nil {
		return db.PullRequest{}, err
	}
	if row.IssueID != issueID || row.WorkspaceID != workspaceID {
		return db.PullRequest{}, errors.New("pull request does not belong to this issue")
	}
	return row, nil
}

// PullRequestResponse maps a row to the API shape, flagging the active one so
// clients do not re-derive the rule.
func PullRequestResponse(r db.PullRequest) v1.PullRequest {
	return v1.PullRequest{
		ID:           r.ID,
		Number:       r.Number,
		Title:        r.Title,
		URL:          r.Url,
		State:        r.State,
		Draft:        r.Draft,
		HeadBranch:   r.HeadBranch,
		BaseBranch:   r.BaseBranch,
		Author:       r.Author,
		RepoFullName: r.RepoOwner + "/" + r.RepoName,
		Source:       r.Source,
		CloseIntent:  r.CloseIntent,
		Suppressed:   r.SuppressedAt != nil,
		Active:       r.State == "open" && r.CloseIntent && r.SuppressedAt == nil,
		MergedAt:     r.MergedAt,
		CreatedAt:    r.CreatedAt,
	}
}
