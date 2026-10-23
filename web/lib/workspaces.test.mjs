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
const card = readFileSync(
  new URL("../components/workspaces/workspace-card.tsx", import.meta.url),
  "utf8",
);
const feed = readFileSync(
  new URL("../components/workspaces/recent-pull-requests.tsx", import.meta.url),
  "utf8",
);
const viewSwitcher = readFileSync(
  new URL("../components/view-switcher.tsx", import.meta.url),
  "utf8",
);
const segmented = readFileSync(
  new URL("../components/segmented-control.tsx", import.meta.url),
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
const scopeSwitcher = readFileSync(
  new URL("../components/scope-switcher.tsx", import.meta.url),
  "utf8",
);

test("the workspace list is a grid of cards that carry their own work", () => {
  assert.match(list, /grid-cols-1/);
  assert.match(list, /WorkspaceCardView/);
  // The bar names the page; the page does not name it again.
  assert.doesNotMatch(list, /SectionHead title="Workspaces"/);
  // The card's three blocks: identity, the issue mix, the agents.
  assert.match(card, /repoLabel/);
  assert.match(card, /agentChips/);
  assert.match(card, /paths\.workspace\([^)]*\)\.settings\(\)/);
  // The table view is gone with the switcher: this page has one shape.
  assert.doesNotMatch(list, /<table/);
  assert.doesNotMatch(list, /ViewSwitcher/);
});

test("workspace list shows a skeleton while loading", () => {
  assert.match(list, /Skeleton/);
});

test("the view switcher keeps its pressed state and its accessible name", () => {
  // The workspace list no longer offers the toggle, but the daemon list still
  // does, and both it and the usage ranges go through the one control.
  assert.match(viewSwitcher, /LayoutGrid/);
  assert.match(viewSwitcher, /localStorage/);
  assert.match(viewSwitcher, /"Cards"/);
  assert.match(viewSwitcher, /"List"/);
  assert.match(viewSwitcher, /iconOnly/);
  assert.match(segmented, /aria-label/);
  assert.match(segmented, /aria-pressed/);
});

test("the page searches workspaces and ends with recent pull requests", () => {
  assert.match(list, /Search workspaces…/);
  assert.match(list, /pullRequestApi.recent/);
  assert.match(list, /RecentPullRequests/);
  assert.match(feed, /reviewStatus/);
  assert.match(feed, /\?pr=/);
});

test("the sidebar header is the product; the scope is named above the page", () => {
  // The header used to be the workspace switcher, and it fell back to "GitSquad"
  // whenever the URL named no workspace — which is exactly what read as "you are
  // nowhere". The switcher moved above the page and always names a scope, so
  // what is left in the corner is only ever the product.
  assert.match(shell, /GitSquad/);
  assert.match(shell, /ScopeSwitcher/);
  assert.match(scopeSwitcher, /All Workspaces/);
  assert.match(scopeSwitcher, /WorkspaceAvatar/);
  // Where a pick goes is the registry's answer, not the switcher's: it used to
  // build `paths.workspace(slug).board()` itself, which is why picking a
  // workspace from the Agents roster landed on that workspace's board.
  assert.match(scopeSwitcher, /scopeTargetHref\(/);
  assert.doesNotMatch(scopeSwitcher, /paths\.workspace\(/);
  // The switcher did not move: it is still in the content bar, and the sidebar
  // still opens with the product's own header.
  assert.match(shell, /<ScopeSwitcher/);
  // Nothing remembers the last workspace. A remembered scope is one that can be
  // missing, and a missing scope is what drew the four grey rows.
  assert.doesNotMatch(shell, /lastWorkspaceSlug/);
});

test("a workspace card opens its overview, not the issue board", () => {
  // The workspace's front door is the overview now; the board lives one level
  // down at /{slug}/issues. The card is the main way into a workspace, so it
  // has to point at the same place the switcher's fallback does.
  assert.match(card, /paths\.workspace\([^)]*\)\.overview\(\)/);
  assert.doesNotMatch(card, /\.board\(\)/);
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

test("the sidebar is generated from the nav registry, in scope", () => {
  // One list, two surfaces. The sidebar and the palette each used to keep their
  // own copy, and they had already drifted — including on which pages exist at
  // all, since each decided the scope for itself.
  assert.match(nav, /HOME_PAGES/);
  assert.match(nav, /WORKSPACE_PAGES/);
  assert.match(nav, /PRODUCT_PAGES/);
  assert.match(nav, /navPagesInScope/);
  assert.match(sidebarNav, /navPagesInScope/);
  assert.match(palette, /navPagesInScope/);
});

test("sidebar destinations are links, not buttons that push", () => {
  assert.match(sidebarNav, /<Link/);
  assert.match(sidebarNav, /aria-current/);
  // The call, not the mention: these specs read the file as text, so a comment
  // that merely names the old approach would fail a bare /router\.push/.
  assert.doesNotMatch(sidebarNav, /router\.push\(/);
});

test("command palette searches issues within the active workspace", () => {
  // The scope arrives from the shell rather than being derived from the pathname
  // — the palette and the sidebar used to work it out separately, which is how
  // they ended up disagreeing about which pages exist.
  assert.match(palette, /slug/);
  assert.doesNotMatch(palette, /usePathname/);
  assert.match(palette, /issueApi/);
  assert.match(palette, /Issues/);
});

test("command and toast primitives are wired", () => {
  assert.match(command, /CommandPrimitive/);
  assert.match(sonner, /Sonner/);
  assert.match(sonner, /richColors/);
});
