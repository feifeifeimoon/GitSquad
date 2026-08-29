import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const list = readFileSync(
  new URL("../app/console/workspaces/page.tsx", import.meta.url),
  "utf8",
);
const layout = readFileSync(
  new URL("../app/console/workspaces/[id]/layout.tsx", import.meta.url),
  "utf8",
);
const badge = readFileSync(
  new URL("../components/ui/status-badge.tsx", import.meta.url),
  "utf8",
);

test("workspace list is a searchable, sortable table", () => {
  assert.match(list, /Search/);
  assert.match(list, /Search workspaces/);
  assert.match(list, /toggleSort/);
  assert.match(list, /<table/);
  assert.match(list, /StatusBadge/);
  assert.doesNotMatch(list, /font-bold/);
  assert.doesNotMatch(list, /text-\[10px\]/);
});

test("workspace detail has header and tab navigation", () => {
  assert.match(layout, /All workspaces/);
  assert.match(layout, /StatusBadge/);
  assert.match(layout, /Overview/);
  assert.match(layout, /Issues/);
  assert.match(layout, /usePathname/);
});

test("status badge defines three states", () => {
  assert.match(badge, /active/);
  assert.match(badge, /degraded/);
  assert.match(badge, /archived/);
});
