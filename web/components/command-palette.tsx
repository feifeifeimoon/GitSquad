"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { FolderGit2, Monitor, Plus, Settings } from "lucide-react";
import { api, Workspace, Issue, issueApi } from "@/lib/api";
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

interface WorkspaceIssues {
  wsId: string;
  items: Issue[];
}

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [issues, setIssues] = useState<WorkspaceIssues | null>(null);

  const wsMatch = pathname?.match(/^\/console\/workspaces\/([^/]+)/);
  const wsId = wsMatch ? decodeURIComponent(wsMatch[1]) : null;

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

  useEffect(() => {
    if (!open) return;
    api
      .get<Workspace[]>("/api/v1/workspaces")
      .then((d) => setWorkspaces(d || []))
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open || !wsId) return;
    let cancelled = false;
    issueApi
      .list(wsId)
      .then((d) => {
        if (!cancelled) setIssues({ wsId, items: d });
      })
      .catch(() => {
        if (!cancelled) setIssues({ wsId, items: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [open, wsId]);

  const run = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  const currentIssues = issues && issues.wsId === wsId ? issues.items : [];

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search pages, workspaces, issues…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Pages">
          <CommandItem onSelect={() => run("/console/workspaces")}>
            <FolderGit2 className="size-4" />
            Workspaces
          </CommandItem>
          <CommandItem onSelect={() => run("/console/daemons")}>
            <Monitor className="size-4" />
            Daemons
          </CommandItem>
          <CommandItem onSelect={() => run("/console/settings")}>
            <Settings className="size-4" />
            Settings
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => run("/console/workspaces/new")}>
            <Plus className="size-4" />
            New Workspace
          </CommandItem>
        </CommandGroup>
        {currentIssues.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Issues">
              {currentIssues.map((issue) => (
                <CommandItem
                  key={issue.id}
                  value={`${issue.issue_key} ${issue.title}`}
                  onSelect={() =>
                    run(`/console/workspaces/${wsId}/issues/${issue.id}`)
                  }
                >
                  <StatusIcon status={issue.status} />
                  <span className="shrink-0 font-mono text-xs text-mute">
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
              onSelect={() => run(`/console/workspaces/${w.id}`)}
            >
              <WorkspaceAvatar
                name={w.name}
                avatarUrl={w.avatar_url}
                className="size-4"
              />
              <span className="min-w-0 flex-1 truncate">{w.name}</span>
              <span className="shrink-0 font-mono text-xs text-mute">
                {w.repo_full_name || `${w.repo_owner}/${w.repo_name}`}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
