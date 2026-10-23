"use client";

import type { PullRequestSummary } from "@/lib/api";
import { reviewStatus } from "@/lib/pr-review";
import { cn } from "@/lib/utils";
import { TimeAgo } from "@/components/time-ago";
import { PrStateIcon } from "./pr-state-icon";

/**
 * The list half of the page: one line per pull request, and which one is
 * selected.
 *
 * It used to be two lines with `Review now` and `GitHub` buttons inside every
 * row, which made the list a form rather than a list. The facts worth scanning
 * are number, title, author and whether it has been reviewed; everything else —
 * the branch, the diff, the linked issue, the actions — belongs in the peek
 * beside it.
 *
 * A row is a `<button>`, not an `<a>`: it selects, it does not navigate. The one
 * destination, GitHub, is a link in the peek.
 */
export function PullRequestRows({
  items,
  selectedId,
  onSelect,
}: {
  items: PullRequestSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <ul role="list" className="flex flex-col">
      {items.map((pr) => {
        const selected = pr.id === selectedId;
        const status = reviewStatus(pr.latest_review);
        return (
          <li key={pr.id}>
            <button
              type="button"
              onClick={() => onSelect(pr.id)}
              aria-current={selected ? "true" : undefined}
              className={cn(
                "relative flex h-10 w-full items-center gap-3 border-b border-hairline px-3 text-left transition-colors last:border-b-0",
                selected ? "bg-link/[0.06]" : "hover:bg-muted/50",
              )}
            >
              {selected && (
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0 w-0.5 bg-link"
                />
              )}
              <PrStateIcon state={pr.state} />
              <span className="w-12 shrink-0 font-mono text-micro text-mute">
                #{pr.number}
              </span>
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span className="truncate text-copy text-ink">{pr.title}</span>
                {pr.state === "open" && pr.draft && (
                  <span className="shrink-0 rounded-full bg-muted px-1.5 py-px text-micro text-mute">
                    Draft
                  </span>
                )}
              </span>
              <span className="hidden shrink-0 text-caption text-mute sm:inline">
                {pr.author}
              </span>
              <span
                className={cn(
                "w-28 shrink-0 whitespace-nowrap text-right text-caption",
                status.tone,
              )}
              >
                {status.label}
              </span>
              <TimeAgo
                iso={pr.updated_at}
                className="w-12 shrink-0 text-right text-caption tabular-nums text-mute"
              />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
