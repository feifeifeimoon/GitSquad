"use client";

import { cn } from "@/lib/utils";

// Two questions, two controls, and the console had four of them.
//
// A *view switch* picks which of a small set of mutually exclusive views the
// page is showing — a time window, a card/list layout, an operating system.
// That is `SegmentedControl`: a bordered box with one inner button lit. The
// Usage range, the workspace list's cards/list toggle and the daemon
// connect dialog's OS tabs each had their own copy of exactly these classes;
// they are one component now, so a change to the shape changes the console.
//
// A *filter* narrows the list already on screen — which statuses, which author,
// which state — and it reads as a row of chips because it sits among content
// rather than framing it. That is `FilterChips`.

export interface SegmentedItem<T extends string> {
  value: T;
  /** The visible word, and the accessible name when `iconOnly` is off. */
  label: string;
  /** Drawn before the label, or instead of it when `iconOnly` is on. */
  icon?: React.ComponentType<{ className?: string }>;
  /** A longer name for the tooltip — "Last 24 hours", not "24h". */
  title?: string;
}

/**
 * One choice out of a handful, as a segmented control.
 *
 * `aria-pressed` rather than a radio group: these are buttons that toggle a
 * view, and the pressed state is what says which view is on. `label` names the
 * whole group for anything reading the page without seeing the box.
 */
export function SegmentedControl<T extends string>({
  items,
  value,
  onChange,
  label,
  iconOnly = false,
  className,
}: {
  items: ReadonlyArray<SegmentedItem<T>>;
  value: T;
  onChange: (value: T) => void;
  /** The group's accessible name — "Time range", "Layout", "Operating system". */
  label: string;
  /** Icon-only items, where the label moves into the accessible name. */
  iconOnly?: boolean;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "flex shrink-0 items-center rounded-sm border border-hairline bg-canvas p-0.5",
        className,
      )}
    >
      {items.map((item) => {
        const active = item.value === value;
        const Icon = item.icon;
        return (
          <button
            key={item.value}
            type="button"
            aria-pressed={active}
            aria-label={iconOnly ? (item.title ?? item.label) : undefined}
            title={item.title}
            onClick={() => onChange(item.value)}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-xs text-caption font-medium transition-colors",
              iconOnly ? "size-7" : "px-2.5 py-1",
              active ? "bg-muted text-ink" : "text-mute hover:text-ink",
            )}
          >
            {Icon && <Icon className="size-3.5" />}
            {!iconOnly && item.label}
          </button>
        );
      })}
    </div>
  );
}
