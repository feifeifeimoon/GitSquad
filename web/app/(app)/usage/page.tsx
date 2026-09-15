"use client";

import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import {
  usageApi,
  type UsageBreakdownRow,
  type UsagePoint,
  type UsageSummary,
  type UsageWindow,
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
import { Skeleton } from "@/components/ui/skeleton";
import { UsageChart } from "@/components/usage/usage-chart";
import { UsageBreakdown } from "@/components/usage/usage-breakdown";
import { toast } from "sonner";

// The timezone travels with every request rather than being stored on the
// account, so day buckets are cut where the reader actually is.
const TZ = browserTimezone();

export default function UsagePage() {
  const [range, setRange] = useState<UsageRange>("7d");
  const [group, setGroup] = useState<UsageGroup>("agent");
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [usageWindow, setUsageWindow] = useState<UsageWindow | null>(null);
  const [points, setPoints] = useState<UsagePoint[]>([]);
  const [granularity, setGranularity] = useState<"hour" | "day">("day");
  const [rows, setRows] = useState<{
    key: string;
    rows: UsageBreakdownRow[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  // Summary and series only depend on the window; the breakdown additionally
  // depends on the chosen dimension, so the two load independently — switching
  // dimension must not re-render the headline figures back to skeletons.
  useEffect(() => {
    let cancelled = false;
    const params = { range, tz: TZ };
    Promise.all([usageApi.summary(params), usageApi.series(params)])
      .then(([s, series]) => {
        if (cancelled) return;
        setSummary(s.summary);
        setUsageWindow(s.window);
        setPoints(series.points);
        setGranularity(series.bucket);
      })
      .catch((err) => {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : "Failed to load usage");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  // The breakdown is keyed by what it was fetched for, so "still loading" is
  // simply "the rows on hand belong to something else" — no separate flag to
  // keep in sync with two changing inputs.
  const rowsKey = `${range}:${group}`;
  const breakdownLoading = rows?.key !== rowsKey;

  useEffect(() => {
    let cancelled = false;
    usageApi
      .breakdown({ range, tz: TZ, groupBy: group })
      .then((res) => {
        if (!cancelled) setRows({ key: `${range}:${group}`, rows: res.rows });
      })
      .catch((err) => {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : "Failed to load usage");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [range, group]);

  const coverage = summary ? usageCoverage(summary) : null;
  const total = summary ? totalTokens(summary) : 0;
  const rate = summary ? cacheHitRate(summary) : null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-8 py-4">
        <h1 className="text-sm font-medium text-ink">Usage</h1>
        <RangeSelector value={range} onChange={setRange} />
      </div>

      <div className="flex-1 px-8 pb-12 pt-6">
        {loading ? (
          <UsageSkeleton />
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
              <p className="mt-4 flex items-start gap-2 text-xs text-mute">
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
                <h2 className="text-sm font-medium text-ink">Tokens over time</h2>
                <span className="text-xs text-mute">
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
                <h2 className="text-sm font-medium text-ink">Breakdown</h2>
                <GroupSelector value={group} onChange={setGroup} />
              </div>
              {breakdownLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-11 w-full rounded-lg" />
                  ))}
                </div>
              ) : (
                <UsageBreakdown group={group} rows={rows?.rows ?? []} />
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
      <p className="font-mono text-xs font-semibold uppercase tracking-wide text-mute">
        {label}
      </p>
      <p
        className={`mt-1 truncate tabular-nums ${
          emphasis ? "text-xl font-semibold text-ink" : "text-base text-body"
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
          className={`rounded-xs px-2.5 py-1 text-xs font-medium transition-colors ${
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
          className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
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
