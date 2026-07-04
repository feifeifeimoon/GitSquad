-- name: CreateUser :one
INSERT INTO users (login, avatar_url) VALUES ($1, $2) RETURNING *;

-- name: FindUserByID :one
SELECT * FROM users WHERE id = $1;

-- name: UpdateUserAvatar :exec
UPDATE users SET avatar_url = $2, updated_at = now() WHERE id = $1;

-- name: CreateIdentity :one
INSERT INTO user_identities (user_id, provider, provider_user_id, provider_login, email, access_token, refresh_token)
VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *;

-- name: FindIdentityByProvider :one
SELECT ui.*, u.id as user_id, u.login as user_login, u.avatar_url as user_avatar_url,
       u.created_at as user_created_at, u.updated_at as user_updated_at
FROM user_identities ui
JOIN users u ON u.id = ui.user_id
WHERE ui.provider = $1 AND ui.provider_user_id = $2;

-- name: UpdateIdentityTokens :exec
UPDATE user_identities SET access_token = $2, refresh_token = $3, updated_at = now() WHERE id = $1;
