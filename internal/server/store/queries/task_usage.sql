-- Reads of the token-usage ledger. Every query is scoped to the workspaces a
-- user owns and to a half-open [from_at, to_at) window on the usage row, which
-- is written when the run finishes.

-- name: UpsertTaskUsage :exec
INSERT INTO task_usage (task_id, provider, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, now())
ON CONFLICT (task_id, provider, model) DO UPDATE SET
    -- Overwrite rather than add: a replayed report is a correction, not more
    -- usage. The daemon is the source of truth for its own run.
    input_tokens = EXCLUDED.input_tokens,
    output_tokens = EXCLUDED.output_tokens,
    cache_read_tokens = EXCLUDED.cache_read_tokens,
    cache_write_tokens = EXCLUDED.cache_write_tokens,
    updated_at = now();

-- Totals for a window, plus the coverage that keeps the UI honest.
--
-- runs_total counts runs that *finished* in the window (completed_at), because
-- that is when usage is written. The gap between it and runs_with_usage is
-- usage we never received — a daemon that died mid-task, a provider that does
-- not report tokens, or a run from before this table existed. Those are not
-- zero-token runs and must not be rendered as such.
-- name: SummarizeUsage :one
SELECT
    coalesce(sum(u.input_tokens), 0)::bigint       AS input_tokens,
    coalesce(sum(u.output_tokens), 0)::bigint      AS output_tokens,
    coalesce(sum(u.cache_read_tokens), 0)::bigint  AS cache_read_tokens,
    coalesce(sum(u.cache_write_tokens), 0)::bigint AS cache_write_tokens,
    count(DISTINCT u.task_id)::int                 AS runs_with_usage,
    (SELECT count(*)::int FROM tasks t2
     JOIN workspaces w2 ON w2.id = t2.workspace_id
     WHERE w2.user_id = sqlc.arg(user_id)
       AND t2.completed_at >= sqlc.arg(from_at)::timestamptz AND t2.completed_at < sqlc.arg(to_at)::timestamptz
       AND t2.workspace_id = coalesce(sqlc.narg(workspace_id)::uuid, t2.workspace_id)
    )::int AS runs_total
FROM task_usage u
JOIN tasks t ON t.id = u.task_id
JOIN workspaces w ON w.id = t.workspace_id
WHERE w.user_id = sqlc.arg(user_id)
  AND u.created_at >= sqlc.arg(from_at) AND u.created_at < sqlc.arg(to_at)
  AND t.workspace_id = coalesce(sqlc.narg(workspace_id)::uuid, t.workspace_id);

-- The trend chart. Buckets are cut in the viewer's timezone via the tz argument
-- rather than fixed in UTC, so "yesterday" means yesterday where the reader is;
-- rolling windows then land on local day boundaries instead of drifting.
-- The bucket is formatted as text so no timezone can be reintroduced on scan.
-- name: ListUsageSeries :many
SELECT bucket,
       sum(input_tokens)::bigint       AS input_tokens,
       sum(output_tokens)::bigint      AS output_tokens,
       sum(cache_read_tokens)::bigint  AS cache_read_tokens,
       sum(cache_write_tokens)::bigint AS cache_write_tokens,
       count(DISTINCT task_id)::int    AS run_count
FROM (
    SELECT (CASE WHEN sqlc.arg(bucket)::text = 'hour'
                 THEN to_char(date_trunc('hour', u.created_at AT TIME ZONE sqlc.arg(tz)::text), 'YYYY-MM-DD"T"HH24:00')
                 ELSE to_char(date_trunc('day', u.created_at AT TIME ZONE sqlc.arg(tz)::text), 'YYYY-MM-DD')
            END)::text AS bucket,
           u.task_id, u.input_tokens, u.output_tokens, u.cache_read_tokens, u.cache_write_tokens
    FROM task_usage u
    JOIN tasks t ON t.id = u.task_id
    JOIN workspaces w ON w.id = t.workspace_id
    WHERE w.user_id = sqlc.arg(user_id)
      AND u.created_at >= sqlc.arg(from_at) AND u.created_at < sqlc.arg(to_at)
      AND t.workspace_id = coalesce(sqlc.narg(workspace_id)::uuid, t.workspace_id)
) b
GROUP BY bucket
ORDER BY bucket;

-- name: ListUsageByAgent :many
SELECT a.id AS agent_id, a.name AS agent_name, a.avatar_url AS agent_avatar_url,
       sum(u.input_tokens)::bigint       AS input_tokens,
       sum(u.output_tokens)::bigint      AS output_tokens,
       sum(u.cache_read_tokens)::bigint  AS cache_read_tokens,
       sum(u.cache_write_tokens)::bigint AS cache_write_tokens,
       count(DISTINCT u.task_id)::int    AS run_count
FROM task_usage u
JOIN tasks t ON t.id = u.task_id
JOIN workspaces w ON w.id = t.workspace_id
JOIN agents a ON a.id = t.agent_id
WHERE w.user_id = sqlc.arg(user_id)
  AND u.created_at >= sqlc.arg(from_at) AND u.created_at < sqlc.arg(to_at)
  AND t.workspace_id = coalesce(sqlc.narg(workspace_id)::uuid, t.workspace_id)
