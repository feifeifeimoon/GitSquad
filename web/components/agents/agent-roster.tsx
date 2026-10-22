"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { Agent } from "@/lib/api";
import { agentStatus } from "@/lib/agent-status";
import { agentActivity, agentPresence } from "@/lib/agent-presence";
import { paths } from "@/lib/paths";
import { AgentHead } from "@/components/agents/agent-head";
import { AgentPresenceBadge } from "@/components/agents/agent-presence-badge";
import { ProviderIcon } from "@/components/provider-icon";
import { WorkspaceAvatar } from "@/components/workspace-avatar";

/**
 * The roster, as a list of agents rather than a table of them.
 *
 * Two lines per row: who it is (face, @name, what it is for), and the three
 * facts a roster is scanned for — what it is doing, whether it can run, and
 * where it runs. Runs were dropped: the number belongs on the agent's own page,
 * next to the history that explains it.
 *
 * The whole row opens the agent, and the identity is the real link (a stretched
 * `::after` does the rest), so middle-click and "open in a new tab" work. The
 * issue in the "doing" cell is the one link inside the row that must not go to
 * the agent, so it sits above the overlay on its own layer.
 *
 * One implementation serves both rosters: a workspace's agents are one group
 * with no header, and All Workspaces draws a collapsible header per workspace.
 */
export interface AgentGroup {
  key: string;
  /** Drawn as the group's header. Only read when there is more than one group. */
  name?: string;
  /** The workspace the group's agents belong to; the row's links are built from
   * it. Absent means each agent must carry its own `workspace_slug`. */
  slug?: string;
  agents: Agent[];
}

const GRID =
  "grid grid-cols-[34px_minmax(116px,1fr)_minmax(132px,1.35fr)_minmax(126px,150px)_minmax(136px,180px)] items-center gap-3 px-4";

export function AgentRoster({
  groups,
  empty,
}: {
  groups: AgentGroup[];
  /** Drawn inside the surface when the groups hold no rows. */
  empty?: React.ReactNode;
}) {
  // In-memory on purpose: a collapse is about this reading, not about the next
  // visit.
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
        <p className="px-4 py-10 text-center text-caption text-mute">{empty}</p>
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
                  <AgentRow
                    key={agent.id}
                    agent={agent}
                    slug={agent.workspace_slug ?? group.slug}
                  />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function AgentRow({ agent, slug }: { agent: Agent; slug?: string }) {
  const presence = agentPresence(agent);
  const activity = agentActivity(agent);
  const task = activity.kind === "issue" ? activity : null;
  const href = slug ? paths.workspace(slug).agent(agent.id) : null;
  const issueHref = slug && task ? paths.workspace(slug).issue(task.issueKey) : null;

  return (
    <li
      className={`relative ${GRID} border-b border-hairline py-2.5 transition-colors last:border-b-0 hover:bg-muted/40`}
    >
      {agent.avatar_url ? (
        <WorkspaceAvatar
          name={agent.name}
          avatarUrl={agent.avatar_url}
          className="size-7 shrink-0"
        />
      ) : (
        <AgentHead
          shape={agent.head_shape}
          status={agentStatus(agent)}
          className="shrink-0"
        />
      )}

      {/* Identity: the row's link. `after:` stretches its hit area over the
          whole row, which is why every other cell here is plain text. */}
      <div className="min-w-0">
        {href ? (
          <Link
            href={href}
            className="block min-w-0 after:absolute after:inset-0 after:content-['']"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-copy font-medium text-ink">
                @{agent.name}
              </span>
              {!agent.enabled && (
                <span className="shrink-0 rounded-full bg-muted px-1.5 py-px text-micro text-mute">
                  disabled
                </span>
              )}
            </span>
            <span className="block truncate text-caption text-mute">
              {agent.description || "No description"}
            </span>
          </Link>
        ) : (
          <span className="truncate text-copy font-medium text-ink">
            @{agent.name}
          </span>
        )}
      </div>

      {/* What it is doing: the issue, if there is one. Above the row overlay so
          it goes to the issue, not to the agent. */}
      <div className="min-w-0">
        {task ? (
          issueHref ? (
            <Link href={issueHref} className="relative z-10 block min-w-0">
              <span className="block truncate font-mono text-micro text-mute">
                {task.issueKey}
              </span>
              <span className="block truncate text-caption text-ink">
                {task.issueTitle || "Untitled issue"}
              </span>
            </Link>
          ) : (
            <>
              <span className="block truncate font-mono text-micro text-mute">
                {task.issueKey}
              </span>
              <span className="block truncate text-caption text-ink">
                {task.issueTitle || "Untitled issue"}
              </span>
            </>
          )
        ) : activity.kind === "review" ? (
          // A review run has no issue to name — the task carries a pull request
          // — so the cell says what it is rather than nothing.
          <span className="text-caption text-body">Reviewing a pull request</span>
        ) : (
          <span className="text-caption text-mute">
            {activity.kind === "queued" ? "Waiting to start" : "Nothing in flight"}
          </span>
        )}
      </div>

      <AgentPresenceBadge presence={presence} queued={agent.queued_count} />

      <span className="flex min-w-0 items-center gap-1.5 text-caption text-body">
        <ProviderIcon
          provider={agent.runtime?.provider ?? ""}
          className="size-3.5 shrink-0"
        />
        <span className="truncate">{agent.runtime?.provider || "no runtime"}</span>
        <span className="truncate text-mute">
          ({agent.runtime?.daemon_name || "no machine"})
        </span>
      </span>
    </li>
  );
}
