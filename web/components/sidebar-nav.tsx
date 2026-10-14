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
 * The bands used to be labelled ("WORKSPACE", "PRODUCT"). They are separated by
 * a hairline now, and the labels survive only for screen readers: two words set
 * in caps above six rows were doing the work a divider does, in a column that is
 * 240px wide and already says which workspace you are in, twice.
 *
 * The workspace band used to be unconditional: with no workspace in view its
 * four rows stayed on screen and went disabled — greyed, `aria-disabled`,
 * "Open a workspace first" on hover. That was true as long as "no workspace" was
 * a state the console could be stuck in. It is not one any more: `All
 * Workspaces` is a scope, and those four pages genuinely do not exist in it. So
 * the band is drawn where its pages are and absent where they are not.
 *
 * Rows are links, not buttons calling `router.push`. That was the reason a
 * sidebar row could not be middle-clicked, opened in a new tab, or read as a
 * destination by anything that was not a mouse.
 */
export function SidebarNav({ slug }: { slug?: string }) {
  const pathname = usePathname();
  const scope: NavScope = slug ? "workspace" : "all";
  const pages = navPagesInScope(scope);
  const bands = (["workspace", "product"] as NavGroup[])
    .map((group) => ({ group, rows: pages.filter((page) => page.group === group) }))
    // A band with nothing to draw in this scope carries no divider either.
    .filter((band) => band.rows.length > 0);

  return (
    <nav aria-label="Console" className="flex-1 overflow-y-auto px-3 pb-3 pt-1">
      {bands.map((band, index) => (
        <div
          key={band.group}
          className={index > 0 ? "mt-2 border-t border-hairline pt-2" : ""}
        >
          <h2 className="sr-only">{NAV_GROUP_LABEL[band.group]}</h2>
          <div className="space-y-0.5">
            {band.rows.map((page) =>
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
          </div>
        </div>
      ))}
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
