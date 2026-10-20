-- name: CreatePRReview :one
INSERT INTO pr_reviews (workspace_id, pull_request_id, agent_id, head_sha, trigger_kind)
VALUES ($1, $2, $3, $4, $5) RETURNING *;

-- name: SetPRReviewTask :exec
UPDATE pr_reviews SET task_id = $2, updated_at = now() WHERE id = $1;

-- name: MarkReviewRunning :one
UPDATE pr_reviews SET status = 'running', updated_at = now()
WHERE task_id = $1::uuid AND status = 'queued' RETURNING *;

-- name: MarkReviewCompleted :one
UPDATE pr_reviews SET
    status = 'completed',
    summary = $2,
    findings = $3,
    github_review_id = $4,
    url = $5,
    head_sha = $6,
    completed_at = now(),
    updated_at = now()
WHERE task_id = $1::uuid AND status IN ('queued','running')
RETURNING *;

-- name: MarkReviewFailed :one
UPDATE pr_reviews SET status = 'failed', error = $2, completed_at = now(), updated_at = now()
WHERE task_id = $1::uuid AND status IN ('queued','running') RETURNING *;

-- name: MarkReviewFailedByID :one
UPDATE pr_reviews SET status = 'failed', error = $2, completed_at = now(), updated_at = now()
WHERE id = $1 AND status IN ('queued','running') RETURNING *;

-- name: FailReviewsForTasks :many
UPDATE pr_reviews SET status = 'failed', error = $2, completed_at = now(), updated_at = now()
WHERE task_id = ANY($1::uuid[]) AND status IN ('queued','running') RETURNING *;

-- name: ReconcileReviewStates :many
-- Releases a ledger row whose task can no longer finish: the task is terminal
-- (or was never written) but the review is still holding the PR's in-flight
-- slot. The five-minute floor keeps this from racing a completion that is
-- currently writing its review back to GitHub.
UPDATE pr_reviews r SET status = 'failed', error = 'orphaned', completed_at = now(), updated_at = now()
WHERE r.status IN ('queued','running')
  AND r.updated_at < now() - interval '5 minutes'
  AND (r.task_id IS NULL OR EXISTS (
      SELECT 1 FROM tasks t WHERE t.id = r.task_id AND t.status IN ('completed','failed','cancelled')
  ))
RETURNING *;

-- name: CancelPRReviewsByTasks :many
UPDATE pr_reviews SET status = 'cancelled', updated_at = now()
WHERE task_id = ANY($1::uuid[]) AND status = 'queued' RETURNING *;

-- name: HasCompletedReviewForSHA :one
SELECT EXISTS(
    SELECT 1 FROM pr_reviews
    WHERE pull_request_id = $1 AND head_sha = $2 AND status = 'completed'
) AS exists;

-- name: GetPRReview :one
SELECT * FROM pr_reviews WHERE id = $1;

-- name: GetLatestReviewForPR :one
SELECT * FROM pr_reviews WHERE pull_request_id = $1 ORDER BY created_at DESC LIMIT 1;

-- name: ListReviewsByPullRequest :many
SELECT * FROM pr_reviews WHERE pull_request_id = $1 ORDER BY created_at DESC;

-- name: LatestReviewsByPullRequestIDs :many
SELECT DISTINCT ON (pr.pull_request_id) pr.*, COALESCE(a.name, '') AS agent_name
FROM pr_reviews pr
LEFT JOIN agents a ON a.id = pr.agent_id
WHERE pr.pull_request_id = ANY($1::uuid[])
ORDER BY pr.pull_request_id, pr.created_at DESC;

-- name: GetTaskUsageTotal :one
SELECT COALESCE(SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens), 0)::bigint AS tokens
FROM task_usage WHERE task_id = $1::uuid;
