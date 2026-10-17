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
    // The workspace's front door is its overview, and the home row names it.
    await expect(
      page.getByRole("heading", { name: "Overview", exact: true }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByRole("link", { name: "Overview", exact: true }),
    ).toHaveAttribute("href", `/${workspace.slug}`);
    await expect(
      page.getByRole("link", { name: "Workspaces", exact: true }),
    ).toHaveCount(0);

    await page.getByRole("link", { name: "Issues", exact: true }).click();
    await expect(page.getByRole("button", { name: "New Issue" })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole("link", { name: "Agents" }).click();
    await expect(page.getByRole("button", { name: "New Agent" })).toBeVisible({
      timeout: 15_000,
    });
    // The bar above the page names the section — the page's own title lives up
    // there now, centred, the way Vercel's does.
    await expect(
      page.getByRole("heading", { name: "Agents", exact: true }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Skills" }).click();
    await expect(page.getByRole("button", { name: "New Skill" })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole("link", { name: "Issues" }).click();
    await expect(page.getByRole("button", { name: "New Issue" })).toBeVisible({
      timeout: 15_000,
    });
  });

  // The console has two scopes, and the URL names which one you are in: a slug
  // is a workspace, no slug is All Workspaces. This is the case that used to be
  // the bug — a cold load of /workspaces had no workspace in the URL and none
  // remembered, so the sidebar drew its four workspace rows greyed out with
  // "Open a workspace first" on hover.
  test("All Workspaces is a scope, not a gap", async ({ page }) => {
    await loginAsE2E(page, api);
    // Straight to the list, without visiting a workspace first: this is how the
    // console is entered from the marketing page, and a full page load is the
    // only thing that ever produced the empty scope.
    await page.goto("/workspaces", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("button", { name: "New Workspace" }),
    ).toBeVisible({ timeout: 20_000 });

    // The scope is named, above the page it scopes.
    await expect(
      page.getByRole("button", { name: "All Workspaces" }),
    ).toBeVisible();
    // …and so is the page: the bar carries the title now.
    await expect(
      page.getByRole("heading", { name: "Workspaces", exact: true }),
    ).toBeVisible();
    // The first row in the sidebar is the list itself. It is the home slot:
    // inside a workspace the same row becomes Overview (the switcher test).
    const nav = page.getByRole("navigation", { name: "Console" });
    await expect(nav.getByRole("link").first()).toHaveAttribute(
      "href",
      "/workspaces",
    );
    await expect(nav.getByRole("link").first()).toContainText("Workspaces");
    // The band headings are gone — what separates the bands is a rule. They
    // are kept for screen readers, so the assertion is on the treatment rather
    // than on absence: `sr-only` is still a box on screen as far as Playwright
    // is concerned, which is the whole point of the class.
    await expect(
      page.getByRole("heading", { name: "Home", exact: true }),
    ).toHaveClass(/sr-only/);
    await expect(
      page.getByRole("heading", { name: "Product", exact: true }),
    ).toHaveClass(/sr-only/);

    // The band is not drawn disabled here — a page that belongs to a workspace
    // does not belong to this scope, and the console says so by leaving it out
    // rather than by greying it. Issues is the exception: it has a page here
    // too, the board across every workspace.
    await expect(
      page.getByRole("link", { name: "Skills", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Issues", exact: true }),
    ).toHaveAttribute("href", "/workspaces/issues");
    await expect(
      page.getByRole("link", { name: "Agents", exact: true }),
    ).toHaveAttribute("href", "/workspaces/agents");
    // Nothing anywhere in the shell is a dead row any more.
    await expect(page.locator("[aria-disabled]")).toHaveCount(0);

    // And the rows that are here are live.
    await expect(
      page.getByRole("link", { name: "Daemons", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Usage", exact: true }),
    ).toBeVisible();
  });

  test("the switcher moves the console into a workspace, and back", async ({
    page,
  }) => {
    await loginAsE2E(page, api);
    await page.goto("/workspaces", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("button", { name: "New Workspace" }),
    ).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "All Workspaces" }).click();

    // The field narrows the list, and says so when it matches nothing.
    await page.getByPlaceholder("Find workspace…").fill("no-such-workspace-zzz");
    await expect(page.getByText("No workspaces match")).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: workspace.name }),
    ).toHaveCount(0);

    await page.getByPlaceholder("Find workspace…").fill(workspace.name);
    await page.getByRole("menuitem", { name: workspace.name }).click();

    // In the workspace it lands on the overview: the home row becomes
    // Overview, and the list row is gone — leaving a workspace is the
    // switcher's job.
    await expect(page).toHaveURL(new RegExp(`/${workspace.slug}$`));
    await expect(
      page.getByRole("heading", { name: "Overview", exact: true }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByRole("link", { name: "Overview", exact: true }),
    ).toHaveAttribute("href", `/${workspace.slug}`);
    await expect(
      page.getByRole("link", { name: "Issues", exact: true }),
    ).toHaveAttribute("href", `/${workspace.slug}/issues`);
    await expect(
      page.getByRole("link", { name: "Workspaces", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: workspace.name })).toBeVisible();

    // And back, in one click. The overview has no All Workspaces counterpart,
    // so the switcher falls to the list — and the home row flips back to
    // Workspaces.
    await page.getByRole("button", { name: workspace.name }).click();
    await page.getByRole("menuitem", { name: "All Workspaces" }).click();
    await expect(page).toHaveURL(/\/workspaces$/);
    await expect(
      page.getByRole("link", { name: "Overview", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Workspaces", exact: true }),
    ).toHaveAttribute("href", "/workspaces");
    await expect(
      page.getByRole("link", { name: "Issues", exact: true }),
    ).toHaveAttribute("href", "/workspaces/issues");
    await expect(
      page.getByRole("link", { name: "Agents", exact: true }),
    ).toHaveAttribute("href", "/workspaces/agents");
    await expect(
      page.getByRole("link", { name: "Skills", exact: true }),
    ).toHaveCount(0);
  });

  // This spec used to assert the opposite: that /usage and /daemons kept the
  // workspace's rows in the sidebar. It was defending a real bug — /usage was
  // missing from the reserved-slug list, so the page was read as a workspace
  // *named* "usage" and the one you were in was cleared. That guard is the
  // reserved list itself (web/lib/paths.test.mjs walks the real route
  // directories), not the sidebar rows; and the rows were a half-truth anyway,
  // because /daemons is not inside a workspace. Now the scope is named, and it
  // is the one the URL says.
  test("a page outside any workspace says so, instead of keeping a stale one", async ({
    page,
  }) => {
    await loginAsE2E(page, api);
    await page.goto(`/${workspace.slug}/issues`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("button", { name: "New Issue" }),
    ).toBeVisible({ timeout: 20_000 });

    for (const [label, path] of [
      ["Usage", "/usage"],
      ["Daemons", "/daemons"],
    ] as const) {
      await page.getByRole("link", { name: label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(
        page.getByRole("heading", { name: label, exact: true }),
      ).toBeVisible({ timeout: 15_000 });

      await expect(
        page.getByRole("button", { name: "All Workspaces" }),
      ).toBeVisible();
      // The home row is the list again, not the workspace's overview.
      await expect(
        page.getByRole("link", { name: "Workspaces", exact: true }),
      ).toHaveAttribute("href", "/workspaces");
      await expect(
        page.getByRole("link", { name: "Overview", exact: true }),
      ).toHaveCount(0);
      // The rows that need a workspace are gone; the ones with an All
      // Workspaces page of their own are not.
      await expect(
        page.getByRole("link", { name: "Agents", exact: true }),
      ).toHaveAttribute("href", "/workspaces/agents");
      await expect(
        page.getByRole("link", { name: "Skills", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("link", { name: "Issues", exact: true }),
      ).toHaveAttribute("href", "/workspaces/issues");
    }
  });

  test("a remembered sidebar width hydrates without a mismatch", async ({
    page,
  }) => {
    // The width lives in localStorage, which the server cannot see. The shell
    // used to read it in a lazy initializer, so the server rendered the default
    // and the client rendered the stored value — a hydration mismatch, which
    // React answers by throwing away the server's markup for the tree it was
    // hydrating. It logged that on every load, for anyone who had ever dragged
    // the handle.
    await page.addInitScript(() =>
      localStorage.setItem("gitsquad_sidebar_width", "320"),
    );
    await loginAsE2E(page, api);

    // Attached before the first load, because hydration is when it speaks.
    const complaints: string[] = [];
    page.on("console", (message) => {
      if (/hydrat/i.test(message.text())) complaints.push(message.text());
    });

    await page.goto("/workspaces", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("button", { name: "New Workspace" }),
    ).toBeVisible({ timeout: 20_000 });

    // The remembered width is applied…
    await expect(page.locator("aside")).toHaveCSS("width", "320px");
    // …and nothing complained about how it got there.
    expect(complaints).toEqual([]);
  });

  test("logs out and clears the session", async ({ page }) => {
    await loginAsE2E(page, api);
    await page.goto(`/${workspace.slug}/issues`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("button", { name: "New Issue" }),
    ).toBeVisible({ timeout: 20_000 });

    // The account menu, not a bare icon: the footer block is the trigger and
    // the menu holds the labelled items.
    await page.getByRole("button", { name: /^@/ }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
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
