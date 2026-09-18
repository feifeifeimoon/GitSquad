// TestApiClient — API + DB helpers for E2E setup/teardown.
//
// Browser tests should not click through GitHub App installation or Google
// OAuth (both are external and nondeterministic). Instead this client:
//   * mints a JWT via the env-gated /api/v1/e2e/token endpoint, and
//   * seeds workspaces/daemons directly in Postgres, bypassing GitHub, and
//   * creates issues/skills/agents through the real API so the UI under test
//     still exercises the production read/write paths.
//
// It talks to the backend with raw fetch and to the database with pg, so it
// has zero build-time coupling to the web app (mirrors the multica approach).

import pg from "pg";
import { createHash, randomUUID } from "node:crypto";
import { API_BASE, DATABASE_URL } from "./env";

export interface TestUser {
  id: string;
  login: string;
  avatar_url: string;
}

interface TokenResponse {
  token: string;
  user: TestUser;
}

export interface TestWorkspace {
  id: string;
  slug: string;
  name: string;
}

export interface TestIssue {
  id: string;
  issue_key: string;
  title: string;
  status: string;
}

export interface TestSkill {
  id: string;
  name: string;
  description: string;
}

export interface TestDaemon {
  id: string;
  name: string;
}

export class TestApiClient {
  private token: string | null = null;
  private user: TestUser | null = null;

  /** Obtain a JWT for the deterministic E2E user. */
  async login(name = "E2E User"): Promise<TestUser> {
    const res = await fetch(
      `${API_BASE}/api/v1/e2e/token?name=${encodeURIComponent(name)}`,
      { method: "POST" },
    );
    if (!res.ok) {
      throw new Error(`e2e/token failed: ${res.status} ${res.statusText}`);
    }

    const body = (await res.json()) as { success: boolean; data?: TokenResponse };
    const data = body?.data;
    if (!data?.token || !data?.user) {
      throw new Error("e2e/token response missing token or user");
    }

    this.token = data.token;
    this.user = data.user;
    return data.user;
  }

  getToken(): string {
    if (!this.token) throw new Error("TestApiClient is not logged in");
    return this.token;
  }

  getUserId(): string {
    if (!this.user) throw new Error("TestApiClient is not logged in");
    return this.user.id;
  }

  /**
   * Seed a workspace + its GitHub installation/repo rows directly, bypassing
   * the GitHub App flow. Returns the workspace so tests can build /{slug} URLs.
   */
  async seedWorkspace(opts: {
    name: string;
    slug: string;
    owner?: string;
    repo?: string;
  }): Promise<TestWorkspace> {
    const owner = opts.owner ?? "e2e-owner";
    const repo = opts.repo ?? "e2e-repo";
    const client = new pg.Client({ connectionString: DATABASE_URL });
    await client.connect();
    try {
      const installation = await client.query(
        `INSERT INTO github_installations
           (user_id, installation_id, account_login, account_type, repository_selection, status)
         VALUES ($1, $2, $3, 'User', 'selected', 'active')
         RETURNING id`,
        [this.getUserId(), Date.now(), owner],
      );
      const installationId: string = installation.rows[0].id;

      const repoRow = await client.query(
        `INSERT INTO github_repos
           (installation_id, github_repo_id, owner, name, full_name, private)
         VALUES ($1, $2, $3, $4, $5, false)
         RETURNING id`,
        [installationId, Date.now(), owner, repo, `${owner}/${repo}`],
      );
      const repoId: string = repoRow.rows[0].id;

      const workspace = await client.query(
        `INSERT INTO workspaces
           (user_id, installation_id, github_repo_id, name, status,
            issue_prefix, issue_counter, avatar_url, slug)
         VALUES ($1, $2, $3, $4, 'active', 'E2E', 0, '', $5)
         RETURNING id, name, slug`,
        [this.getUserId(), installationId, repoId, opts.name, opts.slug],
      );
      return workspace.rows[0] as TestWorkspace;
    } finally {
      await client.end();
    }
  }

