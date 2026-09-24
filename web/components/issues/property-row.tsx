import { cn } from "@/lib/utils";

// The rail's row grammar: borderless, the whole row is the hit target, and the
// hover surface bleeds 6px past the content so the target reads as one row
// rather than as the text inside it. This is the same shape the issue title
// already uses (click to edit, no chrome until you hover) — before this, the
// sidebar had a bordered Select for Status and dead badges for everything else,
// which is two grammars in one column.
//
// Exported as a string rather than a component because the three rows are not
// the same control: Status is a Radix Select trigger, the other two are menu
// triggers. They share how they look, not what they are.
export const ROW_TRIGGER = cn(
  "-mx-1.5 flex min-h-8 w-full items-center gap-1.5 rounded-md px-1.5 text-left text-copy text-ink",
  "transition-colors hover:bg-canvas-soft-2",
  "focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none",
);

/**
 * A property that can be set but currently is not: a dashed slot, which is how
 * Linear and multica both draw an empty assignee — an empty value is still a
 * place, so it reads as something you can put somebody into.
 */
export function EmptySlot({ label, icon }: { label: string; icon?: React.ReactNode }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-mute">
      {icon ?? (
        <span
          aria-hidden="true"
          className="size-4 shrink-0 rounded-full border border-dashed border-hairline-strong"
        />
      )}
      <span className="truncate">{label}</span>
    </span>
  );
}
