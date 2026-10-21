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

    // The PR list shows the completed review and the linked issue.
    await page.goto(`/${workspace.slug}/pull-requests`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByText("Add retry budget")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("Reviewed", { exact: true })).toBeVisible();
    await expect(page.getByText("2 findings")).toBeVisible();
    await expect(page.getByText("E2E-1")).toBeVisible();

    // The issue feed carries the same review once the PR is linked.
    await page.goto(`/${workspace.slug}/issues/${issue.issue_key}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByText("Reviewed", { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("2 findings")).toBeVisible();

    // Review now queues a fresh run. No real daemon runs in E2E, so it stays
    // queued; the button disables while it is in flight.
    await page.goto(`/${workspace.slug}/pull-requests`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByRole("button", { name: "Review now" }).click();
    await expect(page.getByText("Review queued.")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("Queued", { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByRole("button", { name: "Review now" }),
    ).toBeDisabled();
  });
});
