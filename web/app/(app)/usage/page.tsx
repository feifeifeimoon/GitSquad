"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Gauge, Info } from "lucide-react";
import {
  usageApi,
  type UsageBreakdownResponse,
  type UsageSeriesResponse,
  type UsageSummaryResponse,
} from "@/lib/api";
import {
  browserTimezone,
  cacheHitRate,
  formatPercent,
  formatTokens,
  totalTokens,
  usageCoverage,
  USAGE_GROUPS,
  USAGE_GROUP_LABELS,
  USAGE_RANGES,
  USAGE_RANGE_LABELS,
  USAGE_RANGE_TITLES,
  type UsageGroup,
  type UsageRange,
} from "@/lib/usage";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { PageHeader } from "@/components/page-header";
import { invalidateApi, useApi } from "@/lib/query";
import { ErrorState } from "@/components/error-state";
import { UsageChart } from "@/components/usage/usage-chart";
import { UsageBreakdown } from "@/components/usage/usage-breakdown";
import { toast } from "sonner";

// The timezone travels with every request rather than being stored on the
// account, so day buckets are cut where the reader actually is.
const TZ = browserTimezone();

export default function UsagePage() {
  const [range, setRange] = useState<UsageRange>("7d");
  const [group, setGroup] = useState<UsageGroup>("agent");
  // The window reads and the breakdown are keyed separately, so switching
  // dimension cannot re-render the headline figures back to skeletons — that
  // was the reason for the two effects this replaces, and the cache gives it
  // for free by keying on the parameters that produced the data.
  const windowParams = `range=${range}&tz=${encodeURIComponent(TZ)}`;

  const { data: summaryRes, error: summaryError } = useApi<UsageSummaryResponse>(
    `/api/v1/usage/summary?${windowParams}`,
    () => usageApi.summary({ range, tz: TZ }),
  );
  const { data: seriesRes, error: seriesError } = useApi<UsageSeriesResponse>(
    `/api/v1/usage/series?${windowParams}`,
    () => usageApi.series({ range, tz: TZ }),
  );
  const { data: breakdownRes, error: breakdownError } =
    useApi<UsageBreakdownResponse>(
      `/api/v1/usage/breakdown?${windowParams}&group_by=${group}`,
      () => usageApi.breakdown({ range, tz: TZ, groupBy: group }),
    );

  const summary = summaryRes?.summary ?? null;
  const usageWindow = summaryRes?.window ?? null;
  const points = seriesRes?.points ?? [];
  const granularity = seriesRes?.bucket ?? "day";
  const loading = seriesRes === undefined || summaryRes === undefined;
  const breakdownLoading = breakdownRes === undefined;

  const usageError = summaryError ?? seriesError ?? breakdownError;
  useEffect(() => {
    if (usageError) toast.error(usageError.message || "Failed to load usage");
  }, [usageError]);

  const coverage = summary ? usageCoverage(summary) : null;
  const total = summary ? totalTokens(summary) : 0;
  const rate = summary ? cacheHitRate(summary) : null;

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Usage" actions={<RangeSelector value={range} onChange={setRange} />} />

      <div className="flex-1 px-8 pb-8 pt-6">
        {summaryError || seriesError ? (
          <ErrorState
            what="usage"
            error={(summaryError ?? seriesError) as Error}
            onRetry={() => invalidateApi("/api/v1/usage")}
          />
        ) : loading ? (
          <UsageSkeleton />
        ) : summary && summary.runs_total === 0 ? (
          <Empty className="py-20">
            <EmptyMedia>
              <Gauge className="size-5" />
            </EmptyMedia>
            <EmptyTitle>No usage yet</EmptyTitle>
            <EmptyDescription>
              No usage recorded for this window yet. Token spend shows up here
              once an agent has run — connect a daemon, then mention an agent on
              an issue.
            </EmptyDescription>
            <Button asChild className="mt-1">
              <Link href="/daemons">Connect a daemon</Link>
            </Button>
          </Empty>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-x-6 gap-y-5 border-b border-hairline pb-6 sm:grid-cols-3 lg:grid-cols-6">
              <Kpi label="Total tokens" value={formatTokens(total)} emphasis />
              <Kpi label="Input" value={formatTokens(summary?.input_tokens ?? 0)} />
              <Kpi label="Output" value={formatTokens(summary?.output_tokens ?? 0)} />
              <Kpi
                label="Cache read"
                value={formatTokens(summary?.cache_read_tokens ?? 0)}
              />
              <Kpi
                label="Cache write"
                value={formatTokens(summary?.cache_write_tokens ?? 0)}
              />
              {/* Null, not 0%, when nothing was sent — an empty cache and an
                  unused one are different facts. */}
              <Kpi
                label="Cache hit rate"
                value={rate === null ? "—" : formatPercent(rate)}
              />
            </div>

            {coverage?.incomplete && (
              <p className="mt-4 flex items-start gap-2 text-caption text-mute">
                <Info className="mt-px size-3.5 shrink-0" />
                <span>
                  {coverage.reported} of {coverage.total} finished runs reported
                  usage. The other {coverage.missing} did not — a daemon that
                  stopped mid-run, or a provider that reports no tokens — so the
                  figures above are a lower bound, not the full total.
                </span>
              </p>
            )}

            <section className="mt-8">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-label font-semibold text-ink">
                  Tokens over time
                </h2>
                <span className="text-caption text-mute">
                  {usageWindow
                    ? `${usageWindow.range} · bucketed by ${granularity} in ${usageWindow.timezone}`
                    : ""}
                </span>
              </div>
              <div className="rounded-lg border border-hairline bg-canvas p-4">
                <UsageChart points={points} bucket={granularity} />
              </div>
            </section>

            <section className="mt-8">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-label font-semibold text-ink">Breakdown</h2>
                <GroupSelector value={group} onChange={setGroup} />
              </div>
              {breakdownLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-11 w-full rounded-lg" />
                  ))}
                </div>
              ) : (
                <UsageBreakdown group={group} rows={breakdownRes?.rows ?? []} />
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="min-w-0">
      {/* Sentence case, not mono uppercase: mono uppercase is how you say "this
          is an identifier", and "Total tokens" is not one. */}
      <p className="text-caption text-mute">{label}</p>
      <p
        className={`mt-1 truncate tabular-nums ${
          emphasis
            ? "text-display font-semibold tracking-[-0.01em] text-ink"
            : "text-title-sm font-medium text-ink"
        }`}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}

