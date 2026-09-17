// Agent and daemon status, as labels for what the server already decided.
//
// Daemon liveness is not ours to infer: the server resolves the stored status
// against the last heartbeat before it sends a row (see service.liveStatus),
// so `daemon.status` and `runtime.daemon_status` are already online or offline
// by the time they arrive. Do not reintroduce a timestamp comparison here — a
// browser clock cannot decide whether a machine is reachable, so comparing one
// against a server timestamp makes the answer depend on who is looking.
//
// What is left for the client is naming the workload: an agent's task counts
// are honest (they come from the task queue), so mapping them to a word is
// presentation. `run_count` never was, and is gone.

export type AgentStatus = "running" | "queued" | "idle" | "offline";
export type DaemonStatus = "online" | "offline";

/** The union of both vocabularies, for the shared colour maps. */
export type StatusTone = AgentStatus | DaemonStatus;

/** The slice of an agent this module needs — lets the daemon page reuse it. */
export interface AgentLiveness {
  running_count: number;
  queued_count: number;
  runtime?: {
    daemon_id?: string | null;
    daemon_status?: DaemonStatus | string;
  } | null;
}

export function agentStatus(agent: AgentLiveness): AgentStatus {
  const runtime = agent.runtime;
  if (!runtime?.daemon_id) return "offline";

  return agentStatusWithDaemon(daemonStatusOf(runtime.daemon_status), agent);
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
  if (workload.running_count > 0) return "running";
  if (workload.queued_count > 0) return "queued";
  return "idle";
}

/**
 * Narrows a status the wire types as a plain string. Anything the server does
 * not call "online" is offline: failing towards "this machine is not reachable"
 * is the safe reading, and it is the only value the server sends.
 */
export function daemonStatusOf(status: string | null | undefined): DaemonStatus {
  return status === "online" ? "online" : "offline";
}

export const AGENT_STATUS_LABEL: Record<AgentStatus, string> = {
  running: "Running",
  queued: "Queued",
  idle: "Idle",
  offline: "Offline",
};

export const DAEMON_STATUS_LABEL: Record<DaemonStatus, string> = {
  online: "Online",
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
  online: "bg-success",
  offline: "bg-hairline-strong",
};

/** Text tone paired with the dot, brighter while something is happening. */
export const STATUS_TEXT: Record<StatusTone, string> = {
  running: "text-ink",
  queued: "text-body",
  idle: "text-body",
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
