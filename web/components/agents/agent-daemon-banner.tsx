"use client";

import Link from "next/link";
import { ServerOff } from "lucide-react";
import type { OfflineDaemon } from "@/lib/agent-presence";
import { paths } from "@/lib/paths";

/**
 * The one thing a roster cannot say from inside its rows: every agent on a
 * downed machine reads "Offline", and the reason is on a page the reader is not
 * looking at. One banner per machine, above the roster, naming it and what is
 * standing still on it — with the way to it.
 *
 * The counts are enabled agents only (see `offlineDaemons`): a disabled agent
 * has no work to be blocked from, so counting it would inflate a warning that
 * is meant to be actionable.
 */
export function AgentDaemonBanner({ daemons }: { daemons: OfflineDaemon[] }) {
  if (daemons.length === 0) return null;

  return (
    <div className="space-y-2">
      {daemons.map((daemon) => (
        <div
          key={daemon.id}
          role="status"
          className="flex items-center gap-2.5 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-caption text-body"
        >
          <ServerOff className="size-4 shrink-0 text-warning" aria-hidden="true" />
          <p className="min-w-0 flex-1">
            <span className="font-medium text-ink">
              {daemon.name} is offline
            </span>
            {" — "}
            {daemon.agents.length}{" "}
            {daemon.agents.length === 1 ? "agent" : "agents"} on it can&apos;t
            run
            {daemon.queued > 0
              ? `, ${daemon.queued} ${daemon.queued === 1 ? "task" : "tasks"} queued`
              : ""}
            .
          </p>
          <Link
            href={paths.daemon(daemon.id)}
            className="shrink-0 text-body underline-offset-2 transition-colors hover:text-ink hover:underline"
          >
            View daemon
          </Link>
        </div>
      ))}
    </div>
  );
}
