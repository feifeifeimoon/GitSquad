import {
  Bot,
  CircleDot,
  FolderGit2,
  Gauge,
  GitPullRequest,
  LayoutDashboard,
  Monitor,
  Settings,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { paths } from "@/lib/paths";

// Every destination in the console, in one list, each one declaring where it is
// drawn.
//
// There were three: the sidebar's two hand-written arrays and a third inside
// the command palette. They had already drifted — the palette's copy was
// missing Usage, and its Settings row pointed at the account page while the
// sidebar's pointed at the workspace one, so the same words meant two different
// destinations depending on which surface you read them in. Anything that is
// navigable is declared here and read from here.
//
// A page declares two things about itself, and they are not the same thing:
//
//   - `group` is the band it sits in: the home slot at the very top (the list in
//     All Workspaces, the workspace's overview inside one), the pages of the
//     workspace you are in, or the pages that exist outside any workspace.
//   - `scopes` is where it is drawn. The console has exactly two scopes —
//     `all` (All Workspaces) and `workspace` — and a row that is not in the
//     current one is **not drawn**, rather than drawn greyed out. A dead row
//     says "this exists and you may not have it"; a missing row says "this page
//     belongs to a workspace, and you are not in one", which is the truth.
//
// The home band is the one place where two pages share a slot: Workspaces and
// Overview have disjoint scopes, so exactly one of them is drawn at the top and
// it changes identity with the scope.
//
// The two scopes are Vercel's team/project split with the team collapsed into
// "all of them": there is no third level to be outside of.

/** The scope the console is in. */
export type NavScope = "all" | "workspace";

/** The three bands of the sidebar. */
export type NavGroup = "home" | "workspace" | "product";

interface NavPageBase {
  key: string;
  label: string;
  icon: LucideIcon;
  group: NavGroup;
  /** The scopes that draw this row. */
  scopes: NavScope[];
  /** The letter that follows `g` to jump here, when it has one. */
  jump?: string;
  /**
   * Whether the href needs the workspace slug. This describes the shape of the
   * page, not the band it is drawn in — the home band holds a global page and a
   * slug page in the same slot.
   */
  slugScoped: boolean;
}

export interface WorkspaceNavPage extends NavPageBase {
  slugScoped: true;
  href: (slug: string) => string;
  /**
   * Where the row goes in the All Workspaces scope. A row without one is not
   * drawn there — the scope has no page for it yet.
   */
  allHref?: () => string;
}

export interface ProductNavPage extends NavPageBase {
  slugScoped: false;
  href: () => string;
}

export type NavPage = WorkspaceNavPage | ProductNavPage;

/**
 * The first row: one slot whose identity follows the scope.
 *
 * In All Workspaces it is the list of every workspace; inside one it is that
 * workspace's overview. The two entries never coexist — their scopes are
 * disjoint — so the sidebar draws exactly one of them at the top, and entering
 * a workspace flips the row in place rather than moving it.
 */
export const HOME_PAGES: NavPage[] = [
  {
    key: "workspaces",
    label: "Workspaces",
    icon: FolderGit2,
    group: "home",
    scopes: ["all"],
    jump: "w",
    slugScoped: false,
    href: () => paths.workspaces(),
  },
  {
    key: "overview",
    label: "Overview",
    icon: LayoutDashboard,
    group: "home",
    scopes: ["workspace"],
    jump: "o",
    slugScoped: true,
    href: (slug) => paths.workspace(slug).overview(),
  },
];

/** Scoped to the workspace in view. All of these need a slug to resolve. */
export const WORKSPACE_PAGES: WorkspaceNavPage[] = [
  {
    key: "issues",
    label: "Issues",
    icon: CircleDot,
    group: "workspace",
    // The one page that exists in both scopes: the board you get here, and the
    // board across every workspace you own. Its key is what the scope switcher
    // is for — the work does not stop at a workspace boundary.
    scopes: ["all", "workspace"],
    jump: "i",
    slugScoped: true,
    href: (slug) => paths.workspace(slug).issues(),
    allHref: () => paths.allIssues(),
  },
  {
    key: "agents",
    label: "Agents",
    icon: Bot,
    group: "workspace",
    // Like Issues, both scopes have a page: the roster here, and the roster
    // across every workspace you own. Agents are the half of "what is running"
    // that spans workspaces, since one machine can back runtimes in several.
    scopes: ["all", "workspace"],
    jump: "a",
    slugScoped: true,
    href: (slug) => paths.workspace(slug).agents(),
    allHref: () => paths.allAgents(),
  },
  {
    key: "pull-requests",
    label: "Pull requests",
    icon: GitPullRequest,
    group: "workspace",
    // v1 is workspace-scoped: the list is the repo this workspace is bound to,
    // and there is no cross-repo review view yet.
    scopes: ["workspace"],
    jump: "p",
    slugScoped: true,
    href: (slug) => paths.workspace(slug).pullRequests(),
  },
  {
    key: "skills",
    label: "Skills",
    icon: Sparkles,
    group: "workspace",
    scopes: ["workspace"],
    jump: "s",
    slugScoped: true,
    href: (slug) => paths.workspace(slug).skills(),
  },
  {
    // Just "Settings", because of where it sits: inside the workspace group
    // there is only one thing it could be setting. The account's settings are
    // behind the avatar and keep the longer name, so the two never read as the
    // same thing — and they stay out of this registry, which is why there is no
    // Settings row in the All Workspaces scope either.
    key: "workspace-settings",
    label: "Settings",
    icon: Settings,
    group: "workspace",
    scopes: ["workspace"],
    slugScoped: true,
    href: (slug) => paths.workspace(slug).settings(),
  },
];

/**
 * Reachable from anywhere, in both scopes.
 *
 * Daemons and Usage are per account rather than per workspace — a machine is
 * paired to you, and the usage counters are yours — so they are the two rows
 * that do not change when the scope does.
 */
export const PRODUCT_PAGES: ProductNavPage[] = [
  {
    key: "daemons",
    label: "Daemons",
    icon: Monitor,
    group: "product",
    scopes: ["all", "workspace"],
    jump: "d",
    slugScoped: false,
    href: () => paths.daemons(),
  },
  {
    key: "usage",
    label: "Usage",
    icon: Gauge,
    group: "product",
    scopes: ["all", "workspace"],
    jump: "u",
    slugScoped: false,
    href: () => paths.usage(),
  },
];

export const NAV_PAGES: NavPage[] = [
  ...HOME_PAGES,
  ...WORKSPACE_PAGES,
  ...PRODUCT_PAGES,
];

/** The band headings. Drawn for screen readers only — see SidebarNav. */
export const NAV_GROUP_LABEL: Record<NavGroup, string> = {
  home: "Home",
  workspace: "Workspace",
  product: "Product",
};

/** The pages drawn in a scope, in registry order. */
export function navPagesInScope(scope: NavScope): NavPage[] {
  return NAV_PAGES.filter((page) => page.scopes.includes(scope));
}

/** Every page that asks for a jump letter, with the scope it needs. */
export function navPageByJump(key: string): NavPage | undefined {
  return NAV_PAGES.find((page) => page.jump === key);
}

/**
 * Where a row goes in the scope the console is in, or null when that scope does
 * not draw it.
 *
 * The scope is derived from the slug rather than passed beside it: a slug means
 * the workspace scope, and the two can never disagree. That is the whole reason
 * the console has no remembered scope any more — a scope that is inferred is a
 * scope that can be missing.
 */
export function navPageHref(page: NavPage, slug: string | null): string | null {
  if (!page.scopes.includes(slug ? "workspace" : "all")) return null;
  if (page.slugScoped) {
    return slug ? page.href(slug) : (page.allHref?.() ?? null);
  }
  return page.href();
}

/**
 * The page a path belongs to, or undefined when it belongs to none.
 *
 * **Longest href wins, and that is not a detail.** The overview's href is
 * `/{slug}`, a prefix of every other page inside that workspace, so a plain
 * `find` answers "Overview" for `/acme/agents` — and it lit two rows at once on
 * every workspace sub-page, the overview's and the page's own. The same rule is
 * what keeps `/workspaces` from lighting up on `/workspaces/issues`.
 */
export function navPageForPath(
  pathname: string,
  slug: string | null,
): NavPage | undefined {
  let best: NavPage | undefined;
  let bestHref = "";
  for (const page of NAV_PAGES) {
    const href = navPageHref(page, slug);
    if (href === null || !isNavPageActive(pathname, href)) continue;
    if (href.length > bestHref.length) {
      best = page;
      bestHref = href;
    }
  }
  return best;
}

/**
 * Where the scope switcher goes when you pick a scope from where you are.
 *
 * **The switcher changes the scope, not the page.** Picking a workspace while
 * reading Agents lands on that workspace's Agents; picking All Workspaces from
 * a workspace's issues board lands on the board across all of them. Vercel's
 * project switcher keeps you on the page you are on, for the same reason: the
 * page is what you were reading, and the scope is what it should be read in.
 *
 * Two cases fall back to the scope's front door — the workspace's overview, or
 * the All Workspaces list:
 *
 *   - the page has no counterpart in the target scope (Settings has no All
 *     Workspaces page, the workspace list has no workspace page);
 *   - the counterpart resolves to the *same* URL, which is what the account-level
 *     rows do: Daemons is `/daemons` in both scopes, so a plain "stay" would
 *     leave the switcher showing the scope you just left.
 */
export function scopeTargetHref(
  pathname: string,
  slug: string | null,
  targetSlug: string | null,
): string {
  const current = navPageForPath(pathname, slug);
  if (current) {
    const here = navPageHref(current, slug);
    const there = navPageHref(current, targetSlug);
    // The page in the other scope, unless that is no move at all. Picking the
    // scope you are already in is a no-op, not a trip to the front door — the
    // switcher lists the current workspace like any other, and clicking the
    // checked row used to throw the reader off the page.
    if (there && (there !== here || targetSlug === slug)) return there;
  }
  return targetSlug ? paths.workspace(targetSlug).overview() : paths.workspaces();
}

/**
 * Pages that name themselves with their own big heading, and are left out of
 * the bar so the same words are not stacked twice on one screen.
 */
const SELF_TITLED = ["/workspaces/new"];

/**
 * What the bar above the page calls where you are.
 *
 * It is the registry's label, so the bar and the sidebar can never disagree
 * about the name of a place — with one deliberate exception, the account
 * settings, which are not a nav row (they live behind the avatar) but are still
 * a page you can be on and should be able to name.
 */
export function consoleTitle(
  pathname: string,
  slug: string | null,
): string | null {
  if (SELF_TITLED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return null;
  }
  const page = navPageForPath(pathname, slug);
  if (page) return page.label;
  if (pathname === "/settings" || pathname.startsWith("/settings/")) {
    return "Account settings";
  }
  return null;
}

/**
 * A row is active on its own page and on anything beneath it. Prefix rather
 * than equality so a detail page keeps its section lit — the board used to be a
 * special case here, and every other row compared with `startsWith` alone,
 * which lit the row for `/settings-anything`.
 */
export function isNavPageActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The two states a row can be in, and nothing in between. */
export type NavRowState = "active" | "idle";

/**
 * The one row treatment, so the sidebar's rows and the palette's rows cannot
 * drift apart.
 *
 * The size is the body size, not the `label` step one below it. The sidebar is
 * the most-read text in the console and it sat at 13px with default tracking,
 * which read as smaller and looser than the console it is modelled on — and
 * "label" is not a role DESIGN.md defines, while `body-sm` is (14px). Nothing
 * needs the row to be a step down any more: the hierarchy the 13px was bought
 * for is carried by the page title in the bar above it, which is 19px.
 *
 * The row is 36px with no gap between rows, and the block it sits in is inset
 * 8px: that is the reference console's box, measured off it rather than guessed
 * — its rows pitch at 36px and its icons start 18px from the edge, where ours
 * were 34 and 22. Two pixels of pitch and four of inset are the difference
 * between "the same sidebar" and "a sidebar that feels tighter".
 *
 * Active and hover are two branches rather than two sets of utilities on one
 * element on purpose — the active branch carries no hover class at all, so
 * hovering the current page cannot make it look less current.
 */
export function navRowClass(state: NavRowState): string {
  const base =
    "flex h-9 items-center gap-2.5 rounded-sm px-2.5 text-copy transition-colors";
  return state === "active"
    ? `${base} bg-muted font-medium text-ink`
    : `${base} text-body hover:bg-muted/60 hover:text-ink`;
}

/** Heavier stroke on the active row's icon, matching the label's weight. */
export function navIconStroke(state: NavRowState): number {
  return state === "active" ? 2.25 : 1.75;
}
