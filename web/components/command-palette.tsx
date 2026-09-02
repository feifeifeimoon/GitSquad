"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FolderGit2,
  Monitor,
  Plus,
  Settings,
} from "lucide-react";
import { api, Workspace } from "@/lib/api";
import { WorkspaceAvatar } from "@/components/workspace-avatar";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  useEffect(() => {
    if (!open) return;
    api
      .get<Workspace[]>("/api/v1/workspaces")
      .then((d) => setWorkspaces(d || []))
      .catch(() => {});
  }, [open]);

  const run = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search…" />
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
        {workspaces.length > 0 && (
          <>
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
                  <span className="font-mono text-xs text-mute">
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
