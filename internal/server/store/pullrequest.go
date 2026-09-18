package store

import (
	"context"
	"errors"

	"github.com/feifeifeimoon/GitSquad/internal/server/store/db"
	"github.com/jackc/pgx/v5"
)

// RecordPullRequest writes one observation of a pull request, from whichever
// entry saw it: the platform creating it, a webhook matching the branch
// convention, a `Closes` keyword in the body, or a manual link.
//
// It is not a plain upsert. GitHub does not guarantee delivery order, so the
// same PR can be reported as merged and then as opened; an event older than what
// is already stored must not roll the state back. The ordering check therefore
// lives on the update path, and "the update matched nothing" is disambiguated
// here rather than in SQL: either nothing is stored yet (insert it) or a newer
// state is already on record (return that).
func (s *Store) RecordPullRequest(ctx context.Context, p db.InsertPullRequestParams) (db.PullRequest, error) {
	row, err := s.Queries.TouchPullRequest(ctx, db.TouchPullRequestParams{
		WorkspaceID:     p.WorkspaceID,
		RepoOwner:       p.RepoOwner,
		RepoName:        p.RepoName,
		Number:          p.Number,
		Title:           p.Title,
		Url:             p.Url,
		State:           p.State,
		Draft:           p.Draft,
		HeadBranch:      p.HeadBranch,
		BaseBranch:      p.BaseBranch,
		Author:          p.Author,
		CloseIntent:     p.CloseIntent,
		MergedAt:        p.MergedAt,
		GithubUpdatedAt: p.GithubUpdatedAt,
	})
	if err == nil {
		return row, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return db.PullRequest{}, err
	}

	// Nothing was updated: the row either does not exist or is newer than this
	// event. Look before inserting so a stale event is a no-op, not a rewrite.
	existing, err := s.Queries.GetPullRequestByNumber(ctx, db.GetPullRequestByNumberParams{
		WorkspaceID: p.WorkspaceID,
		RepoOwner:   p.RepoOwner,
		RepoName:    p.RepoName,
		Number:      p.Number,
	})
	if err == nil {
		return existing, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return db.PullRequest{}, err
	}

	// A concurrent delivery may have inserted it between the two statements;
	// the insert's conflict clause keeps that a refresh rather than an error.
	return s.Queries.InsertPullRequest(ctx, p)
}
