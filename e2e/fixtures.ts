// TestApiClient — API + DB helpers for E2E setup/teardown.
//
// Browser tests should not click through GitHub App installation or Google
// OAuth (both are external and nondeterministic). Instead this client:
//   * mints a JWT via the env-gated /api/v1/e2e/token endpoint, and
//   * seeds a workspace directly in Postgres, bypassing GitHub.
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
   * Remove all data seeded for the E2E user, in FK-dependency order.
   * Workspaces cascade to issues/agents/skills; repos and installations have
   * plain FKs, so they must be deleted explicitly.
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
    } finally {
      await client.end();
    }
  }
}
