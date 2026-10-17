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

    // One machine backing an agent in each workspace, both named "planner" —
    // the same name twice, which is exactly what the roster's Workspace column
    // is for.
    const daemon = await api.seedDaemon({
      name: `mac-${suffix}`,
      kinds: ["claude"],
    });
    for (const workspace of [alpha, beta]) {
      await api.createAgent(workspace.id, {
        name: "planner",
        daemon_id: daemon.id,
        provider: "claude",
        description: "Turns an issue into a plan",
      });
    }
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

  test("the agent roster groups by workspace, and names each one", async ({
    page,
  }) => {
    await loginAsE2E(page, api);
    await page.goto("/workspaces/agents", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Agents", exact: true })).toBeVisible(
      { timeout: 20_000 },
    );

    // One group per workspace, and one row in each — both rows called
    // "@planner", which is a name people reuse. The group is what tells them
    // apart; the name no longer has to.
    await expect(page.getByRole("listitem")).toHaveCount(2);
    const alphaGroup = page.getByRole("button", { name: alpha.name });
    const betaGroup = page.getByRole("button", { name: beta.name });
    await expect(alphaGroup).toContainText("1");
    await expect(betaGroup).toContainText("1");

    // Collapsing is the header's job, and it takes the group with it.
    await expect(alphaGroup).toHaveAttribute("aria-expanded", "true");
    await alphaGroup.click();
    await expect(alphaGroup).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("listitem")).toHaveCount(1);
    await alphaGroup.click();
    await expect(page.getByRole("listitem")).toHaveCount(2);

    // The header's link goes back to that workspace's roster, which is where an
    // agent can be edited — there is no agent detail page.
    await expect(page.locator(`a[href="/${alpha.slug}/agents"]`)).toBeVisible();
    await expect(page.locator(`a[href="/${beta.slug}/agents"]`)).toBeVisible();

    // Read-only here as well: creating an agent names a workspace.
    await expect(page.getByRole("button", { name: "New Agent" })).toHaveCount(0);
  });

  // The switcher changes the scope, not the page. It used to hardcode the
  // workspace's board, so picking a workspace while reading the roster landed
  // on that workspace's *issues*.
  test("picking a workspace stays on the page you were reading", async ({
    page,
  }) => {
    await loginAsE2E(page, api);
    await page.goto("/workspaces/agents", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Agents", exact: true })).toBeVisible(
      { timeout: 20_000 },
    );

    await page.getByRole("button", { name: "All Workspaces" }).click();
    await page.getByRole("menuitem", { name: alpha.name }).click();

    // The roster of that workspace, not its board.
    await expect(page).toHaveURL(new RegExp(`/${alpha.slug}/agents$`));
    await expect(page.getByRole("button", { name: "New Agent" })).toBeVisible({
      timeout: 20_000,
    });
    // …and the same rule on the way back, by keyboard: an empty field means the
    // row the menu opens on — All Workspaces — rather than the first workspace
    // in the list, which is what Enter used to pick.
    await page.getByRole("button", { name: alpha.name }).click();
    await page.getByPlaceholder("Find workspace…").press("Enter");
    await expect(page).toHaveURL(/\/workspaces\/agents$/);
  });

  test("an issue created in a workspace is on the board across them", async ({
    page,
  }) => {
    await loginAsE2E(page, api);
    await page.goto(`/${alpha.slug}/issues`, { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("button", { name: "New Issue" }),
    ).toBeVisible({ timeout: 20_000 });

    const title = `Created in ${alpha.slug} ${suffix}`;
    await page.getByRole("button", { name: "New Issue" }).click();
    await page.getByPlaceholder("Issue title").fill(title);
    await page.getByRole("button", { name: "Create issue" }).click();
    await expect(page.getByText(title)).toBeVisible({ timeout: 15_000 });

    // Straight to the aggregate board through the switcher — an in-app hop, so
    // the cache survives it. The board reads a different key than the workspace
    // board does, and it used to be stale for the rest of the 30 seconds, which
    // looked like the issue had not been created at all.
    await page.getByRole("button", { name: alpha.name }).click();
    await page.getByRole("menuitem", { name: "All Workspaces" }).click();
    await expect(page).toHaveURL(/\/workspaces\/issues$/);
    await expect(page.getByText(title)).toBeVisible({ timeout: 15_000 });
  });
});
