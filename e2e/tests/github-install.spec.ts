import { test, expect } from "@playwright/test";
import { TestApiClient } from "../fixtures";
import { loginAsE2E } from "../helpers";
import { API_BASE } from "../env";

// The GitHub App setup flow hands the browser to github.com and expects it back
// by redirect. No test can install the app — that needs a real GitHub account —
// but the half of the flow that runs here is the half that broke: the callback
// redirected to a console route the frontend had removed, so a finished install
// ended on a page for a workspace named "console", with the installation it had
// just created nowhere in sight.
//
// So these drive the callback the way GitHub does, with a state that was never
// issued, and read the page the browser lands on. Every case below stops before
// an installation is created, which is why they need no GitHub credentials.
test.describe("GitHub App install callback", () => {
  let api: TestApiClient;

  test.beforeEach(async () => {
    api = new TestApiClient();
    await api.login("E2E User");
  });

  test.afterEach(async () => {
    await api.cleanup();
  });

  test("a setup that can't be attributed returns to the workspace creator, and says why", async ({
    page,
  }) => {
    await loginAsE2E(page, api);

    await page.goto(
      `${API_BASE}/api/v1/github/callback?installation_id=42&state=never-issued`,
      { waitUntil: "domcontentloaded" },
    );

    await page.waitForURL(/\/workspaces\/new/);
    await expect(
      page.getByRole("heading", { name: "Create a Workspace" }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByRole("alert").filter({ hasText: "expired or was already used" }),
    ).toBeVisible();
  });

  test("a setup that returns no installation says so, instead of looking untouched", async ({
    page,
  }) => {
    await loginAsE2E(page, api);

    await page.goto(`${API_BASE}/api/v1/github/callback`, {
      waitUntil: "domcontentloaded",
    });

    await page.waitForURL(/\/workspaces\/new/);
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "didn't return an installation" }),
    ).toBeVisible({ timeout: 20_000 });
  });
});
