CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), login TEXT NOT NULL, avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_identities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id),
    provider TEXT NOT NULL, provider_user_id TEXT NOT NULL, provider_login TEXT NOT NULL,
    email TEXT, access_token TEXT, refresh_token TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(provider, provider_user_id)
);

CREATE TABLE daemon_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID REFERENCES users(id),
    daemon_id UUID, token_hash TEXT UNIQUE NOT NULL, token_prefix TEXT NOT NULL DEFAULT 'gtsq_dm_',
    pairing_code TEXT UNIQUE, machine_name TEXT, os TEXT NOT NULL DEFAULT '', arch TEXT NOT NULL DEFAULT '',
    daemon_version TEXT NOT NULL DEFAULT '0.0.0', status TEXT NOT NULL DEFAULT 'pending',
    expires_at TIMESTAMPTZ, issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    confirmed_at TIMESTAMPTZ, last_used_at TIMESTAMPTZ
);

CREATE TABLE daemons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id),
    token_id UUID REFERENCES daemon_tokens(id), name TEXT NOT NULL,
    os TEXT NOT NULL DEFAULT '', arch TEXT NOT NULL DEFAULT '',
    daemon_version TEXT NOT NULL DEFAULT '0.0.0', status TEXT NOT NULL DEFAULT 'offline',
    last_seen_at TIMESTAMPTZ, connected_at TIMESTAMPTZ,
    registered_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE runtimes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), daemon_id UUID NOT NULL REFERENCES daemons(id),
    kind TEXT NOT NULL, name TEXT NOT NULL, executable_path TEXT NOT NULL DEFAULT '', version TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'unknown', checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    diagnostics TEXT, max_concurrency INT NOT NULL DEFAULT 1,
    UNIQUE(daemon_id, kind, name)
);

CREATE TABLE github_installations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    installation_id BIGINT NOT NULL UNIQUE,
    account_login TEXT NOT NULL,
    account_type TEXT NOT NULL,
    repository_selection TEXT NOT NULL DEFAULT 'selected',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE github_repos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    installation_id UUID NOT NULL REFERENCES github_installations(id),
    github_repo_id BIGINT NOT NULL,
    owner TEXT NOT NULL,
    name TEXT NOT NULL,
    full_name TEXT NOT NULL,
    private BOOLEAN NOT NULL DEFAULT false,
    UNIQUE(installation_id, github_repo_id)
);

CREATE TABLE webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    github_delivery_id TEXT UNIQUE,
    event_type TEXT NOT NULL,
    action TEXT,
    payload JSONB NOT NULL,
    processed BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    installation_id UUID NOT NULL REFERENCES github_installations(id),
    github_repo_id UUID NOT NULL REFERENCES github_repos(id),
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE workspaces
    ADD COLUMN issue_prefix TEXT NOT NULL DEFAULT '',
    ADD COLUMN issue_counter INT NOT NULL DEFAULT 0,
    ADD COLUMN avatar_url TEXT NOT NULL DEFAULT '',
    ADD COLUMN slug TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_user_slug ON workspaces(user_id, slug) WHERE slug <> '';

CREATE TABLE issues (
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
);

CREATE INDEX IF NOT EXISTS idx_issues_workspace ON issues(workspace_id, created_at);

CREATE TABLE issue_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    author_type TEXT NOT NULL CHECK (author_type IN ('user','agent','system')),
    author_id UUID,
    author_name TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT 'comment'
        CHECK (type IN ('comment','status_change','system')),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_issue_comments_issue ON issue_comments(issue_id, created_at);

CREATE TABLE agent_runtimes (
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
);

CREATE TABLE agents (
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
);

CREATE TABLE skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, name)
);

CREATE TABLE agent_skills (
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    PRIMARY KEY (agent_id, skill_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_runtimes_workspace ON agent_runtimes(workspace_id);
CREATE INDEX IF NOT EXISTS idx_agents_workspace ON agents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_skills_workspace ON skills(workspace_id);
