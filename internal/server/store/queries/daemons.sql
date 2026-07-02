-- daemon_tokens
-- name: CreateToken :one
INSERT INTO daemon_tokens (token_hash, token_prefix, pairing_code, machine_name, status, expires_at)
VALUES ($1, $2, $3, $4, 'pending', $5) RETURNING *;

-- name: CreateActiveToken :one
INSERT INTO daemon_tokens (user_id, token_hash, token_prefix, status)
VALUES ($1, $2, $3, 'active') RETURNING *;

-- name: FindTokenByHash :one
SELECT * FROM daemon_tokens WHERE token_hash = $1;

-- name: FindTokenByPairingCode :one
SELECT * FROM daemon_tokens WHERE pairing_code = $1;

-- name: ConfirmToken :exec
UPDATE daemon_tokens SET status = 'active', user_id = $2, daemon_id = $3, confirmed_at = now()
WHERE id = $1 AND status = 'pending';

-- name: TouchToken :exec
UPDATE daemon_tokens SET last_used_at = now() WHERE id = $1;

-- name: ExpireToken :exec
UPDATE daemon_tokens SET status = 'expired' WHERE id = $1;

-- name: ConsumePairingCode :exec
UPDATE daemon_tokens SET pairing_code = NULL WHERE id = $1;

-- name: SetTokenHash :exec
UPDATE daemon_tokens SET token_hash = $2, token_prefix = $3 WHERE id = $1;

-- daemons
-- name: CreateDaemon :one
INSERT INTO daemons (user_id, name) VALUES ($1, $2) RETURNING *;

-- name: FindDaemonByID :one
SELECT * FROM daemons WHERE id = $1;

-- name: FindDaemonByUserAndName :one
SELECT * FROM daemons WHERE user_id = $1 AND name = $2;

-- name: UpdateDaemonInfo :exec
UPDATE daemons SET name = $2, os = $3, arch = $4, daemon_version = $5 WHERE id = $1;

-- name: DaemonOnline :exec
UPDATE daemons SET last_seen_at = now(), status = 'online', connected_at = COALESCE(connected_at, now()) WHERE id = $1;

-- name: DaemonOffline :exec
UPDATE daemons SET status = 'offline' WHERE id = $1;

-- name: DeleteDaemon :exec
DELETE FROM daemons WHERE id = $1;

-- name: ListDaemonsByUser :many
SELECT d.*, r.id AS r_id, r.kind AS r_kind, r.name AS r_name,
       r.executable_path AS r_executable_path, r.version AS r_version,
       r.status AS r_status, r.diagnostics AS r_diagnostics,
       r.max_concurrency AS r_max_concurrency
FROM daemons d
LEFT JOIN runtimes r ON r.daemon_id = d.id
WHERE d.user_id = $1
ORDER BY d.registered_at DESC, r.kind, r.name;

-- runtimes
-- name: ClearRuntimes :exec
DELETE FROM runtimes WHERE daemon_id = $1;

-- name: InsertRuntime :exec
INSERT INTO runtimes (daemon_id, kind, name, executable_path, version, status, diagnostics, max_concurrency)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
ON CONFLICT (daemon_id, kind, name) DO UPDATE SET
    executable_path = EXCLUDED.executable_path, version = EXCLUDED.version,
    status = EXCLUDED.status, diagnostics = EXCLUDED.diagnostics,
    checked_at = now();
