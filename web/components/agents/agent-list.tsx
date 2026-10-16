"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { Agent } from "@/lib/api";
import { agentStatus, workloadDetail } from "@/lib/agent-status";
import { paths } from "@/lib/paths";
import { ProviderIcon } from "@/components/provider-icon";
import { AgentHead } from "@/components/agents/agent-head";
import { AgentStatusBadge } from "@/components/status-dot";
import { WorkspaceAvatar } from "@/components/workspace-avatar";

/**
 * The agent roster, as a grouped list.
 *
 * One implementation for two pages: a workspace's agents (one group, no header)
 * and All Workspaces's (one group per workspace). A header is only drawn when
 * there is more than one group — inside a workspace you already know whose
 * roster this is, and saying it again is noise.
 *
 * Grouped rather than a Workspace column, which is what this was: a column that
 * repeats the same value down a run of rows is a header waiting to happen, and
 * the name is the thing you scan for. The mechanics are multica's table group
 * row — the header is a full-width row inside the same bordered surface, the
 * whole row toggles rather than just the chevron, and the count is tabular so a
 * column of them lines up.
 *
 * Rows keep every fact the table had, minus the workspace that is now the
 * header. The actions cell stays the caller's: editing and deleting an agent
 * belong to a workspace, and the aggregate page is not in one.
 */
export interface AgentGroup {
  key: string;
  /** Drawn as the group's header. Only read when there is more than one group. */
  name?: string;
  /** Where the header's roster link goes. Absent means no link is drawn. */
  slug?: string;
  agents: Agent[];
}


