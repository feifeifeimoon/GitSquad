import { test, expect } from "@playwright/test";
import { TestApiClient, type TestWorkspace } from "../fixtures";
import { loginAsE2E } from "../helpers";

test.describe("Navigation", () => {
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

  test("navigates between workspace sections via the sidebar", async ({ page }) => {
    await loginAsE2E(page, api);
    await page.goto(`/${workspace.slug}`, { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("button", { name: "New Issue" }),
    ).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "Agents" }).click();
    await expect(page.getByRole("button", { name: "New Agent" })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole("button", { name: "Skills" }).click();
    await expect(page.getByRole("button", { name: "New Skill" })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole("button", { name: "Issues" }).click();
    await expect(page.getByRole("button", { name: "New Issue" })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("logs out and clears the session", async ({ page }) => {
    await loginAsE2E(page, api);
    await page.goto(`/${workspace.slug}`, { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("button", { name: "New Issue" }),
    ).toBeVisible({ timeout: 20_000 });

    await page.getByTitle("Logout").click();
    await page.getByRole("button", { name: "Sign out" }).click();

    await page.waitForURL((url) => url.pathname === "/", {
      waitUntil: "domcontentloaded",
    });
    const token = await page.evaluate(() =>
      localStorage.getItem("gitsquad_token"),
    );
    expect(token).toBeNull();
  });
});
