"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Sparkline } from "@/components/usage/sparkline";
import { formatDelta } from "@/lib/usage";
import { cn } from "@/lib/utils";

// The page's headline, as one surface rather than four equal boxes.
//
// Four identical cards made every figure weigh the same, which is the opposite
// of what the page is about: the total is the thing you came to read, and the
// other three are the reasons it moved. So the total is a display number with
// an area trend behind it, and runs / success / cache sit in a divided band
// underneath. The wash in the corner is the accent from the chart below, so the
// band and the chart read as one instrument instead of two widgets.

export interface KpiDelta {
  value: number;
  kind: "percent" | "points";
}

export interface UsageHero {
  label: string;
  value: string;
  hint: string;
  delta: KpiDelta | null;
  comparison: string;
  spark: Array<number | null>;
}

export interface UsageStat {
  label: string;
  value: string;
  hint: string;
  delta: KpiDelta | null;
  comparison: string;
}

export function UsageKpis({
  hero,
  stats,
}: {
  hero: UsageHero;
  stats: UsageStat[];
}) {
  return (
    <section className="relative overflow-hidden rounded-xl border border-hairline bg-canvas shadow-level-2">
      <div className="usage-wash pointer-events-none absolute inset-0" aria-hidden />

      <div className="relative flex flex-col gap-5 p-5 lg:flex-row lg:items-end lg:justify-between lg:gap-10 lg:p-6">
        <div className="min-w-0">
          <p className="text-caption text-mute">{hero.label}</p>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
            <p className="text-[40px] leading-none font-semibold tracking-[-0.035em] tabular-nums text-ink">
              {hero.value}
            </p>
            {hero.delta && (
              <DeltaPill delta={hero.delta} comparison={hero.comparison} />
            )}
          </div>
          <p className="mt-2.5 truncate text-caption text-mute" title={hero.hint}>
            {hero.hint}
          </p>
        </div>

        <div className="h-16 w-full shrink-0 lg:w-[44%]">
          <Sparkline
            area
            values={hero.spark}
            className="h-full w-full text-usage-accent"
          />
        </div>
      </div>

      {/* Divided cells, not cards: three facts about the same window, read as
          one row of a ledger. */}
      <div className="relative grid grid-cols-1 divide-y divide-hairline border-t border-hairline sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {stats.map((stat) => (
          <div key={stat.label} className="min-w-0 px-5 py-3.5">
            <p className="text-caption text-mute">{stat.label}</p>
            <div className="mt-1.5 flex flex-wrap items-baseline gap-2">
              <p className="text-title font-semibold tracking-[-0.01em] tabular-nums text-ink">
                {stat.value}
              </p>
              {stat.delta && (
                <DeltaPill
                  compact
                  delta={stat.delta}
                  comparison={stat.comparison}
                />
              )}
            </div>
            <p className="mt-1 truncate text-caption text-mute" title={stat.hint}>
              {stat.hint}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function DeltaPill({
  delta,
  comparison,
  compact = false,
}: {
  delta: KpiDelta;
  comparison: string;
  compact?: boolean;
}) {
  const Icon =
    delta.value > 0 ? ArrowUpRight : delta.value < 0 ? ArrowDownRight : Minus;
  return (
    <span
      title={comparison}
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded-full font-medium tabular-nums",
        compact ? "px-1.5 py-0.5 text-micro" : "px-2 py-0.5 text-caption",
        // More spend is not a success and less is not a failure, so only an
        // increase borrows the accent; a decrease stays neutral rather than
        // turning red and implying an error.
        delta.value > 0
          ? "bg-usage-accent/10 text-usage-accent"
          : "bg-muted text-body",
      )}
    >
      <Icon className={compact ? "size-3" : "size-3.5"} />
      {formatDelta(delta.value, delta.kind)}
    </span>
  );
}
