import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const list = readFileSync(
  new URL("../app/console/workspaces/page.tsx", import.meta.url),
  "utf8",
);
const shell = readFileSync(
  new URL("../app/console/layout.tsx", import.meta.url),
  "utf8",
);
const badge = readFileSync(
  new URL("../components/ui/status-badge.tsx", import.meta.url),
  "utf8",
);
const time = readFileSync(
  new URL("./time.ts", import.meta.url),
  "utf8",
);

test("workspace list renders a card grid by default", () => {
  assert.match(list, /grid-cols-1/);
  assert.match(list, /StatusBadge/);
  assert.match(list, /timeAgo/);
  assert.doesNotMatch(list, /font-bold/);
  assert.doesNotMatch(list, /text-\[10px\]/);
});

test("workspace list offers a cards/list view switcher persisted to localStorage", () => {
  assert.match(list, /ViewSwitcher/);
  assert.match(list, /LayoutGrid/);
  assert.match(list, /localStorage/);
  assert.match(list, /"Cards"/);
  assert.match(list, /"List"/);
  assert.match(list, /aria-label/);
});

test("workspace list supports search and a table list view", () => {
  assert.match(list, /Search workspaces…/);
  assert.match(list, /<table/);
  assert.match(list, /WorkspaceTable/);
  assert.match(list, /Repository/);
  assert.match(list, /Created/);
});

test("console shell swaps GitSquad for the active workspace", () => {
  assert.match(shell, /GitSquad/);
  assert.match(shell, /usePathname/);
  assert.match(shell, /workspace\.name/);
});

test("status badge defines three states", () => {
  assert.match(badge, /active/);
  assert.match(badge, /degraded/);
  assert.match(badge, /archived/);
});

test("shared time util formats relative time", () => {
  assert.match(time, /timeAgo/);
  assert.match(time, /never/);
  assert.match(time, /ago/);
});
