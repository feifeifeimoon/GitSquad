-- name: CreateIssue :one
INSERT INTO issues (workspace_id, number, title, description, status, creator_user_id, assigned_agents, source_upstream_issue)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *;

-- name: ListIssuesByWorkspace :many
SELECT i.*, w.issue_prefix AS issue_prefix, COALESCE(u.login, '') AS creator_name,
       (SELECT count(*) FROM issue_comments c WHERE c.issue_id = i.id) AS comments_count
FROM issues i
JOIN workspaces w ON w.id = i.workspace_id
LEFT JOIN users u ON u.id = i.creator_user_id
WHERE i.workspace_id = $1
ORDER BY i.status, i.created_at DESC;

-- name: GetIssue :one
SELECT i.*, w.issue_prefix AS issue_prefix, COALESCE(u.login, '') AS creator_name,
       (SELECT count(*) FROM issue_comments c WHERE c.issue_id = i.id) AS comments_count
FROM issues i
JOIN workspaces w ON w.id = i.workspace_id
LEFT JOIN users u ON u.id = i.creator_user_id
WHERE i.id = $1 AND i.workspace_id = $2;

-- name: IncrementWorkspaceIssueCounter :one
UPDATE workspaces SET issue_counter = issue_counter + 1 WHERE id = $1 RETURNING issue_counter;

-- name: GetWorkspaceNumbering :one
SELECT issue_prefix FROM workspaces WHERE id = $1;

-- name: AddIssueAssignedAgent :exec
UPDATE issues SET assigned_agents = array_append(assigned_agents, $2), updated_at = now()
WHERE id = $1 AND NOT ($2 = ANY(assigned_agents));

-- name: UpdateIssueStatus :one
UPDATE issues SET status = $3, updated_at = now() WHERE id = $1 AND workspace_id = $2 RETURNING *;

-- name: UpdateIssueTitleDescription :one
UPDATE issues SET title = $3, description = $4, updated_at = now() WHERE id = $1 AND workspace_id = $2 RETURNING *;

-- name: CreateComment :one
INSERT INTO issue_comments (issue_id, author_type, author_id, author_name, type, content)
VALUES ($1, $2, $3, $4, $5, $6) RETURNING *;

-- name: ListCommentsByIssue :many
SELECT * FROM issue_comments WHERE issue_id = $1 ORDER BY created_at ASC;
