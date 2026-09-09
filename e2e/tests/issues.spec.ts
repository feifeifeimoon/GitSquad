import { test, expect } from "@playwright/test";
import { TestApiClient, type TestWorkspace } from "../fixtures";
import { loginAsE2E } from "../helpers";

test.describe("Issues", () => {
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

  test("creates an issue from the board", async ({ page }) => {
    await loginAsE2E(page, api);
    await page.goto(`/${workspace.slug}`, { waitUntil: "domcontentloaded" });

    await expect(
      page.getByRole("button", { name: "New Issue" }),
    ).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "New Issue" }).click();
    const title = `E2E issue ${suffix}`;
    await page.getByPlaceholder("Issue title").fill(title);
    await page.getByRole("button", { name: "Create issue" }).click();

    // The new card lands in the Backlog column.
    await expect(page.getByText(title)).toBeVisible({ timeout: 15_000 });
  });

  test("adds a comment on an issue", async ({ page }) => {
    const issue = await api.createIssue(workspace.id, `Comment target ${suffix}`);

    await loginAsE2E(page, api);
    await page.goto(`/${workspace.slug}/issues/${issue.issue_key}`, {
      waitUntil: "domcontentloaded",
    });

    await expect(
      page.getByRole("heading", { name: "Activity" }),
    ).toBeVisible({ timeout: 20_000 });

    const comment = `E2E comment ${suffix}`;
    const editor = page.locator('[contenteditable="true"]');
    await editor.click();
    await page.keyboard.type(comment);
    await page.getByRole("button", { name: "Comment" }).click();

    await expect(page.getByText(comment)).toBeVisible({ timeout: 15_000 });
  });

  test("changes issue status from the detail page", async ({ page }) => {
    const issue = await api.createIssue(workspace.id, `Status target ${suffix}`);

    await loginAsE2E(page, api);
    await page.goto(`/${workspace.slug}/issues/${issue.issue_key}`, {
      waitUntil: "domcontentloaded",
    });

    const statusSelect = page.getByRole("combobox");
    await expect(statusSelect).toContainText("Backlog", { timeout: 20_000 });

    await statusSelect.click();
    await page.getByRole("option", { name: "In Progress" }).click();

    await expect(statusSelect).toContainText("In Progress", { timeout: 10_000 });
  });
});
