"use client";

import type { ReactNode } from "react";
import type { Agent } from "@/lib/api";
import { agentStatus, workloadDetail } from "@/lib/agent-status";
import { paths } from "@/lib/paths";
import { ProviderIcon } from "@/components/provider-icon";
import { AgentStatusBadge } from "@/components/status-dot";
import { WorkspaceAvatar } from "@/components/workspace-avatar";
import { TH_CLASS } from "@/components/table-sort";
import Link from "next/link";

/**
 * The agent roster, as a table. One implementation for two pages: a workspace's
 * agents, and All Workspaces's.
 *
 * The column that differs is decided by the data, not by a prop. A row carries
 * `workspace_slug` only on the cross-workspace read — the endpoint inside one
 * workspace has nothing to disambiguate — so the table draws the Workspace
 * column exactly when the rows can answer it. Same rule as the board card's,
 * which is why the two reads fill the field in different places.
 *
 * The trailing actions cell is the caller's, because the two pages do different
 * things with a row: inside a workspace it is edit and delete, and across
 * workspaces it is nothing — those mutations all need a workspace, and this
 * table is not in one. No `renderActions` means no cell, not an empty one.
 */
export function AgentTable({
  agents,
  empty,
  renderActions,
}: {
  agents: Agent[];
  /** Drawn inside the card, under the header, when there are no rows — the
      filtered-to-nothing case, which reads better in place than as a bare
      paragraph where the table was. */
  empty?: ReactNode;
  renderActions?: (agent: Agent) => ReactNode;
}) {
  const crossWorkspace = agents.some((a) => a.workspace_slug);

  return (
    <div className="overflow-hidden rounded-lg border border-hairline bg-canvas shadow-level-2">
      <table className="w-full border-collapse text-copy">
        <thead>
          <tr className="border-b border-hairline bg-canvas-soft">
            <th className={TH_CLASS}>Agent</th>
            {crossWorkspace && <th className={TH_CLASS}>Workspace</th>}
            <th className={TH_CLASS}>Status</th>
            <th className={TH_CLASS}>Runtime</th>
            <th className={`${TH_CLASS} hidden lg:table-cell`}>Model</th>
            <th className={`${TH_CLASS} hidden text-right sm:table-cell`}>Runs</th>
            {renderActions && <th className={`${TH_CLASS} text-right`}></th>}
          </tr>
        </thead>
        <tbody>
          {agents.map((agent) => (
            <AgentRow
              key={agent.id}
              agent={agent}
              crossWorkspace={crossWorkspace}
              actions={renderActions?.(agent)}
            />
          ))}
        </tbody>
      </table>
      {agents.length === 0 && empty ? (
        <p className="px-4 py-8 text-center text-caption text-mute">{empty}</p>
      ) : null}
    </div>
  );
}

function AgentRow({
  agent,
  crossWorkspace,
  actions,
}: {
  agent: Agent;
  crossWorkspace: boolean;
  actions?: ReactNode;
}) {
  const status = agentStatus(agent);
  const detail = workloadDetail(agent);
  return (
    <tr className="border-b border-hairline last:border-b-0 transition-colors hover:bg-muted/40">
      <td className="px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <WorkspaceAvatar
            name={agent.name}
            avatarUrl={agent.avatar_url}
            className="size-8"
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
      </td>
      {crossWorkspace && (
        <td className="px-4 py-3">
          {/* A link, and to that workspace's roster rather than to the agent:
              there is no agent detail page, and the roster is where it can be
              edited. */}
          {agent.workspace_slug ? (
            <Link
              href={paths.workspace(agent.workspace_slug).agents()}
              className="flex min-w-0 items-center gap-2 text-body transition-colors hover:text-ink"
            >
              <WorkspaceAvatar name={agent.workspace_name ?? ""} className="size-5" />
              <span className="truncate">{agent.workspace_name}</span>
            </Link>
          ) : null}
        </td>
      )}
      <td className="px-4 py-3">
        <AgentStatusBadge status={status} />
        {/* The current issue is a second line so the row stays narrow while
            still naming what the agent is actually working on. */}
        {detail && (
          <p className="mt-0.5 truncate text-caption text-mute" title={detail}>
            {detail}
          </p>
        )}
      </td>
      <td className="px-4 py-3">
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
      </td>
      <td className="hidden px-4 py-3 lg:table-cell">
        <span className="font-mono text-caption text-body">
          {agent.model || "default"}
        </span>
      </td>
      <td className="hidden px-4 py-3 text-right font-mono text-caption tabular-nums text-body sm:table-cell">
        {agent.total_runs}
      </td>
      {actions ? <td className="px-4 py-3">{actions}</td> : null}
    </tr>
  );
}
