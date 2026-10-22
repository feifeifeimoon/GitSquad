// Centralized URL builders. Workspaces live at /{slug}; changing a route
// shape later becomes a single-file edit instead of a repo-wide search.

const encode = (id: string) => encodeURIComponent(id);

// Root-level slugs that would collide with top-level routes or framework
// assets. Kept in sync with the backend reserved list (service/workspace.go).
//
// Every literal top-level route must appear here. A missing one is not a
// hypothetical: /usage was absent, so the console layout read it as a workspace
// named "usage" and cleared the workspace it was showing. lib/paths.test.mjs
// walks the real route directories and fails if one is missing.
export const RESERVED_SLUGS = new Set([
  "login", "auth", "daemon", "daemons",
  "workspaces", "settings", "usage", "new", "api",
  "_next", "_vercel", "favicon.ico", "manifest",
  "robots.txt", "sitemap.xml", "icons",
  "home", "homepage", "dashboard", "docs",
  "about", "pricing", "changelog", "blog",
  "help", "support", "status", "admin",
  "account", "profile", "billing", "www",
]);

export const paths = {
  workspaces: () => "/workspaces",
  newWorkspace: () => "/workspaces/new",
  newWorkspaceConfigure: () => "/workspaces/new/configure",
  // The All Workspaces scope's own pages. They hang off /workspaces rather than
  // taking a top-level segment of their own: /issues, /agents and /skills would
  // collide with RESERVED_SLUGS, and a workspace already named "issues" would
  // be read as the route.
  allIssues: () => "/workspaces/issues",
  allAgents: () => "/workspaces/agents",
  daemons: () => "/daemons",
  daemon: (id: string) => `/daemons/${encode(id)}`,
  usage: () => "/usage",
  settings: () => "/settings",
  workspace: (slug: string) => ({
    overview: () => `/${encode(slug)}`,
    issues: () => `/${encode(slug)}/issues`,
    issue: (key: string) => `/${encode(slug)}/issues/${encode(key)}`,
    pullRequests: () => `/${encode(slug)}/pull-requests`,
    settings: () => `/${encode(slug)}/settings`,
    agents: () => `/${encode(slug)}/agents`,
    // By id, not by name: renaming an agent must not break a link somebody
    // pasted into an issue three weeks ago.
    agent: (id: string) => `/${encode(slug)}/agents/${encode(id)}`,
    skills: () => `/${encode(slug)}/skills`,
  }),
};

// Returns the workspace slug when the first path segment names a workspace
// (i.e. is not a reserved system route), otherwise null.
export function workspaceSlugFromPath(pathname: string | null): string | null {
  if (!pathname) return null;
  const first = pathname.split("/")[1];
  if (!first || RESERVED_SLUGS.has(first)) return null;
  return decodeURIComponent(first);
}
