import { test } from "node:test";
import assert from "node:assert/strict";
import {
  agentStatus,
  agentStatusWithDaemon,
  daemonStatus,
  workloadDetail,
  DAEMON_STALE_MS,
} from "./agent-status.ts";

const NOW = Date.parse("2026-09-14T12:00:00Z");
const seenAgo = (ms) => new Date(NOW - ms).toISOString();

/** Minimal agent shape: only the fields status derivation reads. */
const agent = (over = {}) => ({
  running_count: 0,
  queued_count: 0,
  runtime: { daemon_id: "d1", daemon_status: "online", last_seen_at: seenAgo(5_000) },
  ...over,
});

test("a live daemon with no work is idle", () => {
  assert.equal(agentStatus(agent(), NOW), "idle");
});

test("in-flight work reads as running, queued work as queued", () => {
  assert.equal(agentStatus(agent({ running_count: 1 }), NOW), "running");
  assert.equal(agentStatus(agent({ queued_count: 2 }), NOW), "queued");
});

test("running outranks queued", () => {
  assert.equal(
    agentStatus(agent({ running_count: 1, queued_count: 3 }), NOW),
    "running",
  );
});

test("a disconnected daemon makes its agents offline", () => {
  assert.equal(
    agentStatus(agent({ running_count: 1, runtime: { daemon_id: "d1", daemon_status: "offline", last_seen_at: seenAgo(1_000) } }), NOW),
    "offline",
  );
});

test("an agent with no runtime bound is offline", () => {
  const bound = agent();
  bound.runtime.daemon_id = null;
  assert.equal(agentStatus(bound, NOW), "offline");
  assert.equal(agentStatus(agent({ runtime: null }), NOW), "offline");
});

// A daemon can hold a stale 'online' row after the server restarts without the
// socket close ever firing. Past the freshness window that row is not liveness.
test("a silent online daemon degrades to unstable, and outranks its task count", () => {
  const stale = {
    daemon_id: "d1",
    daemon_status: "online",
    last_seen_at: seenAgo(DAEMON_STALE_MS + 1),
  };
  assert.equal(agentStatus(agent({ runtime: stale }), NOW), "unstable");
  assert.equal(
    agentStatus(agent({ runtime: stale, running_count: 1 }), NOW),
    "unstable",
  );
});

test("a daemon is online only while its last heartbeat is fresh", () => {
  assert.equal(
    daemonStatus({ status: "online", last_seen_at: seenAgo(1_000) }, NOW),
    "online",
  );
  assert.equal(
    daemonStatus({ status: "online", last_seen_at: seenAgo(DAEMON_STALE_MS + 1) }, NOW),
    "unstable",
  );
  assert.equal(
    daemonStatus({ status: "offline", last_seen_at: seenAgo(1_000) }, NOW),
    "offline",
  );
  assert.equal(daemonStatus({ status: "online", last_seen_at: null }, NOW), "unstable");
});

// The daemon detail page knows the machine's liveness once for the whole page,
// so its agents are classified from that instead of a per-agent runtime.
test("agentStatusWithDaemon folds the daemon state into the workload", () => {
  const idle = { running_count: 0, queued_count: 0 };
  assert.equal(agentStatusWithDaemon("online", idle), "idle");
  assert.equal(agentStatusWithDaemon("online", { running_count: 2, queued_count: 0 }), "running");
  assert.equal(agentStatusWithDaemon("online", { running_count: 0, queued_count: 3 }), "queued");
  assert.equal(agentStatusWithDaemon("unstable", idle), "unstable");
  assert.equal(agentStatusWithDaemon("offline", idle), "offline");
  // Reachability wins: a busy agent on a machine that is gone is not "running".
  assert.equal(
    agentStatusWithDaemon("offline", { running_count: 1, queued_count: 0 }),
    "offline",
  );
});

test("workload detail names the issue, else counts, else nothing", () => {
  assert.equal(
    workloadDetail({
      running_count: 1,
      queued_count: 0,
      current_task: { issue_key: "GTS-7", issue_title: "Fix the thing" },
    }),
    "GTS-7: Fix the thing",
  );
  assert.equal(
    workloadDetail({ running_count: 2, queued_count: 0, current_task: null }),
    "2 tasks running",
  );
  assert.equal(
    workloadDetail({ running_count: 0, queued_count: 1, current_task: null }),
    "1 task queued",
  );
  assert.equal(
    workloadDetail({ running_count: 0, queued_count: 0, current_task: null }),
    null,
  );
});
