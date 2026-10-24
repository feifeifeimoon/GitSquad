"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { UsagePoint, UsageWindow } from "@/lib/api";
import {
  bucketLabel,
  bucketTitle,
  formatCount,
  formatTokens,
  metricSegments,
  niceTicks,
  seriesMetricMax,
  totalTokens,
  USAGE_METRICS,
  USAGE_METRIC_LABELS,
  USAGE_RANGE_TITLES,
  type UsageBucket,
  type UsageMetric,
} from "@/lib/usage";
import { SegmentedControl } from "@/components/segmented-control";
import { cn } from "@/lib/utils";

// One cool family for everything a run read — full-price input the darkest,
// near-free cache the palest — and one warm accent for what it wrote. The
// first palette was four unrelated hues and let the cheapest bucket shout; the
// second was graphite, which read as mud on white. Cold input / warm output
// carries the same story without a fourth colour.
//
// The chart itself is Recharts rather than stacked divs: axes, grid, cursor and
// tooltip placement are the library's job, and its category gap is what keeps
// the bars a gap apart instead of a canyon.
type SeriesKey =
  | "input"
  | "output"
  | "cacheRead"
  | "cacheWrite"
  | "completed"
  | "failed"
  | "cancelled";

const SERIES: Record<
  UsageMetric,
  Array<{
    key: string;
    dataKey: SeriesKey;
    label: string;
    dot: string;
    fill: string;
  }>
> = {
  tokens: [
    {
      key: "input",
      dataKey: "input",
      label: "Input",
      dot: "bg-usage-input",
      fill: "var(--usage-input)",
    },
    {
      key: "output",
      dataKey: "output",
      label: "Output",
      dot: "bg-usage-output",
      fill: "var(--usage-output)",
    },
    {
      key: "cache-read",
      dataKey: "cacheRead",
      label: "Cache read",
      dot: "bg-usage-read",
      fill: "var(--usage-read)",
    },
    {
      key: "cache-write",
      dataKey: "cacheWrite",
      label: "Cache write",
      dot: "bg-usage-write",
      fill: "var(--usage-write)",
    },
  ],
  runs: [
    {
      key: "completed",
      dataKey: "completed",
      label: "Completed",
      dot: "bg-usage-accent",
      fill: "var(--usage-accent)",
    },
    {
      key: "failed",
      dataKey: "failed",
      label: "Failed",
      dot: "bg-usage-fail",
      fill: "var(--usage-fail)",
    },
    {
      key: "cancelled",
      dataKey: "cancelled",
      label: "Cancelled",
      dot: "bg-usage-idle",
      fill: "var(--usage-idle)",
    },
  ],
};

interface SeriesRow {
  bucket: string;
  label: string;
  fullLabel: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  completed: number;
  failed: number;
  cancelled: number;
  runs: number;
  tokens: number;
}

// Seven labels across the plot leaves ~130px between them at a 30-day window;
// more than that and the mono date labels start touching.
const MAX_AXIS_LABELS = 7;

/**
 * Spend and runs over time, one axis, two readings.
 *
 * The reading is the same series either way — what it cost, and what ran — so
 * flipping the switch never refetches and the two can never disagree. The
 * legend under the plot carries each segment's total and share and can dim one
 * to pull it out of the stack.
 */
