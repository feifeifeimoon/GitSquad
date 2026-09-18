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

test.describe("Issue pull requests", () => {
  let api: TestApiClient;
  let workspace: TestWorkspace;
  let suffix: string;

  test.beforeEach(async () => {
    suffix = Date.now().toString(36);
    api = new TestApiClient();
    await api.login("E2E User");
    workspace = await api.seedWorkspace({
      name: `E2E PR Workspace ${suffix}`,
      slug: `e2e-pr-ws-${suffix}`,
    });
  });

  test.afterEach(async () => {
    await api.cleanup();
  });

  // The active PR is what a human looks for: which pull request is this issue's
  // work, and the history of how it got here.
  test("shows the active pull request and its history, and unlinks it", async ({ page }) => {
    const issue = await api.createIssue(workspace.id, `E2E PR issue ${suffix}`);
    await api.seedPullRequest(workspace.id, issue.id, { number: 41, title: `active ${suffix}` });
    await api.seedPullRequest(workspace.id, issue.id, {
      number: 40,
      title: `merged ${suffix}`,
      state: "merged",
    });

    await loginAsE2E(page, api);
    await page.goto(`/${workspace.slug}/issues/${issue.issue_key}`, {
      waitUntil: "domcontentloaded",
    });

    await expect(page.getByText(`active ${suffix}`)).toBeVisible({ timeout: 20_000 });
    // The history is collapsed by default; opening it reveals the older PR.
    await page.getByRole("button", { name: /历程/ }).click();
    await expect(page.getByText(`merged ${suffix}`)).toBeVisible({ timeout: 10_000 });

    // Unlinking leaves a tombstone: the row stays, marked unlinked, and the
    // issue no longer counts it as active.
    await page.getByRole("button", { name: "unlink" }).first().click();
    await expect(page.getByText("unlinked").first()).toBeVisible({ timeout: 10_000 });
  });

  test("shows a pull request badge on the board card", async ({ page }) => {
    const issue = await api.createIssue(workspace.id, `E2E badge issue ${suffix}`);
    await api.seedPullRequest(workspace.id, issue.id, { number: 43, title: `badge ${suffix}` });

    await loginAsE2E(page, api);
    await page.goto(`/${workspace.slug}`, { waitUntil: "domcontentloaded" });

    await expect(page.getByText(`#43`)).toBeVisible({ timeout: 20_000 });
  });
});

test.describe("Issue pull requests · link lifecycle", () => {
  let api: TestApiClient;
  let workspace: TestWorkspace;
  let suffix: string;

  test.beforeEach(async () => {
    suffix = Date.now().toString(36);
    api = new TestApiClient();
    await api.login("E2E User");
    workspace = await api.seedWorkspace({
      name: `E2E PR Lifecycle ${suffix}`,
      slug: `e2e-pr-life-${suffix}`,
    });
  });

  test.afterEach(async () => {
    await api.cleanup();
  });

  // Unlinking is a tombstone, so it must be reversible: restore puts the PR back
  // as the issue's active one.
  test("restores a pull request that was unlinked", async ({ page }) => {
    const issue = await api.createIssue(workspace.id, `E2E restore issue ${suffix}`);
    await api.seedPullRequest(workspace.id, issue.id, { number: 51, title: `restore ${suffix}` });

    await loginAsE2E(page, api);
    await page.goto(`/${workspace.slug}/issues/${issue.issue_key}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByText(`restore ${suffix}`)).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "unlink" }).first().click();
    await expect(page.getByText("unlinked").first()).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "restore" }).first().click();
    await expect(page.getByText("unlinked")).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByRole("button", { name: "unlink" })).toBeVisible({ timeout: 10_000 });
  });

  // Re-linking needs the active slot back, so a restore that cannot have it says
  // so plainly instead of failing as a server error.
  test("explains a restore that cannot have the active slot", async ({ page }) => {
    const issue = await api.createIssue(workspace.id, `E2E conflict issue ${suffix}`);
    await api.seedPullRequest(workspace.id, issue.id, { number: 52, title: `holding ${suffix}` });
    await api.seedPullRequest(workspace.id, issue.id, {
      number: 53,
      title: `unlinked ${suffix}`,
      suppressed: true,
    });

    await loginAsE2E(page, api);
    await page.goto(`/${workspace.slug}/issues/${issue.issue_key}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByText(`holding ${suffix}`)).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "restore" }).first().click();
    await expect(page.getByText("已有活跃 PR")).toBeVisible({ timeout: 10_000 });
    // And the row it refused to restore is still unlinked.
    await expect(page.getByText("unlinked").first()).toBeVisible({ timeout: 10_000 });
  });
});