GROUP BY a.id, a.name, a.avatar_url
ORDER BY sum(u.input_tokens + u.output_tokens + u.cache_read_tokens + u.cache_write_tokens) DESC;

-- The machine a run was dispatched to. assigned_daemon_id is nullable, so a run
-- with no daemon is grouped under a NULL id and labelled rather than dropped —
-- dropping it would make the rows stop adding up to the total beside them.
-- name: ListUsageByDaemon :many
SELECT t.assigned_daemon_id AS daemon_id, coalesce(d.name, 'unassigned') AS daemon_name,
       sum(u.input_tokens)::bigint       AS input_tokens,
       sum(u.output_tokens)::bigint      AS output_tokens,
       sum(u.cache_read_tokens)::bigint  AS cache_read_tokens,
       sum(u.cache_write_tokens)::bigint AS cache_write_tokens,
       count(DISTINCT u.task_id)::int    AS run_count
FROM task_usage u
JOIN tasks t ON t.id = u.task_id
JOIN workspaces w ON w.id = t.workspace_id
LEFT JOIN daemons d ON d.id = t.assigned_daemon_id
WHERE w.user_id = sqlc.arg(user_id)
  AND u.created_at >= sqlc.arg(from_at) AND u.created_at < sqlc.arg(to_at)
  AND t.workspace_id = coalesce(sqlc.narg(workspace_id)::uuid, t.workspace_id)
GROUP BY t.assigned_daemon_id, d.name
ORDER BY sum(u.input_tokens + u.output_tokens + u.cache_read_tokens + u.cache_write_tokens) DESC;

-- name: ListUsageByWorkspace :many
SELECT w.id AS workspace_id, w.name AS workspace_name, w.slug AS workspace_slug,
       sum(u.input_tokens)::bigint       AS input_tokens,
       sum(u.output_tokens)::bigint      AS output_tokens,
       sum(u.cache_read_tokens)::bigint  AS cache_read_tokens,
       sum(u.cache_write_tokens)::bigint AS cache_write_tokens,
       count(DISTINCT u.task_id)::int    AS run_count
FROM task_usage u
JOIN tasks t ON t.id = u.task_id
JOIN workspaces w ON w.id = t.workspace_id
WHERE w.user_id = sqlc.arg(user_id)
  AND u.created_at >= sqlc.arg(from_at) AND u.created_at < sqlc.arg(to_at)
GROUP BY w.id, w.name, w.slug
ORDER BY sum(u.input_tokens + u.output_tokens + u.cache_read_tokens + u.cache_write_tokens) DESC;

-- issue_key is composed in Go from prefix + number, the same way the task
-- payload and the agent list build it.
-- name: ListUsageByIssue :many
SELECT t.issue_id AS issue_id, i.number AS issue_number, i.title AS issue_title,
       w.issue_prefix AS issue_prefix, w.name AS workspace_name, w.slug AS workspace_slug,
       sum(u.input_tokens)::bigint       AS input_tokens,
       sum(u.output_tokens)::bigint      AS output_tokens,
       sum(u.cache_read_tokens)::bigint  AS cache_read_tokens,
       sum(u.cache_write_tokens)::bigint AS cache_write_tokens,
       count(DISTINCT u.task_id)::int    AS run_count
FROM task_usage u
JOIN tasks t ON t.id = u.task_id
JOIN workspaces w ON w.id = t.workspace_id
JOIN issues i ON i.id = t.issue_id
WHERE w.user_id = sqlc.arg(user_id)
  AND u.created_at >= sqlc.arg(from_at) AND u.created_at < sqlc.arg(to_at)
  AND t.workspace_id = coalesce(sqlc.narg(workspace_id)::uuid, t.workspace_id)
GROUP BY t.issue_id, i.number, i.title, w.issue_prefix, w.name, w.slug
ORDER BY sum(u.input_tokens + u.output_tokens + u.cache_read_tokens + u.cache_write_tokens) DESC;

-- Grouped by provider *and* model: the same model id can be served by different
-- providers, and their tokens are not comparable.
-- name: ListUsageByModel :many
SELECT u.provider, u.model,
       sum(u.input_tokens)::bigint       AS input_tokens,
       sum(u.output_tokens)::bigint      AS output_tokens,
       sum(u.cache_read_tokens)::bigint  AS cache_read_tokens,
       sum(u.cache_write_tokens)::bigint AS cache_write_tokens,
       count(DISTINCT u.task_id)::int    AS run_count
FROM task_usage u
JOIN tasks t ON t.id = u.task_id
JOIN workspaces w ON w.id = t.workspace_id
WHERE w.user_id = sqlc.arg(user_id)
  AND u.created_at >= sqlc.arg(from_at) AND u.created_at < sqlc.arg(to_at)
  AND t.workspace_id = coalesce(sqlc.narg(workspace_id)::uuid, t.workspace_id)
GROUP BY u.provider, u.model
ORDER BY sum(u.input_tokens + u.output_tokens + u.cache_read_tokens + u.cache_write_tokens) DESC;
