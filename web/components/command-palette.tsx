"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, UserCog } from "lucide-react";
import { api, Workspace, Issue, issueApi } from "@/lib/api";
import { useApi } from "@/lib/query";
import { paths } from "@/lib/paths";
import { navPageHref, navPagesInScope, type NavScope } from "@/lib/nav";
import { WorkspaceAvatar } from "@/components/workspace-avatar";
import { StatusIcon } from "@/components/status-icon";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";

export function CommandPalette({
  open,
  onOpenChange,
  slug,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The console's scope, from the shell. This used to derive it from the
      pathname itself, which is how the palette and the sidebar came to
      disagree about which pages exist. */
  slug?: string;
}) {
  const router = useRouter();
  const wsId = slug;
  const scope: NavScope = slug ? "workspace" : "all";
  const [query, setQuery] = useState("");

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open, onOpenChange]);

  // Read through the cache rather than on open. Both of these used to be
  // re-fetched every single time the palette was opened — including the whole
  // issue list of the workspace — which made the one thing meant to be instant
  // the slowest thing in the console.
  const { data: workspaces = [] } = useApi<Workspace[]>("/api/v1/workspaces", () =>
    api.get<Workspace[]>("/api/v1/workspaces"),
  );
  const { data: issueList = [] } = useApi<Issue[]>(
    wsId ? `/api/v1/workspaces/${wsId}/issues` : null,
    () => issueApi.list(wsId as string),
  );
  // With no workspace in scope there is still a list of issues to search: the
  // one across every workspace, which is what the board in that scope reads.
  // The placeholder has always promised "pages, workspaces, issues" — in the
  // aggregate scope it was promising something it did not do.
  const { data: allIssues = [] } = useApi<Issue[]>(
    wsId ? null : "/api/v1/issues",
    () => issueApi.listAll(),
  );
  // The destination is resolved once, here: across workspaces the key alone is
  // not an address, so the slug has to come from the issue itself.
  const issueItems = useMemo(
    () =>
      (wsId ? issueList : allIssues).flatMap((issue) => {
        const slug = wsId ?? issue.workspace_slug;
        if (!slug) return [];
        return [
          {
            issue,
            href: paths.workspace(slug).issue(issue.issue_key),
            workspaceName: wsId ? "" : (issue.workspace_name ?? ""),
          },
        ];
      }),
    [wsId, issueList, allIssues],
  );

  // The Pages group is the nav registry, not a copy of it. It was a
  // hand-written list of three, and it had already gone stale: Usage was in the
  // sidebar but unreachable from here, and its "Settings" opened the account
  // page while the sidebar's opened the workspace one. A page added to the
  // registry is now reachable from both surfaces, under the same name, at the
  // same href for the scope you are in, and in the same scopes — so "Pages"
  // holds exactly what the sidebar holds.
  const pageItems = useMemo(
    () =>
      navPagesInScope(scope).flatMap((page) => {
        const href = navPageHref(page, wsId ?? null);
        if (!href) return [];
        return [{ key: page.key, label: page.label, Icon: page.icon, href }];
      }),
    [scope, wsId],
  );

  const run = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  // Lists of *things* stay out of the way until asked for. cmdk matches
  // everything against an empty query, so opening the palette on a workspace
  // with a few hundred issues used to draw all of them — the fastest surface in
  // the console, arriving as its longest page.
  const searching = query.trim() !== "";

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Search pages, workspaces, issues…"
      />
      <CommandList>
        <CommandEmpty>
          Nothing matches. Try a page name, a workspace, or an issue key.
        </CommandEmpty>
        <CommandGroup heading="Pages">
          {pageItems.map(({ key, label, Icon, href }) => (
            <CommandItem
              key={key}
              value={label}
              onSelect={() => run(href)}
            >
              <Icon className="size-4" />
              {label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => run(paths.newWorkspace())}>
            <Plus className="size-4" />
            New Workspace
          </CommandItem>
          {/* Not a page of the registry, and deliberately not one: the account
              settings belong behind the avatar rather than in the product's
              navigation. But the palette is where you look when you cannot find
              something, so it has to be reachable here too. */}
          <CommandItem onSelect={() => run(paths.settings())}>
            <UserCog className="size-4" />
            Account settings
          </CommandItem>
        </CommandGroup>
        {searching && issueItems.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Issues">
              {issueItems.map(({ issue, href, workspaceName }) => (
                <CommandItem
                  key={issue.id}
                  // The workspace is part of what the item matches on, not just
                  // what it shows: in the aggregate scope the key alone does not
                  // identify an issue, and typing a workspace name is a
                  // reasonable way to ask for its issues.
                  value={`${issue.issue_key} ${issue.title} ${workspaceName}`}
                  onSelect={() => run(href)}
                >
                  <StatusIcon status={issue.status} />
                  <span className="shrink-0 font-mono text-caption text-mute">
                    {issue.issue_key}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{issue.title}</span>
                  {workspaceName && (
                    <span className="shrink-0 truncate text-caption text-mute">
                      {workspaceName}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
        {searching && workspaces.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Workspaces">
              {workspaces.map((w) => (
                <CommandItem
                  key={w.id}
                  value={`${w.name} ${w.repo_full_name || ""}`}
                  onSelect={() => run(paths.workspace(w.slug).board())}
                >
                  <WorkspaceAvatar
                    name={w.name}
                    avatarUrl={w.avatar_url}
                    className="size-4"
                  />
                  <span className="min-w-0 flex-1 truncate">{w.name}</span>
                  <span className="shrink-0 font-mono text-caption text-mute">
                    {w.repo_full_name || `${w.repo_owner}/${w.repo_name}`}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