export function AgentList({
  groups,
  empty,
  renderActions,
}: {
  groups: AgentGroup[];
  /** Drawn inside the surface, under the header, when there are no rows — the
      filtered-to-nothing case, which reads better in place than as a bare
      paragraph where the list was. */
  empty?: ReactNode;
  renderActions?: (agent: Agent) => ReactNode;
}) {
  // In-memory on purpose for now: a collapse is about this reading, not about
  // the next visit. orca persists its set; that is a decision to make when
  // somebody asks for it.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const showHeaders = groups.length > 1;
  const rows = groups.reduce((n, group) => n + group.agents.length, 0);

  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (rows === 0) {
    return (
      <div className="overflow-hidden rounded-lg border border-hairline bg-canvas shadow-level-2">
        <p className="px-4 py-8 text-center text-caption text-mute">{empty}</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-hairline bg-canvas shadow-level-2">
      {groups.map((group) => {
        const isCollapsed = collapsed.has(group.key);
        return (
          <section key={group.key}>
            {showHeaders && (
              // A div, not a button: the roster link at the end cannot live
              // inside a button. The toggle takes the rest of the width, so
              // clicking the header anywhere but the link still collapses it.
              //
              // Not sticky, and it cannot be while the surface clips: the
              // rounded corners come from `overflow-hidden` on the wrapper, and
              // a sticky child of a clipping ancestor has no scrollport to
              // stick to. Making it sticky means rounding the first header and
              // the last row by hand instead — worth doing when a real roster
              // is long enough to lose its group header, not before.
              <div className="flex h-9 items-center gap-2 bg-muted/40 pr-3 hover:bg-muted/60">
                <button
                  type="button"
                  aria-expanded={!isCollapsed}
                  onClick={() => toggle(group.key)}
                  className="flex min-w-0 flex-1 items-center gap-2 px-3 text-left"
                >
                  {isCollapsed ? (
                    <ChevronRight className="size-3.5 shrink-0 text-mute" />
                  ) : (
                    <ChevronDown className="size-3.5 shrink-0 text-mute" />
                  )}
                  {group.slug && (
                    <WorkspaceAvatar name={group.name ?? ""} className="size-5" />
                  )}
                  <span className="truncate text-caption font-medium text-ink">
                    {group.name}
                  </span>
                  <span className="text-caption tabular-nums text-mute">
                    {group.agents.length}
                  </span>
                </button>
                {group.slug && (
                  // The one thing the rows below cannot do: open that
                  // workspace's roster, which is where an agent is edited.
                  // Always drawn — a word that says what it does does not need
                  // to be discovered by hovering.
                  <Link
                    href={paths.workspace(group.slug).agents()}
                    aria-label={`Open ${group.name}`}
                    className="shrink-0 rounded-sm px-1.5 py-0.5 text-caption text-mute transition-colors hover:bg-canvas hover:text-ink"
                  >
                    Open
                  </Link>
                )}
              </div>
            )}
            {!isCollapsed && (
              <ul role="list">
                {group.agents.map((agent) => (
                  <AgentRow key={agent.id} agent={agent} actions={renderActions?.(agent)} />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function AgentRow({ agent, actions }: { agent: Agent; actions?: ReactNode }) {
  const status = agentStatus(agent);
  // The full sentence ("GTS-42: fix the thing", "2 tasks queued") for the
  // tooltip; the row itself only has room for the key.
  const detail = workloadDetail(agent);
  return (
    <li
      role="listitem"
      className="flex h-9 items-center gap-3 border-b border-hairline px-4 transition-colors last:border-b-0 hover:bg-muted/40"
    >
      {/* One line, and the same composition as the reference's list row: the
          identity first (the face, then the name), then what the agent is for,
          with the standing facts packed at the right end. It was two lines —
          name over description — which made every row 60px and put the facts
          you scan for on a second baseline.

          One face, and it is whichever the agent was given: a picture if one is
          set, the robot otherwise — the create dialog asks for one or the other,
          so the row draws one or the other. Both are `size-7`, so the column
          keeps one edge whether an agent has a picture or not.

          The head is also the state: the visor works while the agent does,
          thinks while it queues, sits while it is free and sleeps while its
          machine is unreachable. The dot and the word at the right still say it
          — the head illustrates, the badge states — and a picture simply leaves
          that half to the badge. */}
      {agent.avatar_url ? (
        <WorkspaceAvatar
          name={agent.name}
          avatarUrl={agent.avatar_url}
          className="size-7 shrink-0"
        />
      ) : (
        <AgentHead shape={agent.head_shape} status={status} className="shrink-0" />
      )}
      <span className="shrink-0 truncate text-copy font-medium text-ink">
        @{agent.name}
      </span>
      {!agent.enabled && (
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-caption text-mute">
          disabled
        </span>
      )}
      {agent.description && (
        <span
          title={agent.description}
          className="min-w-0 truncate text-caption text-mute"
        >
          {agent.description}
        </span>
      )}
      {/* The spacer, not the description: it is what keeps the facts on the
          right, and it has to be there whether or not there is a description.
          The description is the one thing that shrinks when the row is tight. */}
      <span className="min-w-0 flex-1" />
      {agent.current_task?.issue_key && (
        <span
          title={detail ?? undefined}
          className="shrink-0 font-mono text-micro text-mute"
        >
          {agent.current_task.issue_key}
        </span>
      )}
      <AgentStatusBadge status={status} />
      <span className="flex shrink-0 items-center gap-1.5 text-caption text-body">
        <ProviderIcon
          provider={agent.runtime?.provider ?? ""}
          className="size-3.5 shrink-0"
        />
        <span className="truncate">{agent.runtime?.provider || "—"}</span>
      </span>
      <span className="hidden shrink-0 text-caption text-mute sm:inline">
        {agent.runtime?.daemon_name || "no daemon"}
      </span>
      {/* Only when it has run something. It was a labelled column with a header
          above it; on one line it would be a bare digit at the end of every row
          — and zero, which is most rows, is the default and does not need
          saying. */}
      {agent.total_runs > 0 && (
        <span className="shrink-0 font-mono text-caption tabular-nums text-mute">
          {agent.total_runs} run{agent.total_runs === 1 ? "" : "s"}
        </span>
      )}
      {actions}
    </li>
  );
}
