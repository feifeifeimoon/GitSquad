-- name: InsertPullRequest :one
-- Writes a PR row, or refreshes it when the same PR is seen again. The caller
-- (store.RecordPullRequest) only reaches this after a guarded update found
-- nothing to do, so the values here are the newest we have seen.
INSERT INTO pull_requests (
    workspace_id, issue_id, repo_owner, repo_name, number, title, url,
    state, draft, head_branch, base_branch, author, source, close_intent,
    merged_at, github_updated_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
)
ON CONFLICT (workspace_id, repo_owner, repo_name, number) DO UPDATE SET
    title = EXCLUDED.title,
    url = EXCLUDED.url,
    state = EXCLUDED.state,
    draft = EXCLUDED.draft,
    head_branch = EXCLUDED.head_branch,
    base_branch = EXCLUDED.base_branch,
    author = EXCLUDED.author,
    close_intent = EXCLUDED.close_intent,
    merged_at = EXCLUDED.merged_at,
    github_updated_at = EXCLUDED.github_updated_at,
    updated_at = now()
RETURNING *;

-- name: TouchPullRequest :one
-- Refreshes an existing row from an event, but only when that event is at least
-- as new as what is stored: GitHub does not guarantee delivery order, so a
-- `merged` notification can arrive before the `opened` one it belongs to, and
-- an older event must not roll the state back.
--
-- Deliberately not `ON CONFLICT ... DO UPDATE ... WHERE`: Postgres returns no
-- row from a WHERE'd conflict update, which would leave the caller unable to
-- tell "nothing stored yet" from "stale event". Returning no rows here is
-- unambiguous — the caller then looks the row up, or inserts it.
--
-- issue_id, source, suppressed_at and created_at are never updated: a PR cannot
-- move between issues, the first link is the provenance, and a human's unlink
-- is only ever cleared by the unlink API.
UPDATE pull_requests SET
    title = $5,
    url = $6,
    state = $7,
    draft = $8,
    head_branch = $9,
    base_branch = $10,
    author = $11,
    close_intent = $12,
    merged_at = $13,
    github_updated_at = $14,
    updated_at = now()
WHERE workspace_id = $1 AND repo_owner = $2 AND repo_name = $3 AND number = $4
  AND (github_updated_at IS NULL OR $14::timestamptz IS NULL OR $14::timestamptz >= github_updated_at)
RETURNING *;

-- name: GetPullRequestByNumber :one
SELECT * FROM pull_requests
WHERE workspace_id = $1 AND repo_owner = $2 AND repo_name = $3 AND number = $4;

-- name: GetActivePullRequest :one
-- The issue's live line of work: open, claiming to close the issue, and not
-- unlinked by a human.
SELECT * FROM pull_requests
WHERE issue_id = $1
  AND state = 'open'
  AND close_intent
  AND suppressed_at IS NULL
ORDER BY created_at DESC
LIMIT 1;

-- name: ListPullRequestsByIssue :many
SELECT * FROM pull_requests
WHERE issue_id = $1
ORDER BY created_at DESC;

-- name: GetPullRequest :one
SELECT * FROM pull_requests WHERE id = $1;

-- name: SuppressPullRequest :exec
-- An unlink is a tombstone, not a delete: the row keeps the history and stops
-- occupying the active slot, and the automatic entries know not to link it back.
UPDATE pull_requests
SET suppressed_at = now(), updated_at = now()
WHERE id = $1;

-- name: UnsuppressPullRequest :exec
-- Re-linking needs the active slot back. The partial unique index refuses when
-- another PR holds it, which is the rule: deal with the occupant first.
UPDATE pull_requests
SET suppressed_at = NULL, updated_at = now()
WHERE id = $1;

-- name: CountOpenClosingPullRequests :one
-- Feeds the aggregate that decides whether the issue is finished: the issue is
-- done when nothing is in flight and something merged with closing intent.
SELECT
    COUNT(*) FILTER (WHERE state = 'open' AND suppressed_at IS NULL)::bigint AS open_count,
    COUNT(*) FILTER (WHERE state = 'merged' AND close_intent AND suppressed_at IS NULL)::bigint AS merged_closing_count
FROM pull_requests
WHERE issue_id = $1;
