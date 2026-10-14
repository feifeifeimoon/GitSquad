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
    scopes: ["workspace"],
    jump: "i",
    href: (slug) => paths.workspace(slug).board(),
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

/** The two group headings. */
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
 * Active and hover are two branches rather than two sets of utilities on one
 * element on purpose — the active branch carries no hover class at all, so
 * hovering the current page cannot make it look less current.
 */
export function navRowClass(state: NavRowState): string {
  const base =
    "flex h-8 items-center gap-2.5 rounded-sm px-2.5 text-label transition-colors";
  return state === "active"
    ? `${base} bg-muted font-medium text-ink`
    : `${base} text-body hover:bg-muted/60 hover:text-ink`;
}

/** Heavier stroke on the active row's icon, matching the label's weight. */
export function navIconStroke(state: NavRowState): number {
  return state === "active" ? 2.25 : 1.75;
}
