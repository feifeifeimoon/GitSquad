"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { Agent } from "@/lib/api";
import { agentStatus, workloadDetail } from "@/lib/agent-status";
import { paths } from "@/lib/paths";
import { ProviderIcon } from "@/components/provider-icon";
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
  const detail = workloadDetail(agent);
  return (
    <li
      role="listitem"
      className="flex items-center gap-3 border-b border-hairline px-4 py-2.5 transition-colors last:border-b-0 hover:bg-muted/40"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <WorkspaceAvatar
          name={agent.name}
          avatarUrl={agent.avatar_url}
          className="size-8 shrink-0"
        />
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-medium text-ink">@{agent.name}</span>
            {!agent.enabled && (
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-caption text-mute">
                disabled
              </span>
            )}
          </div>
          {agent.description && (
            <p className="truncate text-caption text-mute">{agent.description}</p>
          )}
        </div>
      </div>

      {/* Fixed widths rather than the table's column sizing: a flex row does not
          align itself across rows, and four of these stack into a column you
          read down. */}
      <div className="hidden w-40 shrink-0 sm:block">
        <AgentStatusBadge status={status} />
        {detail && (
          <p className="mt-0.5 truncate text-caption text-mute" title={detail}>
            {detail}
          </p>
        )}
      </div>

      <div className="hidden w-36 shrink-0 lg:block">
        <span className="flex min-w-0 items-center gap-1.5 text-caption text-body">
          <ProviderIcon
            provider={agent.runtime?.provider ?? ""}
            className="size-3.5 shrink-0"
          />
          <span className="truncate">{agent.runtime?.provider || "—"}</span>
        </span>
        <p className="truncate text-caption text-mute">
          {agent.runtime?.daemon_name || "no daemon"}
        </p>
      </div>

      <div className="hidden w-28 shrink-0 xl:block">
        <span className="truncate font-mono text-caption text-body">
          {agent.model || "default"}
        </span>
      </div>

      <span className="w-8 shrink-0 text-right font-mono text-caption tabular-nums text-body">
        {agent.total_runs}
      </span>

      {actions}
    </li>
  );
}
