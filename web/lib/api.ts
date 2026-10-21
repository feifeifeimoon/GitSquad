import type { DaemonStatus } from "@/lib/agent-status";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function fetchAPI<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("gitsquad_token")
      : null;

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    if (typeof window !== "undefined") {
      localStorage.removeItem("gitsquad_token");
      // Hard redirect on auth expiry — clears app state and reloads.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/login";
    }
    throw new ApiError("Unauthorized", 401);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = body?.message || body?.error || "Request failed";
    throw new ApiError(msg, res.status);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  // Unwrap: if response uses { success, data } envelope, extract data.
  const body = await res.json();
  if (body && typeof body === "object" && "success" in body && "data" in body) {
    return (body as { data: T }).data as T;
  }
  return body as T;
}

export const api = {
  get: <T = unknown>(path: string) =>
    fetchAPI<T>(path, { method: "GET" }),

  post: <T = unknown>(path: string, body?: unknown) =>
    fetchAPI<T>(path, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    }),

  put: <T = unknown>(path: string, body?: unknown) =>
    fetchAPI<T>(path, {
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
    }),

  patch: <T = unknown>(path: string, body?: unknown) =>
    fetchAPI<T>(path, {
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
    }),

  delete: <T = unknown>(path: string) =>
    fetchAPI<T>(path, { method: "DELETE" }),
};

export { ApiError };

// ── Issues ────────────────────────────────────────────────────────────

export type IssueStatus = "backlog" | "todo" | "in_progress" | "in_review" | "done" | "blocked" | "cancelled";

export type AgentState = "running" | "queued" | "idle";

/** An agent working on an issue, with what it is doing on it right now. */
export interface IssueAgent {
  id: string;
  name: string;
  avatar_url: string;
  /** Derived per (issue, agent) from the task queue by the server. */
  state: AgentState;
}

/** The one person accountable for an issue. */
export interface IssueAssignee {
  id: string;
  login: string;
  avatar_url: string;
}

export interface Issue {
  id: string;
  number: number;
  issue_key: string;
  title: string;
  description: string;
  status: IssueStatus;
  /** Who is working on it. */
  agents: IssueAgent[];
  /** Who owns it; null while nobody has claimed it. */
  assignee?: IssueAssignee | null;
  /** Only populated on the issue detail endpoint, newest first. */
  pull_requests?: PullRequest[];
  /** The active PR's number, or 0/absent when the issue has none. */
  active_pr_number?: number;
  creator_name: string;
  comments_count: number;
  created_at: string;
  updated_at: string;
  /**
   * Which workspace the issue belongs to. Only the All Workspaces board fills
   * these: a board inside one workspace has nothing to disambiguate, and the
   * card draws its chip only when they are here. The key alone would not do —
   * issue numbers are per workspace, so two of them can both be "GS-1".
   */
  workspace_slug?: string;
  workspace_name?: string;
}

/**
 * A pull request linked to an issue.
 *
 * `active` is the one the issue currently tracks — at most one at a time — and
 * the rest are the history of how the issue got here.
 */
export interface PullRequest {
  id: string;
  number: number;
  title: string;
  url: string;
  state: "open" | "merged" | "closed";
  draft: boolean;
  head_branch: string;
  base_branch: string;
  author: string;
  repo_full_name: string;
  /** How the link was made: platform | branch | body | manual. */
  source: "platform" | "branch" | "body" | "manual";
  close_intent: boolean;
  /** Unlinked by a human; kept so the history stays complete. */
  suppressed: boolean;
  active: boolean;
  merged_at?: string;
  created_at: string;
  latest_review?: PullRequestReview;
}

/** One review run as the console shows it. */
export interface PullRequestReview {
  id: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  agent_name: string;
  head_sha: string;
  summary: string;
  findings: number;
  url: string;
  /** The PR head moved after this review. */
  stale: boolean;
  tokens: number;
  created_at: string;
}

