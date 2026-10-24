import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bucketLabel,
  bucketTitle,
  cacheHitRate,
  formatCount,
  formatDelta,
  formatDuration,
  formatPercent,
  formatTokens,
  metricSegments,
  metricTotal,
  niceTicks,
  percentChange,
  pointChange,
  pointSuccessRate,
  runDuration,
  seriesMetricMax,
  successRate,
  totalTokens,
  usageCoverage,
  zeroFillSeries,
  browserTimezone,
  USAGE_RANGES,
  USAGE_GROUPS,
} from "./usage.ts";

const buckets = (over = {}) => ({
  input_tokens: 0,
  output_tokens: 0,
  cache_read_tokens: 0,
  cache_write_tokens: 0,
  ...over,
});

// Cache reads are a peer bucket of input, not a subset, so the total is a plain
// sum — and getting this wrong would double-count the cached prefix.
test("total sums all four buckets without double-counting cache", () => {
  assert.equal(
    totalTokens(buckets({ input_tokens: 10, output_tokens: 20, cache_read_tokens: 300, cache_write_tokens: 40 })),
    370,
  );
  assert.equal(totalTokens(buckets()), 0);
});

test("cache hit rate divides by prompt tokens only, and is null when there are none", () => {
  // Output tokens are not part of the prompt, so they must not dilute the rate.
  assert.equal(cacheHitRate(buckets({ input_tokens: 10, cache_read_tokens: 90, output_tokens: 500 })), 0.9);
  assert.equal(cacheHitRate(buckets({ cache_read_tokens: 0, input_tokens: 100 })), 0);
  // Nothing was sent at all: unknown, not 0%.
  assert.equal(cacheHitRate(buckets({ output_tokens: 100 })), null);
  assert.equal(cacheHitRate(buckets()), null);
});

// A rounded 99.6% would read as "100% of tokens came from cache", which is a
// different and stronger claim than the data supports.
test("percent floors instead of rounding to a false 100%", () => {
  assert.equal(formatPercent(0.996), "99%");
  assert.equal(formatPercent(1), "100%");
  assert.equal(formatPercent(0), "0%");
  assert.equal(formatPercent(0.125), "12%");
});

test("tokens format compactly and stay exact below a thousand", () => {
  assert.equal(formatTokens(0), "0");
  assert.equal(formatTokens(999), "999");
  assert.equal(formatTokens(1000), "1k");
  assert.equal(formatTokens(1234), "1.2k");
  assert.equal(formatTokens(12345), "12.3k");
  assert.equal(formatTokens(1_500_000), "1.5M");
  assert.equal(formatTokens(2_000_000), "2M");
  assert.equal(formatTokens(3_400_000_000), "3.4B");
});

// The whole point of the coverage figures: a window where some runs told us
// nothing must be distinguishable from one where everything was measured.
test("coverage separates missing usage from zero usage", () => {
  const complete = usageCoverage({ runs_with_usage: 4, runs_total: 4 });
  assert.deepEqual(
    { missing: complete.missing, incomplete: complete.incomplete, empty: complete.empty },
    { missing: 0, incomplete: false, empty: false },
  );

  const partial = usageCoverage({ runs_with_usage: 3, runs_total: 7 });
  assert.equal(partial.missing, 4);
  assert.equal(partial.incomplete, true);
  assert.equal(partial.empty, false);

  // Runs finished but none reported: everything is unknown.
  const none = usageCoverage({ runs_with_usage: 0, runs_total: 5 });
  assert.equal(none.empty, true);
  assert.equal(none.incomplete, true);

  // No runs at all is not "incomplete", it is simply nothing to show.
  const nothing = usageCoverage({ runs_with_usage: 0, runs_total: 0 });
  assert.equal(nothing.empty, true);
  assert.equal(nothing.incomplete, false);
  // Never negative, even if a provider reports usage for a run still in flight.
  assert.equal(usageCoverage({ runs_with_usage: 3, runs_total: 2 }).missing, 0);
});

