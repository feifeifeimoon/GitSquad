"use client";

import Link from "next/link";
import { CircleCheck, CircleSlash, CircleX } from "lucide-react";
import type { UsageRun } from "@/lib/api";
import {
  formatDuration,
  formatTokens,
  runDuration,
  totalTokens,
} from "@/lib/usage";
import { paths } from "@/lib/paths";
import { WorkspaceAvatar } from "@/components/workspace-avatar";
import { TimeAgo } from "@/components/time-ago";
import { TH_CLASS } from "@/components/table-sort";
import { cn } from "@/lib/utils";

// How each outcome reads and looks, in the usage palette: the accent the chart
// uses for what got done, a muted brick for what did not, and quiet grey for a
// run a human stopped.
const STATUS = {
  completed: { label: "Completed", icon: CircleCheck, className: "text-usage-accent" },
  failed: { label: "Failed", icon: CircleX, className: "text-usage-fail" },
  cancelled: { label: "Cancelled", icon: CircleSlash, className: "text-mute" },
} as const;

function issueHref(run: UsageRun): string | null {
  if (!run.workspace_slug || !run.issue_key) return null;
  return paths.workspace(run.workspace_slug).issue(run.issue_key);
}

/**
 * The window's last finished runs, newest first.
 *
 * The breakdowns say which agent and which issue spent the tokens; this says
 * which run, just now, and how it ended — the difference between "the planner
 * costs the most" and "the planner's 14:02 run on ENG-42 burned 80k and then
 * failed". A run that reported no tokens still appears, with a dash where the
 * figure would be: it is a run, and the coverage note above already says its
 * cost is unknown rather than zero.
 */
export function UsageRuns({ runs }: { runs: UsageRun[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-hairline bg-canvas shadow-level-2">
      <table className="w-full border-collapse text-copy">
        <thead>
          <tr className="border-b border-hairline bg-canvas-soft">
            <th className={TH_CLASS}>Agent</th>
            <th className={TH_CLASS}>Work</th>
            <th className={TH_CLASS}>Outcome</th>
            <th className={`${TH_CLASS} hidden text-right md:table-cell`}>
              Duration
            </th>
            <th className={`${TH_CLASS} text-right`}>Tokens</th>
            <th className={`${TH_CLASS} hidden text-right sm:table-cell`}>
              Finished
            </th>
          </tr>
        </thead>
        <tbody>
          {runs.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-10 text-center text-caption text-mute">
                No finished runs in this window.
              </td>
            </tr>
          ) : (
            runs.map((run) => {
              const status = STATUS[run.status] ?? STATUS.completed;
              const StatusIcon = status.icon;
              const href = issueHref(run);
              const tokens = totalTokens(run);
              return (
                <tr
                  key={run.id}
                  className="border-b border-hairline last:border-b-0 transition-colors hover:bg-muted/40"
                >
                  {/* Auto-width, not max-w-0: with the Work column claiming
                      the remainder, a collapsed agent column would clip the
                      name to a sliver. */}
                  <td className="whitespace-nowrap px-4 py-2.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <WorkspaceAvatar
                        name={run.agent_name}
                        avatarUrl={run.avatar_url}
                        className="size-6"
                      />
                      <span className="truncate font-medium text-ink">
                        {run.agent_name}
                      </span>
                    </div>
                  </td>
                  {/* w-full, not max-w-0: the title is the only column with
                      something to say, so it takes the room the fixed columns
                      leave instead of being pinned to its narrowest. */}
                  <td className="w-full px-4 py-2.5">
                    {run.issue_key ? (
                      href ? (
                        <Link
                          href={href}
                          className="flex min-w-0 items-baseline gap-1.5 hover:underline"
                        >
                          <span className="shrink-0 font-mono text-caption text-mute">
                            {run.issue_key}
                          </span>
                          <span className="truncate text-body">
                            {run.issue_title}
                          </span>
                        </Link>
                      ) : (
                        <span className="flex min-w-0 items-baseline gap-1.5">
                          <span className="shrink-0 font-mono text-caption text-mute">
                            {run.issue_key}
                          </span>
                          <span className="truncate text-body">{run.issue_title}</span>
                        </span>
                      )
                    ) : run.pr_number ? (
                      <span className="font-mono text-caption text-mute">
                        PR #{run.pr_number}
                      </span>
                    ) : (
                      <span className="text-caption text-mute">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5">
                    <span className="flex items-center gap-1.5 text-caption text-body">
                      <StatusIcon className={cn("size-3.5 shrink-0", status.className)} />
                      {status.label}
                    </span>
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-2.5 text-right font-mono text-caption tabular-nums text-mute md:table-cell">
                    {formatDuration(runDuration(run.started_at, run.completed_at))}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono text-caption tabular-nums text-body">
                    {tokens > 0 ? formatTokens(tokens) : "—"}
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-2.5 text-right font-mono text-caption tabular-nums text-mute sm:table-cell">
                    <TimeAgo iso={run.completed_at ?? null} />
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
