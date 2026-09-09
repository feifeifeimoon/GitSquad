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

    await expect(page.getByText(`@${agentName}`)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("enabled")).toBeVisible();
    await expect(page.getByText("claude")).toBeVisible();
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
