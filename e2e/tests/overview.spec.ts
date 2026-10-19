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

  test("summarises what is in flight and which agents are enabled", async ({
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

    // The four readouts answer different questions now. Scope to the band:
    // "Agents" is also a sidebar destination and "Blocked" is a row status.
    const glance = page.getByRole("group", { name: "Workspace at a glance" });
    await expect(glance.getByText("Open issues", { exact: true })).toBeVisible();
    await expect(glance.getByText("In flight", { exact: true })).toBeVisible();
    await expect(glance.getByText("Blocked", { exact: true })).toBeVisible();
    await expect(glance.getByText("Agents", { exact: true })).toBeVisible();

    // Active issues: the three work states, not the queue and not the archive.
    const active = page
      .locator("section")
      .filter({ hasText: "Active issues" })
      .first();
    await expect(active.getByText(inProgress.title)).toBeVisible();
    await expect(active.getByText(inReview.title)).toBeVisible();
    await expect(active.getByText(blocked.title)).toBeVisible();
    await expect(active.getByText(backlog.title)).toHaveCount(0);
    await expect(active.getByText(done.title)).toHaveCount(0);

    // Recently landed is the progress feed: the done issue belongs here, not
    // in the in-flight list above.
    const landed = page
      .locator("section")
      .filter({ hasText: "Recently landed" })
      .first();
    await expect(landed.getByText(done.title)).toBeVisible();

    // The rail's distribution and identity blocks. "Queued" is also an agent
    // status in the Agents section below, so it is scoped to the mix section.
    const mix = page
      .locator("section")
      .filter({ hasText: "Issue mix" })
      .first();
    await expect(mix.getByText("Queued", { exact: true })).toBeVisible();
    await expect(page.getByText("Issue mix", { exact: true })).toBeVisible();
    await expect(page.getByText("About", { exact: true })).toBeVisible();

    // The Agents section: the agent's name and its derived status.
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

    // The repository line itself is the link now — header and About, with no
    // separate "Open on GitHub" footer.
    const repoLink = page.getByRole("link", {
      name: `overview-owner-${suffix}/overview-repo-${suffix}`,
    });
    await expect(repoLink).toHaveCount(2);
    await expect(repoLink.first()).toBeVisible();
    await expect(repoLink.first()).toHaveAttribute(
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

    // No issues at all: the work lists, the mix, the Agents section and the
    // commit block each say so in place, and the ways out stay one click away.
    await expect(page.getByText("Nothing in flight.")).toBeVisible();
    await expect(page.getByText("Nothing landed this week.")).toBeVisible();
    await expect(page.getByText("No open issues.")).toBeVisible();
    await expect(page.getByText("No agents yet.")).toBeVisible();
    await expect(page.getByText("No commits yet")).toBeVisible();
    const repoLink = page.getByRole("link", {
      name: `overview-owner-${suffix}/overview-repo-${suffix}`,
    });
    await expect(repoLink).toHaveCount(2);
    await expect(
      page.getByRole("link", { name: "Open repository" }),
    ).toHaveAttribute(
      "href",
      `https://github.com/overview-owner-${suffix}/overview-repo-${suffix}`,
    );
  });
});
