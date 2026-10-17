import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HOME_PAGES,
  NAV_GROUP_LABEL,
  NAV_PAGES,
  PRODUCT_PAGES,
  WORKSPACE_PAGES,
  consoleTitle,
  isNavPageActive,
  navPageHref,
  navPageByJump,
  navPageForPath,
  navPagesInScope,
  scopeTargetHref,
  navRowClass,
} from "./nav.ts";

// The registry is the single list the sidebar, the command palette and the `g`
// jumps all read. These are the properties they rely on, asserted rather than
// assumed.

test("every page is declared once, with a unique key and label", () => {
  const keys = NAV_PAGES.map((p) => p.key);
  const labels = NAV_PAGES.map((p) => p.label);
  assert.equal(new Set(keys).size, keys.length, "duplicate key");
  assert.equal(new Set(labels).size, labels.length, "duplicate label");
  assert.ok(NAV_PAGES.length >= 6, "the registry lost pages");
});

test("every page declares a band and the scopes it is drawn in", () => {
  assert.deepEqual(Object.keys(NAV_GROUP_LABEL).sort(), [
    "home",
    "product",
    "workspace",
  ]);
  for (const page of NAV_PAGES) {
    assert.ok(
      page.group === "home" || page.group === "workspace" || page.group === "product",
      `${page.key} has no band`,
    );
    assert.ok(page.scopes.length > 0, `${page.key} is drawn in no scope at all`);
    for (const scope of page.scopes) {
      assert.ok(
        scope === "all" || scope === "workspace",
        `${page.key} claims an unknown scope: ${scope}`,
      );
    }
  }
  assert.equal(
    NAV_PAGES.length,
    HOME_PAGES.length + WORKSPACE_PAGES.length + PRODUCT_PAGES.length,
    "a page is missing from NAV_PAGES",
  );
});

test("the home band changes identity with the scope", () => {
  // The first row is the workspace list in All Workspaces and the workspace's
  // overview inside one. Two entries, disjoint scopes: exactly one is drawn,
  // so entering a workspace flips the row in place instead of moving it.
  const allHome = navPagesInScope("all").filter((p) => p.group === "home");
  const workspaceHome = navPagesInScope("workspace").filter(
    (p) => p.group === "home",
  );
  assert.deepEqual(allHome.map((p) => p.key), ["workspaces"]);
  assert.deepEqual(workspaceHome.map((p) => p.key), ["overview"]);
  assert.equal(navPagesInScope("all")[0].key, "workspaces");
  assert.equal(navPagesInScope("workspace")[0].key, "overview");
});

test("All Workspaces draws the pages that exist without a workspace", () => {
  // The exact set matters: this is the scope the console is in whenever the URL
  // names no workspace, and every row here has to be a page that exists without
  // one. The list is the home row now, not a product row.
  assert.deepEqual(
    navPagesInScope("all").map((p) => p.key),
    ["workspaces", "issues", "agents", "daemons", "usage"],
  );
});

test("a workspace draws its own pages, and the list becomes the overview", () => {
  assert.deepEqual(
    navPagesInScope("workspace").map((p) => p.key),
    [
      "overview",
      "issues",
      "agents",
      "skills",
      "workspace-settings",
      "daemons",
      "usage",
    ],
  );
  // Leaving a workspace is the switcher's job: the home row became Overview,
  // and the list is no longer among the rows.
  assert.ok(
    !navPagesInScope("workspace").some((p) => p.key === "workspaces"),
    "the workspace scope still draws the Workspaces row",
  );
});

test("the account-level rows are drawn in every scope", () => {
  // A machine is paired to the account and the usage counters are the account's,
  // which is why these are the rows that do not move when the scope does.
  for (const key of ["daemons", "usage"]) {
    const page = NAV_PAGES.find((p) => p.key === key);
    assert.deepEqual(page.scopes, ["all", "workspace"], `${key} moved`);
  }
});

test("the rows that need a workspace are the ones the All scope leaves out", () => {
  // Each of these names one workspace in the doing: a skill is the workspace's,
  // and so are its settings. Issues and Agents are the two that have since
  // earned a page here of their own.
  for (const key of ["skills", "workspace-settings"]) {
    assert.ok(
      !navPagesInScope("all").some((p) => p.key === key),
      `${key} is drawn in All Workspaces with no page to point at`,
    );
  }
});

