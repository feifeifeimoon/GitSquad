"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  isNavPageActive,
  navIconStroke,
  navRowClass,
  PRODUCT_PAGES,
  SCOPE_LABEL,
  WORKSPACE_PAGES,
  type NavPage,
} from "@/lib/nav";

/**
 * The destinations, in two groups that are always both drawn.
 *
 * The workspace group used to be conditional on having a workspace in view —
 * three rows and their divider disappeared together whenever you landed on a
 * page the console does not consider workspace-scoped, and everything below
 * jumped up. A list whose contents move depending on where you came from is a
 * list you have to re-read every time. Instead the rows stay and go disabled,
 * which is also the honest thing to show: those pages exist, you just have no
 * workspace open.
 *
 * Rows are links, not buttons calling `router.push`. That was the reason a
 * sidebar row could not be middle-clicked, opened in a new tab, or read as a
 * destination by anything that was not a mouse.
 */
export function SidebarNav({ slug }: { slug?: string }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Console" className="flex-1 overflow-y-auto px-3 pb-3">
      <Group label={SCOPE_LABEL.workspace}>
        {WORKSPACE_PAGES.map((page) =>
          slug ? (
            <NavRow
              key={page.key}
              page={page}
              href={page.href(slug)}
              pathname={pathname}
            />
          ) : (
            <span
              key={page.key}
              aria-disabled="true"
              title="Open a workspace first"
              className={navRowClass("disabled")}
            >
              <page.icon className="size-4 shrink-0" strokeWidth={1.75} />
              {page.label}
            </span>
          ),
        )}
      </Group>

      <Group label={SCOPE_LABEL.product}>
        {PRODUCT_PAGES.map((page) => (
          <NavRow
            key={page.key}
            page={page}
            href={page.href()}
            pathname={pathname}
          />
        ))}
      </Group>
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
      {/* The label is the group's placeholder as well as its heading: it is
          drawn whether or not the rows under it can be used. */}
      <p className="mb-1 px-2.5 text-micro font-semibold uppercase tracking-wide text-mute">
        {label}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}
