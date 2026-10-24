"use client";

import { useState } from "react";
import Link from "next/link";
import type { UsageBreakdownRow } from "@/lib/api";
import {
  formatTokens,
  totalTokens,
  USAGE_GROUP_LABELS,
  type UsageGroup,
} from "@/lib/usage";
import { paths } from "@/lib/paths";
import { WorkspaceAvatar } from "@/components/workspace-avatar";
import { ProviderIcon } from "@/components/provider-icon";
import { TH_CLASS } from "@/components/table-sort";
import { cn } from "@/lib/utils";

// The four buckets, in the order the mix bar stacks them, in the chart's own
// palette: graphite for what was read, the accent for what was written.
const MIX = [
  { key: "input_tokens", className: "bg-usage-input" },
  { key: "output_tokens", className: "bg-usage-output" },
  { key: "cache_read_tokens", className: "bg-usage-read" },
  { key: "cache_write_tokens", className: "bg-usage-write" },
] as const;

// Answering "which agent spends the most" takes the top few rows; the tail is
// reachable behind a toggle rather than pushing the recent runs a screen down.
const VISIBLE_ROWS = 8;

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

/**
 * Where the window's tokens went, one dimension at a time.
 *
 * The old table answered "how many" with a number and "how much of the total"
 * with a single-colour bar. The bar now carries the mix as well as the volume —
 * how wide it is says how much this row consumed, how it is striped says which
 * buckets that was — so a cache-heavy agent and a cache-cold one of the same
 * size no longer look identical.
 */
export function UsageBreakdown({
  group,
  rows,
}: {
  group: UsageGroup;
  rows: UsageBreakdownRow[];
}) {
  const [showAll, setShowAll] = useState(false);

  // Shares are of the rows shown, which are already the full set for the window
  // — so the bars always total 100% and the largest consumer is obvious.
  const windowTotal = rows.reduce((sum, row) => sum + totalTokens(row), 0);
  // Bar widths are scaled to the largest row, not to the total: a share-based
  // width would leave every row past the first a sliver.
  const max = rows.reduce((m, row) => Math.max(m, totalTokens(row)), 0);
  const visible = showAll ? rows : rows.slice(0, VISIBLE_ROWS);

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed border-hairline py-10">
        <p className="text-caption text-mute">
          No usage recorded for this window yet.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-hairline bg-canvas shadow-level-2">
      <table className="w-full border-collapse text-copy">
        <thead>
          <tr className="border-b border-hairline bg-canvas-soft">
            {/* Sentence case, named the way the chips name it: "Runtime", not
                the internal dimension key. */}
            <th className={TH_CLASS}>{USAGE_GROUP_LABELS[group]}</th>
            <th className={`${TH_CLASS} text-right`}>Tokens</th>
            <th className={`${TH_CLASS} hidden text-right sm:table-cell`}>Runs</th>
            <th className={`${TH_CLASS} hidden text-right xl:table-cell`}>
              Tokens / run
            </th>
            <th className={`${TH_CLASS} hidden w-48 md:table-cell`}>Share</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((row) => {
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
                <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono text-caption tabular-nums text-body">
                  {formatTokens(total)}
                </td>
                <td className="hidden whitespace-nowrap px-4 py-2.5 text-right font-mono text-caption tabular-nums text-mute sm:table-cell">
                  {row.run_count}
                </td>
                <td className="hidden whitespace-nowrap px-4 py-2.5 text-right font-mono text-caption tabular-nums text-mute xl:table-cell">
                  {row.run_count > 0
                    ? formatTokens(Math.round(total / row.run_count))
                    : "—"}
                </td>
                <td className="hidden px-4 py-2.5 md:table-cell">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="flex h-full overflow-hidden rounded-full"
                        style={{ width: `${max > 0 ? (total / max) * 100 : 0}%` }}
                      >
                        {MIX.map((bucket) => (
                          <div
                            key={bucket.key}
                            className={cn(bucket.className)}
                            style={{
                              width: `${total > 0 ? (row[bucket.key] / total) * 100 : 0}%`,
                            }}
                          />
                        ))}
                      </div>
                    </div>
                    <span className="w-9 shrink-0 text-right font-mono text-caption tabular-nums text-mute">
                      {Math.round(share * 100)}%
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length > VISIBLE_ROWS && (
        <div className="border-t border-hairline px-4 py-2">
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="text-caption text-mute underline-offset-2 transition-colors hover:text-ink hover:underline"
          >
            {showAll ? `Show top ${VISIBLE_ROWS}` : `Show all ${rows.length}`}
          </button>
        </div>
      )}
    </div>
  );
}
