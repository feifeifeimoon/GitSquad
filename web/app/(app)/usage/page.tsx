"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Gauge, Info } from "lucide-react";
import {
  usageApi,
  type UsageBreakdownResponse,
  type UsageRunsResponse,
  type UsageSeriesResponse,
  type UsageSummary,
  type UsageSummaryResponse,
} from "@/lib/api";
import {
  browserTimezone,
  cacheHitRate,
  formatCount,
  formatPercent,
  formatTokens,
  percentChange,
  pointChange,
  successRate,
  totalTokens,
  usageCoverage,
  zeroFillSeries,
  USAGE_GROUPS,
  USAGE_GROUP_LABELS,
  USAGE_RANGES,
  USAGE_RANGE_LABELS,
  USAGE_RANGE_TITLES,
  type UsageGroup,
  type UsagePoint,
  type UsageRange,
} from "@/lib/usage";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { PageToolbar, SectionHeading } from "@/components/page-toolbar";
import { invalidateApi, useApi } from "@/lib/query";
import { ErrorState } from "@/components/error-state";
import { UsageChart } from "@/components/usage/usage-chart";
import { UsageBreakdown } from "@/components/usage/usage-breakdown";
import {
  UsageKpis,
  type KpiDelta,
  type UsageHero,
  type UsageStat,
} from "@/components/usage/usage-kpis";
import { UsageRuns } from "@/components/usage/usage-runs";
import { SegmentedControl } from "@/components/segmented-control";
import { FilterChips } from "@/components/filter-chips";
import { toast } from "sonner";

// The timezone travels with every request rather than being stored on the
// account, so day buckets are cut where the reader actually is.
const TZ = browserTimezone();

const COMPARISON: Record<UsageRange, string> = {
  "24h": "vs previous 24 hours",
  "7d": "vs previous 7 days",
  "30d": "vs previous 30 days",
  all: "all time",
};

