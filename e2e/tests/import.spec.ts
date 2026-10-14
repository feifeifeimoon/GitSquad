import { test, expect } from "@playwright/test";
import { TestApiClient } from "../fixtures";
import { loginAsE2E } from "../helpers";

// The repository picker → configure journey, which no other spec covers.
//
// The bug this pins: the Import button built its URL from the selected
// account, which is empty until someone opens the account menu and picks one
// by hand. The list itself never needs that (it falls back to the first
// installation), so the ordinary single-account user reached configure with
// `installation=` empty, and the configure page bounced straight back to the
// list. Nothing was created and nothing said why.
test.describe("Workspace import", () => {
  let api: TestApiClient;

  test.beforeEach(async () => {
    api = new TestApiClient();
    await api.login("E2E User");
  });

  test.afterEach(async () => {
    await api.cleanup();
  });

  test("importing a repository reaches configure and creates the workspace", async ({
    page,
  }) => {
    const suffix = Date.now().toString(36);
    const owner = `e2e-owner-${suffix}`;
    const repoName = `e2e-import-${suffix}`;
    const workspaceName = `Import ${suffix}`;
    const { repoId, installationId } = await api.seedImportableRepo({
      owner,
      repo: repoName,
    });

    await loginAsE2E(page, api);
    await page.goto("/workspaces/new", { waitUntil: "domcontentloaded" });

    // The seeded repo is the only row this user has, so the first Import
    // button on the page is its. Clicked without touching the account menu —
    // that omission is the regression.
    const importButtons = page.getByRole("button", { name: "Import" });
    await expect(importButtons.first()).toBeVisible({ timeout: 20_000 });
    await importButtons.first().click();

    // The configure step renders instead of bouncing back, and the URL it was
    // reached with carries the repo's own installation.
    await page.waitForURL(/\/workspaces\/new\/configure\?/);
    expect(page.url()).toContain(`installation=${installationId}`);
    expect(page.url()).toContain(`repo=${repoId}`);
    await expect(
      page.getByRole("heading", { name: "Configure Workspace" }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(`${owner}/${repoName}`).first()).toBeVisible();

    // Creating from here actually lands a workspace, which is the outcome the
    // bug prevented.
    await page
      .getByPlaceholder("e.g. main, frontend, backend")
      .fill(workspaceName);
    await page.getByRole("button", { name: "Create Workspace" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/workspaces/new"));
    await expect(page.getByText(workspaceName)).toBeVisible({
      timeout: 20_000,
    });
  });
});
