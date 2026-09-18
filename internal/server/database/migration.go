package database

import (
	"context"
	"fmt"

	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
	"github.com/jackc/pgx/v5/pgxpool"
)

// migrationLockKey serialises schema migrations across processes. Any constant
// works as long as every process agrees on it; this one is "gitsquad".
const migrationLockKey int64 = 0x6769747371756164

// Migrate applies the schema migrations.
//
// It takes an advisory lock for the duration because DDL is not safe against
// itself: two processes can reach it at once — a rolling deploy briefly running
// two instances, or `go test` with packages in parallel against one database —
// and `CREATE ... IF NOT EXISTS` still races on the object name, so one of the
// two fails with a duplicate-name error rather than doing nothing.
func Migrate(ctx context.Context, pool *pgxpool.Pool) error {
	// A session-scoped lock must be taken and released on the same connection,
	// so hold one for the whole run instead of letting the pool pick.
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return fmt.Errorf("acquire connection: %w", err)
	}
	defer conn.Release()
	if _, err := conn.Exec(ctx, "SELECT pg_advisory_lock($1)", migrationLockKey); err != nil {
		return fmt.Errorf("lock migrations: %w", err)
	}
	defer func() {
		// Unlocking after a cancelled context would fail; the lock goes with the
		// connection either way, and the pool closes it on release.
		_, _ = conn.Exec(context.WithoutCancel(ctx), "SELECT pg_advisory_unlock($1)", migrationLockKey)
	}()

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
		{name: "017_workspace_slug", sql: `ALTER TABLE workspaces
			ADD COLUMN IF NOT EXISTS slug TEXT NOT NULL DEFAULT ''`},
		{name: "018_workspace_slug_index", sql: `CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_user_slug ON workspaces(user_id, slug) WHERE slug <> ''`},
		{name: "019_create_agent_runtimes", sql: `CREATE TABLE IF NOT EXISTS agent_runtimes (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
			daemon_id UUID REFERENCES daemons(id),
			name TEXT NOT NULL,
			runtime_mode TEXT NOT NULL DEFAULT 'local' CHECK (runtime_mode IN ('local','cloud')),
			provider TEXT NOT NULL,
			status TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('online','offline')),
			device_info TEXT NOT NULL DEFAULT '',
			metadata JSONB NOT NULL DEFAULT '{}',
			last_seen_at TIMESTAMPTZ,
			created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
			UNIQUE (workspace_id, daemon_id, provider)
		)`},
		{name: "020_create_agents", sql: `CREATE TABLE IF NOT EXISTS agents (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
			name TEXT NOT NULL,
			description TEXT NOT NULL DEFAULT '',
			instructions TEXT NOT NULL DEFAULT '',
			model TEXT NOT NULL DEFAULT '',
			runtime_id UUID NOT NULL REFERENCES agent_runtimes(id) ON DELETE RESTRICT,
			enabled BOOLEAN NOT NULL DEFAULT true,
			created_by UUID REFERENCES users(id),
			created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
			UNIQUE (workspace_id, name)
		)`},
		{name: "021_create_skills", sql: `CREATE TABLE IF NOT EXISTS skills (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
			name TEXT NOT NULL,
			description TEXT NOT NULL DEFAULT '',
			content TEXT NOT NULL DEFAULT '',
			created_by UUID REFERENCES users(id),
			created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
			UNIQUE (workspace_id, name)
		)`},
		{name: "022_create_agent_skills", sql: `CREATE TABLE IF NOT EXISTS agent_skills (
			agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
			skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
			PRIMARY KEY (agent_id, skill_id)
		)`},
		{name: "023_agent_runtimes_idx", sql: `CREATE INDEX IF NOT EXISTS idx_agent_runtimes_workspace ON agent_runtimes(workspace_id)`},
		{name: "024_agents_idx", sql: `CREATE INDEX IF NOT EXISTS idx_agents_workspace ON agents(workspace_id)`},
		{name: "025_skills_idx", sql: `CREATE INDEX IF NOT EXISTS idx_skills_workspace ON skills(workspace_id)`},
		{name: "026_agent_avatar", sql: `ALTER TABLE agents
			ADD COLUMN IF NOT EXISTS avatar_url TEXT NOT NULL DEFAULT ''`},
		{name: "027_agent_run_count", sql: `ALTER TABLE agents
			ADD COLUMN IF NOT EXISTS run_count INT NOT NULL DEFAULT 0`},
		{name: "028_create_tasks", sql: `CREATE TABLE IF NOT EXISTS tasks (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
			issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
			agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
			status TEXT NOT NULL DEFAULT 'queued'
				CHECK (status IN ('queued','dispatched','running','completed','failed','cancelled')),
			assigned_daemon_id UUID REFERENCES daemons(id),
			provider TEXT NOT NULL DEFAULT '',
			model TEXT NOT NULL DEFAULT '',
			priority INT NOT NULL DEFAULT 0,
			context JSONB NOT NULL DEFAULT '{}',
			result JSONB,
			error TEXT NOT NULL DEFAULT '',
			failure_reason TEXT,
			dispatched_at TIMESTAMPTZ,
			started_at TIMESTAMPTZ,
			completed_at TIMESTAMPTZ,
			created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`},
		{name: "029_tasks_pending_idx", sql: `CREATE INDEX IF NOT EXISTS idx_tasks_pending
			ON tasks(assigned_daemon_id, priority DESC, created_at ASC)
			WHERE status IN ('queued','dispatched')`},
		{name: "030_one_pending_task_per_issue", sql: `CREATE UNIQUE INDEX IF NOT EXISTS idx_one_pending_task_per_issue
			ON tasks(issue_id) WHERE status IN ('queued','dispatched')`},
		{name: "031_tasks_workspace_idx", sql: `CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON tasks(workspace_id, created_at)`},
		{name: "032_tasks_issue_idx", sql: `CREATE INDEX IF NOT EXISTS idx_tasks_issue ON tasks(issue_id)`},
		{name: "033_create_task_messages", sql: `CREATE TABLE IF NOT EXISTS task_messages (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
			seq INT NOT NULL,
			type TEXT NOT NULL,
			tool TEXT,
			content TEXT,
			input JSONB,
			output TEXT,
			created_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`},
		{name: "034_task_messages_idx", sql: `CREATE INDEX IF NOT EXISTS idx_task_messages_task_seq ON task_messages(task_id, seq)`},
		// An issue may have several agents working in parallel, so the pending
		// guard must be per (issue, agent) rather than per issue.
		{name: "035_pending_task_per_agent", sql: `DROP INDEX IF EXISTS idx_one_pending_task_per_issue`},
		{name: "036_pending_task_per_agent_idx", sql: `CREATE UNIQUE INDEX IF NOT EXISTS idx_one_pending_task_per_agent
			ON tasks(issue_id, agent_id) WHERE status IN ('queued','dispatched')`},
		// Token usage per run: one row per (task, provider, model), so a run that
		// used two models writes two rows. Deliberately no workspace/agent/daemon/
		// issue copies — those live on the task row, and duplicating them would
		// give one fact two sources that drift when a task is reassigned. The
		// buckets are mutually exclusive, so input_tokens excludes both cache
		// buckets and the four sum to the run's total.
		{name: "037_create_task_usage", sql: `CREATE TABLE IF NOT EXISTS task_usage (
			task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
			provider TEXT NOT NULL DEFAULT '',
			model TEXT NOT NULL DEFAULT '',
			input_tokens BIGINT NOT NULL DEFAULT 0,
			output_tokens BIGINT NOT NULL DEFAULT 0,
			cache_read_tokens BIGINT NOT NULL DEFAULT 0,
			cache_write_tokens BIGINT NOT NULL DEFAULT 0,
			created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
			PRIMARY KEY (task_id, provider, model)
		)`},
		// Every read filters or buckets on created_at, so it leads the index.
		{name: "038_task_usage_created_idx", sql: `CREATE INDEX IF NOT EXISTS idx_task_usage_created_at
			ON task_usage(created_at)`},
		// Three columns no code ever wrote, and which the console used to paper
		// over by deriving the value client-side instead. Dropping them is what
		// lets daemon liveness have exactly one owner.
		//
		// agent_runtimes.status held the 'offline' default forever (the daemon
		// owns machine liveness now, via service.liveStatus), and
		// agent_runtimes.last_seen_at was never written at all.
		{name: "039_drop_agent_runtimes_status", sql: `ALTER TABLE agent_runtimes
			DROP COLUMN IF EXISTS status,
			DROP COLUMN IF EXISTS last_seen_at`},
		// agents.run_count was never incremented — terminal runs are counted
		// from the task queue (TotalRuns) instead.
		{name: "040_drop_agents_run_count", sql: `ALTER TABLE agents
			DROP COLUMN IF EXISTS run_count`},
		// Five status columns carried no CHECK constraint, so a typo in a writer
		// was stored rather than rejected — the silent-failure shape the issues
		// and tasks status columns already avoid. Each set is exactly the values
		// the code writes.
		//
		// NOT VALID is deliberate: it constrains future inserts and updates
		// without scanning existing rows, so a legacy value cannot fail the
		// migration and stop the server from booting (Migrate runs at startup,
		// and an error here is fatal). Once a table's existing rows are known to
		// be clean it can be tightened with
		// `ALTER TABLE <table> VALIDATE CONSTRAINT <name>`.
		//
		// The IF NOT EXISTS guards are per-constraint rather than one exception
		// handler: a plpgsql block abandons the rest of its body once a statement
		// raises, so a single duplicate_object handler would skip every
		// constraint after the first one that already existed.
		{name: "041_status_check_constraints", sql: `DO $$
			BEGIN
				IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'daemon_tokens_status_check' AND conrelid = 'daemon_tokens'::regclass) THEN
					ALTER TABLE daemon_tokens ADD CONSTRAINT daemon_tokens_status_check
						CHECK (status IN ('pending','active','expired')) NOT VALID;
				END IF;
				IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'daemons_status_check' AND conrelid = 'daemons'::regclass) THEN
					ALTER TABLE daemons ADD CONSTRAINT daemons_status_check
						CHECK (status IN ('online','offline')) NOT VALID;
				END IF;
				IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'runtimes_status_check' AND conrelid = 'runtimes'::regclass) THEN
					ALTER TABLE runtimes ADD CONSTRAINT runtimes_status_check
						CHECK (status IN ('unknown','available','error')) NOT VALID;
				END IF;
				IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workspaces_status_check' AND conrelid = 'workspaces'::regclass) THEN
					ALTER TABLE workspaces ADD CONSTRAINT workspaces_status_check
						CHECK (status IN ('active','archived')) NOT VALID;
				END IF;
				IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'github_installations_status_check' AND conrelid = 'github_installations'::regclass) THEN
					ALTER TABLE github_installations ADD CONSTRAINT github_installations_status_check
						CHECK (status IN ('active','revoked')) NOT VALID;
				END IF;
			END $$`},
		// The default branch of the repository a workspace is bound to, as
		// reported by the GitHub API during repo sync. Task dispatch used to
		// hardcode "main", which failed every task at checkout on a repo whose
		// default is master/trunk/develop. Empty means "not known yet": the
		// daemon resolves origin/HEAD from the checkout itself.
		{name: "042_github_repos_default_branch", sql: `ALTER TABLE github_repos
			ADD COLUMN IF NOT EXISTS default_branch TEXT NOT NULL DEFAULT ''`},
		// The issue ↔ pull request relationship. One issue has at most one
		// active PR at a time — the one that declares closing intent — and keeps
		// the older ones as history, so the issue page can show how it got here.
		// The platform only ever writes rows it can bind (a PR created for a
		// task, or one matched by the platform's branch convention or by a
		// Closes/Fixes/Resolves keyword); unrelated PRs are not mirrored.
		//
		// suppressed_at is a tombstone rather than a delete: an explicit unlink
		// must survive, or the next branch inference would link the same PR back.
		{name: "043_create_pull_requests", sql: `CREATE TABLE IF NOT EXISTS pull_requests (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
			issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
			repo_owner TEXT NOT NULL,
			repo_name TEXT NOT NULL,
			number INT NOT NULL,
			title TEXT NOT NULL DEFAULT '',
			url TEXT NOT NULL DEFAULT '',
			state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open','merged','closed')),
			draft BOOLEAN NOT NULL DEFAULT false,
			head_branch TEXT NOT NULL DEFAULT '',
			base_branch TEXT NOT NULL DEFAULT '',
			author TEXT NOT NULL DEFAULT '',
			source TEXT NOT NULL DEFAULT 'platform'
				CHECK (source IN ('platform','branch','body','manual')),
			close_intent BOOLEAN NOT NULL DEFAULT false,
			suppressed_at TIMESTAMPTZ,
			merged_at TIMESTAMPTZ,
			github_updated_at TIMESTAMPTZ,
			created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
			UNIQUE (workspace_id, repo_owner, repo_name, number)
		)`},
		// 「一次一个」：同一 issue 同时只能有一个活跃的、带关闭意图的 PR。
		{name: "044_one_active_closing_pr_per_issue", sql: `CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_closing_pr_per_issue
			ON pull_requests(issue_id)
			WHERE state = 'open' AND close_intent AND suppressed_at IS NULL`},
		{name: "045_pull_requests_issue_idx", sql: `CREATE INDEX IF NOT EXISTS idx_pull_requests_issue
			ON pull_requests(issue_id, created_at DESC)`},
		// Never written by any code path: the console even derived the value
		// client-side. PR relationships live in pull_requests now.
		{name: "046_drop_issues_linked_prs", sql: `ALTER TABLE issues
			DROP COLUMN IF EXISTS linked_prs`},
	}

	for _, m := range migrations {
		if _, err := conn.Exec(ctx, m.sql); err != nil {
			return fmt.Errorf("migration %s: %w", m.name, err)
		}
	}

	return nil
}
