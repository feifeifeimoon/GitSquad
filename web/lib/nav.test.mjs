import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NAV_GROUP_LABEL,
  NAV_PAGES,
  PRODUCT_PAGES,
  WORKSPACE_PAGES,
  consoleTitle,
  isNavPageActive,
  navPageByJump,
  navPageForPath,
  navPagesInScope,
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
  assert.deepEqual(Object.keys(NAV_GROUP_LABEL).sort(), ["product", "workspace"]);
  for (const page of NAV_PAGES) {
    assert.ok(
      page.group === "workspace" || page.group === "product",
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
    WORKSPACE_PAGES.length + PRODUCT_PAGES.length,
    "a page is missing from NAV_PAGES",
  );
});

test("All Workspaces draws the list, and nothing that needs a workspace", () => {
  // The exact set matters: this is the scope the console is in whenever the URL
  // names no workspace, and every row here has to be a page that exists without
  // one.
  assert.deepEqual(
    navPagesInScope("all").map((p) => p.key),
    ["workspaces", "daemons", "usage"],
  );
});

test("a workspace draws its own pages, and not the list it came from", () => {
  assert.deepEqual(
    navPagesInScope("workspace").map((p) => p.key),
    ["issues", "agents", "skills", "workspace-settings", "daemons", "usage"],
  );
  // Leaving a workspace is the switcher's job — Vercel has no Teams row and
  // multica has no Workspaces row either.
  assert.ok(
    !navPagesInScope("workspace").some((p) => p.key === "workspaces"),
    "the workspace scope still draws the Workspaces row",
  );
});

test("the account-level rows are the two that survive a scope change", () => {
  // A machine is paired to the account and the usage counters are the account's,
  // which is why these are the rows that do not move when the scope does.
  assert.deepEqual(
    NAV_PAGES.filter((p) => p.scopes.length === 2).map((p) => p.key),
    ["daemons", "usage"],
  );
});

test("a jump letter is unique and belongs to a scope that draws it", () => {
  const jumps = NAV_PAGES.filter((p) => p.jump).map((p) => p.jump);
  assert.equal(new Set(jumps).size, jumps.length, "two pages share a jump letter");
  const issues = navPageByJump("i");
  assert.equal(issues?.key, "issues");
  // `g i` is a no-op in All Workspaces for the same reason the row is absent:
  // there is no board there to jump to.
  assert.ok(!issues.scopes.includes("all"));
  assert.equal(navPageByJump("z"), undefined);
});

test("a workspace page resolves under the slug it is given", () => {
  for (const page of WORKSPACE_PAGES) {
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
  // The board's href is `/{slug}`, a prefix of every other page inside that
  // workspace — so a plain `find` answers "Issues" for /acme/agents.
  assert.equal(navPageForPath("/acme/agents", "acme")?.key, "agents");
  assert.equal(consoleTitle("/acme/agents", "acme"), "Agents");
  assert.equal(consoleTitle("/acme/skills", "acme"), "Skills");
  assert.equal(consoleTitle("/acme/settings", "acme"), "Settings");
  // A detail page keeps its section, the way Vercel's bar does.
  assert.equal(consoleTitle("/acme/issues/E2E-1", "acme"), "Issues");
  assert.equal(consoleTitle("/acme", "acme"), "Issues");
  assert.equal(consoleTitle("/workspaces", null), "Workspaces");
  assert.equal(consoleTitle("/daemons", null), "Daemons");
  assert.equal(consoleTitle("/daemons/abc", null), "Daemons");
  assert.equal(consoleTitle("/usage", null), "Usage");
});

test("the bar names the account settings, which are not a nav row", () => {
  // They live behind the avatar rather than in the sidebar, so the registry
  // cannot answer for them — and a page you can be on has to be nameable.
  assert.equal(consoleTitle("/settings", null), "Account settings");
  assert.ok(!NAV_PAGES.some((p) => p.href().startsWith("/settings")));
});

test("a page that titles itself is left out of the bar", () => {
  // The create/configure flow draws its own big heading; a second one above it
  // saying "Workspaces" would be the same words stacked twice.
  assert.equal(consoleTitle("/workspaces/new", null), null);
  assert.equal(consoleTitle("/workspaces/new/configure", null), null);
  assert.equal(consoleTitle("/workspaces", null), "Workspaces");
});
