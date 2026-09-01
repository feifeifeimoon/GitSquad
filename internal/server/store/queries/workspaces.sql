-- name: CreateWorkspace :one
INSERT INTO workspaces (user_id, installation_id, github_repo_id, name, issue_prefix)
VALUES ($1, $2, $3, $4, $5) RETURNING *;

-- name: ListWorkspacesByUser :many
SELECT * FROM workspaces WHERE user_id = $1 AND status != 'archived' ORDER BY created_at DESC;

-- name: ListWorkspacesWithRepo :many
SELECT w.id, w.user_id, w.installation_id, w.github_repo_id, w.name, w.status, w.created_at, w.updated_at,
       r.full_name AS repo_full_name, r.owner AS repo_owner, r.name AS repo_name, r.private AS repo_private
FROM workspaces w
JOIN github_repos r ON r.id = w.github_repo_id
WHERE w.user_id = $1 AND w.status != 'archived'
ORDER BY w.created_at DESC;

-- name: GetWorkspace :one
SELECT * FROM workspaces WHERE id = $1;

-- name: GetWorkspaceWithRepo :one
SELECT w.id, w.user_id, w.installation_id, w.github_repo_id, w.name, w.status, w.created_at, w.updated_at,
       r.full_name AS repo_full_name, r.owner AS repo_owner, r.name AS repo_name, r.private AS repo_private
FROM workspaces w
JOIN github_repos r ON r.id = w.github_repo_id
WHERE w.id = $1;

-- name: UpdateWorkspaceStatus :exec
UPDATE workspaces SET status = $2, updated_at = now() WHERE id = $1;

-- name: DeleteWorkspace :exec
DELETE FROM workspaces WHERE id = $1;

-- name: UpdateWorkspaceAvatar :exec
UPDATE workspaces SET avatar_url = $2, updated_at = now() WHERE id = $1;
