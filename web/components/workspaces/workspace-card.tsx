"use client";

import Link from "next/link";
import { Settings, ServerOff } from "lucide-react";
import { agentStatus, STATUS_DOT } from "@/lib/agent-status";
import { cn } from "@/lib/utils";
import { repoLabel } from "@/lib/overview";
import { agentChips, type WorkspaceCard as Card } from "@/lib/workspace-cards";
import { paths } from "@/lib/paths";
import { AgentHead } from "@/components/agents/agent-head";
import { WorkspaceAvatar } from "@/components/workspace-avatar";

// The issue bar's four segments, in board order. Backlog and todo share "Todo"
// because a card is a summary; the board is where the seven columns live.
const SEGMENTS = [
  { key: "queued", label: "Todo", bar: "bg-hairline-strong" },
  { key: "inProgress", label: "In progress", bar: "bg-warning" },
  { key: "inReview", label: "In review", bar: "bg-violet" },
  { key: "blocked", label: "Blocked", bar: "bg-destructive" },
] as const;

const CHIP_TONE = {
  working: STATUS_DOT.running,
  queued: STATUS_DOT.queued,
  idle: STATUS_DOT.idle,
} as const;

/**
 * A workspace, as a card: what it is, how its work is going, and whether its
 * team is running.
 *
 * The card used to carry the last commit message, which is the least useful
 * fact about a workspace in a product whose work happens in issues and agent
 * runs. The three blocks answer the three questions somebody opening this page
 * actually has — and the whole card is the way in, except the settings gear in
 * its corner.
 */
export function WorkspaceCardView({ card }: { card: Card }) {
  const { workspace, mix, agents, heads, offline } = card;
  const chips = agentChips(agents);
  const segments = SEGMENTS.filter((segment) => mix[segment.key] > 0);
  const href = paths.workspace(workspace.slug).overview();

  return (
    <div
      data-workspace-card={workspace.slug}
      className="group relative overflow-hidden rounded-lg border border-hairline bg-canvas shadow-level-2 transition-colors hover:border-hairline-strong"
    >
      <div className="flex items-start gap-2.5 px-3.5 py-3">
        <WorkspaceAvatar
          name={workspace.name}
          avatarUrl={workspace.avatar_url}
          className="size-8"
        />
        <div className="min-w-0 flex-1">
          {/* Stretched over the card: one link per card, and the gear sits
              above it on its own layer. */}
          <Link
            href={href}
            className="block truncate text-copy font-semibold text-ink after:absolute after:inset-0 after:content-['']"
          >
            {workspace.name}
          </Link>
          <p className="truncate font-mono text-micro text-mute">
            {repoLabel(workspace) || "No repository"}
          </p>
        </div>
      </div>

      <Link
        href={paths.workspace(workspace.slug).settings()}
        title="Workspace settings"
        aria-label={`${workspace.name} settings`}
        className="absolute right-2 top-2 z-10 rounded-md p-1.5 text-mute opacity-0 transition-opacity hover:bg-muted hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
      >
        <Settings className="size-3.5" />
      </Link>

      <div className="border-t border-hairline px-3.5 py-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-micro text-mute">Issues</span>
          {mix.open === 0 ? (
            <span className="text-caption text-mute">Nothing open</span>
          ) : (
            <span className="text-caption">
              <span className="font-medium text-ink">{mix.open} open</span>
              {mix.blocked > 0 && (
                <span className="text-warning"> · {mix.blocked} blocked</span>
              )}
            </span>
          )}
        </div>

        <div className="mt-1.5 flex h-1 gap-0.5 overflow-hidden rounded-full bg-canvas-soft-2">
          {segments.map((segment) => (
            <span
              key={segment.key}
              aria-hidden="true"
              className={cn("h-full rounded-full", segment.bar)}
              style={{ flexGrow: mix[segment.key], flexBasis: 0, minWidth: 2 }}
            />
          ))}
        </div>

        {segments.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-1 text-micro text-mute">
            {segments.map((segment) => (
              <span key={segment.key} className="inline-flex items-center gap-1">
                <span
                  aria-hidden="true"
                  className={cn("size-1.5 rounded-[1px]", segment.bar)}
                />
                {segment.label} {mix[segment.key]}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex min-h-11 flex-wrap items-center gap-2 border-t border-hairline px-3.5 py-2.5">
        {agents.enabled === 0 ? (
          <span className="text-caption text-mute">No agents</span>
        ) : (
          <>
            <span className="flex">
              {heads.map((agent, index) => (
                <span
                  key={agent.id}
                  className={cn("flex shrink-0", index > 0 && "-ml-1.5")}
                >
                  {agent.avatar_url ? (
                    <WorkspaceAvatar
                      name={agent.name}
                      avatarUrl={agent.avatar_url}
                      className="size-5 ring-2 ring-canvas"
                    />
                  ) : (
                    <AgentHead
                      shape={agent.head_shape}
                      status={agentStatus(agent)}
                      size={20}
                      paused
                      className="rounded-md ring-2 ring-canvas"
                    />
                  )}
                </span>
              ))}
            </span>

            {offline ? (
              // A machine that is down is the only thing on this line worth
              // acting on, so it replaces the counts rather than joining them.
              <span className="flex min-w-0 items-center gap-1.5 text-caption text-warning">
                <ServerOff className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">
                  {offline.name} offline
                  {offline.queued > 0 ? ` · ${offline.queued} queued` : ""}
                </span>
              </span>
            ) : (
              <span className="flex flex-wrap items-center gap-1">
                {chips.map((chip) => (
                  <span
                    key={chip.key}
                    className="inline-flex h-5 items-center gap-1.5 rounded-full bg-muted px-2 text-micro text-body"
                  >
                    <span
                      aria-hidden="true"
                      className={cn("size-1.5 rounded-full", CHIP_TONE[chip.key])}
                    />
                    {chip.count} {chip.label}
                  </span>
                ))}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

