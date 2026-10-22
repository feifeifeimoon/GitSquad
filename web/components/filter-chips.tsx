"use client";

import { cn } from "@/lib/utils";

// The row of chips that narrows the list already on screen. A *view switch* —
// a time window, a layout, an OS — is `SegmentedControl` instead; this control
// sits among content rather than framing it.
//
// Two pages had written it independently (the roster's status filter and the
// usage breakdown's group-by) and a third used two `Button`s for the same job
// (the pull-request state filter). One component, one shape.
//
// The count is part of the button rather than a separate badge: the accessible
// name then reads "Offline 0", which is the sentence a screen reader should
// hear, and the specs that reach for a chip by prefix keep working.

export interface FilterChipItem<T extends string> {
  value: T;
  label: string;
  /** Shown after the label, and part of the accessible name. */
  count?: number;
  /** For a chip whose set is empty — drawn, but not worth pressing. */
  disabled?: boolean;
}

export function FilterChips<T extends string>({
  items,
  value,
  onChange,
  label,
  className,
}: {
  items: ReadonlyArray<FilterChipItem<T>>;
  value: T;
  onChange: (value: T) => void;
  /** The group's accessible name — "Status", "Group by", "Pull request state". */
  label: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn("flex flex-wrap items-center gap-1.5", className)}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            aria-pressed={active}
            disabled={item.disabled}
            onClick={() => onChange(item.value)}
            className={cn(
              "rounded-full px-2.5 py-1 text-caption font-medium transition-colors disabled:opacity-40",
              active
                ? "bg-ink text-canvas"
                : "bg-muted text-body hover:text-ink",
            )}
          >
            {item.label}
            {item.count !== undefined && (
              <span className={cn("ml-1.5", !active && "text-mute")}>
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
