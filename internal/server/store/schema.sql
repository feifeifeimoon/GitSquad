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
    pairing_code TEXT UNIQUE, machine_name TEXT, status TEXT NOT NULL DEFAULT 'pending',
    expires_at TIMESTAMPTZ, issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    confirmed_at TIMESTAMPTZ, last_used_at TIMESTAMPTZ
);

CREATE TABLE daemons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id),
    token_id UUID REFERENCES daemon_tokens(id), name TEXT NOT NULL,
    os TEXT NOT NULL DEFAULT '', arch TEXT NOT NULL DEFAULT '',
    daemon_version TEXT NOT NULL DEFAULT '0.0.0', status TEXT NOT NULL DEFAULT 'registered',
    last_seen_at TIMESTAMPTZ, connected_at TIMESTAMPTZ,
    registered_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE runtimes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), daemon_id UUID NOT NULL REFERENCES daemons(id),
    kind TEXT NOT NULL, name TEXT NOT NULL, executable_path TEXT, version TEXT,
    status TEXT NOT NULL DEFAULT 'unknown', checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    diagnostics TEXT, max_concurrency INT NOT NULL DEFAULT 1,
    UNIQUE(daemon_id, kind, name)
);
