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
export function bucketLabel(bucket: string, granularity: "hour" | "day"): string {
  // Split as strings rather than through Date: parsing would re-interpret the
  // server's already-localised label and could shift a bar into the day next to
  // it. An unexpected shape falls through to the raw label rather than throwing.
  const [date, time] = bucket.split("T");
  const parts = (date ?? "").split("-");
  if (parts.length !== 3) return bucket;
  const [, month, day] = parts;
  return granularity === "hour" && time ? `${month}/${day} ${time}` : `${month}/${day}`;
}

/** Total tokens of one chart point, for scaling the bar heights. */
export function seriesMax(
  points: Array<TokenBuckets & { bucket: string }>,
): number {
  return points.reduce((max, p) => Math.max(max, totalTokens(p)), 0);
}

/**
 * The four stacked segments of one bar, as a fraction of the tallest bar in the
 * window. A bucket with nothing in it returns an empty array so the chart draws
 * a baseline tick rather than a zero-height stack.
 */
export function barSegments(
  point: TokenBuckets,
  max: number,
): Array<{ key: keyof TokenBuckets; label: string; fraction: number }> {
  if (max <= 0) return [];
  return [
    { key: "input_tokens" as const, label: "Input", fraction: point.input_tokens / max },
    { key: "output_tokens" as const, label: "Output", fraction: point.output_tokens / max },
    { key: "cache_read_tokens" as const, label: "Cache read", fraction: point.cache_read_tokens / max },
    { key: "cache_write_tokens" as const, label: "Cache write", fraction: point.cache_write_tokens / max },
  ];
}

/** The page's own timezone, sent so the server cuts day buckets where the reader is. */
export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
