-- name: CreateIssue :one
INSERT INTO issues (workspace_id, number, title, description, status, creator_user_id, assignee_user_id, source_upstream_issue)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *;

-- name: ListIssuesByWorkspace :many
SELECT i.*, w.issue_prefix AS issue_prefix, COALESCE(u.login, '') AS creator_name,
       au.id AS assignee_id, COALESCE(au.login, '') AS assignee_login,
       COALESCE(au.avatar_url, '') AS assignee_avatar_url,
       (SELECT count(*) FROM issue_comments c WHERE c.issue_id = i.id) AS comments_count,
       COALESCE((SELECT pr.number FROM pull_requests pr
                 WHERE pr.issue_id = i.id AND pr.state = 'open' AND pr.close_intent
                   AND pr.suppressed_at IS NULL
                 ORDER BY pr.created_at DESC LIMIT 1), 0)::int AS active_pr_number
FROM issues i
JOIN workspaces w ON w.id = i.workspace_id
LEFT JOIN users u ON u.id = i.creator_user_id
LEFT JOIN users au ON au.id = i.assignee_user_id
WHERE i.workspace_id = $1
ORDER BY i.status, i.created_at DESC;

-- name: GetIssue :one
SELECT i.*, w.issue_prefix AS issue_prefix, COALESCE(u.login, '') AS creator_name,
       au.id AS assignee_id, COALESCE(au.login, '') AS assignee_login,
       COALESCE(au.avatar_url, '') AS assignee_avatar_url,
       (SELECT count(*) FROM issue_comments c WHERE c.issue_id = i.id) AS comments_count
FROM issues i
JOIN workspaces w ON w.id = i.workspace_id
LEFT JOIN users u ON u.id = i.creator_user_id
LEFT JOIN users au ON au.id = i.assignee_user_id
WHERE i.id = $1 AND i.workspace_id = $2;

-- name: GetIssueByNumber :one
SELECT i.*, w.issue_prefix AS issue_prefix, COALESCE(u.login, '') AS creator_name,
       au.id AS assignee_id, COALESCE(au.login, '') AS assignee_login,
       COALESCE(au.avatar_url, '') AS assignee_avatar_url,
       (SELECT count(*) FROM issue_comments c WHERE c.issue_id = i.id) AS comments_count
FROM issues i
JOIN workspaces w ON w.id = i.workspace_id
LEFT JOIN users u ON u.id = i.creator_user_id
LEFT JOIN users au ON au.id = i.assignee_user_id
WHERE i.workspace_id = $1 AND i.number = $2;

-- name: IncrementWorkspaceIssueCounter :one
UPDATE workspaces SET issue_counter = issue_counter + 1 WHERE id = $1 RETURNING issue_counter;

-- name: GetWorkspaceNumbering :one
SELECT issue_prefix FROM workspaces WHERE id = $1;

-- name: UpdateIssueStatus :one
UPDATE issues SET status = $3, updated_at = now() WHERE id = $1 AND workspace_id = $2 RETURNING *;

-- name: UpdateIssueTitleDescription :one
UPDATE issues SET title = $3, description = $4, updated_at = now() WHERE id = $1 AND workspace_id = $2 RETURNING *;

-- name: UpdateIssueAssignee :one
-- The one person accountable for the issue; NULL clears it. A separate query
-- from the other field updates so a status-only edit can never touch it.
UPDATE issues SET assignee_user_id = sqlc.narg(assignee_user_id)::uuid, updated_at = now()
WHERE id = $1 AND workspace_id = $2 RETURNING *;

-- name: CreateComment :one
INSERT INTO issue_comments (issue_id, author_type, author_id, author_name, type, content)
VALUES ($1, $2, $3, $4, $5, $6) RETURNING *;

-- name: ListCommentsByIssue :many
SELECT * FROM issue_comments WHERE issue_id = $1 ORDER BY created_at ASC;
