import { test, expect } from "@playwright/test";
import { TestApiClient, type TestWorkspace, type TestDaemon } from "../fixtures";
import { loginAsE2E } from "../helpers";

test.describe("Agent mentions", () => {
  let api: TestApiClient;
  let workspace: TestWorkspace;
  let daemon: TestDaemon;
  let agentName: string;
  let suffix: string;

  test.beforeEach(async () => {
    suffix = Date.now().toString(36);
    agentName = `coder-${suffix}`;
    api = new TestApiClient();
    await api.login("E2E User");
    workspace = await api.seedWorkspace({
      name: `E2E Workspace ${suffix}`,
      slug: `e2e-ws-${suffix}`,
    });
    daemon = await api.seedDaemon({ name: `E2E Mac ${suffix}` });
    // createAgent upserts the agent's runtime binding, which is what makes the
    // mention dispatchable (an agent without a daemon is not runnable).
    await api.createAgent(workspace.id, {
      name: agentName,
      daemon_id: daemon.id,
      provider: "claude",
    });
  });

  test.afterEach(async () => {
    await api.cleanup();
  });

  test("typing @ suggests the workspace's agents", async ({ page }) => {
    const issue = await api.createIssue(workspace.id, `Mention target ${suffix}`);

    await loginAsE2E(page, api);
    await page.goto(`/${workspace.slug}/issues/${issue.issue_key}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("heading", { name: "Activity" }),
    ).toBeVisible({ timeout: 20_000 });

    const editor = page.locator('[contenteditable="true"]');
    await editor.click();
    await page.keyboard.type("@");

    // The suggestion popup lists enabled agents; picking one inserts plain
    // text so the server's @mention parser can find it.
    const option = page.getByRole("button", { name: `@${agentName}` });
    await expect(option).toBeVisible({ timeout: 10_000 });
    await option.click();

    await expect(editor).toContainText(`@${agentName}`);
  });

  test("mentioning an agent queues a task", async ({ page }) => {
    const issue = await api.createIssue(workspace.id, `Dispatch target ${suffix}`);

    await loginAsE2E(page, api);
    await page.goto(`/${workspace.slug}/issues/${issue.issue_key}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("heading", { name: "Activity" }),
    ).toBeVisible({ timeout: 20_000 });

    const editor = page.locator('[contenteditable="true"]');
    await editor.click();
    await page.keyboard.type(`@${agentName} please fix this`);
    await page.getByRole("button", { name: "Comment" }).click();

    // Dispatch persists a queued task; getting this far needs no daemon, so the
    // assertion holds in CI without a running LocalShell.
    await expect
      .poll(() => api.taskCount(workspace.id, "queued"), { timeout: 15_000 })
      .toBeGreaterThan(0);
  });
});
