"use client";

import { Search } from "lucide-react";

/**
 * The command palette's trigger, shaped like a field rather than a row.
 *
 * It sat in the destination list, the first of them, looking exactly like the
 * pages below it — same padding, same hover — while doing something else
 * entirely: it opens a modal, it does not go anywhere. orca makes the same
 * choice for the same reason: the shape says "type here", and the list beneath
 * stays a list of places. It also stops the list from being links with one
 * button in the middle of them.
 */
export function NavSearchTrigger({
  onOpen,
  isMac,
}: {
  onOpen: () => void;
  isMac: boolean;
}) {
  return (
    <button
      onClick={onOpen}
      className="flex h-8 w-full items-center gap-2 rounded-md border border-hairline bg-canvas px-2.5 text-left text-label text-mute transition-colors hover:border-hairline-strong hover:text-body"
    >
      <Search className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">Search…</span>
      {/* Decorative: it is a visual hint about the keyboard, and folding it
          into the accessible name would only make the button read as
          "Search… ⌘K". */}
      <kbd
        aria-hidden="true"
        className="pointer-events-none inline-flex h-5 shrink-0 select-none items-center rounded border border-hairline bg-muted px-1.5 font-mono text-micro text-mute"
      >
        {isMac ? "⌘K" : "Ctrl K"}
      </kbd>
    </button>
  );
}
