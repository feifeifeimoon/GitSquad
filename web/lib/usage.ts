// Token-usage arithmetic and formatting, shared by the console's usage page.
//
// One rule runs through all of it: a missing figure is never rendered as zero.
// Usage can be absent because a daemon died mid-run, because a provider does not
// report tokens, or because the run predates the ledger — and none of those mean
// the run was free.

export interface TokenBuckets {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
}

/**
 * One bucket of the trend series as it arrives on the wire. Declared here as
 * well as in the API client so this module stays importable by the Node test
 * runner, which resolves no path aliases; the two shapes are structural and a
 * drift shows up as a type error at the call site.
 */
export interface UsagePoint extends TokenBuckets {
  bucket: string;
  run_count: number;
  completed_runs: number;
  failed_runs: number;
  cancelled_runs: number;
}

/**
 * Granularity of the trend series, mirroring the API's. Six-hour bins exist so
 * a week draws ~28 columns instead of eight slabs across a desktop-wide panel.
 */
export type UsageBucket = "hour" | "6h" | "day";

/**
 * The windows the console offers. All are rolling rather than calendar-aligned:
 * "the last 24 hours" is what an operator means when asking what a machine has
 * burned today, and a rolling window has no week or month boundary to get subtly
 * wrong per timezone.
 */
export const USAGE_RANGES = ["24h", "7d", "30d", "all"] as const;
export type UsageRange = (typeof USAGE_RANGES)[number];

export const USAGE_RANGE_LABELS: Record<UsageRange, string> = {
  "24h": "24h",
  "7d": "7d",
  "30d": "30d",
  all: "All",
};

export const USAGE_RANGE_TITLES: Record<UsageRange, string> = {
  "24h": "Rolling last 24 hours",
  "7d": "Rolling last 7 days",
  "30d": "Rolling last 30 days",
  all: "All time",
};

/** The dimensions a usage breakdown can be grouped by. */
export const USAGE_GROUPS = [
  "agent",
  "daemon",
  "workspace",
  "issue",
  "model",
] as const;
export type UsageGroup = (typeof USAGE_GROUPS)[number];

export const USAGE_GROUP_LABELS: Record<UsageGroup, string> = {
  agent: "Agent",
  daemon: "Runtime",
  workspace: "Workspace",
  issue: "Issue",
  model: "Model",
};

/**
 * The four buckets summed. Cache reads are a peer bucket of input, not a subset
 * of it, so this adds up without counting a cached token twice.
 */
export function totalTokens(b: TokenBuckets): number {
  return (
    b.input_tokens + b.output_tokens + b.cache_read_tokens + b.cache_write_tokens
  );
}

/**
 * Share of prompt tokens served from the cache, as a 0-1 fraction. Null when no
 * prompt tokens were sent at all — 0% would claim a cache that was never
 * exercised, which is a different (and wrong) statement.
 */
export function cacheHitRate(b: TokenBuckets): number | null {
  const prompt = b.input_tokens + b.cache_read_tokens + b.cache_write_tokens;
  if (prompt === 0) return null;
  return b.cache_read_tokens / prompt;
}

export function formatPercent(fraction: number): string {
  // Floored, not rounded: on a cache-heavy run 99.6% rounds to "100%", which
  // claims every prompt token came from cache.
  return `${Math.floor(fraction * 100)}%`;
}

