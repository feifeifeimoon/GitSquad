import { test, expect } from "@playwright/test";
import { TestApiClient, type TestWorkspace } from "../fixtures";
import { loginAsE2E } from "../helpers";

test.describe("Skills", () => {
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

  test("creates a skill from the UI", async ({ page }) => {
    await loginAsE2E(page, api);
    await page.goto(`/${workspace.slug}/skills`, { waitUntil: "domcontentloaded" });

    await page.getByRole("button", { name: "New Skill" }).click();

    const name = `E2E skill ${suffix}`;
    await page.getByPlaceholder("react-patterns").fill(name);
    await page
      .getByPlaceholder("Common React patterns and best practices")
      .fill("Patterns for E2E");
    await page.getByRole("button", { name: "Create skill" }).click();

    await expect(page.getByText(name)).toBeVisible({ timeout: 15_000 });
  });

  test("edits and deletes a skill", async ({ page }) => {
    const skill = await api.createSkill(workspace.id, {
      name: `Edit me ${suffix}`,
      description: "original description",
    });

    await loginAsE2E(page, api);
    await page.goto(`/${workspace.slug}/skills`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText(skill.name)).toBeVisible({ timeout: 15_000 });

    // Edit: rename and save.
    await page.getByTitle("Edit skill").click();
    const renamed = `Renamed ${suffix}`;
    await page.getByPlaceholder("react-patterns").fill(renamed);
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText(renamed)).toBeVisible({ timeout: 15_000 });

    // Delete: confirm and assert the empty state returns.
    await page.getByTitle("Delete skill").click();
    await page.getByRole("button", { name: "Yes" }).click();
    await expect(page.getByText("No skills yet")).toBeVisible({ timeout: 15_000 });
  });
});
