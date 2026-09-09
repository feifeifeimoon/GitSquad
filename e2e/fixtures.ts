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
   * Seed an "online" daemon with one runtime per `kind` so the agents page
   * shows it in the daemon/provider selectors. Returns the daemon id.
   */
  async seedDaemon(opts: {
    name?: string;
    status?: string;
    kinds?: string[];
  } = {}): Promise<TestDaemon> {
    const name = opts.name ?? `E2E Daemon ${Date.now().toString(36)}`;
    const status = opts.status ?? "online";
    const kinds = opts.kinds ?? ["claude"];

    const client = new pg.Client({ connectionString: DATABASE_URL });
    await client.connect();
    try {
      const daemon = await client.query(
        `INSERT INTO daemons (user_id, name, os, arch, daemon_version, status, registered_at)
         VALUES ($1, $2, 'darwin', 'arm64', '0.1.0', $3, now())
         RETURNING id`,
        [this.getUserId(), name, status],
      );
      const daemonId: string = daemon.rows[0].id;

      for (const kind of kinds) {
        await client.query(
          `INSERT INTO runtimes (daemon_id, kind, name, executable_path, version, status, checked_at, max_concurrency)
           VALUES ($1, $2, $2, '/usr/local/bin/' || $2, '1.0.0', 'available', now(), 1)`,
          [daemonId, kind],
        );
      }
      return { id: daemonId, name };
    } finally {
      await client.end();
    }
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