  /**
   * Seed a daemon with one runtime per `kind` so the agents page shows it in
   * the daemon/provider selectors. Returns the daemon id.
   *
   * Pass lastSeenMsAgo to write the row a crashed server leaves behind: status
   * still 'online' with a heartbeat old enough that the server resolves it to
   * offline (see service.liveStatus). The row goes in verbatim on purpose — the
   * normalisation under test is the server's, not the seed's.
   */
  async seedDaemon(opts: {
    name?: string;
    status?: string;
    kinds?: string[];
    lastSeenMsAgo?: number;
  } = {}): Promise<TestDaemon> {
    const name = opts.name ?? `E2E Daemon ${Date.now().toString(36)}`;
    const status = opts.status ?? "online";
    const kinds = opts.kinds ?? ["claude"];

    const client = new pg.Client({ connectionString: DATABASE_URL });
    await client.connect();
    try {
      const seen =
        opts.lastSeenMsAgo !== undefined
          ? new Date(Date.now() - opts.lastSeenMsAgo)
          : status === "online"
            ? new Date()
            : null;
      const daemon = await client.query(
        `INSERT INTO daemons (user_id, name, os, arch, daemon_version, status, last_seen_at, registered_at)
         VALUES ($1, $2, 'darwin', 'arm64', '0.1.0', $3, $4, now())
         RETURNING id`,
        [this.getUserId(), name, status, seen],
      );
      const daemonId: string = daemon.rows[0].id;

      for (const kind of kinds) {
        await client.query(
          `INSERT INTO runtimes (daemon_id, kind, name, executable_path, version, status, checked_at, max_concurrency)
           VALUES ($1, $2, $2, '/usr/local/bin/' || $2, '1.2.3', 'available', now(), 1)`,
          [daemonId, kind],
        );
      }
      return { id: daemonId, name };
    } finally {
      await client.end();
    }
  }

  /**
   * Insert a task row directly so status derivation has in-flight work to see.
   * Claiming a task for real would need a live daemon, which E2E does not run.
   * Both 'running' and 'dispatched' count as running in the UI.
   */
  async seedTask(opts: {
    workspaceId: string;
    issueId: string;
    agentId: string;
    daemonId: string;
    status?: string;
  }): Promise<{ id: string }> {
    const client = new pg.Client({ connectionString: DATABASE_URL });
    await client.connect();
    try {
      const res = await client.query(
        `INSERT INTO tasks (workspace_id, issue_id, agent_id, status, assigned_daemon_id, provider, context, started_at)
         VALUES ($1, $2, $3, $4, $5, 'claude', '{}', now())
         RETURNING id`,
        [
          opts.workspaceId,
          opts.issueId,
          opts.agentId,
          opts.status ?? "running",
          opts.daemonId,
        ],
      );
      return { id: res.rows[0].id as string };
    } finally {
      await client.end();
    }
  }

  /**
   * Give a seeded daemon a working bearer token, so tests can drive the real
   * daemon endpoints instead of writing their side effects straight into the
   * database. Returns the raw token.
   *
   * The server stores only SHA-256(raw); `gitsquad_dm_` is the prefix the auth
   * middleware insists on.
   */
  async seedDaemonToken(daemonId: string): Promise<string> {
    const raw = `gitsquad_dm_${randomUUID().replace(/-/g, "")}`;
    const hash = createHash("sha256").update(raw).digest("hex");
    const client = new pg.Client({ connectionString: DATABASE_URL });
    await client.connect();
    try {
      await client.query(
        `INSERT INTO daemon_tokens (user_id, daemon_id, token_hash, token_prefix, status)
         VALUES ($1, $2, $3, $4, 'active')`,
        [this.getUserId(), daemonId, hash, raw.slice(0, 20)],
      );
    } finally {
      await client.end();
    }
    return raw;
  }