/** One row of the workspace's Pull requests page. */
export interface PullRequestSummary {
  id: string;
  number: number;
  title: string;
  url: string;
  state: "open" | "merged" | "closed";
  draft: boolean;
  author: string;
  head_branch: string;
  base_branch: string;
  head_sha: string;
  updated_at: string;
  issue_key?: string;
  issue_title?: string;
  latest_review?: PullRequestReview;
}

export interface IssueComment {
  id: string;
  author_type: "user" | "agent" | "system";
  author_name: string;
  type: "comment" | "status_change" | "system" | "agents_change" | "assignee_change";
  content: string;
  created_at: string;
}

export interface IssueDetail extends Issue {
  comments: IssueComment[];
}

export const ISSUE_STATUSES: IssueStatus[] = [
  "backlog", "todo", "in_progress", "in_review", "done", "blocked", "cancelled",
];

export const ISSUE_STATUS_LABELS: Record<IssueStatus, string> = {
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In Progress",
  in_review: "In Review",
  done: "Done",
  blocked: "Blocked",
  cancelled: "Cancelled",
};

export const issueApi = {
  list: (workspaceId: string) => api.get<Issue[]>(`/api/v1/workspaces/${workspaceId}/issues`),
  /**
   * Every issue in every workspace you own — the All Workspaces board. Each
   * issue carries the workspace it came from.
   */
  listAll: () => api.get<Issue[]>("/api/v1/issues"),
  get: (workspaceId: string, issueId: string) =>
    api.get<IssueDetail>(`/api/v1/workspaces/${workspaceId}/issues/${issueId}`),
  create: (workspaceId: string, body: {
    title: string;
    description?: string;
    status?: IssueStatus;
    /** Assigned on creation. Does not start a run — a mention in the
     * description does. */
    agents?: string[];
    assignee_id?: string;
  }) => api.post<Issue>(`/api/v1/workspaces/${workspaceId}/issues`, body),
  update: (workspaceId: string, issueId: string, body: {
    status?: IssueStatus;
    title?: string;
    description?: string;
    /** Replaces the whole assignment; [] clears it. Absent leaves it alone. */
    agents?: string[];
    /** A user id to set, "" to unassign. Absent leaves it alone. */
    assignee_id?: string;
  }) => api.patch<Issue>(`/api/v1/workspaces/${workspaceId}/issues/${issueId}`, body),
  addComment: (workspaceId: string, issueId: string, content: string) =>
    api.post<IssueComment>(`/api/v1/workspaces/${workspaceId}/issues/${issueId}/comments`, { content }),
  linkPullRequest: (workspaceId: string, issueId: string, ref: string) =>
    api.post<PullRequest>(`/api/v1/workspaces/${workspaceId}/issues/${issueId}/pull-requests`, { ref }),
  unlinkPullRequest: (workspaceId: string, issueId: string, prId: string) =>
    api.delete(`/api/v1/workspaces/${workspaceId}/issues/${issueId}/pull-requests/${prId}`),
  restorePullRequest: (workspaceId: string, issueId: string, prId: string) =>
    api.post(`/api/v1/workspaces/${workspaceId}/issues/${issueId}/pull-requests/${prId}/restore`, {}),
};

/** A person an issue in this workspace can be assigned to. */
export interface Member {
  id: string;
  login: string;
  avatar_url: string;
}

export const memberApi = {
  list: (workspaceId: string) => api.get<Member[]>(`/api/v1/workspaces/${workspaceId}/members`),
};

// ── Workspaces ─────────────────────────────────────────────────────────

export interface Workspace {
  id: string;
  slug: string;
  name: string;
  status: string;
  avatar_url: string;
  repo_full_name: string;
  repo_owner: string;
  repo_name: string;
  repo_private: boolean;
  created_at: string;
  last_commit_message: string;
  last_commit_author: string;
  last_commit_at: string;
  pr_review?: PRReviewConfig;
}

/** The workspace-level pull-request review configuration. */
export interface PRReviewConfig {
  enabled: boolean;
  agent_id: string | null;
  trigger: "opened" | "push" | "manual";
  ignore_drafts: boolean;
  author_scope: "collaborators" | "all";
  include_bots: boolean;
  inline_comments: boolean;
}

// ── Agents ────────────────────────────────────────────────────────────

