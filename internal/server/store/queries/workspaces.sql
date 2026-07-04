-- name: CreateWorkspace :one
INSERT INTO workspaces (user_id, installation_id, github_repo_id, name)
VALUES ($1, $2, $3, $4) RETURNING *;

-- name: ListWorkspacesByUser :many
SELECT * FROM workspaces WHERE user_id = $1 AND status != 'archived' ORDER BY created_at DESC;

-- name: GetWorkspace :one
SELECT * FROM workspaces WHERE id = $1;

-- name: UpdateWorkspaceStatus :exec
UPDATE workspaces SET status = $2, updated_at = now() WHERE id = $1;
