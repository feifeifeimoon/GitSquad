import { test, expect } from "@playwright/test";
import { TestApiClient, type TestWorkspace } from "../fixtures";
import { loginAsE2E } from "../helpers";

test.describe("Realtime", () => {
  let api: TestApiClient;
  let workspace: TestWorkspace;
  let suffix: string;

  test.beforeEach(async () => {
    suffix = Date.now().toString(36);
    api = new TestApiClient();
    await api.login("E2E User");
    workspace = await api.seedWorkspace({
      name: `E2E Workspace ${suffix}`,
      slug: `e2e-ws-${suffix}`,
    });
  });

  test.afterEach(async () => {
    await api.cleanup();
  });

  test("a comment written elsewhere appears without a reload", async ({ page }) => {
    const issue = await api.createIssue(workspace.id, `Realtime target ${suffix}`);

    await loginAsE2E(page, api);
    await page.goto(`/${workspace.slug}/issues/${issue.issue_key}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("heading", { name: "Activity" }),
    ).toBeVisible({ timeout: 20_000 });

    // Give the /ws/app subscription a beat to attach. The page never triggers a
    // refetch on its own for this comment, so seeing it proves the push landed.
    await page.waitForTimeout(1000);

    const marker = `pushed-${suffix}`;
    await api.addComment(workspace.id, issue.issue_key, marker);

    await expect(page.getByText(marker)).toBeVisible({ timeout: 15_000 });
  });
});