test("bucket labels trim to month/day and keep the hour when there is one", () => {
  assert.equal(bucketLabel("2026-09-15", "day"), "09/15");
  assert.equal(bucketLabel("2026-09-15T14:00", "hour"), "09/15 14:00");
  assert.equal(bucketLabel("2026-09-15T06:00", "6h"), "09/15 06:00");
  // Midnight is the day boundary, not a time to print on an axis.
  assert.equal(bucketLabel("2026-09-15T00:00", "hour"), "09/15");
  assert.equal(bucketLabel("2026-09-15T00:00", "6h"), "09/15");
  // A day bucket ignores any hour part it was given.
  assert.equal(bucketLabel("2026-09-15T14:00", "day"), "09/15");
  // Unrecognised shapes fall through rather than throwing mid-render.
  assert.equal(bucketLabel("nonsense", "day"), "nonsense");
});

test("range and group vocabularies match what the server accepts", () => {
  assert.deepEqual([...USAGE_RANGES], ["24h", "7d", "30d", "all"]);
  assert.deepEqual([...USAGE_GROUPS], ["agent", "daemon", "workspace", "issue", "model"]);
});

const point = (over = {}) => ({
  bucket: "2026-10-23",
  input_tokens: 0,
  output_tokens: 0,
  cache_read_tokens: 0,
  cache_write_tokens: 0,
  run_count: 0,
  completed_runs: 0,
  failed_runs: 0,
  cancelled_runs: 0,
  ...over,
});

// A cancelled run neither succeeded nor failed. Counting it on either side of
// the ratio would blame the agent for a human stopping the run.
test("success rate is over finished runs, and unknown when none finished", () => {
  assert.equal(successRate({ runs_completed: 9, runs_failed: 1 }), 0.9);
  assert.equal(
    successRate({ runs_completed: 9, runs_failed: 1, runs_cancelled: 50 }),
    0.9,
  );
  assert.equal(
    successRate({ runs_completed: 0, runs_failed: 0, runs_cancelled: 3 }),
    null,
  );
  assert.equal(pointSuccessRate(point({ completed_runs: 3, failed_runs: 1 })), 0.75);
  assert.equal(pointSuccessRate(point({ failed_runs: 2 })), 0);
});

test("deltas compare a window with the one before it", () => {
  assert.equal(percentChange(120, 100), 0.2);
  assert.equal(percentChange(80, 100), -0.2);
  // No previous window, or nothing in it: "infinitely more than zero" is not a
  // percentage, and printing one would invent a scale.
  assert.equal(percentChange(50, undefined), null);
  assert.equal(percentChange(50, 0), null);
  assert.equal(percentChange(0, 0), null);
  assert.equal(pointChange(0.9, 0.85), 0.05);
  assert.equal(pointChange(0.9, null), null);
});

test("delta labels carry their direction and their unit", () => {
  assert.equal(formatDelta(0.123, "percent"), "+12%");
  assert.equal(formatDelta(-0.034, "percent"), "-3.4%");
  assert.equal(formatDelta(0.05, "points"), "+5pt");
  assert.equal(formatDelta(-0.0125, "points"), "-1.3pt");
  // No change has no direction, so it does not get a sign.
  assert.equal(formatDelta(0, "percent"), "0%");
});

test("the metric segments partition each reading", () => {
  const p = point({
    input_tokens: 10,
    output_tokens: 20,
    cache_read_tokens: 30,
    cache_write_tokens: 40,
    completed_runs: 2,
    failed_runs: 1,
    cancelled_runs: 1,
  });
  assert.deepEqual(
    metricSegments(p, "tokens").map((s) => s.key),
    ["input", "output", "cache-read", "cache-write"],
  );
  assert.equal(metricTotal(p, "tokens"), 100);
  assert.deepEqual(
    metricSegments(p, "runs").map((s) => s.value),
    [2, 1, 1],
  );
  assert.equal(metricTotal(p, "runs"), 4);
  // The runs view scales to the outcome split, not to run_count: they agree in
  // real data, and the split is what the bars draw.
  assert.equal(seriesMetricMax([p, point({ run_count: 9 })], "runs"), 4);
});