test("a jump letter is unique, and resolves in the scopes that draw it", () => {
  const jumps = NAV_PAGES.filter((p) => p.jump).map((p) => p.jump);
  assert.equal(new Set(jumps).size, jumps.length, "two pages share a jump letter");
  const issues = navPageByJump("i");
  assert.equal(issues?.key, "issues");
  // Both letters answer in both scopes, with a different destination: `g i` is
  // this scope's board either way.
  assert.equal(navPageHref(issues, "acme"), "/acme/issues");
  assert.equal(navPageHref(issues, null), "/workspaces/issues");
  const agents = navPageByJump("a");
  assert.equal(navPageHref(agents, "acme"), "/acme/agents");
  assert.equal(navPageHref(agents, null), "/workspaces/agents");
  // The home slot's two letters are scope-exclusive, like the rows themselves.
  const workspaces = navPageByJump("w");
  assert.equal(navPageHref(workspaces, null), "/workspaces");
  assert.equal(navPageHref(workspaces, "acme"), null);
  const overview = navPageByJump("o");
  assert.equal(navPageHref(overview, "acme"), "/acme");
  assert.equal(navPageHref(overview, null), null);
  assert.equal(navPageByJump("z"), undefined);
});

test("a row with no page in a scope resolves to nothing there", () => {
  const skills = NAV_PAGES.find((p) => p.key === "skills");
  assert.equal(navPageHref(skills, "acme"), "/acme/skills");
  assert.equal(navPageHref(skills, null), null);
  // Belt as well as brace: the scope filter has already dropped it.
  assert.ok(!navPagesInScope("all").includes(skills));
});

test("exactly one row is current, and it is the most specific one", () => {
  // The overview's href is `/{slug}`, a prefix of every other page inside that
  // workspace — so a prefix-only rule lit two rows on every sub-page, the
  // overview's and the page's own.
  assert.equal(navPageForPath("/acme/settings", "acme")?.key, "workspace-settings");
  assert.equal(navPageForPath("/acme/agents", "acme")?.key, "agents");
  assert.equal(navPageForPath("/acme/issues/E2E-1", "acme")?.key, "issues");
  assert.equal(navPageForPath("/acme", "acme")?.key, "overview");
  // …and the same rule keeps the home row dark on the aggregate board, which
  // lives under it.
  assert.equal(navPageForPath("/workspaces/issues", null)?.key, "issues");
  assert.equal(navPageForPath("/workspaces", null)?.key, "workspaces");
  assert.equal(navPageForPath("/workspaces/new", null)?.key, "workspaces");
});

test("a workspace page resolves under the slug it is given", () => {
  for (const page of [...WORKSPACE_PAGES, ...HOME_PAGES.filter((p) => p.slugScoped)]) {
    const href = page.href("acme");
    assert.ok(href.startsWith("/acme"), `${page.key} → ${href}`);
    // Encoded, so a slug with a space cannot produce a broken href.
    assert.ok(page.href("acme platform").startsWith("/acme%20platform"));
  }
});

test("a product page resolves with no workspace at all", () => {
  for (const page of PRODUCT_PAGES) {
    const href = page.href();
    assert.ok(href.startsWith("/"), `${page.key} → ${href}`);
    assert.ok(!href.includes("undefined"), `${page.key} → ${href}`);
  }
});

test("the account settings have their own page, not the workspace's", () => {
  // The bug this registry exists to prevent: the product group's Settings row
  // rewrote its own href to the workspace settings, so /settings became
  // unreachable from the sidebar for anyone who had opened a workspace.
  const workspaceSettings = WORKSPACE_PAGES.find(
    (p) => p.key === "workspace-settings",
  );
  assert.ok(workspaceSettings, "workspace settings is not a workspace page");
  assert.equal(workspaceSettings.href("acme"), "/acme/settings");
  assert.ok(
    !PRODUCT_PAGES.some((p) => p.label === "Settings"),
    "the account settings are not a nav row — they live behind the account menu",
  );
  // Which is also why All Workspaces has no Settings row at all: its settings
  // are the account's, and those are behind the avatar.
  assert.ok(!navPagesInScope("all").some((p) => p.label === "Settings"));
});

test("a row is active on its own page and anything beneath it", () => {
  assert.ok(isNavPageActive("/acme/agents", "/acme/agents"));
  assert.ok(isNavPageActive("/acme/agents/42", "/acme/agents"));
  assert.ok(!isNavPageActive("/acme", "/acme/agents"));
  // Not a prefix of the string — a prefix of the path.
  assert.ok(!isNavPageActive("/acme/agents-archive", "/acme/agents"));
  assert.ok(!isNavPageActive("/settings-import", "/settings"));
});

