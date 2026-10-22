import { test } from "node:test";
import assert from "node:assert/strict";
import { agentPresence, offlineDaemons } from "./agent-presence.ts";

const online = { daemon_id: "d1", daemon_name: "mac-mini", daemon_status: "online" };
const offline = { daemon_id: "d1", daemon_name: "mac-mini", daemon_status: "offline" };

function agent(over = {}) {
  return { name: "planner", running_count: 0, queued_count: 0, runtime: online, ...over };
}

test("a reachable agent with a task running is online and working", () => {
  assert.deepEqual(agentPresence(agent({ running_count: 1 })), {
    availability: "online",
    workload: "working",
  });
});

test("a reachable agent with nothing running but a queue is online and queued", () => {
  assert.deepEqual(agentPresence(agent({ queued_count: 2 })), {
    availability: "online",
    workload: "queued",
  });
});

test("a reachable agent with nothing on its plate is online and idle", () => {
  assert.deepEqual(agentPresence(agent()), {
    availability: "online",
    workload: "idle",
  });
});

test("queued work survives an offline machine — the state worth surfacing", () => {
  assert.deepEqual(agentPresence(agent({ runtime: offline, queued_count: 2 })), {
    availability: "offline",
    workload: "queued",
  });
});

test("an agent with no runtime is offline, not idle", () => {
  assert.deepEqual(agentPresence(agent({ runtime: null })), {
    availability: "offline",
    workload: "idle",
  });
});

test("a runtime with no daemon is offline — it has nowhere to run", () => {
  assert.deepEqual(
    agentPresence(agent({ runtime: { daemon_id: null, daemon_status: "online" } })),
    { availability: "offline", workload: "idle" },
  );
});

test("a daemon that is not sending heartbeats reads offline even mid-run", () => {
  assert.deepEqual(agentPresence(agent({ runtime: offline, running_count: 1 })), {
    availability: "offline",
    workload: "working",
  });
});

test("one offline daemon becomes one banner summing its enabled agents", () => {
  const banners = offlineDaemons([
    agent({ name: "planner", runtime: offline, queued_count: 2 }),
    agent({ name: "reviewer", runtime: offline, queued_count: 0 }),
    agent({ name: "archivist", runtime: offline, queued_count: 5, enabled: false }),
    agent({ name: "scout", runtime: online }),
  ]);

  assert.equal(banners.length, 1);
  assert.equal(banners[0].id, "d1");
  assert.equal(banners[0].name, "mac-mini");
  assert.deepEqual(banners[0].agents, ["planner", "reviewer"]);
  assert.equal(banners[0].queued, 2);
});

test("no offline daemon, no banner", () => {
  assert.deepEqual(offlineDaemons([agent(), agent({ name: "scout" })]), []);
});

test("two down machines are ranked by what is waiting on them", () => {
  const banners = offlineDaemons([
    agent({ name: "a", runtime: { daemon_id: "d1", daemon_name: "one", daemon_status: "offline" }, queued_count: 1 }),
    agent({ name: "b", runtime: { daemon_id: "d2", daemon_name: "two", daemon_status: "offline" }, queued_count: 4 }),
  ]);
  assert.deepEqual(
    banners.map((b) => [b.name, b.queued]),
    [
      ["two", 4],
      ["one", 1],
    ],
  );
});
