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
		{
			name: "001_create_users",
			sql: `CREATE TABLE IF NOT EXISTS users (
				id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				login      TEXT NOT NULL,
				avatar_url TEXT,
				created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
				updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
			)`,
		},
		{
			name: "002_create_user_identities",
			sql: `CREATE TABLE IF NOT EXISTS user_identities (
				id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				user_id           UUID NOT NULL REFERENCES users(id),
				provider          TEXT NOT NULL,
				provider_user_id  TEXT NOT NULL,
				provider_login    TEXT NOT NULL,
				email             TEXT,
				access_token      TEXT,
				refresh_token     TEXT,
				created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
				updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
				UNIQUE(provider, provider_user_id)
			)`,
		},
		{
			name: "003_create_user_identities_index",
			sql:  `CREATE INDEX IF NOT EXISTS idx_user_identities_user_id ON user_identities(user_id)`,
		},
	}

	for _, m := range migrations {
		if _, err := pool.Exec(ctx, m.sql); err != nil {
			return fmt.Errorf("migration %s: %w", m.name, err)
		}
	}

	return nil
}
