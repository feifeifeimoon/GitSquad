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

  test("seeded workspace appears in the list and opens the overview", async ({
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

    // Clicking the card opens the workspace's front door: the overview.
    await page.getByText(workspace.name).click();
    await page.waitForURL(new RegExp(`/${workspace.slug}$`));
    await expect(
      page.getByRole("heading", { name: "Overview", exact: true }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByRole("heading", { name: "Active issues", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Agents", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "About", exact: true }),
    ).toBeVisible();

    // The board is one click down, and it is the 7-column kanban board even
    // with zero issues.
    await page.getByRole("link", { name: "Issues", exact: true }).click();
    await expect(page.getByText("Backlog")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("In Progress")).toBeVisible();
    await expect(page.getByText("Done")).toBeVisible();
  });

  // The card's corner used to hold a status badge that read "Active" on every
  // card — the list is filtered to the active ones before it arrives — and it
  // holds the way to that workspace's settings now.
  test("a card carries the way into that workspace's settings", async ({
    page,
  }) => {
    const suffix = Date.now().toString(36);
    const workspace = await api.seedWorkspace({
      name: `E2E Settings ${suffix}`,
      slug: `e2e-set-${suffix}`,
      owner: `e2e-owner-${suffix}`,
      repo: `e2e-repo-${suffix}`,
    });

    await loginAsE2E(page, api);
    await page.goto("/workspaces", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(workspace.name)).toBeVisible({ timeout: 20_000 });

    // Named for the workspace as well as the action: a page of cards each
    // labelled only "Workspace settings" is a page of identical controls.
    const settings = page.getByRole("link", {
      name: `${workspace.name} settings`,
    });
    await expect(settings).toBeVisible();
    await settings.click();

    await expect(page).toHaveURL(new RegExp(`/${workspace.slug}/settings$`));
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible({
      timeout: 20_000,
    });
  });

  test("a deleted workspace is gone from the list it lands on", async ({
    page,
  }) => {
    const suffix = Date.now().toString(36);
    const workspace = await api.seedWorkspace({
      name: `E2E Removal ${suffix}`,
      slug: `e2e-del-${suffix}`,
      owner: `e2e-owner-${suffix}`,
      repo: `e2e-repo-${suffix}`,
    });

    await loginAsE2E(page, api);
    await page.goto(`/${workspace.slug}/settings`, { waitUntil: "domcontentloaded" });
    // "Delete workspace" is the row's label; the control is the Delete button
    // that opens the confirmation, which holds another one of the same name.
    // `exact`, because role+name matching is substring-based and a switcher's
    // trigger is named after its workspace.
    const trigger = page.getByRole("button", { name: "Delete", exact: true });
    await expect(trigger).toBeVisible({ timeout: 20_000 });
    await trigger.click();
    await page.getByPlaceholder(workspace.name).fill(workspace.name);
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();

    // The list is served from the cache, and it used to keep the row it was
    // just told to forget — so the first thing after a delete was a card that
    // 404s.
    await expect(page).toHaveURL(/\/workspaces$/);
    await expect(
      page.getByRole("button", { name: "New Workspace" }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(workspace.name)).toHaveCount(0);
  });
});
