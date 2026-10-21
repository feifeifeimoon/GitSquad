import type { PullRequestReview } from "@/lib/api";

/** The label and tone the console uses for a review's state. */
export function reviewStatus(review?: PullRequestReview): {
  label: string;
  tone: string;
} {
  if (!review) return { label: "Not reviewed", tone: "text-mute" };
  switch (review.status) {
    case "queued":
      return { label: "Queued", tone: "text-amber-600 dark:text-amber-400" };
    case "running":
      return { label: "Reviewing", tone: "text-link" };
    case "failed":
      return { label: "Failed", tone: "text-destructive" };
    case "cancelled":
      return { label: "Cancelled", tone: "text-mute" };
    case "completed":
      if (review.stale) return { label: "Outdated", tone: "text-amber-600 dark:text-amber-400" };
      return { label: "Reviewed", tone: "text-emerald-600 dark:text-emerald-400" };
    default:
      return { label: review.status, tone: "text-mute" };
  }
}

/** Token totals, roughly — the console shows scale, not an exact ledger. */
export function formatTokens(n: number): string {
  if (n <= 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
