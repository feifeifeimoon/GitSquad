"use client";

import { useMemo } from "react";
import type { UsagePoint } from "@/lib/api";
import {
  barSegments,
  bucketLabel,
  formatTokens,
  seriesMax,
  totalTokens,
  type TokenBuckets,
} from "@/lib/usage";

// The four buckets in stacking order, with the tokens they map to on the wire.
const SEGMENTS: Array<{ key: keyof TokenBuckets; label: string; className: string }> = [
  { key: "cache_write_tokens", label: "Cache write", className: "bg-warning" },
  { key: "cache_read_tokens", label: "Cache read", className: "bg-violet" },
  { key: "output_tokens", label: "Output", className: "bg-cyan-deep" },
  { key: "input_tokens", label: "Input", className: "bg-success" },
];

// How many x-axis labels the chart will show before thinning them out. A 30-day
// window has more bars than there is room for labels.
const MAX_AXIS_LABELS = 8;

export function UsageChart({
  points,
  bucket,
}: {
  points: UsagePoint[];
  bucket: "hour" | "day";
}) {
  const max = useMemo(() => seriesMax(points), [points]);

  // Show every Nth label, always anchored on the first so the axis starts where
  // the window does.
  const labelStep = Math.max(1, Math.ceil(points.length / MAX_AXIS_LABELS));

  if (points.length === 0) {
    return (
      <div className="flex h-44 items-center justify-center rounded-lg border border-dashed border-hairline">
        <p className="text-caption text-mute">Nothing in this window.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex h-44 items-end gap-px">
        {points.map((point, i) => {
          const total = totalTokens(point);
          return (
            <div
              key={point.bucket}
              className="flex h-full min-w-0 flex-1 flex-col"
              title={`${point.bucket} — ${formatTokens(total)} tokens, ${point.run_count} run${point.run_count === 1 ? "" : "s"}`}
            >
              {/* flex-1 gives this box a definite height so the segments'
                  percentage heights resolve against the bar area rather than an
                  auto-height parent (which would collapse them to nothing).
                  flex-col-reverse stacks the segments from the baseline up. */}
              <div className="flex flex-1 flex-col-reverse">
                {barSegments(point, max).map((segment) => (
                  <div
                    key={segment.key}
                    className={`${SEGMENTS.find((s) => s.key === segment.key)?.className ?? ""} ${
                      segment.fraction === 0 ? "" : "min-h-px"
                    }`}
                    // Percentage of the tallest bar, so every column shares one
                    // scale and the comparison between days is honest.
                    style={{ height: `${segment.fraction * 100}%` }}
                  />
                ))}
              </div>
              {/* Reserve the label row even when the text is thinned out, so
                  every bar starts from the same baseline. */}
              <span className="h-4 truncate pt-1 text-center font-mono text-[10px] text-mute">
                {i % labelStep === 0 ? bucketLabel(point.bucket, bucket) : ""}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-hairline pt-3">
        {SEGMENTS.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-caption text-mute">
            <span className={`size-2 rounded-xs ${s.className}`} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
