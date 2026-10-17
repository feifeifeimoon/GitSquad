import { test, expect } from "@playwright/test";
import { TestApiClient, type TestWorkspace } from "../fixtures";
import { loginAsE2E } from "../helpers";

test.describe("Workspace overview", () => {
  let api: TestApiClient;
  let workspace: TestWorkspace;
  let suffix: string;

  test.beforeEach(async () => {
    suffix = Date.now().toString(36);
    api = new TestApiClient();
    await api.login("E2E User");
    workspace = await api.seedWorkspace({
      name: `Overview ${suffix}`,
      slug: `overview-${suffix}`,
      owner: `overview-owner-${suffix}`,
      repo: `overview-repo-${suffix}`,
    });
  });

  test.afterEach(async () => {
    await api.cleanup();
  });

  test("summarises what is in flight and who is on the squad", async ({
    page,
  }) => {
    const inProgress = await api.createIssue(
      workspace.id,
      `In progress ${suffix}`,
      { status: "in_progress" },
    );
    const inReview = await api.createIssue(workspace.id, `In review ${suffix}`, {
      status: "in_review",
    });
    const blocked = await api.createIssue(workspace.id, `Blocked ${suffix}`, {
      status: "blocked",
    });
    const backlog = await api.createIssue(workspace.id, `Backlog ${suffix}`, {
      status: "backlog",
    });
    const done = await api.createIssue(workspace.id, `Done ${suffix}`, {
      status: "done",
    });

    const daemon = await api.seedDaemon({ name: `overview-${suffix}` });
    await api.createAgent(workspace.id, {
      name: "planner",
      daemon_id: daemon.id,
      provider: "claude",
      description: "Turns an issue into a plan",
    });

    await loginAsE2E(page, api);
    await page.goto(`/${workspace.slug}`, { waitUntil: "domcontentloaded" });

    // The bar names the page; the page names the workspace.
    await expect(
      page.getByRole("heading", { name: "Overview", exact: true }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByRole("heading", { name: workspace.name, exact: true }),
    ).toBeVisible();

    // The home row's identity followed the scope: this is the workspace's
    // overview, not the list the row points at in All Workspaces.
    await expect(
      page.getByRole("link", { name: "Overview", exact: true }),
    ).toHaveAttribute("href", `/${workspace.slug}`);
    await expect(
      page.getByRole("link", { name: "Workspaces", exact: true }),
    ).toHaveCount(0);

    // The stat strip's labels. The numbers are asserted in the unit tests; the
    // browser test is here to prove the rows reached the page at all.
    await expect(page.getByText("Open issues", { exact: true })).toBeVisible();
    await expect(page.getByText("In progress", { exact: true })).toBeVisible();
    await expect(page.getByText("In review", { exact: true })).toBeVisible();
    // "Blocked" is also an issue status in the rows below, so this one is
    // scoped to its first appearance: the stat label sits above them.
    await expect(page.getByText("Blocked", { exact: true }).first()).toBeVisible();

    // Active issues: the three work states, not the queue and not the archive.
    await expect(page.getByText(inProgress.title)).toBeVisible();
    await expect(page.getByText(inReview.title)).toBeVisible();
    await expect(page.getByText(blocked.title)).toBeVisible();
    await expect(page.getByText(backlog.title)).toHaveCount(0);
    await expect(page.getByText(done.title)).toHaveCount(0);

    // The squad: the agent's name and its derived status.
    await expect(page.getByText("@planner", { exact: true })).toBeVisible();
    await expect(page.getByText("Idle", { exact: true })).toBeVisible();

    // Each pane links to the page that owns its full list. Two "View all"s, in
    // the order the panes are laid out: issues, then agents.
    const viewAll = page.getByRole("link", { name: "View all" });
    await expect(viewAll).toHaveCount(2);
    await expect(viewAll.nth(0)).toHaveAttribute(
      "href",
      `/${workspace.slug}/issues`,
    );
    await expect(viewAll.nth(1)).toHaveAttribute(
      "href",
      `/${workspace.slug}/agents`,
    );

    // The repository card names the repo and links out to it.
    await expect(
      page.getByText(`overview-owner-${suffix}/overview-repo-${suffix}`).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Open on GitHub" }),
    ).toHaveAttribute(
      "href",
      `https://github.com/overview-owner-${suffix}/overview-repo-${suffix}`,
    );
  });

  test("a fresh workspace says what is missing instead of drawing empty sections", async ({
    page,
  }) => {
    await loginAsE2E(page, api);
    await page.goto(`/${workspace.slug}`, { waitUntil: "domcontentloaded" });

    await expect(
      page.getByRole("heading", { name: "Overview", exact: true }),
    ).toBeVisible({ timeout: 20_000 });

    // No issues in flight, no squad, no commits — each pane says so in place,
    // and the ways out stay one click away.
    await expect(page.getByText("Nothing in flight.")).toBeVisible();
    await expect(page.getByText("No agents yet.")).toBeVisible();
    await expect(page.getByText("No commits yet")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Open on GitHub" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Open repository" }),
    ).toHaveAttribute(
      "href",
      `https://github.com/overview-owner-${suffix}/overview-repo-${suffix}`,
    );
  });
});