const RECENT_RUNS = 12;

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
  const { data: runsRes, error: runsError } = useApi<UsageRunsResponse>(
    `/api/v1/usage/runs?${windowParams}&limit=${RECENT_RUNS}`,
    () => usageApi.runs({ range, tz: TZ, limit: RECENT_RUNS }),
  );

  const summary = summaryRes?.summary ?? null;
  const previous = summaryRes?.previous ?? null;
  const usageWindow = seriesRes?.window ?? null;
  const granularity = seriesRes?.bucket ?? "day";
  const loading = seriesRes === undefined || summaryRes === undefined;
  const breakdownLoading = breakdownRes === undefined;
  const runsLoading = runsRes === undefined;

  // Gaps are drawn, not skipped: a week with two active days must show five
  // empty ones or the two bars read as the whole week.
  const points = useMemo(
    () =>
      seriesRes
        ? zeroFillSeries(seriesRes.points, seriesRes.window, seriesRes.bucket)
        : [],
    [seriesRes],
  );

  const usageError = summaryError ?? seriesError ?? breakdownError ?? runsError;
  useEffect(() => {
    if (usageError) toast.error(usageError.message || "Failed to load usage");
  }, [usageError]);

  const coverage = summary ? usageCoverage(summary) : null;
  const content = useMemo(
    () => (summary ? kpiContent(summary, previous, points, range) : null),
    [summary, previous, points, range],
  );

  return (
    <div className="flex h-full flex-col">
      <PageToolbar actions={<RangeSelector value={range} onChange={setRange} />} />

      <div className="flex-1 px-8 pb-8 pt-2">
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
        ) : summary ? (
          <div className="space-y-6">
            <div>
              {content && <UsageKpis hero={content.hero} stats={content.stats} />}
              {coverage?.incomplete && (
                <p className="mt-3 flex items-start gap-2 text-caption text-mute">
                  <Info className="mt-px size-3.5 shrink-0" />
                  <span>
                    {coverage.reported} of {coverage.total} finished runs reported
                    usage. The other {coverage.missing} did not — a daemon that
                    stopped mid-run, or a provider that reports no tokens — so the
                    figures above are a lower bound, not the full total.
                  </span>
                </p>
              )}
            </div>

            <UsageChart
              points={points}
              bucket={granularity}
              usageWindow={usageWindow}
            />

            <section>
              <SectionHeading actions={<GroupSelector value={group} onChange={setGroup} />}>
                Breakdown
              </SectionHeading>
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

            <section>
              <SectionHeading
                actions={
                  <span className="text-caption text-mute">
                    Latest {RECENT_RUNS} · newest first
                  </span>
                }
              >
                Recent runs
              </SectionHeading>
              {runsLoading ? (
                <Skeleton className="h-56 w-full rounded-lg" />
              ) : (
                <UsageRuns runs={runsRes?.runs ?? []} />
              )}
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The four headline cards. Each one is a figure, what it is made of, and the
 * direction it moved against the window before it — the three things the old
 * six-number row left the reader to work out.
 */
/**
 * The top band's numbers. The total is the hero — it is the figure the page is
 * about — and the other three are the reasons it moved, so they sit in the
 * band underneath rather than beside it.
 */
function kpiContent(
  summary: UsageSummary,
  previous: UsageSummary | null,
  points: UsagePoint[],
  range: UsageRange,
): { hero: UsageHero; stats: UsageStat[] } {
  const total = totalTokens(summary);
  const rate = successRate(summary);
  const cache = cacheHitRate(summary);
  const comparison = COMPARISON[range];

  const previousTotal = previous ? totalTokens(previous) : undefined;
  const previousRate = previous ? successRate(previous) : null;
  const previousCache = previous ? cacheHitRate(previous) : null;

  const runsHint =
    `${formatCount(summary.runs_completed)} completed · ` +
    `${formatCount(summary.runs_failed)} failed` +
    (summary.runs_cancelled > 0
      ? ` · ${formatCount(summary.runs_cancelled)} cancelled`
      : "");

  const rateHint =
    rate === null
      ? "No finished runs"
      : `${formatCount(summary.runs_failed)} failed of ${formatCount(
          summary.runs_completed + summary.runs_failed,
        )} finished`;

  return {
    hero: {
      label: "Total tokens",
      value: formatTokens(total),
      hint: `${formatTokens(summary.input_tokens)} in · ${formatTokens(
        summary.output_tokens,
      )} out · ${formatTokens(
        summary.cache_read_tokens + summary.cache_write_tokens,
      )} cached`,
      delta: deltaOf(percentChange(total, previousTotal), "percent"),
      comparison,
      spark: points.map((point) => totalTokens(point)),
    },
    stats: [
      {
        label: "Runs",
        value: formatCount(summary.runs_total),
        hint: runsHint,
        delta: deltaOf(
          percentChange(summary.runs_total, previous?.runs_total),
          "percent",
        ),
        comparison,
      },
      {
        label: "Success rate",
        value: rate === null ? "—" : formatPercent(rate),
        hint: rateHint,
        delta: deltaOf(pointChange(rate, previousRate), "points"),
        comparison,
      },
      {
        label: "Cache hit rate",
        value: cache === null ? "—" : formatPercent(cache),
        hint: `${formatTokens(summary.cache_read_tokens)} read · ${formatTokens(
          summary.cache_write_tokens,
        )} written`,
        delta: deltaOf(pointChange(cache, previousCache), "points"),
        comparison,
      },
    ],
  };
}

function deltaOf(
  value: number | null,
  kind: KpiDelta["kind"],
): KpiDelta | null {
  return value === null ? null : { value, kind };
}

function RangeSelector({
  value,
  onChange,
}: {
  value: UsageRange;
  onChange: (r: UsageRange) => void;
}) {
  return (
    <SegmentedControl
      label="Time range"
      items={USAGE_RANGES.map((r) => ({
        value: r,
        label: USAGE_RANGE_LABELS[r],
        title: USAGE_RANGE_TITLES[r],
      }))}
      value={value}
      onChange={onChange}
    />
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
    <FilterChips
      label="Group by"
      items={USAGE_GROUPS.map((g) => ({ value: g, label: USAGE_GROUP_LABELS[g] }))}
      value={value}
      onChange={onChange}
    />
  );
}

function UsageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-xl border border-hairline bg-canvas">
        <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-end lg:justify-between lg:p-6">
          <div className="min-w-0">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-10 w-40" />
            <Skeleton className="mt-3 h-3 w-56" />
          </div>
          <Skeleton className="h-16 w-full lg:w-[44%]" />
        </div>
        <div className="grid grid-cols-1 divide-y divide-hairline border-t border-hairline sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="px-5 py-3.5">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="mt-2 h-5 w-20" />
              <Skeleton className="mt-2 h-3 w-28" />
            </div>
          ))}
        </div>
      </div>
      <Skeleton className="h-80 w-full rounded-lg" />
      <Skeleton className="h-52 w-full rounded-lg" />
    </div>
  );
}
