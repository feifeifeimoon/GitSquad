-- name: CreateWorkspace :one
INSERT INTO workspaces (user_id, installation_id, github_repo_id, name, issue_prefix, slug)
VALUES ($1, $2, $3, $4, $5, $6) RETURNING *;

-- name: ListWorkspacesByUser :many
SELECT * FROM workspaces WHERE user_id = $1 AND status != 'archived' ORDER BY created_at DESC;

-- name: ListWorkspacesWithRepo :many
SELECT w.id, w.user_id, w.installation_id, w.github_repo_id, w.name, w.status, w.created_at, w.updated_at, w.slug,
       w.avatar_url,
       r.full_name AS repo_full_name, r.owner AS repo_owner, r.name AS repo_name, r.private AS repo_private
FROM workspaces w
JOIN github_repos r ON r.id = w.github_repo_id
WHERE w.user_id = $1 AND w.status != 'archived'
ORDER BY w.created_at DESC;

-- name: GetWorkspace :one
SELECT * FROM workspaces WHERE id = $1;

-- name: GetWorkspaceBySlug :one
SELECT * FROM workspaces WHERE user_id = $1 AND slug = $2 AND status != 'archived';

-- name: GetWorkspaceWithRepo :one
SELECT w.id, w.user_id, w.installation_id, w.github_repo_id, w.name, w.status, w.created_at, w.updated_at, w.slug,
       w.avatar_url,
       r.full_name AS repo_full_name, r.owner AS repo_owner, r.name AS repo_name, r.private AS repo_private,
       r.default_branch AS repo_default_branch
FROM workspaces w
JOIN github_repos r ON r.id = w.github_repo_id
WHERE w.id = $1;

-- name: UpdateWorkspaceStatus :exec
UPDATE workspaces SET status = $2, updated_at = now() WHERE id = $1;

-- name: DeleteWorkspace :exec
DELETE FROM workspaces WHERE id = $1;

-- name: UpdateWorkspaceAvatar :exec
UPDATE workspaces SET avatar_url = $2, updated_at = now() WHERE id = $1;

-- name: GetWorkspaceByRepo :one
-- Resolves the workspace a webhook's repository belongs to. Excludes archived
-- workspaces: once a workspace is archived its repos stop driving issue state.
SELECT w.id, w.user_id, w.installation_id, w.github_repo_id, w.name, w.status
FROM workspaces w
JOIN github_repos r ON r.id = w.github_repo_id
JOIN github_installations i ON i.id = w.installation_id
WHERE i.installation_id = $1 AND r.owner = $2 AND r.name = $3
  AND w.status != 'archived'
ORDER BY w.created_at ASC
LIMIT 1;

-- name: ListWorkspaceMembers :many
-- The people an issue can be assigned to. Today a workspace has exactly one
-- member — the user it belongs to — so this returns one row. It is an endpoint
-- rather than a hardcoded "me" so that collaboration is a change here, not a
-- change to every caller.
SELECT u.id, u.login, COALESCE(u.avatar_url, '') AS avatar_url
FROM workspaces w
JOIN users u ON u.id = w.user_id
WHERE w.id = $1
ORDER BY u.login;
