import { test, expect } from "@playwright/test";
import { TestApiClient } from "../fixtures";
import { loginAsE2E } from "../helpers";

test.describe("Workspaces", () => {
  let api: TestApiClient;

  test.beforeEach(async () => {
    api = new TestApiClient();
    await api.login("E2E User");
  });

  test.afterEach(async () => {
    await api.cleanup();
  });

  test("seeded workspace appears in the list and opens the issue board", async ({
    page,
  }) => {
    const suffix = Date.now().toString(36);
    const workspace = await api.seedWorkspace({
      name: `E2E Workspace ${suffix}`,
      slug: `e2e-ws-${suffix}`,
      owner: `e2e-owner-${suffix}`,
      repo: `e2e-repo-${suffix}`,
    });

    await loginAsE2E(page, api);
    await page.goto("/workspaces", { waitUntil: "domcontentloaded" });

    // The seeded workspace renders as a card.
    await expect(page.getByText(workspace.name)).toBeVisible({ timeout: 20_000 });

    // Clicking the card navigates to the slug-scoped issue board.
    await page.getByText(workspace.name).click();
    await page.waitForURL(new RegExp(`/${workspace.slug}$`));

    // The 7-column kanban board renders even with zero issues.
    await expect(page.getByText("Backlog")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("In Progress")).toBeVisible();
    await expect(page.getByText("Done")).toBeVisible();
  });
});
