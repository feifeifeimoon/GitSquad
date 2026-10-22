import { test, expect } from "@playwright/test";
import { TestApiClient, type TestWorkspace, type TestDaemon } from "../fixtures";
import { loginAsE2E } from "../helpers";

test.describe("Agents", () => {
  let api: TestApiClient;
  let workspace: TestWorkspace;
  let daemon: TestDaemon;
  let suffix: string;

  test.beforeEach(async () => {
    suffix = Date.now().toString(36);
    api = new TestApiClient();
    await api.login("E2E User");
    workspace = await api.seedWorkspace({
      name: `E2E Workspace ${suffix}`,
      slug: `e2e-ws-${suffix}`,
    });
    daemon = await api.seedDaemon({ name: `E2E Mac ${suffix}` });
  });

  test.afterEach(async () => {
    await api.cleanup();
  });

  /** Open the roster's Filter menu and pick a radio item from one facet. */
  async function pickFilter(
    page: import("@playwright/test").Page,
    facet: "Availability" | "Workload",
    option: string,
  ) {
    await page.getByRole("button", { name: /^Filter/ }).click();
    await page.getByRole("menuitem", { name: facet }).hover();
    await page.getByRole("menuitemradio", { name: new RegExp(`^${option}`) }).click();
  }

  test("lists a seeded agent with its runtime", async ({ page }) => {
    const agentName = `coder-${suffix}`;
    await api.createAgent(workspace.id, {
      name: agentName,
      daemon_id: daemon.id,
      provider: "claude",
    });

    await loginAsE2E(page, api);
    await page.goto(`/${workspace.slug}/agents`, { waitUntil: "domcontentloaded" });

    const list = page.getByRole("list");
    await expect(list.getByText(`@${agentName}`)).toBeVisible({ timeout: 20_000 });
    // Provider, then the machine it runs on, in the same cell: `claude (host)`.
    await expect(list.getByText("claude", { exact: true })).toBeVisible();
    await expect(list.getByText(daemon.name)).toBeVisible();
  });

  // Status is two axes now — whether the machine can run the agent, and what the
  // agent has on its plate — derived from the daemon heartbeat plus the task
  // queue. Each case seeds that input rather than a status column.
  test("an agent with a live daemon and no work reads online and idle", async ({
    page,
  }) => {
    const agentName = `idle-${suffix}`;
    await api.createAgent(workspace.id, {
      name: agentName,
      daemon_id: daemon.id,
      provider: "claude",
    });

    await loginAsE2E(page, api);
    await page.goto(`/${workspace.slug}/agents`, { waitUntil: "domcontentloaded" });

    const row = page.getByRole("listitem").filter({ hasText: `@${agentName}` });
    await expect(row.getByText("Online", { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(row.getByText("Idle", { exact: true })).toBeVisible();
    await expect(row.getByText("Nothing in flight")).toBeVisible();
  });

  test("an agent with an in-flight task reads online and working, naming the issue", async ({
    page,
  }) => {
    const agentName = `busy-${suffix}`;
    const agent = await api.createAgent(workspace.id, {
      name: agentName,
      daemon_id: daemon.id,
      provider: "claude",
    });
    const issue = await api.createIssue(workspace.id, `Work for ${agentName}`);
    await api.seedTask({
      workspaceId: workspace.id,
      issueId: issue.id,
      agentId: agent.id,
      daemonId: daemon.id,
    });

    await loginAsE2E(page, api);
    await page.goto(`/${workspace.slug}/agents`, { waitUntil: "domcontentloaded" });

    const row = page.getByRole("listitem").filter({ hasText: `@${agentName}` });
    await expect(row.getByText("Online", { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(row.getByText("Working", { exact: true })).toBeVisible();
    // The row says what it is doing, not just that it is doing something.
    await expect(row.getByText(issue.issue_key)).toBeVisible();
    await expect(row.getByText(issue.title)).toBeVisible();
  });

  test("and offline machine keeps the work it is stuck with", async ({ page }) => {
    // The case the two axes exist for: the machine is unreachable *and* the
    // agent has a queue. The old single status said only "Offline", which hid
    // the part somebody has to act on.
    const offline = await api.seedDaemon({
      name: `E2E Offline ${suffix}`,
      status: "offline",
    });
    const agentName = `gone-${suffix}`;
    const agent = await api.createAgent(workspace.id, {
      name: agentName,
      daemon_id: offline.id,
      provider: "claude",
    });
    const issue = await api.createIssue(workspace.id, `Queued for ${agentName}`);
    await api.seedTask({
      workspaceId: workspace.id,
      issueId: issue.id,
      agentId: agent.id,
      daemonId: offline.id,
      status: "queued",
    });

    await loginAsE2E(page, api);
    await page.goto(`/${workspace.slug}/agents`, { waitUntil: "domcontentloaded" });

    const row = page.getByRole("listitem").filter({ hasText: `@${agentName}` });
    await expect(row.getByText("Offline", { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(row.getByText("1 queued", { exact: true })).toBeVisible();
    // And the face says the machine is unreachable: it sleeps. The written label
    // is the assertion that carries the meaning — this one pins the mapping the
    // illustration is drawn from.
    await expect(row.locator('[data-head-state="sleeping"]')).toBeVisible();
  });

  test("a downed machine is one banner above the roster, with the way to it", async ({
    page,
  }) => {
    const offline = await api.seedDaemon({
      name: `E2E Offline ${suffix}`,
      status: "offline",
    });
    await api.createAgent(workspace.id, {
      name: `stranded-${suffix}`,
      daemon_id: offline.id,
      provider: "claude",
    });

    await loginAsE2E(page, api);
    await page.goto(`/${workspace.slug}/agents`, { waitUntil: "domcontentloaded" });

    const banner = page.getByRole("status");
    await expect(banner).toContainText(`${offline.name} is offline`, {
      timeout: 20_000,
    });
    await expect(banner).toContainText("1 agent on it can't run");
    await expect(
      banner.getByRole("link", { name: "View daemon" }),
    ).toHaveAttribute("href", `/daemons/${offline.id}`);
  });

  test("the API's answer carries the shape it just stored", async () => {
    // The create and patch responses build the agent from the same row the list
    // read does — and one of those three builders once lost this field while the
    // roster still looked right, because the page re-reads the list after a
    // write. Assert the response itself, so a client that trusts it is not the
    // one that finds out.
    const agent = await api.createAgent(workspace.id, {
      name: `shaped-${suffix}`,
      daemon_id: daemon.id,
      provider: "claude",
      head_shape: "hexagon",
    });
    expect(agent.head_shape).toBe("hexagon");
  });

  test("welcomes an empty roster with the head", async ({ page }) => {
    // No agents in this workspace at all: the empty state draws the same robot
    // the homepage does, and the sentence — not the head, which is aria-hidden
    // — is what says the roster is empty.
    await loginAsE2E(page, api);
    await page.goto(`/${workspace.slug}/agents`, { waitUntil: "domcontentloaded" });

    await expect(page.getByText("No agents yet")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('[data-head-shape="gitsquad"]')).toBeVisible();
  });

  test("filters on both axes, and the two combine", async ({ page }) => {
    const idleName = `idle-${suffix}`;
    const goneName = `gone-${suffix}`;
    await api.createAgent(workspace.id, {
      name: idleName,
      daemon_id: daemon.id,
      provider: "claude",
    });
    const offline = await api.seedDaemon({
      name: `E2E Offline ${suffix}`,
      status: "offline",
    });
    await api.createAgent(workspace.id, {
      name: goneName,
      daemon_id: offline.id,
      provider: "claude",
    });

    await loginAsE2E(page, api);
    await page.goto(`/${workspace.slug}/agents`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText(`@${idleName}`)).toBeVisible({ timeout: 20_000 });

    // Availability alone: the reachable agent goes, the stranded one stays.
    await pickFilter(page, "Availability", "Offline");
    await expect(page.getByText(`@${goneName}`)).toBeVisible();
    await expect(page.getByText(`@${idleName}`)).toBeHidden();

    // Workload alone, on top of it: both agents are idle, so the combination
    // keeps the offline one.
    await pickFilter(page, "Workload", "Idle");
    await expect(page.getByText(`@${goneName}`)).toBeVisible();

    // And a combination nothing satisfies empties the roster inside its surface
    // rather than replacing the page.
    await page.getByRole("button", { name: /^Filter/ }).click();
    await page.getByRole("menuitem", { name: "Workload" }).hover();
    await page.getByRole("menuitemradio", { name: /^Working/ }).click();
    await expect(page.getByText("No agents match this filter.")).toBeVisible();
  });

  test("a row opens the agent, and the issue it names opens the issue", async ({
    page,
  }) => {
    const agentName = `nav-${suffix}`;
    const agent = await api.createAgent(workspace.id, {
      name: agentName,
      daemon_id: daemon.id,
      provider: "claude",
      description: "Walks the issue queue",
      instructions: "Read the issue before you start.",
    });
    const issue = await api.createIssue(workspace.id, `Navigation ${suffix}`);
    await api.seedTask({
      workspaceId: workspace.id,
      issueId: issue.id,
      agentId: agent.id,
      daemonId: daemon.id,
    });

    await loginAsE2E(page, api);
    await page.goto(`/${workspace.slug}/agents`, { waitUntil: "domcontentloaded" });

    const row = page.getByRole("listitem").filter({ hasText: `@${agentName}` });
    await expect(row).toBeVisible({ timeout: 20_000 });

    // The issue in the row goes to the issue…
    await row.getByText(issue.issue_key).click();
    await expect(page).toHaveURL(
      new RegExp(`/${workspace.slug}/issues/${issue.issue_key}$`),
    );

    // …and the row itself goes to the agent.
    await page.goBack();
    const rowAgain = page.getByRole("listitem").filter({ hasText: `@${agentName}` });
    await rowAgain.getByRole("link", { name: new RegExp(`@${agentName}`) }).click();
    await expect(page).toHaveURL(
      new RegExp(`/${workspace.slug}/agents/${agent.id}$`),
    );

    // The detail page is the reading surface: the words it works from, what it
    // is doing now, and the history behind it.
    await expect(
      page.getByRole("heading", { name: `@${agentName}` }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Read the issue before you start.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Now" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Recent runs" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Instructions" }),
    ).toBeVisible();
    await expect(page.getByText(issue.issue_key).first()).toBeVisible();
  });

  test("creates an agent from the UI", async ({ page }) => {
    await loginAsE2E(page, api);
    await page.goto(`/${workspace.slug}/agents`, { waitUntil: "domcontentloaded" });

    await page.getByRole("button", { name: "New agent" }).click();

    const agentName = `ui-agent-${suffix}`;
    await page.getByPlaceholder("coder").fill(agentName);

    // The robot is part of creation now — pick the circle, and the row it lands
    // in has to wear the outline that was picked.
    await page.getByRole("button", { name: "Circle" }).click();

    // Pick the seeded online daemon, then its provider. Radix Select triggers
    // expose role=combobox but their accessible name is unreliable in this
    // version, so target by position (daemon first, provider second).
    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: daemon.name }).click();
    await page.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "claude" }).click();

    await page.getByRole("button", { name: "Create agent" }).click();

    await expect(page.getByText(`@${agentName}`)).toBeVisible({ timeout: 15_000 });
    await expect(
      page
        .getByRole("listitem")
        .filter({ hasText: `@${agentName}` })
        .locator('[data-head-shape="circle"]'),
    ).toBeVisible();
  });

  test("accepts a name in Chinese", async ({ page }) => {
    // A name is a name in any script: Han characters are letters, and the
    // roster prints them with the same @ it gives an ASCII handle.
    await loginAsE2E(page, api);
    await page.goto(`/${workspace.slug}/agents`, { waitUntil: "domcontentloaded" });

    await page.getByRole("button", { name: "New agent" }).click();
    await page.getByPlaceholder("coder").fill("首席架构师");

    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: daemon.name }).click();
    await page.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "claude" }).click();

    await page.getByRole("button", { name: "Create agent" }).click();

    await expect(page.getByText("@首席架构师")).toBeVisible({ timeout: 15_000 });
  });
});
