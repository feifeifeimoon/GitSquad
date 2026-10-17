import type { Agent, Issue, IssueStatus, Workspace } from "@/lib/api";
import { agentStatus, type AgentStatus } from "@/lib/agent-status";

// The overview's arithmetic, kept out of the page so it can be tested without
// rendering. Everything here reads the same rows the board and the roster read
// — the overview is a view, not a second source of truth.

/** Statuses that mean work is still owed. Done and cancelled are the two ends. */
export function isOpenIssue(issue: Pick<Issue, "status">): boolean {
  return issue.status !== "done" && issue.status !== "cancelled";
}

/** The statuses worth showing in "what is happening right now". */
export const ACTIVE_STATUSES: IssueStatus[] = [
  "in_progress",
  "in_review",
  "blocked",
];

export interface OverviewStats {
  open: number;
  inProgress: number;
  inReview: number;
  blocked: number;
}

/** The four numbers in the strip above the page. */
export function overviewStats(issues: Issue[]): OverviewStats {
  const stats: OverviewStats = {
    open: 0,
    inProgress: 0,
    inReview: 0,
    blocked: 0,
  };
  for (const issue of issues) {
    if (isOpenIssue(issue)) stats.open += 1;
    if (issue.status === "in_progress") stats.inProgress += 1;
    else if (issue.status === "in_review") stats.inReview += 1;
    else if (issue.status === "blocked") stats.blocked += 1;
  }
  return stats;
}

/**
 * The issues in flight, most recently touched first. Backlog and todo are left
 * out on purpose: they are the board's queue, not the overview's subject.
 */
export function activeIssues(issues: Issue[], limit = 6): Issue[] {
  return issues
    .filter((issue) => ACTIVE_STATUSES.includes(issue.status))
    .sort((a, b) => {
      if (a.updated_at === b.updated_at) return 0;
      return a.updated_at < b.updated_at ? 1 : -1;
    })
    .slice(0, limit);
}

const STATUS_RANK: Record<AgentStatus, number> = {
  running: 0,
  queued: 1,
  idle: 2,
  offline: 3,
};

/**
 * The enabled squad, busiest first, ties broken by name. Disabled agents are
 * left out: they are part of the configuration, not of what is running.
 */
export function squad(agents: Agent[], limit = 5): Agent[] {
  return agents
    .filter((agent) => agent.enabled)
    .sort((a, b) => {
      const byStatus = STATUS_RANK[agentStatus(a)] - STATUS_RANK[agentStatus(b)];
      if (byStatus !== 0) return byStatus;
      return a.name.localeCompare(b.name);
    })
    .slice(0, limit);
}

/** `owner/repo`, falling back to the split fields when the joined one is empty. */
export function repoLabel(
  workspace: Pick<Workspace, "repo_owner" | "repo_name" | "repo_full_name">,
): string {
  const full = workspace.repo_full_name.trim();
  if (full) return full;
  const owner = workspace.repo_owner.trim();
  const name = workspace.repo_name.trim();
  return owner && name ? `${owner}/${name}` : "";
}

/** The repository's GitHub URL, or null when no repository is linked. */
export function repoUrl(
  workspace: Pick<Workspace, "repo_owner" | "repo_name" | "repo_full_name">,
): string | null {
  const label = repoLabel(workspace);
  return label ? `https://github.com/${label}` : null;
}
