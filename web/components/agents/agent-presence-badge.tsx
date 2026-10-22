"use client";

import { cn } from "@/lib/utils";
import {
  AVAILABILITY_LABEL,
  WORKLOAD_LABEL,
  type AgentPresence,
} from "@/lib/agent-presence";

// Two axes, one line: whether the machine can run this agent, and what the agent
// has on its plate. The dot carries only availability — a dot that turns red
// because something failed, or because a task is queued, would make "reachable"
// impossible to read at a glance.
//
// The workload word is the half that changes with the work, so it carries the
// tone: `Working` in ink, `2 queued` in amber (the only state that asks the
// reader to do something), `Idle` in mute.

const DOT: Record<AgentPresence["availability"], string> = {
  online: "bg-success",
  offline: "bg-hairline-strong",
};

const WORKLOAD_TONE: Record<AgentPresence["workload"], string> = {
  working: "font-medium text-ink",
  queued: "font-medium text-warning",
  idle: "text-mute",
};

export function AgentPresenceBadge({
  presence,
  queued = 0,
  className,
}: {
  presence: AgentPresence;
  /** The agent's queued count, for "2 queued" rather than a bare word. */
  queued?: number;
  className?: string;
}) {
  const { availability, workload } = presence;
  const workloadText =
    workload === "queued" && queued > 0
      ? `${queued} queued`
      : WORKLOAD_LABEL[workload];

  return (
    <span
      className={cn(
        "flex min-w-0 items-center gap-1.5 whitespace-nowrap text-caption",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn("size-1.5 shrink-0 rounded-full", DOT[availability])}
      />
      <span className={availability === "online" ? "text-body" : "text-mute"}>
        {AVAILABILITY_LABEL[availability]}
      </span>
      <span aria-hidden="true" className="text-mute">
        ·
      </span>
      <span className={cn("truncate", WORKLOAD_TONE[workload])}>
        {workloadText}
      </span>
    </span>
  );
}
