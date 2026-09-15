"use client";

import Link from "next/link";
import type { UsageBreakdownRow } from "@/lib/api";
import { formatTokens, totalTokens, type UsageGroup } from "@/lib/usage";
import { paths } from "@/lib/paths";
import { WorkspaceAvatar } from "@/components/workspace-avatar";
import { ProviderIcon } from "@/components/provider-icon";

// What a breakdown row links to, when there is somewhere to go. Issues and
// models have no page of their own yet, so their rows stay plain text rather
// than pretending to be links.
function rowHref(group: UsageGroup, row: UsageBreakdownRow): string | null {
  switch (group) {
    case "daemon":
      return row.key === "unassigned" ? null : paths.daemon(row.key);
    case "workspace":
      return row.workspace_slug ? paths.workspace(row.workspace_slug).agents() : null;
    case "issue":
      return row.workspace_slug
        ? paths.workspace(row.workspace_slug).issue(row.label.split(":")[0])
        : null;
    default:
      return null;
  }
}

function RowIcon({ group, row }: { group: UsageGroup; row: UsageBreakdownRow }) {
  if (group === "agent") {
    return (
      <WorkspaceAvatar name={row.label} avatarUrl={row.avatar_url} className="size-6" />
    );
  }
  if (group === "model") {
    const provider = row.key.split("/")[0] ?? "";
    return (
      <span className="flex size-6 shrink-0 items-center justify-center rounded-sm bg-muted">
        <ProviderIcon provider={provider} className="size-3.5" />
      </span>
    );
  }
  return null;
}

export function UsageBreakdown({
  group,
  rows,
}: {
  group: UsageGroup;
  rows: UsageBreakdownRow[];
}) {
  // Shares are of the rows shown, which are already the full set for the window
  // — so the bars always total 100% and the largest consumer is obvious.
  const windowTotal = rows.reduce((sum, row) => sum + totalTokens(row), 0);

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed border-hairline py-10">
        <p className="text-xs text-mute">
          No usage recorded for this window yet.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-hairline bg-canvas">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-hairline bg-canvas-soft">
            <th className="px-4 py-2 text-left font-mono text-xs font-medium uppercase tracking-wide text-mute">
              {group === "daemon" ? "Runtime" : group}
            </th>
            <th className="px-4 py-2 text-right font-mono text-xs font-medium uppercase tracking-wide text-mute">
              Tokens
            </th>
            <th className="hidden px-4 py-2 text-right font-mono text-xs font-medium uppercase tracking-wide text-mute sm:table-cell">
              Runs
            </th>
            <th className="hidden w-40 px-4 py-2 text-left font-mono text-xs font-medium uppercase tracking-wide text-mute md:table-cell">
              Share
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const total = totalTokens(row);
            const share = windowTotal > 0 ? total / windowTotal : 0;
            const href = rowHref(group, row);
            const name = (
              <span className="truncate font-medium text-ink">{row.label}</span>
            );
            return (
              <tr
                key={row.key}
                className="border-b border-hairline last:border-b-0 transition-colors hover:bg-muted/40"
              >
                <td className="max-w-0 px-4 py-2.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <RowIcon group={group} row={row} />
                    {href ? (
                      <Link href={href} className="min-w-0 truncate hover:underline">
                        {name}
                      </Link>
                    ) : (
                      name
                    )}
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono text-xs tabular-nums text-body">
                  {formatTokens(total)}
                </td>
                <td className="hidden whitespace-nowrap px-4 py-2.5 text-right font-mono text-xs tabular-nums text-mute sm:table-cell">
                  {row.run_count}
                </td>
                <td className="hidden px-4 py-2.5 md:table-cell">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-success"
                        style={{ width: `${share * 100}%` }}
                      />
                    </div>
                    <span className="w-9 shrink-0 text-right font-mono text-xs tabular-nums text-mute">
                      {Math.round(share * 100)}%
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