test("axis ticks reach a round number at or above the data", () => {
  assert.deepEqual(niceTicks(37000), [0, 10000, 20000, 30000, 40000]);
  assert.deepEqual(niceTicks(4), [0, 1, 2, 3, 4]);
  // No data still draws a baseline and one line to sit on.
  assert.deepEqual(niceTicks(0), [0, 1]);
});

test("zero-filling draws every bucket the window covers", () => {
  const window = {
    from: "2026-10-18T00:00:00Z",
    to: "2026-10-24T00:00:00Z",
    timezone: "UTC",
  };
  const filled = zeroFillSeries(
    [point({ bucket: "2026-10-20", input_tokens: 5, run_count: 1 })],
    window,
    "day",
  );
  assert.equal(filled.length, 7);
  assert.equal(filled[2].bucket, "2026-10-20");
  assert.equal(totalTokens(filled[2]), 5);
  // The quiet days are present and empty, so the two active bars do not read as
  // the whole week.
  assert.equal(totalTokens(filled[0]), 0);
  assert.equal(filled[0].run_count, 0);
  assert.deepEqual(
    filled.map((p) => p.bucket),
    [...filled.map((p) => p.bucket)].sort(),
  );

  // All-time can span years; its gaps are left alone rather than compressed.
  const points = [point({ bucket: "2020-01-01" })];
  const all = zeroFillSeries(
    points,
    { from: "1970-01-01T00:00:00Z", to: "2026-10-24T00:00:00Z", timezone: "UTC" },
    "day",
  );
  assert.deepEqual(all, points);
});

test("zero-filling walks the six-hour grid a week is drawn on", () => {
  const filled = zeroFillSeries(
    [point({ bucket: "2026-10-18T06:00", input_tokens: 9, run_count: 1 })],
    {
      from: "2026-10-17T18:00:00Z",
      to: "2026-10-18T18:00:00Z",
      timezone: "UTC",
    },
    "6h",
  );
  assert.deepEqual(
    filled.map((p) => p.bucket),
    [
      "2026-10-17T18:00",
      "2026-10-18T00:00",
      "2026-10-18T06:00",
      "2026-10-18T12:00",
      "2026-10-18T18:00",
    ],
  );
  assert.equal(totalTokens(filled[2]), 9);
  assert.equal(filled[1].run_count, 0);
});

test("durations are wall clock, and a run that never started has none", () => {
  assert.equal(runDuration("2026-10-23T10:00:00Z", "2026-10-23T10:02:14Z"), 134000);
  assert.equal(runDuration(null, "2026-10-23T10:02:14Z"), null);
  // A clock that went backwards is not a negative duration.
  assert.equal(runDuration("2026-10-23T10:02:14Z", "2026-10-23T10:00:00Z"), null);
  assert.equal(formatDuration(42_000), "42s");
  assert.equal(formatDuration(187_000), "3m 07s");
  assert.equal(formatDuration(4_320_000), "1h 12m");
  assert.equal(formatDuration(null), "—");
});

test("counts and bucket titles read for humans", () => {
  assert.equal(formatCount(12480), "12,480");
  assert.equal(bucketTitle("2026-10-18", "day"), "Oct 18, 2026");
  assert.equal(bucketTitle("2026-10-18T14:00", "hour"), "Oct 18, 2026 · 14:00");
  assert.equal(bucketTitle("nonsense", "day"), "nonsense");
});

test("timezone detection never throws", () => {
  const tz = browserTimezone();
  assert.equal(typeof tz, "string");
  assert.ok(tz.length > 0);
});
