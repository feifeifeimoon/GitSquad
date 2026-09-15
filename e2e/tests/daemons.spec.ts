import { test, expect } from "@playwright/test";
import { TestApiClient, type TestWorkspace, type TestDaemon } from "../fixtures";
import { loginAsE2E } from "../helpers";

test.describe("Daemons", () => {
  let api: TestApiClient;
  let workspace: TestWorkspace;
  let daemon: TestDaemon;
  let suffix: string;

  test.beforeEach(async () => {
    suffix = Date.now().toString(36);
    api = new TestApiClient();
    await api.login("E2E User");
    workspace = await api.seedWorkspace({
      name: `E2E Workspace ${suffix}`,
      slug: `e2e-ws-${suffix}`,
    });
    daemon = await api.seedDaemon({
      name: `E2E Mac ${suffix}`,
      kinds: ["claude", "codex"],
    });
  });

  test.afterEach(async () => {
    await api.cleanup();
  });

  test("opens the daemon detail page from the list", async ({ page }) => {
    await loginAsE2E(page, api);
    await page.goto("/daemons", { waitUntil: "domcontentloaded" });

    await page.getByRole("link", { name: daemon.name }).click();

    await expect(page).toHaveURL(new RegExp(`/daemons/${daemon.id}$`));
    await expect(page.getByRole("heading", { name: daemon.name })).toBeVisible({
      timeout: 20_000,
    });
  });

  test("shows each runtime with its detected version", async ({ page }) => {
    await loginAsE2E(page, api);
    await page.goto(`/daemons/${daemon.id}`, { waitUntil: "domcontentloaded" });

    const section = page.locator("section", {
      has: page.getByRole("heading", { name: "Runtimes" }),
    });
    await expect(section).toBeVisible({ timeout: 20_000 });

    for (const kind of ["claude", "codex"]) {
      await expect(
        section.getByRole("heading", { name: kind }),
      ).toBeVisible();
    }
    // seedDaemon reports version 1.2.3 for every runtime it detected, so a
    // count of two proves the version is rendered per runtime card.
    await expect(section.getByText("1.2.3")).toHaveCount(2);
  });

  test("lists the agents bound to a runtime", async ({ page }) => {
    const agentName = `bound-${suffix}`;
    await api.createAgent(workspace.id, {
      name: agentName,
      daemon_id: daemon.id,
      provider: "claude",
    });

    await loginAsE2E(page, api);
    await page.goto(`/daemons/${daemon.id}`, { waitUntil: "domcontentloaded" });

    await expect(page.getByText(`@${agentName}`)).toBeVisible({ timeout: 20_000 });
    // The agent lives in this workspace, and the row says so.
    await expect(page.getByText(workspace.name)).toBeVisible();
    await expect(page.getByText("Idle", { exact: true })).toBeVisible();
  });

  test("shows what an agent is working on", async ({ page }) => {
    const agentName = `working-${suffix}`;
    const agent = await api.createAgent(workspace.id, {
      name: agentName,
      daemon_id: daemon.id,
      provider: "claude",
    });
    const issue = await api.createIssue(workspace.id, `Task for ${agentName}`);
    await api.seedTask({
      workspaceId: workspace.id,
      issueId: issue.id,
      agentId: agent.id,
      daemonId: daemon.id,
    });

    await loginAsE2E(page, api);
    await page.goto(`/daemons/${daemon.id}`, { waitUntil: "domcontentloaded" });

    await expect(page.getByText("Running", { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(issue.issue_key, { exact: false })).toBeVisible();
  });

  test("renames a daemon", async ({ page }) => {
    const renamed = `Renamed Mac ${suffix}`;
    await loginAsE2E(page, api);
    await page.goto(`/daemons/${daemon.id}`, { waitUntil: "domcontentloaded" });

    await page.getByRole("button", { name: "Rename daemon" }).click();
    const field = page.getByPlaceholder("My laptop");
    await field.fill(renamed);
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByRole("heading", { name: renamed })).toBeVisible({
      timeout: 15_000,
    });
    // The rename is a real write, not just local state.
    const stored = await api.getDaemon(daemon.id);
    expect(stored.name).toBe(renamed);
  });

  test("reports an online daemon that stopped heartbeating as unstable", async ({
    page,
  }) => {
    // Online but silent for well past the freshness window: the row survived a
    // crash, so claiming "Online" would be a lie.
    const stale = await api.seedDaemon({
      name: `E2E Stale ${suffix}`,
      lastSeenMsAgo: 10 * 60 * 1000,
    });

    await loginAsE2E(page, api);
    await page.goto(`/daemons/${stale.id}`, { waitUntil: "domcontentloaded" });

    await expect(page.getByText("Unstable", { exact: true })).toBeVisible({
      timeout: 20_000,
    });
  });
});