/** Compact token counts — 12.3k, 4.5M, 1.2B. Exact below a thousand. */
export function formatTokens(n: number): string {
  const abs = Math.abs(n);
  if (abs < 1000) return String(n);
  const units: Array<[number, string]> = [
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "k"],
  ];
  for (const [size, suffix] of units) {
    if (abs >= size) {
      const scaled = n / size;
      // One decimal place, but not a trailing ".0" — "2k" reads better than
      // "2.0k" and the precision is noise at these magnitudes anyway.
      const rounded = Math.round(scaled * 10) / 10;
      return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}${suffix}`;
    }
  }
  return String(n);
}

/**
 * How complete the window's data is. `reported` of `total` finished runs
 * produced token figures; the rest are unknown, not zero.
 */
export interface UsageCoverage {
  reported: number;
  total: number;
  /** Runs that finished without reporting usage. */
  missing: number;
  /** True when some finished runs told us nothing. */
  incomplete: boolean;
  /** True when nothing in the window reported usage. */
  empty: boolean;
}

export function usageCoverage(summary: {
  runs_with_usage: number;
  runs_total: number;
}): UsageCoverage {
  const missing = Math.max(0, summary.runs_total - summary.runs_with_usage);
  return {
    reported: summary.runs_with_usage,
    total: summary.runs_total,
    missing,
    incomplete: missing > 0,
    empty: summary.runs_with_usage === 0,
  };
}

/**
 * A bucket label from the server ("2026-09-15" or "2026-09-15T14:00") rendered
 * for a chart axis. Parsed as a plain string, not through Date, so a
 * local-timezone shift cannot move a bar into the neighbouring day.
 */
/**
 * A bucket label from the server ("2026-09-15" or "2026-09-15T14:00") rendered
 * for a chart axis. Parsed as a plain string, not through Date, so a
 * local-timezone shift cannot move a bar into the neighbouring day.
 *
 * Midnight is the day boundary, not a time: at hour or six-hour granularity it
 * prints as the date alone, which is also what the thinned axis lands on.
 */
export function bucketLabel(bucket: string, granularity: UsageBucket): string {
  // Split as strings rather than through Date: parsing would re-interpret the
  // server's already-localised label and could shift a bar into the day next to
  // it. An unexpected shape falls through to the raw label rather than throwing.
  const [date, time] = bucket.split("T");
  const parts = (date ?? "").split("-");
  if (parts.length !== 3) return bucket;
  const [, month, day] = parts;
  if (granularity === "day" || !time || time === "00:00") {
    return `${month}/${day}`;
  }
  return `${month}/${day} ${time}`;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * A bucket's full label, for a tooltip rather than an axis: "Oct 18, 2026" or
 * "Oct 18, 2026 · 14:00". Built from the string parts for the same reason as
 * bucketLabel — a Date round-trip could move the label to the neighbouring day.
 */
export function bucketTitle(bucket: string, granularity: UsageBucket): string {
  const [date, time] = bucket.split("T");
  const parts = (date ?? "").split("-");
  if (parts.length !== 3) return bucket;
  const [year, month, day] = parts;
  const monthName = MONTHS[Number(month) - 1] ?? month;
  const label = `${monthName} ${Number(day)}, ${year}`;
  return granularity !== "day" && time ? `${label} · ${time}` : label;
}

// ── The chart's two readings ──────────────────────────────────────────

/**
 * What the trend chart is counting. The page has two questions to answer about
 * the same axis — what it cost, and what ran — and the series carries both, so
 * the switch never refetches and the two views can never disagree.
 */
export const USAGE_METRICS = ["tokens", "runs"] as const;
export type UsageMetric = (typeof USAGE_METRICS)[number];

export const USAGE_METRIC_LABELS: Record<UsageMetric, string> = {
  tokens: "Tokens",
  runs: "Runs",
};

export interface MetricSegment {
  key: string;
  label: string;
  value: number;
}

/**
 * One bucket's stacked segments, from the baseline up. Token spend is split by
 * where it went (input, output, the two cache buckets); runs are split by how
 * they ended, which is the same partition the success rate uses.
 */
export function metricSegments(
  point: UsagePoint,
  metric: UsageMetric,
): MetricSegment[] {
  if (metric === "tokens") {
    return [
      { key: "input", label: "Input", value: point.input_tokens },
      { key: "output", label: "Output", value: point.output_tokens },
      { key: "cache-read", label: "Cache read", value: point.cache_read_tokens },
      { key: "cache-write", label: "Cache write", value: point.cache_write_tokens },
    ];
  }
  return [
    { key: "completed", label: "Completed", value: point.completed_runs },
    { key: "failed", label: "Failed", value: point.failed_runs },
    { key: "cancelled", label: "Cancelled", value: point.cancelled_runs },
  ];
}

/** The height a bucket's bar represents. */
export function metricTotal(point: UsagePoint, metric: UsageMetric): number {
  return metricSegments(point, metric).reduce((sum, s) => sum + s.value, 0);
}

/** The tallest bar in the view; the axis is built from it. */
export function seriesMetricMax(points: UsagePoint[], metric: UsageMetric): number {
  return points.reduce((max, p) => Math.max(max, metricTotal(p, metric)), 0);
}

// ── Comparing a window with the one before it ─────────────────────────

/**
 * Success rate over finished runs: completed / (completed + failed). Cancelled
 * runs are excluded from both sides — they neither succeeded nor failed, and
 * counting them would blame the agents for a human cancelling a run.
 *
 * Null when nothing finished: 0% would claim every run failed.
 */
export function successRate(summary: {
  runs_completed: number;
  runs_failed: number;
}): number | null {
  const finished = summary.runs_completed + summary.runs_failed;
  if (finished === 0) return null;
  return summary.runs_completed / finished;
}

/** The same rate for one bucket of the trend. */
export function pointSuccessRate(point: UsagePoint): number | null {
  return successRate({
    runs_completed: point.completed_runs,
    runs_failed: point.failed_runs,
  });
}

/**
 * Relative change against the previous window, as a 0-1 fraction. Null when
 * there is no previous figure to divide by, or when the previous window had
 * nothing — "infinitely more than zero" is not a percentage.
 */
export function percentChange(
  current: number,
  previous: number | undefined,
): number | null {
  if (previous === undefined || previous === 0) return null;
  return (current - previous) / previous;
}

/**
 * Change in a rate, in rate points (a 0.85 → 0.9 move is +5 points). Null when
 * either side is unknown.
 */
export function pointChange(
  current: number | null,
  previous: number | null,
): number | null {
  if (current === null || previous === null) return null;
  // Rates arrive as fractions, and 0.9 - 0.85 is 0.050000000000000044. The
  // difference is only ever rendered, so trim the binary noise here rather than
  // letting it reach a label.
  return Number((current - previous).toFixed(6));
}

/**
 * A signed delta for a KPI card: "+12%" for a relative change, "+3pt" for a
 * rate. Precision is floored to what a card can read — a lone decimal below
 * ten percent, whole numbers above it — and a zero change keeps its sign-less
 * form rather than claiming a direction.
 */
export function formatDelta(
  delta: number,
  kind: "percent" | "points",
): string {
  const magnitude = Math.abs(delta) * 100;
  if (magnitude < 0.05) return kind === "percent" ? "0%" : "0pt";
  const digits = magnitude < 10 ? 1 : 0;
  // Number(...) drops a trailing ".0": "+5pt" reads better than "+5.0pt".
  const text = `${Number(magnitude.toFixed(digits))}${kind === "percent" ? "%" : "pt"}`;
  return delta > 0 ? `+${text}` : `-${text}`;
}

// ── Durations ─────────────────────────────────────────────────────────

/** A run's wall-clock duration, or null when it never reported a start. */
export function runDuration(
  startedAt?: string | null,
  completedAt?: string | null,
): number | null {
  if (!startedAt || !completedAt) return null;
  const ms = Date.parse(completedAt) - Date.parse(startedAt);
  return Number.isFinite(ms) && ms >= 0 ? ms : null;
}

/** Compact duration: 42s, 3m 07s, 1h 12m. */
export function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) {
    return seconds === 0
      ? `${minutes}m`
      : `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** Counts with thousands separators; runs read as "1,248", not "1248". */
export function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

// ── Axis ticks ────────────────────────────────────────────────────────

/**
 * Axis values from 0 to a round number at or above the data, at a readable
 * step. Bars are scaled against the *top* tick rather than the raw maximum —
 * otherwise the tallest bar touches the ceiling of the plot while the axis
 * claims a larger value above it.
 */
export function niceTicks(max: number, count = 4): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0, 1];
  const rough = max / count;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const residual = rough / magnitude;
  const step =
    (residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 2.5 ? 2.5 : residual <= 5 ? 5 : 10) *
    magnitude;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let value = 0; value <= top + step / 2; value += step) {
    ticks.push(Number(value.toFixed(6)));
  }
  return ticks;
}

