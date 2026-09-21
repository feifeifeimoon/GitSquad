import { test } from "node:test";
import assert from "node:assert/strict";
import { timeAgo } from "./time.ts";

// A fixed clock, so the labels are asserted rather than the wall clock. The
// component that renders these (components/time-ago.tsx) passes its own reading
// in for the same reason: what is shown must depend on the value it was given.
const NOW = new Date("2026-09-21T12:00:00Z").getTime();
const ago = (ms) => new Date(NOW - ms).toISOString();

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

test("timeAgo labels a missing timestamp rather than guessing", () => {
  assert.equal(timeAgo(null, NOW), "never");
});

test("timeAgo steps through minutes, hours, days and weeks", () => {
  assert.equal(timeAgo(ago(0), NOW), "just now");
  assert.equal(timeAgo(ago(59 * 1000), NOW), "just now");
  assert.equal(timeAgo(ago(MINUTE), NOW), "1m ago");
  assert.equal(timeAgo(ago(59 * MINUTE), NOW), "59m ago");
  assert.equal(timeAgo(ago(HOUR), NOW), "1h ago");
  assert.equal(timeAgo(ago(23 * HOUR), NOW), "23h ago");
  assert.equal(timeAgo(ago(DAY), NOW), "1d ago");
  assert.equal(timeAgo(ago(6 * DAY), NOW), "6d ago");
  assert.equal(timeAgo(ago(WEEK), NOW), "1w ago");
  assert.equal(timeAgo(ago(3 * WEEK), NOW), "3w ago");
});

test("timeAgo falls back to a date past four weeks", () => {
  // 4w is the cutoff, so the label stops being relative rather than naming a
  // number of weeks nobody counts in.
  assert.equal(timeAgo(ago(4 * WEEK), NOW), "Aug 24, 2026");
});

test("timeAgo reads the clock it is handed, not the one it can find", () => {
  // The same instant, read a day later, must age by a day — this is what the
  // shared tick in components/time-ago.tsx relies on.
  const stamp = ago(2 * HOUR);
  assert.equal(timeAgo(stamp, NOW), "2h ago");
  assert.equal(timeAgo(stamp, NOW + DAY), "1d ago");
});
