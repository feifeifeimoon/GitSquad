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

export interface Issue {
  id: string;
  number: number;
  issue_key: string;
  title: string;
  description: string;
  status: IssueStatus;
  assigned_agents: string[];
  linked_prs: string[];
  creator_name: string;
  comments_count: number;
  created_at: string;
  updated_at: string;
}

export interface IssueComment {
  id: string;
  author_type: "user" | "agent" | "system";
  author_name: string;
  type: "comment" | "status_change" | "system";
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
  get: (workspaceId: string, issueId: string) =>
    api.get<IssueDetail>(`/api/v1/workspaces/${workspaceId}/issues/${issueId}`),
  create: (workspaceId: string, body: { title: string; description?: string; status?: IssueStatus }) =>
    api.post<Issue>(`/api/v1/workspaces/${workspaceId}/issues`, body),
  update: (workspaceId: string, issueId: string, body: { status?: IssueStatus; title?: string; description?: string }) =>
    api.patch<Issue>(`/api/v1/workspaces/${workspaceId}/issues/${issueId}`, body),
  addComment: (workspaceId: string, issueId: string, content: string) =>
    api.post<IssueComment>(`/api/v1/workspaces/${workspaceId}/issues/${issueId}/comments`, { content }),
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
  running_count: number;
  queued_count: number;
  total_runs: number;
  current_task?: AgentCurrentTask | null;
  skills?: Skill[];
  runtime?: AgentRuntime;
  created_at: string;
  updated_at: string;
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
    skill_ids?: string[];
    enabled?: boolean;
  }) => api.patch<Agent>(`/api/v1/workspaces/${workspaceId}/agents/${agentId}`, body),
  remove: (workspaceId: string, agentId: string) =>
    api.delete<{ deleted: boolean }>(`/api/v1/workspaces/${workspaceId}/agents/${agentId}`),
};

export const runtimeApi = {
  list: (workspaceId: string) => api.get<AgentRuntime[]>(`/api/v1/workspaces/${workspaceId}/runtimes`),
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
