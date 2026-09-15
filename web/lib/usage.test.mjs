import { test } from "node:test";
import assert from "node:assert/strict";
import {
  barSegments,
  bucketLabel,
  cacheHitRate,
  formatPercent,
  formatTokens,
  seriesMax,
  totalTokens,
  usageCoverage,
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
  // A day bucket ignores any hour part it was given.
  assert.equal(bucketLabel("2026-09-15T14:00", "day"), "09/15");
  // Unrecognised shapes fall through rather than throwing mid-render.
  assert.equal(bucketLabel("nonsense", "day"), "nonsense");
});

test("bar segments scale against the tallest bar in the window", () => {
  const max = seriesMax([
    buckets({ input_tokens: 100 }),
    buckets({ input_tokens: 50, output_tokens: 150 }),
  ]);
  assert.equal(max, 200);

  const segs = barSegments(buckets({ input_tokens: 100, cache_read_tokens: 100 }), 200);
  assert.equal(segs.length, 4);
  assert.equal(segs[0].fraction, 0.5);
  assert.equal(segs[2].fraction, 0.5);
  assert.equal(segs[1].fraction, 0);

  // An empty window has no scale, so there are no segments to stack.
  assert.deepEqual(barSegments(buckets(), 0), []);
  assert.equal(seriesMax([]), 0);
});

test("range and group vocabularies match what the server accepts", () => {
  assert.deepEqual([...USAGE_RANGES], ["24h", "7d", "30d", "all"]);
  assert.deepEqual([...USAGE_GROUPS], ["agent", "daemon", "workspace", "issue", "model"]);
});

test("timezone detection never throws", () => {
  const tz = browserTimezone();
  assert.equal(typeof tz, "string");
  assert.ok(tz.length > 0);
});
