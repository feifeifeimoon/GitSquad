import { test } from "node:test";
import assert from "node:assert/strict";
import {
  agentStatus,
  agentStatusWithDaemon,
  daemonStatusOf,
  workloadDetail,
} from "./agent-status.ts";

/** Minimal agent shape: only the fields status derivation reads. */
const agent = (over = {}) => ({
  running_count: 0,
  queued_count: 0,
  runtime: { daemon_id: "d1", daemon_status: "online" },
  ...over,
});

test("a live daemon with no work is idle", () => {
  assert.equal(agentStatus(agent()), "idle");
});

test("in-flight work reads as running, queued work as queued", () => {
  assert.equal(agentStatus(agent({ running_count: 1 })), "running");
  assert.equal(agentStatus(agent({ queued_count: 2 })), "queued");
});

test("running outranks queued", () => {
  assert.equal(agentStatus(agent({ running_count: 1, queued_count: 3 })), "running");
});

test("a disconnected daemon makes its agents offline, whatever they were doing", () => {
  assert.equal(
    agentStatus(
      agent({
        running_count: 1,
        runtime: { daemon_id: "d1", daemon_status: "offline" },
      }),
    ),
    "offline",
  );
});

test("an agent with no runtime bound is offline", () => {
  const bound = agent();
  bound.runtime.daemon_id = null;
  assert.equal(agentStatus(bound), "offline");
  assert.equal(agentStatus(agent({ runtime: null })), "offline");
});

// The client reads a status the server already resolved, so the only thing it
// may do with an unexpected value is refuse to call it online. A stale 'online'
// row is the server's problem — see service.liveStatus.
test("only the exact string online counts as reachable", () => {
  assert.equal(daemonStatusOf("online"), "online");
  assert.equal(daemonStatusOf("offline"), "offline");
  assert.equal(daemonStatusOf(undefined), "offline");
  assert.equal(daemonStatusOf(null), "offline");
  assert.equal(daemonStatusOf(""), "offline");
  assert.equal(daemonStatusOf("unstable"), "offline");
});

// The daemon detail page knows the machine's liveness once for the whole page,
// so its agents are classified from that instead of a per-agent runtime.
test("agentStatusWithDaemon folds the daemon state into the workload", () => {
  const idle = { running_count: 0, queued_count: 0 };
  assert.equal(agentStatusWithDaemon("online", idle), "idle");
  assert.equal(agentStatusWithDaemon("online", { running_count: 2, queued_count: 0 }), "running");
  assert.equal(agentStatusWithDaemon("online", { running_count: 0, queued_count: 3 }), "queued");
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
