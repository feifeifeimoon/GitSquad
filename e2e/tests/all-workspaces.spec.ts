import { test, expect } from "@playwright/test";
import {
  TestApiClient,
  type TestIssue,
  type TestWorkspace,
} from "../fixtures";
import { loginAsE2E } from "../helpers";

// The All Workspaces board — the console's first read across workspaces. Two
// seeded workspaces, one issue each, and the board has to join them without
// losing track of where anything came from.
test.describe("All Workspaces board", () => {
  let api: TestApiClient;
  let alpha: TestWorkspace;
  let beta: TestWorkspace;
  let alphaIssue: TestIssue;
  let betaIssue: TestIssue;
  let alphaTitle: string;
  let betaTitle: string;
  let suffix: string;

  test.beforeEach(async () => {
    suffix = Date.now().toString(36);
    api = new TestApiClient();
    await api.login("E2E User");
    alpha = await api.seedWorkspace({
      name: `Alpha ${suffix}`,
      slug: `alpha-${suffix}`,
      owner: `owner-a-${suffix}`,
      repo: "alpha",
    });
    beta = await api.seedWorkspace({
      name: `Beta ${suffix}`,
      slug: `beta-${suffix}`,
      owner: `owner-b-${suffix}`,
      repo: "beta",
    });
    alphaTitle = `Alpha work ${suffix}`;
    betaTitle = `Beta work ${suffix}`;
    alphaIssue = await api.createIssue(alpha.id, alphaTitle);
    betaIssue = await api.createIssue(beta.id, betaTitle);
  });

  test.afterEach(async () => {
    await api.cleanup();
  });

  test("reads across workspaces, naming the one each issue is in", async ({
    page,
  }) => {
    // The two issues are both "-1": numbering restarts per workspace. Nothing
    // about the key says *whose* issue it is, which is the whole reason the
    // board carries the workspace on each row.
    expect(alphaIssue.issue_key).toBe(betaIssue.issue_key);

    await loginAsE2E(page, api);
    await page.goto("/workspaces/issues", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(alphaTitle)).toBeVisible({ timeout: 20_000 });

    // The bar names the page, and the sidebar marks this row rather than the
    // list it hangs under: `/workspaces` is a prefix of `/workspaces/issues`,
    // and a prefix-only rule lit both.
    await expect(
      page.getByRole("heading", { name: "Issues", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Issues", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      page.getByRole("link", { name: "Workspaces", exact: true }),
    ).not.toHaveAttribute("aria-current", "page");

    // Both workspaces' work is here, one card each...
    await expect(page.getByText(betaTitle)).toBeVisible();
    await expect(page.locator("[data-issue-card]")).toHaveCount(2);

    // ...and each card says which workspace it came from. The identity of a
    // card is its title, not its key: the keys collide.
    await expect(
      page.locator("[data-issue-card]").filter({ hasText: alphaTitle }),
    ).toContainText(alpha.name);
    await expect(
      page.locator("[data-issue-card]").filter({ hasText: betaTitle }),
    ).toContainText(beta.name);
  });

  test("a card opens its issue in the workspace that owns it", async ({
    page,
  }) => {
    await loginAsE2E(page, api);
    await page.goto("/workspaces/issues", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(betaTitle)).toBeVisible({ timeout: 20_000 });

    await page.locator("[data-issue-card]").filter({ hasText: betaTitle }).click();

    // The slug is what makes the URL unambiguous — the key is not.
    await expect(page).toHaveURL(
      new RegExp(`/${beta.slug}/issues/${betaIssue.issue_key}$`),
    );
    // And it really is that issue's page: the detail view's own heading is the
    // title the card showed.
    await expect(
      page.getByRole("heading", { name: betaTitle }),
    ).toBeVisible({ timeout: 20_000 });
  });

  test("offers no control that would have to guess a workspace", async ({
    page,
  }) => {
    await loginAsE2E(page, api);
    await page.goto("/workspaces/issues", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(alphaTitle)).toBeVisible({ timeout: 20_000 });

    // Read-only, and visibly so: no create button, and no per-column "+", both
    // of which would have to name a workspace the board is not in. Left out
    // rather than drawn doing nothing.
    await expect(page.getByRole("button", { name: "New Issue" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Add to / })).toHaveCount(0);
    // The cards still open things — that is the one thing a card here can do.
    await expect(page.locator("[data-issue-card]").first()).toBeVisible();
  });
});
