-- name: CreateAgent :one
INSERT INTO agents (workspace_id, name, description, instructions, model, runtime_id, enabled, avatar_url, created_by)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *;

-- Workload counts and the in-flight issue ride along on every agent read so the
-- list can show a live status without a per-agent round trip. A claimed task
-- sits in 'dispatched' until the daemon reports "started", but it is already
-- running on that machine, so it counts as running.
--
-- workload always returns exactly one row (bare aggregates), but cur yields no
-- row at all while the agent is idle. So cur's columns are coalesced where they
-- are *referenced*, not inside the lateral: a coalesce in the lateral's select
-- list cannot apply to a row that never existed.
-- name: ListAgentsByWorkspace :many
SELECT a.*, ar.provider AS runtime_provider, ar.name AS runtime_name, ar.daemon_id AS runtime_daemon_id,
       ar.status AS runtime_status, d.name AS runtime_daemon_name, d.status AS runtime_daemon_status,
       d.last_seen_at AS runtime_daemon_last_seen_at,
       workload.running_count, workload.queued_count, workload.total_runs,
       coalesce(cur.issue_prefix, '') AS issue_prefix,
       coalesce(cur.issue_number, 0)::int AS issue_number,
       coalesce(cur.issue_title, '') AS issue_title
FROM agents a
JOIN agent_runtimes ar ON ar.id = a.runtime_id
LEFT JOIN daemons d ON d.id = ar.daemon_id
LEFT JOIN LATERAL (
    SELECT (count(*) FILTER (WHERE t.status IN ('dispatched','running')))::int AS running_count,
           (count(*) FILTER (WHERE t.status = 'queued'))::int AS queued_count,
           (count(*) FILTER (WHERE t.status IN ('completed','failed')))::int AS total_runs
    FROM tasks t WHERE t.agent_id = a.id
) workload ON true
LEFT JOIN LATERAL (
    SELECT w.issue_prefix, i.number AS issue_number, i.title AS issue_title
    FROM tasks t
    JOIN issues i ON i.id = t.issue_id
    JOIN workspaces w ON w.id = t.workspace_id
    WHERE t.agent_id = a.id AND t.status IN ('dispatched','running')
    ORDER BY t.started_at DESC NULLS LAST, t.created_at DESC
    LIMIT 1
) cur ON true
WHERE a.workspace_id = $1
ORDER BY a.created_at ASC;

-- name: GetAgent :one
SELECT a.*, ar.provider AS runtime_provider, ar.name AS runtime_name, ar.daemon_id AS runtime_daemon_id,
       ar.status AS runtime_status, d.name AS runtime_daemon_name, d.status AS runtime_daemon_status,
       d.last_seen_at AS runtime_daemon_last_seen_at,
       workload.running_count, workload.queued_count, workload.total_runs,
       coalesce(cur.issue_prefix, '') AS issue_prefix,
       coalesce(cur.issue_number, 0)::int AS issue_number,
       coalesce(cur.issue_title, '') AS issue_title
FROM agents a
JOIN agent_runtimes ar ON ar.id = a.runtime_id
LEFT JOIN daemons d ON d.id = ar.daemon_id
LEFT JOIN LATERAL (
    SELECT (count(*) FILTER (WHERE t.status IN ('dispatched','running')))::int AS running_count,
           (count(*) FILTER (WHERE t.status = 'queued'))::int AS queued_count,
           (count(*) FILTER (WHERE t.status IN ('completed','failed')))::int AS total_runs
    FROM tasks t WHERE t.agent_id = a.id
) workload ON true
LEFT JOIN LATERAL (
    SELECT w.issue_prefix, i.number AS issue_number, i.title AS issue_title
    FROM tasks t
    JOIN issues i ON i.id = t.issue_id
    JOIN workspaces w ON w.id = t.workspace_id
    WHERE t.agent_id = a.id AND t.status IN ('dispatched','running')
    ORDER BY t.started_at DESC NULLS LAST, t.created_at DESC
    LIMIT 1
) cur ON true
WHERE a.id = $1 AND a.workspace_id = $2;

-- name: UpdateAgent :one
UPDATE agents SET name = $3, description = $4, instructions = $5, model = $6, runtime_id = $7, enabled = $8, avatar_url = $9, updated_at = now()
WHERE id = $1 AND workspace_id = $2 RETURNING *;

-- name: DeleteAgent :exec
DELETE FROM agents WHERE id = $1 AND workspace_id = $2;

-- name: ListAgentNamesByWorkspace :many
SELECT name FROM agents WHERE workspace_id = $1 AND enabled = true ORDER BY name;

-- name: ListAgentsByDaemon :many
SELECT a.*, ar.provider AS runtime_provider, ar.name AS runtime_name, ar.daemon_id AS runtime_daemon_id,
       ar.status AS runtime_status, d.name AS runtime_daemon_name, d.status AS runtime_daemon_status,
       d.last_seen_at AS runtime_daemon_last_seen_at,
       w.name AS workspace_name, w.slug AS workspace_slug,
       workload.running_count, workload.queued_count, workload.total_runs,
       coalesce(cur.issue_prefix, '') AS issue_prefix,
       coalesce(cur.issue_number, 0)::int AS issue_number,
       coalesce(cur.issue_title, '') AS issue_title
FROM agents a
JOIN agent_runtimes ar ON ar.id = a.runtime_id
JOIN workspaces w ON w.id = a.workspace_id
LEFT JOIN daemons d ON d.id = ar.daemon_id
LEFT JOIN LATERAL (
    SELECT (count(*) FILTER (WHERE t.status IN ('dispatched','running')))::int AS running_count,
           (count(*) FILTER (WHERE t.status = 'queued'))::int AS queued_count,
           (count(*) FILTER (WHERE t.status IN ('completed','failed')))::int AS total_runs
    FROM tasks t WHERE t.agent_id = a.id
) workload ON true
-- aliased w2 because the outer query already joins workspaces as w
LEFT JOIN LATERAL (
    SELECT w2.issue_prefix, i.number AS issue_number, i.title AS issue_title
    FROM tasks t
    JOIN issues i ON i.id = t.issue_id
    JOIN workspaces w2 ON w2.id = t.workspace_id
    WHERE t.agent_id = a.id AND t.status IN ('dispatched','running')
    ORDER BY t.started_at DESC NULLS LAST, t.created_at DESC
    LIMIT 1
) cur ON true
WHERE ar.daemon_id = $1 AND w.user_id = $2
ORDER BY a.name ASC;
