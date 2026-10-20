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
    daemon_version TEXT NOT NULL DEFAULT '0.0.0', status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','active','expired')),
    expires_at TIMESTAMPTZ, issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    confirmed_at TIMESTAMPTZ, last_used_at TIMESTAMPTZ
);

CREATE TABLE daemons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id),
    token_id UUID REFERENCES daemon_tokens(id), name TEXT NOT NULL,
    os TEXT NOT NULL DEFAULT '', arch TEXT NOT NULL DEFAULT '',
    daemon_version TEXT NOT NULL DEFAULT '0.0.0', status TEXT NOT NULL DEFAULT 'offline'
        CHECK (status IN ('online','offline')),
    last_seen_at TIMESTAMPTZ, connected_at TIMESTAMPTZ,
    registered_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE runtimes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), daemon_id UUID NOT NULL REFERENCES daemons(id),
    kind TEXT NOT NULL, name TEXT NOT NULL, executable_path TEXT NOT NULL DEFAULT '', version TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'unknown'
        CHECK (status IN ('unknown','available','error')),
    checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
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
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active','revoked')),
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
    -- Empty means "not known yet"; the daemon resolves origin/HEAD from the
    -- checkout when the value is empty.
    default_branch TEXT NOT NULL DEFAULT '',
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
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active','archived')),
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
    -- The one person accountable for the issue, nil while nobody has claimed
    -- it. Single by design: two owners is no owner. Deliberately not ON DELETE
    -- CASCADE — losing a user must not delete issues, and an unowned issue is
    -- still readable.
    assignee_user_id UUID REFERENCES users(id),
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
        CHECK (type IN ('comment','status_change','system','agents_change','assignee_change')),
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
    device_info TEXT NOT NULL DEFAULT '',
    metadata JSONB NOT NULL DEFAULT '{}',
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
    avatar_url TEXT NOT NULL DEFAULT '',
    head_shape TEXT NOT NULL DEFAULT 'gitsquad',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, name)
);

-- PR review configuration. The reviewer agent must belong to the workspace and
-- have a runtime daemon; that is enforced in the service, not by a composite FK.
ALTER TABLE workspaces
    ADD COLUMN pr_review_enabled BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN pr_review_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    ADD COLUMN pr_review_trigger TEXT NOT NULL DEFAULT 'opened'
        CHECK (pr_review_trigger IN ('opened','push','manual')),
    ADD COLUMN pr_review_ignore_drafts BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN pr_review_author_scope TEXT NOT NULL DEFAULT 'collaborators'
        CHECK (pr_review_author_scope IN ('collaborators','all')),
    ADD COLUMN pr_review_include_bots BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN pr_review_inline_comments BOOLEAN NOT NULL DEFAULT true;

-- Who works on an issue. A join table with real foreign keys rather than an
-- array of names on issues: renaming or deleting an agent used to leave a
-- dangling name behind, and a cascade cannot go stale.
CREATE TABLE issue_agents (
    issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    PRIMARY KEY (issue_id, agent_id)
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

CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    issue_id UUID REFERENCES issues(id) ON DELETE CASCADE,
    pull_request_id UUID,
    kind TEXT NOT NULL DEFAULT 'issue' CHECK (kind IN ('issue','review')),
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
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (issue_id IS NOT NULL OR pull_request_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_tasks_pending
    ON tasks(assigned_daemon_id, priority DESC, created_at ASC)
    WHERE status IN ('queued','dispatched');

-- At most one pending issue task per (issue, agent); reviews are keyed by PR
-- instead, so a reviewer and an implementer never block each other.
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_pending_issue_task_per_agent
    ON tasks(issue_id, agent_id)
    WHERE status IN ('queued','dispatched') AND kind = 'issue';

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_pending_review_per_pr
    ON tasks(pull_request_id)
    WHERE status IN ('queued','dispatched') AND kind = 'review';

CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON tasks(workspace_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_issue ON tasks(issue_id);

-- The agent lists read their workload per agent — counts by status, and the
-- issue in flight — twice per row, so agent_id has to lead. The unique index
-- above is on (issue_id, agent_id) and holds only pending rows.
CREATE INDEX IF NOT EXISTS idx_tasks_agent ON tasks(agent_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_pull_request ON tasks(pull_request_id);

-- Every pull request in a bound repo is recorded. issue_id is the optional
-- binding: the platform writes it when it opens a PR, a human writes it when
-- linking one, and webhooks never bind. suppressed_at is a tombstone so an
-- explicit unlink survives.
CREATE TABLE pull_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    issue_id UUID REFERENCES issues(id) ON DELETE SET NULL,
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
    head_sha TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    additions INT NOT NULL DEFAULT 0,
    deletions INT NOT NULL DEFAULT 0,
    changed_files INT NOT NULL DEFAULT 0,
    author_association TEXT NOT NULL DEFAULT '',
    head_repo TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'platform'
        CHECK (source IN ('platform','branch','body','manual','github')),
    close_intent BOOLEAN NOT NULL DEFAULT false,
    suppressed_at TIMESTAMPTZ,
    merged_at TIMESTAMPTZ,
    github_updated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, repo_owner, repo_name, number)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_closing_pr_per_issue
    ON pull_requests(issue_id)
    WHERE state = 'open' AND close_intent AND suppressed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pull_requests_issue ON pull_requests(issue_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pull_requests_workspace_state
    ON pull_requests(workspace_id, state, github_updated_at DESC);

-- tasks.pull_request_id is declared as a plain column above because tasks is
-- created before pull_requests; the FK lands here.
ALTER TABLE tasks
    ADD CONSTRAINT tasks_pull_request_id_fkey
    FOREIGN KEY (pull_request_id) REFERENCES pull_requests(id) ON DELETE CASCADE;

-- One row per review run. An in-flight row is the lock that prevents two
-- reviews of the same PR at once; completed/failed rows are history and do not
-- block a manual re-review.
CREATE TABLE pr_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    pull_request_id UUID NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    head_sha TEXT NOT NULL DEFAULT '',
    trigger_kind TEXT NOT NULL DEFAULT 'auto' CHECK (trigger_kind IN ('auto','manual')),
    status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued','running','completed','failed','cancelled')),
    summary TEXT NOT NULL DEFAULT '',
    findings INT NOT NULL DEFAULT 0,
    github_review_id BIGINT,
    url TEXT NOT NULL DEFAULT '',
    error TEXT NOT NULL DEFAULT '',
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pr_reviews_pr_created
    ON pr_reviews(pull_request_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_inflight_review_per_pr
    ON pr_reviews(pull_request_id)
    WHERE status IN ('queued','running');

CREATE TABLE task_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    seq INT NOT NULL,
    type TEXT NOT NULL,
    tool TEXT,
    content TEXT,
    input JSONB,
    output TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_messages_task_seq ON task_messages(task_id, seq);

-- Token usage per run: one row per (task, provider, model), overwritten when a
-- daemon re-reports. Dimensions come from the task row, not from copies here.
CREATE TABLE task_usage (
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
);

CREATE INDEX IF NOT EXISTS idx_task_usage_created_at ON task_usage(created_at);
