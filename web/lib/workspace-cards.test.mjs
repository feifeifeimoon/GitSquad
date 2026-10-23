import { test } from "node:test";
import assert from "node:assert/strict";
import { agentChips, workspaceCards } from "./workspace-cards.ts";

const workspace = (id, over = {}) => ({
  id,
  slug: id,
  name: id,
  status: "active",
  avatar_url: "",
  repo_full_name: `owner/${id}`,
  repo_owner: "owner",
  repo_name: id,
  repo_private: false,
  created_at: "2026-10-20T00:00:00.000Z",
  last_commit_message: "",
  last_commit_author: "",
  last_commit_at: "",
  ...over,
});

const issue = (workspaceId, status, updated = "2026-10-22T00:00:00.000Z") => ({
  id: `${workspaceId}-${status}-${updated}`,
  workspace_slug: workspaceId,
  status,
  updated_at: updated,
});

const agent = (workspaceId, name, over = {}) => ({
  id: `${workspaceId}-${name}`,
  workspace_slug: workspaceId,
  name,
  enabled: true,
  running_count: 0,
  queued_count: 0,
  runtime: { daemon_id: "d1", daemon_name: "mac-mini", daemon_status: "online" },
  ...over,
});

test("one card per workspace, with its own issues and agents", () => {
  const cards = workspaceCards(
    [workspace("a"), workspace("b")],
    [issue("a", "todo"), issue("a", "in_progress"), issue("b", "blocked")],
    [agent("a", "planner", { running_count: 1 })],
  );

  assert.equal(cards.length, 2);
  assert.deepEqual(cards[0].mix, {
    queued: 1,
    inProgress: 1,
    inReview: 0,
    blocked: 0,
    open: 2,
  });
  assert.equal(cards[0].agents.enabled, 1);
  assert.equal(cards[1].mix.blocked, 1);
  assert.equal(cards[1].agents.enabled, 0);
});

test("a workspace with nothing in it still gets a card", () => {
  const cards = workspaceCards([workspace("quiet")], [], []);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].mix.open, 0);
  assert.deepEqual(cards[0].heads, []);
  assert.equal(cards[0].offline, null);
});

test("heads are the enabled agents, busiest first, three at most", () => {
  const cards = workspaceCards(
    [workspace("a")],
    [],
    [
      agent("a", "idle-1"),
      agent("a", "working", { running_count: 1 }),
      agent("a", "idle-2"),
      agent("a", "queued", { queued_count: 1 }),
      agent("a", "disabled", { enabled: false }),
    ],
  );

  assert.deepEqual(
    cards[0].heads.map((a) => a.name),
    ["working", "queued", "idle-1"],
  );
});

test("a downed machine is one line naming it and what is waiting", () => {
  const offline = {
    daemon_id: "d2",
    daemon_name: "older-mac",
    daemon_status: "offline",
  };
  const cards = workspaceCards(
    [workspace("a")],
    [],
    [
      agent("a", "planner", { runtime: offline, queued_count: 2 }),
      agent("a", "reviewer", { runtime: offline }),
      agent("a", "parked", { runtime: offline, enabled: false, queued_count: 5 }),
    ],
  );

  assert.deepEqual(cards[0].offline, { name: "older-mac", queued: 2 });
});

test("a reachable machine is not an offline line", () => {
  const cards = workspaceCards([workspace("a")], [], [agent("a", "planner")]);
  assert.equal(cards[0].offline, null);
});

test("last activity is the newest issue, falling back to the workspace", () => {
  const cards = workspaceCards(
    [workspace("a", { last_commit_at: "2026-10-21T00:00:00.000Z" }), workspace("b")],
    [issue("a", "todo", "2026-10-22T12:00:00.000Z")],
    [],
  );
  assert.equal(cards[0].lastActiveAt, "2026-10-22T12:00:00.000Z");
  // No commits and no issues: the workspace's own creation is the last thing
  // that happened.
  assert.equal(cards[1].lastActiveAt, "2026-10-20T00:00:00.000Z");
});

test("chips name the states that have somebody in them", () => {
  const chips = agentChips({
    enabled: 4,
    running: 1,
    queued: 1,
    idle: 2,
    offline: 0,
    statuses: [],
  });
  assert.deepEqual(chips, [
    { key: "working", label: "working", count: 1 },
    { key: "queued", label: "queued", count: 1 },
    { key: "idle", label: "idle", count: 2 },
  ]);
});

test("an empty or offline-only team has no chips", () => {
  assert.deepEqual(
    agentChips({ enabled: 0, running: 0, queued: 0, idle: 0, offline: 0, statuses: [] }),
    [],
  );
  // Offline agents are the card's amber machine line, not a chip.
  assert.deepEqual(
    agentChips({ enabled: 1, running: 0, queued: 0, idle: 0, offline: 1, statuses: [] }),
    [],
  );
});
