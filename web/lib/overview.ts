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

/** The window the overview's "recent" lists and intake bars cover. */
export const OVERVIEW_WINDOW_DAYS = 7;

const DAY_MS = 86_400_000;

/** A stable local-day key. Bucketing by calendar day rather than by 24-hour
 * spans keeps the bars on the days the reader would call them, including
 * across a DST change. */
function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export interface WeeklyIntake {
  /** Seven counts, oldest day first, today last. */
  buckets: number[];
  total: number;
}

/**
 * Issues created on each of the last seven local days, oldest first.
 *
 * `created_at` is immutable, so this is real intake history rather than a
 * snapshot: editing an issue does not move it to today. Done and cancelled
 * issues count too — the question is how much work arrived, not how much is
 * still open.
 */
export function weeklyCreated(
  issues: Issue[],
  now: Date = new Date(),
): WeeklyIntake {
  const buckets = Array.from({ length: OVERVIEW_WINDOW_DAYS }, () => 0);
  const index = new Map<string, number>();
  for (let i = 0; i < OVERVIEW_WINDOW_DAYS; i++) {
    const day = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - (OVERVIEW_WINDOW_DAYS - 1 - i),
    );
    index.set(dayKey(day), i);
  }

  for (const issue of issues) {
    const created = new Date(issue.created_at);
    if (Number.isNaN(created.getTime())) continue;
    const bucket = index.get(dayKey(created));
    if (bucket !== undefined) buckets[bucket] += 1;
  }

  return {
    buckets,
    total: buckets.reduce((sum, count) => sum + count, 0),
  };
}

export interface IssueMix {
  queued: number;
  inProgress: number;
  inReview: number;
  blocked: number;
  open: number;
}

/**
 * Open issues by the four buckets the rail can show. Backlog and todo are both
 * "queued" because the overview is a summary; the board is where the seven
 * columns live.
 */
export function issueMix(issues: Issue[]): IssueMix {
  const mix: IssueMix = {
    queued: 0,
    inProgress: 0,
    inReview: 0,
    blocked: 0,
    open: 0,
  };
  for (const issue of issues) {
    if (!isOpenIssue(issue)) continue;
    mix.open += 1;
    if (issue.status === "backlog" || issue.status === "todo") mix.queued += 1;
    else if (issue.status === "in_progress") mix.inProgress += 1;
    else if (issue.status === "in_review") mix.inReview += 1;
    else if (issue.status === "blocked") mix.blocked += 1;
  }
  return mix;
}

export interface LandedOptions {
  /** How many rows the section shows. */
  limit?: number;
  /** How far back "recently" reaches, in days. */
  days?: number;
  /** Injected in tests so the window is not the wall clock. */
  now?: Date;
}

/**
 * Done issues, most recently updated first.
 *
 * `updated_at` is the closest thing the issue list has to a completion time:
 * there is no `completed_at` column, and a done issue edited later moves to
 * the top of this list. The section is a summary of recent progress, not an
 * audit of when each issue closed.
 */
export function landedIssues(
  issues: Issue[],
  {
    limit = 5,
    days = OVERVIEW_WINDOW_DAYS,
    now = new Date(),
  }: LandedOptions = {},
): Issue[] {
  const since = now.getTime() - days * DAY_MS;
  return issues
    .filter((issue) => {
      if (issue.status !== "done") return false;
      const updated = new Date(issue.updated_at).getTime();
      return !Number.isNaN(updated) && updated >= since;
    })
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
 * The enabled agents, busiest first, ties broken by name. Disabled agents are
 * left out: they are part of the configuration, not of what is running.
 */
export function agentRoster(agents: Agent[], limit = 5): Agent[] {
  return agents
    .filter((agent) => agent.enabled)
    .sort((a, b) => {
      const byStatus = STATUS_RANK[agentStatus(a)] - STATUS_RANK[agentStatus(b)];
      if (byStatus !== 0) return byStatus;
      return a.name.localeCompare(b.name);
    })
    .slice(0, limit);
}

export interface AgentSummary {
  enabled: number;
  running: number;
  queued: number;
  idle: number;
  offline: number;
  /** Each enabled agent's status, busiest first, for the tile's dots. */
  statuses: AgentStatus[];
}

/**
 * The enabled agents by status. Disabled agents are configuration, not
 * capacity: they do not make the machine look busier or the team look larger.
 */
export function agentSummary(agents: Agent[]): AgentSummary {
  const statuses = agents
    .filter((agent) => agent.enabled)
    .map(agentStatus)
    .sort((a, b) => STATUS_RANK[a] - STATUS_RANK[b]);

  const summary: AgentSummary = {
    enabled: statuses.length,
    running: 0,
    queued: 0,
    idle: 0,
    offline: 0,
    statuses,
  };
  for (const status of statuses) summary[status] += 1;
  return summary;
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
