-- name: CreateAgent :one
INSERT INTO agents (workspace_id, name, description, instructions, model, runtime_id, enabled, created_by)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *;

-- name: ListAgentsByWorkspace :many
SELECT a.*, ar.provider AS runtime_provider, ar.name AS runtime_name, ar.daemon_id AS runtime_daemon_id
FROM agents a
JOIN agent_runtimes ar ON ar.id = a.runtime_id
WHERE a.workspace_id = $1
ORDER BY a.created_at ASC;

-- name: GetAgent :one
SELECT a.*, ar.provider AS runtime_provider, ar.name AS runtime_name, ar.daemon_id AS runtime_daemon_id
FROM agents a
JOIN agent_runtimes ar ON ar.id = a.runtime_id
WHERE a.id = $1 AND a.workspace_id = $2;

-- name: UpdateAgent :one
UPDATE agents SET name = $3, description = $4, instructions = $5, model = $6, runtime_id = $7, enabled = $8, updated_at = now()
WHERE id = $1 AND workspace_id = $2 RETURNING *;

-- name: DeleteAgent :exec
DELETE FROM agents WHERE id = $1 AND workspace_id = $2;

-- name: ListAgentNamesByWorkspace :many
SELECT name FROM agents WHERE workspace_id = $1 AND enabled = true ORDER BY name;