test("the active row keeps its own treatment while hovered", () => {
  const active = navRowClass("active");
  const idle = navRowClass("idle");
  assert.match(active, /bg-muted/);
  assert.doesNotMatch(active, /hover:/, "hover must not fight the active row");
  assert.match(idle, /hover:bg-muted/);
});

test("the bar names the section a path is in, longest href first", () => {
  // The overview's href is `/{slug}`, a prefix of every other page inside that
  // workspace — so a plain `find` answers "Overview" for /acme/agents.
  assert.equal(navPageForPath("/acme/agents", "acme")?.key, "agents");
  assert.equal(consoleTitle("/acme/agents", "acme"), "Agents");
  assert.equal(consoleTitle("/acme/skills", "acme"), "Skills");
  assert.equal(consoleTitle("/acme/settings", "acme"), "Settings");
  // A detail page keeps its section, the way Vercel's bar does.
  assert.equal(consoleTitle("/acme/issues/E2E-1", "acme"), "Issues");
  assert.equal(consoleTitle("/acme", "acme"), "Overview");
  assert.equal(consoleTitle("/workspaces", null), "Workspaces");
  assert.equal(consoleTitle("/daemons", null), "Daemons");
  assert.equal(consoleTitle("/daemons/abc", null), "Daemons");
  assert.equal(consoleTitle("/usage", null), "Usage");
});

test("the bar names the account settings, which are not a nav row", () => {
  // They live behind the avatar rather than in the sidebar, so the registry
  // cannot answer for them — and a page you can be on has to be nameable.
  assert.equal(consoleTitle("/settings", null), "Account settings");
  // A slug for the rows that need one: `href()` with no argument encodes
  // `undefined`, so calling it on a workspace row tested "/undefined/settings"
  // and never looked at the row this asks about.
  assert.ok(
    !NAV_PAGES.some((p) =>
      (p.slugScoped ? p.href("acme") : p.href()).startsWith("/settings"),
    ),
  );
});

test("a page that titles itself is left out of the bar", () => {
  // The create/configure flow draws its own big heading; a second one above it
  // saying "Workspaces" would be the same words stacked twice.
  assert.equal(consoleTitle("/workspaces/new", null), null);
  assert.equal(consoleTitle("/workspaces/new/configure", null), null);
  assert.equal(consoleTitle("/workspaces", null), "Workspaces");
});

test("the switcher changes the scope, not the page", () => {
  // Picking a workspace while reading the Agents roster stays on Agents — the
  // bug was landing on that workspace's board instead.
  assert.equal(scopeTargetHref("/workspaces/agents", null, "acme"), "/acme/agents");
  assert.equal(scopeTargetHref("/workspaces/issues", null, "acme"), "/acme/issues");
  // …and the other way: from a workspace's Agents to the roster across all.
  assert.equal(scopeTargetHref("/acme/agents", "acme", null), "/workspaces/agents");
  assert.equal(scopeTargetHref("/acme/issues", "acme", null), "/workspaces/issues");
  // The overview has no All Workspaces counterpart, so it falls to the list.
  assert.equal(scopeTargetHref("/acme", "acme", null), "/workspaces");
  assert.equal(scopeTargetHref("/acme/skills", "acme", "other"), "/other/skills");
  // A detail page keeps its section: the issue is not in the other workspace,
  // but its issues board is.
  assert.equal(scopeTargetHref("/acme/issues/E1", "acme", "other"), "/other/issues");
});

test("a page with no counterpart falls back to the target scope's front door", () => {
  // The workspace list has no workspace page.
  assert.equal(scopeTargetHref("/workspaces", null, "acme"), "/acme");
  // Settings has no All Workspaces page.
  assert.equal(scopeTargetHref("/acme/settings", "acme", null), "/workspaces");
  // Daemons and Usage resolve to the same URL in both scopes, so "stay" would
  // leave the switcher showing the scope you just left.
  assert.equal(scopeTargetHref("/daemons", null, "acme"), "/acme");
  assert.equal(scopeTargetHref("/usage", null, "acme"), "/acme");
  // Picking the scope you are already in is a no-op, not a trip to the front
  // door: the switcher lists the current workspace too.
  assert.equal(scopeTargetHref("/acme/agents", "acme", "acme"), "/acme/agents");
  assert.equal(scopeTargetHref("/acme/agents", "acme", null), "/workspaces/agents");
  // A page that is not a destination at all: the account settings.
  assert.equal(scopeTargetHref("/settings", null, "acme"), "/acme");
});
