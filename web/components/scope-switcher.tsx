"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, LayoutGrid, Plus, Search } from "lucide-react";
import type { Workspace } from "@/lib/api";
import { scopeTargetHref } from "@/lib/nav";
import { paths } from "@/lib/paths";
import { WorkspaceAvatar } from "@/components/workspace-avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Which workspace the console is in — the scope control, above the page.
 *
 * It sits in the content area rather than in the sidebar header because that is
 * what it scopes: everything below it, not the navigation beside it. Vercel
 * splits the same idea across two switchers (team at the top of the sidebar,
 * project at the top of the page) and we have no team, so this is the one that
 * survived the collapse.
 *
 * Its value is never empty. With no workspace in the URL the scope is
 * `All Workspaces` — not "nothing selected" — which is what lets the sidebar
 * draw the pages that exist there instead of greying out the ones that do not.
 */
export function ScopeSwitcher({
  slug,
  pathname,
  workspaces,
}: {
  slug?: string;
  /** Where you are, so the menu can offer the same page in the other scope. */
  pathname: string;
  workspaces: Workspace[];
}) {
  const [open, setOpen] = useState(false);
  const current = slug ? workspaces.find((w) => w.slug === slug) : undefined;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        {/* No aria-label on purpose: the visible text already names the scope,
            and a label that repeats it just gives the control two names. */}
        <button className="flex h-8 items-center gap-2 rounded-md pl-1 pr-2 text-copy font-medium text-ink outline-none transition-colors hover:bg-muted/60">
          {slug ? (
            current ? (
              <>
                <WorkspaceAvatar
                  name={current.name}
                  avatarUrl={current.avatar_url}
                  className="size-5"
                />
                <span className="max-w-[18rem] truncate">{current.name}</span>
              </>
            ) : (
              // The slug is known but the list has not landed yet. Drawing
              // "All Workspaces" here would name the wrong scope for a frame.
              <Skeleton className="h-4 w-28" />
            )
          ) : (
            <>
              <LayoutGrid className="size-4 text-mute" />
              <span>All Workspaces</span>
            </>
          )}
          <ChevronsUpDown className="size-3.5 shrink-0 text-mute" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <ScopeMenu
          slug={slug}
          pathname={pathname}
          workspaces={workspaces}
          onDone={() => setOpen(false)}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The menu's body, as its own component so the query is state of the *content*
 * rather than of the switcher: the content unmounts when it closes, which is
 * what resets the field. A query that survived would filter the next open.
 */
function ScopeMenu({
  slug,
  pathname,
  workspaces,
  onDone,
}: {
  slug?: string;
  pathname: string;
  workspaces: Workspace[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return workspaces;
    return workspaces.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        w.slug.toLowerCase().includes(q) ||
        w.repo_full_name.toLowerCase().includes(q),
    );
  }, [workspaces, query]);

  const go = (href: string) => {
    onDone();
    router.push(href);
  };

  return (
    <>
      <div className="relative p-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-mute" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            // Escape is the menu's (it closes it). Everything else is the
            // field's — Radix's menu would otherwise read typing as typeahead
            // and move the highlight out from under the caret.
            if (e.key === "Escape") return;
            e.stopPropagation();
            if (e.key !== "Enter") return;
            // "type two letters, Enter" has to work without reaching for the
            // mouse: the first match is what the field is narrowing towards.
            if (filtered[0]) {
              go(scopeTargetHref(pathname, slug ?? null, filtered[0].slug));
            } else {
              go(paths.workspaces());
            }
          }}
          placeholder="Find workspace…"
          className="h-8 w-full rounded-sm border border-hairline bg-canvas pl-8 pr-2 text-copy text-ink outline-none placeholder:text-mute focus:border-hairline-strong"
        />
      </div>

      <DropdownMenuItem asChild>
        <Link href={scopeTargetHref(pathname, slug ?? null, null)}>
          <LayoutGrid className="size-4 text-mute" />
          <span className="min-w-0 flex-1 truncate">All Workspaces</span>
          {!slug && <Check className="size-4 shrink-0 text-ink" />}
        </Link>
      </DropdownMenuItem>

      {filtered.map((w) => (
        <DropdownMenuItem key={w.id} asChild>
          <Link href={scopeTargetHref(pathname, slug ?? null, w.slug)}>
            <WorkspaceAvatar
              name={w.name}
              avatarUrl={w.avatar_url}
              className="size-5"
            />
            <span className="min-w-0 flex-1 truncate">{w.name}</span>
            {slug === w.slug && <Check className="size-4 shrink-0 text-ink" />}
          </Link>
        </DropdownMenuItem>
      ))}

      {filtered.length === 0 && (
        <p className="px-2 py-1.5 text-caption text-mute">No workspaces match</p>
      )}

      <DropdownMenuSeparator />

      <DropdownMenuItem asChild>
        <Link href={paths.newWorkspace()}>
          <Plus className="size-4" />
          Create workspace
        </Link>
      </DropdownMenuItem>
    </>
  );
}
