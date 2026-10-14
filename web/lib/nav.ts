import {
  Bot,
  CircleDot,
  FolderGit2,
  Gauge,
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
//   - `group` is the band it sits in: the pages of the workspace you are in, or
//     the pages that exist outside any workspace at all.
//   - `scopes` is where it is drawn. The console has exactly two scopes —
//     `all` (All Workspaces) and `workspace` — and a row that is not in the
//     current one is **not drawn**, rather than drawn greyed out. A dead row
//     says "this exists and you may not have it"; a missing row says "this page
//     belongs to a workspace, and you are not in one", which is the truth.
//
// The two scopes are Vercel's team/project split with the team collapsed into
// "all of them": there is no third level to be outside of.

/** The scope the console is in. */
export type NavScope = "all" | "workspace";

/** The two bands of the sidebar. */
export type NavGroup = "workspace" | "product";

interface NavPageBase {
  key: string;
  label: string;
  icon: LucideIcon;
  group: NavGroup;
  /** The scopes that draw this row. */
  scopes: NavScope[];
  /** The letter that follows `g` to jump here, when it has one. */
  jump?: string;
}

export interface WorkspaceNavPage extends NavPageBase {
  group: "workspace";
  href: (slug: string) => string;
  /**
   * Where the row goes in the All Workspaces scope. A row without one is not
   * drawn there — the scope has no page for it yet.
   */
  allHref?: () => string;
}

export interface ProductNavPage extends NavPageBase {
  group: "product";
  href: () => string;
}

export type NavPage = WorkspaceNavPage | ProductNavPage;

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
    href: (slug) => paths.workspace(slug).board(),
    allHref: () => paths.allIssues(),
  },
  {
    key: "agents",
    label: "Agents",
    icon: Bot,
    group: "workspace",
    scopes: ["workspace"],
    jump: "a",
    href: (slug) => paths.workspace(slug).agents(),
  },
  {
    key: "skills",
    label: "Skills",
    icon: Sparkles,
    group: "workspace",
    scopes: ["workspace"],
    jump: "s",
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
    // The All Workspaces scope's own home: the list of everything you have.
    // Inside a workspace this row is not drawn — leaving one is the switcher's
    // job, the way it is on Vercel and multica.
    key: "workspaces",
    label: "Workspaces",
    icon: FolderGit2,
    group: "product",
    scopes: ["all"],
    jump: "w",
    href: () => paths.workspaces(),
  },
  {
    key: "daemons",
    label: "Daemons",
    icon: Monitor,
    group: "product",
    scopes: ["all", "workspace"],
    jump: "d",
    href: () => paths.daemons(),
  },
  {
    key: "usage",
    label: "Usage",
    icon: Gauge,
    group: "product",
    scopes: ["all", "workspace"],
    jump: "u",
    href: () => paths.usage(),
  },
];

export const NAV_PAGES: NavPage[] = [...WORKSPACE_PAGES, ...PRODUCT_PAGES];

/** The two group headings. Drawn for screen readers only — see SidebarNav. */
export const NAV_GROUP_LABEL: Record<NavGroup, string> = {
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
  if (page.group === "product") return page.href();
  if (slug) return page.href(slug);
  return page.allHref?.() ?? null;
}

/**
 * The page a path belongs to, or undefined when it belongs to none.
 *
 * **Longest href wins, and that is not a detail.** The board's href is
 * `/{slug}`, a prefix of every other page inside that workspace, so a plain
 * `find` answers "Issues" for `/acme/agents` — and it lit two rows at once on
 * every workspace sub-page, the board's and the page's own. The same rule is
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
 * Active and hover are two branches rather than two sets of utilities on one
 * element on purpose — the active branch carries no hover class at all, so
 * hovering the current page cannot make it look less current.
 */
export function navRowClass(state: NavRowState): string {
  const base =
    "flex h-8 items-center gap-2.5 rounded-sm px-2.5 text-copy transition-colors";
  return state === "active"
    ? `${base} bg-muted font-medium text-ink`
    : `${base} text-body hover:bg-muted/60 hover:text-ink`;
}

/** Heavier stroke on the active row's icon, matching the label's weight. */
export function navIconStroke(state: NavRowState): number {
  return state === "active" ? 2.25 : 1.75;
}
