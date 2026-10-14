"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  isNavPageActive,
  navIconStroke,
  navPagesInScope,
  navRowClass,
  NAV_GROUP_LABEL,
  type NavGroup,
  type NavPage,
  type NavScope,
} from "@/lib/nav";

/**
 * The destinations, drawn for the scope the console is in.
 *
 * The workspace band used to be unconditional: with no workspace in view its
 * four rows stayed on screen and went disabled — greyed, `aria-disabled`,
 * "Open a workspace first" on hover. The reasoning was that a list whose
 * contents move depending on where you came from is a list you have to re-read
 * every time, and that was true as long as "no workspace" was a state the
 * console could be *stuck* in.
 *
 * It is not a state any more. `All Workspaces` is a scope — the one the URL
 * names whenever it names no workspace — and in it those four pages genuinely
 * do not exist: there is no cross-workspace board yet, and no workspace to
 * point one at. Showing them greyed was the console claiming otherwise. So the
 * band is drawn where its pages are, and absent where they are not; what keeps
 * the list from moving under you is that the *scope* is always on screen, in
 * the switcher above the page.
 *
 * Rows are links, not buttons calling `router.push`. That was the reason a
 * sidebar row could not be middle-clicked, opened in a new tab, or read as a
 * destination by anything that was not a mouse.
 */
export function SidebarNav({ slug }: { slug?: string }) {
  const pathname = usePathname();
  const scope: NavScope = slug ? "workspace" : "all";
  const pages = navPagesInScope(scope);

  return (
    <nav aria-label="Console" className="flex-1 overflow-y-auto px-3 pb-3">
      {(["workspace", "product"] as NavGroup[]).map((group) => {
        const rows = pages.filter((page) => page.group === group);
        // A band with nothing to draw in this scope drops its heading with it.
        // The heading is a group's placeholder only while the group is real.
        if (rows.length === 0) return null;
        return (
          <Group key={group} label={NAV_GROUP_LABEL[group]}>
            {rows.map((page) =>
              page.group === "workspace" && slug ? (
                <NavRow
                  key={page.key}
                  page={page}
                  href={page.href(slug)}
                  pathname={pathname}
                />
              ) : page.group === "product" ? (
                <NavRow
                  key={page.key}
                  page={page}
                  href={page.href()}
                  pathname={pathname}
                />
              ) : null,
            )}
          </Group>
        );
      })}
    </nav>
  );
}

function NavRow({
  page,
  href,
  pathname,
}: {
  page: NavPage;
  href: string;
  pathname: string;
}) {
  const state = isNavPageActive(pathname, href) ? "active" : "idle";
  return (
    <Link
      href={href}
      aria-current={state === "active" ? "page" : undefined}
      className={navRowClass(state)}
    >
      <page.icon className="size-4 shrink-0" strokeWidth={navIconStroke(state)} />
      <span className="min-w-0 flex-1 truncate">{page.label}</span>
    </Link>
  );
}

function Group({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4 first:mt-1">
      <p className="mb-1 px-2.5 text-micro font-semibold uppercase tracking-wide text-mute">
        {label}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}
