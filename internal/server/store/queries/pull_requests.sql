-- name: InsertPullRequest :one
-- Writes a PR row, or refreshes it when the same PR is seen again. The caller
-- (store.RecordPullRequest) only reaches this after a guarded update found
-- nothing to do, so the values here are the newest we have seen.
INSERT INTO pull_requests (
    workspace_id, issue_id, repo_owner, repo_name, number, title, url,
    state, draft, head_branch, base_branch, author, source, close_intent,
    merged_at, github_updated_at, head_sha, body, additions, deletions,
    changed_files, author_association, head_repo
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
    $17, $18, $19, $20, $21, $22, $23
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
    head_sha = EXCLUDED.head_sha,
    body = EXCLUDED.body,
    additions = EXCLUDED.additions,
    deletions = EXCLUDED.deletions,
    changed_files = EXCLUDED.changed_files,
    author_association = EXCLUDED.author_association,
    head_repo = EXCLUDED.head_repo,
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
    head_sha = $15,
    body = $16,
    additions = $17,
    deletions = $18,
    changed_files = $19,
    author_association = $20,
    head_repo = $21,
    updated_at = now()
WHERE workspace_id = $1 AND repo_owner = $2 AND repo_name = $3 AND number = $4
  AND (github_updated_at IS NULL OR $14::timestamptz IS NULL OR $14::timestamptz >= github_updated_at)
RETURNING *;

-- name: TouchRepoPullRequest :one
-- The webhook-discovered variant: it refreshes only the fields GitHub owns and
-- never touches issue_id, source, close_intent, suppressed_at or created_at.
-- A webhook must not clear a human's link, nor take the active closing slot.
UPDATE pull_requests SET
    title = $5,
    url = $6,
    state = $7,
    draft = $8,
    head_branch = $9,
    base_branch = $10,
    author = $11,
    merged_at = $12,
    github_updated_at = $13,
    head_sha = $14,
    body = $15,
    additions = $16,
    deletions = $17,
    changed_files = $18,
    author_association = $19,
    head_repo = $20,
    updated_at = now()
WHERE workspace_id = $1 AND repo_owner = $2 AND repo_name = $3 AND number = $4
  AND (github_updated_at IS NULL OR $13::timestamptz IS NULL OR $13::timestamptz >= github_updated_at)
RETURNING *;

-- name: InsertRepoPullRequest :one
-- Records a PR the webhook discovered, with no issue binding. The conflict
-- update is deliberately limited to GitHub-owned fields: a concurrent insert
-- or a later webhook must not clear issue_id/source/close_intent.
INSERT INTO pull_requests (
    workspace_id, issue_id, repo_owner, repo_name, number, title, url,
    state, draft, head_branch, base_branch, author, source, close_intent,
    merged_at, github_updated_at, head_sha, body, additions, deletions,
    changed_files, author_association, head_repo
) VALUES (
    $1, NULL, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'github', false,
    $12, $13, $14, $15, $16, $17, $18, $19, $20
)
ON CONFLICT (workspace_id, repo_owner, repo_name, number) DO UPDATE SET
    title = EXCLUDED.title,
    url = EXCLUDED.url,
    state = EXCLUDED.state,
    draft = EXCLUDED.draft,
    head_branch = EXCLUDED.head_branch,
    base_branch = EXCLUDED.base_branch,
    author = EXCLUDED.author,
    merged_at = EXCLUDED.merged_at,
    github_updated_at = EXCLUDED.github_updated_at,
    head_sha = EXCLUDED.head_sha,
    body = EXCLUDED.body,
    additions = EXCLUDED.additions,
    deletions = EXCLUDED.deletions,
    changed_files = EXCLUDED.changed_files,
    author_association = EXCLUDED.author_association,
    head_repo = EXCLUDED.head_repo,
    updated_at = now()
RETURNING *;

-- name: GetPullRequestByRepoNumber :one
-- The webhook's entry: the PR may be linked to any workspace bound to the repo,
-- or to none. The installation ID is the external one from the payload.
SELECT pr.* FROM pull_requests pr
JOIN workspaces w ON w.id = pr.workspace_id
JOIN github_installations gi ON gi.id = w.installation_id
WHERE gi.installation_id = $1
  AND pr.repo_owner = $2 AND pr.repo_name = $3 AND pr.number = $4
ORDER BY pr.created_at ASC
LIMIT 1;

-- name: LinkPullRequestToIssue :one
-- A human's link attaches the existing repo-scoped row rather than creating a
-- second one. The active-slot index refuses when another closing PR holds it.
UPDATE pull_requests
SET issue_id = $2, close_intent = true, source = 'manual', suppressed_at = NULL, updated_at = now()
WHERE id = $1
RETURNING *;

-- name: GetPullRequestByNumber :one
SELECT * FROM pull_requests
WHERE workspace_id = $1 AND repo_owner = $2 AND repo_name = $3 AND number = $4;

-- name: GetActivePullRequest :one
-- The issue's live line of work: open, claiming to close the issue, and not
-- unlinked by a human.
--
-- It is also what a new task continues, which is why it is only reachable from
-- the two certain entries: the platform opens a PR for a task, or a human links
-- one. Nothing infers a link, so every row here is a statement rather than a
-- guess. An inferred entry would have to be kept out of this query.
SELECT * FROM pull_requests
WHERE issue_id = $1::uuid
  AND state = 'open'
  AND close_intent
  AND suppressed_at IS NULL
ORDER BY created_at DESC
LIMIT 1;

-- name: ListPullRequestsByIssue :many
SELECT * FROM pull_requests
WHERE issue_id = $1::uuid
ORDER BY created_at DESC;

-- name: ListPullRequestsByWorkspace :many
SELECT pr.*, i.number AS issue_number, i.title AS issue_title, w.issue_prefix
FROM pull_requests pr
JOIN workspaces w ON w.id = pr.workspace_id
LEFT JOIN issues i ON i.id = pr.issue_id
WHERE pr.workspace_id = $1
  AND ($2::text = '' OR pr.state = $2::text)
ORDER BY COALESCE(pr.github_updated_at, pr.updated_at) DESC
LIMIT $3;

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
WHERE issue_id = $1::uuid;
