import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NAV_PAGES,
  PRODUCT_PAGES,
  SCOPE_LABEL,
  WORKSPACE_PAGES,
  isNavPageActive,
  navRowClass,
} from "./nav.ts";

// The registry is the single list the sidebar and the command palette both read.
// These are the properties they rely on, asserted rather than assumed.

test("every page is declared once, with a unique key and label", () => {
  const keys = NAV_PAGES.map((p) => p.key);
  const labels = NAV_PAGES.map((p) => p.label);
  assert.equal(new Set(keys).size, keys.length, "duplicate key");
  assert.equal(new Set(labels).size, labels.length, "duplicate label");
  assert.ok(NAV_PAGES.length >= 6, "the registry lost pages");
});

test("both scopes are declared, and every page belongs to one", () => {
  assert.deepEqual(Object.keys(SCOPE_LABEL).sort(), ["product", "workspace"]);
  for (const page of NAV_PAGES) {
    assert.ok(
      page.scope === "workspace" || page.scope === "product",
      `${page.key} has no scope`,
    );
  }
  assert.equal(
    NAV_PAGES.length,
    WORKSPACE_PAGES.length + PRODUCT_PAGES.length,
    "a page is missing from NAV_PAGES",
  );
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
  // A row with nowhere to go is neither clickable nor hoverable.
  assert.doesNotMatch(navRowClass("disabled"), /hover:/);
});
