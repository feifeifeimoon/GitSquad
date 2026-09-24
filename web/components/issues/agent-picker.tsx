"use client";

import { useRef, useState } from "react";
import { UserMinus } from "lucide-react";
import { toast } from "sonner";
import { agentApi, issueApi, type Agent, type IssueAgent } from "@/lib/api";
import { useApi } from "@/lib/query";
import { cn } from "@/lib/utils";

import { WorkspaceAvatar } from "@/components/workspace-avatar";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusDot } from "@/components/status-dot";
import { AgentChip } from "./agent-chip";
import { EmptySlot, ROW_TRIGGER } from "./property-row";

// Who works on this issue. Multi-select, because the product's premise is that
// several agents collaborate on one issue — an implementer and a reviewer are
// two rows here, not a single "owner".
//
// Picking only records ownership: it never starts a run. A run is started by
// mentioning an agent, which is the imperative form of the same idea; the two
// are deliberately different verbs, because a stray click in a menu must not
// cost a real task, branch and pull request. The line at the bottom of the menu
// says so, once.
//
// The list is every agent of the workspace, disabled ones included: hiding an
// agent that exists reads as "where did it go". Disabled rows cannot be picked
// and say why inline — a tooltip is out of reach on a disabled menu item, and
// the reason is worth more than a hover.
export function AgentPicker({
  slug,
  issueKey,
  agents,
  onSaved,
}: {
  slug: string;
  issueKey: string;
  agents: IssueAgent[];
  onSaved: () => void;
}) {
  // The same read the page already makes for @mention completion; the cache in
  // lib/query.ts hands them the one request.
  const { data: roster } = useApi<Agent[]>(
    `/api/v1/workspaces/${slug}/agents`,
    () => agentApi.list(slug),
  );
  const [open, setOpen] = useState(false);
  // The pending set is held in a ref as well as state: the close handler runs in
  // the same tick as the click that closed the menu, so reading the state there
  // would commit the previous render's set.
  const pending = useRef<Set<string> | null>(null);
  const [draft, setDraft] = useState<Set<string> | null>(null);

  const selected = draft ?? new Set(agents.map((a) => a.id));

  const setPending = (next: Set<string>) => {
    pending.current = next;
    setDraft(next);
  };

  // One request per visit to the menu, not one per click: three toggles would
  // otherwise leave three feed entries reading a → a,b → a,b,c.
  const commit = (next: Set<string>) => {
    const before = agents.map((a) => a.id).sort().join(",");
    const after = [...next].sort().join(",");
    if (before === after) return;
    issueApi
      .update(slug, issueKey, { agents: [...next] })
      .then(onSaved)
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : "Failed to update agents");
        onSaved();
      });
  };

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) return;
        const decided = pending.current;
        pending.current = null;
        setDraft(null);
        if (decided) commit(decided);
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          // Wider gap between chips than between an avatar and its own name:
          // two agents on one row would otherwise read as one long name.
          className={cn(ROW_TRIGGER, "flex-wrap gap-x-3")}
          aria-label={
            agents.length > 0
              ? `Agents: ${agents.map((a) => a.name).join(", ")}`
              : "Agents: none"
          }
        >
          {agents.length > 0 ? (
            agents.map((agent) => <AgentChip key={agent.id} agent={agent} />)
          ) : (
            <EmptySlot label="No agents" />
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-64">
        {/* pl-8 matches the checkbox rows' indicator gutter, so the clear row's
            icon lines up with the monograms below it rather than sitting a
            whole gutter to their left. */}
        <DropdownMenuItem className="pl-8" onSelect={() => setPending(new Set())}>
          <UserMinus className="size-3.5 text-mute" />
          <span className="text-mute">No agents</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-caption tracking-wider text-mute uppercase">
          Agents
        </DropdownMenuLabel>
        {roster && roster.length === 0 && (
          <DropdownMenuItem disabled>No agents in this workspace</DropdownMenuItem>
        )}
        {(roster ?? []).map((agent) => {
          const assigned = agents.find((a) => a.id === agent.id);
          return (
            <DropdownMenuCheckboxItem
              key={agent.id}
              // Radix closes a menu on select unless the event is prevented;
              // this one has to stay open to be multi-select.
              onSelect={(event) => {
                event.preventDefault();
                const next = new Set(selected);
                if (next.has(agent.id)) next.delete(agent.id);
                else next.add(agent.id);
                setPending(next);
              }}
              checked={selected.has(agent.id)}
              disabled={!agent.enabled}
            >
              <WorkspaceAvatar
                name={agent.name}
                avatarUrl={agent.avatar_url}
                className="size-4"
              />
              <span className={cn("truncate", !agent.enabled && "text-mute")}>
                {agent.name}
              </span>
              {assigned && assigned.state !== "idle" ? (
                <StatusDot
                  tone={assigned.state}
                  label={
                    assigned.state === "running"
                      ? "Working on this issue"
                      : "Queued for this issue"
                  }
                  className="ml-auto size-2"
                />
              ) : null}
              {!agent.enabled && (
                <span className="ml-auto shrink-0 text-caption text-mute">
                  disabled
                </span>
              )}
            </DropdownMenuCheckboxItem>
          );
        })}
        <DropdownMenuSeparator />
        <p className="px-2 py-1.5 text-caption text-mute">
          Assigning records ownership — mention an agent in a comment to start a
          run.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