// ── Filling the gaps in a series ──────────────────────────────────────

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const MAX_FILLED_BUCKETS = 96;

/**
 * Every bucket the window covers, with zeros for the ones the server did not
 * return. Without this a week with two active days draws two bars stretched
 * across the whole width, which reads as two days of the week rather than two
 * days out of seven.
 *
 * All-time windows are left alone: they can span years, and a bar per empty day
 * since the epoch would compress the data that exists into nothing.
 */
export function zeroFillSeries(
  points: UsagePoint[],
  window: { from: string; to: string; timezone: string },
  bucket: UsageBucket,
): UsagePoint[] {
  const from = Date.parse(window.from);
  const to = Date.parse(window.to);
  const step =
    bucket === "hour" ? HOUR_MS : bucket === "6h" ? 6 * HOUR_MS : DAY_MS;
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return points;
  if ((to - from) / step > MAX_FILLED_BUCKETS) return points;

  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: window.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      ...(bucket === "day"
        ? {}
        : { hour: "2-digit", hourCycle: "h23" as const }),
    });
  } catch {
    // An unknown zone would mean an axis of wrong labels; the server's own
    // buckets are still true, so leave them as they are.
    return points;
  }

  const byBucket = new Map(points.map((p) => [p.bucket, p]));
  const filled: UsagePoint[] = [];
  const seen = new Set<string>();
  for (let t = from; t <= to; t += step) {
    const label = bucketKey(formatter, new Date(t), bucket);
    if (seen.has(label)) continue;
    seen.add(label);
    filled.push(byBucket.get(label) ?? emptyPoint(label));
  }

  // A transition that shifted an offset can leave a server bucket the walk
  // missed; keep it rather than dropping a real data point.
  for (const point of points) {
    if (!seen.has(point.bucket)) filled.push(point);
  }
  return filled.sort((a, b) => (a.bucket < b.bucket ? -1 : a.bucket > b.bucket ? 1 : 0));
}

function bucketKey(
  formatter: Intl.DateTimeFormat,
  date: Date,
  bucket: UsageBucket,
): string {
  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  // Some ICU versions render midnight as hour 24 under h23; the server's
  // to_char uses 00, and the two have to agree or the bucket is dropped.
  const hour = get("hour") === "24" ? "00" : get("hour");
  const day = `${get("year")}-${get("month")}-${get("day")}`;
  if (bucket === "day") return day;
  // date_bin cuts six-hour bins on the local clock at 00/06/12/18; flooring the
  // wall-clock hour reproduces the same label, including for offsets that are
  // not a whole hour.
  const label =
    bucket === "6h"
      ? `${String(Math.floor(Number(hour) / 6) * 6).padStart(2, "0")}`
      : hour;
  return `${day}T${label}:00`;
}

function emptyPoint(bucket: string): UsagePoint {
  return {
    bucket,
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    run_count: 0,
    completed_runs: 0,
    failed_runs: 0,
    cancelled_runs: 0,
  };
}

/** The page's own timezone, sent so the server cuts day buckets where the reader is. */
export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
