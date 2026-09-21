import { test, expect } from "@playwright/test";
import { TestApiClient, type TestWorkspace, type TestDaemon } from "../fixtures";
import { loginAsE2E } from "../helpers";

// Usage reaches the console the way it does in production: a daemon claims a
// task, runs it, and reports its tokens on the terminal status call. Seeding
// task_usage directly would skip the ingest path, which is the part most likely
// to break silently.
test.describe("Usage", () => {
  let api: TestApiClient;
  let workspace: TestWorkspace;
  let daemon: TestDaemon;
  let token: string;
  let suffix: string;

  test.beforeEach(async () => {
    suffix = Date.now().toString(36);
    api = new TestApiClient();
    await api.login("E2E User");
    workspace = await api.seedWorkspace({
      name: `E2E Workspace ${suffix}`,
      slug: `e2e-usage-${suffix}`,
    });
    daemon = await api.seedDaemon({ name: `E2E Mac ${suffix}` });
    token = await api.seedDaemonToken(daemon.id);
  });

  test.afterEach(async () => {
    await api.cleanup();
  });

  /** Run one task to completion, reporting the given token usage. */
  async function runTask(
    agentName: string,
    usage: Array<{
      provider: string;
      model: string;
      input_tokens: number;
      output_tokens: number;
      cache_read_tokens?: number;
      cache_write_tokens?: number;
    }>,
  ): Promise<void> {
    const agent = await api.createAgent(workspace.id, {
      name: agentName,
      daemon_id: daemon.id,
      provider: "claude",
    });
    const issue = await api.createIssue(workspace.id, `Work for ${agentName}`);
    const task = await api.seedTask({
      workspaceId: workspace.id,
      issueId: issue.id,
      agentId: agent.id,
      daemonId: daemon.id,
      status: "running",
    });
    await api.reportTaskStatus(token, task.id, {
      status: "succeeded",
      output: "done",
      usage,
    });
  }

  test("shows tokens reported by a finished run", async ({ page }) => {
    await runTask(`coder-${suffix}`, [
      {
        provider: "claude",
        model: "claude-sonnet-4-5",
        input_tokens: 1000,
        output_tokens: 2000,
        cache_read_tokens: 30000,
        cache_write_tokens: 4000,
      },
    ]);

    await loginAsE2E(page, api);
    await page.goto("/usage", { waitUntil: "domcontentloaded" });

    // 1000 + 2000 + 30000 + 4000 = 37k
    await expect(page.getByText("Total tokens")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("37k", { exact: true }).first()).toBeVisible();
    // The four buckets are all shown, cache included.
    await expect(page.getByText("Cache read").first()).toBeVisible();
    await expect(page.getByText("30k", { exact: true }).first()).toBeVisible();
    // cache read / (input + cache read + cache write) = 30000/35000 = 85%
    await expect(page.getByText("85%", { exact: true }).first()).toBeVisible();
  });

  test("breaks usage down by agent, runtime, workspace and issue", async ({
    page,
  }) => {
    await runTask(`alpha-${suffix}`, [
      { provider: "claude", model: "m1", input_tokens: 100, output_tokens: 100 },
    ]);
    await runTask(`beta-${suffix}`, [
      { provider: "claude", model: "m1", input_tokens: 700, output_tokens: 700 },
    ]);

    await loginAsE2E(page, api);
    await page.goto("/usage", { waitUntil: "domcontentloaded" });
    const table = page.getByRole("table");

    // Agents, largest consumer first.
    await expect(table.getByText(`beta-${suffix}`)).toBeVisible({ timeout: 20_000 });
    await expect(table.getByText(`alpha-${suffix}`)).toBeVisible();
    const agentRows = table.getByRole("row").filter({ hasText: "1.4k" });
    await expect(agentRows.first()).toContainText(`beta-${suffix}`);

    // Runtime: the daemon the runs were dispatched to.
    await page.getByRole("button", { name: "Runtime", exact: true }).click();
    await expect(table.getByText(daemon.name)).toBeVisible({ timeout: 15_000 });

    // Workspace.
    await page.getByRole("button", { name: "Workspace", exact: true }).click();
    await expect(table.getByText(workspace.name)).toBeVisible({ timeout: 15_000 });

    // Issue: labelled with its key.
    await page.getByRole("button", { name: "Issue", exact: true }).click();
    await expect(table.getByText(new RegExp(`E2E-\\d+: Work for beta-${suffix}`))).toBeVisible({
      timeout: 15_000,
    });

    // Model: keyed by provider and model.
    await page.getByRole("button", { name: "Model", exact: true }).click();
    await expect(table.getByText("m1", { exact: true })).toBeVisible({ timeout: 15_000 });
  });

  // The console must not claim a window is fully measured when some runs told
  // us nothing: an unfinished or silent run is unknown, not free.
  test("says when some runs did not report usage", async ({ page }) => {
    await runTask(`reporter-${suffix}`, [
      { provider: "claude", model: "m1", input_tokens: 500, output_tokens: 500 },
    ]);
    // A second run that finishes without reporting any tokens.
    const silent = await api.createAgent(workspace.id, {
      name: `silent-${suffix}`,
      daemon_id: daemon.id,
      provider: "claude",
    });
    const issue = await api.createIssue(workspace.id, "No usage here");
    const task = await api.seedTask({
      workspaceId: workspace.id,
      issueId: issue.id,
      agentId: silent.id,
      daemonId: daemon.id,
      status: "running",
    });
    await api.reportTaskStatus(token, task.id, { status: "succeeded", output: "done" });

    await loginAsE2E(page, api);
    await page.goto("/usage", { waitUntil: "domcontentloaded" });

    await expect(
      page.getByText(/1 of 2 finished runs reported usage/),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/lower bound, not the full total/)).toBeVisible();
  });

  test("switches the window between ranges", async ({ page }) => {
    await runTask(`ranged-${suffix}`, [
      { provider: "claude", model: "m1", input_tokens: 300, output_tokens: 200 },
    ]);

    await loginAsE2E(page, api);
    await page.goto("/usage", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("500", { exact: true }).first()).toBeVisible({
      timeout: 20_000,
    });

    // A 24h window buckets by hour rather than day, and still holds the run.
    await page.getByRole("button", { name: "24h" }).click();
    await expect(page.getByText(/bucketed by hour/, { exact: false })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("500", { exact: true }).first()).toBeVisible();
  });

  test("shows an empty state before anything has run", async ({ page }) => {
    await loginAsE2E(page, api);
    await page.goto("/usage", { waitUntil: "domcontentloaded" });

    // One state that explains the window is empty and offers the next step,
    // rather than an empty chart and an empty table stacked on each other.
    await expect(page.getByText("No usage yet")).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByText("No usage recorded for this window yet.", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Connect a daemon" }),
    ).toBeVisible();
  });
});
