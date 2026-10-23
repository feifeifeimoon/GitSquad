import type { Agent, Issue, Workspace } from "./api";
import {
  agentRoster,
  agentSummary,
  issueMix,
  type AgentSummary,
  type IssueMix,
} from "./overview";

// What a workspace card shows, worked out away from the rendering.
//
// Three questions, in the order the card answers them: what is this (identity),
// how is its work going (the issue mix), and is its team running (the agents).
// Everything here reads rows the board and the roster already read — the card is
// a view of them, not another source of truth.

export interface OfflineMachine {
  name: string;
  /** Tasks the agents on that machine have waiting. */
  queued: number;
}

export interface WorkspaceCard {
  workspace: Workspace;
  mix: IssueMix;
  agents: AgentSummary;
  /** Enabled agents, busiest first — the heads the card draws. */
  heads: Agent[];
  /**
   * The machine that is down, if one is. A card says so in amber instead of
   * listing its agents' states: "offline + 2 queued" is the only thing worth
   * acting on.
   */
  offline: OfflineMachine | null;
  /** The most recent timestamp among its issues, or the workspace's own. */
  lastActiveAt: string;
}

/** Newest first, so "last active" needs no second pass. */
function newest(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

/**
 * One card per workspace, in the order the list arrived.
 *
 * Issues and agents come from the two cross-workspace aggregates, so this is a
 * fold, not a query: one pass over each, then one pass over the workspaces.
 */
export function workspaceCards(
  workspaces: Workspace[],
  issues: Issue[],
  agents: Agent[],
): WorkspaceCard[] {
  // Grouped by slug, not id: the cross-workspace reads carry the slug (it is
  // what a row needs to link back) and the workspace list has it too.
  const issuesBy = new Map<string, Issue[]>();
  for (const issue of issues) {
    const key = issue.workspace_slug ?? "";
    const list = issuesBy.get(key) ?? [];
    list.push(issue);
    issuesBy.set(key, list);
  }

  const agentsBy = new Map<string, Agent[]>();
  for (const agent of agents) {
    const key = agent.workspace_slug ?? "";
    const list = agentsBy.get(key) ?? [];
    list.push(agent);
    agentsBy.set(key, list);
  }

  return workspaces.map((workspace) => {
    const wsIssues = issuesBy.get(workspace.slug) ?? [];
    const wsAgents = agentsBy.get(workspace.slug) ?? [];

    let lastActiveAt = workspace.last_commit_at || workspace.created_at;
    for (const issue of wsIssues) lastActiveAt = newest(lastActiveAt, issue.updated_at);

    // Enabled agents on a machine that is not reachable. Grouped by machine so
    // the card can name it, and summed so it can say how much is waiting.
    let offline: OfflineMachine | null = null;
    for (const agent of wsAgents) {
      if (!agent.enabled) continue;
      const runtime = agent.runtime;
      if (runtime?.daemon_id && runtime.daemon_status === "online") continue;
      const name = runtime?.daemon_name || "Its machine";
      offline ??= { name, queued: 0 };
      offline.queued += agent.queued_count;
    }

    return {
      workspace,
      mix: issueMix(wsIssues),
      agents: agentSummary(wsAgents),
      heads: agentRoster(wsAgents, 3),
      offline,
      lastActiveAt,
    };
  });
}

/**
 * The chips a card shows for its agents: one per state that has anybody in it,
 * busiest first. Offline agents are counted by the card's amber machine line
 * instead — two ways of saying the same thing would be one too many.
 */
export interface AgentChip {
  key: "working" | "queued" | "idle";
  label: string;
  count: number;
}

export function agentChips(summary: AgentSummary): AgentChip[] {
  const chips: AgentChip[] = [];
  if (summary.running > 0) {
    chips.push({ key: "working", label: "working", count: summary.running });
  }
  if (summary.queued > 0) {
    chips.push({ key: "queued", label: "queued", count: summary.queued });
  }
  if (summary.idle > 0) {
    chips.push({ key: "idle", label: "idle", count: summary.idle });
  }
  return chips;
}
