package database

import (
	"context"
	"fmt"

	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
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
		{name: "004_create_daemon_tokens", sql: fmt.Sprintf(`CREATE TABLE IF NOT EXISTS daemon_tokens (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID REFERENCES users(id),
			daemon_id UUID, token_hash TEXT UNIQUE NOT NULL, token_prefix TEXT NOT NULL DEFAULT '%s',
			pairing_code TEXT UNIQUE, machine_name TEXT, status TEXT NOT NULL DEFAULT 'pending',
			expires_at TIMESTAMPTZ, issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
			confirmed_at TIMESTAMPTZ, last_used_at TIMESTAMPTZ
		)`, v1.DaemonTokenPrefix)},
		{name: "005_create_daemons", sql: `CREATE TABLE IF NOT EXISTS daemons (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id),
			token_id UUID REFERENCES daemon_tokens(id), name TEXT NOT NULL,
			os TEXT NOT NULL DEFAULT '', arch TEXT NOT NULL DEFAULT '',
			daemon_version TEXT NOT NULL DEFAULT '0.0.0', status TEXT NOT NULL DEFAULT 'offline',
			last_seen_at TIMESTAMPTZ, connected_at TIMESTAMPTZ,
			registered_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`},
		{name: "006_create_runtimes", sql: `CREATE TABLE IF NOT EXISTS runtimes (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(), daemon_id UUID NOT NULL REFERENCES daemons(id),
			kind TEXT NOT NULL, name TEXT NOT NULL, executable_path TEXT NOT NULL DEFAULT '', version TEXT NOT NULL DEFAULT '',
			status TEXT NOT NULL DEFAULT 'unknown', checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
			diagnostics TEXT, max_concurrency INT NOT NULL DEFAULT 1,
			UNIQUE(daemon_id, kind, name)
		)`},
		{name: "007_create_github_installations", sql: `CREATE TABLE IF NOT EXISTS github_installations (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			user_id UUID NOT NULL REFERENCES users(id),
			installation_id BIGINT NOT NULL UNIQUE,
			account_login TEXT NOT NULL,
			account_type TEXT NOT NULL,
			repository_selection TEXT NOT NULL DEFAULT 'selected',
			status TEXT NOT NULL DEFAULT 'active',
			created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`},
			{name: "008_create_github_repos", sql: `CREATE TABLE IF NOT EXISTS github_repos (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				installation_id UUID NOT NULL REFERENCES github_installations(id),
				github_repo_id BIGINT NOT NULL,
				owner TEXT NOT NULL,
				name TEXT NOT NULL,
				full_name TEXT NOT NULL,
				private BOOLEAN NOT NULL DEFAULT false,
				UNIQUE(installation_id, github_repo_id)
			)`},
			{name: "009_create_webhook_events", sql: `CREATE TABLE IF NOT EXISTS webhook_events (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				github_delivery_id TEXT UNIQUE,
				event_type TEXT NOT NULL,
				action TEXT,
				payload JSONB NOT NULL,
				processed BOOLEAN NOT NULL DEFAULT false,
				created_at TIMESTAMPTZ NOT NULL DEFAULT now()
			)`},
		{name: "010_create_workspaces", sql: `CREATE TABLE IF NOT EXISTS workspaces (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			user_id UUID NOT NULL REFERENCES users(id),
			installation_id UUID NOT NULL REFERENCES github_installations(id),
			github_repo_id UUID NOT NULL REFERENCES github_repos(id),
			name TEXT NOT NULL,
			status TEXT NOT NULL DEFAULT 'active',
			created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`},
		{name: "011_daemon_tokens_machine_info", sql: `ALTER TABLE daemon_tokens
			ADD COLUMN IF NOT EXISTS os TEXT NOT NULL DEFAULT '',
			ADD COLUMN IF NOT EXISTS arch TEXT NOT NULL DEFAULT '',
			ADD COLUMN IF NOT EXISTS daemon_version TEXT NOT NULL DEFAULT '0.0.0'`},
		{name: "012_workspace_issue_numbering", sql: `ALTER TABLE workspaces
			ADD COLUMN IF NOT EXISTS issue_prefix TEXT NOT NULL DEFAULT '',
			ADD COLUMN IF NOT EXISTS issue_counter INT NOT NULL DEFAULT 0`},
		{name: "013_create_issues", sql: `CREATE TABLE IF NOT EXISTS issues (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
			number INT NOT NULL,
			title TEXT NOT NULL,
			description TEXT NOT NULL DEFAULT '',
			status TEXT NOT NULL DEFAULT 'backlog'
				CHECK (status IN ('backlog','todo','in_progress','in_review','done','blocked','cancelled')),
			creator_user_id UUID REFERENCES users(id),
			assigned_agents TEXT[] NOT NULL DEFAULT '{}',
			linked_prs TEXT[] NOT NULL DEFAULT '{}',
			source_upstream_issue TEXT,
			created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
			UNIQUE (workspace_id, number)
		)`},
		{name: "014_create_issue_comments", sql: `CREATE TABLE IF NOT EXISTS issue_comments (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
			author_type TEXT NOT NULL CHECK (author_type IN ('user','agent','system')),
			author_id UUID,
			author_name TEXT NOT NULL DEFAULT '',
			type TEXT NOT NULL DEFAULT 'comment'
				CHECK (type IN ('comment','status_change','system')),
			content TEXT NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`},
		{name: "015_issue_prefix_backfill", sql: `DO $$
			BEGIN
				UPDATE workspaces SET issue_prefix = UPPER(LEFT(REGEXP_REPLACE(name, '[^a-zA-Z]', '', 'g'), 3)) WHERE issue_prefix = '';
				UPDATE workspaces SET issue_prefix = 'WS' WHERE issue_prefix = '';
			END $$`},
		{name: "016_workspace_avatar", sql: `ALTER TABLE workspaces
			ADD COLUMN IF NOT EXISTS avatar_url TEXT NOT NULL DEFAULT ''`},
	}

	for _, m := range migrations {
		if _, err := pool.Exec(ctx, m.sql); err != nil {
			return fmt.Errorf("migration %s: %w", m.name, err)
		}
	}

	return nil
}
