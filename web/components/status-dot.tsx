"use client";

import { cn } from "@/lib/utils";
import {
  AGENT_STATUS_LABEL,
  DAEMON_STATUS_LABEL,
  STATUS_DOT,
  STATUS_TEXT,
  type AgentStatus,
  type DaemonStatus,
  type StatusTone,
} from "@/lib/agent-status";

// Status is shown as a dot plus a written label, never colour alone — the label
// is what carries the state for anyone who cannot separate the two hues.

function Dot({ tone }: { tone: StatusTone }) {
  return (
    <span
      className={cn("size-1.5 shrink-0 rounded-full", STATUS_DOT[tone])}
      aria-hidden="true"
    />
  );
}

export function AgentStatusBadge({
  status,
  detail,
  className,
}: {
  status: AgentStatus;
  /** Secondary text from workloadDetail(), appended after a middot. */
  detail?: string | null;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-1.5 text-caption font-medium",
        STATUS_TEXT[status],
        className,
      )}
    >
      <Dot tone={status} />
      <span className="truncate">{AGENT_STATUS_LABEL[status]}</span>
      {detail && (
        <span className="truncate font-normal text-mute">{detail}</span>
      )}
    </span>
  );
}

export function DaemonStatusBadge({
  status,
  className,
}: {
  status: DaemonStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-caption font-medium",
        STATUS_TEXT[status],
        className,
      )}
    >
      <Dot tone={status} />
      {DAEMON_STATUS_LABEL[status]}
    </span>
  );
}
