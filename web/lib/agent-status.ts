// Agent and daemon liveness, derived on the client.
//
// Neither is a stored field we can trust. `agent_runtimes.status` is never
// refreshed by the server — it keeps its 'offline' default forever — and
// `run_count` is never incremented, so the task queue is the only honest record
// of what an agent is doing. Both the agents list and the daemon detail page
// read status from here so the two surfaces can never disagree.

export type AgentStatus = "running" | "queued" | "idle" | "unstable" | "offline";
export type DaemonStatus = "online" | "unstable" | "offline";

/** The union of both vocabularies, for the shared colour maps. */
export type StatusTone = AgentStatus | DaemonStatus;

/**
 * A daemon heartbeats every 30s and the server batches the last_seen_at writes
 * every 60s, so a timestamp older than this means the 'online' flag is stale
 * rather than live (a daemon that died without the socket closing).
 */
export const DAEMON_STALE_MS = 3 * 60 * 1000;

function isFresh(lastSeenAt: string | null | undefined, now: number): boolean {
  if (!lastSeenAt) return false;
  return now - new Date(lastSeenAt).getTime() <= DAEMON_STALE_MS;
}

export function daemonStatus(
  daemon: { status: string; last_seen_at: string | null },
  now: number = Date.now(),
): DaemonStatus {
  if (daemon.status !== "online") return "offline";
  return isFresh(daemon.last_seen_at, now) ? "online" : "unstable";
}

/** The slice of an agent this module needs — lets the daemon page reuse it. */
export interface AgentLiveness {
  running_count: number;
  queued_count: number;
  runtime?: {
    daemon_id?: string | null;
    daemon_status?: string;
    last_seen_at?: string | null;
  } | null;
}

export function agentStatus(
  agent: AgentLiveness,
  now: number = Date.now(),
): AgentStatus {
  const runtime = agent.runtime;
  if (!runtime?.daemon_id) return "offline";

  return agentStatusWithDaemon(
    daemonStatus(
      {
        status: runtime.daemon_status ?? "",
        last_seen_at: runtime.last_seen_at ?? null,
      },
      now,
    ),
    agent,
  );
}

/**
 * The workload half of agent status, for callers that already know whether the
 * daemon is reachable — the daemon detail page derives that once for its header
 * and every agent on that page shares the answer.
 */
export function agentStatusWithDaemon(
  daemon: DaemonStatus,
  workload: { running_count: number; queued_count: number },
): AgentStatus {
  if (daemon === "offline") return "offline";
  // A daemon that claims to be online but has gone silent outranks any task
  // count: work attributed to it is most likely stuck, not progressing.
  if (daemon === "unstable") return "unstable";
  if (workload.running_count > 0) return "running";
  if (workload.queued_count > 0) return "queued";
  return "idle";
}

export const AGENT_STATUS_LABEL: Record<AgentStatus, string> = {
  running: "Running",
  queued: "Queued",
  idle: "Idle",
  unstable: "Unstable",
  offline: "Offline",
};

export const DAEMON_STATUS_LABEL: Record<DaemonStatus, string> = {
  online: "Online",
  unstable: "Unstable",
  offline: "Offline",
};

/**
 * Status dot colours. A label always accompanies the dot, so colour is never
 * the only signal carrying the state.
 */
export const STATUS_DOT: Record<StatusTone, string> = {
  running: "bg-success",
  queued: "bg-warning",
  idle: "bg-cyan-deep",
  unstable: "bg-warning-deep",
  online: "bg-success",
  offline: "bg-hairline-strong",
};

/** Text tone paired with the dot, brighter while something is happening. */
export const STATUS_TEXT: Record<StatusTone, string> = {
  running: "text-ink",
  queued: "text-body",
  idle: "text-body",
  unstable: "text-warning-deep",
  online: "text-body",
  offline: "text-mute",
};

/**
 * What an agent is doing, spelled out for a tooltip or a secondary line:
 * "GTS-42: fix the thing", "2 tasks queued", or nothing when it is simply free.
 */
export function workloadDetail(agent: {
  running_count: number;
  queued_count: number;
  current_task?: { issue_key: string; issue_title: string } | null;
}): string | null {
  if (agent.current_task?.issue_key) {
    const { issue_key, issue_title } = agent.current_task;
    return issue_title ? `${issue_key}: ${issue_title}` : issue_key;
  }
  if (agent.running_count > 0) {
    return `${agent.running_count} task${agent.running_count === 1 ? "" : "s"} running`;
  }
  if (agent.queued_count > 0) {
    return `${agent.queued_count} task${agent.queued_count === 1 ? "" : "s"} queued`;
  }
  return null;
}