  /**
   * Report a task lifecycle event as the daemon would, over the real API. The
   * terminal succeeded report is what writes token usage, so this is how a test
   * gets usage into the ledger through the production path.
   */
  async reportTaskStatus(
    daemonToken: string,
    taskId: string,
    report: {
      status: string;
      output?: string;
      usage?: Array<{
        provider: string;
        model: string;
        input_tokens: number;
        output_tokens: number;
        cache_read_tokens?: number;
        cache_write_tokens?: number;
      }>;
    },
  ): Promise<void> {
    const body = {
      status: report.status,
      ...(report.output !== undefined
        ? { summary: { output: report.output } }
        : {}),
      ...(report.usage ? { usage: report.usage } : {}),
    };
    const res = await fetch(
      `${API_BASE}/api/v1/daemon/tasks/${taskId}/status`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${daemonToken}`,
        },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      throw new Error(`report task status failed: ${res.status}`);
    }
  }

  /** Read a daemon through the API, for asserting a write actually persisted. */
  async getDaemon(id: string): Promise<TestDaemon & { status: string }> {
    return this.authedFetch(`/api/v1/daemons/${id}`);
  }

  /** Create an issue via the real API. */
  async createIssue(
    workspaceId: string,
    title: string,
    opts: { description?: string; status?: string } = {},
  ): Promise<TestIssue> {
    return this.authedFetch(`/api/v1/workspaces/${workspaceId}/issues`, {
      method: "POST",
      body: JSON.stringify({ title, ...opts }),
    });
  }

  /**
   * Seed a pull request row directly.
   *
   * The issue ↔ PR relationship has four entries; the ones a browser test can
   * reach without GitHub are the platform's own (a task finishing, which needs a
   * daemon) and the manual link (which would call GitHub). Seeding the row gets
   * the UI under test without either.
   *
   * `suppressed` seeds an unlinked row: the tombstone a human leaves behind, and
   * the only way this fixture can put a PR in the history without an active one
   * holding the slot.
   */
  async seedPullRequest(
    workspaceId: string,
    issueId: string,
    opts: {
      number?: number;
      title?: string;
      state?: string;
      owner?: string;
      repo?: string;
      suppressed?: boolean;
    } = {},
  ): Promise<void> {
    const owner = opts.owner ?? "e2e-owner";
    const repo = opts.repo ?? "e2e-repo";
    const number = opts.number ?? 42;
    const client = new pg.Client({ connectionString: DATABASE_URL });
    await client.connect();
    try {
      await client.query(
        `INSERT INTO pull_requests
           (workspace_id, issue_id, repo_owner, repo_name, number, title, url,
            state, head_branch, base_branch, author, source, close_intent,
            suppressed_at, github_updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'main', 'gitsquad[bot]', 'platform', true,
                 CASE WHEN $10 THEN now() ELSE NULL END, now())`,
        [
          workspaceId,
          issueId,
          owner,
          repo,
          number,
          opts.title ?? "E2E pull request",
          `https://github.com/${owner}/${repo}/pull/${number}`,
          opts.state ?? "open",
          `gitsquad/E2E-1/${number}`,
          opts.suppressed ?? false,
        ],
      );
    } finally {
      await client.end();
    }
  }

  /** Create a skill via the real API. */
  async createSkill(
    workspaceId: string,
    body: { name: string; description?: string; content?: string },
  ): Promise<TestSkill> {
    return this.authedFetch(`/api/v1/workspaces/${workspaceId}/skills`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /** Create an agent via the real API (requires a seeded daemon). */
  async createAgent(
    workspaceId: string,
    body: { name: string; daemon_id: string; provider: string; description?: string },
  ): Promise<{ id: string; name: string }> {
    return this.authedFetch(`/api/v1/workspaces/${workspaceId}/agents`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /** Post an issue comment through the real API (used to trigger realtime pushes). */
  async addComment(workspaceId: string, issueRef: string, content: string): Promise<void> {
    await this.authedFetch(
      `/api/v1/workspaces/${workspaceId}/issues/${issueRef}/comments`,
      { method: "POST", body: JSON.stringify({ content }) },
    );
  }

  /**
   * Count tasks in a workspace, optionally filtered by status. Used to assert
   * that an @mention queued work without needing a real daemon.
   */
  async taskCount(workspaceId: string, status?: string): Promise<number> {
    const client = new pg.Client({ connectionString: DATABASE_URL });
    await client.connect();
    try {
      const res = status
        ? await client.query(
            "SELECT count(*)::int AS n FROM tasks WHERE workspace_id = $1 AND status = $2",
            [workspaceId, status],
          )
        : await client.query(
            "SELECT count(*)::int AS n FROM tasks WHERE workspace_id = $1",
            [workspaceId],
          );
      return res.rows[0].n as number;
    } finally {
      await client.end();
    }
  }

  /**
   * Remove all data seeded for the E2E user, in FK-dependency order.
   * Workspaces cascade to issues/agents/skills/runtimes; repos, installations,
   * runtimes and daemons have plain FKs, so they must be deleted explicitly.
   */
  async cleanup(): Promise<void> {
    const client = new pg.Client({ connectionString: DATABASE_URL });
    await client.connect();
    try {
      const userId = this.getUserId();
      await client.query("DELETE FROM workspaces WHERE user_id = $1", [userId]);
      await client.query(
        `DELETE FROM github_repos
         WHERE installation_id IN (SELECT id FROM github_installations WHERE user_id = $1)`,
        [userId],
      );
      await client.query(
        "DELETE FROM github_installations WHERE user_id = $1",
        [userId],
      );
      await client.query(
        `DELETE FROM runtimes
         WHERE daemon_id IN (SELECT id FROM daemons WHERE user_id = $1)`,
        [userId],
      );
      await client.query("DELETE FROM daemons WHERE user_id = $1", [userId]);
    } finally {
      await client.end();
    }
  }

  private async authedFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.getToken()}`,
        ...init.headers,
      },
    });
    if (!res.ok) {
      throw new Error(`${init.method ?? "GET"} ${path} failed: ${res.status}`);
    }
    const body = (await res.json()) as { data?: T };
    return body.data as T;
  }
}
