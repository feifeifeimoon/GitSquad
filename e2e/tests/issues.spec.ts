import { test, expect } from "@playwright/test";
import {
  TestApiClient,
  type TestDaemon,
  type TestUser,
  type TestWorkspace,
} from "../fixtures";
import { loginAsE2E } from "../helpers";

test.describe("Issues", () => {
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

  test("creates an issue from the board", async ({ page }) => {
    await loginAsE2E(page, api);
    await page.goto(`/${workspace.slug}`, { waitUntil: "domcontentloaded" });

    await expect(
      page.getByRole("button", { name: "New Issue" }),
    ).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "New Issue" }).click();
    const title = `E2E issue ${suffix}`;
    await page.getByPlaceholder("Issue title").fill(title);
    await page.getByRole("button", { name: "Create issue" }).click();

    // The new card lands in the Backlog column.
    await expect(page.getByText(title)).toBeVisible({ timeout: 15_000 });
  });

  test("adds a comment on an issue", async ({ page }) => {
    const issue = await api.createIssue(workspace.id, `Comment target ${suffix}`);

    await loginAsE2E(page, api);
    await page.goto(`/${workspace.slug}/issues/${issue.issue_key}`, {
      waitUntil: "domcontentloaded",
    });

    await expect(
      page.getByRole("heading", { name: "Activity" }),
    ).toBeVisible({ timeout: 20_000 });

    const comment = `E2E comment ${suffix}`;
    const editor = page.getByRole("textbox", { name: "Write a comment" });
    await editor.click();
    await page.keyboard.type(comment);
    // Exact: the activity rail's jump targets are labelled "Comment from …",
    // and an issue may itself be titled with the word.
    await page.getByRole("button", { name: "Comment", exact: true }).click();

    await expect(page.getByText(comment)).toBeVisible({ timeout: 15_000 });
  });

  // A timeline read backwards is not a timeline: the server orders activity by
  // `created_at ASC` and the feed has to keep that order, because the first
  // entry is what explains the rest.
  test("reads the activity feed oldest first", async ({ page }) => {
    const issue = await api.createIssue(workspace.id, `Order ${suffix}`);
    const older = `first note ${suffix}`;
    const newer = `second note ${suffix}`;
    await api.addComment(workspace.id, issue.issue_key, older);
    await api.addComment(workspace.id, issue.issue_key, newer);

    await loginAsE2E(page, api);
    await page.goto(`/${workspace.slug}/issues/${issue.issue_key}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByText(newer)).toBeVisible({ timeout: 20_000 });

    const olderBox = await page.getByText(older).boundingBox();
    const newerBox = await page.getByText(newer).boundingBox();
    expect(olderBox).not.toBeNull();
    expect(newerBox).not.toBeNull();
    expect(newerBox?.y ?? 0).toBeGreaterThan(olderBox?.y ?? 0);
  });

  test("changes issue status from the detail page", async ({ page }) => {
    const issue = await api.createIssue(workspace.id, `Status target ${suffix}`);

    await loginAsE2E(page, api);
    await page.goto(`/${workspace.slug}/issues/${issue.issue_key}`, {
      waitUntil: "domcontentloaded",
    });

    const statusSelect = page.getByRole("combobox");
    await expect(statusSelect).toContainText("Backlog", { timeout: 20_000 });

    await statusSelect.click();
    await page.getByRole("option", { name: "In Progress" }).click();

    await expect(statusSelect).toContainText("In Progress", { timeout: 10_000 });
  });

  // Both of these were write-once before: the API has always accepted a title
  // and a description on update, and no page ever sent one, so the create
  // dialog was the only moment either could be set.
  test("renames an issue from its own heading", async ({ page }) => {
    const issue = await api.createIssue(workspace.id, `Old title ${suffix}`);

    await loginAsE2E(page, api);
    await page.goto(`/${workspace.slug}/issues/${issue.issue_key}`, {
      waitUntil: "domcontentloaded",
    });

    // The words are the control — no pencil to find, and the caret arrives
    // with the click rather than after a second one.
    const heading = page.getByRole("heading", { name: `Old title ${suffix}` });
    await expect(heading).toBeVisible({ timeout: 20_000 });
    await heading.click();

    const renamed = `Renamed ${suffix}`;
    const field = page.locator("textarea");
    await expect(field).toBeVisible();
    await expect(field).toBeFocused();
    await field.fill(renamed);
    await field.press("Enter");

    // The heading is the assertion, not the textarea: it only comes back once
    // the save has landed.
    await expect(
      page.getByRole("heading", { name: renamed }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("edits the description after the issue exists", async ({ page }) => {
    const issue = await api.createIssue(workspace.id, `Body target ${suffix}`);

    await loginAsE2E(page, api);
    await page.goto(`/${workspace.slug}/issues/${issue.issue_key}`, {
      waitUntil: "domcontentloaded",
    });

    await expect(
      page.getByRole("heading", { name: "Activity" }),
    ).toBeVisible({ timeout: 20_000 });

    // An empty description still has to be offered: there is nothing to click.
    await page.getByRole("button", { name: "Add a description" }).click();
    // Named, not a bare `[contenteditable]`: the page carries two of these
    // editors, and the comment box is always one of them.
    const editor = page.getByRole("textbox", { name: "Issue description" });
    // The click that opened it put the caret in: nothing is typed over.
    await expect(editor).toBeFocused();
    await page.keyboard.type(`Written after the fact ${suffix}`);
    await page.getByRole("button", { name: "Save" }).click();

    await expect(
      page.getByText(`Written after the fact ${suffix}`),
    ).toBeVisible({ timeout: 15_000 });

    // And once it holds prose, the prose is the way back in.
    await page.getByText(`Written after the fact ${suffix}`).click();
    await expect(editor).toBeFocused();
  });
});

test.describe("Issue pull requests", () => {
  let api: TestApiClient;
  let workspace: TestWorkspace;
  let suffix: string;

  test.beforeEach(async () => {
    suffix = Date.now().toString(36);
    api = new TestApiClient();
    await api.login("E2E User");
    workspace = await api.seedWorkspace({
      name: `E2E PR Workspace ${suffix}`,
      slug: `e2e-pr-ws-${suffix}`,
    });
  });

  test.afterEach(async () => {
    await api.cleanup();
  });

  // The active PR is what a human looks for: which pull request is this issue's
  // work, and the history of how it got here.
  test("shows the active pull request and its history, and unlinks it", async ({ page }) => {
    const issue = await api.createIssue(workspace.id, `E2E PR issue ${suffix}`);
    await api.seedPullRequest(workspace.id, issue.id, { number: 41, title: `active ${suffix}` });
    await api.seedPullRequest(workspace.id, issue.id, {
      number: 40,
      title: `merged ${suffix}`,
      state: "merged",
    });

    await loginAsE2E(page, api);
    await page.goto(`/${workspace.slug}/issues/${issue.issue_key}`, {
      waitUntil: "domcontentloaded",
    });

    await expect(page.getByText(`active ${suffix}`)).toBeVisible({ timeout: 20_000 });
    // The history is collapsed by default; opening it reveals the older PR.
    await page.getByRole("button", { name: /History/ }).click();
    await expect(page.getByText(`merged ${suffix}`)).toBeVisible({ timeout: 10_000 });

    // Unlinking leaves a tombstone: the row stays, marked unlinked, and the
    // issue no longer counts it as active.
    await page.getByRole("button", { name: "unlink" }).first().click();
    await expect(page.getByText("unlinked").first()).toBeVisible({ timeout: 10_000 });
  });

  test("shows a pull request badge on the board card", async ({ page }) => {
    const issue = await api.createIssue(workspace.id, `E2E badge issue ${suffix}`);
    await api.seedPullRequest(workspace.id, issue.id, { number: 43, title: `badge ${suffix}` });

    await loginAsE2E(page, api);
    await page.goto(`/${workspace.slug}`, { waitUntil: "domcontentloaded" });

    await expect(page.getByText(`#43`)).toBeVisible({ timeout: 20_000 });
  });
});

