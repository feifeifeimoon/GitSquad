import { test } from "node:test";
import assert from "node:assert/strict";
import {
  activeAgentFilters,
  agentFilterCounts,
  filterAgents,
  NO_AGENT_FILTERS,
} from "./agent-filters.ts";

const online = { daemon_id: "d1", daemon_name: "studio-pc", daemon_status: "online" };
const down = { daemon_id: "d2", daemon_name: "mac-mini", daemon_status: "offline" };

const roster = [
  { name: "planner", description: "Turns an issue into a plan", running_count: 1, queued_count: 0, runtime: online },
  { name: "reviewer", description: "Reads diffs", running_count: 0, queued_count: 2, runtime: down },
  { name: "scout", description: "Watches the queue", running_count: 0, queued_count: 0, runtime: online },
  { name: "archivist", description: "Keeps the log", running_count: 0, queued_count: 0, runtime: down, workspace_name: "Atlas" },
];

test("counts both axes over the whole roster", () => {
  const counts = agentFilterCounts(roster);
  assert.deepEqual(counts.availability, { online: 2, offline: 2 });
  assert.deepEqual(counts.workload, { working: 1, queued: 1, idle: 2 });
});

test("an empty roster counts zeroes, not missing keys", () => {
  assert.deepEqual(agentFilterCounts([]), {
    availability: { online: 0, offline: 0 },
    workload: { working: 0, queued: 0, idle: 0 },
  });
});

test("no filters keeps the roster in the order it arrived", () => {
  assert.deepEqual(
    filterAgents(roster, NO_AGENT_FILTERS).map((a) => a.name),
    ["planner", "reviewer", "scout", "archivist"],
  );
});

test("availability narrows to the machine being reachable", () => {
  assert.deepEqual(
    filterAgents(roster, { ...NO_AGENT_FILTERS, availability: "offline" }).map((a) => a.name),
    ["reviewer", "archivist"],
  );
});

test("workload narrows to what is queued, whatever the machine is doing", () => {
  assert.deepEqual(
    filterAgents(roster, { ...NO_AGENT_FILTERS, workload: "queued" }).map((a) => a.name),
    ["reviewer"],
  );
});

test("the two facets combine with AND", () => {
  assert.deepEqual(
    filterAgents(roster, { ...NO_AGENT_FILTERS, availability: "offline", workload: "idle" }).map(
      (a) => a.name,
    ),
    ["archivist"],
  );
});

test("search reads the name, the description and the workspace", () => {
  assert.deepEqual(
    filterAgents(roster, { ...NO_AGENT_FILTERS, search: "queue" }).map((a) => a.name),
    ["scout"],
  );
  assert.deepEqual(
    filterAgents(roster, { ...NO_AGENT_FILTERS, search: "atlas" }).map((a) => a.name),
    ["archivist"],
  );
  assert.deepEqual(
    filterAgents(roster, { ...NO_AGENT_FILTERS, search: "  PLAN  " }).map((a) => a.name),
    ["planner"],
  );
});

test("search and a facet stack", () => {
  assert.deepEqual(
    filterAgents(roster, { ...NO_AGENT_FILTERS, search: "diffs", availability: "online" }),
    [],
  );
});

test("the Filter button counts facets, never the search box", () => {
  assert.equal(activeAgentFilters(NO_AGENT_FILTERS), 0);
  assert.equal(
    activeAgentFilters({ ...NO_AGENT_FILTERS, search: "anything", workload: "idle" }),
    1,
  );
  assert.equal(
    activeAgentFilters({ search: "", availability: "offline", workload: "queued" }),
    2,
  );
});
