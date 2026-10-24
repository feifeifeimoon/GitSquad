-- Reads of the token-usage ledger, plus the runs that produced it. Every query
-- is scoped to the workspaces a user owns and to a half-open [from_at, to_at)
-- window on when the run *finished* (tasks.completed_at), which is also when
-- its usage row is written.
--
-- Tasks is the driving table, not task_usage. A run that finished without
-- reporting tokens still happened and still has an outcome, and both the run
-- counters and the chart's Runs view have to include it — driving from the
-- ledger would silently drop exactly the runs the coverage note exists to
-- admit are missing.

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

-- Totals for a window, plus the coverage and the outcomes that keep the
-- headline figures honest.
--
-- runs_total counts runs that *finished* in the window. The gap between it and
-- runs_with_usage is usage we never received — a daemon that died mid-task, a
-- provider that does not report tokens, or a run from before this table
-- existed. Those are not zero-token runs and must not be rendered as such.
--
-- completed/failed/cancelled partition runs_total, so a success rate computed
-- from two of them always has a denominator that reconciles with the card
-- beside it.
-- name: SummarizeUsage :one
SELECT
    coalesce(sum(u.input_tokens), 0)::bigint       AS input_tokens,
    coalesce(sum(u.output_tokens), 0)::bigint      AS output_tokens,
    coalesce(sum(u.cache_read_tokens), 0)::bigint  AS cache_read_tokens,
    coalesce(sum(u.cache_write_tokens), 0)::bigint AS cache_write_tokens,
    count(DISTINCT u.task_id)::int                 AS runs_with_usage,
    -- DISTINCT because the usage join fans a run out once per reported model;
    -- the run counters must count runs, not ledger rows.
    count(DISTINCT t.id)::int                      AS runs_total,
    count(DISTINCT t.id) FILTER (WHERE t.status = 'completed')::int AS runs_completed,
    count(DISTINCT t.id) FILTER (WHERE t.status = 'failed')::int    AS runs_failed,
    count(DISTINCT t.id) FILTER (WHERE t.status = 'cancelled')::int AS runs_cancelled
FROM tasks t
JOIN workspaces w ON w.id = t.workspace_id
LEFT JOIN task_usage u ON u.task_id = t.id
WHERE w.user_id = sqlc.arg(user_id)
  AND t.completed_at >= sqlc.arg(from_at)::timestamptz AND t.completed_at < sqlc.arg(to_at)::timestamptz
  AND t.workspace_id = coalesce(sqlc.narg(workspace_id)::uuid, t.workspace_id);

-- The trend chart: one row per bucket, carrying both spend and outcomes so the
-- chart's Tokens and Runs views are two readings of the same series and cannot
-- drift apart.
--
-- Buckets are cut in the viewer's timezone via the tz argument rather than
-- fixed in UTC, so "yesterday" means yesterday where the reader is; rolling
-- windows then land on local day boundaries instead of drifting.
-- The bucket is formatted as text so no timezone can be reintroduced on scan.
-- The outcome filters count distinct tasks: a run that reported usage under two
-- models is one run, not two.
-- name: ListUsageSeries :many
SELECT bucket,
       coalesce(sum(input_tokens), 0)::bigint       AS input_tokens,
       coalesce(sum(output_tokens), 0)::bigint      AS output_tokens,
       coalesce(sum(cache_read_tokens), 0)::bigint  AS cache_read_tokens,
       coalesce(sum(cache_write_tokens), 0)::bigint AS cache_write_tokens,
       count(DISTINCT task_id)::int                 AS run_count,
       count(DISTINCT task_id) FILTER (WHERE status = 'completed')::int AS completed_runs,
       count(DISTINCT task_id) FILTER (WHERE status = 'failed')::int    AS failed_runs,
       count(DISTINCT task_id) FILTER (WHERE status = 'cancelled')::int AS cancelled_runs
