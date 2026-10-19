import { test } from "node:test";
import assert from "node:assert/strict";
import {
  activeIssues,
  agentRoster,
  agentSummary,
  isOpenIssue,
  issueMix,
  landedIssues,
  overviewStats,
  repoLabel,
  repoUrl,
  weeklyCreated,
} from "./overview.ts";

// The overview is a view of rows the board and the roster already own. What it
// decides — which statuses count, what is in flight, how the week's intake
// split across days, which agents are enabled — is here, away from the
// rendering, because those are the rules a reader would ask about.

const issue = (
  status,
  updated_at = "2026-10-17T00:00:00.000Z",
  created_at = updated_at,
) => ({
  id: `${status}-${updated_at}-${created_at}`,
  status,
  updated_at,
  created_at,
});

const agent = (
  name,
  { enabled = true, running = 0, queued = 0, daemon = "online" } = {},
) => ({
  id: name,
  name,
  enabled,
  running_count: running,
  queued_count: queued,
  runtime: { daemon_id: "daemon-1", daemon_status: daemon },
});

test("done and cancelled are the only statuses that close an issue", () => {
  assert.equal(isOpenIssue(issue("backlog")), true);
  assert.equal(isOpenIssue(issue("in_progress")), true);
  assert.equal(isOpenIssue(issue("blocked")), true);
  assert.equal(isOpenIssue(issue("done")), false);
  assert.equal(isOpenIssue(issue("cancelled")), false);
});

test("the stat strip counts open work and the three active states", () => {
  const stats = overviewStats([
    issue("backlog"),
    issue("todo"),
    issue("in_progress"),
    issue("in_progress"),
    issue("in_review"),
    issue("blocked"),
    issue("done"),
    issue("cancelled"),
  ]);
  assert.deepEqual(stats, { open: 6, inProgress: 2, inReview: 1, blocked: 1 });
});

test("the weekly intake counts creations by local day, oldest first", () => {
  const now = new Date(2026, 9, 19, 12, 0, 0);
  const at = (daysAgo, hour = 12) =>
    new Date(2026, 9, 19 - daysAgo, hour, 0, 0).toISOString();

  const { buckets, total } = weeklyCreated(
    [
      issue("backlog", at(0), at(0)),
      issue("done", at(0), at(0)),
      issue("backlog", at(0, 23), at(0, 23)),
      issue("todo", at(1), at(1)),
      issue("blocked", at(6), at(6)),
      issue("backlog", at(7), at(7)),
    ],
    now,
  );

  // Index 0 is six days ago; index 6 is today. The seventh day falls outside.
  assert.deepEqual(buckets, [1, 0, 0, 0, 0, 1, 3]);
  assert.equal(total, 5);
});

test("the issue mix keeps the four open buckets and leaves closed work out", () => {
  const mix = issueMix([
    issue("backlog"),
    issue("todo"),
    issue("in_progress"),
    issue("in_progress"),
    issue("in_review"),
    issue("blocked"),
    issue("done"),
    issue("cancelled"),
  ]);
  assert.deepEqual(mix, {
    queued: 2,
    inProgress: 2,
    inReview: 1,
    blocked: 1,
    open: 6,
  });
});

test("recently landed is done inside the window, newest first, capped", () => {
  const now = new Date(2026, 9, 19, 12, 0, 0);
  const daysAgo = (days) =>
    new Date(now.getTime() - days * 86_400_000).toISOString();

  const landed = landedIssues(
    [
      issue("done", daysAgo(1)),
      issue("done", daysAgo(3)),
      issue("done", daysAgo(10)),
      issue("cancelled", daysAgo(1)),
      issue("in_progress", daysAgo(1)),
      issue("done", daysAgo(2)),
    ],
    { now, limit: 2 },
  );
  assert.deepEqual(
    landed.map((i) => i.updated_at),
    [daysAgo(1), daysAgo(2)],
  );

  // The window is seven days, not "the last two rows": ten days old is out.
  assert.equal(
    landedIssues(
      [
        issue("done", daysAgo(1)),
        issue("done", daysAgo(3)),
        issue("done", daysAgo(10)),
      ],
      { now },
    ).length,
    2,
  );
  assert.equal(landedIssues([issue("done", daysAgo(10))], { now }).length, 0);
});

test("active issues are the three work states, newest first, capped", () => {
  const issues = [
    issue("backlog", "2026-10-17T09:00:00.000Z"),
    issue("in_progress", "2026-10-17T08:00:00.000Z"),
    issue("in_review", "2026-10-17T10:00:00.000Z"),
    issue("blocked", "2026-10-17T07:00:00.000Z"),
    issue("done", "2026-10-17T11:00:00.000Z"),
    issue("cancelled", "2026-10-17T12:00:00.000Z"),
    issue("todo", "2026-10-17T13:00:00.000Z"),
  ];
  assert.deepEqual(
    activeIssues(issues).map((i) => i.status),
    ["in_review", "in_progress", "blocked"],
  );
  // The cap is applied after the sort, so it keeps the newest, not the first.
  assert.deepEqual(
    activeIssues(issues, 2).map((i) => i.status),
    ["in_review", "in_progress"],
  );
});

test("the agent roster is enabled agents, busiest first, ties by name", () => {
  const agents = [
    agent("delta", { running: 1 }),
    agent("alpha", { queued: 1 }),
    agent("charlie", { daemon: "offline" }),
    agent("bravo"),
    agent("echo", { enabled: false, running: 3 }),
    agent("foxtrot", { queued: 1 }),
  ];
  assert.deepEqual(
    agentRoster(agents).map((a) => a.name),
    ["delta", "alpha", "foxtrot", "bravo", "charlie"],
  );
  assert.deepEqual(
    agentRoster(agents, 3).map((a) => a.name),
    ["delta", "alpha", "foxtrot"],
  );
});

test("the agent summary counts enabled agents by status, busiest first", () => {
  const summary = agentSummary([
    agent("delta", { running: 1 }),
    agent("alpha", { queued: 1 }),
    agent("charlie", { daemon: "offline" }),
    agent("bravo"),
    agent("echo", { enabled: false, running: 3 }),
  ]);

  assert.deepEqual(summary, {
    enabled: 4,
    running: 1,
    queued: 1,
    idle: 1,
    offline: 1,
    statuses: ["running", "queued", "idle", "offline"],
  });
});

test("the repository label prefers the joined name and falls back to the split", () => {
  assert.equal(
    repoLabel({
      repo_full_name: "odyssey/orion",
      repo_owner: "odyssey",
      repo_name: "orion",
    }),
    "odyssey/orion",
  );
  assert.equal(
    repoLabel({ repo_full_name: "", repo_owner: "odyssey", repo_name: "orion" }),
    "odyssey/orion",
  );
  // A half-filled pair is not an address.
  assert.equal(
    repoLabel({ repo_full_name: "", repo_owner: "odyssey", repo_name: "" }),
    "",
  );
  assert.equal(
    repoLabel({ repo_full_name: "  ", repo_owner: " ", repo_name: " " }),
    "",
  );
});

test("a repository URL is built only when there is a repository", () => {
  assert.equal(
    repoUrl({
      repo_full_name: "odyssey/orion",
      repo_owner: "odyssey",
      repo_name: "orion",
    }),
    "https://github.com/odyssey/orion",
  );
  assert.equal(
    repoUrl({ repo_full_name: "", repo_owner: "", repo_name: "" }),
    null,
  );
});
