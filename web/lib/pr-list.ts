import type { PullRequestSummary } from "./api";

// The list's state tabs, as the page applies them.
//
// Three things the server cannot answer in one call: the counts per tab. So the
// page reads every PR once (`state=all`) and narrows here — which also fixes a
// small lie the server-side filter told: `Closed` matched only `state=closed`,
// and GitHub's "Closed" means merged too.
export type PrFilter = "open" | "closed" | "all";

export const PR_FILTERS: ReadonlyArray<{ value: PrFilter; label: string }> = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "all", label: "All" },
];

export function prInFilter(
  pr: Pick<PullRequestSummary, "state">,
  filter: PrFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "open") return pr.state === "open";
  return pr.state === "closed" || pr.state === "merged";
}

export function countPrs(
  prs: ReadonlyArray<Pick<PullRequestSummary, "state">>,
): Record<PrFilter, number> {
  const counts: Record<PrFilter, number> = {
    open: 0,
    closed: 0,
    all: prs.length,
  };
  for (const pr of prs) {
    if (pr.state === "open") counts.open += 1;
    if (pr.state === "closed" || pr.state === "merged") counts.closed += 1;
  }
  return counts;
}

export function filterPrs<T extends Pick<PullRequestSummary, "state">>(
  prs: T[],
  filter: PrFilter,
): T[] {
  return prs.filter((pr) => prInFilter(pr, filter));
}

/**
 * Whether the peek has a size to show. A rename or a binary change reports
 * zero added and zero removed lines and still touches files, so the file count
 * alone is enough to be worth a line.
 */
export function prHasDiff(pr: {
  additions: number;
  deletions: number;
  changed_files: number;
}): boolean {
  return pr.additions > 0 || pr.deletions > 0 || pr.changed_files > 0;
}

/** The tab a PR belongs to, so a link to a merged PR can open the tab that
 * holds it rather than the Open tab it is not in. */
export function prFilterOf(state: string): PrFilter {
  if (state === "open") return "open";
  if (state === "closed" || state === "merged") return "closed";
  return "all";
}

/**
 * Which PR the peek shows: the one somebody selected, or the first row of the
 * current tab.
 *
 * Derived rather than stored because a tab change can remove the selection, and
 * an effect that re-selected would render once with an empty pane and once with
 * content. An empty pane beside a full list reads as broken, so there is always
 * one.
 */
export function selectedPr(
  prs: ReadonlyArray<Pick<PullRequestSummary, "id">>,
  selectedId: string | null,
): string | null {
  if (selectedId && prs.some((pr) => pr.id === selectedId)) return selectedId;
  return prs[0]?.id ?? null;
}