FROM (
    SELECT (CASE
                WHEN sqlc.arg(bucket)::text = 'hour'
                  THEN to_char(date_trunc('hour', t.completed_at AT TIME ZONE sqlc.arg(tz)::text), 'YYYY-MM-DD"T"HH24:00')
                -- Six-hour bins cut on the local clock, so a day is always
                -- 00 / 06 / 12 / 18 where the reader is. date_bin's origin is a
                -- local midnight, which keeps the bounds on those four hours.
                WHEN sqlc.arg(bucket)::text = '6h'
                  THEN to_char(date_bin(interval '6 hours',
                                        t.completed_at AT TIME ZONE sqlc.arg(tz)::text,
                                        timestamp '2000-01-01'), 'YYYY-MM-DD"T"HH24:00')
                ELSE to_char(date_trunc('day', t.completed_at AT TIME ZONE sqlc.arg(tz)::text), 'YYYY-MM-DD')
            END)::text AS bucket,
           t.id AS task_id, t.status,
           u.input_tokens, u.output_tokens, u.cache_read_tokens, u.cache_write_tokens
    FROM tasks t
    JOIN workspaces w ON w.id = t.workspace_id
    LEFT JOIN task_usage u ON u.task_id = t.id
    WHERE w.user_id = sqlc.arg(user_id)
      AND t.completed_at >= sqlc.arg(from_at)::timestamptz AND t.completed_at < sqlc.arg(to_at)::timestamptz
      AND t.workspace_id = coalesce(sqlc.narg(workspace_id)::uuid, t.workspace_id)
) b
GROUP BY bucket
ORDER BY bucket;

-- The recent-runs list: what finished in the window, newest first, with the
-- tokens each run reported (absent when it reported none — the row still
-- belongs on the page).
--
-- Grouped by the primary keys of the joined tables: a run with usage under two
-- models is one row whose tokens are the sum, and every joined column is
-- functionally dependent on one of those keys.
-- name: ListUsageRuns :many
SELECT t.id, t.kind, t.status, t.started_at, t.completed_at,
       a.id AS agent_id, a.name AS agent_name, a.avatar_url AS agent_avatar_url,
       w.slug AS workspace_slug,
       coalesce(w.issue_prefix, '') AS issue_prefix,
       coalesce(i.number, 0)::int AS issue_number,
       coalesce(i.title, '') AS issue_title,
       coalesce(pr.number, 0)::int AS pr_number,
       coalesce(sum(u.input_tokens), 0)::bigint       AS input_tokens,
       coalesce(sum(u.output_tokens), 0)::bigint      AS output_tokens,
       coalesce(sum(u.cache_read_tokens), 0)::bigint  AS cache_read_tokens,
       coalesce(sum(u.cache_write_tokens), 0)::bigint AS cache_write_tokens
FROM tasks t
JOIN workspaces w ON w.id = t.workspace_id
JOIN agents a ON a.id = t.agent_id
LEFT JOIN issues i ON i.id = t.issue_id
LEFT JOIN pull_requests pr ON pr.id = t.pull_request_id
LEFT JOIN task_usage u ON u.task_id = t.id
WHERE w.user_id = sqlc.arg(user_id)
  AND t.status IN ('completed', 'failed', 'cancelled')
  AND t.completed_at >= sqlc.arg(from_at)::timestamptz AND t.completed_at < sqlc.arg(to_at)::timestamptz
  AND t.workspace_id = coalesce(sqlc.narg(workspace_id)::uuid, t.workspace_id)
GROUP BY t.id, a.id, w.id, i.id, pr.id
ORDER BY t.completed_at DESC
LIMIT sqlc.arg(row_limit);

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
  AND t.completed_at >= sqlc.arg(from_at)::timestamptz AND t.completed_at < sqlc.arg(to_at)::timestamptz
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
  AND t.completed_at >= sqlc.arg(from_at)::timestamptz AND t.completed_at < sqlc.arg(to_at)::timestamptz
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
  AND t.completed_at >= sqlc.arg(from_at)::timestamptz AND t.completed_at < sqlc.arg(to_at)::timestamptz
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
  AND t.completed_at >= sqlc.arg(from_at)::timestamptz AND t.completed_at < sqlc.arg(to_at)::timestamptz
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
  AND t.completed_at >= sqlc.arg(from_at)::timestamptz AND t.completed_at < sqlc.arg(to_at)::timestamptz
  AND t.workspace_id = coalesce(sqlc.narg(workspace_id)::uuid, t.workspace_id)
GROUP BY u.provider, u.model
ORDER BY sum(u.input_tokens + u.output_tokens + u.cache_read_tokens + u.cache_write_tokens) DESC;
