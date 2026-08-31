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

test("workspace list renders a card grid", () => {
  assert.match(list, /grid-cols-1/);
  assert.match(list, /StatusBadge/);
  assert.match(list, /timeAgo/);
  assert.doesNotMatch(list, /font-bold/);
  assert.doesNotMatch(list, /text-\[10px\]/);
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
