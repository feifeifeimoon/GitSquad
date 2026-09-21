"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { FolderGit2, Monitor, Plus, Settings } from "lucide-react";
import { api, Workspace, Issue, issueApi } from "@/lib/api";
import { useApi } from "@/lib/query";
import { paths, workspaceSlugFromPath } from "@/lib/paths";
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

  const run = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  const currentIssues = wsId ? issueList ?? [] : [];

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search pages, workspaces, issues…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Pages">
          <CommandItem onSelect={() => run(paths.workspaces())}>
            <FolderGit2 className="size-4" />
            Workspaces
          </CommandItem>
          <CommandItem onSelect={() => run(paths.daemons())}>
            <Monitor className="size-4" />
            Daemons
          </CommandItem>
          <CommandItem onSelect={() => run(paths.settings())}>
            <Settings className="size-4" />
            Settings
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => run(paths.newWorkspace())}>
            <Plus className="size-4" />
            New Workspace
          </CommandItem>
        </CommandGroup>
        {wsId && currentIssues.length > 0 && (
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
      </CommandList>
    </CommandDialog>
  );
}
