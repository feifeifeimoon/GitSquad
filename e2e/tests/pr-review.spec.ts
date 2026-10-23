import { test, expect } from "@playwright/test";
import {
  TestApiClient,
  type TestDaemon,
  type TestWorkspace,
} from "../fixtures";
import { loginAsE2E } from "../helpers";

test.describe("Pull request review", () => {
  let api: TestApiClient;
  let workspace: TestWorkspace;
  let daemon: TestDaemon;
  let suffix: string;

  test.beforeEach(async () => {
    suffix = Date.now().toString(36);
    api = new TestApiClient();
    await api.login("E2E User");
    workspace = await api.seedWorkspace({
      name: `E2E Review ${suffix}`,
      slug: `e2e-review-${suffix}`,
    });
    daemon = await api.seedDaemon({ name: `E2E Review Daemon ${suffix}` });
  });

  test.afterEach(async () => {
    await api.cleanup();
  });

  test("configures a reviewer, lists the review, and queues a manual review", async ({
    page,
  }) => {
    const agent = await api.createAgent(workspace.id, {
      name: `reviewer-${suffix}`,
      daemon_id: daemon.id,
      provider: "claude",
    });
    const issue = await api.createIssue(workspace.id, "E2E review issue");
    const pr = await api.seedPullRequest(workspace.id, issue.id, {
      number: 42,
      title: "Add retry budget",
      headSha: "sha-42",
      additions: 128,
      deletions: 34,
      changedFiles: 6,
    });
    await api.seedReview({
      workspaceId: workspace.id,
      pullRequestId: pr.id,
      agentId: agent.id,
      status: "completed",
      summary: "Looks good.",
      findings: 2,
      headSha: "sha-42",
    });

    await loginAsE2E(page, api);

    // Configure the reviewer in workspace settings.
    await page.goto(`/${workspace.slug}/settings`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByLabel("Enable PR review").check();
    await page.getByLabel("Reviewer agent").selectOption(agent.id);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved.")).toBeVisible({ timeout: 20_000 });

    // The list is for scanning: number, title, author and the review's verdict
    // on one line each.
    await page.goto(`/${workspace.slug}/pull-requests`, {
      waitUntil: "domcontentloaded",
    });
    const row = page.getByRole("listitem").filter({ hasText: "#42" });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row.getByText("Add retry budget")).toBeVisible();
    await expect(row.getByText("Reviewed", { exact: true })).toBeVisible();

    // The peek carries the rest — and the first row is selected on arrival, so
    // the pane is never empty beside a list.
    const peek = page.getByRole("complementary", { name: "Pull request" });
    await expect(peek.getByText("Add retry budget")).toBeVisible();
    // The branch name happens to contain the issue key; target the link.
    await expect(peek.getByRole("link", { name: /E2E-1/ })).toBeVisible();
    await expect(peek.getByText("2 findings")).toBeVisible();
    await expect(peek.getByText("Looks good.")).toBeVisible();
    await expect(peek.getByText("+128")).toBeVisible();
    await expect(peek.getByText("−34")).toBeVisible();

    // The issue feed carries the same review once the PR is linked.
    await page.goto(`/${workspace.slug}/issues/${issue.issue_key}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByText("Reviewed", { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("2 findings")).toBeVisible();

    // Review now lives in the peek. No real daemon runs in E2E, so the run
    // stays queued and the button says so while it waits.
    await page.goto(`/${workspace.slug}/pull-requests`, {
      waitUntil: "domcontentloaded",
    });
    const peekAgain = page.getByRole("complementary", { name: "Pull request" });
    await peekAgain.getByRole("button", { name: "Review now" }).click();
    await expect(page.getByText("Review queued.")).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      peekAgain.getByRole("button", { name: "Queued" }),
    ).toBeDisabled({ timeout: 20_000 });
    // A queued review has not looked at anything yet: the finding count is
    // written when the run reports, so "0 findings" here would be a promise.
    await expect(peekAgain.getByText(/findings/)).toHaveCount(0);
  });

  test("selecting a row moves the peek, and Closed includes merged", async ({
    page,
  }) => {
    const first = await api.createIssue(workspace.id, "First issue");
    const second = await api.createIssue(workspace.id, "Second issue");
    await api.seedPullRequest(workspace.id, first.id, {
      number: 7,
      title: "Open a door",
    });
    await api.seedPullRequest(workspace.id, second.id, {
      number: 8,
      title: "Merge a door",
      state: "merged",
    });

    await loginAsE2E(page, api);
    await page.goto(`/${workspace.slug}/pull-requests`, {
      waitUntil: "domcontentloaded",
    });

    const peek = page.getByRole("complementary", { name: "Pull request" });
    await expect(peek.getByText("Open a door")).toBeVisible({ timeout: 20_000 });

    // The merged PR is not in the Open tab, and is in Closed.
    const mergedRow = page.getByRole("listitem").filter({ hasText: "#8" });
    await expect(mergedRow).toHaveCount(0);
    await page.getByRole("button", { name: /^Closed/ }).click();
    await expect(mergedRow).toBeVisible();

    // Selecting it moves the pane.
    await mergedRow.click();
    await expect(peek.getByText("Merge a door")).toBeVisible();
    await expect(peek.getByText("Merged", { exact: true })).toBeVisible();
  });
});