export function UsageChart({
  points,
  bucket,
  usageWindow,
}: {
  points: UsagePoint[];
  bucket: UsageBucket;
  usageWindow: UsageWindow | null;
}) {
  const [metric, setMetric] = useState<UsageMetric>("tokens");
  const [dimmed, setDimmed] = useState<ReadonlySet<string>>(new Set());

  const series = SERIES[metric];
  const max = useMemo(() => seriesMetricMax(points, metric), [points, metric]);
  const ticks = useMemo(() => {
    // Five steps rather than four: at the token volumes this page sees, a
    // four-step axis rounds 115k up to 150k and leaves a third of the plot
    // empty above the tallest bar.
    const raw = niceTicks(max, 5);
    return metric === "runs" ? raw.filter((tick) => Number.isInteger(tick)) : raw;
  }, [max, metric]);
  const top = ticks[ticks.length - 1] || 1;

  const rows = useMemo<SeriesRow[]>(() => {
    // Six-hour bins are labelled only where a day starts: twenty-eight ticks of
    // "10/18 06:00" would be a wall of text, and the four bins of a day are
    // already grouped by their shared date. Hourly and daily series keep the
    // index-based thinning.
    const labelStep = Math.max(1, Math.ceil(points.length / MAX_AXIS_LABELS));
    return points.map((point, i) => {
      const midnight = point.bucket.endsWith("T00:00");
      const show =
        bucket === "6h" ? midnight : i % labelStep === 0;
      return {
        bucket: point.bucket,
        label: show ? bucketLabel(point.bucket, bucket) : "",
        fullLabel: bucketTitle(point.bucket, bucket),
        input: point.input_tokens,
        output: point.output_tokens,
        cacheRead: point.cache_read_tokens,
        cacheWrite: point.cache_write_tokens,
        completed: point.completed_runs,
        failed: point.failed_runs,
        cancelled: point.cancelled_runs,
        runs: point.run_count,
        tokens: totalTokens(point),
      };
    });
  }, [points, bucket]);

  // The legend's totals are for the whole window, not the hovered column: it is
  // the key to the chart, so it should not change under the cursor.
  const totals = useMemo(() => {
    const sums: Record<string, number> = {};
    for (const point of points) {
      for (const segment of metricSegments(point, metric)) {
        sums[segment.key] = (sums[segment.key] ?? 0) + segment.value;
      }
    }
    return sums;
  }, [points, metric]);
  const legendTotal = Object.values(totals).reduce((sum, n) => sum + n, 0);

  const format = (value: number) =>
    metric === "tokens" ? formatTokens(value) : formatCount(value);

  const rangeTitle =
    (USAGE_RANGE_TITLES as Record<string, string>)[usageWindow?.range ?? ""] ??
    usageWindow?.range ??
    "";
  const subtitle = usageWindow
    ? `${rangeTitle} · bucketed by ${bucket} in ${usageWindow.timezone}`
    : "";

  const toggleSegment = (key: string) => {
    setDimmed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <section className="overflow-hidden rounded-lg border border-hairline bg-canvas shadow-level-2">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-label font-semibold text-ink">Usage over time</h2>
          <p className="mt-0.5 text-caption text-mute">{subtitle}</p>
        </div>
        <SegmentedControl
          label="Metric"
          items={USAGE_METRICS.map((value) => ({
            value,
            label: USAGE_METRIC_LABELS[value],
          }))}
          value={metric}
          onChange={setMetric}
        />
      </div>

      <div className="p-4">
        {points.length === 0 ? (
          <div className="flex h-44 items-center justify-center rounded-lg border border-dashed border-hairline">
            <p className="text-caption text-mute">Nothing in this window.</p>
          </div>
        ) : (
          <>
            <div className="usage-chart h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={rows}
                  margin={{ top: 8, right: 0, bottom: 0, left: 0 }}
                  // A gap, not a canyon: the bars belong to the same axis and
                  // should read as one series of columns.
                  barCategoryGap="12%"
                >
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="label"
                    // The rows already decide which labels exist (midnights
                    // for six-hour bins, every Nth otherwise), so every
                    // category keeps its tick and only the chosen ones print.
                    interval={0}
                    axisLine={false}
                    tickLine={false}
                    tickMargin={8}
                    height={24}
                  />
                  <YAxis
                    ticks={ticks}
                    domain={[0, top]}
                    width={44}
                    axisLine={false}
                    tickLine={false}
                    tickMargin={4}
                    tickFormatter={format}
                  />
                  <Tooltip
                    wrapperStyle={{ outline: "none" }}
                    content={
                      <UsageTooltip
                        metric={metric}
                        format={format}
                        dimmed={dimmed}
                      />
                    }
                  />
                  {series.map((segment, i) => (
                    <Bar
                      key={segment.key}
                      dataKey={segment.dataKey}
                      stackId="usage"
                      fill={segment.fill}
                      fillOpacity={dimmed.has(segment.key) ? 0.15 : 1}
                      isAnimationActive={false}
                      // Only the top of the stack is rounded; the segments
                      // below it meet each other flush.
                      radius={i === series.length - 1 ? [3, 3, 0, 0] : undefined}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* The key, carrying what the eye cannot measure: each segment's
                total and its share of the window. Clicking one dims it out of
                the stack so the other three can be read on their own. */}
            <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-hairline pt-3">
              {series.map((segment) => {
                const off = dimmed.has(segment.key);
                const share =
                  legendTotal > 0
                    ? Math.round(((totals[segment.key] ?? 0) / legendTotal) * 100)
                    : 0;
                return (
                  <button
                    key={segment.key}
                    type="button"
                    aria-pressed={!off}
                    title={off ? `Show ${segment.label}` : `Dim ${segment.label}`}
                    onClick={() => toggleSegment(segment.key)}
                    className={cn(
                      "flex items-center gap-2 rounded-full py-1 pl-2 pr-2.5 text-caption transition-colors",
                      off
                        ? "bg-transparent text-mute"
                        : "bg-muted text-body hover:bg-canvas-soft-2",
                    )}
                  >
                    <span
                      className={cn(
                        // A hairline ring keeps the pale swatches from
                        // dissolving into the pill.
                        "size-2 shrink-0 rounded-full ring-1 ring-inset ring-ink/15",
                        segment.dot,
                        off && "opacity-30",
                      )}
                    />
                    <span
                      className={cn("font-medium", off ? "text-mute" : "text-ink")}
                    >
                      {segment.label}
                    </span>
                    <span className="font-mono text-micro tabular-nums">
                      {format(totals[segment.key] ?? 0)}
                    </span>
                    <span className="font-mono text-micro tabular-nums text-mute">
                      {share}%
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/**
 * The hover card. Recharts positions it; the content is ours, because the
 * useful reading of a bucket is per segment plus "how many runs was that".
 */
function UsageTooltip({
  active,
  payload,
  metric,
  format,
  dimmed,
}: {
  active?: boolean;
  payload?: Array<{ payload?: SeriesRow }>;
  metric: UsageMetric;
  format: (value: number) => string;
  dimmed: ReadonlySet<string>;
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="min-w-40 rounded-md border border-hairline bg-canvas p-2.5 shadow-level-3">
      <p className="text-micro font-medium text-ink">{row.fullLabel}</p>
      <dl className="mt-1.5 space-y-0.5">
        {SERIES[metric].map((segment) => (
          <div
            key={segment.key}
            className={cn(
              "flex items-center justify-between gap-6 text-micro",
              dimmed.has(segment.key) && "opacity-40",
            )}
          >
            <dt className="flex items-center gap-1.5 text-body">
              <span className={cn("size-1.5 rounded-xs", segment.dot)} />
              {segment.label}
            </dt>
            <dd className="tabular-nums text-ink">
              {format(row[segment.dataKey])}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-1.5 space-y-0.5 border-t border-hairline pt-1.5 text-micro">
        <div className="flex items-center justify-between gap-6">
          <span className="text-mute">Runs</span>
          <span className="tabular-nums text-ink">{formatCount(row.runs)}</span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span className="text-mute">Tokens</span>
          <span className="tabular-nums text-ink">{formatTokens(row.tokens)}</span>
        </div>
      </div>
    </div>
  );
}
