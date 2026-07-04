-- name: CreateInstallation :one
INSERT INTO github_installations
    (user_id, installation_id, account_login, account_type, repository_selection)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (installation_id)
DO UPDATE SET
    account_login = EXCLUDED.account_login,
    account_type = EXCLUDED.account_type,
    repository_selection = EXCLUDED.repository_selection,
    status = CASE WHEN github_installations.status = 'revoked' THEN 'active' ELSE github_installations.status END,
    updated_at = now()
RETURNING *;

-- name: GetInstallation :one
SELECT * FROM github_installations WHERE installation_id = $1;

-- name: GetInstallationByDBID :one
SELECT * FROM github_installations WHERE id = $1;

-- name: ListInstallationsByUser :many
SELECT * FROM github_installations WHERE user_id = $1 AND status != 'revoked' ORDER BY created_at DESC;

-- name: UpdateInstallationStatus :exec
UPDATE github_installations SET status = $2, updated_at = now() WHERE installation_id = $1;

-- name: UpsertRepo :exec
INSERT INTO github_repos (installation_id, github_repo_id, owner, name, full_name, private)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (installation_id, github_repo_id)
DO UPDATE SET owner = EXCLUDED.owner, name = EXCLUDED.name, full_name = EXCLUDED.full_name, private = EXCLUDED.private;

-- name: DeleteReposNotInList :exec
DELETE FROM github_repos
WHERE installation_id = $1 AND github_repo_id != ALL($2::bigint[]);

-- name: ListReposByInstallation :many
SELECT * FROM github_repos WHERE installation_id = $1 ORDER BY full_name;

-- name: CreateWebhookEvent :exec
INSERT INTO webhook_events (github_delivery_id, event_type, action, payload)
VALUES ($1, $2, $3, $4)
ON CONFLICT (github_delivery_id) DO NOTHING;
