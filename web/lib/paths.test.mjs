import { readdirSync, existsSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { RESERVED_SLUGS, paths, workspaceSlugFromPath } from "./paths.ts";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..", "app");

/** True when dir or anything under it renders a page. */
function hasPage(dir) {
  if (existsSync(join(dir, "page.tsx"))) return true;
  return readdirSync(dir, { withFileTypes: true }).some(
    (e) => e.isDirectory() && hasPage(join(dir, e.name)),
  );
}

/**
 * Every first path segment the app can serve: the literal directory names
 * inside each route group. Route groups like (app) do not appear in the URL, so
 * their children land at the root. Dynamic segments ([slug]) are excluded — they
 * are the workspace route itself, not a system route.
 */
function topLevelRoutes() {
  const routes = [];
  for (const group of readdirSync(appDir, { withFileTypes: true })) {
    if (!group.isDirectory() || !group.name.startsWith("(")) continue;
    for (const child of readdirSync(join(appDir, group.name), { withFileTypes: true })) {
      if (!child.isDirectory() || child.name.startsWith("[")) continue;
      if (hasPage(join(appDir, group.name, child.name))) routes.push(child.name);
    }
  }
  return routes.sort();
}

// This is the test that would have caught /usage: the console layout asks
// workspaceSlugFromPath whether the first path segment is a workspace, so any
// top-level route missing from RESERVED_SLUGS gets read as one. Walking the
// real directories means a new page fails here instead of silently clearing the
// workspace it was opened from.
test("every top-level route is a reserved slug", () => {
  const routes = topLevelRoutes();
  assert.ok(routes.length >= 5, `expected to find routes, got ${JSON.stringify(routes)}`);
  for (const route of routes) {
    assert.ok(
      RESERVED_SLUGS.has(route),
      `/${route} is a top-level route but not in RESERVED_SLUGS — the console would read it as a workspace`,
    );
  }
});

test("system routes are not mistaken for workspaces", () => {
  for (const route of topLevelRoutes()) {
    assert.equal(
      workspaceSlugFromPath(`/${route}`),
      null,
      `/${route} resolved to a workspace slug`,
    );
  }
  // The usage page specifically: it was the one that regressed.
  assert.equal(workspaceSlugFromPath(paths.usage()), null);
  // Nested paths under a system route are not workspaces either.
  assert.equal(workspaceSlugFromPath("/daemons/abc-123"), null);
  assert.equal(workspaceSlugFromPath("/usage/anything"), null);
});

test("a real workspace slug still resolves", () => {
  assert.equal(workspaceSlugFromPath("/acme-platform"), "acme-platform");
  assert.equal(workspaceSlugFromPath("/acme-platform/agents"), "acme-platform");
  assert.equal(workspaceSlugFromPath("/acme%20platform"), "acme platform");
  // Nothing to resolve.
  assert.equal(workspaceSlugFromPath("/"), null);
  assert.equal(workspaceSlugFromPath(null), null);
});

test("path builders produce the routes the layout navigates to", () => {
  assert.equal(paths.usage(), "/usage");
  assert.equal(paths.daemons(), "/daemons");
  assert.equal(paths.daemon("abc"), "/daemons/abc");
  assert.equal(paths.daemon("a/b"), "/daemons/a%2Fb");
  assert.equal(paths.workspace("acme").agents(), "/acme/agents");
  assert.equal(paths.workspace("acme").issue("ACME-1"), "/acme/issues/ACME-1");
});

// The backend keeps its own copy so a workspace can never be created with a
// colliding slug in the first place. Neither side can read the other's list, so
// this asserts the two files agree on the routes that exist today.
test("the backend reserved list covers the same system routes", async () => {
  const { readFileSync } = await import("node:fs");
  const go = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "..", "..", "internal", "server", "service", "workspace.go"),
    "utf8",
  );
  for (const route of topLevelRoutes()) {
    assert.match(
      go,
      new RegExp(`"${route.replace(/\./g, "\\.")}":\\s*true`),
      `backend reservedSlugs is missing "${route}" — a workspace could claim /${route}`,
    );
  }
});
