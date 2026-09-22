import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const list = readFileSync(
  new URL("../app/(app)/workspaces/page.tsx", import.meta.url),
  "utf8",
);
const shell = readFileSync(
  new URL("../app/(app)/layout.tsx", import.meta.url),
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
const palette = readFileSync(
  new URL("../components/command-palette.tsx", import.meta.url),
  "utf8",
);
const command = readFileSync(
  new URL("../components/ui/command.tsx", import.meta.url),
  "utf8",
);
const sonner = readFileSync(
  new URL("../components/ui/sonner.tsx", import.meta.url),
  "utf8",
);
const viewSwitcher = readFileSync(
  new URL("../components/view-switcher.tsx", import.meta.url),
  "utf8",
);
const nav = readFileSync(new URL("./nav.ts", import.meta.url), "utf8");
const sidebarNav = readFileSync(
  new URL("../components/sidebar-nav.tsx", import.meta.url),
  "utf8",
);
const searchTrigger = readFileSync(
  new URL("../components/nav-search-trigger.tsx", import.meta.url),
  "utf8",
);

test("workspace list renders a card grid by default", () => {
  assert.match(list, /grid-cols-1/);
  assert.match(list, /StatusBadge/);
  assert.match(list, /TimeAgo/);
  assert.doesNotMatch(list, /font-bold/);
  assert.doesNotMatch(list, /text-\[10px\]/);
});

test("workspace list shows a skeleton while loading", () => {
  assert.match(list, /Skeleton/);
});

test("workspace list offers a cards/list view switcher persisted to localStorage", () => {
  // The toggle and its persistence live in one component now, shared with the
  // daemon list; the page only wires it up.
  assert.match(list, /ViewSwitcher/);
  assert.match(list, /useViewMode/);
  assert.match(viewSwitcher, /LayoutGrid/);
  assert.match(viewSwitcher, /localStorage/);
  assert.match(viewSwitcher, /"Cards"/);
  assert.match(viewSwitcher, /"List"/);
  assert.match(viewSwitcher, /aria-label/);
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

test("console shell mounts the command palette", () => {
  assert.match(shell, /CommandPalette/);
});

test("command palette opens with Cmd/Ctrl+K and searches workspaces", () => {
  assert.match(palette, /metaKey/);
  assert.match(palette, /ctrlKey/);
  assert.match(palette, /CommandDialog/);
  assert.match(palette, /CommandInput/);
  assert.match(palette, /get<Workspace\[\]>/);
});

test("sidebar has a search entry that opens the palette", () => {
  // The trigger moved into its own component when the list became links — it
  // opens a modal rather than navigating, so it does not belong among the
  // destinations. The shell still owns the open state.
  assert.match(shell, /setPaletteOpen/);
  assert.match(searchTrigger, /Search/);
  assert.match(searchTrigger, /kbd/);
  assert.match(searchTrigger, /onOpen/);
});

test("the sidebar is generated from the nav registry", () => {
  // One list, two surfaces. The sidebar and the palette each used to keep their
  // own copy, and they had already drifted.
  assert.match(nav, /WORKSPACE_PAGES/);
  assert.match(nav, /PRODUCT_PAGES/);
  assert.match(sidebarNav, /WORKSPACE_PAGES/);
  assert.match(sidebarNav, /PRODUCT_PAGES/);
  assert.match(palette, /NAV_PAGES/);
});

test("sidebar destinations are links, not buttons that push", () => {
  assert.match(sidebarNav, /<Link/);
  assert.match(sidebarNav, /aria-current/);
  // The call, not the mention: these specs read the file as text, so a comment
  // that merely names the old approach would fail a bare /router\.push/.
  assert.doesNotMatch(sidebarNav, /router\.push\(/);
});

test("command palette searches issues within the active workspace", () => {
  assert.match(palette, /usePathname/);
  assert.match(palette, /issueApi/);
  assert.match(palette, /Issues/);
});

test("command and toast primitives are wired", () => {
  assert.match(command, /CommandPrimitive/);
  assert.match(sonner, /Sonner/);
  assert.match(sonner, /richColors/);
});
