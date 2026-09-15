import { test, expect } from "@playwright/test";
import { TestApiClient, type TestWorkspace, type TestDaemon } from "../fixtures";
import { loginAsE2E } from "../helpers";

test.describe("Agents", () => {
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
    daemon = await api.seedDaemon({ name: `E2E Mac ${suffix}` });
  });

  test.afterEach(async () => {
    await api.cleanup();
  });

  test("lists a seeded agent with its runtime", async ({ page }) => {
    const agentName = `coder-${suffix}`;
    await api.createAgent(workspace.id, {
      name: agentName,
      daemon_id: daemon.id,
      provider: "claude",
    });

    await loginAsE2E(page, api);
    await page.goto(`/${workspace.slug}/agents`, { waitUntil: "domcontentloaded" });

    const table = page.getByRole("table");
    await expect(table.getByText(`@${agentName}`)).toBeVisible({ timeout: 20_000 });
    await expect(table.getByText("claude")).toBeVisible();
    await expect(table.getByText(daemon.name)).toBeVisible();
  });

  // Status is derived from the backing daemon's heartbeat plus the task queue,
  // so each case seeds that input rather than a status column.
  test("shows an agent with a live daemon and no work as idle", async ({ page }) => {
    const agentName = `idle-${suffix}`;
    await api.createAgent(workspace.id, {
      name: agentName,
      daemon_id: daemon.id,
      provider: "claude",
    });

    await loginAsE2E(page, api);
    await page.goto(`/${workspace.slug}/agents`, { waitUntil: "domcontentloaded" });

    const row = page.getByRole("row").filter({ hasText: `@${agentName}` });
    await expect(row.getByText("Idle", { exact: true })).toBeVisible({
      timeout: 20_000,
    });
  });

  test("shows an agent with an in-flight task as running, naming the issue", async ({
    page,
  }) => {
    const agentName = `busy-${suffix}`;
    const agent = await api.createAgent(workspace.id, {
      name: agentName,
      daemon_id: daemon.id,
      provider: "claude",
    });
    const issue = await api.createIssue(workspace.id, `Work for ${agentName}`);
    await api.seedTask({
      workspaceId: workspace.id,
      issueId: issue.id,
      agentId: agent.id,
      daemonId: daemon.id,
    });

    await loginAsE2E(page, api);
    await page.goto(`/${workspace.slug}/agents`, { waitUntil: "domcontentloaded" });

    const row = page.getByRole("row").filter({ hasText: `@${agentName}` });
    await expect(row.getByText("Running", { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(row.getByText(issue.issue_key)).toBeVisible();
  });

  test("shows an agent whose daemon is offline as offline", async ({ page }) => {
    const offline = await api.seedDaemon({
      name: `E2E Offline ${suffix}`,
      status: "offline",
    });
    const agentName = `gone-${suffix}`;
    await api.createAgent(workspace.id, {
      name: agentName,
      daemon_id: offline.id,
      provider: "claude",
    });

    await loginAsE2E(page, api);
    await page.goto(`/${workspace.slug}/agents`, { waitUntil: "domcontentloaded" });

    const row = page.getByRole("row").filter({ hasText: `@${agentName}` });
    await expect(row.getByText("Offline", { exact: true })).toBeVisible({
      timeout: 20_000,
    });
  });

  test("filters the list by status", async ({ page }) => {
    const idleName = `idle-${suffix}`;
    const goneName = `gone-${suffix}`;
    await api.createAgent(workspace.id, {
      name: idleName,
      daemon_id: daemon.id,
      provider: "claude",
    });
    const offline = await api.seedDaemon({
      name: `E2E Offline ${suffix}`,
      status: "offline",
    });
    await api.createAgent(workspace.id, {
      name: goneName,
      daemon_id: offline.id,
      provider: "claude",
    });

    await loginAsE2E(page, api);
    await page.goto(`/${workspace.slug}/agents`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText(`@${idleName}`)).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: /^Offline/ }).click();
    await expect(page.getByText(`@${goneName}`)).toBeVisible();
    await expect(page.getByText(`@${idleName}`)).toBeHidden();
  });

  test("creates an agent from the UI", async ({ page }) => {
    await loginAsE2E(page, api);
    await page.goto(`/${workspace.slug}/agents`, { waitUntil: "domcontentloaded" });

    await page.getByRole("button", { name: "New Agent" }).click();

    const agentName = `ui-agent-${suffix}`;
    await page.getByPlaceholder("coder").fill(agentName);

    // Pick the seeded online daemon, then its provider. Radix Select triggers
    // expose role=combobox but their accessible name is unreliable in this
    // version, so target by position (daemon first, provider second).
    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: daemon.name }).click();
    await page.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "claude" }).click();

    await page.getByRole("button", { name: "Create agent" }).click();

    await expect(page.getByText(`@${agentName}`)).toBeVisible({ timeout: 15_000 });
  });
});