export interface AgentRuntime {
  id: string;
  workspace_id: string;
  daemon_id?: string | null;
  name: string;
  runtime_mode: "local" | "cloud";
  provider: string;
  daemon_name?: string;
  /** Already resolved server-side against the daemon's heartbeat. */
  daemon_status?: DaemonStatus;
  created_at: string;
  updated_at: string;
}

export interface Skill {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface AgentCurrentTask {
  issue_key: string;
  issue_title: string;
}

export interface Agent {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  instructions: string;
  model: string;
  runtime_id: string;
  enabled: boolean;
  avatar_url?: string;
  /**
   * Which robot the agent wears in the roster: one of HEAD_SHAPES
   * (lib/agent-shape.ts). Present on every row — the column defaults to the
   * mark — and read through `headShapeOf`, which falls back to the mark on
   * anything unknown.
   */
  head_shape: string;
  running_count: number;
  queued_count: number;
  total_runs: number;
  current_task?: AgentCurrentTask | null;
  skills?: Skill[];
  runtime?: AgentRuntime;
  created_at: string;
  updated_at: string;
  /**
   * Whose roster the agent is on. Only the All Workspaces page fills these —
   * same rule as Issue's, and the table draws its Workspace column only when
   * they are here. Names are reused across workspaces, so this is what tells
   * two "@planner"s apart.
   */
  workspace_slug?: string;
  workspace_name?: string;
}

// ── Daemons ───────────────────────────────────────────────────────────

/** A capability the daemon detected on its machine, with the concrete CLI
 * version it found (e.g. kind "claude" at version "2.1.5"). */
export interface DaemonRuntime {
  id: string;
  daemon_id: string;
  kind: string;
  executable_path?: string;
  version?: string;
  max_concurrency: number;
  status?: string;
  diagnostics?: string;
}

export interface Daemon {
  id: string;
  name: string;
  /** Already resolved server-side against last_seen_at — see lib/agent-status.ts. */
  status: DaemonStatus;
  os: string;
  arch: string;
  daemon_version: string;
  last_seen_at: string | null;
  connected_at: string | null;
  registered_at: string;
  runtimes: DaemonRuntime[];
}

/** An agent bound to a runtime, as seen from the machine it runs on. */
export interface DaemonAgent {
  id: string;
  workspace_id: string;
  workspace_slug: string;
  workspace_name: string;
  name: string;
  avatar_url?: string;
  provider: string;
  model: string;
  enabled: boolean;
  running_count: number;
  queued_count: number;
  total_runs: number;
  current_task?: AgentCurrentTask | null;
}

/** A runtime with the agents configured against it. */
export interface DaemonRuntimeDetail extends DaemonRuntime {
  agents: DaemonAgent[];
}

export interface DaemonDetail extends Omit<Daemon, "runtimes"> {
  runtimes: DaemonRuntimeDetail[];
}

export const daemonApi = {
  list: () => api.get<Daemon[]>("/api/v1/daemons"),
  get: (id: string) => api.get<DaemonDetail>(`/api/v1/daemons/${encodeURIComponent(id)}`),
  rename: (id: string, name: string) =>
    api.patch<Daemon>(`/api/v1/daemons/${encodeURIComponent(id)}`, { name }),
  remove: (id: string) =>
    api.delete<{ deleted: boolean }>(`/api/v1/daemons/${encodeURIComponent(id)}`),
};

// ── Token usage ───────────────────────────────────────────────────────

/** The four mutually exclusive buckets. Input excludes both cache buckets. */
export interface TokenBuckets {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
}

/** The boundaries the server aggregated over, and the timezone it used. */
export interface UsageWindow {
  range: string;
  from: string;
  to: string;
  timezone: string;
}

export interface UsageSummary extends TokenBuckets {
  runs_with_usage: number;
  runs_total: number;
}

export interface UsagePoint extends TokenBuckets {
  bucket: string;
  run_count: number;
}

export interface UsageBreakdownRow extends TokenBuckets {
  key: string;
  label: string;
  avatar_url?: string;
  workspace_slug?: string;
  run_count: number;
}

export interface UsageSummaryResponse {
  window: UsageWindow;
  summary: UsageSummary;
}

export interface UsageSeriesResponse {
  window: UsageWindow;
  bucket: "hour" | "day";
  points: UsagePoint[];
}

export interface UsageBreakdownResponse {
  window: UsageWindow;
  group_by: string;
  rows: UsageBreakdownRow[];
}

/** Shared query parameters for every usage endpoint. */
interface UsageParams {
  range?: string;
  tz?: string;
  workspaceId?: string;
}

function usageQuery(params: UsageParams, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams({ ...extra });
  if (params.range) q.set("range", params.range);
  if (params.tz) q.set("tz", params.tz);
  if (params.workspaceId) q.set("workspace_id", params.workspaceId);
  return q.toString();
}

export const usageApi = {
  summary: (params: UsageParams) =>
    api.get<UsageSummaryResponse>(`/api/v1/usage/summary?${usageQuery(params)}`),
  series: (params: UsageParams & { bucket?: "hour" | "day" }) =>
    api.get<UsageSeriesResponse>(
      `/api/v1/usage/series?${usageQuery(params, params.bucket ? { bucket: params.bucket } : {})}`,
    ),
  breakdown: (params: UsageParams & { groupBy: string }) =>
    api.get<UsageBreakdownResponse>(
      `/api/v1/usage/breakdown?${usageQuery(params, { group_by: params.groupBy })}`,
    ),
};

export const agentApi = {
  list: (workspaceId: string) => api.get<Agent[]>(`/api/v1/workspaces/${workspaceId}/agents`),
  /**
   * Every agent in every workspace you own — the All Workspaces roster. Each
   * agent carries the workspace it belongs to.
   */
  listAll: () => api.get<Agent[]>("/api/v1/agents"),
  get: (workspaceId: string, agentId: string) =>
    api.get<Agent>(`/api/v1/workspaces/${workspaceId}/agents/${agentId}`),
  create: (workspaceId: string, body: {
    name: string;
    description?: string;
    instructions?: string;
    model?: string;
    daemon_id: string;
    provider: string;
    avatar_url?: string;
    head_shape?: string;
    skill_ids?: string[];
    enabled?: boolean;
  }) => api.post<Agent>(`/api/v1/workspaces/${workspaceId}/agents`, body),
  update: (workspaceId: string, agentId: string, body: {
    name?: string;
    description?: string;
    instructions?: string;
    model?: string;
    daemon_id?: string;
    provider?: string;
    avatar_url?: string;
    head_shape?: string;
    skill_ids?: string[];
    enabled?: boolean;
  }) => api.patch<Agent>(`/api/v1/workspaces/${workspaceId}/agents/${agentId}`, body),
  remove: (workspaceId: string, agentId: string) =>
    api.delete<{ deleted: boolean }>(`/api/v1/workspaces/${workspaceId}/agents/${agentId}`),
};

export const skillApi = {
  list: (workspaceId: string) => api.get<Skill[]>(`/api/v1/workspaces/${workspaceId}/skills`),
  create: (workspaceId: string, body: { name: string; description?: string; content?: string }) =>
    api.post<Skill>(`/api/v1/workspaces/${workspaceId}/skills`, body),
  update: (workspaceId: string, skillId: string, body: { name?: string; description?: string; content?: string }) =>
    api.patch<Skill>(`/api/v1/workspaces/${workspaceId}/skills/${skillId}`, body),
  remove: (workspaceId: string, skillId: string) =>
    api.delete<{ deleted: boolean }>(`/api/v1/workspaces/${workspaceId}/skills/${skillId}`),
};

export const pullRequestApi = {
  list: (workspaceId: string, state = "open") =>
    api.get<PullRequestSummary[]>(
      `/api/v1/workspaces/${workspaceId}/pull-requests?state=${encodeURIComponent(state)}`,
    ),
  review: (workspaceId: string, number: number) =>
    api.post<{ status: string; review_id: string }>(
      `/api/v1/workspaces/${workspaceId}/pull-requests/${number}/review`,
    ),
};