function RangeSelector({
  value,
  onChange,
}: {
  value: UsageRange;
  onChange: (r: UsageRange) => void;
}) {
  return (
    <div className="flex items-center rounded-sm border border-hairline bg-canvas p-0.5">
      {USAGE_RANGES.map((r) => (
        <button
          key={r}
          onClick={() => onChange(r)}
          title={USAGE_RANGE_TITLES[r]}
          aria-pressed={value === r}
          className={`rounded-xs px-2.5 py-1 text-caption font-medium transition-colors ${
            value === r ? "bg-muted text-ink" : "text-mute hover:text-ink"
          }`}
        >
          {USAGE_RANGE_LABELS[r]}
        </button>
      ))}
    </div>
  );
}

function GroupSelector({
  value,
  onChange,
}: {
  value: UsageGroup;
  onChange: (g: UsageGroup) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {USAGE_GROUPS.map((g) => (
        <button
          key={g}
          onClick={() => onChange(g)}
          aria-pressed={value === g}
          className={`rounded-full px-2.5 py-1 text-caption font-medium transition-colors ${
            value === g ? "bg-ink text-canvas" : "bg-muted text-body hover:text-ink"
          }`}
        >
          {USAGE_GROUP_LABELS[g]}
        </button>
      ))}
    </div>
  );
}

function UsageSkeleton() {
  return (
    <>
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 border-b border-hairline pb-6 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i}>
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2 h-6 w-16" />
          </div>
        ))}
      </div>
      <Skeleton className="mt-8 h-52 w-full rounded-lg" />
      <Skeleton className="mt-8 h-40 w-full rounded-lg" />
    </>
  );
}
