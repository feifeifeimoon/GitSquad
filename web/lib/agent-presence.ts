// Whether an agent can run, and what it has on its plate — two questions, not
// one status.
//
// The roster used to derive a single word (`agentStatus()` in
// agent-status.ts): running, queued, idle, offline, with `offline` short-
// circuiting the other three. That reads fine on a machine that is reachable
// and lies on one that is not: a daemon going down turned every agent on it
// into "Offline", including the agent with two tasks still queued behind it.
// "Nothing can run here" and "there is work waiting" are both true, and the
// second one is the one somebody has to act on.
//
// So availability and workload are derived independently and composed only
// when drawn: `Online · Working`, `Offline · 2 queued`. Neither one is stored,
// and neither is inferred from a timestamp — the server already resolved
// liveness against the last heartbeat before it sent the row.

export type AgentAvailability = "online" | "offline";
export type AgentWorkload = "working" | "queued" | "idle";

export interface AgentPresence {
  availability: AgentAvailability;
  workload: AgentWorkload;
}

/** The slice of an agent this module reads. Structural, so the roster, the
 * banner and the daemon page can all pass their own row types. */
export interface AgentPresenceInput {
  name?: string;
  running_count: number;
  queued_count: number;
  enabled?: boolean;
  runtime?: {
    daemon_id?: string | null;
    daemon_name?: string | null;
    daemon_status?: string | null;
  } | null;
}

/**
 * Reachability first: an agent with no runtime, or one whose runtime has no
 * daemon, has nowhere to run and is offline however idle it looks.
 *
 * Workload never looks at availability. That is the whole point: queued work on
 * an unreachable machine is the state worth surfacing, and it cannot be
 * surfaced by a derivation that lets `offline` win.
 */
export function agentPresence(agent: AgentPresenceInput): AgentPresence {
  const runtime = agent.runtime;
  const availability: AgentAvailability =
    runtime?.daemon_id && runtime.daemon_status === "online"
      ? "online"
      : "offline";

  const workload: AgentWorkload =
    agent.running_count > 0
      ? "working"
      : agent.queued_count > 0
        ? "queued"
        : "idle";

  return { availability, workload };
}

export const AVAILABILITY_LABEL: Record<AgentAvailability, string> = {
  online: "Online",
  offline: "Offline",
};

export const WORKLOAD_LABEL: Record<AgentWorkload, string> = {
  working: "Working",
  queued: "Queued",
  idle: "Idle",
};

/** One offline machine, and what is standing still on it. */
export interface OfflineDaemon {
  id: string;
  name: string;
  /** Enabled agents bound to it, in roster order. */
  agents: string[];
  /** Tasks those agents have waiting. */
  queued: number;
}

/**
 * The machines that are down, for the one banner the roster draws above itself.
 *
 * Only enabled agents count: a disabled agent has no work to be blocked from,
 * so including it would inflate a warning that is meant to be actionable. A
 * daemon with nothing enabled on it is not worth a banner either — every agent
 * bound to it is already parked on purpose.
 */
export function offlineDaemons(agents: AgentPresenceInput[]): OfflineDaemon[] {
  const byDaemon = new Map<string, OfflineDaemon>();

  for (const agent of agents) {
    if (agent.enabled === false) continue;
    const runtime = agent.runtime;
    if (!runtime?.daemon_id) continue;
    if (runtime.daemon_status === "online") continue;

    const name = agent.name ?? "Agent";
    const entry = byDaemon.get(runtime.daemon_id) ?? {
      id: runtime.daemon_id,
      name: runtime.daemon_name || "A daemon",
      agents: [],
      queued: 0,
    };
    entry.agents.push(name);
    entry.queued += agent.queued_count;
    byDaemon.set(runtime.daemon_id, entry);
  }

  return [...byDaemon.values()].sort(
    (a, b) => b.queued - a.queued || a.name.localeCompare(b.name),
  );
}
