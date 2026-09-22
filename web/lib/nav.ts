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

// Every destination in the console, in one list.
//
// There were three: the sidebar's two hand-written arrays and a third inside
// the command palette. They had already drifted — the palette's copy was
// missing Usage, and its Settings row pointed at the account page while the
// sidebar's pointed at the workspace one, so the same words meant two different
// destinations depending on which surface you read them in. Anything that is
// navigable is declared here and read from here.
//
// Scope is part of the declaration rather than something a caller decides,
// because that is the distinction the sidebar draws: a workspace page is a
// place inside the thing you are looking at, a product page is a place in the
// product. A workspace page cannot be reached without a workspace, which is why
// the slug is an argument to its href and not an optional field on a context.

export type NavScope = "workspace" | "product";

interface NavPageBase {
  key: string;
  label: string;
  icon: LucideIcon;
}

export interface WorkspaceNavPage extends NavPageBase {
  scope: "workspace";
  href: (slug: string) => string;
}

export interface ProductNavPage extends NavPageBase {
  scope: "product";
  href: () => string;
}

export type NavPage = WorkspaceNavPage | ProductNavPage;

/** Scoped to the workspace in view. All of these need a slug to resolve. */
export const WORKSPACE_PAGES: WorkspaceNavPage[] = [
  {
    key: "issues",
    label: "Issues",
    icon: CircleDot,
    scope: "workspace",
    href: (slug) => paths.workspace(slug).board(),
  },
  {
    key: "agents",
    label: "Agents",
    icon: Bot,
    scope: "workspace",
    href: (slug) => paths.workspace(slug).agents(),
  },
  {
    key: "skills",
    label: "Skills",
    icon: Sparkles,
    scope: "workspace",
    href: (slug) => paths.workspace(slug).skills(),
  },
  {
    // Just "Settings", because of where it sits: inside the workspace group
    // there is only one thing it could be setting. The account's settings are
    // behind the avatar and keep the longer name, so the two never read as the
    // same thing.
    key: "workspace-settings",
    label: "Settings",
    icon: Settings,
    scope: "workspace",
    href: (slug) => paths.workspace(slug).settings(),
  },
];

/** Not tied to a workspace; reachable from anywhere. */
export const PRODUCT_PAGES: ProductNavPage[] = [
  {
    key: "workspaces",
    label: "Workspaces",
    icon: FolderGit2,
    scope: "product",
    href: () => paths.workspaces(),
  },
  {
    key: "daemons",
    label: "Daemons",
    icon: Monitor,
    scope: "product",
    href: () => paths.daemons(),
  },
  {
    key: "usage",
    label: "Usage",
    icon: Gauge,
    scope: "product",
    href: () => paths.usage(),
  },
];

export const NAV_PAGES: NavPage[] = [...WORKSPACE_PAGES, ...PRODUCT_PAGES];

/** The two group headings. */
export const SCOPE_LABEL: Record<NavScope, string> = {
  workspace: "Workspace",
  product: "Product",
};

/**
 * A row is active on its own page and on anything beneath it. Prefix rather
 * than equality so a detail page keeps its section lit — the board used to be a
 * special case here, and every other row compared with `startsWith` alone,
 * which lit the row for `/settings-anything`.
 */
export function isNavPageActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The three states a row can be in, and nothing in between. */
export type NavRowState = "active" | "idle" | "disabled";

/**
 * The one row treatment, so the sidebar's rows and the palette's rows cannot
 * drift apart.
 *
 * Active and hover are two branches rather than two sets of utilities on one
 * element on purpose — the active branch carries no hover class at all, so
 * hovering the current page cannot make it look less current. `disabled` is a
 * row that is on screen but has nowhere to go: a workspace page with no
 * workspace in view.
 */
export function navRowClass(state: NavRowState): string {
  const base =
    "flex h-8 items-center gap-2.5 rounded-sm px-2.5 text-label transition-colors";
  switch (state) {
    case "active":
      return `${base} bg-muted font-medium text-ink`;
    case "disabled":
      return `${base} cursor-default text-mute/60`;
    default:
      return `${base} text-body hover:bg-muted/60 hover:text-ink`;
  }
}

/** Heavier stroke on the active row's icon, matching the label's weight. */
export function navIconStroke(state: NavRowState): number {
  return state === "active" ? 2.25 : 1.75;
}

/**
 * The letter that follows `g` to jump to a page.
 *
 * Not every page gets one. A shortcut nobody can remember is worse than no
 * shortcut, and the palette already covers everything this does not — so this
 * is the six places you go most, and nothing else.
 */
export const NAV_JUMP: Record<string, string> = {
  i: "issues",
  a: "agents",
  s: "skills",
  w: "workspaces",
  d: "daemons",
  u: "usage",
};
