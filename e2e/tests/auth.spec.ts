import { test, expect } from "@playwright/test";
import { TestApiClient } from "../fixtures";
import { loginAsE2E } from "../helpers";

test.describe("Authentication", () => {
  test("unauthenticated user is redirected to login", async ({ page }) => {
    await page.goto("/workspaces", { waitUntil: "domcontentloaded" });

    await expect(
      page.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("button", { name: "Continue with Google" }),
    ).toBeVisible();
  });

  test("e2e token authenticates and opens the console", async ({ page }) => {
    const api = new TestApiClient();
    const user = await api.login("E2E User");
    expect(user.id).toBeTruthy();

    await loginAsE2E(page, api);
    await page.goto("/workspaces", { waitUntil: "domcontentloaded" });

    // The authenticated console shell renders the workspace list.
    await expect(
      page.getByRole("button", { name: "New Workspace" }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "Workspaces" })).toBeVisible();
  });
});
