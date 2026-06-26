package database

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

func Migrate(ctx context.Context, pool *pgxpool.Pool) error {
	migrations := []struct {
		name string
		sql  string
	}{
		{name: "001_create_users", sql: `CREATE TABLE IF NOT EXISTS users (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(), login TEXT NOT NULL, avatar_url TEXT,
			created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`},
		{name: "002_create_user_identities", sql: `CREATE TABLE IF NOT EXISTS user_identities (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id),
			provider TEXT NOT NULL, provider_user_id TEXT NOT NULL, provider_login TEXT NOT NULL,
			email TEXT, access_token TEXT, refresh_token TEXT,
			created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
			UNIQUE(provider, provider_user_id)
		)`},
		{name: "003_user_identities_idx", sql: `CREATE INDEX IF NOT EXISTS idx_user_identities_user_id ON user_identities(user_id)`},
		{name: "004_create_daemon_tokens", sql: `CREATE TABLE IF NOT EXISTS daemon_tokens (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID REFERENCES users(id),
			daemon_id UUID, token_hash TEXT UNIQUE NOT NULL, token_prefix TEXT NOT NULL DEFAULT 'gtsq_dm_',
			pairing_code TEXT UNIQUE, machine_name TEXT, status TEXT NOT NULL DEFAULT 'pending',
			expires_at TIMESTAMPTZ, issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
			confirmed_at TIMESTAMPTZ, last_used_at TIMESTAMPTZ
		)`},
		{name: "005_create_daemons", sql: `CREATE TABLE IF NOT EXISTS daemons (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id),
			token_id UUID REFERENCES daemon_tokens(id), name TEXT NOT NULL,
			os TEXT NOT NULL DEFAULT '', arch TEXT NOT NULL DEFAULT '',
			daemon_version TEXT NOT NULL DEFAULT '0.0.0', status TEXT NOT NULL DEFAULT 'registered',
			last_seen_at TIMESTAMPTZ, connected_at TIMESTAMPTZ,
			registered_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`},
		{name: "006_create_runtimes", sql: `CREATE TABLE IF NOT EXISTS runtimes (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(), daemon_id UUID NOT NULL REFERENCES daemons(id),
			kind TEXT NOT NULL, name TEXT NOT NULL, executable_path TEXT, version TEXT,
			status TEXT NOT NULL DEFAULT 'unknown', checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
			diagnostics TEXT, max_concurrency INT NOT NULL DEFAULT 1,
			UNIQUE(daemon_id, kind, name)
		)`},
	}

	for _, m := range migrations {
		if _, err := pool.Exec(ctx, m.sql); err != nil {
			return fmt.Errorf("migration %s: %w", m.name, err)
		}
	}

	return nil
}
