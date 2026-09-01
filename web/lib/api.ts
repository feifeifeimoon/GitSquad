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
