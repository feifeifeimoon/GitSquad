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

  // Global pages used to lose the workspace context: the console decides
  // whether the first path segment is a workspace by checking a reserved-slug
  // list, and /usage was missing from it, so that page was read as a workspace
  // named "usage" and the real one was cleared.
  //
  // The sidebar only renders its workspace section when a workspace is in
  // context, so those links vanishing is exactly the regression.
  test("keeps the workspace context on global pages", async ({ page }) => {
    await loginAsE2E(page, api);
    await page.goto(`/${workspace.slug}`, { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("button", { name: "New Issue" }),
    ).toBeVisible({ timeout: 20_000 });

    for (const [label, path] of [
      ["Usage", "/usage"],
      ["Daemons", "/daemons"],
    ] as const) {
      await page.getByRole("button", { name: label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(
        page.getByRole("heading", { name: label, exact: true }),
      ).toBeVisible({ timeout: 15_000 });

      // Still in a workspace. The switcher is the sharpest signal: without the
      // workspace it falls back to the product name.
      await expect(
        page.getByRole("button", { name: workspace.name }),
      ).toBeVisible();
      for (const section of ["Issues", "Agents", "Skills"]) {
        await expect(
          page.getByRole("button", { name: section, exact: true }),
        ).toBeVisible();
      }
    }

    // And the context is live rather than merely painted: a section link has to
    // resolve inside this workspace. Without the workspace the links still
    // render but point at the global path, so this is what catches them.
    await page.getByRole("button", { name: "Agents", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${workspace.slug}/agents$`));
    await expect(
      page.getByRole("button", { name: "New Agent" }),
    ).toBeVisible({ timeout: 15_000 });
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
