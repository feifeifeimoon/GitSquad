"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Plus, UserCog } from "lucide-react";
import { api, Workspace, Issue, issueApi } from "@/lib/api";
import { useApi } from "@/lib/query";
import { paths, workspaceSlugFromPath } from "@/lib/paths";
import { NAV_PAGES } from "@/lib/nav";
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const wsId = workspaceSlugFromPath(pathname);
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

  // The Pages group is the nav registry, not a copy of it. It was a
  // hand-written list of three, and it had already gone stale: Usage was in the
  // sidebar but unreachable from here, and its "Settings" opened the account
  // page while the sidebar's opened the workspace one. A page added to the
  // registry is now reachable from both surfaces, under the same name.
  const pageItems = useMemo(
    () =>
      NAV_PAGES.flatMap((page) => {
        if (page.scope === "workspace") {
          if (!wsId) return [];
          return [
            { key: page.key, label: page.label, Icon: page.icon, href: page.href(wsId) },
          ];
        }
        return [
          { key: page.key, label: page.label, Icon: page.icon, href: page.href() },
        ];
      }),
    [wsId],
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
  const currentIssues = wsId ? issueList : [];

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
        {searching && wsId && currentIssues.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Issues">
              {currentIssues.map((issue) => (
                <CommandItem
                  key={issue.id}
                  value={`${issue.issue_key} ${issue.title}`}
                  onSelect={() =>
                    run(paths.workspace(wsId).issue(issue.issue_key))
                  }
                >
                  <StatusIcon status={issue.status} />
                  <span className="shrink-0 font-mono text-caption text-mute">
                    {issue.issue_key}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{issue.title}</span>
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
