-- name: UpsertAgentRuntime :one
INSERT INTO agent_runtimes (workspace_id, daemon_id, name, runtime_mode, provider)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (workspace_id, daemon_id, provider) DO UPDATE SET
    name = EXCLUDED.name, updated_at = now()
RETURNING *;

-- name: ListAgentRuntimesByWorkspace :many
-- The daemon's last_seen_at comes along so the service can resolve liveness
-- before the client sees it; see service.liveStatus.
SELECT ar.*, d.name AS daemon_name, d.status AS daemon_status,
       d.last_seen_at AS daemon_last_seen_at
FROM agent_runtimes ar
LEFT JOIN daemons d ON d.id = ar.daemon_id
WHERE ar.workspace_id = $1
ORDER BY ar.created_at ASC;