test.describe("Issue pull requests · link lifecycle", () => {
  let api: TestApiClient;
  let workspace: TestWorkspace;
  let suffix: string;

  test.beforeEach(async () => {
    suffix = Date.now().toString(36);
    api = new TestApiClient();
    await api.login("E2E User");
    workspace = await api.seedWorkspace({
      name: `E2E PR Lifecycle ${suffix}`,
      slug: `e2e-pr-life-${suffix}`,
    });
  });

  test.afterEach(async () => {
    await api.cleanup();
  });

  // Unlinking is a tombstone, so it must be reversible: restore puts the PR back
  // as the issue's active one.
  test("restores a pull request that was unlinked", async ({ page }) => {
    const issue = await api.createIssue(workspace.id, `E2E restore issue ${suffix}`);
    await api.seedPullRequest(workspace.id, issue.id, { number: 51, title: `restore ${suffix}` });

    await loginAsE2E(page, api);
    await page.goto(`/${workspace.slug}/issues/${issue.issue_key}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByText(`restore ${suffix}`)).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "unlink" }).first().click();
    await expect(page.getByText("unlinked").first()).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "restore" }).first().click();
    await expect(page.getByText("unlinked")).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByRole("button", { name: "unlink" })).toBeVisible({ timeout: 10_000 });
  });

  // Re-linking needs the active slot back, so a restore that cannot have it says
  // so plainly instead of failing as a server error.
  test("explains a restore that cannot have the active slot", async ({ page }) => {
    const issue = await api.createIssue(workspace.id, `E2E conflict issue ${suffix}`);
    await api.seedPullRequest(workspace.id, issue.id, { number: 52, title: `holding ${suffix}` });
    await api.seedPullRequest(workspace.id, issue.id, {
      number: 53,
      title: `unlinked ${suffix}`,
      suppressed: true,
    });

    await loginAsE2E(page, api);
    await page.goto(`/${workspace.slug}/issues/${issue.issue_key}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByText(`holding ${suffix}`)).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "restore" }).first().click();
    await expect(page.getByText("已有活跃 PR")).toBeVisible({ timeout: 10_000 });
    // And the row it refused to restore is still unlinked.
    await expect(page.getByText("unlinked").first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Issue pull requests · link form", () => {
  let api: TestApiClient;
  let workspace: TestWorkspace;
  let suffix: string;

  test.beforeEach(async () => {
    suffix = Date.now().toString(36);
    api = new TestApiClient();
    await api.login("E2E User");
    workspace = await api.seedWorkspace({
      name: `E2E PR Form ${suffix}`,
      slug: `e2e-pr-form-${suffix}`,
    });
  });

  test.afterEach(async () => {
    await api.cleanup();
  });

  // A refused link must leave what the user typed where it was: the refusal is
  // usually about the PR, not about the keystrokes.
  test("keeps the pasted reference when the link is refused", async ({ page }) => {
    const issue = await api.createIssue(workspace.id, `E2E form issue ${suffix}`);

    await loginAsE2E(page, api);
    await page.goto(`/${workspace.slug}/issues/${issue.issue_key}`, {
      waitUntil: "domcontentloaded",
    });

    const input = page.getByPlaceholder(/Link a pull request/);
    await input.fill("not-a-pull-request");
    await page.getByRole("button", { name: "Link", exact: true }).click();

    await expect(page.getByText(/expected a pull request URL or number/)).toBeVisible({
      timeout: 10_000,
    });
    await expect(input).toHaveValue("not-a-pull-request", { timeout: 10_000 });
  });
});

// Who is on an issue, in two axes: one person accountable (Assignee) and the
// agents doing the work (Agents). Both are edited where the issue is read —
// the board card only ever shows them, because a card is a drag handle.
test.describe("Issue assignment", () => {
  let api: TestApiClient;
  let workspace: TestWorkspace;
  let daemon: TestDaemon;
  let user: TestUser;
  let suffix: string;

  test.beforeEach(async () => {
    suffix = Date.now().toString(36);
    api = new TestApiClient();
    user = await api.login("E2E User");
    workspace = await api.seedWorkspace({
      name: `E2E Assign ${suffix}`,
      slug: `e2e-assign-${suffix}`,
    });
    daemon = await api.seedDaemon({ name: `E2E Assign Mac ${suffix}` });
  });

  test.afterEach(async () => {
    await api.cleanup();
  });

  const newAgent = (name: string, enabled?: boolean) =>
    api.createAgent(workspace.id, {
      name: `${name}-${suffix}`,
      daemon_id: daemon.id,
      provider: "claude",
      enabled,
    });

  test("assigns and unassigns an agent from the issue page", async ({ page }) => {
    const agent = await newAgent("planner");
    const issue = await api.createIssue(workspace.id, `Assign target ${suffix}`);

    await loginAsE2E(page, api);
    await page.goto(`/${workspace.slug}/issues/${issue.issue_key}`, {
      waitUntil: "domcontentloaded",
    });

    const agentsRow = page.getByRole("button", { name: /^Agents:/ });
    await expect(agentsRow).toContainText("No agents", { timeout: 20_000 });

    await agentsRow.click();
    await page.getByRole("menuitemcheckbox", { name: agent.name }).click();
    // The menu stays open for the next toggle; closing it is what commits.
    await page.keyboard.press("Escape");

    await expect(agentsRow).toContainText(agent.name, { timeout: 10_000 });

    // Reloaded, not just re-rendered: the assignment came back from the server.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: /^Agents:/ })).toContainText(
      agent.name,
      { timeout: 20_000 },
    );

    // And it can be taken off again. The clear row is a plain menu item — it
    // clears the set rather than toggling a member of it.
    await page.getByRole("button", { name: /^Agents:/ }).click();
    await page.getByRole("menuitem", { name: "No agents" }).click();
    await expect(page.getByRole("button", { name: /^Agents:/ })).toContainText(
      "No agents",
      { timeout: 10_000 },
    );
  });

  test("lists a disabled agent but will not pick it", async ({ page }) => {
    const disabled = await newAgent("sleeper", false);
    const issue = await api.createIssue(workspace.id, `Disabled agent ${suffix}`);

    await loginAsE2E(page, api);
    await page.goto(`/${workspace.slug}/issues/${issue.issue_key}`, {
      waitUntil: "domcontentloaded",
    });

    await page.getByRole("button", { name: /^Agents:/ }).click();
    const row = page.getByRole("menuitemcheckbox", { name: disabled.name });
    // Present, with the reason inline — hiding an agent that exists reads as
    // "where did it go".
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row).toHaveAttribute("data-disabled", "");
    await expect(row).toContainText("disabled");
  });

  test("shows the accountable person and lets them be unassigned", async ({ page }) => {
    const issue = await api.createIssue(workspace.id, `Owner ${suffix}`);

    await loginAsE2E(page, api);
    await page.goto(`/${workspace.slug}/issues/${issue.issue_key}`, {
      waitUntil: "domcontentloaded",
    });

    // A new issue is owned by whoever opened it, so "my issues" has an answer
    // from the first second.
    const assigneeRow = page.getByRole("button", { name: /^Assignee:/ });
    await expect(assigneeRow).toContainText(user?.login ?? "", { timeout: 20_000 });

    await assigneeRow.click();
    await page.getByRole("menuitemradio", { name: "Unassigned" }).click();
    await expect(page.getByRole("button", { name: /^Assignee:/ })).toContainText(
      "Unassigned",
      { timeout: 10_000 },
    );
  });

  test("draws an avatar per agent on the board card, and none when unassigned", async ({
    page,
  }) => {
    const agent = await newAgent("reviewer");
    const assigned = await api.createIssue(workspace.id, `Card agents ${suffix}`);
    const bare = await api.createIssue(workspace.id, `Card bare ${suffix}`);
    await api.assignAgents(workspace.id, assigned.issue_key, [agent.id]);

    await loginAsE2E(page, api);
    await page.goto(`/${workspace.slug}`, { waitUntil: "domcontentloaded" });

    await expect(page.getByText(assigned.title)).toBeVisible({ timeout: 20_000 });
    // The monogram carries the name, which the old joined string only did as
    // text — and the card for the unassigned issue carries no avatar at all.
    await expect(page.getByRole("img", { name: agent.name })).toHaveCount(1);
    expect(bare.title).not.toEqual(assigned.title);
  });

  test("drops an agent from the issue when the agent is deleted", async ({ page }) => {
    const agent = await newAgent("temp");
    const issue = await api.createIssue(workspace.id, `Deleted agent ${suffix}`);
    await api.assignAgents(workspace.id, issue.issue_key, [agent.id]);

    await loginAsE2E(page, api);
    await page.goto(`/${workspace.slug}/issues/${issue.issue_key}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByRole("button", { name: /^Agents:/ })).toContainText(
      agent.name,
      { timeout: 20_000 },
    );

    await api.removeAgent(workspace.id, agent.id);
    await page.reload({ waitUntil: "domcontentloaded" });

    // The cascade took the row, and the page still renders: no dangling name,
    // no error screen.
    await expect(page.getByRole("button", { name: /^Agents:/ })).toContainText(
      "No agents",
      { timeout: 20_000 },
    );
    await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  });
});
